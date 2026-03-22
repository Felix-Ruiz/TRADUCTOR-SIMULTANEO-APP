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

const eventsDB = new Map();
const statsDB = new Map(); 

const initEventStats = (eventId) => {
    if (!statsDB.has(eventId)) {
        statsDB.set(eventId, { 
            total: 0, 
            langs: { es: 0, en: 0, de: 0, fr: 0, pt: 0 },
            roomCounts: {} 
        });
    }
};

// Evento por defecto (Ahora incluye adminPassword)
eventsDB.set("DEFAULT", {
    id: "DEFAULT",
    name: "Evento Principal (Por Defecto)",
    adminPassword: process.env.VITE_EVENT_ADMIN_PASSWORD || "admin-evento-123", // Llave del Cliente
    password: process.env.VITE_ADMIN_PASSWORD || "admin123", // Llave del Orador
    rooms: ["PRINCIPAL"],
    isActive: true,
    logoUrl: "", 
    sponsorText: "" 
});
initEventStats("DEFAULT");

const MASTER_PASSWORD = process.env.MASTER_PASSWORD || "superadmin123";
const activeSpeakerRooms = new Map();

const broadcastActiveRoomsToEvent = (eventId) => {
    const eventRoomsMap = activeSpeakerRooms.get(eventId);
    const rooms = eventRoomsMap ? Array.from(eventRoomsMap.keys()) : [];
    io.to(`audience_${eventId}`).emit('active-rooms', rooms);
};

// Modificado: Ahora le avisa al Master Y al Cliente de ese evento al mismo tiempo
const emitMasterData = () => {
    const eventsArray = Array.from(eventsDB.values()).map(event => {
        const eventWithStats = {
            ...event,
            stats: statsDB.get(event.id) || { total: 0, langs: { es: 0, en: 0, de: 0, fr: 0, pt: 0 }, roomCounts: {} }
        };
        // Magia SaaS: Mantener actualizado el panel privado del cliente en tiempo real
        io.to(`event_admin_${event.id}`).emit('event-admin-data-updated', eventWithStats);
        return eventWithStats;
    });
    io.emit('master-data-updated', eventsArray);
};

// Utilidad para notificar a la audiencia de un evento si cambian sus salas o estado
const broadcastEventInfoToAudience = (event) => {
    io.to(`audience_${event.id}`).emit('event-info', { 
        name: event.name, allRooms: event.rooms, isActive: event.isActive, 
        logoUrl: event.logoUrl, sponsorText: event.sponsorText 
    });
};

app.get('/api/status', (req, res) => {
    res.status(200).json({ status: 'online', message: 'Servidor SaaS activo, blindado y analítico.' });
});

