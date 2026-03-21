const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
require('dotenv').config();

const TranslationService = require('./services/azureService');

const app = express();

// ESCUDO 1: Bloqueo de CORS estricto. Solo tu frontend autorizado puede conectarse.
const allowedOrigins = process.env.FRONTEND_URL ? [process.env.FRONTEND_URL] : "*";

app.use(cors({ origin: allowedOrigins }));
app.use(express.json());

const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: allowedOrigins,
        methods: ["GET", "POST"]
    }
});

// ESCUDO 2: Protección contra caídas críticas (Crash Protection)
// Evita que un error no capturado en promesas o librerías de terceros (Azure) apague Node.js
process.on('uncaughtException', (err) => {
    console.error('[!] ALERTA CRÍTICA: Excepción no capturada bloqueada:', err);
});
process.on('unhandledRejection', (reason, promise) => {
    console.error('[!] ALERTA CRÍTICA: Promesa rechazada bloqueada:', reason);
});

let isSystemActive = false; 

const eventsDB = new Map();

eventsDB.set("DEFAULT", {
    id: "DEFAULT",
    name: "Evento Principal (Por Defecto)",
    password: process.env.VITE_ADMIN_PASSWORD || "admin123",
    rooms: ["PRINCIPAL"],
    isActive: true 
});

const MASTER_PASSWORD = process.env.MASTER_PASSWORD || "superadmin123";
const activeSpeakerRooms = new Map();

const broadcastActiveRoomsToEvent = (eventId) => {
    const eventRoomsMap = activeSpeakerRooms.get(eventId);
    const rooms = eventRoomsMap ? Array.from(eventRoomsMap.keys()) : [];
    io.to(`audience_${eventId}`).emit('active-rooms', rooms);
};

app.get('/api/status', (req, res) => {
    res.status(200).json({ status: 'online', message: 'Servidor activo y blindado.' });
});

io.on('connection', (socket) => {
    console.log(`[+] Dispositivo conectado: ${socket.id}`);
    socket.emit('system-status', isSystemActive);

    let translationService = null;

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
        console.log(`[MASTER] Central Global: ${isSystemActive ? 'ENCENDIDA' : 'APAGADA'}`);
        io.emit('system-status', isSystemActive);

        if (!isSystemActive) {
            activeSpeakerRooms.clear();
            io.emit('active-rooms', []); 
        }
    });

    socket.on('master-toggle-event', (data, callback) => {
        const event = eventsDB.get(data.id);
        if (event) {
            event.isActive = data.status;
            if (!event.isActive) {
                const eventRoomsMap = activeSpeakerRooms.get(data.id);
                if (eventRoomsMap) {
                    eventRoomsMap.clear();
                    broadcastActiveRoomsToEvent(data.id);
                }
            }
            io.emit('master-data-updated', Array.from(eventsDB.values()));
            io.emit('event-status-changed', { eventId: data.id, status: data.status });
            callback({ success: true });
        } else {
            callback({ success: false });
        }
    });

    socket.on('master-create-event', (data, callback) => {
        const publicId = Math.random().toString(36).slice(-6).toUpperCase();
        const secretPassword = Math.random().toString(36).slice(-6).toUpperCase();
        
        const newEvent = {
            id: publicId,
            name: data.name,
            password: secretPassword,
            rooms: ["PRINCIPAL"],
            isActive: true 
        };
        eventsDB.set(publicId, newEvent);
        callback({ success: true, event: newEvent });
        io.emit('master-data-updated', Array.from(eventsDB.values()));
    });

    socket.on('master-delete-event', (id, callback) => {
        eventsDB.delete(id);
        activeSpeakerRooms.delete(id);
        callback({ success: true });
        io.emit('master-data-updated', Array.from(eventsDB.values()));
    });

    socket.on('master-add-room', (data, callback) => {
        const event = eventsDB.get(data.id);
        if (event) {
            if (!event.rooms.includes(data.room)) event.rooms.push(data.room);
            callback({ success: true });
            io.emit('master-data-updated', Array.from(eventsDB.values()));
        } else {
            callback({ success: false });
        }
    });

    socket.on('master-delete-room', (data, callback) => {
        const event = eventsDB.get(data.id);
        if (event) {
            event.rooms = event.rooms.filter(r => r !== data.room);
            callback({ success: true });
            io.emit('master-data-updated', Array.from(eventsDB.values()));
        } else {
            callback({ success: false });
        }
    });

    socket.on('speaker-login', (password, callback) => {
        let foundEvent = null;
        for (const event of eventsDB.values()) {
            if (event.password === password) {
                foundEvent = event;
                break;
            }
        }
        if (foundEvent) {
            callback({ success: true, event: foundEvent });
        } else {
            callback({ success: false, message: "Contraseña incorrecta o evento no encontrado." });
        }
    });

    socket.on('start-translation', (config) => {
        if (!isSystemActive) return;
        
        const event = eventsDB.get(config.eventId);
        if (!event || !event.isActive) return;

        const eventId = config.eventId;
        const roomName = config.roomName || 'PRINCIPAL';
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
            isolatedRoom 
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

    socket.on('check-event', (eventId, callback) => {
        const event = eventsDB.get(eventId);
        if (event) {
            callback({ success: true, name: event.name });
        } else {
            callback({ success: false });
        }
    });

    socket.on('join-event-audience', (eventId) => {
        socket.join(`audience_${eventId}`);
        const eventRoomsMap = activeSpeakerRooms.get(eventId);
        const rooms = eventRoomsMap ? Array.from(eventRoomsMap.keys()) : [];
        socket.emit('active-rooms', rooms);
        
        const event = eventsDB.get(eventId);
        if (event) socket.emit('event-info', { name: event.name, allRooms: event.rooms, isActive: event.isActive });
    });

    socket.on('join-isolated-room', (data) => {
        if (!isSystemActive) return;
        const event = eventsDB.get(data.eventId);
        if (!event || !event.isActive) return;

        const isolatedRoom = `${data.eventId}_${data.roomName}`;
        
        Array.from(socket.rooms).forEach(r => {
            if (r !== socket.id && r !== `audience_${data.eventId}`) {
                socket.leave(r);
            }
        });
        
        socket.join(isolatedRoom);
    });

    socket.on('disconnect', () => {
        handleSpeakerStop();
        // ESCUDO 3: Asegurar la destrucción del servicio de Azure en desconexiones violentas
        if (translationService) {
            try {
                translationService.stop();
            } catch(e) {
                console.error("[!] Error forzando limpieza en desconexión:", e);
            }
            translationService = null;
        }
    });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    console.log(`=========================================`);
    console.log(`🚀 Servidor blindado corriendo en el puerto ${PORT}`);
    console.log(`=========================================`);
});