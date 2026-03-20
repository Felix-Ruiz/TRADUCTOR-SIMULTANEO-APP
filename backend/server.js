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

const activeSpeakerRooms = new Map();

const broadcastActiveRooms = () => {
    const rooms = Array.from(activeSpeakerRooms.keys());
    io.emit('active-rooms', rooms);
};

app.get('/api/status', (req, res) => {
    res.status(200).json({ status: 'online', message: 'Servidor activo.' });
});

io.on('connection', (socket) => {
    console.log(`[+] Nuevo dispositivo conectado: ${socket.id}`);

    socket.emit('system-status', isSystemActive);
    
    if (isSystemActive) {
        socket.emit('active-rooms', Array.from(activeSpeakerRooms.keys()));
    }

    let translationService = null;

    // ==========================================
    // RUTAS PRIVADAS DEL MASTER ADMIN
    // ==========================================
    socket.on('master-login', (pwd, callback) => {
        if (pwd === MASTER_PASSWORD) {
            callback({ success: true });
        } else {
            callback({ success: false });
        }
    });

    socket.on('master-get-data', (callback) => {
        callback({ 
            isSystemActive, 
            events: Array.from(eventsDB.values()) 
        });
    });

    socket.on('master-toggle-system', (status) => {
        isSystemActive = status;
        console.log(`[MASTER] Estado del sistema: ${isSystemActive ? 'ENCENDIDO' : 'APAGADO'}`);
        io.emit('system-status', isSystemActive);

        if (!isSystemActive) {
            activeSpeakerRooms.clear();
            broadcastActiveRooms();
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
        callback({ success: true });
        io.emit('master-data-updated', Array.from(eventsDB.values()));
    });

    socket.on('master-add-room', (data, callback) => {
        const event = eventsDB.get(data.password);
        if (event) {
            if (!event.rooms.includes(data.room)) {
                event.rooms.push(data.room);
            }
            callback({ success: true });
            io.emit('master-data-updated', Array.from(eventsDB.values()));
        } else {
            callback({ success: false });
        }
    });

    // NUEVO: Ruta para eliminar una sala específica de un evento
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

    // ==========================================
    // RUTAS PÚBLICAS Y DE TRADUCCIÓN
    // ==========================================
    socket.on('join-room', (room) => {
        if (!isSystemActive) return;

        Array.from(socket.rooms).forEach(r => {
            if (r !== socket.id) socket.leave(r);
        });
        socket.join(room);
        console.log(`[+] Dispositivo ${socket.id} se unió a la sala: ${room}`);
    });

    socket.on('start-translation', (config) => {
        if (!isSystemActive) return;

        const room = config.roomName || 'PRINCIPAL';
        socket.join(room);
        
        socket.speakerRoom = room;
        const count = activeSpeakerRooms.get(room) || 0;
        activeSpeakerRooms.set(room, count + 1);
        broadcastActiveRooms();
        
        translationService = new TranslationService(
            socket, 
            config.fromLanguage, 
            config.toLanguages, 
            config.voiceGender,
            room
        );
        translationService.start();
    });

    socket.on('audio-stream', (data) => {
        if (translationService && isSystemActive) {
            translationService.writeAudio(data);
        }
    });

    const handleSpeakerStop = () => {
        if (socket.speakerRoom) {
            const count = activeSpeakerRooms.get(socket.speakerRoom) || 0;
            if (count <= 1) {
                activeSpeakerRooms.delete(socket.speakerRoom);
            } else {
                activeSpeakerRooms.set(socket.speakerRoom, count - 1);
            }
            socket.speakerRoom = null;
            broadcastActiveRooms();
        }
    };

    socket.on('stop-translation', () => {
        handleSpeakerStop();
        if (translationService) {
            translationService.stop();
            translationService = null;
        }
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