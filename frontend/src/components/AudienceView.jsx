import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { Headphones, Globe2, AlertCircle, MessageSquare, Radio, PowerOff, Key, LogOut, QrCode, X } from 'lucide-react';
import { Scanner } from '@yudiel/react-qr-scanner';

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

  const [eventLogo, setEventLogo] = useState('');
  const [eventSponsor, setEventSponsor] = useState('');

  const [roomName, setRoomName] = useState(urlRoom || '');
  const [availableRooms, setAvailableRooms] = useState([]);
  const [language, setLanguage] = useState(urlLang || 'es'); 
  
  const [finalTexts, setFinalTexts] = useState([]); 
  const [partialText, setPartialText] = useState(''); 
  
  const [isConnected, setIsConnected] = useState(false);
  const [userMode, setUserMode] = useState(null);

  const [isSystemActive, setIsSystemActive] = useState(true);
  const [isEventActive, setIsEventActive] = useState(true); 
  
  const [isVerifying, setIsVerifying] = useState(!!initialEventId);
  const [hasJoinedEvent, setHasJoinedEvent] = useState(false);
  
  const [isScanning, setIsScanning] = useState(false);

  const [dialogConfig, setDialogConfig] = useState({ isOpen: false, title: '', message: '', type: 'confirm', onConfirm: null, confirmStyle: '' });

  const openDialog = (title, message, type = 'confirm', onConfirm = null, confirmStyle = 'bg-red-600 hover:bg-red-700 shadow-red-500/25') => {
    setDialogConfig({ isOpen: true, title, message, type, onConfirm, confirmStyle });
  };
  const closeDialog = () => setDialogConfig(prev => ({ ...prev, isOpen: false }));

  const audioPlayerRef = useRef(null);
  const audioQueue = useRef([]);
  const isPlaying = useRef(false);
  const messagesEndRef = useRef(null);

  const wakeLockRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [finalTexts, partialText]);

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
    if (isPlaying.current || audioQueue.current.length === 0 || !isSystemActive || !isEventActive) return;
    
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
        setEventLogo(response.logoUrl || '');
        setEventSponsor(response.sponsorText || '');
        setEventError('');
        sessionStorage.setItem('audienceEventId', eventId);
        
        socket.emit('join-event-audience', { eventId: eventId, language: language });
        setHasJoinedEvent(true); 
      } else {
        setEventError('Código de evento inválido o evento finalizado.');
        if (eventId === urlEvent) {
            setUrlEvent(''); 
        }
        sessionStorage.removeItem('audienceEventId');
        setHasJoinedEvent(false);
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

  const handleQRScan = (data) => {
    let scannedText = '';
    
    if (typeof data === 'string') {
        scannedText = data;
    } else if (Array.isArray(data) && data.length > 0) {
        scannedText = data[0].rawValue || data[0].text || '';
    } else if (data && data.text) {
        scannedText = data.text;
    }

    if (scannedText) {
        setIsScanning(false); 
        let extractedCode = scannedText;
        
        try {
            const url = new URL(scannedText);
            const eventParam = url.searchParams.get('event');
            if (eventParam) extractedCode = eventParam;
        } catch (e) {
            
        }
        
        const finalCode = extractedCode.toUpperCase().trim();
        setEventInput(finalCode);
        setIsVerifying(true);
        verifyEvent(finalCode);
    }
  };

  const handleExitEvent = () => {
    openDialog(
      "Salir del Evento",
      "¿Deseas salir de este evento y volver al menú principal de acceso?",
      "confirm",
      () => {
        socket.emit('leave-event-audience'); 
        sessionStorage.removeItem('audienceEventId');
        setUrlEvent('');
        setRoomName('');
        setEventInput('');
        setUserMode(null);
        setFinalTexts([]);
        setPartialText('');
        setEventLogo('');
        setEventSponsor('');
        setHasJoinedEvent(false); 
        audioQueue.current = [];
        isPlaying.current = false;
        if (audioPlayerRef.current) {
          audioPlayerRef.current.pause();
          audioPlayerRef.current.src = "";
        }
        releaseWakeLock();
      }
    );
  };

  const stopPlaybackAndClear = () => {
      if (audioPlayerRef.current) {
        audioPlayerRef.current.pause();
        audioPlayerRef.current.src = "";
      }
      audioQueue.current = [];
      isPlaying.current = false;
      setFinalTexts([]);
      setPartialText('');
      releaseWakeLock();
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
      if (!status) stopPlaybackAndClear();
    });

    socket.on('event-status-changed', (data) => {
        if (data.eventId === urlEvent) {
            setIsEventActive(data.status);
            if (!data.status) stopPlaybackAndClear();
        }
    });

    socket.on('event-info', (data) => {
        setEventName(data.name);
        setAvailableRooms(data.allRooms);
        setIsEventActive(data.isActive); 
        setEventLogo(data.logoUrl || '');
        setEventSponsor(data.sponsorText || '');
        setRoomName(prev => {
            if (!prev || !data.allRooms.includes(prev)) return data.allRooms[0] || '';
            return prev;
        });
    });

    socket.on('active-rooms', (rooms) => {});
    
    socket.on('translation-result', (data) => {
      if (!isSystemActive || !isEventActive) return; 
      
      if (isTvMode || userMode === 'text') {
        let currentText = '';
        if (data.translations && data.translations[language]) {
          currentText = data.translations[language];
        } else if (data.original) {
          currentText = data.original;
        }

        if (data.type === 'partial') {
          setPartialText(currentText);
        } else if (data.type === 'final') {
          if (currentText.trim() !== '') {
            setFinalTexts(prev => {
              const newTexts = [...prev, currentText];
              const limit = isTvMode ? 5 : 4; 
              return newTexts.slice(-limit);
            });
          }
          setPartialText('');
        }
      }
    });

    socket.on('neural-audio', (data) => {
      if (!isSystemActive || !isEventActive) return; 
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
      socket.off('event-status-changed');
      socket.off('translation-result');
      socket.off('neural-audio');
      socket.off('system-status');
      releaseWakeLock();
    };
  }, [language, userMode, isTvMode, urlEvent, isSystemActive, isEventActive]); 

  useEffect(() => {
    if (isConnected && urlEvent && roomName && isSystemActive && isEventActive && hasJoinedEvent) {
      socket.emit('join-isolated-room', { eventId: urlEvent, roomName: roomName });
      setFinalTexts([]); 
      setPartialText('');
      audioQueue.current = [];
    }
  }, [roomName, isConnected, isSystemActive, isEventActive, urlEvent, hasJoinedEvent]);

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

  if (isScanning) {
    return (
        <div className="fixed inset-0 z-50 flex flex-col bg-black">
            <div className="flex justify-between items-center p-6 bg-darker border-b border-gray-800 shrink-0">
                <h3 className="text-white font-bold tracking-widest uppercase flex items-center gap-3">
                    <QrCode className="w-5 h-5 text-primary" />
                    Escanear Acceso
                </h3>
                <button 
                    onClick={() => setIsScanning(false)} 
                    className="text-gray-400 hover:text-white bg-gray-800 p-2 rounded-full transition-colors"
                >
                    <X className="w-5 h-5" />
                </button>
            </div>
            <div className="flex-1 relative flex flex-col items-center justify-center bg-black p-6">
                <p className="text-gray-400 text-sm text-center mb-8 max-w-xs">
                    Apunta la cámara al código QR del evento para ingresar automáticamente.
                </p>
                <div className="w-full max-w-sm rounded-3xl overflow-hidden shadow-[0_0_50px_rgba(16,185,129,0.15)] border border-primary/30 relative bg-darker">
                    <Scanner
                        onScan={(result) => handleQRScan(result)}
                        onError={(error) => console.log("[Scanner] Error/Esperando cámara:", error)}
                        constraints={{ facingMode: 'environment' }}
                        components={{ audio: false, onOff: true }}
                    />
                </div>
            </div>
        </div>
    );
  }

  if (!isSystemActive || (urlEvent && !isEventActive)) {
    return (
      <div className="flex flex-col h-screen w-full items-center justify-center p-6 bg-black relative overflow-hidden">
        
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
                  Confirmar
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="absolute inset-0 bg-darker/80 z-0"></div>
        <div className="w-full max-w-sm flex flex-col items-center z-10">
          <div className="bg-red-500/10 p-6 rounded-full mb-8">
            <PowerOff className="w-16 h-16 text-red-500/80" />
          </div>
          <h2 className="text-3xl font-bold text-white mb-3 text-center tracking-tight">Evento Pausado</h2>
          <p className="text-gray-400 text-base text-center leading-relaxed max-w-xs mb-8">
            La plataforma de traducción se encuentra inactiva en este momento. Por favor, espera a que se inicie el evento.
          </p>
          <button 
            onClick={handleExitEvent}
            className="text-gray-500 hover:text-white transition-colors flex items-center gap-2 text-xs font-bold uppercase tracking-widest border border-gray-800 rounded-lg px-4 py-2"
          >
            <LogOut className="w-4 h-4" />
            Salir al menú
          </button>
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
            Ingresa el código manual o escanea el QR del evento para acceder.
          </p>
          
          <form onSubmit={handleEventSubmit} className="w-full flex flex-col gap-4">
            <div className="relative flex items-center">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <Key className="w-5 h-5 text-gray-500" />
                </div>
                <input 
                    type="text"
                    value={eventInput}
                    onChange={(e) => setEventInput(e.target.value.toUpperCase().trim())}
                    placeholder="Código"
                    className="w-full bg-dark border border-gray-700 text-white text-center text-lg font-bold tracking-widest rounded-xl py-4 pl-10 pr-16 focus:ring-2 focus:ring-primary focus:outline-none transition-all shadow-inner"
                />
                <button
                    type="button"
                    onClick={() => setIsScanning(true)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-2.5 bg-gray-800 border border-gray-700 rounded-lg text-primary hover:bg-primary hover:text-white hover:border-primary transition-all shadow-lg"
                    title="Escanear QR"
                >
                    <QrCode className="w-5 h-5" />
                </button>
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

  if (isTvMode) {
    return (
      <div className="flex flex-col h-screen w-full bg-black p-8 md:p-16 lg:pb-16 overflow-hidden relative">
        
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
                  Confirmar
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="absolute top-6 right-8 z-10 flex items-center gap-4 bg-dark/80 p-3 rounded-2xl backdrop-blur-md border border-gray-800 shadow-xl transition-all duration-500 opacity-10 hover:opacity-100 hover:bg-dark">
          <div className="relative">
            <select 
              value={roomName}
              onChange={(e) => setRoomName(e.target.value)}
              className="bg-black/50 border border-gray-700 text-gray-300 text-xs font-bold uppercase tracking-wider rounded-lg px-3 py-2 focus:ring-1 focus:ring-primary focus:outline-none appearance-none cursor-pointer"
            >
              {availableRooms.map((room) => (
                <option key={room} value={room}>{room}</option>
              ))}
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-500">
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
                setFinalTexts([]);
                setPartialText('');
                socket.emit('audience-change-lang', e.target.value);
              }}
              className="bg-black/50 border border-gray-700 text-gray-300 text-xs font-bold uppercase tracking-wider rounded-lg px-3 py-2 focus:ring-1 focus:ring-primary focus:outline-none appearance-none cursor-pointer"
            >
              <option value="es">Español</option>
              <option value="en">Inglés</option>
              <option value="de">Alemán</option>
              <option value="fr">Francés</option>
              <option value="pt">Portugués</option>
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-500">
              <svg className="fill-current h-3 w-3" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
                <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/>
              </svg>
            </div>
          </div>

          <button 
            onClick={handleExitEvent}
            className="bg-red-500/10 hover:bg-red-500 border border-red-500/30 text-red-500 hover:text-white text-xs font-bold uppercase tracking-wider rounded-lg px-4 py-2 transition-all flex items-center gap-2 shadow-sm"
            title="Desconectar y Salir del Evento"
          >
            <LogOut className="w-3 h-3" /> Salir
          </button>
        </div>

        <div className="w-full max-w-6xl mx-auto flex-1 flex flex-col justify-end gap-6 overflow-hidden relative z-0">
          {finalTexts.map((text, idx) => (
            <p key={idx} className="text-4xl md:text-5xl lg:text-6xl font-medium text-white/50 text-left leading-normal tracking-wide drop-shadow-2xl transition-all duration-300">
              {text}
            </p>
          ))}
          <p className="text-4xl md:text-5xl lg:text-6xl font-medium text-white text-left leading-normal tracking-wide drop-shadow-2xl min-h-[5rem] transition-all duration-200">
            {partialText || (finalTexts.length === 0 ? "..." : "")}
          </p>
          <div ref={messagesEndRef} />
        </div>
        
        {(eventLogo || eventSponsor) && (
            <div className="absolute bottom-8 left-8 z-10 flex items-center gap-4 opacity-70">
                {eventLogo && <img src={eventLogo} alt="Sponsor Logo" className="h-12 w-auto object-contain" onError={(e) => { e.target.style.display = 'none'; }} />}
                {eventSponsor && <span className="text-white/70 text-sm font-semibold tracking-wider">{eventSponsor}</span>}
            </div>
        )}

        <div className={`fixed bottom-4 right-4 w-2 h-2 rounded-full opacity-30 ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
      </div>
    );
  }

  // ==========================================
  // VISTA CORREGIDA: SELECCIÓN DE SALA Y MODO
  // ==========================================
  if (!userMode) {
    return (
      <div className="flex flex-col h-screen w-full items-center justify-center p-6 bg-darker relative">
        
        {/* MODAL INYECTADO AQUÍ */}
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
                  Confirmar
                </button>
              </div>
            </div>
          </div>
        )}

        <button 
          onClick={handleExitEvent}
          className="absolute top-6 right-6 text-gray-500 hover:text-red-500 transition-colors flex items-center gap-2 text-xs font-bold uppercase tracking-widest"
        >
          <LogOut className="w-4 h-4" />
          Salir
        </button>

        <div className="w-full max-w-sm flex flex-col items-center mt-6">
          <img src={eventLogo || "/logo.png"} alt="Event Logo" className="h-16 w-auto object-contain mb-6 drop-shadow-lg" onError={(e) => { e.target.src = '/logo.png'; }} />
          
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
          
          {eventSponsor && (
             <div className="mt-8 text-xs font-semibold text-gray-500 tracking-wider uppercase text-center w-full">
                 {eventSponsor}
             </div>
          )}

        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen w-full p-6 max-w-md mx-auto bg-darker relative">
      
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
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      <audio ref={audioPlayerRef} onEnded={handleAudioEnded} className="hidden" />

      <header className="flex justify-between items-center mb-6 pb-4 border-b border-gray-800 shrink-0">
        <div className="flex items-center gap-3">
          <img src={eventLogo || "/logo.png"} alt="Event Logo" className="h-8 w-auto object-contain" onError={(e) => { e.target.src = '/logo.png'; }} />
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
          <button 
            onClick={handleExitEvent}
            className="ml-2 text-gray-600 hover:text-red-500 transition-colors"
            title="Salir del Evento"
          >
            <LogOut className="w-5 h-5" />
          </button>
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
              setFinalTexts([]);
              setPartialText('');
              audioQueue.current = []; 
              socket.emit('audience-change-lang', e.target.value);
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
          
          <div className="flex flex-col gap-4 justify-end h-full w-full overflow-hidden">
            {finalTexts.map((text, idx) => (
              <p key={idx} className="text-2xl md:text-3xl font-normal leading-relaxed text-white/50 text-left tracking-wide transition-all duration-300">
                {text}
              </p>
            ))}
            <p className="text-2xl md:text-3xl font-medium leading-relaxed text-white min-h-[3rem] text-left tracking-wide transition-all duration-200">
              {partialText || (finalTexts.length === 0 ? "Esperando al orador..." : "")}
            </p>
            <div ref={messagesEndRef} />
          </div>

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

      <footer className="shrink-0 pb-4 pt-2 border-t border-gray-800/50 flex flex-col items-center">
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

        {eventSponsor && (
            <div className="mt-4 text-[10px] font-bold text-gray-600 tracking-widest uppercase text-center w-full">
                {eventSponsor}
            </div>
        )}
      </footer>

    </div>
  );
};

export default AudienceView;