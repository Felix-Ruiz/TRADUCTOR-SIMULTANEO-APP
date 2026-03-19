const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
require('dotenv').config();

// 1. Inicialización de la aplicación Express
const app = express();

// Configuración de seguridad y formato de datos
app.use(cors());
app.use(express.json());

// 2. Creación del servidor HTTP (necesario para Socket.io)
const server = http.createServer(app);

// 3. Configuración del motor de WebSockets (Socket.io)
const io = new Server(server, {
    cors: {
        origin: "*", // En el futuro lo restringiremos a la URL de tu frontend
        methods: ["GET", "POST"]
    }
});

// 4. Ruta REST de prueba (Healthcheck)
app.get('/api/status', (req, res) => {
    res.status(200).json({ 
        status: 'online', 
        message: 'Servidor de traducción activo y esperando conexiones.' 
    });
});

// 5. Gestión de conexiones en tiempo real (WebSockets)
io.on('connection', (socket) => {
    console.log(`[+] Nuevo dispositivo conectado: ${socket.id}`);

    // Canal (evento) por donde recibiremos el audio del orador
    socket.on('audio-stream', (data) => {
        // Aquí integraremos el SDK de Azure en los próximos pasos
        console.log(`Recibiendo stream de audio del cliente ${socket.id}...`);
    });

    // Detección de desconexiones (ej. el orador cierra la laptop o pierde Wi-Fi)
    socket.on('disconnect', () => {
        console.log(`[-] Dispositivo desconectado: ${socket.id}`);
    });
});

// 6. Levantamiento del servidor
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    console.log(`=========================================`);
    console.log(`🚀 Servidor backend corriendo en el puerto ${PORT}`);
    console.log(`=========================================`);
});