import React, { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import { Power, Plus, Trash2, Key, Copy, CheckCircle2, X, Users, AlertCircle, BarChart3, UserCog, LogOut, Activity, ExternalLink, MonitorPlay, Mic, Download, Scale, Hand, Square } from 'lucide-react';

const socket = io(import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001', { autoConnect: false });

const EventAdminView = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(sessionStorage.getItem('isEventAdminAuth') === 'true');
  const [passwordInput, setPasswordInput] = useState('');
  const [loginError, setLoginError] = useState('');
  const [isFetchingData, setIsFetchingData] = useState(sessionStorage.getItem('isEventAdminAuth') === 'true');

  const [isSystemActive, setIsSystemActive] = useState(false);
  const [eventData, setEventData] = useState(null);
  
  const [newRoomName, setNewRoomName] = useState('');
  const [isAddingRoom, setIsAddingRoom] = useState(false);
  const [copiedText, setCopiedText] = useState(null);

  const [qaQueues, setQaQueues] = useState({});

  const [dialogConfig, setDialogConfig] = useState({ isOpen: false, title: '', message: '', type: 'confirm', onConfirm: null, confirmStyle: '' });

  const openDialog = (title, message, type = 'confirm', onConfirm = null, confirmStyle = 'bg-primary hover:bg-blue-600 shadow-blue-500/25') => {
    setDialogConfig({ isOpen: true, title, message, type, onConfirm, confirmStyle });
  };
  const closeDialog = () => setDialogConfig(prev => ({ ...prev, isOpen: false }));

  useEffect(() => {
    if (!isAuthenticated) return;
    
    const savedPwd = sessionStorage.getItem('eventAdminPwd');
    if (!savedPwd) {
        setIsAuthenticated(false);
        setIsFetchingData(false);
        return;
    }

    socket.connect();
    
    socket.emit('event-admin-login', savedPwd, (response) => {
      if (response.success) {
        setIsSystemActive(response.isSystemActive);
        setEventData(response.event);
        setIsFetchingData(false);
      } else {
        setIsAuthenticated(false);
        setEventData(null);
        sessionStorage.removeItem('isEventAdminAuth');
        sessionStorage.removeItem('eventAdminPwd');
        setIsFetchingData(false);
        socket.disconnect();
      }
    });

    socket.on('system-status', (status) => setIsSystemActive(status));
    
    socket.on('event-admin-data-updated', (updatedEvent) => {
        if (updatedEvent) setEventData(updatedEvent);
    });

    socket.on('qa-queue-updated', ({ roomName, queue }) => {
        setQaQueues(prev => ({ ...prev, [roomName]: queue }));
    });

    return () => {
        socket.off('system-status');
        socket.off('event-admin-data-updated');
        socket.off('qa-queue-updated');
        socket.disconnect();
    };
  }, [isAuthenticated]);

  useEffect(() => {
    if (eventData && isSystemActive) {
      const safeRooms = eventData.rooms || [];
      safeRooms.forEach(room => {
        socket.emit('qa-get-queue', { eventId: eventData.id, roomName: room.name });
      });
    }
  }, [eventData, isSystemActive]);

  const handleLogin = (e) => {
    e.preventDefault();
    socket.connect();
    setIsFetchingData(true);
    socket.emit('event-admin-login', passwordInput.trim(), (response) => {
      if (response.success) {
        setIsSystemActive(response.isSystemActive);
        setEventData(response.event);
        setIsAuthenticated(true);
        sessionStorage.setItem('isEventAdminAuth', 'true');
        sessionStorage.setItem('eventAdminPwd', passwordInput.trim());
        setLoginError('');
        setIsFetchingData(false);
      } else {
        setLoginError(response.message || 'Clave de administrador de evento incorrecta.');
        setPasswordInput('');
        setIsFetchingData(false);
        socket.disconnect();
      }
    });
  };

  const handleLogout = () => {
    openDialog(
      "Cerrar Sesión", 
      "¿Deseas salir del panel de administración de tu evento?", 
      "confirm", 
      () => {
        setIsAuthenticated(false);
        setEventData(null);
        setQaQueues({});
        sessionStorage.removeItem('isEventAdminAuth');
        sessionStorage.removeItem('eventAdminPwd');
        socket.disconnect();
      }
    );
  };

  const toggleEventStatus = () => {
    if (!eventData) return;
    const newStatus = !eventData.isActive;
    if (!newStatus) {
      openDialog(
        "Pausar Evento", 
        "¿Seguro que deseas pausar tu evento? Todas tus salas se silenciarán y la audiencia quedará en espera.", 
        "confirm", 
        () => socket.emit('event-admin-toggle-event', { eventId: eventData.id, adminPassword: sessionStorage.getItem('eventAdminPwd'), status: newStatus }, () => {}),
        "bg-red-600 hover:bg-red-700 shadow-red-500/25"
      );
    } else {
      socket.emit('event-admin-toggle-event', { eventId: eventData.id, adminPassword: sessionStorage.getItem('eventAdminPwd'), status: newStatus }, () => {});
    }
  };

  const toggleRoomStatus = (roomName, currentStatus) => {
    if (!eventData) return;
    const newStatus = !currentStatus;
    if (!newStatus) {
      openDialog(
          "Pausar Sala Específica",
          `¿Seguro que deseas apagar la sala ${roomName}? La audiencia y el orador serán desconectados, pero las demás salas seguirán funcionando.`,
          "confirm",
          () => socket.emit('event-admin-toggle-room', { eventId: eventData.id, roomName, adminPassword: sessionStorage.getItem('eventAdminPwd'), status: newStatus }, () => {}),
          "bg-red-600 hover:bg-red-700 shadow-red-500/25"
      );
    } else {
        socket.emit('event-admin-toggle-room', { eventId: eventData.id, roomName, adminPassword: sessionStorage.getItem('eventAdminPwd'), status: newStatus }, () => {});
    }
  };

  // NUEVO: Función para que el Admin encienda/apague las preguntas
  const toggleRoomQaStatus = (roomName, currentQaStatus) => {
      if (!eventData) return;
      socket.emit('toggle-qa-status', { eventId: eventData.id, roomName, status: !currentQaStatus });
  };

  const handleAddRoom = (e) => {
    e.preventDefault();
    if (!newRoomName.trim() || !eventData) return;
    socket.emit('event-admin-add-room', { 
        eventId: eventData.id, 
        adminPassword: sessionStorage.getItem('eventAdminPwd'),
        room: newRoomName.toUpperCase().replace(/\s+/g, '-') 
    }, (response) => {
      if (response.success) {
        setNewRoomName('');
        setIsAddingRoom(false);
      }
    });
  };

  const handleDeleteRoom = (room) => {
    if (!eventData) return;
    openDialog(
      "Eliminar Sala", 
      `¿Seguro que deseas eliminar la sala ${room}?`, 
      "confirm", 
      () => socket.emit('event-admin-delete-room', { eventId: eventData.id, adminPassword: sessionStorage.getItem('eventAdminPwd'), room }, () => {}),
      "bg-red-600 hover:bg-red-700 shadow-red-500/25"
    );
  };

  const copyToClipboard = (text, type = 'text') => {
    navigator.clipboard.writeText(text);
    setCopiedText(text);
    setTimeout(() => setCopiedText(null), 2000);
  };

  const approveQaFloor = (roomName, targetSocketId) => {
      if (!eventData) return;
      socket.emit('qa-approve-floor', { eventId: eventData.id, roomName, targetSocketId });
  };

  const rejectQaFloor = (roomName, targetSocketId) => {
      if (!eventData) return;
      socket.emit('qa-reject-floor', { eventId: eventData.id, roomName, targetSocketId });
  };

  const downloadAnalytics = (event) => {
    const analytics = event.stats?.analytics || {};
    const safeRooms = event.rooms || [];
    
    let roomsHtml = '';
    if (safeRooms.length === 0) {
        roomsHtml = '<tr><td colspan="4" style="text-align: center; color: #6b7280; font-style: italic;">No se crearon salas para este evento.</td></tr>';
    } else {
        safeRooms.forEach(room => {
            const rName = room.name;
            const unique = analytics.uniqueByRoom?.[rName] || 0;
            const words = analytics.wordsByRoom?.[rName] || 0;
            const timeMs = analytics.timeByRoom?.[rName] || 0;
            const mins = Math.floor(timeMs / 60000);
            const secs = Math.floor((timeMs % 60000) / 1000);
            
            roomsHtml += `
                <tr>
                    <td style="font-weight: 700; color: #2563eb;">${rName}</td>
                    <td>${unique}</td>
                    <td>${words}</td>
                    <td>${mins} min ${secs} seg</td>
                </tr>
            `;
        });
    }

    let langsHtml = '';
    if (analytics.uniqueByLang && Object.keys(analytics.uniqueByLang).length > 0) {
        Object.entries(analytics.uniqueByLang).forEach(([lang, count]) => {
            langsHtml += `
                <div class="card text-center">
                    <div class="card-title">${lang.toUpperCase()}</div>
                    <div class="card-value">${count}</div>
                </div>
            `;
        });
    } else {
        langsHtml = '<p style="color: #6b7280; font-size: 14px;">No hay registros de idiomas.</p>';
    }

    const htmlContent = `
    <!DOCTYPE html>
    <html lang="es">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Reporte Analítico - ${event.name}</title>
        <style>
            body { font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1f2937; background-color: #f3f4f6; margin: 0; padding: 40px 20px; line-height: 1.5; }
            .container { max-width: 900px; margin: 0 auto; background: #ffffff; padding: 40px; border-radius: 12px; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1); }
            .header { border-bottom: 2px solid #e5e7eb; padding-bottom: 20px; margin-bottom: 30px; display: flex; justify-content: space-between; align-items: flex-end; }
            .title { font-size: 28px; font-weight: 800; color: #111827; margin: 0 0 8px 0; letter-spacing: -0.5px; }
            .subtitle { font-size: 13px; color: #6b7280; text-transform: uppercase; letter-spacing: 1px; font-weight: 600; }
            .badge { background: #eff6ff; color: #2563eb; padding: 6px 12px; border-radius: 20px; font-size: 12px; font-weight: 700; border: 1px solid #bfdbfe; display: inline-block;}
            .section-title { font-size: 18px; font-weight: 700; color: #374151; margin: 40px 0 20px 0; border-left: 4px solid #3b82f6; padding-left: 12px; }
            .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-bottom: 30px; }
            .card { background: #ffffff; padding: 24px; border-radius: 10px; border: 1px solid #e5e7eb; box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1); }
            .card-title { font-size: 12px; color: #6b7280; text-transform: uppercase; font-weight: 700; margin-bottom: 8px; letter-spacing: 0.5px; }
            .card-value { font-size: 32px; font-weight: 800; color: #111827; line-height: 1; }
            table { width: 100%; border-collapse: collapse; margin-top: 10px; background: #ffffff; border-radius: 8px; overflow: hidden; border: 1px solid #e5e7eb; }
            th, td { padding: 16px 20px; text-align: left; }
            th { background: #f9fafb; font-size: 12px; font-weight: 700; color: #4b5563; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid #e5e7eb; }
            td { border-bottom: 1px solid #f3f4f6; font-size: 14px; color: #374151; }
            tr:last-child td { border-bottom: none; }
            tr:hover { background-color: #f9fafb; }
            .text-center { text-align: center; }
            .footer { margin-top: 50px; text-align: center; font-size: 12px; color: #9ca3af; padding-top: 20px; border-top: 1px solid #e5e7eb; }
            .print-btn { background: #3b82f6; color: white; border: none; padding: 10px 20px; border-radius: 6px; font-weight: bold; cursor: pointer; display: block; margin: 0 auto 30px auto; font-size: 14px; box-shadow: 0 4px 6px rgba(59, 130, 246, 0.25); }
            .print-btn:hover { background: #2563eb; }
            @media print {
                body { background: white; padding: 0; }
                .container { box-shadow: none; border: none; padding: 0; max-width: 100%; }
                .print-btn { display: none; }
            }
        </style>
    </head>
    <body>
        <div class="container">
            <button class="print-btn" onclick="window.print()">Guardar como PDF / Imprimir</button>
            <div class="header">
                <div>
                    <h1 class="title">${event.name}</h1>
                    <div class="subtitle">Reporte Oficial de Analíticas</div>
                </div>
                <div style="text-align: right;">
                    <div class="badge">ID: ${event.id}</div>
                    <div style="font-size: 12px; color: #6b7280; margin-top: 8px;">Generado: ${new Date().toLocaleDateString()}</div>
                </div>
            </div>

            <div class="section-title">Resumen de Impacto</div>
            <div class="grid">
                <div class="card">
                    <div class="card-title">Oyentes Únicos Totales</div>
                    <div class="card-value" style="color: #3b82f6;">${analytics.totalUnique || 0}</div>
                </div>
                <div class="card">
                    <div class="card-title">Salas Creadas</div>
                    <div class="card-value">${safeRooms.length}</div>
                </div>
            </div>

            <div class="section-title">Métricas Detalladas por Sala</div>
            <table>
                <thead>
                    <tr>
                        <th>Nombre de Sala</th>
                        <th>Usuarios Únicos</th>
                        <th>Palabras Procesadas</th>
                        <th>Tiempo de Transmisión</th>
                    </tr>
                </thead>
                <tbody>
                    ${roomsHtml}
                </tbody>
            </table>

            <div class="section-title">Distribución por Idiomas</div>
            <div class="grid" style="grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));">
                ${langsHtml}
            </div>

            <div class="footer">
                Documento generado automáticamente por el Panel de Administración de Evento.<br>
                Este reporte contiene datos consolidados de conexiones únicas.
            </div>
        </div>
    </body>
    </html>
    `;

    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Reporte_${event.name.replace(/\s+/g, '_')}.html`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (isFetchingData) {
    return (
      <div className="flex flex-col h-screen w-full items-center justify-center p-6 bg-darker">
        <div className="flex flex-col items-center gap-6 animate-pulse">
          <img src="/logo.png" alt="Logo" className="h-14 w-auto object-contain drop-shadow-lg" onError={(e) => { e.target.style.display = 'none'; }} />
          <div className="w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-gray-500 text-sm font-semibold tracking-widest uppercase text-center">Cargando panel de cliente...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex flex-col h-screen w-full items-center justify-center p-4 sm:p-6 bg-black">
        <div className="bg-darker border border-purple-900/30 p-6 sm:p-8 rounded-3xl shadow-2xl shadow-purple-900/10 max-w-md w-full flex flex-col items-center gap-6 text-center">
          <div className="bg-purple-500/10 p-5 rounded-full">
            <UserCog className="w-10 h-10 text-purple-500" />
          </div>
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-white mb-2 tracking-widest uppercase">Admin de Evento</h2>
            <p className="text-gray-400 text-sm leading-relaxed">Ingresa la clave administrativa proporcionada por el organizador.</p>
          </div>
          <form onSubmit={handleLogin} className="w-full flex flex-col gap-4 mt-2">
            <input
              type="password"
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
              placeholder="Clave Administrativa"
              className="w-full bg-black border border-gray-800 text-purple-500 text-lg sm:text-xl rounded-xl p-4 focus:ring-2 focus:ring-purple-500 focus:outline-none text-center tracking-widest transition-all"
            />
            {loginError && <p className="text-red-500 text-xs font-semibold animate-pulse">{loginError}</p>}
            <button
              type="submit"
              className="w-full bg-purple-600 hover:bg-purple-700 text-white px-6 py-4 rounded-xl font-bold transition-all shadow-lg hover:shadow-purple-500/25 mt-2 tracking-widest uppercase"
            >
              Acceder al Panel
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (!eventData) return null;

  const safeRooms = eventData.rooms || [];
  const safeStats = eventData.stats || { total: 0, langs: {}, roomCounts: {} };

  return (
    <div className="flex flex-col h-screen w-full p-4 md:p-8 max-w-5xl mx-auto overflow-hidden bg-darker relative">
      
      <style>
        {`
          @keyframes shine {
            0% { background-position: 0% 50%; }
            50% { background-position: 100% 50%; }
            100% { background-position: 0% 50%; }
          }
          @keyframes logo-glow {
            0%, 100% { filter: drop-shadow(0 0 8px rgba(168,85,247,0.5)); transform: scale(1); }
            50% { filter: drop-shadow(0 0 20px rgba(59,130,246,0.9)); transform: scale(1.03); }
          }
          .animate-metallic {
            background: linear-gradient(90deg, #d97743, #60a5fa, #e7e5e4, #d97743);
            background-size: 300% auto;
            color: transparent;
            -webkit-background-clip: text;
            background-clip: text;
            animation: shine 4s linear infinite;
          }
          .animate-logo-pulse {
            animation: logo-glow 3s ease-in-out infinite;
          }
        `}
      </style>

      {dialogConfig.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm transition-opacity">
          <div className="bg-darker border border-gray-700 p-6 rounded-3xl shadow-[0_0_40px_rgba(0,0,0,0.5)] max-w-sm w-full flex flex-col gap-2 transform transition-all scale-100">
            <div className="flex items-center gap-3 mb-2">
               <AlertCircle className={`w-7 h-7 ${dialogConfig.type === 'alert' ? 'text-yellow-500' : 'text-red-500'}`} />
               <h3 className="text-lg sm:text-xl font-bold text-white tracking-wide">{dialogConfig.title}</h3>
            </div>
            <p className="text-gray-400 text-sm leading-relaxed mb-4">{dialogConfig.message}</p>
            <div className="flex flex-col sm:flex-row justify-end gap-3 mt-2">
              {dialogConfig.type === 'confirm' && (
                <button onClick={closeDialog} className="w-full sm:w-auto px-5 py-2.5 rounded-xl text-gray-400 hover:bg-gray-800 hover:text-white transition-colors text-sm font-bold tracking-wide">
                  Cancelar
                </button>
              )}
              <button 
                onClick={() => { if(dialogConfig.onConfirm) dialogConfig.onConfirm(); closeDialog(); }} 
                className={`w-full sm:w-auto px-5 py-2.5 rounded-xl text-white text-sm font-bold tracking-wide transition-all shadow-lg ${dialogConfig.confirmStyle}`}
              >
                {dialogConfig.type === 'alert' ? 'Entendido' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}

      <header className="flex flex-col md:flex-row justify-between items-center md:items-start gap-4 mb-6 sm:mb-8 shrink-0 bg-dark p-4 sm:p-6 rounded-2xl border border-gray-800 shadow-xl text-center md:text-left">
        <div className="flex flex-col sm:flex-row items-center gap-3 sm:gap-4 w-full md:w-auto">
          {eventData.logoUrl ? (
             <div className="bg-white/5 p-2 sm:p-2.5 rounded-xl flex items-center justify-center w-14 h-14 shrink-0">
                <img src={eventData.logoUrl} alt="Logo" className="max-w-full max-h-full object-contain animate-logo-pulse" onError={(e) => { e.target.style.display = 'none'; }} />
             </div>
          ) : (
             <div className="bg-purple-500/10 p-3 rounded-xl shrink-0">
               <UserCog className="w-8 h-8 text-purple-500" />
             </div>
          )}
          <div className="flex flex-col flex-1 w-full sm:w-auto overflow-hidden text-center sm:text-left">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white uppercase break-words">{eventData.name}</h1>
            <div className="text-xs text-gray-500 font-bold tracking-widest flex flex-col sm:flex-row items-center sm:items-start gap-2 sm:gap-3 mt-1.5 sm:mt-1 w-full justify-center md:justify-start">
               <span>PANEL ADMINISTRATIVO</span>
               {eventData.sponsorText && <span className="hidden sm:inline">•</span>}
               {eventData.sponsorText && <span className="animate-metallic font-extrabold tracking-widest drop-shadow-md text-sm">{eventData.sponsorText}</span>}
               {!isSystemActive && (
                   <span className="text-red-500 animate-pulse bg-red-500/10 px-2 py-0.5 rounded border border-red-500/20 whitespace-nowrap">SISTEMA CENTRAL OFFLINE</span>
               )}
            </div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto justify-center md:justify-end">
            <button 
            onClick={toggleEventStatus}
            disabled={!isSystemActive}
            className={`flex items-center justify-center gap-2 px-5 py-3 rounded-xl font-bold text-xs uppercase tracking-widest transition-all shadow-lg w-full sm:w-auto shrink-0 ${
                !isSystemActive 
                  ? 'bg-gray-800 text-gray-500 cursor-not-allowed border border-gray-700'
                  : eventData.isActive 
                  ? 'bg-green-500/10 text-green-500 border border-green-500/20 hover:bg-green-500 hover:text-white hover:shadow-green-500/25' 
                  : 'bg-red-500 text-white border border-red-500 hover:bg-red-600 shadow-red-500/25 animate-pulse'
            }`}
            >
            <Power className="w-4 h-4 shrink-0" />
            <span>{eventData.isActive ? 'Evento En Vivo' : 'Evento Pausado'}</span>
            </button>

            <button 
                onClick={() => downloadAnalytics(eventData)}
                className="flex items-center justify-center gap-2 px-5 py-3 rounded-xl font-bold text-xs uppercase tracking-widest transition-all shadow-lg w-full sm:w-auto shrink-0 bg-blue-500/10 text-blue-500 hover:bg-blue-500 hover:text-white border border-blue-500/20 hover:border-blue-500 shadow-blue-500/10"
                title="Descargar Reporte Analytics (PDF)"
            >
                <Download className="w-4 h-4 shrink-0" />
                <span>Reporte PDF</span>
            </button>
            
            <button onClick={handleLogout} className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-3 sm:p-3 bg-gray-800 text-gray-400 hover:text-red-500 hover:bg-red-500/10 rounded-xl transition-colors shrink-0">
                <LogOut className="w-4 h-4 sm:w-5 sm:h-5 shrink-0" />
                <span className="sm:hidden text-xs font-bold uppercase tracking-widest">Cerrar Sesión</span>
            </button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto pr-1 sm:pr-2 flex flex-col gap-6">

        <div className="bg-gradient-to-br from-gray-900 to-black p-4 sm:p-6 rounded-2xl border border-gray-800 shadow-xl flex flex-col lg:flex-row gap-6 items-center justify-between shrink-0">
            <div className="flex flex-col sm:flex-row items-center sm:items-start gap-3 sm:gap-4 w-full lg:w-auto text-center sm:text-left">
                <div className="bg-primary/10 p-3 sm:p-3.5 rounded-xl border border-primary/20 shrink-0">
                    <BarChart3 className="w-6 h-6 sm:w-8 sm:h-8 text-primary" />
                </div>
                <div>
                    <span className="text-[10px] sm:text-xs font-bold text-gray-500 uppercase tracking-widest block mb-1">Audiencia Activa Total</span>
                    <span className="text-3xl sm:text-4xl font-bold text-white leading-none">{safeStats.total || 0} <span className="text-sm sm:text-base font-medium text-gray-500">en vivo</span></span>
                </div>
            </div>
            
            <div className="flex gap-2 flex-wrap justify-center lg:justify-end w-full lg:w-auto">
                {['en', 'pt', 'es', 'de', 'fr'].map(lang => {
                    if (safeStats.langs && safeStats.langs[lang] > 0) {
                        return (
                            <div key={lang} className="bg-gray-800/80 border border-gray-700 px-3 py-1.5 rounded-lg flex items-center gap-2">
                                <span className="text-[10px] font-bold text-gray-400 uppercase">{lang}</span>
                                <span className="text-sm font-bold text-white">{safeStats.langs[lang]}</span>
                            </div>
                        )
                    }
                    return null;
                })}
            </div>
        </div>

        <div className="bg-dark border border-gray-800 rounded-2xl p-4 sm:p-6 shadow-xl flex-1 flex flex-col min-h-[300px] mb-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4 sm:mb-6 pb-4 border-b border-gray-800">
                <h2 className="text-sm font-bold text-white uppercase tracking-widest flex items-center gap-2 w-full sm:w-auto">
                    <Activity className="w-4 h-4 text-primary shrink-0" />
                    Gestión de Salas ({safeRooms.length})
                </h2>
                <button 
                    onClick={() => setIsAddingRoom(!isAddingRoom)}
                    className="w-full sm:w-auto flex justify-center text-xs font-bold text-primary hover:text-blue-400 transition-colors uppercase disabled:opacity-50 items-center gap-1.5 bg-primary/10 px-4 py-2 sm:py-1.5 rounded-lg"
                    disabled={!isSystemActive || !eventData.isActive}
                >
                    {isAddingRoom ? <X className="w-3 h-3 shrink-0" /> : <Plus className="w-3 h-3 shrink-0" />}
                    <span>{isAddingRoom ? 'Cancelar' : 'Crear Sala'}</span>
                </button>
            </div>

            {isAddingRoom && isSystemActive && eventData.isActive && (
            <form onSubmit={handleAddRoom} className="mb-6 flex flex-col sm:flex-row gap-2 sm:gap-3 bg-black/40 p-3 sm:p-4 rounded-xl border border-gray-800">
                <input 
                type="text"
                value={newRoomName}
                onChange={(e) => setNewRoomName(e.target.value)}
                placeholder="Nombre de la sala (Ej: TALLER-A)"
                className="w-full sm:flex-1 bg-darker border border-gray-700 text-white text-sm uppercase tracking-widest rounded-xl px-4 py-3 focus:ring-2 focus:ring-primary focus:outline-none"
                autoFocus
                />
                <button type="submit" disabled={!newRoomName.trim()} className="w-full sm:w-auto bg-primary hover:bg-blue-600 text-white px-6 py-3 rounded-xl text-sm font-bold uppercase tracking-widest transition-colors disabled:opacity-50 shadow-lg">Agregar</button>
            </form>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 overflow-y-auto pb-4">
            {safeRooms.map(roomObj => {
                const roomQueue = qaQueues[roomObj.name] || [];
                const pendingRequests = roomQueue.filter(q => q.status === 'pending');
                const approvedRequest = roomQueue.find(q => q.status === 'approved');

                return (
                <div key={roomObj.name} className={`flex flex-col bg-darker p-4 sm:p-5 rounded-xl border border-gray-700 relative group transition-all hover:border-gray-500 shadow-md ${roomObj.isActive === false ? 'opacity-60 grayscale border-red-900/50' : ''}`}>
                    <h3 className="text-base font-bold text-white uppercase tracking-wider mb-3 sm:mb-4 pr-16 break-words leading-tight">
                        {roomObj.name}
                        {roomObj.isActive === false && <span className="text-red-500 text-[10px] ml-2 bg-red-500/10 px-1.5 py-0.5 rounded border border-red-500/20">(PAUSADA)</span>}
                    </h3>
                    
                    <div className="grid grid-cols-1 xs:grid-cols-2 gap-2 sm:gap-3 mb-4 sm:mb-5">
                        <div className="bg-primary/10 border border-primary/20 rounded-lg p-2.5 sm:p-3 flex flex-col justify-center shadow-inner">
                            <span className="text-[10px] text-primary font-bold uppercase tracking-widest flex items-center gap-1.5 mb-1.5"><Key className="w-3 h-3 shrink-0"/> Clave Orador</span>
                            <div className="flex items-center justify-between bg-black/20 p-1.5 rounded sm:bg-transparent sm:p-0">
                                <span className="text-white font-mono text-sm font-bold tracking-widest">{roomObj.speakerPassword}</span>
                                <button onClick={() => copyToClipboard(roomObj.speakerPassword)} className="text-primary hover:text-white transition-colors p-1 sm:p-0">
                                    {copiedText === roomObj.speakerPassword ? <CheckCircle2 className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                                </button>
                            </div>
                        </div>

                        <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-2.5 sm:p-3 flex flex-col justify-center shadow-inner">
                            <span className="text-[10px] text-gray-400 font-bold uppercase tracking-widest flex items-center gap-1.5 mb-1.5"><Users className="w-3 h-3 shrink-0"/> Cód. Audiencia</span>
                            <div className="flex items-center justify-between bg-black/20 p-1.5 rounded sm:bg-transparent sm:p-0">
                                <span className="text-white font-mono text-sm font-bold tracking-widest">{roomObj.audienceCode}</span>
                                <button onClick={() => copyToClipboard(roomObj.audienceCode)} className="text-gray-400 hover:text-white transition-colors p-1 sm:p-0">
                                    {copiedText === roomObj.audienceCode ? <CheckCircle2 className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* PANEL DE PREGUNTAS (Q&A) INTEGRADO */}
                    {isSystemActive && eventData.isActive && roomObj.isActive !== false && (
                        <div className="mb-4 flex flex-col gap-2">
                            <div className="flex items-center justify-between border-t border-gray-800 pt-3 mb-1">
                                <span className="text-[10px] text-gray-500 font-bold uppercase tracking-widest flex items-center gap-1.5">
                                    <Hand className="w-3 h-3 text-blue-500" /> Moderación Q&A
                                </span>
                                <button 
                                    onClick={() => toggleRoomQaStatus(roomObj.name, roomObj.isQaActive)}
                                    className={`text-[10px] font-bold uppercase px-2 py-1 rounded-md transition-colors ${roomObj.isQaActive ? 'bg-blue-500/20 text-blue-400 hover:bg-blue-500 hover:text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}
                                >
                                    {roomObj.isQaActive ? 'Desactivar Preguntas' : 'Activar Preguntas'}
                                </button>
                            </div>

                            {roomObj.isQaActive ? (
                                <>
                                    {approvedRequest && (
                                        <div className="bg-blue-900/30 border border-blue-500/50 rounded-lg p-3 flex items-center justify-between shadow-inner mb-2">
                                            <div className="flex items-center gap-3">
                                               <div className="bg-blue-500/20 p-1.5 rounded-full animate-pulse">
                                                 <Mic className="w-4 h-4 text-blue-400" />
                                               </div>
                                               <div className="flex flex-col">
                                                   <span className="text-[10px] text-blue-300 font-bold uppercase tracking-widest">Transmitiendo: Público</span>
                                                   <span className="text-sm text-white font-bold">{approvedRequest.name} {approvedRequest.location ? `(${approvedRequest.location})` : ''}</span>
                                               </div>
                                            </div>
                                            <button 
                                              onClick={() => rejectQaFloor(roomObj.name, approvedRequest.socketId)} 
                                              className="bg-red-500/20 hover:bg-red-500 text-red-400 hover:text-white p-2 rounded-lg transition-colors border border-red-500/30" 
                                              title="Quitar palabra"
                                            >
                                                <Square className="w-4 h-4 fill-current" />
                                            </button>
                                        </div>
                                    )}

                                    {pendingRequests.length > 0 && !approvedRequest && (
                                        <div className="flex flex-col gap-2 max-h-[120px] overflow-y-auto">
                                            {pendingRequests.map(req => (
                                                <div key={req.socketId} className="bg-black/30 border border-gray-700 rounded-lg p-2.5 flex items-center justify-between shadow-sm">
                                                    <div className="flex flex-col">
                                                        <span className="text-xs text-white font-bold">{req.name} {req.location ? `(${req.location})` : ''}</span>
                                                        <span className="text-[10px] text-gray-500 font-bold uppercase">Idioma: {req.language}</span>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <button 
                                                          onClick={() => approveQaFloor(roomObj.name, req.socketId)} 
                                                          className="bg-green-500/10 hover:bg-green-500 text-green-500 hover:text-white border border-green-500/20 px-3 py-1.5 rounded-md transition-colors text-[10px] font-bold uppercase tracking-widest flex items-center gap-1"
                                                        >
                                                            <CheckCircle2 className="w-3 h-3" /> Dar Palabra
                                                        </button>
                                                        <button 
                                                          onClick={() => rejectQaFloor(roomObj.name, req.socketId)} 
                                                          className="bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white border border-red-500/20 p-1.5 rounded-md transition-colors" 
                                                          title="Rechazar"
                                                        >
                                                            <X className="w-4 h-4" />
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                    {pendingRequests.length === 0 && !approvedRequest && (
                                        <div className="text-center py-2 text-gray-500 text-xs italic">
                                            Esperando participantes...
                                        </div>
                                    )}
                                </>
                            ) : (
                                <div className="text-center py-2 text-gray-600 text-xs bg-black/20 rounded-lg border border-gray-800">
                                    Las preguntas del público están desactivadas.
                                </div>
                            )}
                        </div>
                    )}
                    {/* FIN Q&A */}

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-4 mt-auto">
                        <a 
                            href={`/admin?pwd=${roomObj.speakerPassword}`}
                            target="_blank"
                            rel="noreferrer"
                            className="w-full bg-primary/20 hover:bg-primary text-primary hover:text-white border border-primary/50 hover:border-primary px-2 py-2.5 sm:py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-colors flex justify-center items-center gap-1.5 text-center"
                        >
                            <Mic className="w-3.5 h-3.5 sm:w-3 sm:h-3 shrink-0" />
                            <span className="inline sm:hidden md:inline">Link Orador</span>
                            <span className="hidden sm:inline md:hidden">Orador</span>
                        </a>
                        <a 
                            href={`/?code=${roomObj.audienceCode}`}
                            target="_blank"
                            rel="noreferrer"
                            className="w-full bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white border border-gray-700 px-2 py-2.5 sm:py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-colors flex justify-center items-center gap-1.5 text-center"
                        >
                            <ExternalLink className="w-3.5 h-3.5 sm:w-3 sm:h-3 shrink-0" /> 
                            <span className="inline sm:hidden md:inline">Link Audiencia</span>
                            <span className="hidden sm:inline md:hidden">Audiencia</span>
                        </a>
                        <a 
                            href={`/?code=${roomObj.audienceCode}&tv=true&lang=es`}
                            target="_blank"
                            rel="noreferrer"
                            className="w-full bg-gray-800 hover:bg-primary/20 text-gray-300 hover:text-primary border border-gray-700 hover:border-primary/50 px-2 py-2.5 sm:py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-colors flex justify-center items-center gap-1.5 text-center"
                        >
                            <MonitorPlay className="w-3.5 h-3.5 sm:w-3 sm:h-3 shrink-0" /> 
                            TV (ES)
                        </a>
                    </div>

                    <div className="flex items-center justify-between pt-3 border-t border-gray-800/50">
                        <span className="bg-green-500/10 border border-green-500/20 text-green-400 px-3 py-1.5 rounded-lg text-[10px] sm:text-xs font-bold flex items-center gap-2 w-max">
                            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse shrink-0"></div>
                            <Users className="w-4 h-4 shrink-0 hidden sm:block" />
                            <span>{safeStats.roomCounts?.[roomObj.name] || 0} Usuarios en línea</span>
                        </span>
                    </div>

                    {isSystemActive && eventData.isActive && (
                        <>
                            <button 
                            onClick={() => toggleRoomStatus(roomObj.name, roomObj.isActive)}
                            className={`absolute top-3 right-12 sm:top-4 sm:right-14 p-1.5 sm:p-1.5 rounded-lg transition-colors bg-black/50 sm:bg-transparent sm:opacity-0 sm:group-hover:opacity-100 ${roomObj.isActive !== false ? 'text-green-500 hover:bg-green-500/10' : 'text-red-500 hover:text-white hover:bg-red-500/10'}`}
                            title={roomObj.isActive !== false ? "Pausar Sala Individual" : "Reactivar Sala Individual"}
                            >
                            <Power className="w-4 h-4" />
                            </button>

                            <button 
                            onClick={() => handleDeleteRoom(roomObj.name)}
                            className="absolute top-3 right-3 sm:top-4 sm:right-4 text-gray-500 hover:text-red-500 hover:bg-red-500/10 p-1.5 sm:p-1.5 rounded-lg transition-colors bg-black/50 sm:bg-transparent sm:opacity-0 sm:group-hover:opacity-100"
                            title="Eliminar Sala"
                            >
                            <Trash2 className="w-4 h-4" />
                            </button>
                        </>
                    )}
                </div>
            )})}
            {safeRooms.length === 0 && (
                <div className="col-span-full py-8 text-center text-gray-500 text-sm font-medium px-4">
                    No hay salas creadas. Usa el botón "Crear Sala" para comenzar.
                </div>
            )}
            </div>
        </div>

      </main>

      <div className="mt-4 mb-4 flex items-center justify-center gap-2 text-xs font-bold text-gray-600 tracking-widest uppercase opacity-60 shrink-0">
          <Scale className="w-4 h-4" />
          <span>© {new Date().getFullYear()} ACOFI TRANSLATOR • TODOS LOS DERECHOS RESERVADOS</span>
      </div>

    </div>
  );
};

export default EventAdminView;