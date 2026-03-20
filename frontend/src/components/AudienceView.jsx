import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { Headphones, Globe2, AlertCircle, MessageSquare, Radio, PowerOff, Key } from 'lucide-react';

const socket = io(import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001');

const AudienceView = () => {
  const queryParams = new URLSearchParams(window.location.search);
  const isTvMode = queryParams.get('tv') === 'true';
  const urlLang = queryParams.get('lang');
  const urlRoom = queryParams.get('room');
  
  const urlEventParam = queryParams.get('event');
  const savedEventId = sessionStorage.getItem('audienceEventId');
  const initialEventId = urlEventParam || savedEventId || '';

  const [urlEvent, setUrlEvent] = useState(initialEventId);
  const [eventInput, setEventInput] = useState('');
  const [eventError, setEventError] = useState('');
  const [eventName, setEventName] = useState('Traducción en Vivo');

  const [roomName, setRoomName] = useState(urlRoom || '');
  const [availableRooms, setAvailableRooms] = useState([]);
  const [language, setLanguage] = useState(urlLang || 'es'); 
  const [translation, setTranslation] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [userMode, setUserMode] = useState(null);

  const [isSystemActive, setIsSystemActive] = useState(true);
  
  const [isVerifying, setIsVerifying] = useState(!!initialEventId);

  const audioPlayerRef = useRef(null);
  const audioQueue = useRef([]);
  const isPlaying = useRef(false);

  const wakeLockRef = useRef(null);

  const requestWakeLock = async () => {
    try {
      if ('wakeLock' in navigator) {
        wakeLockRef.current = await navigator.wakeLock.request('screen');
        wakeLockRef.current.addEventListener('release', () => {});
      }
    } catch (err) {
      console.warn(`[UX] No se pudo mantener la pantalla encendida: ${err.message}`);
    }
  };

  const releaseWakeLock = async () => {
    if (wakeLockRef.current !== null) {
      try {
        await wakeLockRef.current.release();
        wakeLockRef.current = null;
      } catch (err) {}
    }
  };

  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (wakeLockRef.current !== null && document.visibilityState === 'visible' && userMode) {
        await requestWakeLock();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [userMode]);

  const playNextInQueue = async () => {
    if (isPlaying.current || audioQueue.current.length === 0 || !isSystemActive) return;
    
    isPlaying.current = true;
    const nextAudioUrl = audioQueue.current.shift(); 
    
    if (audioPlayerRef.current) {
      audioPlayerRef.current.src = nextAudioUrl;
      try {
        await audioPlayerRef.current.play();
      } catch (error) {
        isPlaying.current = false;
        playNextInQueue(); 
      }
    }
  };

  const handleAudioEnded = () => {
    if (audioPlayerRef.current && audioPlayerRef.current.src) {
      URL.revokeObjectURL(audioPlayerRef.current.src);
    }
    isPlaying.current = false;
    playNextInQueue();
  };

  const verifyEvent = (eventId) => {
    socket.emit('check-event', eventId, (response) => {
      if (response.success) {
        setUrlEvent(eventId);
        setEventName(response.name);
        setEventError('');
        sessionStorage.setItem('audienceEventId', eventId);
        socket.emit('join-event-audience', eventId);
      } else {
        setEventError('Código de evento inválido o evento finalizado.');
        if (eventId === urlEvent) {
            setUrlEvent(''); 
        }
        sessionStorage.removeItem('audienceEventId');
      }
      setIsVerifying(false); 
    });
  };

  const handleEventSubmit = (e) => {
    e.preventDefault();
    if (!eventInput.trim()) return;
    setIsVerifying(true);
    verifyEvent(eventInput.trim());
  };

  useEffect(() => {
    socket.on('connect', () => {
      setIsConnected(true);
      if (isSystemActive && urlEvent) {
          verifyEvent(urlEvent);
      }
    });
    
    socket.on('disconnect', () => setIsConnected(false));

    socket.on('system-status', (status) => {
      setIsSystemActive(status);
      if (!status) {
        if (audioPlayerRef.current) {
          audioPlayerRef.current.pause();
          audioPlayerRef.current.src = "";
        }
        audioQueue.current = [];
        isPlaying.current = false;
        setTranslation('');
        releaseWakeLock();
      }
    });

    socket.on('event-info', (data) => {
        setEventName(data.name);
        setAvailableRooms(data.allRooms);
        setRoomName(prev => {
            if (!prev || !data.allRooms.includes(prev)) return data.allRooms[0] || '';
            return prev;
        });
    });

    socket.on('active-rooms', (rooms) => {
      if (!isSystemActive) return;
    });
    
    socket.on('translation-result', (data) => {
      if (!isSystemActive) return; 
      if (isTvMode || userMode === 'text') {
        let currentText = '';
        if (data.translations && data.translations[language]) {
          currentText = data.translations[language];
          setTranslation(currentText);
        } else if (data.original) {
          currentText = data.original;
          setTranslation(currentText);
        }
      }
    });

    socket.on('neural-audio', (data) => {
      if (!isSystemActive) return; 
      if (!isTvMode && userMode === 'audio' && data.language === language && data.audioBuffer) {
        const blob = new Blob([data.audioBuffer], { type: 'audio/mp3' });
        const url = URL.createObjectURL(blob);
        
        audioQueue.current.push(url);
        playNextInQueue();
      }
    });

    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('active-rooms');
      socket.off('event-info');
      socket.off('translation-result');
      socket.off('neural-audio');
      socket.off('system-status');
      releaseWakeLock();
    };
  }, [language, userMode, isTvMode, urlEvent, isSystemActive]); 

  useEffect(() => {
    if (isConnected && urlEvent && roomName && isSystemActive) {
      socket.emit('join-isolated-room', { eventId: urlEvent, roomName: roomName });
      setTranslation(''); 
      audioQueue.current = [];
    }
  }, [roomName, isConnected, isSystemActive, urlEvent]);

  const unlockAudioAndStart = async () => {
    try {
      if (audioPlayerRef.current) {
        audioPlayerRef.current.src = "data:audio/mp3;base64,//NExAAAAANIAAAAAExBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq";
        await audioPlayerRef.current.play();
      }
    } catch (e) {
      console.warn("[Audio] Advertencia de desbloqueo:", e);
    }
    setUserMode('audio');
    requestWakeLock();
  };

  const startTextMode = () => {
    setUserMode('text');
    requestWakeLock();
  };

  const switchMode = async () => {
    if (userMode === 'text') {
      await unlockAudioAndStart();
    } else {
      setUserMode('text');
      audioQueue.current = [];
      isPlaying.current = false;
      if (audioPlayerRef.current) {
        audioPlayerRef.current.pause();
        audioPlayerRef.current.src = "";
      }
      requestWakeLock();
    }
  };

  if (isVerifying) {
    return (
      <div className="flex flex-col h-screen w-full items-center justify-center p-6 bg-darker">
        <div className="flex flex-col items-center gap-6 animate-pulse">
          <img src="/logo.png" alt="Logo" className="h-14 w-auto object-contain drop-shadow-lg" onError={(e) => { e.target.style.display = 'none'; }} />
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
          <p className="text-gray-500 text-sm font-semibold tracking-widest uppercase">Validando evento...</p>
        </div>
      </div>
    );
  }

  if (!isSystemActive) {
    return (
      <div className="flex flex-col h-screen w-full items-center justify-center p-6 bg-black relative overflow-hidden">
        <div className="absolute inset-0 bg-darker/80 z-0"></div>
        <div className="w-full max-w-sm flex flex-col items-center z-10">
          <div className="bg-red-500/10 p-6 rounded-full mb-8">
            <PowerOff className="w-16 h-16 text-red-500/80" />
          </div>
          <h2 className="text-3xl font-bold text-white mb-3 text-center tracking-tight">Sistema Fuera de Línea</h2>
          <p className="text-gray-400 text-base text-center leading-relaxed max-w-xs">
            La plataforma de traducción simultánea se encuentra inactiva en este momento. Por favor, espera a que el administrador inicie el evento.
          </p>
        </div>
      </div>
    );
  }

  if (!urlEvent) {
    return (
      <div className="flex flex-col h-screen w-full items-center justify-center p-6 bg-darker">
        <div className="w-full max-w-sm flex flex-col items-center">
          <img src="/logo.png" alt="Logo" className="h-14 w-auto object-contain mb-6 drop-shadow-lg" onError={(e) => { e.target.style.display = 'none'; }} />
          
          <h2 className="text-2xl font-bold text-white mb-2 text-center tracking-tight">Traducción en Vivo</h2>
          <p className="text-gray-400 text-sm text-center mb-8 leading-relaxed">
            Ingresa el código del evento para acceder a las salas de traducción.
          </p>
          
          <form onSubmit={handleEventSubmit} className="w-full flex flex-col gap-4">
            <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <Key className="w-5 h-5 text-gray-500" />
                </div>
                <input 
                    type="text"
                    value={eventInput}
                    onChange={(e) => setEventInput(e.target.value.toUpperCase().trim())}
                    placeholder="Código de Evento"
                    className="w-full bg-dark border border-gray-700 text-white text-center text-lg font-bold tracking-widest rounded-xl py-4 px-10 focus:ring-2 focus:ring-primary focus:outline-none transition-all shadow-inner"
                />
            </div>
            {eventError && <p className="text-red-500 text-xs font-semibold text-center animate-pulse">{eventError}</p>}
            <button 
              type="submit"
              disabled={!eventInput.trim() || !isConnected}
              className="w-full bg-primary hover:bg-blue-600 text-white px-6 py-4 rounded-xl font-bold transition-all shadow-lg hover:shadow-blue-500/25 disabled:opacity-50 tracking-widest uppercase mt-2"
            >
              Ingresar al Evento
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ==================================================
  // VISTA MODO PROYECTOR (TV) - AHORA CON SELECTOR DE SALA
  // ==================================================
  if (isTvMode) {
    return (
      <div className="flex flex-col justify-end h-screen w-full bg-black p-8 md:p-16 lg:pb-24 overflow-hidden relative">
        <div className="absolute top-6 right-8 z-10 opacity-30 hover:opacity-100 transition-opacity duration-300 flex items-center gap-4">
          
          <div className="relative">
            <select 
              value={roomName}
              onChange={(e) => {
                setRoomName(e.target.value);
                setTranslation('');
              }}
              className="bg-gray-900 border border-gray-800 text-gray-500 text-xs font-bold uppercase tracking-wider rounded-lg px-3 py-1.5 focus:ring-1 focus:ring-gray-600 focus:outline-none appearance-none cursor-pointer"
            >
              {availableRooms.map((room) => (
                <option key={room} value={room}>{room}</option>
              ))}
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-600">
              <svg className="fill-current h-3 w-3" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
                <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/>
              </svg>
            </div>
          </div>

          <div className="relative">
            <select 
              value={language} 
              onChange={(e) => {
                setLanguage(e.target.value);
                setTranslation('');
              }}
              className="bg-gray-900 border border-gray-800 text-gray-500 text-xs font-bold uppercase tracking-wider rounded-lg px-3 py-1.5 focus:ring-1 focus:ring-gray-600 focus:outline-none appearance-none cursor-pointer"
            >
              <option value="es">Español</option>
              <option value="en">Inglés</option>
              <option value="de">Alemán</option>
              <option value="fr">Francés</option>
              <option value="pt">Portugués</option>
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-600">
              <svg className="fill-current h-3 w-3" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
                <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/>
              </svg>
            </div>
          </div>
        </div>

        <div className="w-full max-w-6xl mx-auto">
          <p className="text-4xl md:text-5xl lg:text-6xl font-medium text-white text-left leading-normal tracking-wide drop-shadow-2xl">
            {translation || "..."}
          </p>
        </div>
        
        <div className={`fixed bottom-4 right-4 w-2 h-2 rounded-full opacity-30 ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
      </div>
    );
  }

  // ==================================================
  // MODAL DE SELECCIÓN DE SALA Y MODO (MÓVIL)
  // ==================================================
  if (!userMode) {
    return (
      <div className="flex flex-col h-screen w-full items-center justify-center p-6 bg-darker">
        <div className="w-full max-w-sm flex flex-col items-center">
          <img src="/logo.png" alt="Logo" className="h-14 w-auto object-contain mb-6 drop-shadow-lg" onError={(e) => { e.target.style.display = 'none'; }} />
          
          <h2 className="text-2xl font-bold text-white mb-2 text-center tracking-tight">{eventName}</h2>
          <p className="text-gray-400 text-sm text-center mb-8 leading-relaxed">
            Asegúrate de estar en la sala correcta y elige cómo deseas seguir la conferencia.
          </p>
          
          <div className="w-full mb-6">
            <label className="flex items-center gap-2 text-xs font-semibold text-gray-400 mb-2 uppercase tracking-wider justify-center">
              Seleccionar Sala
            </label>
            <div className="relative">
              <select 
                value={roomName}
                onChange={(e) => setRoomName(e.target.value)}
                className="w-full bg-darker border border-gray-700 text-white text-center text-lg font-bold tracking-widest rounded-xl p-3 focus:ring-2 focus:ring-primary focus:outline-none transition-all shadow-inner appearance-none cursor-pointer"
              >
                {availableRooms.map((room) => (
                  <option key={room} value={room}>{room}</option>
                ))}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-gray-500">
                <svg className="fill-current h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
                  <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/>
                </svg>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-4 w-full">
            <button 
              onClick={startTextMode} 
              disabled={!roomName.trim()}
              className="group bg-dark border border-gray-700 hover:border-gray-500 p-5 rounded-2xl flex items-center gap-5 transition-all shadow-lg hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <div className="bg-gray-800 p-3 rounded-full group-hover:bg-gray-700 transition-colors">
                <MessageSquare className="w-6 h-6 text-white" />
              </div>
              <div className="flex flex-col items-start">
                <span className="text-white font-bold text-lg">Solo Subtítulos</span>
                <span className="text-gray-500 text-xs mt-1">Lectura silenciosa en pantalla</span>
              </div>
            </button>

            <button 
              onClick={unlockAudioAndStart} 
              disabled={!roomName.trim()}
              className="group bg-primary hover:bg-blue-600 border border-primary p-5 rounded-2xl flex items-center gap-5 transition-all shadow-lg shadow-blue-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <div className="bg-white/10 p-3 rounded-full">
                <Headphones className="w-6 h-6 text-white" />
              </div>
              <div className="flex flex-col items-start">
                <span className="text-white font-bold text-lg">Solo Audio</span>
                <span className="text-blue-100/70 text-xs mt-1">Requiere uso de audífonos</span>
              </div>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen w-full p-6 max-w-md mx-auto bg-darker relative">
      
      <audio ref={audioPlayerRef} onEnded={handleAudioEnded} className="hidden" />

      <header className="flex justify-between items-center mb-6 pb-4 border-b border-gray-800 shrink-0">
        <div className="flex items-center gap-3">
          <img src="/logo.png" alt="Logo" className="h-8 w-auto object-contain" onError={(e) => { e.target.style.display = 'none'; }} />
          <div className="flex flex-col">
            <h1 className="text-base font-bold text-white leading-tight truncate max-w-[150px]">{eventName}</h1>
            <span className="text-xs text-primary font-bold tracking-widest">{roomName}</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs font-bold text-gray-500 uppercase tracking-widest hidden sm:inline-block">
            {userMode === 'text' ? 'Lectura' : 'Escucha'}
          </span>
          <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-accent animate-pulse shadow-[0_0_10px_rgba(16,185,129,0.5)]' : 'bg-red-500'}`} />
        </div>
      </header>

      <div className="mb-6 shrink-0">
        <label className="flex items-center gap-2 text-sm font-semibold text-gray-400 mb-3 uppercase tracking-wider">
          <Globe2 className="w-4 h-4" />
          Idioma de destino
        </label>
        <div className="relative">
          <select 
            value={language} 
            onChange={(e) => {
              setLanguage(e.target.value);
              setTranslation('');
              audioQueue.current = []; 
            }}
            className="w-full bg-dark border border-gray-700 text-white text-lg rounded-xl p-4 focus:ring-2 focus:ring-accent focus:outline-none appearance-none cursor-pointer"
          >
            <option value="es">Español</option>
            <option value="en">English (Inglés)</option>
            <option value="de">Deutsch (Alemán)</option>
            <option value="fr">Français (Francés)</option>
            <option value="pt">Português (Portugués)</option>
          </select>
          <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-gray-400">
            <svg className="fill-current h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
              <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/>
            </svg>
          </div>
        </div>
      </div>

      <main className="flex-1 flex flex-col justify-end pb-6 overflow-hidden">
        {userMode === 'text' ? (
          <p className="text-2xl md:text-3xl font-normal leading-relaxed text-white min-h-[5rem] text-left tracking-wide">
            {translation || "Esperando al orador..."}
          </p>
        ) : (
          <div className="flex flex-col items-center justify-center h-full mb-4 opacity-70">
            <div className="relative flex items-center justify-center w-32 h-32 mb-6">
              <div className="absolute inset-0 bg-primary/20 rounded-full animate-ping"></div>
              <div className="absolute inset-4 bg-primary/40 rounded-full animate-pulse"></div>
              <div className="relative bg-primary p-6 rounded-full shadow-lg shadow-blue-500/50">
                <Radio className="w-10 h-10 text-white" />
              </div>
            </div>
            <p className="text-gray-400 text-center text-lg font-medium tracking-wide">
              Audio neuronal activo
            </p>
            <p className="text-gray-500 text-sm text-center mt-2 px-4">
              La transcripción visual está pausada para maximizar el rendimiento.
            </p>
          </div>
        )}
      </main>

      <footer className="shrink-0 pb-4 pt-2 border-t border-gray-800/50">
        <button
          onClick={switchMode}
          className="w-full group relative flex items-center justify-center gap-3 bg-dark border border-gray-700 hover:border-gray-500 p-4 rounded-xl transition-all shadow-lg overflow-hidden"
        >
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
          
          {userMode === 'text' ? (
            <>
              <Headphones className="w-5 h-5 text-gray-400 group-hover:text-white transition-colors" />
              <span className="text-gray-300 font-medium tracking-wide">Cambiar a Modo Audio</span>
            </>
          ) : (
            <>
              <MessageSquare className="w-5 h-5 text-gray-400 group-hover:text-white transition-colors" />
              <span className="text-gray-300 font-medium tracking-wide">Cambiar a Modo Texto</span>
            </>
          )}
        </button>
      </footer>

    </div>
  );
};

export default AudienceView;