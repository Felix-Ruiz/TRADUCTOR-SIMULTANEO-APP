const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const mongoose = require('mongoose');
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

// FIX: Encendido automático por defecto para evitar que el sistema se apague en reinicios de Render
let isSystemActive = true; 

const eventsDB = new Map();
const statsDB = new Map(); 

// --- ESCUDO ANTI-BOTS (Rate Limiting en Memoria) ---
const loginAttempts = new Map();
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000;

const checkRateLimit = (ip) => {
    const record = loginAttempts.get(ip);
    if (!record) return { allowed: true };
    
    if (record.lockedUntil && Date.now() < record.lockedUntil) {
        const remainingMinutes = Math.ceil((record.lockedUntil - Date.now()) / 60000);
        return { allowed: false, message: `Demasiados intentos fallidos. Por seguridad, intenta de nuevo en ${remainingMinutes} minutos.` };
    }
    
    if (record.lockedUntil && Date.now() >= record.lockedUntil) {
        loginAttempts.delete(ip); 
        return { allowed: true };
    }
    
    return { allowed: true };
};

const registerFailedAttempt = (ip) => {
    if (!ip) return;
    const record = loginAttempts.get(ip) || { attempts: 0, lockedUntil: null };
    record.attempts += 1;
    
    if (record.attempts >= MAX_FAILED_ATTEMPTS) {
        record.lockedUntil = Date.now() + LOCKOUT_DURATION_MS;
        console.warn(`[🛡️ SEGURIDAD] IP Bloqueada por fuerza bruta: ${ip}`);
    }
    loginAttempts.set(ip, record);
};

const resetAttempts = (ip) => {
    if (ip) loginAttempts.delete(ip);
};

// --- CAMIÓN DE BASURA (Garbage Collector para Memoria RAM) ---
setInterval(() => {
    const now = Date.now();
    let deletedCount = 0;
    for (const [ip, record] of loginAttempts.entries()) {
        if (record.lockedUntil && now >= record.lockedUntil) {
            loginAttempts.delete(ip); 
            deletedCount++;
        } else if (!record.lockedUntil) {
            loginAttempts.delete(ip); 
            deletedCount++;
        }
    }
}, LOCKOUT_DURATION_MS); 

// --- MONITOR DE SIGNOS VITALES (RAM) ---
const MAX_RAM_MB = 512; 
const getRamUsage = () => {
    const usedMB = Math.round(process.memoryUsage().rss / 1024 / 1024);
    const percent = Math.min(100, Math.round((usedMB / MAX_RAM_MB) * 100));
    return { used: usedMB, max: MAX_RAM_MB, percent };
};

setInterval(() => {
    if (isSystemActive) {
        io.emit('master-ram-update', getRamUsage());
    }
}, 5000);

// --- MONGODB SETUP (Bóveda de Persistencia) ---
const eventSchema = new mongoose.Schema({
    id: String,
    name: String,
    adminPassword: String,
    rooms: Array,
    isActive: Boolean,
    logoUrl: String,
    logos: Array, 
    animateLogos: Boolean,
    sponsorText: String
});
const EventModel = mongoose.model('Event', eventSchema);

const statsSchema = new mongoose.Schema({
    eventId: String,
    total: Number,
    langs: Object,
    roomCounts: Object,
    analytics: Object
});
const StatsModel = mongoose.model('Stats', statsSchema);

// Estructuras en memoria para Q&A
const questionQueues = new Map(); // Q&A en Vivo: 'eventId_roomName' -> [{ socketId, name, location, language, status, timestamp }]
const textQuestionsDB = new Map(); // Q&A Escritas: 'eventId_roomName' -> [{ id, name, location, language, text, translations, timestamp }]
const activeProjectedText = new Map(); // Texto proyectado actualmente: 'eventId_roomName' -> { question object }

