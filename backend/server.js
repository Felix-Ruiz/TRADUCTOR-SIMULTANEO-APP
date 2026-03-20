const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
require('dotenv').config();

const TranslationService = require('./services/azureService');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// ==========================================
// MEMORIA CENTRAL DEL SISTEMA (MASTER ADMIN)
// ==========================================
let isSystemActive = true; 

const eventsDB = new Map();

eventsDB.set(process.env.VITE_ADMIN_PASSWORD || "admin123", {
    id: "evt_default",
    name: "Evento Principal (Por Defecto)",
    password: process.env.VITE_ADMIN_PASSWORD || "admin123",
    rooms: ["PRINCIPAL"]
});

const MASTER_PASSWORD = process.env.MASTER_PASSWORD || "superadmin123";

// Inventario aislado por eventos: Map<eventId, Map<roomName, count>>
const activeSpeakerRooms = new Map();

const broadcastActiveRoomsToEvent = (eventId) => {
    const eventRoomsMap = activeSpeakerRooms.get(eventId);
    const rooms = eventRoomsMap ? Array.from(eventRoomsMap.keys()) : [];
    // Emitimos SOLO a los celulares que están en la "sala de espera" de este evento
    io.to(`audience_${eventId}`).emit('active-rooms', rooms);
};

app.get('/api/status', (req, res) => {
    res.status(200).json({ status: 'online', message: 'Servidor activo.' });
});

