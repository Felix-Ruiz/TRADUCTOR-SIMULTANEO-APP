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

app.get('/api/status', (req, res) => {
    res.status(200).json({ 
        status: 'online', 
        message: 'Servidor de traducción activo y esperando conexiones.' 
    });
});

// NUEVO: Inventario de salas activas (donde hay un orador transmitiendo)
const activeSpeakerRooms = new Map();

const broadcastActiveRooms = () => {
    const rooms = Array.from(activeSpeakerRooms.keys());
    io.emit('active-rooms', rooms);
};

io.on('connection', (socket) => {
    console.log(`[+] Nuevo dispositivo conectado: ${socket.id}`);

    // Apenas se conecta un usuario, le enviamos las salas disponibles
    socket.emit('active-rooms', Array.from(activeSpeakerRooms.keys()));

    let translationService = null;

    socket.on('join-room', (room) => {
        Array.from(socket.rooms).forEach(r => {
            if (r !== socket.id) socket.leave(r);
        });
        socket.join(room);
        console.log(`[+] Dispositivo ${socket.id} se unió a la sala: ${room}`);
    });

    socket.on('start-translation', (config) => {
        const room = config.roomName || 'PRINCIPAL';
        socket.join(room);
        
        // Registramos al orador en la sala y actualizamos a todos los celulares
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
        if (translationService) {
            translationService.writeAudio(data);
        }
    });

    // Función para limpiar la sala si el orador se detiene
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