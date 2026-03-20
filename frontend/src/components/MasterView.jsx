import React, { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import { Shield, Power, Plus, Trash2, Key, Activity, Copy, CheckCircle2, X, Users } from 'lucide-react';

const socket = io(import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001', { autoConnect: false });

const MasterView = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(sessionStorage.getItem('isMasterAuth') === 'true');
  const [passwordInput, setPasswordInput] = useState('');
  const [loginError, setLoginError] = useState('');
  const [isFetchingData, setIsFetchingData] = useState(sessionStorage.getItem('isMasterAuth') === 'true');

  const [isSystemActive, setIsSystemActive] = useState(false);
  const [events, setEvents] = useState([]);
  
  const [newEventName, setNewEventName] = useState('');
  const [newRoomName, setNewRoomName] = useState('');
  const [selectedEventId, setSelectedEventId] = useState(null);
  const [copiedText, setCopiedText] = useState(null);

  useEffect(() => {
    if (!isAuthenticated) return;
    socket.connect();
    socket.emit('master-get-data', (data) => {
      setIsSystemActive(data.isSystemActive);
      setEvents(data.events);
      setIsFetchingData(false); 
    });
    socket.on('system-status', (status) => setIsSystemActive(status));
    socket.on('master-data-updated', (updatedEvents) => setEvents(updatedEvents));
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
        setLoginError('Credenciales maestras incorrectas.');
        setPasswordInput('');
        setIsFetchingData(false);
        socket.disconnect();
      }
    });
  };

  const toggleSystem = () => {
    const newStatus = !isSystemActive;
    if (!newStatus) {
      if (!window.confirm("¡PELIGRO! Vas a apagar la central completa. Absolutamente todos los eventos caerán. ¿Continuar?")) return;
    }
    setIsSystemActive(newStatus);
    socket.emit('master-toggle-system', newStatus);
  };

  const toggleEventStatus = (id, currentStatus) => {
    const newStatus = !currentStatus;
    if (!newStatus) {
      if (!window.confirm("¿Seguro que deseas pausar este evento en específico?")) return;
    }
    socket.emit('master-toggle-event', { id, status: newStatus }, () => {});
  };

  const handleCreateEvent = (e) => {
    e.preventDefault();
    if (!newEventName.trim()) return;
    socket.emit('master-create-event', { name: newEventName }, (response) => {
      if (response.success) setNewEventName('');
    });
  };

  const handleDeleteEvent = (id) => {
    if (window.confirm("¿Eliminar este evento y todas sus salas de forma permanente?")) {
      socket.emit('master-delete-event', id, () => {});
    }
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
    if (window.confirm(`¿Seguro que deseas eliminar la sala ${room}?`)) {
      socket.emit('master-delete-room', { id, room }, () => {});
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    setCopiedText(text);
    setTimeout(() => setCopiedText(null), 2000);
  };

  if (isFetchingData) {
    return (
      <div className="flex flex-col h-screen w-full items-center justify-center p-6 bg-darker">
        <div className="flex flex-col items-center gap-6 animate-pulse">
          <img src="/logo.png" alt="Logo" className="h-14 w-auto object-contain drop-shadow-lg" onError={(e) => { e.target.style.display = 'none'; }} />
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
          <p className="text-gray-500 text-sm font-semibold tracking-widest uppercase">Restaurando sesión maestra...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex flex-col h-screen w-full items-center justify-center p-6 bg-black">
        <div className="bg-darker border border-red-900/30 p-8 rounded-3xl shadow-2xl max-w-md w-full flex flex-col items-center gap-6 text-center">
          <div className="bg-red-500/10 p-5 rounded-full">
            <Shield className="w-10 h-10 text-red-500" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-white mb-2 tracking-widest uppercase">Master Admin</h2>
            <p className="text-gray-400 text-sm leading-relaxed">Nivel de autorización máximo requerido.</p>
          </div>
          <form onSubmit={handleLogin} className="w-full flex flex-col gap-4 mt-2">
            <input
              type="password"
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
              placeholder="Clave Maestra"
              className="w-full bg-black border border-gray-800 text-red-500 text-xl rounded-xl p-4 focus:ring-2 focus:ring-red-500 focus:outline-none text-center tracking-widest transition-all"
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
    <div className="flex flex-col h-screen w-full p-8 max-w-6xl mx-auto overflow-hidden bg-darker">
      <header className="flex justify-between items-center mb-8 shrink-0 bg-dark p-6 rounded-2xl border border-gray-800 shadow-xl">
        <div className="flex items-center gap-4">
          <div className="bg-red-500/10 p-3 rounded-xl">
            <Shield className="w-8 h-8 text-red-500" />
          </div>
          <div className="flex flex-col">
            <h1 className="text-2xl font-bold tracking-tight text-white uppercase">Panel Master</h1>
            <span className="text-xs text-gray-500 font-bold tracking-widest">Control Central de Plataforma</span>
          </div>
        </div>
        <button 
          onClick={toggleSystem}
          className={`flex items-center gap-3 px-6 py-3 rounded-xl font-bold uppercase tracking-widest transition-all shadow-lg ${
            isSystemActive 
              ? 'bg-green-500/10 text-green-500 border border-green-500/20 hover:bg-green-500 hover:text-white hover:shadow-green-500/25' 
              : 'bg-red-500 text-white border border-red-500 hover:bg-red-600 shadow-red-500/25 animate-pulse'
          }`}
        >
          <Power className="w-5 h-5" />
          {isSystemActive ? 'Central Online' : 'Central Apagada'}
        </button>
      </header>

      <main className="flex-1 overflow-y-auto pr-2 flex flex-col gap-8">
        <div className={`bg-dark border p-6 rounded-2xl shadow-lg shrink-0 transition-all ${!isSystemActive ? 'border-gray-800 opacity-50 grayscale' : 'border-gray-800'}`}>
          <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
            <Activity className="w-5 h-5 text-primary" />
            Generar Nuevo Evento
          </h2>
          <form onSubmit={handleCreateEvent} className="flex flex-col sm:flex-row gap-4">
            <input 
              type="text"
              value={newEventName}
              onChange={(e) => setNewEventName(e.target.value)}
              placeholder="Nombre del Evento (Ej: Congreso ACOFI 2026)"
              disabled={!isSystemActive}
              className="flex-1 bg-darker border border-gray-700 text-white text-base rounded-xl p-4 focus:ring-2 focus:ring-primary focus:outline-none transition-all disabled:cursor-not-allowed"
            />
            <button 
              type="submit"
              disabled={!newEventName.trim() || !isSystemActive}
              className="bg-primary hover:bg-blue-600 text-white px-8 py-4 rounded-xl font-bold transition-all shadow-lg hover:shadow-blue-500/25 disabled:opacity-50 flex items-center justify-center gap-2 disabled:cursor-not-allowed"
            >
              <Plus className="w-5 h-5" />
              Crear Instancia
            </button>
          </form>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pb-8">
          {events.map((event) => (
            <div key={event.id} className={`bg-dark border rounded-2xl flex flex-col overflow-hidden shadow-xl transition-all ${!isSystemActive ? 'border-gray-800 opacity-60' : event.isActive ? 'border-gray-800' : 'border-red-900/50 opacity-80'}`}>
              
              <div className="p-5 border-b border-gray-800 bg-black/20 flex justify-between items-center">
                <div className="flex items-center gap-3">
                    <h3 className="text-xl font-bold text-white leading-tight">{event.name}</h3>
                    {/* NUEVO: Etiqueta dinámica atada a la Central */}
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-widest ${
                      !isSystemActive 
                        ? 'bg-gray-500/20 text-gray-500 border border-gray-500/30' 
                        : event.isActive 
                          ? 'bg-green-500/20 text-green-500' 
                          : 'bg-red-500/20 text-red-500'
                    }`}>
                        {!isSystemActive ? 'Bloqueado por Central' : (event.isActive ? 'Online' : 'Offline')}
                    </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    <button 
                        onClick={() => toggleEventStatus(event.id, event.isActive)}
                        disabled={!isSystemActive}
                        className={`p-2 rounded-lg transition-colors ${
                          !isSystemActive 
                            ? 'opacity-30 cursor-not-allowed' 
                            : event.isActive 
                              ? 'bg-green-500/10 hover:bg-green-500 text-green-500 hover:text-white' 
                              : 'bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white'
                        }`}
                        title={!isSystemActive ? "Enciende la Central primero" : (event.isActive ? "Pausar Evento" : "Reactivar Evento")}
                    >
                        <Power className="w-4 h-4" />
                    </button>
                    <button 
                        onClick={() => handleDeleteEvent(event.id)}
                        className="p-2 bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white rounded-lg transition-colors"
                        title="Eliminar Evento Definitivamente"
                    >
                        <Trash2 className="w-4 h-4" />
                    </button>
                </div>
              </div>

              <div className="p-5 flex-1 flex flex-col gap-5">
                <div className="grid grid-cols-2 gap-4">
                    <div className="bg-darker p-4 rounded-xl border border-gray-700/50">
                        <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2 flex items-center gap-1"><Users className="w-3 h-3"/> CÓDIGO AUDIENCIA</span>
                        <div className="flex items-center justify-between gap-2">
                            <span className="text-white font-mono text-base font-bold tracking-widest">{event.id}</span>
                            <button onClick={() => copyToClipboard(event.id)} className="text-gray-400 hover:text-white">
                            {copiedText === event.id ? <CheckCircle2 className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                            </button>
                        </div>
                    </div>
                    
                    <div className="bg-primary/5 p-4 rounded-xl border border-primary/20">
                        <span className="text-[10px] font-bold text-primary uppercase tracking-widest mb-2 flex items-center gap-1"><Key className="w-3 h-3"/> CLAVE ORADOR</span>
                        <div className="flex items-center justify-between gap-2">
                            <span className="text-primary font-mono text-base font-bold tracking-widest">{event.password}</span>
                            <button onClick={() => copyToClipboard(event.password)} className="text-primary hover:text-white">
                            {copiedText === event.password ? <CheckCircle2 className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                            </button>
                        </div>
                    </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-3 mt-2">
                    <span className="text-xs font-bold text-gray-500 uppercase tracking-widest">Salas Asignadas ({event.rooms.length}):</span>
                    <button 
                      onClick={() => setSelectedEventId(selectedEventId === event.id ? null : event.id)}
                      className="text-xs font-bold text-primary hover:text-blue-400 transition-colors uppercase disabled:opacity-50"
                      disabled={!isSystemActive || !event.isActive}
                    >
                      + Añadir Sala
                    </button>
                  </div>

                  {selectedEventId === event.id && isSystemActive && event.isActive && (
                    <form onSubmit={(e) => handleAddRoom(e, event.id)} className="mb-3 flex gap-2">
                      <input 
                        type="text"
                        value={newRoomName}
                        onChange={(e) => setNewRoomName(e.target.value)}
                        placeholder="NUEVA-SALA"
                        className="flex-1 bg-black border border-gray-700 text-white text-xs uppercase tracking-widest rounded-lg px-3 py-2 focus:ring-1 focus:ring-primary focus:outline-none"
                        autoFocus
                      />
                      <button type="submit" className="bg-primary text-white px-3 py-2 rounded-lg text-xs font-bold">OK</button>
                    </form>
                  )}

                  <div className="flex flex-wrap gap-2">
                    {event.rooms.map(room => (
                      <span key={room} className="flex items-center gap-2 px-3 py-1 bg-gray-800 text-gray-300 text-xs font-bold uppercase tracking-wider rounded-md border border-gray-700">
                        {room}
                        {isSystemActive && event.isActive && (
                            <button 
                            onClick={() => handleDeleteRoom(event.id, room)}
                            className="text-gray-500 hover:text-red-500 transition-colors"
                            title="Eliminar Sala"
                            >
                            <X className="w-3 h-3" />
                            </button>
                        )}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ))}
          {events.length === 0 && (
            <div className="col-span-full py-12 flex flex-col items-center justify-center text-gray-500 border-2 border-dashed border-gray-800 rounded-2xl">
              <Shield className="w-12 h-12 mb-4 opacity-20" />
              <p className="text-lg font-medium">No hay eventos activos en la plataforma.</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default MasterView;