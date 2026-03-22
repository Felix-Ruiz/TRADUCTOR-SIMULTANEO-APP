import React, { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import { Power, Plus, Trash2, Key, Copy, CheckCircle2, X, Users, AlertCircle, BarChart3, UserCog, LogOut, Activity, ExternalLink, MonitorPlay, Mic } from 'lucide-react';

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

    return () => socket.disconnect();
  }, [isAuthenticated]);

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
        setLoginError('Clave de administrador de evento incorrecta.');
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

  if (isFetchingData) {
    return (
      <div className="flex flex-col h-screen w-full items-center justify-center p-6 bg-darker">
        <div className="flex flex-col items-center gap-6 animate-pulse">
          <img src="/logo.png" alt="Logo" className="h-14 w-auto object-contain drop-shadow-lg" onError={(e) => { e.target.style.display = 'none'; }} />
          <div className="w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-gray-500 text-sm font-semibold tracking-widest uppercase">Cargando panel de cliente...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex flex-col h-screen w-full items-center justify-center p-6 bg-black">
        <div className="bg-darker border border-purple-900/30 p-8 rounded-3xl shadow-2xl shadow-purple-900/10 max-w-md w-full flex flex-col items-center gap-6 text-center">
          <div className="bg-purple-500/10 p-5 rounded-full">
            <UserCog className="w-10 h-10 text-purple-500" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-white mb-2 tracking-widest uppercase">Admin de Evento</h2>
            <p className="text-gray-400 text-sm leading-relaxed">Ingresa la clave administrativa proporcionada por el organizador.</p>
          </div>
          <form onSubmit={handleLogin} className="w-full flex flex-col gap-4 mt-2">
            <input
              type="password"
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
              placeholder="Clave Administrativa"
              className="w-full bg-black border border-gray-800 text-purple-500 text-xl rounded-xl p-4 focus:ring-2 focus:ring-purple-500 focus:outline-none text-center tracking-widest transition-all"
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
      
      {dialogConfig.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm transition-opacity">
          <div className="bg-darker border border-gray-700 p-6 rounded-3xl shadow-[0_0_40px_rgba(0,0,0,0.5)] max-w-sm w-full flex flex-col gap-2 transform transition-all scale-100">
            <div className="flex items-center gap-3 mb-2">
               <AlertCircle className={`w-7 h-7 ${dialogConfig.type === 'alert' ? 'text-yellow-500' : 'text-red-500'}`} />
               <h3 className="text-xl font-bold text-white tracking-wide">{dialogConfig.title}</h3>
            </div>
            <p className="text-gray-400 text-sm leading-relaxed mb-4">{dialogConfig.message}</p>
            <div className="flex justify-end gap-3 mt-2">
              {dialogConfig.type === 'confirm' && (
                <button onClick={closeDialog} className="px-5 py-2.5 rounded-xl text-gray-400 hover:bg-gray-800 hover:text-white transition-colors text-sm font-bold tracking-wide">
                  Cancelar
                </button>
              )}
              <button 
                onClick={() => { if(dialogConfig.onConfirm) dialogConfig.onConfirm(); closeDialog(); }} 
                className={`px-5 py-2.5 rounded-xl text-white text-sm font-bold tracking-wide transition-all shadow-lg ${dialogConfig.confirmStyle}`}
              >
                {dialogConfig.type === 'alert' ? 'Entendido' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}

      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8 shrink-0 bg-dark p-6 rounded-2xl border border-gray-800 shadow-xl">
        <div className="flex items-center gap-4 w-full md:w-auto">
          <div className="bg-purple-500/10 p-3 rounded-xl hidden sm:block">
            <UserCog className="w-8 h-8 text-purple-500" />
          </div>
          <div className="flex flex-col flex-1">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white uppercase truncate">{eventData.name}</h1>
            <span className="text-xs text-gray-500 font-bold tracking-widest flex items-center gap-3 mt-1">
               <span>PANEL ADMINISTRATIVO</span>
               {!isSystemActive && (
                   <span className="text-red-500 animate-pulse bg-red-500/10 px-2 py-0.5 rounded border border-red-500/20">SISTEMA CENTRAL OFFLINE</span>
               )}
            </span>
          </div>
          <button onClick={handleLogout} className="p-2 bg-gray-800 text-gray-400 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-colors md:hidden">
              <LogOut className="w-5 h-5" />
          </button>
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto justify-between md:justify-end">
            <button 
            onClick={toggleEventStatus}
            disabled={!isSystemActive}
            className={`flex items-center justify-center gap-2 px-5 py-3 rounded-xl font-bold text-xs uppercase tracking-widest transition-all shadow-lg w-full sm:w-auto ${
                !isSystemActive 
                  ? 'bg-gray-800 text-gray-500 cursor-not-allowed border border-gray-700'
                  : eventData.isActive 
                  ? 'bg-green-500/10 text-green-500 border border-green-500/20 hover:bg-green-500 hover:text-white hover:shadow-green-500/25' 
                  : 'bg-red-500 text-white border border-red-500 hover:bg-red-600 shadow-red-500/25 animate-pulse'
            }`}
            >
            <Power className="w-4 h-4" />
            {eventData.isActive ? 'Evento En Vivo' : 'Evento Pausado'}
            </button>
            
            <button onClick={handleLogout} className="p-2.5 bg-gray-800 text-gray-400 hover:text-red-500 hover:bg-red-500/10 rounded-xl transition-colors hidden md:block">
                <LogOut className="w-5 h-5" />
            </button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto pr-2 flex flex-col gap-6">

        {/* ANALÍTICAS */}
        <div className="bg-gradient-to-br from-gray-900 to-black p-6 rounded-2xl border border-gray-800 shadow-xl flex flex-col sm:flex-row gap-6 items-center justify-between shrink-0">
            <div className="flex items-center gap-4">
                <div className="bg-primary/10 p-3.5 rounded-xl border border-primary/20">
                    <BarChart3 className="w-8 h-8 text-primary" />
                </div>
                <div>
                    <span className="text-xs font-bold text-gray-500 uppercase tracking-widest block mb-1">Audiencia Activa Total</span>
                    <span className="text-4xl font-bold text-white leading-none">{safeStats.total || 0} <span className="text-base font-medium text-gray-500">conexiones</span></span>
                </div>
            </div>
            
            <div className="flex gap-2 flex-wrap justify-center sm:justify-end w-full sm:w-auto">
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

        {/* GESTIÓN DE SALAS */}
        <div className="bg-dark border border-gray-800 rounded-2xl p-6 shadow-xl flex-1 flex flex-col min-h-[300px]">
            <div className="flex items-center justify-between mb-6 pb-4 border-b border-gray-800">
                <h2 className="text-sm font-bold text-white uppercase tracking-widest flex items-center gap-2">
                    <Activity className="w-4 h-4 text-primary" />
                    Gestión de Salas ({safeRooms.length})
                </h2>
                <button 
                    onClick={() => setIsAddingRoom(!isAddingRoom)}
                    className="text-xs font-bold text-primary hover:text-blue-400 transition-colors uppercase disabled:opacity-50 flex items-center gap-1 bg-primary/10 px-3 py-1.5 rounded-lg"
                    disabled={!isSystemActive || !eventData.isActive}
                >
                    {isAddingRoom ? <X className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
                    {isAddingRoom ? 'Cancelar' : 'Crear Sala'}
                </button>
            </div>

            {isAddingRoom && isSystemActive && eventData.isActive && (
            <form onSubmit={handleAddRoom} className="mb-6 flex gap-3 bg-black/50 p-4 rounded-xl border border-gray-800">
                <input 
                type="text"
                value={newRoomName}
                onChange={(e) => setNewRoomName(e.target.value)}
                placeholder="Nombre de la nueva sala (Ej: TALLER-A)"
                className="flex-1 bg-darker border border-gray-700 text-white text-sm uppercase tracking-widest rounded-xl px-4 py-3 focus:ring-2 focus:ring-primary focus:outline-none"
                autoFocus
                />
                <button type="submit" disabled={!newRoomName.trim()} className="bg-primary hover:bg-blue-600 text-white px-6 py-3 rounded-xl text-sm font-bold uppercase tracking-widest transition-colors disabled:opacity-50 shadow-lg">Agregar</button>
            </form>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 overflow-y-auto pb-4">
            {safeRooms.map(roomObj => (
                <div key={roomObj.name} className="flex flex-col bg-darker p-5 rounded-xl border border-gray-700 relative group transition-all hover:border-gray-500 shadow-md">
                    <h3 className="text-base font-bold text-white uppercase tracking-wider mb-4 pr-8 truncate" title={roomObj.name}>{roomObj.name}</h3>
                    
                    <div className="grid grid-cols-2 gap-3 mb-5">
                        <div className="bg-primary/10 border border-primary/20 rounded-lg p-3 flex flex-col justify-center shadow-inner">
                            <span className="text-[10px] text-primary font-bold uppercase tracking-widest flex items-center gap-1 mb-1.5"><Key className="w-3 h-3"/> Clave Orador</span>
                            <div className="flex items-center justify-between">
                                <span className="text-white font-mono text-sm font-bold">{roomObj.speakerPassword}</span>
                                <button onClick={() => copyToClipboard(roomObj.speakerPassword)} className="text-primary hover:text-white transition-colors">
                                    {copiedText === roomObj.speakerPassword ? <CheckCircle2 className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                                </button>
                            </div>
                        </div>

                        <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-3 flex flex-col justify-center shadow-inner">
                            <span className="text-[10px] text-gray-400 font-bold uppercase tracking-widest flex items-center gap-1 mb-1.5"><Users className="w-3 h-3"/> Cód. Audiencia</span>
                            <div className="flex items-center justify-between">
                                <span className="text-white font-mono text-sm font-bold">{roomObj.audienceCode}</span>
                                <button onClick={() => copyToClipboard(roomObj.audienceCode)} className="text-gray-400 hover:text-white transition-colors">
                                    {copiedText === roomObj.audienceCode ? <CheckCircle2 className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 mb-4">
                        <a 
                            href={`/admin?pwd=${roomObj.speakerPassword}`}
                            target="_blank"
                            rel="noreferrer"
                            className="flex-1 bg-primary/20 hover:bg-primary text-primary hover:text-white border border-primary/50 hover:border-primary px-2 py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-colors flex justify-center items-center gap-1.5 text-center"
                        >
                            <Mic className="w-3 h-3" />
                            Link Orador
                        </a>
                        <a 
                            href={`/?code=${roomObj.audienceCode}`}
                            target="_blank"
                            rel="noreferrer"
                            className="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white border border-gray-700 px-2 py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-colors flex justify-center items-center gap-1.5 text-center"
                        >
                            <ExternalLink className="w-3 h-3" /> 
                            Link Audiencia
                        </a>
                        <a 
                            href={`/?code=${roomObj.audienceCode}&tv=true&lang=es`}
                            target="_blank"
                            rel="noreferrer"
                            className="flex-1 bg-gray-800 hover:bg-primary/20 text-gray-300 hover:text-primary border border-gray-700 hover:border-primary/50 px-2 py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-colors flex justify-center items-center gap-1.5 text-center"
                        >
                            <MonitorPlay className="w-3 h-3" /> 
                            TV (ES)
                        </a>
                    </div>

                    <div className="flex items-center justify-between mt-auto pt-2 border-t border-gray-800/50">
                        <span className="bg-green-500/10 border border-green-500/20 text-green-400 px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-2 w-max">
                            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                            <Users className="w-4 h-4" />
                            {safeStats.roomCounts?.[roomObj.name] || 0} Usuarios en línea
                        </span>
                    </div>

                    {isSystemActive && eventData.isActive && (
                        <button 
                        onClick={() => handleDeleteRoom(roomObj.name)}
                        className="absolute top-4 right-4 text-gray-600 hover:text-red-500 hover:bg-red-500/10 p-1.5 rounded-md transition-colors opacity-0 group-hover:opacity-100"
                        title="Eliminar Sala"
                        >
                        <Trash2 className="w-4 h-4" />
                        </button>
                    )}
                </div>
            ))}
            {safeRooms.length === 0 && (
                <div className="col-span-full py-8 text-center text-gray-500 text-sm font-medium">
                    No hay salas creadas. Usa el botón "Crear Sala" para comenzar.
                </div>
            )}
            </div>
        </div>

      </main>
    </div>
  );
};

export default EventAdminView;