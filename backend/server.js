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
let isSystemActive = true; // El Kill Switch (True = Encendido, False = Apagado)

// Base de datos en memoria para los Eventos. 
// Estructura: { "ACOFI-2026": { name: "Congreso ACOFI", password: "123", rooms: ["PRINCIPAL", "TALLER-A"] } }
const eventsDB = new Map();

// Creamos un evento por defecto para que no se rompa lo que ya tienes
eventsDB.set("DEFAULT", {
    name: "Evento Principal",
    password: process.env.VITE_ADMIN_PASSWORD || "admin123",
    rooms: ["PRINCIPAL"]
});

// Inventario de salas donde hay oradores transmitiendo
const activeSpeakerRooms = new Map();

const broadcastActiveRooms = () => {
    // Solo mostramos las salas que realmente tienen un orador activo
    const rooms = Array.from(activeSpeakerRooms.keys());
    io.emit('active-rooms', rooms);
};

// ==========================================
// CONEXIONES DE SOCKETS
// ==========================================
io.on('connection', (socket) => {
    console.log(`[+] Nuevo dispositivo conectado: ${socket.id}`);

    // Apenas se conecta, le decimos si el sistema está encendido o apagado
    socket.emit('system-status', isSystemActive);
    
    // Si el sistema está apagado, no le mandamos nada más
    if (isSystemActive) {
        socket.emit('active-rooms', Array.from(activeSpeakerRooms.keys()));
    }

    let translationService = null;

    socket.on('join-room', (room) => {
        if (!isSystemActive) return; // Bloqueo por Kill Switch

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

    // ==========================================
    // RUTAS PRIVADAS DEL MASTER ADMIN
    // ==========================================
    socket.on('master-toggle-system', (status) => {
        // En un entorno real, aquí validaríamos que quien envía esto es el Master Admin
        isSystemActive = status;
        console.log(`[MASTER] Estado del sistema cambiado a: ${isSystemActive ? 'ENCENDIDO' : 'APAGADO'}`);
        
        // Disparamos la alerta roja a todos los celulares
        io.emit('system-status', isSystemActive);

        if (!isSystemActive) {
            // Si apagan el sistema, cortamos todas las transmisiones activas
            activeSpeakerRooms.clear();
            broadcastActiveRooms();
        }
    });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    console.log(`=========================================`);
    console.log(`🚀 Servidor backend corriendo en el puerto ${PORT}`);
    console.log(`=========================================`);
});