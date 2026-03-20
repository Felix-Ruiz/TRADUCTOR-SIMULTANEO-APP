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

io.on('connection', (socket) => {
    console.log(`[+] Nuevo dispositivo conectado: ${socket.id}`);

    let translationService = null;

    // ACTUALIZADO: Antes de unirse a una sala, sale de las anteriores para no mezclar audios
    socket.on('join-room', (room) => {
        Array.from(socket.rooms).forEach(r => {
            if (r !== socket.id) socket.leave(r);
        });
        socket.join(room);
        console.log(`[+] Dispositivo ${socket.id} se unió a la sala: ${room}`);
    });

    socket.on('start-translation', (config) => {
        socket.join(config.roomName);
        
        translationService = new TranslationService(
            socket, 
            config.fromLanguage, 
            config.toLanguages, 
            config.voiceGender,
            config.roomName
        );
        translationService.start();
    });

    socket.on('audio-stream', (data) => {
        if (translationService) {
            translationService.writeAudio(data);
        }
    });

    socket.on('stop-translation', () => {
        if (translationService) {
            translationService.stop();
            translationService = null;
        }
    });

    socket.on('disconnect', () => {
        console.log(`[-] Dispositivo desconectado: ${socket.id}`);
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