const connectDB = async () => {
    try {
        const uri = process.env.MONGO_URI;
        if (!uri) return;
        await mongoose.connect(uri);
        console.log("✅ Conectado a Bóveda MongoDB Atlas");

        const events = await EventModel.find();
        const stats = await StatsModel.find();

        events.forEach(e => {
            eventsDB.set(e.id, {
                id: e.id,
                name: e.name,
                adminPassword: e.adminPassword,
                rooms: (e.rooms || []).map(r => ({ ...r, isActive: r.isActive !== false, isQaActive: r.isQaActive || false })),
                isActive: e.isActive !== false,
                logoUrl: e.logoUrl || "",
                logos: e.logos || [],
                animateLogos: e.animateLogos || false,
                sponsorText: e.sponsorText || ""
            });
        });

        stats.forEach(s => {
            const parsedAnalytics = s.analytics || {};
            const uniqueUsers = new Set(parsedAnalytics.uniqueUsers || []);
            const uniqueByRoom = {};
            for (const [r, arr] of Object.entries(parsedAnalytics.uniqueByRoom || {})) uniqueByRoom[r] = new Set(arr);
            const uniqueByLang = {};
            for (const [l, arr] of Object.entries(parsedAnalytics.uniqueByLang || {})) uniqueByLang[l] = new Set(arr);

            statsDB.set(s.eventId, {
                total: 0, 
                langs: { es: 0, en: 0, de: 0, fr: 0, pt: 0 },
                roomCounts: {},
                analytics: {
                    uniqueUsers: uniqueUsers,
                    uniqueByRoom: uniqueByRoom,
                    uniqueByLang: uniqueByLang,
                    wordsByRoom: parsedAnalytics.wordsByRoom || {},
                    timeByRoom: parsedAnalytics.timeByRoom || {}
                }
            });
        });
        console.log(`📦 Datos restaurados: ${events.length} eventos y ${stats.length} métricas.`);
    } catch (error) {
        console.error("❌ Error conectando a MongoDB:", error);
    }
};
connectDB();

// --- SISTEMA ANTI-COLAPSO DE MONGODB (Batch Processing) ---
const pendingEventUpdates = new Set();
const pendingStatsUpdates = new Set();

const markEventDirty = (eventId) => pendingEventUpdates.add(eventId);
const markStatsDirty = (eventId) => pendingStatsUpdates.add(eventId);

setInterval(async () => {
    if (!process.env.MONGO_URI) return;

    for (const eventId of pendingEventUpdates) {
        const ev = eventsDB.get(eventId);
        if (ev) {
            await EventModel.findOneAndUpdate({ id: eventId }, ev, { upsert: true }).catch(()=>{});
        } else {
            await EventModel.deleteOne({ id: eventId }).catch(()=>{});
        }
        pendingEventUpdates.delete(eventId);
    }

    for (const eventId of pendingStatsUpdates) {
        const st = statsDB.get(eventId);
        if (st) {
            const serialized = {
                eventId: eventId,
                total: st.total,
                langs: st.langs,
                roomCounts: st.roomCounts,
                analytics: {
                    uniqueUsers: Array.from(st.analytics.uniqueUsers),
                    uniqueByRoom: {},
                    uniqueByLang: {},
                    wordsByRoom: st.analytics.wordsByRoom,
                    timeByRoom: st.analytics.timeByRoom
                }
            };
            for (const [r, set] of Object.entries(st.analytics.uniqueByRoom)) serialized.analytics.uniqueByRoom[r] = Array.from(set);
            for (const [l, set] of Object.entries(st.analytics.uniqueByLang)) serialized.analytics.uniqueByLang[l] = Array.from(set);

            await StatsModel.findOneAndUpdate({ eventId: eventId }, serialized, { upsert: true }).catch(()=>{});
        } else {
            await StatsModel.deleteOne({ eventId: eventId }).catch(()=>{});
        }
        pendingStatsUpdates.delete(eventId);
    }
}, 10000); 

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
        markStatsDirty(eventId);
    }
};

const MASTER_PASSWORD = "acofi";
const activeSpeakerRooms = new Map();

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
    res.status(200).json({ status: 'online', message: 'Servidor SaaS activo y optimizado.' });
});

