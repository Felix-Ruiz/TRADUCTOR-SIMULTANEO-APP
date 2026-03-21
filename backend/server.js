const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
require('dotenv').config();

const TranslationService = require('./services/azureService');

const app = express();

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

process.on('uncaughtException', (err) => {
    console.error('[!] ALERTA CRÍTICA: Excepción no capturada bloqueada:', err);
});
process.on('unhandledRejection', (reason, promise) => {
    console.error('[!] ALERTA CRÍTICA: Promesa rechazada bloqueada:', reason);
});

let isSystemActive = false; 

// Base de datos de Eventos (Ahora con Marca Blanca)
const eventsDB = new Map();
// Base de datos de Analíticas (Tracking en tiempo real)
const statsDB = new Map(); 

const initEventStats = (eventId) => {
    if (!statsDB.has(eventId)) {
        statsDB.set(eventId, { total: 0, langs: { es: 0, en: 0, de: 0, fr: 0, pt: 0 } });
    }
};

eventsDB.set("DEFAULT", {
    id: "DEFAULT",
    name: "Evento Principal (Por Defecto)",
    password: process.env.VITE_ADMIN_PASSWORD || "admin123",
    rooms: ["PRINCIPAL"],
    isActive: true,
    logoUrl: "", // Campo para logo personalizado
    sponsorText: "" // Campo para banner publicitario
});
initEventStats("DEFAULT");

const MASTER_PASSWORD = process.env.MASTER_PASSWORD || "superadmin123";
const activeSpeakerRooms = new Map();

const broadcastActiveRoomsToEvent = (eventId) => {
    const eventRoomsMap = activeSpeakerRooms.get(eventId);
    const rooms = eventRoomsMap ? Array.from(eventRoomsMap.keys()) : [];
    io.to(`audience_${eventId}`).emit('active-rooms', rooms);
};

// Función para emitir datos completos al Master
const emitMasterData = () => {
    const eventsArray = Array.from(eventsDB.values()).map(event => {
        return {
            ...event,
            stats: statsDB.get(event.id) || { total: 0, langs: { es: 0, en: 0, de: 0, fr: 0, pt: 0 } }
        };
    });
    io.emit('master-data-updated', eventsArray);
};

app.get('/api/status', (req, res) => {
    res.status(200).json({ status: 'online', message: 'Servidor activo, blindado y analítico.' });
});