io.on('connection', (socket) => {
    console.log(`[+] Nuevo dispositivo conectado: ${socket.id}`);

    socket.emit('system-status', isSystemActive);

    let translationService = null;

    // ==========================================
    // RUTAS DEL MASTER ADMIN
    // ==========================================
    socket.on('master-login', (pwd, callback) => {
        if (pwd === MASTER_PASSWORD) {
            callback({ success: true });
        } else {
            callback({ success: false });
        }
    });

    socket.on('master-get-data', (callback) => {
        callback({ isSystemActive, events: Array.from(eventsDB.values()) });
    });

    socket.on('master-toggle-system', (status) => {
        isSystemActive = status;
        console.log(`[MASTER] Estado del sistema: ${isSystemActive ? 'ENCENDIDO' : 'APAGADO'}`);
        io.emit('system-status', isSystemActive);

        if (!isSystemActive) {
            activeSpeakerRooms.clear();
            io.emit('active-rooms', []); // Limpiamos todas las pantallas
        }
    });

    socket.on('master-create-event', (data, callback) => {
        const password = data.password || Math.random().toString(36).slice(-6).toUpperCase();
        const newEvent = {
            id: Date.now().toString(),
            name: data.name,
            password: password,
            rooms: ["PRINCIPAL"] 
        };
        eventsDB.set(password, newEvent);
        callback({ success: true, event: newEvent });
        io.emit('master-data-updated', Array.from(eventsDB.values()));
    });

    socket.on('master-delete-event', (password, callback) => {
        eventsDB.delete(password);
        activeSpeakerRooms.delete(password);
        callback({ success: true });
        io.emit('master-data-updated', Array.from(eventsDB.values()));
    });

    socket.on('master-add-room', (data, callback) => {
        const event = eventsDB.get(data.password);
        if (event) {
            if (!event.rooms.includes(data.room)) event.rooms.push(data.room);
            callback({ success: true });
            io.emit('master-data-updated', Array.from(eventsDB.values()));
        } else {
            callback({ success: false });
        }
    });

    socket.on('master-delete-room', (data, callback) => {
        const event = eventsDB.get(data.password);
        if (event) {
            event.rooms = event.rooms.filter(r => r !== data.room);
            callback({ success: true });
            io.emit('master-data-updated', Array.from(eventsDB.values()));
        } else {
            callback({ success: false });
        }
    });

    // ==========================================
    // RUTAS DEL SPEAKER ADMIN (ORADOR)
    // ==========================================
    socket.on('speaker-login', (password, callback) => {
        const event = eventsDB.get(password);
        if (event) {
            callback({ success: true, event });
        } else {
            callback({ success: false, message: "Contraseña incorrecta o evento no encontrado." });
        }
    });

    socket.on('start-translation', (config) => {
        if (!isSystemActive) return;

        const eventId = config.eventId;
        const roomName = config.roomName || 'PRINCIPAL';
        
        // Creamos una sala verdaderamente aislada combinando Evento + Sala
        const isolatedRoom = `${eventId}_${roomName}`;
        socket.join(isolatedRoom);
        
        socket.speakerEventId = eventId;
        socket.speakerRoom = roomName;

        if (!activeSpeakerRooms.has(eventId)) {
            activeSpeakerRooms.set(eventId, new Map());
        }
        
        const eventRoomsMap = activeSpeakerRooms.get(eventId);
        const count = eventRoomsMap.get(roomName) || 0;
        eventRoomsMap.set(roomName, count + 1);
        
        broadcastActiveRoomsToEvent(eventId);
        
        translationService = new TranslationService(
            socket, 
            config.fromLanguage, 
            config.toLanguages, 
            config.voiceGender,
            isolatedRoom // Le pasamos la sala aislada a Azure
        );
        translationService.start();
    });

    socket.on('audio-stream', (data) => {
        if (translationService && isSystemActive) {
            translationService.writeAudio(data);
        }
    });

    const handleSpeakerStop = () => {
        if (socket.speakerEventId && socket.speakerRoom) {
            const eventId = socket.speakerEventId;
            const roomName = socket.speakerRoom;
            
            const eventRoomsMap = activeSpeakerRooms.get(eventId);
            if (eventRoomsMap) {
                const count = eventRoomsMap.get(roomName) || 0;
                if (count <= 1) {
                    eventRoomsMap.delete(roomName);
                } else {
                    eventRoomsMap.set(roomName, count - 1);
                }
                broadcastActiveRoomsToEvent(eventId);
            }
            
            socket.speakerEventId = null;
            socket.speakerRoom = null;
        }
    };

    socket.on('stop-translation', () => {
        handleSpeakerStop();
        if (translationService) {
            translationService.stop();
            translationService = null;
        }
    });

    // ==========================================
    // RUTAS DE LA AUDIENCIA (AISLAMIENTO TOTAL)
    // ==========================================
    
    // 1. Validar si el código del evento existe
    socket.on('check-event', (eventId, callback) => {
        const event = eventsDB.get(eventId);
        if (event) {
            callback({ success: true, name: event.name });
        } else {
            callback({ success: false });
        }
    });

    // 2. Unirse a la capa general del evento para recibir su lista de salas
    socket.on('join-event-audience', (eventId) => {
        socket.join(`audience_${eventId}`);
        const eventRoomsMap = activeSpeakerRooms.get(eventId);
        const rooms = eventRoomsMap ? Array.from(eventRoomsMap.keys()) : [];
        socket.emit('active-rooms', rooms);
        
        const event = eventsDB.get(eventId);
        if (event) socket.emit('event-info', { name: event.name, allRooms: event.rooms });
    });

    // 3. Unirse a la sala aislada final para escuchar la traducción
    socket.on('join-isolated-room', (data) => {
        if (!isSystemActive) return;

        const isolatedRoom = `${data.eventId}_${data.roomName}`;
        
        Array.from(socket.rooms).forEach(r => {
            if (r !== socket.id && r !== `audience_${data.eventId}`) {
                socket.leave(r);
            }
        });
        
        socket.join(isolatedRoom);
        console.log(`[+] Audiencia ${socket.id} se unió a: ${isolatedRoom}`);
    });

    socket.on('disconnect', () => {
        console.log(`[-] Dispositivo desconectado: ${socket.id}`);
        handleSpeakerStop();
        if (translationService) {
            translationService.stop();
            translationService = null;
        }
    });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    console.log(`=========================================`);
    console.log(`🚀 Servidor backend corriendo en el puerto ${PORT}`);
    console.log(`=========================================`);
});