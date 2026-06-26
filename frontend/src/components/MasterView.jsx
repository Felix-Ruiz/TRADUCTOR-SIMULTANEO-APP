import React, { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import { Shield, Power, Plus, Trash2, Key, Activity, Copy, CheckCircle2, X, Users, AlertCircle, BarChart3, Image as ImageIcon, Briefcase, UserCog, ExternalLink, MonitorPlay, Mic, Download, Cpu, Scale, Edit } from 'lucide-react';

const socket = io(import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001', { autoConnect: false });

const MasterView = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(sessionStorage.getItem('isMasterAuth') === 'true');
  const [passwordInput, setPasswordInput] = useState('');
  const [loginError, setLoginError] = useState('');
  const [isFetchingData, setIsFetchingData] = useState(sessionStorage.getItem('isMasterAuth') === 'true');

  const [isSystemActive, setIsSystemActive] = useState(false);
  const [events, setEvents] = useState([]);
  
  const [ramUsage, setRamUsage] = useState({ used: 0, max: 512, percent: 0 });
  
  const [newEventName, setNewEventName] = useState('');
  const [newLogos, setNewLogos] = useState([{ url: '', showOnMobile: false }]);
  const [newSponsorText, setNewSponsorText] = useState('');
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);

  // NUEVO: Estado para el evento que se está editando
  const [editingEvent, setEditingEvent] = useState(null);

  const [newRoomName, setNewRoomName] = useState('');
  const [selectedEventId, setSelectedEventId] = useState(null);
  const [copiedText, setCopiedText] = useState(null);

  const [dialogConfig, setDialogConfig] = useState({ isOpen: false, title: '', message: '', type: 'confirm', onConfirm: null, confirmStyle: '' });

  const openDialog = (title, message, type = 'confirm', onConfirm = null, confirmStyle = 'bg-primary hover:bg-blue-600 shadow-blue-500/25') => {
    setDialogConfig({ isOpen: true, title, message, type, onConfirm, confirmStyle });
  };
  const closeDialog = () => setDialogConfig(prev => ({ ...prev, isOpen: false }));

  useEffect(() => {
    if (!isAuthenticated) return;
    socket.connect();
    socket.emit('master-get-data', (data) => {
      setIsSystemActive(data.isSystemActive);
      setEvents(data.events || []);
      setIsFetchingData(false); 
    });
    socket.on('system-status', (status) => setIsSystemActive(status));
    socket.on('master-data-updated', (data) => {
        if (Array.isArray(data)) {
            setEvents(data);
        } else {
            setEvents(data.events || []);
        }
    });
    
    socket.on('master-ram-update', (ramStats) => {
        setRamUsage(ramStats);
    });

    return () => socket.disconnect();
  }, [isAuthenticated]);

  const handleLogin = (e) => {
    e.preventDefault();
    socket.connect();
    setIsFetchingData(true);
    socket.emit('master-login', passwordInput, (response) => {
      if (response.success) {
        setIsAuthenticated(true);
        sessionStorage.setItem('isMasterAuth', 'true');
        setLoginError('');
      } else {
        setLoginError(response.message || 'Credenciales maestras incorrectas.');
        setPasswordInput('');
        setIsFetchingData(false);
        socket.disconnect();
      }
    });
  };

  const toggleSystem = () => {
    const newStatus = !isSystemActive;
    if (!newStatus) {
      openDialog(
        "Apagar Central Principal", 
        "¡PELIGRO! Vas a apagar la central completa. Absolutamente todos los eventos caerán. ¿Continuar?", 
        "confirm", 
        () => {
          setIsSystemActive(newStatus);
          socket.emit('master-toggle-system', newStatus);
        },
        "bg-red-600 hover:bg-red-700 shadow-red-500/25"
      );
    } else {
      setIsSystemActive(newStatus);
      socket.emit('master-toggle-system', newStatus);
    }
  };

  const toggleEventStatus = (id, currentStatus) => {
    const newStatus = !currentStatus;
    if (!newStatus) {
      openDialog(
        "Pausar Evento", 
        "¿Seguro que deseas pausar este evento en específico? Los oradores y la audiencia serán desconectados.", 
        "confirm", 
        () => socket.emit('master-toggle-event', { id, status: newStatus }, () => {}),
        "bg-red-600 hover:bg-red-700 shadow-red-500/25"
      );
    } else {
      socket.emit('master-toggle-event', { id, status: newStatus }, () => {});
    }
  };

  const toggleRoomStatus = (eventId, roomName, currentStatus) => {
      const newStatus = !currentStatus;
      if (!newStatus) {
        openDialog(
            "Pausar Sala Específica",
            `¿Seguro que deseas apagar la sala ${roomName}? La audiencia y el orador serán desconectados, pero las demás salas seguirán funcionando.`,
            "confirm",
            () => socket.emit('master-toggle-room', { eventId, roomName, status: newStatus }, () => {}),
            "bg-red-600 hover:bg-red-700 shadow-red-500/25"
        );
      } else {
          socket.emit('master-toggle-room', { eventId, roomName, status: newStatus }, () => {});
      }
  };

  // LOGICA DE LOGOS (Para creación)
  const handleLogoChange = (index, value) => {
      const updated = [...newLogos];
      updated[index].url = value;
      setNewLogos(updated);
  };
  const toggleMobileLogo = (index) => {
      const updated = [...newLogos];
      const currentMobileCount = updated.filter(l => l.showOnMobile).length;
      if (!updated[index].showOnMobile && currentMobileCount >= 3) return;
      updated[index].showOnMobile = !updated[index].showOnMobile;
      setNewLogos(updated);
  };
  const addLogoField = () => {
      if (newLogos.length < 10) setNewLogos([...newLogos, { url: '', showOnMobile: false }]);
  };
  const removeLogoField = (index) => {
      setNewLogos(newLogos.filter((_, i) => i !== index));
  };

  // LOGICA DE LOGOS (Para edición)
  const handleEditLogoChange = (index, value) => {
      const updated = [...editingEvent.logos];
      updated[index].url = value;
      setEditingEvent({ ...editingEvent, logos: updated });
  };
  const toggleEditMobileLogo = (index) => {
      const updated = [...editingEvent.logos];
      const currentMobileCount = updated.filter(l => l.showOnMobile).length;
      if (!updated[index].showOnMobile && currentMobileCount >= 3) return;
      updated[index].showOnMobile = !updated[index].showOnMobile;
      setEditingEvent({ ...editingEvent, logos: updated });
  };
  const addEditLogoField = () => {
      if (editingEvent.logos.length < 10) {
          setEditingEvent({ ...editingEvent, logos: [...editingEvent.logos, { url: '', showOnMobile: false }] });
      }
  };
  const removeEditLogoField = (index) => {
      const updated = editingEvent.logos.filter((_, i) => i !== index);
      setEditingEvent({ ...editingEvent, logos: updated });
  };

  const openEditModal = (eventObj) => {
      // Normalizar logos viejos para el modal
      let normalizedLogos = [];
      if (eventObj.logos && eventObj.logos.length > 0) {
          normalizedLogos = JSON.parse(JSON.stringify(eventObj.logos));
      } else if (eventObj.logoUrl) {
          normalizedLogos = [{ url: eventObj.logoUrl, showOnMobile: true }];
      } else {
          normalizedLogos = [{ url: '', showOnMobile: false }];
      }

      setEditingEvent({
          id: eventObj.id,
          name: eventObj.name,
          sponsorText: eventObj.sponsorText || '',
          logos: normalizedLogos
      });
  };

  const handleSaveEdit = (e) => {
      e.preventDefault();
      if (!editingEvent.name.trim()) return;

      const validLogos = editingEvent.logos.filter(l => l.url.trim() !== '');

      socket.emit('master-edit-event', {
          id: editingEvent.id,
          name: editingEvent.name,
          logos: validLogos,
          sponsorText: editingEvent.sponsorText
      }, (response) => {
          if (response.success) {
              setEditingEvent(null);
          }
      });
  };

  const handleCreateEvent = (e) => {
    e.preventDefault();
    if (!newEventName.trim()) return;
    
    const validLogos = newLogos.filter(l => l.url.trim() !== '');

    socket.emit('master-create-event', { 
        name: newEventName,
        logoUrl: validLogos.length > 0 ? validLogos[0].url : '', 
        logos: validLogos, 
        sponsorText: newSponsorText
    }, (response) => {
      if (response.success) {
          setNewEventName('');
          setNewLogos([{ url: '', showOnMobile: false }]);
          setNewSponsorText('');
          setIsAdvancedOpen(false);
      }
    });
  };

  const handleDeleteEvent = (id) => {
    openDialog(
      "Eliminar Evento", 
      "¿Deseas eliminar este evento y todas sus salas de forma permanente? Esta acción no se puede deshacer.", 
      "confirm", 
      () => socket.emit('master-delete-event', id, () => {}),
      "bg-red-600 hover:bg-red-700 shadow-red-500/25"
    );
  };

  const handleAddRoom = (e, id) => {
    e.preventDefault();
    if (!newRoomName.trim()) return;
    socket.emit('master-add-room', { 
        id: id, 
        room: newRoomName.toUpperCase().replace(/\s+/g, '-') 
    }, (response) => {
      if (response.success) {
        setNewRoomName('');
        setSelectedEventId(null);
      }
    });
  };

  const handleDeleteRoom = (id, room) => {
    openDialog(
      "Eliminar Sala", 
      `¿Seguro que deseas eliminar la sala ${room} de este evento?`, 
      "confirm", 
      () => socket.emit('master-delete-room', { id, room }, () => {}),
      "bg-red-600 hover:bg-red-700 shadow-red-500/25"
    );
  };

  const handleOptimizeRoom = (eventId, roomName) => {
    openDialog(
      "Optimizar Sala (Load Shedding)", 
      `El servidor expulsará silenciosamente al 50% de la audiencia móvil en la sala ${roomName} para liberar RAM. Las TVs y Oradores no se verán afectados. ¿Proceder?`, 
      "confirm", 
      () => socket.emit('master-optimize-room', { eventId, roomName }, () => {}),
      "bg-yellow-600 hover:bg-yellow-700 shadow-yellow-500/25 text-white"
    );
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    setCopiedText(text);
    setTimeout(() => setCopiedText(null), 2000);
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
                Documento generado automáticamente por el Panel Master de Traducción Simultánea.<br>
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
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
          <p className="text-gray-500 text-sm font-semibold tracking-widest uppercase text-center">Restaurando sesión maestra...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex flex-col h-screen w-full items-center justify-center p-4 sm:p-6 bg-black">
        <div className="bg-darker border border-red-900/30 p-6 sm:p-8 rounded-3xl shadow-2xl max-w-md w-full flex flex-col items-center gap-6 text-center">
          <div className="bg-red-500/10 p-5 rounded-full">
            <Shield className="w-10 h-10 text-red-500" />
          </div>
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-white mb-2 tracking-widest uppercase">Master Admin</h2>
            <p className="text-gray-400 text-sm leading-relaxed">Nivel de autorización máximo requerido.</p>
          </div>
          <form onSubmit={handleLogin} className="w-full flex flex-col gap-4 mt-2">
            <input
              type="password"
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
              placeholder="Clave Maestra"
              className="w-full bg-black border border-gray-800 text-red-500 text-lg sm:text-xl rounded-xl p-4 focus:ring-2 focus:ring-red-500 focus:outline-none text-center tracking-widest transition-all"
            />
            {loginError && <p className="text-red-500 text-xs font-semibold animate-pulse">{loginError}</p>}
            <button
              type="submit"
              className="w-full bg-red-600 hover:bg-red-700 text-white px-6 py-4 rounded-xl font-bold transition-all shadow-lg hover:shadow-red-500/25 mt-2 tracking-widest uppercase"
            >
              Autenticar
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen w-full p-4 sm:p-6 md:p-8 max-w-6xl mx-auto overflow-hidden bg-darker relative">
      
      {dialogConfig.isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm transition-opacity">
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

      {/* MODAL DE EDICIÓN DE EVENTO */}
      {editingEvent && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm transition-opacity">
          <div className="bg-dark border border-gray-700 p-6 rounded-3xl shadow-[0_0_50px_rgba(0,0,0,0.7)] max-w-2xl w-full flex flex-col gap-4 transform transition-all scale-100 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-2 border-b border-gray-800 pb-4">
               <h3 className="text-xl font-bold text-white tracking-wide flex items-center gap-2">
                   <Edit className="w-5 h-5 text-primary" /> Editar Evento
               </h3>
               <button onClick={() => setEditingEvent(null)} className="text-gray-500 hover:text-white transition-colors">
                   <X className="w-6 h-6" />
               </button>
            </div>
            
            <form onSubmit={handleSaveEdit} className="flex flex-col gap-5 mt-2">
                <div>
                    <label className="flex items-center gap-2 text-xs font-bold text-gray-500 mb-2 uppercase tracking-wider">Nombre del Cliente</label>
                    <input 
                        type="text" 
                        value={editingEvent.name} 
                        onChange={(e) => setEditingEvent({...editingEvent, name: e.target.value})} 
                        className="w-full bg-darker border border-gray-700 text-white text-base rounded-xl p-3 focus:ring-2 focus:ring-primary focus:outline-none transition-all" 
                    />
                </div>

                <div className="bg-black/30 p-4 rounded-xl border border-gray-800">
                    <label className="flex items-center justify-between text-xs font-bold text-gray-500 mb-3 uppercase tracking-wider">
                        <span className="flex items-center gap-2"><ImageIcon className="w-3 h-3"/> Logos Patrocinadores (Máx 10)</span>
                        <span className="text-gray-600 text-[9px]">* Máx 3 para móvil</span>
                    </label>
                    <div className="flex flex-col gap-2 max-h-48 overflow-y-auto pr-1 mb-3">
                        {editingEvent.logos.map((logo, index) => (
                            <div key={index} className="flex items-center gap-2">
                                <input 
                                    type="text" 
                                    value={logo.url} 
                                    onChange={(e) => handleEditLogoChange(index, e.target.value)} 
                                    placeholder="https://ejemplo.com/logo.png" 
                                    className="flex-1 bg-darker border border-gray-700 text-gray-300 text-sm rounded-lg p-2.5 focus:ring-1 focus:ring-primary focus:outline-none transition-all" 
                                />
                                <button 
                                    type="button" 
                                    onClick={() => toggleEditMobileLogo(index)} 
                                    disabled={!logo.showOnMobile && editingEvent.logos.filter(l => l.showOnMobile).length >= 3} 
                                    className={`p-2.5 rounded-lg text-sm transition-colors border ${logo.showOnMobile ? 'bg-primary/20 border-primary text-primary' : 'bg-darker border-gray-700 text-gray-500 hover:text-gray-300'}`} 
                                    title={logo.showOnMobile ? "Visible en Móvil" : "Destacar en Móvil"}
                                >
                                    📱
                                </button>
                                <button 
                                    type="button" 
                                    onClick={() => removeEditLogoField(index)} 
                                    className="p-2.5 bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white rounded-lg transition-colors border border-red-500/20"
                                    title="Eliminar logo"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>
                        ))}
                    </div>
                    {editingEvent.logos.length < 10 && (
                        <button 
                            type="button" 
                            onClick={addEditLogoField} 
                            className="w-full bg-darker border border-gray-700 hover:bg-gray-800 text-gray-400 text-xs font-bold py-2 rounded-lg transition-colors uppercase tracking-widest"
                        >
                            + Añadir otro logo
                        </button>
                    )}
                </div>

                <div>
                    <label className="flex items-center gap-2 text-xs font-bold text-gray-500 mb-2 uppercase tracking-wider"><Briefcase className="w-3 h-3"/> Texto de Patrocinador</label>
                    <input 
                        type="text" 
                        value={editingEvent.sponsorText} 
                        onChange={(e) => setEditingEvent({...editingEvent, sponsorText: e.target.value})} 
                        placeholder="Patrocinado por..." 
                        className="w-full bg-darker border border-gray-700 text-gray-300 text-sm rounded-lg p-3 focus:ring-1 focus:ring-primary focus:outline-none transition-all" 
                    />
                </div>

                <div className="flex flex-col sm:flex-row justify-end gap-3 mt-4 pt-4 border-t border-gray-800">
                    <button type="button" onClick={() => setEditingEvent(null)} className="px-6 py-3 rounded-xl text-gray-400 hover:bg-gray-800 hover:text-white transition-colors text-sm font-bold tracking-wide">
                        Cancelar
                    </button>
                    <button type="submit" disabled={!editingEvent.name.trim()} className="px-6 py-3 rounded-xl text-white bg-primary hover:bg-blue-600 transition-all shadow-lg hover:shadow-blue-500/25 text-sm font-bold tracking-wide disabled:opacity-50">
                        Guardar Cambios
                    </button>
                </div>
            </form>
          </div>
        </div>
      )}

      <header className="flex flex-col md:flex-row justify-between items-center md:items-start gap-4 mb-6 sm:mb-8 shrink-0 bg-dark p-4 sm:p-6 rounded-2xl border border-gray-800 shadow-xl text-center md:text-left">
        <div className="flex flex-col sm:flex-row items-center gap-3 sm:gap-4 w-full md:w-auto">
          <div className="bg-red-500/10 p-3 rounded-xl">
            <Shield className="w-8 h-8 text-red-500" />
          </div>
          <div className="flex flex-col justify-center items-center sm:items-start">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white uppercase">Panel Master</h1>
            
            {isSystemActive && (
              <div className="flex flex-col gap-1 w-full sm:w-[200px] mt-2 bg-black/40 p-2 rounded-lg border border-gray-700">
                  <div className="flex justify-between items-center text-[9px] font-bold uppercase tracking-widest">
                      <span className="text-gray-400 flex items-center gap-1"><Cpu className="w-3 h-3"/> RAM Render</span>
                      <span className={ramUsage.percent > 80 ? 'text-red-500' : ramUsage.percent > 60 ? 'text-yellow-500' : 'text-green-500'}>
                          {ramUsage.used}MB
                      </span>
                  </div>
                  <div className="w-full bg-gray-800 rounded-full h-1.5 overflow-hidden">
                      <div 
                          className={`h-full transition-all duration-500 ${ramUsage.percent > 80 ? 'bg-red-500' : ramUsage.percent > 60 ? 'bg-yellow-500' : 'bg-green-500'}`} 
                          style={{ width: `${ramUsage.percent}%` }}
                      ></div>
                  </div>
              </div>
            )}

          </div>
        </div>
        <button 
          onClick={toggleSystem}
          className={`w-full md:w-auto flex items-center justify-center gap-3 px-6 py-3 rounded-xl font-bold uppercase tracking-widest transition-all shadow-lg ${
            isSystemActive 
              ? 'bg-green-500/10 text-green-500 border border-green-500/20 hover:bg-green-500 hover:text-white hover:shadow-green-500/25' 
              : 'bg-red-500 text-white border border-red-500 hover:bg-red-600 shadow-red-500/25 animate-pulse'
          }`}
        >
          <Power className="w-5 h-5 shrink-0" />
          <span>{isSystemActive ? 'Central Online' : 'Central Apagada'}</span>
        </button>
      </header>

      <main className="flex-1 overflow-y-auto pr-1 sm:pr-2 flex flex-col gap-6 sm:gap-8 pb-4">
        
        <div className={`bg-dark border p-4 sm:p-6 rounded-2xl shadow-lg shrink-0 transition-all ${!isSystemActive ? 'border-gray-800 opacity-50 grayscale' : 'border-gray-800'}`}>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 mb-4">
            <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
              <Activity className="w-5 h-5 text-primary shrink-0" />
              Desplegar Nuevo Cliente / Evento
            </h2>
            <button onClick={() => setIsAdvancedOpen(!isAdvancedOpen)} disabled={!isSystemActive} className="text-xs font-bold text-primary hover:text-blue-400 tracking-wider uppercase disabled:opacity-50">
                {isAdvancedOpen ? '- Ocultar Opciones SaaS' : '+ Opciones SaaS'}
            </button>
          </div>
          
          <form onSubmit={handleCreateEvent} className="flex flex-col gap-4">
            <div className="flex flex-col md:flex-row gap-4">
                <input 
                type="text"
                value={newEventName}
                onChange={(e) => setNewEventName(e.target.value)}
                placeholder="Nombre del Cliente (Ej: Congreso 2026)"
                disabled={!isSystemActive}
                className="w-full flex-1 bg-darker border border-gray-700 text-white text-sm sm:text-base rounded-xl p-3 sm:p-4 focus:ring-2 focus:ring-primary focus:outline-none transition-all disabled:cursor-not-allowed"
                />
                <button 
                type="submit"
                disabled={!newEventName.trim() || !isSystemActive}
                className="w-full md:w-auto bg-primary hover:bg-blue-600 text-white px-6 sm:px-8 py-3 sm:py-4 rounded-xl font-bold transition-all shadow-lg hover:shadow-blue-500/25 disabled:opacity-50 flex items-center justify-center gap-2 disabled:cursor-not-allowed"
                >
                <Plus className="w-5 h-5 shrink-0" />
                <span>Crear Instancia</span>
                </button>
            </div>

            {isAdvancedOpen && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2 p-4 bg-black/30 rounded-xl border border-gray-800">
                    <div>
                        <label className="flex items-center justify-between text-xs font-bold text-gray-500 mb-2 uppercase tracking-wider">
                            <span className="flex items-center gap-2"><ImageIcon className="w-3 h-3"/> Logos Patrocinadores (Máx 10)</span>
                            <span className="text-gray-600 text-[9px]">* Máx 3 para móvil</span>
                        </label>
                        <div className="flex flex-col gap-2 max-h-48 overflow-y-auto pr-1">
                            {newLogos.map((logo, index) => (
                                <div key={index} className="flex items-center gap-2">
                                    <input 
                                        type="text" 
                                        value={logo.url} 
                                        onChange={(e) => handleLogoChange(index, e.target.value)} 
                                        placeholder="https://ejemplo.com/logo.png" 
                                        disabled={!isSystemActive} 
                                        className="flex-1 bg-darker border border-gray-700 text-gray-300 text-sm rounded-lg p-2.5 focus:ring-1 focus:ring-primary focus:outline-none transition-all" 
                                    />
                                    <button 
                                        type="button" 
                                        onClick={() => toggleMobileLogo(index)} 
                                        disabled={!isSystemActive || (!logo.showOnMobile && newLogos.filter(l => l.showOnMobile).length >= 3)} 
                                        className={`p-2.5 rounded-lg text-sm transition-colors border ${logo.showOnMobile ? 'bg-primary/20 border-primary text-primary' : 'bg-darker border-gray-700 text-gray-500 hover:text-gray-300'}`} 
                                        title={logo.showOnMobile ? "Visible en Móvil" : "Destacar en Móvil"}
                                    >
                                        📱
                                    </button>
                                    {newLogos.length > 1 && (
                                        <button 
                                            type="button" 
                                            onClick={() => removeLogoField(index)} 
                                            disabled={!isSystemActive} 
                                            className="p-2.5 bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white rounded-lg transition-colors border border-red-500/20"
                                            title="Eliminar logo"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                        {newLogos.length < 10 && (
                            <button 
                                type="button" 
                                onClick={addLogoField} 
                                disabled={!isSystemActive} 
                                className="mt-3 w-full bg-dark border border-gray-700 hover:bg-gray-800 text-gray-400 text-xs font-bold py-2 rounded-lg transition-colors uppercase tracking-widest"
                            >
                                + Añadir otro logo
                            </button>
                        )}
                    </div>
                    <div>
                        <label className="flex items-center gap-2 text-xs font-bold text-gray-500 mb-2 uppercase tracking-wider"><Briefcase className="w-3 h-3"/> Texto de Patrocinador</label>
                        <input type="text" value={newSponsorText} onChange={(e) => setNewSponsorText(e.target.value)} placeholder="Patrocinado por Microsoft Azure" disabled={!isSystemActive} className="w-full bg-darker border border-gray-700 text-gray-300 text-sm rounded-lg p-3 focus:ring-1 focus:ring-primary focus:outline-none transition-all" />
                    </div>
                </div>
            )}
          </form>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {(events || []).map((event) => {
            const safeRooms = event.rooms || [];
            const safeStats = event.stats || { total: 0, langs: {}, roomCounts: {} };
            return (
            <div key={event.id} className={`bg-dark border rounded-2xl flex flex-col overflow-hidden shadow-xl transition-all ${!isSystemActive ? 'border-gray-800 opacity-60' : event.isActive ? 'border-gray-800' : 'border-red-900/50 opacity-80'}`}>
              
              <div className="p-4 sm:p-5 border-b border-gray-800 bg-black/20 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-3 w-full sm:w-auto">
                    <h3 className="text-lg sm:text-xl font-bold text-white leading-tight break-words w-full sm:w-auto pr-2">{event.name}</h3>
                    <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-widest shrink-0 w-max ${
                      !isSystemActive 
                        ? 'bg-gray-500/20 text-gray-500 border border-gray-500/30' 
                        : event.isActive 
                          ? 'bg-green-500/20 text-green-500' 
                          : 'bg-red-500/20 text-red-500'
                    }`}>
                        {!isSystemActive ? 'Bloqueado por Central' : (event.isActive ? 'Online' : 'Offline')}
                    </span>
                </div>
                <div className="flex items-center gap-2 w-full sm:w-auto justify-end shrink-0">
                    {/* BOTÓN EDITAR */}
                    <button 
                        onClick={() => openEditModal(event)}
                        disabled={!isSystemActive}
                        className={`p-2.5 rounded-lg transition-colors flex-1 sm:flex-none flex justify-center ${
                          !isSystemActive 
                            ? 'opacity-30 cursor-not-allowed' 
                            : 'bg-blue-500/10 hover:bg-blue-500 text-blue-500 hover:text-white'
                        }`}
                        title="Editar Evento"
                    >
                        <Edit className="w-5 h-5 sm:w-4 sm:h-4" />
                    </button>
                    
                    <button 
                        onClick={() => toggleEventStatus(event.id, event.isActive)}
                        disabled={!isSystemActive}
                        className={`p-2.5 rounded-lg transition-colors flex-1 sm:flex-none flex justify-center ${
                          !isSystemActive 
                            ? 'opacity-30 cursor-not-allowed' 
                            : event.isActive 
                              ? 'bg-green-500/10 hover:bg-green-500 text-green-500 hover:text-white' 
                              : 'bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white'
                        }`}
                        title={!isSystemActive ? "Enciende la Central primero" : (event.isActive ? "Pausar Evento" : "Reactivar Evento")}
                    >
                        <Power className="w-5 h-5 sm:w-4 sm:h-4" />
                    </button>
                    <button 
                        onClick={() => handleDeleteEvent(event.id)}
                        className="p-2.5 bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white rounded-lg transition-colors flex-1 sm:flex-none flex justify-center"
                        title="Eliminar Instancia Definitivamente"
                    >
                        <Trash2 className="w-5 h-5 sm:w-4 sm:h-4" />
                    </button>
                </div>
              </div>

              <div className="p-4 sm:p-5 flex-1 flex flex-col gap-5">
                
                <div className="bg-gradient-to-br from-gray-900 to-black p-4 rounded-xl border border-gray-800 flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="bg-primary/10 p-2.5 rounded-lg border border-primary/20 shrink-0">
                            <BarChart3 className="w-6 h-6 text-primary" />
                        </div>
                        <div>
                            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest block">Audiencia Activa</span>
                            <span className="text-xl sm:text-2xl font-bold text-white leading-none">{safeStats.total || 0} <span className="text-xs sm:text-sm font-medium text-gray-500">oyentes en vivo</span></span>
                        </div>
                    </div>
                    
                    <div className="flex gap-2 flex-wrap md:justify-end w-full md:w-auto">
                        {['en', 'pt', 'es', 'de', 'fr'].map(lang => {
                            if (safeStats.langs && safeStats.langs[lang] > 0) {
                                return (
                                    <div key={lang} className="bg-gray-800/50 border border-gray-700 px-2.5 py-1 rounded-md flex items-center gap-1.5">
                                        <span className="text-[10px] font-bold text-gray-400 uppercase">{lang}</span>
                                        <span className="text-xs font-bold text-white">{safeStats.langs[lang]}</span>
                                    </div>
                                )
                            }
                            return null;
                        })}
                    </div>
                </div>

                <div className="bg-purple-500/5 p-4 rounded-xl border border-purple-500/20 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div className="w-full sm:w-auto">
                        <span className="text-[10px] font-bold text-purple-500 uppercase tracking-widest mb-1 flex items-center gap-1"><UserCog className="w-3 h-3"/> CLAVE ADMIN CLIENTE</span>
                        <div className="flex items-center justify-between sm:justify-start gap-2 bg-black/20 p-2 rounded-lg sm:bg-transparent sm:p-0">
                            <span className="text-purple-500 font-mono text-base font-bold tracking-widest">{event.adminPassword}</span>
                            <button onClick={() => copyToClipboard(event.adminPassword)} className="text-purple-500 hover:text-white transition-colors p-1 sm:p-0">
                            {copiedText === event.adminPassword ? <CheckCircle2 className="w-5 h-5 sm:w-4 sm:h-4 text-green-500" /> : <Copy className="w-5 h-5 sm:w-4 sm:h-4" />}
                            </button>
                        </div>
                    </div>
                    <div className="flex flex-row sm:flex-col gap-2 w-full sm:w-auto">
                        <a 
                            href="/event-admin"
                            target="_blank"
                            rel="noreferrer"
                            className="flex-1 sm:w-full bg-purple-500/10 hover:bg-purple-500 border border-purple-500/30 hover:border-purple-500 text-purple-500 hover:text-white px-3 py-2.5 sm:py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-colors flex items-center justify-center gap-2"
                        >
                            <ExternalLink className="w-4 h-4 sm:w-3 sm:h-3 shrink-0" /> <span className="hidden sm:inline">Panel Cliente</span>
                        </a>
                        <button 
                            onClick={() => downloadAnalytics(event)}
                            className="flex-1 sm:w-full bg-blue-500/10 hover:bg-blue-500 border border-blue-500/30 hover:border-blue-500 text-blue-500 hover:text-white px-3 py-2.5 sm:py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-colors flex items-center justify-center gap-2"
                        >
                            <Download className="w-4 h-4 sm:w-3 sm:h-3 shrink-0" /> <span className="hidden sm:inline">Reporte PDF</span>
                        </button>
                    </div>
                </div>

                <div>
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4 mt-2 border-t border-gray-800/50 pt-4 sm:border-none sm:pt-0">
                    <span className="text-xs font-bold text-gray-500 uppercase tracking-widest">Salas Creadas ({safeRooms.length}):</span>
                    <button 
                      onClick={() => setSelectedEventId(selectedEventId === event.id ? null : event.id)}
                      className="w-full sm:w-auto text-xs font-bold text-primary bg-primary/10 sm:bg-transparent px-3 py-2 sm:p-0 rounded-lg sm:rounded-none hover:text-blue-400 transition-colors uppercase disabled:opacity-50 text-center"
                      disabled={!isSystemActive || !event.isActive}
                    >
                      {selectedEventId === event.id ? '- Cancelar' : '+ Añadir Sala Maestra'}
                    </button>
                  </div>

                  {selectedEventId === event.id && isSystemActive && event.isActive && (
                    <form onSubmit={(e) => handleAddRoom(e, event.id)} className="mb-4 flex flex-col sm:flex-row gap-2 bg-black/40 p-3 rounded-xl border border-gray-800">
                      <input 
                        type="text"
                        value={newRoomName}
                        onChange={(e) => setNewRoomName(e.target.value)}
                        placeholder="NUEVA-SALA"
                        className="w-full sm:flex-1 bg-dark border border-gray-700 text-white text-xs uppercase tracking-widest rounded-lg px-3 py-3 sm:py-2 focus:ring-1 focus:ring-primary focus:outline-none"
                        autoFocus
                      />
                      <button type="submit" className="w-full sm:w-auto bg-primary hover:bg-blue-600 text-white px-6 py-3 sm:py-2 rounded-lg text-xs font-bold transition-colors shadow-lg">Agregar</button>
                    </form>
                  )}

                  <div className="grid grid-cols-1 gap-4">
                    {safeRooms.map(roomObj => (
                        <div key={roomObj.name} className={`flex flex-col bg-darker p-4 rounded-xl border border-gray-700 relative group transition-all ${roomObj.isActive === false ? 'opacity-60 grayscale border-red-900/50' : ''}`}>
                            <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-3 pr-28 break-words leading-tight">
                                {roomObj.name} 
                                {roomObj.isActive === false && <span className="text-red-500 text-[10px] ml-2 bg-red-500/10 px-1.5 py-0.5 rounded border border-red-500/20">(PAUSADA)</span>}
                            </h3>
                            
                            <div className="grid grid-cols-1 xs:grid-cols-2 gap-3 mb-4">
                                <div className="bg-primary/10 border border-primary/20 rounded-lg p-2.5 flex flex-col justify-center">
                                    <span className="text-[10px] text-primary font-bold uppercase tracking-widest mb-1.5 flex items-center gap-1"><Key className="w-3 h-3"/> Orador</span>
                                    <div className="flex items-center justify-between bg-black/20 p-1.5 rounded">
                                        <span className="text-white font-mono text-xs font-bold tracking-widest">{roomObj.speakerPassword}</span>
                                        <button onClick={() => copyToClipboard(roomObj.speakerPassword)} className="text-primary hover:text-white transition-colors p-1">
                                            {copiedText === roomObj.speakerPassword ? <CheckCircle2 className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                                        </button>
                                    </div>
                                </div>
                                <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-2.5 flex flex-col justify-center">
                                    <span className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mb-1.5 flex items-center gap-1"><Users className="w-3 h-3"/> Audiencia</span>
                                    <div className="flex items-center justify-between bg-black/20 p-1.5 rounded">
                                        <span className="text-white font-mono text-xs font-bold tracking-widest">{roomObj.audienceCode}</span>
                                        <button onClick={() => copyToClipboard(roomObj.audienceCode)} className="text-gray-400 hover:text-white transition-colors p-1">
                                            {copiedText === roomObj.audienceCode ? <CheckCircle2 className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                                        </button>
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-4">
                                <a 
                                    href={`/admin?pwd=${roomObj.speakerPassword}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="w-full bg-primary/20 hover:bg-primary text-primary hover:text-white border border-primary/50 hover:border-primary px-2 py-2.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-colors flex justify-center items-center gap-1.5 text-center"
                                >
                                    <Mic className="w-3.5 h-3.5" />
                                    Orador
                                </a>
                                <a 
                                    href={`/?code=${roomObj.audienceCode}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="w-full bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white border border-gray-700 px-2 py-2.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-colors flex justify-center items-center gap-1.5 text-center"
                                >
                                    <ExternalLink className="w-3.5 h-3.5" /> 
                                    Audiencia
                                </a>
                                <a 
                                    href={`/?code=${roomObj.audienceCode}&tv=true&lang=es`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="w-full bg-gray-800 hover:bg-primary/20 text-gray-300 hover:text-primary border border-gray-700 hover:border-primary/50 px-2 py-2.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-colors flex justify-center items-center gap-1.5 text-center"
                                >
                                    <MonitorPlay className="w-3.5 h-3.5" /> 
                                    TV (ES)
                                </a>
                            </div>

                            <div className="flex items-center justify-between mt-auto pt-2 border-t border-gray-800/50">
                                <span className="bg-green-500/10 border border-green-500/20 text-green-400 px-3 py-1.5 rounded-lg text-[10px] font-bold flex items-center gap-2 w-max">
                                    <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse shrink-0"></div>
                                    <Users className="w-3.5 h-3.5" />
                                    {safeStats.roomCounts?.[roomObj.name] || 0} en línea
                                </span>
                            </div>

                            {/* GATILLOS: PAUSAR SALA, EVACUACIÓN Y ELIMINAR */}
                            {isSystemActive && event.isActive && (
                                <>
                                    <button 
                                    onClick={() => toggleRoomStatus(event.id, roomObj.name, roomObj.isActive)}
                                    className={`absolute top-3 right-20 p-1.5 rounded-lg transition-colors bg-black/50 sm:bg-transparent sm:opacity-0 sm:group-hover:opacity-100 ${roomObj.isActive !== false ? 'text-green-500 hover:bg-green-500/10' : 'text-red-500 hover:text-white hover:bg-red-500/10'}`}
                                    title={roomObj.isActive !== false ? "Pausar Sala Individual" : "Reactivar Sala Individual"}
                                    >
                                    <Power className="w-4 h-4" />
                                    </button>

                                    <button 
                                    onClick={() => handleOptimizeRoom(event.id, roomObj.name)}
                                    className="absolute top-3 right-12 text-gray-500 hover:text-yellow-500 hover:bg-yellow-500/10 p-1.5 rounded-lg transition-colors bg-black/50 sm:bg-transparent sm:opacity-0 sm:group-hover:opacity-100"
                                    title="Optimizar RAM (Expulsar 50% Móviles)"
                                    >
                                    <Activity className="w-4 h-4" />
                                    </button>

                                    <button 
                                    onClick={() => handleDeleteRoom(event.id, roomObj.name)}
                                    className="absolute top-3 right-3 text-gray-500 hover:text-red-500 hover:bg-red-500/10 p-1.5 rounded-lg transition-colors bg-black/50 sm:bg-transparent sm:opacity-0 sm:group-hover:opacity-100"
                                    title="Eliminar Sala"
                                    >
                                    <X className="w-4 h-4" />
                                    </button>
                                </>
                            )}
                        </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            );
          })}
          {(events || []).length === 0 && (
            <div className="col-span-full py-12 flex flex-col items-center justify-center text-gray-500 border-2 border-dashed border-gray-800 rounded-2xl mx-2 sm:mx-0">
              <Shield className="w-12 h-12 mb-4 opacity-20" />
              <p className="text-base sm:text-lg font-medium text-center px-4">No hay instancias activas en el servidor.</p>
            </div>
          )}
        </div>
      </main>

      <div className="mt-4 mb-4 flex items-center justify-center gap-2 text-xs font-bold text-gray-600 tracking-widest uppercase opacity-60 shrink-0">
          <Scale className="w-4 h-4" />
          <span>© {new Date().getFullYear()} ACOFI TRANSLATOR • TODOS LOS DERECHOS RESERVADOS</span>
      </div>

    </div>
  );
};

export default MasterView;