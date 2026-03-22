const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
require('dotenv').config();

const TranslationService = require('./services/azureService');

const app = express();

// FIX: Lógica CORS a prueba de fallos para entornos de desarrollo y producción
let allowedOrigins = "*";
if (process.env.FRONTEND_URL && process.env.FRONTEND_URL !== "*") {
    allowedOrigins = process.env.FRONTEND_URL.split(',').map(url => url.trim());
}

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

const eventsDB = new Map();
const statsDB = new Map(); 

// NUEVO: Estructura de analíticas profundas
const initEventStats = (eventId) => {
    if (!statsDB.has(eventId)) {
        statsDB.set(eventId, { 
            total: 0, 
            langs: { es: 0, en: 0, de: 0, fr: 0, pt: 0 },
            roomCounts: {},
            analytics: {
                uniqueUsers: new Set(),
                uniqueByRoom: {}, 
                uniqueByLang: {}, 
                wordsByRoom: {},
                timeByRoom: {}
            }
        });
    }
};

const MASTER_PASSWORD = process.env.MASTER_PASSWORD || "superadmin123";
const activeSpeakerRooms = new Map();

// Función vital: Convierte los Set() a números para enviarlos por red sin crashear
const getSerializedStats = (eventId) => {
    const stats = statsDB.get(eventId);
    if (!stats) return { total: 0, langs: {}, roomCounts: {}, analytics: {} };
    
    const serializedAnalytics = {
        totalUnique: stats.analytics.uniqueUsers.size,
        uniqueByRoom: {},
        uniqueByLang: {},
        wordsByRoom: stats.analytics.wordsByRoom,
        timeByRoom: stats.analytics.timeByRoom
    };

    for (const [room, set] of Object.entries(stats.analytics.uniqueByRoom)) {
        serializedAnalytics.uniqueByRoom[room] = set.size;
    }
    for (const [lang, set] of Object.entries(stats.analytics.uniqueByLang)) {
        serializedAnalytics.uniqueByLang[lang] = set.size;
    }

    return {
        total: stats.total,
        langs: stats.langs,
        roomCounts: stats.roomCounts,
        analytics: serializedAnalytics
    };
};

const emitMasterData = () => {
    const eventsArray = Array.from(eventsDB.values()).map(event => {
        const eventWithStats = {
            ...event,
            stats: getSerializedStats(event.id)
        };
        io.to(`event_admin_${event.id}`).emit('event-admin-data-updated', eventWithStats);
        return eventWithStats;
    });
    io.emit('master-data-updated', eventsArray);
};

app.get('/api/status', (req, res) => {
    res.status(200).json({ status: 'online', message: 'Servidor SaaS activo, blindado y analítico.' });
});