io.on('connection', (socket) => {
    console.log(`[+] Dispositivo conectado: ${socket.id}`);
    socket.emit('system-status', isSystemActive);

    let translationService = null;

    // ==========================================
    // RUTAS MASTER (DUEÑO DE LA PLATAFORMA)
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

    socket.on('master-create-event', (data, callback) => {
        const publicId = Math.random().toString(36).slice(-6).toUpperCase();
        const secretSpeakerPassword = Math.random().toString(36).slice(-6).toUpperCase();
        const secretAdminPassword = Math.random().toString(36).slice(-8).toUpperCase(); // NUEVO: Llave Cliente
        
        const newEvent = {
            id: publicId,
            name: data.name,
            adminPassword: secretAdminPassword, // Asignada
            password: secretSpeakerPassword,
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
            broadcastEventInfoToAudience(event);
        } else {
            callback({ success: false });
        }
    });

    socket.on('master-delete-room', (data, callback) => {
        const event = eventsDB.get(data.id);
        if (event) {
            event.rooms = event.rooms.filter(r => r !== data.room);
            const stats = statsDB.get(data.id);
            if (stats && stats.roomCounts && stats.roomCounts[data.room]) {
                delete stats.roomCounts[data.room];
            }
            callback({ success: true });
            emitMasterData();
            broadcastEventInfoToAudience(event);
        } else {
            callback({ success: false });
        }
    });

    // ==========================================
    // NUEVO: RUTAS ADMIN DE EVENTO (EL CLIENTE)
    // ==========================================
    socket.on('event-admin-login', (pwd, callback) => {
        let foundEvent = null;
        for (const event of eventsDB.values()) {
            // Verifica la llave exclusiva del cliente
            if (event.adminPassword === pwd) {
                foundEvent = event;
                break;
            }
        }
        if (foundEvent) {
            // Lo encierra en un "cuarto" virtual solo para recibir alertas de su evento
            socket.join(`event_admin_${foundEvent.id}`);
            callback({ 
                success: true, 
                isSystemActive,
                event: {
                    ...foundEvent,
                    stats: statsDB.get(foundEvent.id)
                } 
            });
        } else {
            callback({ success: false, message: "Clave de administrador de evento incorrecta." });
        }
    });

    socket.on('event-admin-toggle-event', (data, callback) => {
        const event = eventsDB.get(data.eventId);
        // Validar que realmente tiene la contraseña antes de dejarlo modificar
        if (event && event.adminPassword === data.adminPassword) {
            event.isActive = data.status;
            if (!event.isActive) {
                const eventRoomsMap = activeSpeakerRooms.get(data.eventId);
                if (eventRoomsMap) {
                    eventRoomsMap.clear();
                    broadcastActiveRoomsToEvent(data.eventId);
                }
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
            if (!event.rooms.includes(data.room)) event.rooms.push(data.room);
            callback({ success: true });
            emitMasterData();
            broadcastEventInfoToAudience(event);
        } else {
            callback({ success: false });
        }
    });

    socket.on('event-admin-delete-room', (data, callback) => {
        const event = eventsDB.get(data.eventId);
        if (event && event.adminPassword === data.adminPassword) {
            event.rooms = event.rooms.filter(r => r !== data.room);
            const stats = statsDB.get(data.eventId);
            if (stats && stats.roomCounts && stats.roomCounts[data.room]) {
                delete stats.roomCounts[data.room];
            }
            callback({ success: true });
            emitMasterData();
            broadcastEventInfoToAudience(event);
        } else {
            callback({ success: false });
        }
    });

    // ==========================================
    // RUTAS SPEAKER (ORADOR)
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

        const stats = statsDB.get(eventId);
        const audienceCount = stats?.roomCounts?.[roomName] || 0;
        socket.emit('room-audience-count', audienceCount);
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
            callback({ success: true, name: event.name, logoUrl: event.logoUrl, sponsorText: event.sponsorText });
        } else {
            callback({ success: false });
        }
    });

    socket.on('join-event-audience', (data) => {
        const { eventId, language } = data;
        socket.join(`audience_${eventId}`);
        
        socket.audienceData = { eventId, language: language || 'es', roomName: null };
        
        const stats = statsDB.get(eventId);
        if (stats) {
            stats.total += 1;
            if (stats.langs[socket.audienceData.language] !== undefined) {
                stats.langs[socket.audienceData.language] += 1;
            }
            emitMasterData(); 
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

        if (socket.audienceData && socket.audienceData.eventId === data.eventId) {
            const stats = statsDB.get(data.eventId);
            if (stats) {
                const oldRoom = socket.audienceData.roomName;
                if (oldRoom && stats.roomCounts[oldRoom] > 0) {
                    stats.roomCounts[oldRoom] -= 1;
                    io.to(`${data.eventId}_${oldRoom}`).emit('room-audience-count', stats.roomCounts[oldRoom]);
                }
                
                if (data.roomName !== 'NONE') {
                    if (stats.roomCounts[data.roomName] === undefined) {
                        stats.roomCounts[data.roomName] = 0;
                    }
                    stats.roomCounts[data.roomName] += 1;
                    io.to(`${data.eventId}_${data.roomName}`).emit('room-audience-count', stats.roomCounts[data.roomName]);
                }
                
                socket.audienceData.roomName = data.roomName;
                emitMasterData();
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
                if (roomName && stats.roomCounts[roomName] > 0) {
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