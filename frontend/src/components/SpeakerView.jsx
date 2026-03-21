import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { Mic, Square, Power, Settings, Globe2, Activity, Volume2, Users, AlertCircle, LogOut } from 'lucide-react';
import hark from 'hark';

const socket = io(import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001', { autoConnect: false });

const SpeakerView = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(sessionStorage.getItem('isSpeakerAuth') === 'true');
  const [passwordInput, setPasswordInput] = useState('');
  const [loginError, setLoginError] = useState('');
  const [currentEvent, setCurrentEvent] = useState(null);
  
  const [isSystemActive, setIsSystemActive] = useState(false);
  const [isEventActive, setIsEventActive] = useState(true);

  const [isRecording, setIsRecording] = useState(false);
  const [roomName, setRoomName] = useState('');
  const [fromLanguage, setFromLanguage] = useState('es-CO');
  const [voiceGender, setVoiceGender] = useState('female');
  
  const [partialText, setPartialText] = useState('');
  const [finalTexts, setFinalTexts] = useState([]);
  const [isSpeaking, setIsSpeaking] = useState(false);

  // NUEVO: Estado para rastrear cuánta gente está escuchando en esta sala
  const [audienceCount, setAudienceCount] = useState(0);

  const [dialogConfig, setDialogConfig] = useState({ isOpen: false, title: '', message: '', type: 'confirm', onConfirm: null, confirmStyle: '' });

  const mediaRecorder = useRef(null);
  const audioContext = useRef(null);
  const processor = useRef(null);
  const source = useRef(null);
  const speechEvents = useRef(null);
  const messagesEndRef = useRef(null);

  const openDialog = (title, message, type = 'confirm', onConfirm = null, confirmStyle = 'bg-red-600 hover:bg-red-700 shadow-red-500/25') => {
    setDialogConfig({ isOpen: true, title, message, type, onConfirm, confirmStyle });
  };
  const closeDialog = () => setDialogConfig(prev => ({ ...prev, isOpen: false }));

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [finalTexts, partialText]);

  useEffect(() => {
    if (!isAuthenticated) return;
    
    socket.connect();
    
    socket.on('system-status', (status) => {
        setIsSystemActive(status);
        if (!status && isRecording) {
            stopRecording(true);
            openDialog("Central Desconectada", "El administrador general ha apagado el sistema. La transmisión se ha detenido.", "alert");
        }
    });

    socket.on('event-status-changed', (data) => {
        if (currentEvent && data.eventId === currentEvent.id) {
            setIsEventActive(data.status);
            if (!data.status && isRecording) {
                stopRecording(true);
                openDialog("Evento Pausado", "El administrador ha pausado este evento. La transmisión se ha detenido.", "alert");
            }
        }
    });

    socket.on('translation-result', (data) => {
      if (data.type === 'partial') {
        setPartialText(data.original);
      } else if (data.type === 'final') {
        if (data.original.trim() !== '') {
          setFinalTexts(prev => [...prev, data.original]);
        }
        setPartialText('');
      }
    });

    // NUEVO: Escuchar el contador de audiencia en vivo desde el servidor
    socket.on('room-audience-count', (count) => {
      setAudienceCount(count);
    });

    return () => {
      if (isRecording) stopRecording(true);
      socket.disconnect();
    };
  }, [isAuthenticated, isRecording, currentEvent]);

  useEffect(() => {
    if (isAuthenticated && !currentEvent) {
        socket.emit('speaker-login', sessionStorage.getItem('lastSpeakerPwd'), (response) => {
            if (response.success) {
                setCurrentEvent(response.event);
                if (response.event.rooms.length > 0) setRoomName(response.event.rooms[0]);
            } else {
                handleLogout();
            }
        });
    }
  }, [isAuthenticated, currentEvent]);

  const handleLogin = (e) => {
    e.preventDefault();
    socket.connect();
    socket.emit('speaker-login', passwordInput, (response) => {
      if (response.success) {
        setIsAuthenticated(true);
        setCurrentEvent(response.event);
        if (response.event.rooms.length > 0) setRoomName(response.event.rooms[0]);
        sessionStorage.setItem('isSpeakerAuth', 'true');
        sessionStorage.setItem('lastSpeakerPwd', passwordInput);
        setLoginError('');
      } else {
        setLoginError(response.message || 'Clave de evento incorrecta.');
        setPasswordInput('');
        socket.disconnect();
      }
    });
  };

  const handleLogout = () => {
    openDialog(
      "Cerrar Sesión", 
      "¿Deseas desconectarte de la cabina de transmisión?", 
      "confirm", 
      () => {
        if (isRecording) stopRecording(true);
        setIsAuthenticated(false);
        setCurrentEvent(null);
        sessionStorage.removeItem('isSpeakerAuth');
        sessionStorage.removeItem('lastSpeakerPwd');
        socket.disconnect();
      }
    );
  };

  const startRecording = async () => {
    if (!isSystemActive || !isEventActive) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: { 
          echoCancellation: true, 
          noiseSuppression: true, 
          autoGainControl: true 
        } 
      });

      audioContext.current = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
      source.current = audioContext.current.createMediaStreamSource(stream);

      speechEvents.current = hark(stream, { threshold: -55, interval: 50 });
      speechEvents.current.on('speaking', () => setIsSpeaking(true));
      speechEvents.current.on('stopped_speaking', () => setIsSpeaking(false));

      processor.current = audioContext.current.createScriptProcessor(4096, 1, 1);
      
      processor.current.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        const pcm16 = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
          let s = Math.max(-1, Math.min(1, inputData[i]));
          pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }
        if (socket.connected) {
          socket.emit('audio-stream', pcm16.buffer);
        }
      };

      source.current.connect(processor.current);
      processor.current.connect(audioContext.current.destination);

      socket.emit('start-translation', {
        eventId: currentEvent.id,
        roomName,
        fromLanguage,
        toLanguages: ['en', 'pt', 'de', 'fr'],
        voiceGender
      });

      setIsRecording(true);
      setFinalTexts([]);
      setPartialText('');
      setAudienceCount(0); // Reiniciar el contador visual al conectar

    } catch (err) {
      console.error("[!] Error accediendo al micrófono:", err);
      openDialog("Error de Micrófono", "No se pudo acceder al micrófono. Verifica los permisos de tu navegador.", "alert");
    }
  };

  const stopRecording = (force = false) => {
    if (!force) {
        openDialog(
          "Detener Transmisión", 
          "¿Estás seguro de que deseas detener la transmisión en vivo?", 
          "confirm", 
          () => executeStop()
        );
    } else {
        executeStop();
    }
  };

  const executeStop = () => {
    if (processor.current) {
        processor.current.disconnect();
        processor.current = null;
      }
      if (source.current) {
        source.current.disconnect();
        source.current = null;
      }
      if (audioContext.current) {
        audioContext.current.close();
        audioContext.current = null;
      }
      if (speechEvents.current) {
        speechEvents.current.stop();
        speechEvents.current = null;
      }
      
      socket.emit('stop-translation');
      setIsRecording(false);
      setIsSpeaking(false);
      setAudienceCount(0); // Reiniciar el contador al apagar
  };

  if (!isAuthenticated) {
    return (
      <div className="flex flex-col h-screen w-full items-center justify-center p-6 bg-black">
        <div className="bg-darker border border-primary/30 p-8 rounded-3xl shadow-2xl shadow-primary/10 max-w-md w-full flex flex-col items-center gap-6 text-center">
          <div className="bg-primary/10 p-5 rounded-full">
            <Mic className="w-10 h-10 text-primary" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-white mb-2 tracking-widest uppercase">Cabina de Orador</h2>
            <p className="text-gray-400 text-sm leading-relaxed">Ingresa la clave proporcionada por el administrador del evento.</p>
          </div>
          <form onSubmit={handleLogin} className="w-full flex flex-col gap-4 mt-2">
            <input
              type="text"
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value.toUpperCase().trim())}
              placeholder="Clave de Orador"
              className="w-full bg-black border border-gray-800 text-primary text-xl rounded-xl p-4 focus:ring-2 focus:ring-primary focus:outline-none text-center tracking-widest transition-all uppercase"
            />
            {loginError && <p className="text-red-500 text-xs font-semibold animate-pulse">{loginError}</p>}
            <button
              type="submit"
              className="w-full bg-primary hover:bg-blue-600 text-white px-6 py-4 rounded-xl font-bold transition-all shadow-lg hover:shadow-blue-500/25 mt-2 tracking-widest uppercase"
            >
              Conectar Cabina
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (!currentEvent) return null;

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

      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8 shrink-0 bg-dark p-6 rounded-2xl border border-gray-800 shadow-xl">
        <div className="flex items-center gap-4 w-full sm:w-auto">
          <div className="bg-primary/10 p-3 rounded-xl hidden sm:block">
            <Mic className="w-8 h-8 text-primary" />
          </div>
          <div className="flex flex-col flex-1">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white uppercase truncate">{currentEvent.name}</h1>
            <span className="text-xs text-gray-500 font-bold tracking-widest flex items-center justify-between sm:justify-start gap-4">
               <span>CABINA DE TRADUCCIÓN</span>
               {(!isSystemActive || !isEventActive) && (
                   <span className="text-red-500 animate-pulse bg-red-500/10 px-2 py-0.5 rounded border border-red-500/20">FUERA DE SERVICIO</span>
               )}
            </span>
          </div>
          <button onClick={handleLogout} className="p-2 bg-gray-800 text-gray-400 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-colors sm:hidden">
              <LogOut className="w-5 h-5" />
          </button>
        </div>
        
        <div className="flex items-center gap-4 w-full sm:w-auto">
            <div className={`px-4 py-2 rounded-xl flex items-center gap-2 font-bold text-xs uppercase tracking-widest border shadow-inner w-full justify-center sm:w-auto ${
            isRecording 
                ? 'bg-red-500/10 text-red-500 border-red-500/30' 
                : 'bg-black border-gray-800 text-gray-500'
            }`}>
            <div className={`w-2 h-2 rounded-full ${isRecording ? 'bg-red-500 animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.8)]' : 'bg-gray-600'}`}></div>
            {isRecording ? 'MICRÓFONO EN VIVO' : 'EN ESPERA'}
            </div>
            <button onClick={handleLogout} className="p-2 bg-gray-800 text-gray-400 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-colors hidden sm:block">
                <LogOut className="w-5 h-5" />
            </button>
        </div>
      </header>

      <div className={`grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 overflow-hidden transition-all ${(!isSystemActive || !isEventActive) ? 'opacity-40 pointer-events-none grayscale' : ''}`}>
        
        {/* PANEL DE CONTROL (IZQUIERDA) */}
        <div className="lg:col-span-1 bg-dark border border-gray-800 rounded-2xl flex flex-col shadow-lg overflow-hidden shrink-0">
          <div className="p-4 border-b border-gray-800 bg-black/20 flex items-center gap-2">
            <Settings className="w-4 h-4 text-gray-500" />
            <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest">Configuración de Envío</h2>
          </div>
          
          <div className="p-6 flex flex-col gap-6 flex-1 overflow-y-auto">
            <div>
              <label className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2 flex items-center gap-2">
                <Activity className="w-3 h-3" /> Sala de Transmisión
              </label>
              <select 
                value={roomName}
                onChange={(e) => setRoomName(e.target.value)}
                disabled={isRecording}
                className="w-full bg-black border border-gray-700 text-white text-sm rounded-xl p-3.5 focus:ring-2 focus:ring-primary focus:outline-none appearance-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed uppercase tracking-wider font-bold"
              >
                {currentEvent.rooms.map((room) => (
                  <option key={room} value={room}>{room}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2 flex items-center gap-2">
                <Globe2 className="w-3 h-3" /> Idioma del Orador
              </label>
              <select 
                value={fromLanguage}
                onChange={(e) => setFromLanguage(e.target.value)}
                disabled={isRecording}
                className="w-full bg-black border border-gray-700 text-white text-sm rounded-xl p-3.5 focus:ring-2 focus:ring-primary focus:outline-none appearance-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed tracking-wide"
              >
                <option value="es-CO">Español (Colombia)</option>
                <option value="es-ES">Español (España)</option>
                <option value="es-MX">Español (México)</option>
                <option value="en-US">Inglés (US)</option>
                <option value="en-GB">Inglés (UK)</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2 flex items-center gap-2">
                <Volume2 className="w-3 h-3" /> Voz de la IA (Traducción)
              </label>
              <div className="flex bg-black rounded-xl p-1 border border-gray-700">
                <button
                  onClick={() => setVoiceGender('female')}
                  disabled={isRecording}
                  className={`flex-1 py-2.5 rounded-lg text-sm font-bold tracking-wide transition-all ${
                    voiceGender === 'female' 
                      ? 'bg-primary text-white shadow-lg shadow-blue-500/25' 
                      : 'text-gray-500 hover:text-gray-300 disabled:hover:text-gray-500'
                  }`}
                >
                  Femenina
                </button>
                <button
                  onClick={() => setVoiceGender('male')}
                  disabled={isRecording}
                  className={`flex-1 py-2.5 rounded-lg text-sm font-bold tracking-wide transition-all ${
                    voiceGender === 'male' 
                      ? 'bg-primary text-white shadow-lg shadow-blue-500/25' 
                      : 'text-gray-500 hover:text-gray-300 disabled:hover:text-gray-500'
                  }`}
                >
                  Masculina
                </button>
              </div>
            </div>

            <div className="mt-auto pt-6 border-t border-gray-800">
              {!isRecording ? (
                <button 
                  onClick={startRecording}
                  disabled={!isSystemActive || !isEventActive}
                  className="w-full bg-primary hover:bg-blue-600 text-white px-6 py-5 rounded-xl font-bold text-sm tracking-widest uppercase transition-all shadow-lg hover:shadow-blue-500/25 flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Power className="w-5 h-5" />
                  Iniciar Transmisión
                </button>
              ) : (
                <button 
                  onClick={() => stopRecording()}
                  className="w-full bg-red-600 hover:bg-red-700 text-white px-6 py-5 rounded-xl font-bold text-sm tracking-widest uppercase transition-all shadow-lg hover:shadow-red-500/25 flex items-center justify-center gap-3 animate-pulse"
                >
                  <Square className="w-5 h-5 fill-current" />
                  Detener Transmisión
                </button>
              )}
            </div>
          </div>
        </div>

        {/* MONITOR DE RETORNO (DERECHA) */}
        <div className="lg:col-span-2 bg-black border border-gray-800 rounded-2xl flex flex-col shadow-inner overflow-hidden relative">
          
          <div className="p-4 border-b border-gray-800 bg-dark flex justify-between items-center z-10 shrink-0">
            <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
                <Mic className="w-4 h-4" />
                Retorno de Reconocimiento (IA)
            </h2>

            {/* NUEVO: WIDGET DE AUDIENCIA EN VIVO */}
            {isRecording && (
                <div className="flex items-center gap-2 bg-green-500/10 border border-green-500/30 px-3 py-1.5 rounded-lg shadow-lg shadow-green-500/10 transition-all duration-300">
                    <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></div>
                    <Users className="w-3.5 h-3.5 text-green-500" />
                    <span className="text-white font-bold text-sm leading-none">{audienceCount}</span>
                    <span className="text-gray-400 text-[10px] font-bold tracking-widest uppercase ml-0.5">Oyentes</span>
                </div>
            )}
          </div>

          <div className="flex-1 p-6 lg:p-10 overflow-y-auto flex flex-col justify-end gap-4 relative">
            {!isRecording && finalTexts.length === 0 && (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-600">
                    <Mic className="w-16 h-16 mb-4 opacity-20" />
                    <p className="text-lg font-medium tracking-wide">La cabina está inactiva</p>
                    <p className="text-sm mt-2 opacity-50">Inicia la transmisión para que la IA comience a escuchar.</p>
                </div>
            )}

            {finalTexts.map((text, idx) => (
              <p key={idx} className="text-2xl lg:text-3xl font-normal leading-relaxed text-white/40 tracking-wide transition-all duration-500 transform translate-y-0 opacity-100">
                {text}
              </p>
            ))}
            
            {(partialText || (isRecording && finalTexts.length === 0)) && (
              <div className="flex gap-4 items-start transition-all duration-300">
                {isSpeaking && <div className="mt-3 w-2 h-2 rounded-full bg-primary animate-ping shrink-0 shadow-[0_0_10px_rgba(16,185,129,1)]"></div>}
                <p className="text-2xl lg:text-3xl font-medium leading-relaxed text-white tracking-wide min-h-[3rem]">
                  {partialText || (isRecording ? "Escuchando al orador..." : "")}
                </p>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* EFECTO VISUAL DE ONDAS */}
          {isRecording && isSpeaking && (
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-primary/50 to-transparent animate-pulse shadow-[0_-5px_20px_rgba(16,185,129,0.3)]"></div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SpeakerView;