io.on('connection', (socket) => {
    console.log(`[+] Dispositivo conectado: ${socket.id}`);
    socket.emit('system-status', isSystemActive);

    let translationService = null;

    // --- RUTAS MASTER ---
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
            stats: getSerializedStats(event.id)
        }));
        callback({ isSystemActive, events: eventsArray });
    });

    socket.on('master-toggle-system', (status) => {
        isSystemActive = status;
        io.emit('system-status', isSystemActive);
        if (!isSystemActive) {
            activeSpeakerRooms.clear();
        }
    });

    socket.on('master-toggle-event', (data, callback) => {
        const event = eventsDB.get(data.id);
        if (event) {
            event.isActive = data.status;
            if (!event.isActive) {
                const eventRoomsMap = activeSpeakerRooms.get(data.id);
                if (eventRoomsMap) eventRoomsMap.clear();
            }
            emitMasterData();
            io.emit('event-status-changed', { eventId: data.id, status: data.status });
            callback({ success: true });
        } else {
            callback({ success: false });
        }
    });

    socket.on('master-create-event', (data, callback) => {
        const internalId = Math.random().toString(36).slice(-8).toUpperCase(); 
        const secretAdminPassword = Math.random().toString(36).slice(-8).toUpperCase(); 
        
        const newEvent = {
            id: internalId,
            name: data.name,
            adminPassword: secretAdminPassword, 
            rooms: [], 
            isActive: true,
            logoUrl: data.logoUrl || "",
            sponsorText: data.sponsorText || ""
        };
        eventsDB.set(internalId, newEvent);
        initEventStats(internalId);
        
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
            if (!(event.rooms || []).find(r => r.name === data.room)) {
                const speakerPwd = Math.random().toString(36).slice(-6).toUpperCase();
                const audienceCode = Math.random().toString(36).slice(-6).toUpperCase();
                if (!event.rooms) event.rooms = [];
                event.rooms.push({ name: data.room, speakerPassword: speakerPwd, audienceCode: audienceCode });
            }
            callback({ success: true });
            emitMasterData();
        } else {
            callback({ success: false });
        }
    });

    socket.on('master-delete-room', (data, callback) => {
        const event = eventsDB.get(data.id);
        if (event) {
            event.rooms = (event.rooms || []).filter(r => r.name !== data.room);
            const stats = statsDB.get(data.id);
            if (stats && stats.roomCounts && stats.roomCounts[data.room]) {
                delete stats.roomCounts[data.room];
            }
            callback({ success: true });
            emitMasterData();
        } else {
            callback({ success: false });
        }
    });

    // --- RUTAS EVENT ADMIN ---
    socket.on('event-admin-login', (pwd, callback) => {
        let foundEvent = null;
        for (const event of eventsDB.values()) {
            if (event.adminPassword === pwd) {
                foundEvent = event;
                break;
            }
        }
        if (foundEvent) {
            socket.join(`event_admin_${foundEvent.id}`);
            callback({ 
                success: true, 
                isSystemActive,
                event: { ...foundEvent, stats: getSerializedStats(foundEvent.id) } 
            });
        } else {
            callback({ success: false, message: "Clave de administrador de evento incorrecta." });
        }
    });

    socket.on('event-admin-toggle-event', (data, callback) => {
        const event = eventsDB.get(data.eventId);
        if (event && event.adminPassword === data.adminPassword) {
            event.isActive = data.status;
            if (!event.isActive) {
                const eventRoomsMap = activeSpeakerRooms.get(data.eventId);
                if (eventRoomsMap) eventRoomsMap.clear();
            }
            emitMasterData();
            io.emit('event-status-changed', { eventId: data.eventId, status: data.status });
            callback({ success: true });
        } else {
            callback({ success: false });
        }
    });

    socket.on('event-admin-add-room', (data, callback) => {
        const event = eventsDB.get(data.eventId);
        if (event && event.adminPassword === data.adminPassword) {
            if (!(event.rooms || []).find(r => r.name === data.room)) {
                const speakerPwd = Math.random().toString(36).slice(-6).toUpperCase();
                const audienceCode = Math.random().toString(36).slice(-6).toUpperCase();
                if (!event.rooms) event.rooms = [];
                event.rooms.push({ name: data.room, speakerPassword: speakerPwd, audienceCode: audienceCode });
            }
            callback({ success: true });
            emitMasterData();
        } else {
            callback({ success: false });
        }
    });

    socket.on('event-admin-delete-room', (data, callback) => {
        const event = eventsDB.get(data.eventId);
        if (event && event.adminPassword === data.adminPassword) {
            event.rooms = (event.rooms || []).filter(r => r.name !== data.room);
            const stats = statsDB.get(data.eventId);
            if (stats && stats.roomCounts && stats.roomCounts[data.room]) {
                delete stats.roomCounts[data.room];
            }
            callback({ success: true });
            emitMasterData();
        } else {
            callback({ success: false });
        }
    });

    // --- RUTAS SPEAKER ---
    socket.on('speaker-login', (password, callback) => {
        let foundEvent = null;
        let foundRoom = null;
        for (const event of eventsDB.values()) {
            const room = (event.rooms || []).find(r => r.speakerPassword === password);
            if (room) {
                foundEvent = event;
                foundRoom = room;
                break;
            }
        }
        if (foundEvent && foundRoom) {
            const isolatedRoom = `${foundEvent.id}_${foundRoom.name}`;
            socket.join(isolatedRoom);
            
            const stats = statsDB.get(foundEvent.id);
            const currentCount = stats?.roomCounts?.[foundRoom.name] || 0;
            socket.emit('room-audience-count', currentCount);

            callback({ success: true, event: foundEvent, roomName: foundRoom.name, audienceCode: foundRoom.audienceCode });
        } else {
            callback({ success: false, message: "Clave de sala incorrecta o evento no encontrado." });
        }
    });

    socket.on('start-translation', (config) => {
        if (!isSystemActive) return;
        const event = eventsDB.get(config.eventId);
        if (!event || !event.isActive) return;

        const eventId = config.eventId;
        const roomName = config.roomName;
        const isolatedRoom = `${eventId}_${roomName}`;
        
        socket.join(isolatedRoom); 
        
        // Cronómetro de Analíticas
        socket.speakerSession = { eventId, roomName, startTimestamp: Date.now() };

        if (!activeSpeakerRooms.has(eventId)) activeSpeakerRooms.set(eventId, new Map());
        const eventRoomsMap = activeSpeakerRooms.get(eventId);
        eventRoomsMap.set(roomName, (eventRoomsMap.get(roomName) || 0) + 1);
        
        translationService = new TranslationService(
            socket, config.fromLanguage, config.toLanguages, config.voiceGender, isolatedRoom 
        );
        translationService.start();
    });

    socket.on('audio-stream', (data) => {
        if (translationService && isSystemActive) translationService.writeAudio(data);
    });

    // Recibe los conteos de palabras desde el navegador del orador
    socket.on('analytics-sync-words', (data) => {
        if (socket.speakerSession) {
            const { eventId, roomName } = socket.speakerSession;
            const stats = statsDB.get(eventId);
            if (stats) {
                if (!stats.analytics.wordsByRoom[roomName]) stats.analytics.wordsByRoom[roomName] = 0;
                stats.analytics.wordsByRoom[roomName] += data.words;
            }
        }
    });

    const handleSpeakerStop = () => {
        if (socket.speakerSession) {
            const { eventId, roomName, startTimestamp } = socket.speakerSession;
            
            // Calculamos tiempo total
            const duration = Date.now() - startTimestamp;
            const stats = statsDB.get(eventId);
            if (stats) {
                if (!stats.analytics.timeByRoom[roomName]) stats.analytics.timeByRoom[roomName] = 0;
                stats.analytics.timeByRoom[roomName] += duration;
            }

            const eventRoomsMap = activeSpeakerRooms.get(eventId);
            if (eventRoomsMap) {
                const count = eventRoomsMap.get(roomName) || 0;
                if (count <= 1) eventRoomsMap.delete(roomName);
                else eventRoomsMap.set(roomName, count - 1);
            }
            socket.speakerSession = null;
            emitMasterData(); // Actualiza a los masters
        }
    };

    socket.on('stop-translation', () => {
        handleSpeakerStop();
        if (translationService) {
            translationService.stop();
            translationService = null;
        }
    });

    // --- RUTAS AUDIENCIA DIRECTA ---
    socket.on('check-audience-code', (code, callback) => {
        for (const event of eventsDB.values()) {
            const room = (event.rooms || []).find(r => r.audienceCode === code);
            if (room) {
                return callback({ 
                    success: true, 
                    eventId: event.id,
                    eventName: event.name,
                    roomName: room.name,
                    logoUrl: event.logoUrl, 
                    sponsorText: event.sponsorText 
                });
            }
        }
        callback({ success: false });
    });

    socket.on('join-direct-room-audience', (data) => {
        if (!isSystemActive) return;
        const event = eventsDB.get(data.eventId);
        if (!event || !event.isActive) return;

        const { eventId, roomName, language, deviceId } = data;
        const isolatedRoom = `${eventId}_${roomName}`;
        
        socket.join(isolatedRoom);
        socket.audienceData = { eventId, roomName, language: language || 'es', deviceId };
        
        const stats = statsDB.get(eventId);
        if (stats) {
            // Estadísticas en Vivo (Entran y Salen)
            stats.total += 1;
            if (stats.langs[language] !== undefined) stats.langs[language] += 1;
            if (stats.roomCounts[roomName] === undefined) stats.roomCounts[roomName] = 0;
            stats.roomCounts[roomName] += 1;
            
            // ANALÍTICAS HISTÓRICAS (Garantizan Usuarios Únicos)
            if (deviceId) {
                stats.analytics.uniqueUsers.add(deviceId);
                
                if (!stats.analytics.uniqueByRoom[roomName]) stats.analytics.uniqueByRoom[roomName] = new Set();
                stats.analytics.uniqueByRoom[roomName].add(deviceId);

                if (!stats.analytics.uniqueByLang[language]) stats.analytics.uniqueByLang[language] = new Set();
                stats.analytics.uniqueByLang[language].add(deviceId);
            }

            io.to(isolatedRoom).emit('room-audience-count', stats.roomCounts[roomName]);
            emitMasterData(); 
        }
        
        socket.emit('event-info', { 
            name: event.name, isActive: event.isActive, logoUrl: event.logoUrl, sponsorText: event.sponsorText 
        });
    });

    socket.on('audience-change-lang', (newLang) => {
        if (socket.audienceData) {
            const { eventId, language: oldLang, deviceId } = socket.audienceData;
            const stats = statsDB.get(eventId);
            if (stats) {
                if (stats.langs[oldLang] > 0) stats.langs[oldLang] -= 1;
                if (stats.langs[newLang] !== undefined) stats.langs[newLang] += 1;
                socket.audienceData.language = newLang;
                
                // Actualiza unicidad en base a nuevo idioma
                if (deviceId) {
                    if (!stats.analytics.uniqueByLang[newLang]) stats.analytics.uniqueByLang[newLang] = new Set();
                    stats.analytics.uniqueByLang[newLang].add(deviceId);
                }

                emitMasterData();
            }
        }
    });

    const removeAudienceFromStats = (socketInstance) => {
        if (socketInstance.audienceData) {
            const { eventId, language, roomName } = socketInstance.audienceData;
            const stats = statsDB.get(eventId);
            if (stats) {
                // Solo reducimos los contadores "en vivo", los "únicos" se quedan en analytics
                if (stats.total > 0) stats.total -= 1;
                if (stats.langs[language] > 0) stats.langs[language] -= 1;
                if (stats.roomCounts[roomName] > 0) {
                    stats.roomCounts[roomName] -= 1;
                    io.to(`${eventId}_${roomName}`).emit('room-audience-count', stats.roomCounts[roomName]);
                }
                emitMasterData();
            }
            socketInstance.audienceData = null; 
        }
    };

    socket.on('leave-event-audience', () => {
        removeAudienceFromStats(socket);
        Array.from(socket.rooms).forEach(r => {
            if (r !== socket.id) socket.leave(r);
        });
    });

    socket.on('disconnect', () => {
        handleSpeakerStop();
        if (translationService) {
            try { translationService.stop(); } catch(e) {}
            translationService = null;
        }
        removeAudienceFromStats(socket);
    });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    console.log(`=========================================`);
    console.log(`🚀 Servidor SaaS blindado y analítico en puerto ${PORT}`);
    console.log(`=========================================`);
});