io.on('connection', (socket) => {
    const rawIp = socket.handshake.headers['x-forwarded-for'] || socket.handshake.address || "unknown_ip";
    const clientIp = rawIp.split(',')[0].trim();
    
    console.log(`\n[🔗 NUEVA CONEXIÓN] Un cliente acaba de abrir la página. IP: ${clientIp} | ID: ${socket.id}`);
    
    socket.emit('system-status', isSystemActive);

    let translationService = null;
    let qaTranslationService = null; 

    const cleanupQaAudio = () => {
        if (qaTranslationService) {
            try { qaTranslationService.stop(); } catch(e) {}
            qaTranslationService = null;
            if (socket.audienceData) {
                io.to(`${socket.audienceData.eventId}_${socket.audienceData.roomName}`).emit('qa-speaker-inactive');
            }
        }
    };

    socket.on('master-login', (pwd, callback) => {
        const rateLimit = checkRateLimit(clientIp);
        if (!rateLimit.allowed) return callback({ success: false, message: rateLimit.message });

        if (pwd === MASTER_PASSWORD) {
            resetAttempts(clientIp);
            callback({ success: true });
        } else {
            registerFailedAttempt(clientIp);
            callback({ success: false, message: "Contraseña incorrecta." });
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
            markEventDirty(data.id);
            emitMasterData();
            io.emit('event-status-changed', { eventId: data.id, status: data.status });
            callback({ success: true });
        } else {
            callback({ success: false });
        }
    });

    socket.on('master-toggle-room', (data, callback) => {
        const event = eventsDB.get(data.eventId);
        if (event) {
            const room = event.rooms.find(r => r.name === data.roomName);
            if (room) {
                room.isActive = data.status;
                if (!room.isActive) {
                    const eventRoomsMap = activeSpeakerRooms.get(data.eventId);
                    if (eventRoomsMap && eventRoomsMap.has(data.roomName)) {
                        eventRoomsMap.delete(data.roomName);
                    }
                }
                markEventDirty(data.eventId);
                emitMasterData();
                io.emit('room-status-changed', { eventId: data.eventId, roomName: data.roomName, status: data.status });
                callback({ success: true });
            } else {
                callback({ success: false });
            }
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
            logos: data.logos || [],
            animateLogos: data.animateLogos || false,
            sponsorText: data.sponsorText || ""
        };
        eventsDB.set(internalId, newEvent);
        initEventStats(internalId);
        markEventDirty(internalId);
        
        callback({ success: true, event: newEvent });
        emitMasterData();
    });

    socket.on('master-edit-event', (data, callback) => {
        const event = eventsDB.get(data.id);
        if (event) {
            event.name = data.name || event.name;
            event.logos = data.logos || event.logos;
            event.logoUrl = data.logos && data.logos.length > 0 ? data.logos[0].url : '';
            event.animateLogos = data.animateLogos !== undefined ? data.animateLogos : event.animateLogos;
            event.sponsorText = data.sponsorText !== undefined ? data.sponsorText : event.sponsorText;
            
            markEventDirty(data.id);
            emitMasterData();
            
            if (event.rooms) {
                event.rooms.forEach(room => {
                    io.to(`${event.id}_${room.name}`).emit('event-info', { 
                        name: event.name, 
                        isActive: event.isActive, 
                        logoUrl: event.logoUrl, 
                        logos: event.logos, 
                        animateLogos: event.animateLogos,
                        sponsorText: event.sponsorText 
                    });
                });
            }
            callback({ success: true });
        } else {
            callback({ success: false, message: "Evento no encontrado" });
        }
    });

    socket.on('master-delete-event', (id, callback) => {
        eventsDB.delete(id);
        statsDB.delete(id);
        activeSpeakerRooms.delete(id);
        
        for (const key of questionQueues.keys()) {
            if (key.startsWith(`${id}_`)) questionQueues.delete(key);
        }
        for (const key of textQuestionsDB.keys()) {
            if (key.startsWith(`${id}_`)) textQuestionsDB.delete(key);
        }

        markEventDirty(id);
        markStatsDirty(id);
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
                event.rooms.push({ name: data.room, speakerPassword: speakerPwd, audienceCode: audienceCode, isActive: true, isQaActive: false });
            }
            markEventDirty(data.id);
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
            questionQueues.delete(`${data.id}_${data.room}`);
            textQuestionsDB.delete(`${data.id}_${data.room}`);
            
            markEventDirty(data.id);
            markStatsDirty(data.id);
            callback({ success: true });
            emitMasterData();
        } else {
            callback({ success: false });
        }
    });

    socket.on('master-optimize-room', async (data, callback) => {
        const { eventId, roomName } = data;
        const isolatedRoom = `${eventId}_${roomName}`;

        try {
            const sockets = await io.in(isolatedRoom).fetchSockets();
            let mobileCandidates = [];
            
            sockets.forEach(s => {
                if (s.audienceData && !s.audienceData.isTv) {
                    mobileCandidates.push(s);
                }
            });

            const kickCount = Math.floor(mobileCandidates.length / 2);
            for(let i=0; i<kickCount; i++) {
                const s = mobileCandidates[i];
                s.emit('graceful-pause', { message: "Optimizando calidad de transmisión..." });
                removeAudienceFromStats(s);
                s.leave(isolatedRoom);
            }
            
            if (callback) callback({ success: true, kicked: kickCount });
        } catch (error) {
            if (callback) callback({ success: false });
        }
    });

    socket.on('event-admin-login', (pwd, callback) => {
        const rateLimit = checkRateLimit(clientIp);
        if (!rateLimit.allowed) return callback({ success: false, message: rateLimit.message });

        let foundEvent = null;
        for (const event of eventsDB.values()) {
            if (event.adminPassword === pwd) {
                foundEvent = event;
                break;
            }
        }
        if (foundEvent) {
            resetAttempts(clientIp);
            socket.join(`event_admin_${foundEvent.id}`);
            callback({ 
                success: true, 
                isSystemActive,
                event: { ...foundEvent, stats: getSerializedStats(foundEvent.id) } 
            });
        } else {
            registerFailedAttempt(clientIp);
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
            markEventDirty(data.eventId);
            emitMasterData();
            io.emit('event-status-changed', { eventId: data.eventId, status: data.status });
            callback({ success: true });
        } else {
            callback({ success: false });
        }
    });

    socket.on('event-admin-toggle-room', (data, callback) => {
        const event = eventsDB.get(data.eventId);
        if (event && event.adminPassword === data.adminPassword) {
            const room = event.rooms.find(r => r.name === data.roomName);
            if (room) {
                room.isActive = data.status;
                if (!room.isActive) {
                    const eventRoomsMap = activeSpeakerRooms.get(data.eventId);
                    if (eventRoomsMap && eventRoomsMap.has(data.roomName)) {
                        eventRoomsMap.delete(data.roomName);
                    }
                }
                markEventDirty(data.eventId);
                emitMasterData();
                io.emit('room-status-changed', { eventId: data.eventId, roomName: data.roomName, status: data.status });
                callback({ success: true });
            } else {
                callback({ success: false });
            }
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
                event.rooms.push({ name: data.room, speakerPassword: speakerPwd, audienceCode: audienceCode, isActive: true, isQaActive: false });
            }
            markEventDirty(data.eventId);
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
            questionQueues.delete(`${data.eventId}_${data.room}`);
            textQuestionsDB.delete(`${data.eventId}_${data.room}`);
            
            markEventDirty(data.eventId);
            markStatsDirty(data.eventId);
            callback({ success: true });
            emitMasterData();
        } else {
            callback({ success: false });
        }
    });

    // ==========================================
    // ACTIVACIÓN/DESACTIVACIÓN DE PREGUNTAS (Q&A)
    // ==========================================
    
    socket.on('toggle-qa-status', (data) => {
        const { eventId, roomName, status } = data;
        const event = eventsDB.get(eventId);
        if (event) {
            const room = event.rooms.find(r => r.name === roomName);
            if (room) {
                room.isQaActive = status;
                markEventDirty(eventId);
                io.to(`${eventId}_${roomName}`).emit('qa-status-changed', status);
                if (!status) {
                    questionQueues.set(`${eventId}_${roomName}`, []);
                    io.to(`event_admin_${eventId}`).emit('qa-queue-updated', { roomName, queue: [] });
                    io.to(`speaker_${eventId}_${roomName}`).emit('qa-queue-updated', { roomName, queue: [] });
                }
                emitMasterData(); 
            }
        }
    });

    // ==========================================
    // Q&A MODO 1: MICRÓFONO EN VIVO
    // ==========================================

    socket.on('qa-request-floor', (data) => {
        const { eventId, roomName, name, location, language } = data;
        const isolatedRoom = `${eventId}_${roomName}`;
        
        if (!questionQueues.has(isolatedRoom)) {
            questionQueues.set(isolatedRoom, []);
        }
        
        const queue = questionQueues.get(isolatedRoom);
        
        if (!queue.find(q => q.socketId === socket.id)) {
            const newRequest = {
                socketId: socket.id,
                name: name || 'Anónimo',
                location: location || 'Sala',
                language: language || 'es',
                status: 'pending',
                timestamp: Date.now()
            };
            queue.push(newRequest);
            
            io.to(`event_admin_${eventId}`).emit('qa-queue-updated', { roomName, queue });
            io.to(`speaker_${isolatedRoom}`).emit('qa-queue-updated', { roomName, queue });
        }
    });

    socket.on('qa-approve-floor', (data) => {
        const { eventId, roomName, targetSocketId } = data;
        const isolatedRoom = `${eventId}_${roomName}`;
        
        const queue = questionQueues.get(isolatedRoom);
        if (queue) {
            const requestIndex = queue.findIndex(q => q.socketId === targetSocketId);
            if (requestIndex !== -1) {
                queue[requestIndex].status = 'approved';
                
                queue.forEach((q, i) => {
                    if (i !== requestIndex && q.status === 'approved') q.status = 'pending';
                });

                io.to(targetSocketId).emit('qa-floor-granted');
                io.to(`event_admin_${eventId}`).emit('qa-queue-updated', { roomName, queue });
                io.to(`speaker_${isolatedRoom}`).emit('qa-queue-updated', { roomName, queue });
            }
        }
    });

    socket.on('qa-reject-floor', (data) => {
        const { eventId, roomName, targetSocketId } = data;
        const isolatedRoom = `${eventId}_${roomName}`;
        
        const queue = questionQueues.get(isolatedRoom);
        if (queue) {
            questionQueues.set(isolatedRoom, queue.filter(q => q.socketId !== targetSocketId));
            
            io.to(targetSocketId).emit('qa-floor-revoked');
            
            io.to(`event_admin_${eventId}`).emit('qa-queue-updated', { roomName, queue: questionQueues.get(isolatedRoom) });
            io.to(`speaker_${isolatedRoom}`).emit('qa-queue-updated', { roomName, queue: questionQueues.get(isolatedRoom) });
        }
    });

    socket.on('qa-audio-stream', (data) => {
        if (!isSystemActive) return;
        const { eventId, roomName, audioData } = data;
        const isolatedRoom = `${eventId}_${roomName}`;
        
        const queue = questionQueues.get(isolatedRoom) || [];
        const request = queue.find(q => q.socketId === socket.id && q.status === 'approved');
        
        if (request) {
            if (!qaTranslationService) {
                io.to(isolatedRoom).emit('qa-speaker-active', { name: request.name, location: request.location, language: request.language });
                
                const langMap = { 'es': 'es-CO', 'en': 'en-US', 'de': 'de-DE', 'fr': 'fr-FR', 'pt': 'pt-BR' };
                const fromLangAzure = langMap[request.language] || 'es-CO';
                
                const toLangs = ['es', 'en', 'pt', 'fr', 'de'].filter(l => l !== request.language);

                qaTranslationService = new TranslationService(
                    socket, 
                    fromLangAzure, 
                    toLangs, 
                    'female', 
                    isolatedRoom,
                    true, 
                    request.name 
                );
                qaTranslationService.start();
            }
            qaTranslationService.writeAudio(audioData);
        } else {
            cleanupQaAudio();
        }
    });

    // ==========================================
    // Q&A MODO 2: BUZÓN DE PREGUNTAS ESCRITAS CON TRADUCCIÓN AZURE
    // ==========================================

    socket.on('qa-submit-text', async (data) => {
        const { eventId, roomName, name, location, language, text } = data;
        const isolatedRoom = `${eventId}_${roomName}`;
        if (!textQuestionsDB.has(isolatedRoom)) textQuestionsDB.set(isolatedRoom, []);
        
        const questionId = 'q_' + Math.random().toString(36).substr(2, 9);
        let translatedTexts = {};
        
        const key = process.env.AZURE_TRANSLATOR_KEY;
        const region = process.env.AZURE_TRANSLATOR_REGION;

        if (key && region) {
            try {
                const toLangs = ['es', 'en', 'pt', 'fr', 'de'].filter(l => l !== language);
                const queryLangs = toLangs.join('&to=');
                const url = `https://api.cognitive.microsofttranslator.com/translate?api-version=3.0&from=${language}&to=${queryLangs}`;
                
                // Usamos fetch nativo (Node 18+)
                const response = await fetch(url, {
                    method: 'POST',
                    headers: {
                        'Ocp-Apim-Subscription-Key': key,
                        'Ocp-Apim-Subscription-Region': region,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify([{ text }])
                });
                
                const result = await response.json();
                if (result && result[0] && result[0].translations) {
                    result[0].translations.forEach(t => {
                        translatedTexts[t.to] = t.text;
                    });
                }
                translatedTexts[language] = text; 
            } catch (err) {
                console.error('[Azure Text] Error traduciendo pregunta escrita:', err);
                translatedTexts[language] = text;
            }
        } else {
            translatedTexts[language] = text;
        }

        const newTextRequest = { 
            id: questionId, 
            name: name || 'Anónimo', 
            location: location || 'Sala', 
            language: language || 'es', 
            text, 
            translations: translatedTexts,
            timestamp: Date.now() 
        };
        
        textQuestionsDB.get(isolatedRoom).push(newTextRequest);
        
        io.to(`event_admin_${eventId}`).emit('qa-text-queue-updated', { roomName, queue: textQuestionsDB.get(isolatedRoom) });
        io.to(`speaker_${isolatedRoom}`).emit('qa-text-queue-updated', { roomName, queue: textQuestionsDB.get(isolatedRoom) });
    });

    socket.on('qa-delete-text', (data) => {
        const { eventId, roomName, questionId } = data;
        const isolatedRoom = `${eventId}_${roomName}`;
        let queue = textQuestionsDB.get(isolatedRoom) || [];
        queue = queue.filter(q => q.id !== questionId);
        textQuestionsDB.set(isolatedRoom, queue);
        
        io.to(`event_admin_${eventId}`).emit('qa-text-queue-updated', { roomName, queue });
        io.to(`speaker_${isolatedRoom}`).emit('qa-text-queue-updated', { roomName, queue });
        
        const projected = activeProjectedText.get(isolatedRoom);
        if (projected && projected.id === questionId) {
            activeProjectedText.delete(isolatedRoom);
            io.to(isolatedRoom).emit('qa-projected-text-question', null);
        }
    });

    socket.on('qa-project-text', (data) => {
        const { eventId, roomName, question } = data;
        const isolatedRoom = `${eventId}_${roomName}`;
        activeProjectedText.set(isolatedRoom, question);
        io.to(isolatedRoom).emit('qa-projected-text-question', question);
    });

    socket.on('qa-stop-project-text', (data) => {
        const { eventId, roomName } = data;
        const isolatedRoom = `${eventId}_${roomName}`;
        activeProjectedText.delete(isolatedRoom);
        io.to(isolatedRoom).emit('qa-projected-text-question', null);
    });

    socket.on('qa-get-queue', (data) => {
        const { eventId, roomName } = data;
        const isolatedRoom = `${eventId}_${roomName}`;
        const queue = questionQueues.get(isolatedRoom) || [];
        const textQueue = textQuestionsDB.get(isolatedRoom) || [];
        socket.emit('qa-queue-updated', { roomName, queue });
        socket.emit('qa-text-queue-updated', { roomName, queue: textQueue });
    });

    // ==========================================

    socket.on('speaker-login', (password, callback) => {
        console.log(`[🔐 SENSOR] Alguien intentó entrar como Orador con la clave: ${password}`);

        const rateLimit = checkRateLimit(clientIp);
        if (!rateLimit.allowed) return callback({ success: false, message: rateLimit.message });

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
            if (foundRoom.isActive === false) {
                return callback({ success: false, message: "Esta sala específica se encuentra pausada por el administrador." });
            }

            resetAttempts(clientIp);
            const isolatedRoom = `${foundEvent.id}_${foundRoom.name}`;
            socket.join(isolatedRoom);
            socket.join(`speaker_${isolatedRoom}`);
            
            const stats = statsDB.get(foundEvent.id);
            const currentCount = stats?.roomCounts?.[foundRoom.name] || 0;
            socket.emit('room-audience-count', currentCount);

            console.log(`[✅ SENSOR] Orador autenticado exitosamente en la sala: ${foundRoom.name}`);
            callback({ 
                success: true, 
                event: foundEvent, 
                roomName: foundRoom.name, 
                audienceCode: foundRoom.audienceCode,
                isQaActive: foundRoom.isQaActive 
            });
        } else {
            registerFailedAttempt(clientIp);
            callback({ success: false, message: "Clave de sala incorrecta o evento no encontrado." });
        }
    });

    socket.on('start-translation', (config) => {
        if (!isSystemActive) return;
        const event = eventsDB.get(config.eventId);
        if (!event || !event.isActive) return;
        const room = event.rooms.find(r => r.name === config.roomName);
        if (!room || room.isActive === false) return;

        const eventId = config.eventId;
        const roomName = config.roomName;
        const isolatedRoom = `${eventId}_${roomName}`;
        
        socket.join(isolatedRoom); 
        
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

    socket.on('analytics-sync-words', (data) => {
        if (socket.speakerSession) {
            const { eventId, roomName } = socket.speakerSession;
            const stats = statsDB.get(eventId);
            if (stats) {
                if (!stats.analytics.wordsByRoom[roomName]) stats.analytics.wordsByRoom[roomName] = 0;
                stats.analytics.wordsByRoom[roomName] += data.words;
                markStatsDirty(eventId);
            }
        }
    });

    const handleSpeakerStop = () => {
        if (socket.speakerSession) {
            const { eventId, roomName, startTimestamp } = socket.speakerSession;
            
            const duration = Date.now() - startTimestamp;
            const stats = statsDB.get(eventId);
            if (stats) {
                if (!stats.analytics.timeByRoom[roomName]) stats.analytics.timeByRoom[roomName] = 0;
                stats.analytics.timeByRoom[roomName] += duration;
                markStatsDirty(eventId);
            }

            const eventRoomsMap = activeSpeakerRooms.get(eventId);
            if (eventRoomsMap) {
                const count = eventRoomsMap.get(roomName) || 0;
                if (count <= 1) eventRoomsMap.delete(roomName);
                else eventRoomsMap.set(roomName, count - 1);
            }
            socket.speakerSession = null;
            emitMasterData(); 
        }
    };

    socket.on('stop-translation', () => {
        handleSpeakerStop();
        if (translationService) {
            translationService.stop();
            translationService = null;
        }
    });

    socket.on('check-audience-code', (code, callback) => {
        const rateLimit = checkRateLimit(clientIp);
        if (!rateLimit.allowed) return callback({ success: false, message: rateLimit.message });

        let found = false;
        for (const event of eventsDB.values()) {
            const room = (event.rooms || []).find(r => r.audienceCode === code);
            if (room) {
                if (room.isActive === false) {
                    return callback({ success: false, message: "Esta sala se encuentra temporalmente pausada." });
                }

                found = true;
                resetAttempts(clientIp);
                return callback({ 
                    success: true, 
                    eventId: event.id,
                    eventName: event.name,
                    roomName: room.name,
                    logoUrl: event.logoUrl,
                    logos: event.logos || [],
                    animateLogos: event.animateLogos || false,
                    sponsorText: event.sponsorText 
                });
            }
        }
        
        if (!found) {
            registerFailedAttempt(clientIp);
            callback({ success: false, message: "Código de audiencia inválido." });
        }
    });

    socket.on('join-direct-room-audience', (data) => {
        if (!isSystemActive) return;
        const event = eventsDB.get(data.eventId);
        if (!event || !event.isActive) return;

        const roomDef = event.rooms.find(r => r.name === data.roomName);
        if (!roomDef || roomDef.isActive === false) return;

        const { eventId, roomName, language, deviceId, isTv } = data; 
        
        const currentRam = getRamUsage();
        const stats = statsDB.get(eventId);
        const currentRoomUsers = stats?.roomCounts?.[roomName] || 0;
        const MAX_ROOM_USERS = 300; 

        if (!isTv && (currentRam.percent >= 85 || currentRoomUsers >= MAX_ROOM_USERS)) {
            socket.emit('graceful-pause', { message: "Conectando al servidor secundario..." });
            return; 
        }

        const isolatedRoom = `${eventId}_${roomName}`;
        socket.join(isolatedRoom);
        
        socket.audienceData = { eventId, roomName, language: language || 'es', deviceId, isTv: !!isTv };
        
        if (stats) {
            stats.total += 1;
            if (stats.langs[language] !== undefined) stats.langs[language] += 1;
            if (stats.roomCounts[roomName] === undefined) stats.roomCounts[roomName] = 0;
            stats.roomCounts[roomName] += 1;
            
            if (deviceId) {
                stats.analytics.uniqueUsers.add(deviceId);
                
                if (!stats.analytics.uniqueByRoom[roomName]) stats.analytics.uniqueByRoom[roomName] = new Set();
                stats.analytics.uniqueByRoom[roomName].add(deviceId);

                if (!stats.analytics.uniqueByLang[language]) stats.analytics.uniqueByLang[language] = new Set();
                stats.analytics.uniqueByLang[language].add(deviceId);
            }

            io.to(isolatedRoom).emit('room-audience-count', stats.roomCounts[roomName]);
            emitMasterData(); 
            markStatsDirty(eventId);
        }
        
        socket.emit('event-info', { 
            name: event.name, 
            isActive: event.isActive, 
            logoUrl: event.logoUrl, 
            logos: event.logos || [], 
            animateLogos: event.animateLogos || false,
            sponsorText: event.sponsorText 
        });

        socket.emit('qa-status-changed', roomDef.isQaActive || false);

        const projectedText = activeProjectedText.get(isolatedRoom);
        if (projectedText) {
            socket.emit('qa-projected-text-question', projectedText);
        }
    });

    socket.on('audience-change-lang', (newLang) => {
        if (socket.audienceData) {
            const { eventId, language: oldLang, deviceId } = socket.audienceData;
            const stats = statsDB.get(eventId);
            if (stats) {
                if (stats.langs[oldLang] > 0) stats.langs[oldLang] -= 1;
                if (stats.langs[newLang] !== undefined) stats.langs[newLang] += 1;
                socket.audienceData.language = newLang;
                
                if (deviceId) {
                    if (!stats.analytics.uniqueByLang[newLang]) stats.analytics.uniqueByLang[newLang] = new Set();
                    stats.analytics.uniqueByLang[newLang].add(deviceId);
                }

                emitMasterData();
                markStatsDirty(eventId);
            }
        }
    });

    const removeAudienceFromStats = (socketInstance) => {
        if (socketInstance.audienceData) {
            const { eventId, language, roomName } = socketInstance.audienceData;
            const stats = statsDB.get(eventId);
            if (stats) {
                if (stats.total > 0) stats.total -= 1;
                if (stats.langs[language] > 0) stats.langs[language] -= 1;
                if (stats.roomCounts[roomName] > 0) {
                    stats.roomCounts[roomName] -= 1;
                    io.to(`${eventId}_${roomName}`).emit('room-audience-count', stats.roomCounts[roomName]);
                }
                emitMasterData();
                markStatsDirty(eventId);
            }
            
            const isolatedRoom = `${eventId}_${roomName}`;
            if (questionQueues.has(isolatedRoom)) {
                let queue = questionQueues.get(isolatedRoom);
                const wasInQueue = queue.some(q => q.socketId === socketInstance.id);
                if (wasInQueue) {
                    queue = queue.filter(q => q.socketId !== socketInstance.id);
                    questionQueues.set(isolatedRoom, queue);
                    io.to(`event_admin_${eventId}`).emit('qa-queue-updated', { roomName, queue });
                    io.to(`speaker_${isolatedRoom}`).emit('qa-queue-updated', { roomName, queue });
                }
            }

            socketInstance.audienceData = null; 
        }
    };

    socket.on('leave-event-audience', () => {
        cleanupQaAudio(); 
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
        
        cleanupQaAudio(); 
        removeAudienceFromStats(socket);
    });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    console.log(`=========================================`);
    console.log(`🚀 Servidor SaaS blindado y analítico en puerto ${PORT}`);
    console.log(`=========================================`);
});