const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
require('dotenv').config();

// Importamos nuestro nuevo módulo de traducción
const TranslationService = require('./services/azureService');

// 1. Inicialización de la aplicación Express
const app = express();
app.use(cors());
app.use(express.json());

// 2. Creación del servidor HTTP
const server = http.createServer(app);

// 3. Configuración del motor de WebSockets
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// 4. Ruta REST de prueba
app.get('/api/status', (req, res) => {
    res.status(200).json({ 
        status: 'online', 
        message: 'Servidor de traducción activo y esperando conexiones.' 
    });
});

// 5. Gestión de conexiones en tiempo real
io.on('connection', (socket) => {
    console.log(`[+] Nuevo dispositivo conectado: ${socket.id}`);

    // Variable para guardar la instancia de traducción de este usuario
    let translationService = null;

    // A. El frontend solicita iniciar la traducción
    socket.on('start-translation', (config) => {
        // Inicializamos el servicio pasándole el idioma de origen y los de destino
        translationService = new TranslationService(socket, config.fromLanguage, config.toLanguages);
        translationService.start();
    });

    // B. El frontend envía el flujo de audio en tiempo real
    socket.on('audio-stream', (data) => {
        if (translationService) {
            // Inyectamos los fragmentos de audio directamente a Azure
            translationService.writeAudio(data);
        }
    });

    // C. El frontend detiene la transmisión
    socket.on('stop-translation', () => {
        if (translationService) {
            translationService.stop();
            translationService = null;
        }
    });

    // D. Desconexión abrupta (cierra la pestaña o pierde Wi-Fi)
    socket.on('disconnect', () => {
        console.log(`[-] Dispositivo desconectado: ${socket.id}`);
        if (translationService) {
            translationService.stop();
            translationService = null;
        }
    });
});

// 6. Levantamiento del servidor
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    console.log(`=========================================`);
    console.log(`🚀 Servidor backend corriendo en el puerto ${PORT}`);
    console.log(`=========================================`);
});