io.on('connection', (socket) => {
    console.log(`[+] Dispositivo conectado: ${socket.id}`);
    socket.emit('system-status', isSystemActive);

    let translationService = null;

    // ==========================================
    // RUTAS MASTER
    // ==========================================
    socket.on('master-login', (pwd, callback) => {
        if (pwd === MASTER_PASSWORD) {
            callback({ success: true });
        } else {
            callback({ success: false });
        }
    });

    socket.on('master-get-data', (callback) => {
        const eventsArray = Array.from(eventsDB.values()).map(event => ({
            ...event,
            stats: statsDB.get(event.id)
        }));
        callback({ isSystemActive, events: eventsArray });
    });

    socket.on('master-toggle-system', (status) => {
        isSystemActive = status;
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
            emitMasterData();
            io.emit('event-status-changed', { eventId: data.id, status: data.status });
            callback({ success: true });
        } else {
            callback({ success: false });
        }
    });

    // NUEVO: Crear evento con Marca Blanca
    socket.on('master-create-event', (data, callback) => {
        const publicId = Math.random().toString(36).slice(-6).toUpperCase();
        const secretPassword = Math.random().toString(36).slice(-6).toUpperCase();
        
        const newEvent = {
            id: publicId,
            name: data.name,
            password: secretPassword,
            rooms: ["PRINCIPAL"],
            isActive: true,
            logoUrl: data.logoUrl || "",
            sponsorText: data.sponsorText || ""
        };
        eventsDB.set(publicId, newEvent);
        initEventStats(publicId);
        
        callback({ success: true, event: newEvent });
        emitMasterData();
    });

    socket.on('master-delete-event', (id, callback) => {
        eventsDB.delete(id);
        statsDB.delete(id);
        activeSpeakerRooms.delete(id);
        callback({ success: true });
        emitMasterData();
    });

    socket.on('master-add-room', (data, callback) => {
        const event = eventsDB.get(data.id);
        if (event) {
            if (!event.rooms.includes(data.room)) event.rooms.push(data.room);
            callback({ success: true });
            emitMasterData();
        } else {
            callback({ success: false });
        }
    });

    socket.on('master-delete-room', (data, callback) => {
        const event = eventsDB.get(data.id);
        if (event) {
            event.rooms = event.rooms.filter(r => r !== data.room);
            callback({ success: true });
            emitMasterData();
        } else {
            callback({ success: false });
        }
    });

    // ==========================================
    // RUTAS SPEAKER
    // ==========================================
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
            socket, config.fromLanguage, config.toLanguages, config.voiceGender, isolatedRoom 
        );
        translationService.start();
    });

    socket.on('audio-stream', (data) => {
        if (translationService && isSystemActive) translationService.writeAudio(data);
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
    // RUTAS AUDIENCIA Y ANALÍTICAS
    // ==========================================
    socket.on('check-event', (eventId, callback) => {
        const event = eventsDB.get(eventId);
        if (event) {
            // Mandamos los datos comerciales a la audiencia
            callback({ success: true, name: event.name, logoUrl: event.logoUrl, sponsorText: event.sponsorText });
        } else {
            callback({ success: false });
        }
    });

    // NUEVO: Trackeo de entrada de la audiencia
    socket.on('join-event-audience', (data) => {
        const { eventId, language } = data;
        socket.join(`audience_${eventId}`);
        
        // Guardar datos en el socket para rastrearlo
        socket.audienceData = { eventId, language: language || 'es' };
        
        const stats = statsDB.get(eventId);
        if (stats) {
            stats.total += 1;
            if (stats.langs[socket.audienceData.language] !== undefined) {
                stats.langs[socket.audienceData.language] += 1;
            }
            emitMasterData(); // Actualizar dashboard en vivo
        }

        const eventRoomsMap = activeSpeakerRooms.get(eventId);
        const rooms = eventRoomsMap ? Array.from(eventRoomsMap.keys()) : [];
        socket.emit('active-rooms', rooms);
        
        const event = eventsDB.get(eventId);
        if (event) socket.emit('event-info', { 
            name: event.name, allRooms: event.rooms, isActive: event.isActive, 
            logoUrl: event.logoUrl, sponsorText: event.sponsorText 
        });
    });

    // NUEVO: Trackeo de cambio de idioma
    socket.on('audience-change-lang', (newLang) => {
        if (socket.audienceData) {
            const { eventId, language: oldLang } = socket.audienceData;
            const stats = statsDB.get(eventId);
            if (stats) {
                if (stats.langs[oldLang] > 0) stats.langs[oldLang] -= 1;
                if (stats.langs[newLang] !== undefined) stats.langs[newLang] += 1;
                socket.audienceData.language = newLang;
                emitMasterData();
            }
        }
    });

    socket.on('join-isolated-room', (data) => {
        if (!isSystemActive) return;
        const event = eventsDB.get(data.eventId);
        if (!event || !event.isActive) return;

        const isolatedRoom = `${data.eventId}_${data.roomName}`;
        Array.from(socket.rooms).forEach(r => {
            if (r !== socket.id && r !== `audience_${data.eventId}`) socket.leave(r);
        });
        socket.join(isolatedRoom);
    });

    socket.on('disconnect', () => {
        handleSpeakerStop();
        
        // Limpiar recursos de Azure
        if (translationService) {
            try { translationService.stop(); } catch(e) {}
            translationService = null;
        }

        // NUEVO: Restar analíticas cuando la audiencia se va
        if (socket.audienceData) {
            const { eventId, language } = socket.audienceData;
            const stats = statsDB.get(eventId);
            if (stats) {
                if (stats.total > 0) stats.total -= 1;
                if (stats.langs[language] > 0) stats.langs[language] -= 1;
                emitMasterData();
            }
        }
    });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    console.log(`=========================================`);
    console.log(`🚀 Servidor blindado y analítico en puerto ${PORT}`);
    console.log(`=========================================`);
});