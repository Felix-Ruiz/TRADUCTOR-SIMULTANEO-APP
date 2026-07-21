import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { Mic, Square, Radio, Globe, Download, Lock, AlertTriangle, AlertCircle, Users, Monitor, MonitorPlay, Copy, CheckCircle2, Scale, User, Hand, X, MessageSquare, Play, StopCircle, Trash2, Settings, ZoomIn } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';

// FIX: Se añade el fallback de URL para evitar conexiones caídas o indefinidas
const socket = io(import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001', { autoConnect: false });

const langNames = {
  'es': 'Español',
  'en': 'Inglés',
  'de': 'Alemán',
  'fr': 'Francés',
  'pt': 'Portugués'
};

const SpeakerView = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [loginError, setLoginError] = useState('');
  
  const [isVerifying, setIsVerifying] = useState(true); 
  
  const [eventInfo, setEventInfo] = useState(null);
  const [isSystemActive, setIsSystemActive] = useState(true);
  const [isEventActive, setIsEventActive] = useState(true); 
  const [isRoomActive, setIsRoomActive] = useState(true); 

  const [isRecording, setIsRecording] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [transcription, setTranscription] = useState('');
  
  const [allTranslations, setAllTranslations] = useState({}); 
  const [inputLanguage, setInputLanguage] = useState('es-CO'); 
  const [voiceGender, setVoiceGender] = useState('female');
  
  const [roomName, setRoomName] = useState('');
  const [audienceCode, setAudienceCode] = useState(''); 
  
  const [panelCount, setPanelCount] = useState(1); 
  const [panelLanguages, setPanelLanguages] = useState(['en', 'de', 'fr']); 
  
  const [tvLanguage, setTvLanguage] = useState('es');

  const [fullTranscription, setFullTranscription] = useState('');
  const [audienceCount, setAudienceCount] = useState(0);
  const [copiedText, setCopiedText] = useState(null);

  // ESTADOS PARA PREGUNTAS DEL PÚBLICO (Q&A)
  const [activeQuestion, setActiveQuestion] = useState(null);
  const [isQaActive, setIsQaActive] = useState(false);
  const [qaQueue, setQaQueue] = useState([]);
  
  // ESTADOS PARA EL BUZÓN DE PREGUNTAS ESCRITAS
  const [activeQaTab, setActiveQaTab] = useState('voice'); // 'voice' | 'text'
  const [qaTextQueue, setQaTextQueue] = useState([]);
  const [projectedTextQuestion, setProjectedTextQuestion] = useState(null);

  // NUEVOS ESTADOS: Control de visibilidad de paneles y modales
  const [showQaPanel, setShowQaPanel] = useState(true);
  const [showTvPanel, setShowTvPanel] = useState(true);
  const [showMonitorsPanel, setShowMonitorsPanel] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);
  const menuRef = useRef(null);

  const audioContextRef = useRef(null);
  const processorRef = useRef(null);
  const streamRef = useRef(null);

  const [dialogConfig, setDialogConfig] = useState({ isOpen: false, title: '', message: '', type: 'alert', onConfirm: null, confirmStyle: '' });

  const openDialog = (title, message, type = 'alert', onConfirm = null, confirmStyle = 'bg-primary hover:bg-blue-600 shadow-blue-500/25') => {
    setDialogConfig({ isOpen: true, title, message, type, onConfirm, confirmStyle });
  };
  const closeDialog = () => setDialogConfig(prev => ({ ...prev, isOpen: false }));

  const audienceUrl = `${window.location.origin}/?code=${audienceCode}`;

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    setCopiedText(text);
    setTimeout(() => setCopiedText(null), 2000);
  };

  const attemptLogin = (pwd) => {
    console.warn("[🔌 CLIENT] Conectando socket e intentando login de orador...");
    socket.connect();
    socket.emit('speaker-login', pwd, (response) => {
      if (response.success) {
        console.warn("[✅ CLIENT] Autenticación de sala exitosa:", response.roomName);
        setIsAuthenticated(true);
        setEventInfo(response.event);
        setIsEventActive(response.event.isActive); 
        setIsRoomActive(true); 
        setRoomName(response.roomName); 
        setAudienceCode(response.audienceCode); 
        setIsQaActive(response.isQaActive || false); 
        sessionStorage.setItem('speakerPwd', pwd);
        setLoginError('');
        
        socket.emit('qa-get-queue', { eventId: response.event.id, roomName: response.roomName });
      } else {
        console.warn("[⚠️ CLIENT] Error en la autenticación de sala:", response.message);
        setLoginError(response.message || 'Contraseña de sala incorrecta.');
        setPasswordInput('');
        sessionStorage.removeItem('speakerPwd');
        socket.disconnect();
      }
      setIsVerifying(false); 
    });
  };

  const handleLogin = (e) => {
    e.preventDefault();
    if (!passwordInput.trim()) return;
    setIsVerifying(true);
    attemptLogin(passwordInput);
  };

  const toggleQaStatus = () => {
    if (!eventInfo) return;
    const newStatus = !isQaActive;
    socket.emit('toggle-qa-status', { eventId: eventInfo.id, roomName, status: newStatus });
  };

  // ACCIONES Q&A MODO VOZ
  const approveQaFloor = (targetSocketId) => {
    if (!eventInfo) return;
    socket.emit('qa-approve-floor', { eventId: eventInfo.id, roomName, targetSocketId });
  };

  const rejectQaFloor = (targetSocketId) => {
    if (!eventInfo) return;
    socket.emit('qa-reject-floor', { eventId: eventInfo.id, roomName, targetSocketId });
  };

  // ACCIONES Q&A MODO TEXTO
  const projectTextQuestion = (question) => {
    if (!eventInfo) return;
    socket.emit('qa-project-text', { eventId: eventInfo.id, roomName, question });
  };

  const stopProjectingText = () => {
    if (!eventInfo) return;
    socket.emit('qa-stop-project-text', { eventId: eventInfo.id, roomName });
  };

  const deleteTextQuestion = (questionId) => {
    if (!eventInfo) return;
    socket.emit('qa-delete-text', { eventId: eventInfo.id, roomName, questionId });
  };

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const urlPwd = urlParams.get('pwd');
    const savedPwd = sessionStorage.getItem('speakerPwd');

    if (urlPwd) {
      window.history.replaceState(null, '', window.location.pathname);
      attemptLogin(urlPwd);
    } else if (savedPwd) {
      attemptLogin(savedPwd);
    } else {
      setIsVerifying(false);
    }
  }, []);

  // Cerrar menú desplegable al hacer clic afuera
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setIsMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return; 

    socket.on('connect', () => {
      console.warn("[📡 SOCKET] Conexión establecida con el servidor backend.");
      setIsConnected(true);
    });
    
    socket.on('disconnect', () => {
      console.warn("[📡 SOCKET] Conexión perdida con el servidor backend.");
      setIsConnected(false);
      stopRecordingLocally();
    });

    socket.on('system-status', (status) => {
      setIsSystemActive(status);
      if (!status && isRecording) {
        stopRecordingLocally();
        openDialog("Transmisión Detenida", "La Central Principal ha sido apagada. Tu transmisión se ha detenido por seguridad.", "alert", null, "bg-red-600 hover:bg-red-700 shadow-red-500/25");
      }
    });

    socket.on('event-status-changed', (data) => {
        if (eventInfo && data.eventId === eventInfo.id) {
            setIsEventActive(data.status);
            if (!data.status && isRecording) {
                stopRecordingLocally();
                openDialog("Evento Pausado", "El administrador ha pausado este evento. Tu transmisión se ha detenido por seguridad.", "alert", null, "bg-red-600 hover:bg-red-700 shadow-red-500/25");
            }
        }
    });

    socket.on('room-status-changed', (data) => {
        if (eventInfo && data.eventId === eventInfo.id && data.roomName === roomName) {
            setIsRoomActive(data.status);
            if (!data.status && isRecording) {
                stopRecordingLocally();
                openDialog("Sala Pausada", "El administrador ha pausado temporalmente tu sala. La transmisión se ha detenido.", "alert", null, "bg-red-600 hover:bg-red-700 shadow-red-500/25");
            }
        }
    });

    // LISTENERS Q&A GENERAL
    socket.on('qa-status-changed', (status) => {
        setIsQaActive(status);
    });

    // LISTENERS Q&A MODO VOZ
    socket.on('qa-queue-updated', (data) => {
        if (data.roomName === roomName) {
            setQaQueue(data.queue);
        }
    });
    
    socket.on('qa-speaker-active', (data) => {
        setActiveQuestion(data);
    });

    socket.on('qa-speaker-inactive', () => {
        setActiveQuestion(null);
    });

    // LISTENERS Q&A MODO TEXTO
    socket.on('qa-text-queue-updated', (data) => {
        if (data.roomName === roomName) {
            setQaTextQueue(data.queue);
        }
    });

    socket.on('qa-projected-text-question', (question) => {
        setProjectedTextQuestion(question);
    });

    socket.on('translation-result', (data) => {
      let textToShow = data.original;
      
      if (data.isQa && data.translations) {
        const speakerBaseLang = inputLanguage.split('-')[0]; 
        if (data.translations[speakerBaseLang]) {
          textToShow = data.translations[speakerBaseLang];
        }
      }

      const prefix = data.isQa ? `👉 [Pregunta de ${data.qaName || 'Público'}]: ` : '';
      
      setTranscription(prefix + textToShow);
      
      if (data.translations) {
        if (data.isQa) {
            const prefixedTranslations = {};
            for (let lang in data.translations) {
                prefixedTranslations[lang] = `👉 [Q&A]: ${data.translations[lang]}`;
            }
            setAllTranslations(prefixedTranslations);
        } else {
            setAllTranslations(data.translations); 
        }
      }
      
      if (data.type === 'final') {
        const text = prefix + textToShow;
        setFullTranscription(prev => prev + text + " \n");
        const wordsCount = data.original.trim().split(/\s+/).length;
        if (wordsCount > 0) socket.emit('analytics-sync-words', { words: wordsCount });
      }
    });

    socket.on('room-audience-count', (count) => {
        setAudienceCount(count);
    });

    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('system-status');
      socket.off('event-status-changed');
      socket.off('room-status-changed');
      socket.off('translation-result');
      socket.off('room-audience-count');
      socket.off('qa-speaker-active');
      socket.off('qa-speaker-inactive');
      socket.off('qa-status-changed');
      socket.off('qa-queue-updated');
      socket.off('qa-text-queue-updated');
      socket.off('qa-projected-text-question');
    };
  }, [isAuthenticated, isRecording, eventInfo, roomName, inputLanguage]);

  const stopRecordingLocally = () => {
    console.warn("[🎤 CLIENT] Deteniendo captura de hardware local de audio.");
    setIsRecording(false);
    if (processorRef.current) processorRef.current.disconnect();
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close().catch(() => {});
    }
    if (streamRef.current) streamRef.current.getTracks().forEach(track => track.stop());
  };

  const startRecording = async () => {
    console.warn("\n=== [🚀 SENSOR CLIENTE: INICIAR DISCURSO] ===");
    console.warn("-> Estado de la sala (roomName):", roomName);
    console.warn("-> ¿Sala activa internamente? (isRoomActive):", isRoomActive);
    console.warn("-> ¿Socket conectado globalmente? (socket.connected):", socket.connected);

    try {
      if (!roomName || !isRoomActive) {
        console.error("[❌ SENSOR] Cancelado: El nombre de la sala no es válido o está pausada en la interfaz.");
        return;
      }

      console.warn("[🎤 SENSOR] Solicitando permisos de hardware para getUserMedia...");
      const stream = await navigator.mediaDevices.getUserMedia({ 
          audio: { 
              echoCancellation: true, 
              noiseSuppression: true, 
              autoGainControl: true 
          } 
      });
      streamRef.current = stream;
      console.warn("[🎤 SENSOR] Permiso de micrófono CONCEDIDO por el usuario.");
      
      console.warn("[📡 SENSOR] Emitiendo evento WebSocket 'start-translation' hacia Render...");
      socket.emit('start-translation', { 
        fromLanguage: inputLanguage, 
        toLanguages: ['es', 'en', 'pt', 'fr', 'de'],
        voiceGender: voiceGender,
        roomName: roomName,
        eventId: eventInfo.id 
      });
      
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      const audioContext = new AudioContext({ sampleRate: 16000 });
      audioContextRef.current = audioContext;

      const source = audioContext.createMediaStreamSource(stream);
      
      const workletCode = `
        class PCMProcessor extends AudioWorkletProcessor {
          process(inputs, outputs, parameters) {
            const input = inputs[0];
            if (input && input.length > 0) {
              const channelData = input[0];
              const pcm16 = new Int16Array(channelData.length);
              
              for (let i = 0; i < channelData.length; i++) {
                let s = Math.max(-1, Math.min(1, channelData[i]));
                pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
              }
              this.port.postMessage(pcm16.buffer);
            }
            return true; 
          }
        }
        registerProcessor('pcm-processor', PCMProcessor);
      `;

      const blob = new Blob([workletCode], { type: 'application/javascript' });
      const workletUrl = URL.createObjectURL(blob);

      await audioContext.audioWorklet.addModule(workletUrl);
      const workletNode = new AudioWorkletNode(audioContext, 'pcm-processor');
      processorRef.current = workletNode;

      workletNode.port.onmessage = (event) => {
        if (socket.connected && isSystemActive && isEventActive && isRoomActive) {
          socket.emit('audio-stream', event.data);
        }
      };

      const gainNode = audioContext.createGain();
      gainNode.gain.value = 0;
      source.connect(workletNode);
      workletNode.connect(gainNode);
      gainNode.connect(audioContext.destination);

      setIsRecording(true);
      console.warn("[✅ SENSOR] Captura iniciada y transmitiendo flujo binario PCM16 con éxito.");
    } catch (error) {
      console.error('[❌ SENSOR CRÍTICO] Excepción atrapada en startRecording:', error);
      openDialog("Permiso Denegado", "Por favor, permite el acceso al micrófono en tu navegador para poder transmitir.", "alert");
    }
  };

  const stopRecording = () => {
    stopRecordingLocally();
    socket.emit('stop-translation');
  };

  const downloadTranscription = () => {
    const element = document.createElement("a");
    const file = new Blob([fullTranscription], {type: 'text/plain'});
    element.href = URL.createObjectURL(file);
    element.download = "transcripcion_completa.txt";
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  const downloadSummary = () => {
    const fecha = new Date().toLocaleDateString();
    const activeLangs = panelLanguages.slice(0, panelCount).map(code => langNames[code]).join(', ');
    
    const summaryText = `--- RESUMEN DE LA SESIÓN ---\nEvento: ${eventInfo?.name || 'Desconocido'}\nSala: ${roomName}\nFecha: ${fecha}\nIdioma Original del Orador: ${inputLanguage}\nIdiomas Monitoreados: ${activeLangs}\n\n--- REGISTRO COMPLETO ---\n${fullTranscription}`;
    
    const element = document.createElement("a");
    const file = new Blob([summaryText], {type: 'text/plain'});
    element.href = URL.createObjectURL(file);
    element.download = `resumen_sesion_${fecha.replace(/\//g, '-')}.txt`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  const handlePanelLanguageChange = (index, newLang) => {
    const newPanelLanguages = [...panelLanguages];
    newPanelLanguages[index] = newLang;
    setPanelLanguages(newPanelLanguages);
  };

  if (isVerifying) {
    return (
      <div className="flex flex-col h-screen w-full items-center justify-center p-6 bg-darker">
        <div className="flex flex-col items-center gap-6 animate-pulse">
          <img src="/logo.png" alt="Logo" className="h-14 w-auto object-contain drop-shadow-lg" onError={(e) => { e.target.style.display = 'none'; }} />
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
          <p className="text-gray-500 text-sm font-semibold tracking-widest uppercase text-center">Verificando sesión...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex flex-col h-screen w-full items-center justify-center p-4 sm:p-6 bg-darker relative overflow-hidden">
        <div className="bg-dark border border-gray-800 p-6 sm:p-8 rounded-3xl shadow-2xl max-w-md w-full flex flex-col items-center gap-6 text-center z-10">
          <div className="bg-primary/10 p-5 rounded-full">
            <Lock className="w-10 h-10 text-primary" />
          </div>
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-white mb-2 tracking-tight">Acceso a Cabina de Orador</h2>
            <p className="text-gray-400 text-sm leading-relaxed px-2">
              Ingresa la Clave de Sala generada por el administrador de tu evento.
            </p>
          </div>
          <form onSubmit={handleLogin} className="w-full flex flex-col gap-4 mt-2">
            <input
              type="password"
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
              placeholder="Clave Secreta de Sala"
              className="w-full bg-darker border border-gray-700 text-white text-lg sm:text-xl rounded-xl p-4 focus:ring-2 focus:ring-primary focus:outline-none text-center tracking-widest transition-all"
            />
            {loginError && <p className="text-red-500 text-xs font-semibold animate-pulse">{loginError}</p>}
            <button
              type="submit"
              className="w-full bg-primary hover:bg-blue-600 text-white px-6 py-4 rounded-xl font-bold transition-all shadow-lg hover:shadow-blue-500/25 mt-2"
            >
              Conectar al Sistema
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (!isSystemActive || !isEventActive || !isRoomActive) {
    return (
      <div className="flex flex-col h-screen w-full items-center justify-center p-6 bg-black">
        <div className="w-full max-w-md flex flex-col items-center">
          <AlertTriangle className="w-16 h-16 text-yellow-500 mb-6 animate-pulse" />
          <h2 className="text-xl sm:text-2xl font-bold text-white mb-3 text-center">Transmisión Pausada</h2>
          <p className="text-gray-400 text-sm sm:text-base text-center leading-relaxed px-4">
            El administrador ha pausado el sistema o esta sala. Espera instrucciones para reanudar.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen w-full p-4 sm:p-6 md:p-8 max-w-6xl mx-auto overflow-hidden relative bg-darker">
      
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

      {/* Modal para Expandir Código QR */}
      {isQrModalOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/90 backdrop-blur-sm transition-opacity" onClick={() => setIsQrModalOpen(false)}>
            <div className="bg-darker border border-gray-700 p-8 rounded-3xl shadow-[0_0_50px_rgba(0,0,0,0.8)] max-w-sm w-full flex flex-col items-center gap-6 transform transition-all scale-100 relative" onClick={e => e.stopPropagation()}>
                <button onClick={() => setIsQrModalOpen(false)} className="absolute top-4 right-4 text-gray-500 hover:text-white bg-gray-800 p-1.5 rounded-lg transition-colors">
                    <X className="w-5 h-5" />
                </button>
                <h3 className="text-xl font-bold text-white tracking-wide text-center">Escanear para unirse</h3>
                <div className="bg-white p-4 rounded-2xl shadow-[0_0_30px_rgba(59,130,246,0.3)]">
                    <QRCodeSVG value={audienceUrl} size={250} />
                </div>
                <div className="text-center w-full mt-2">
                    <p className="text-gray-400 text-sm mb-3">O ingresa con el código manual:</p>
                    <div className="flex items-center justify-center gap-3 bg-gray-800 py-3 px-6 rounded-xl border border-gray-700">
                        <span className="text-3xl font-mono font-bold text-white tracking-widest">{audienceCode}</span>
                        <button onClick={() => copyToClipboard(audienceCode)} className="text-primary hover:text-white transition-colors" title="Copiar código">
                            {copiedText === audienceCode ? <CheckCircle2 className="w-6 h-6 text-green-500" /> : <Copy className="w-6 h-6" />}
                        </button>
                    </div>
                </div>
            </div>
        </div>
      )}

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

      <header className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 mb-6 sm:mb-8 shrink-0 bg-dark p-4 sm:p-6 rounded-2xl border border-gray-800 shadow-xl">
        <div className="flex flex-col gap-4 sm:gap-5 w-full lg:w-auto">
          <div className="flex items-center gap-3 sm:gap-4">
            {eventInfo?.logoUrl ? (
                <div className="bg-white/5 p-2 sm:p-2.5 rounded-xl shrink-0 w-12 h-12 sm:w-16 sm:h-16 flex items-center justify-center">
                    <img src={eventInfo.logoUrl} alt="Logo" className="max-w-full max-h-full object-contain animate-logo-pulse" onError={(e) => { e.target.style.display = 'none'; }} />
                </div>
            ) : (
                <div className="bg-primary/10 p-2 sm:p-3 rounded-xl shrink-0">
                    <Globe className="w-6 h-6 sm:w-8 sm:h-8 text-primary" />
                </div>
            )}
            <div className="flex flex-col overflow-hidden">
              <h1 className="text-lg sm:text-2xl font-bold tracking-tight text-white leading-tight break-words">
                {eventInfo?.name || "Traducción Simultánea"}
              </h1>
              <span className="text-[10px] sm:text-xs text-gray-500 font-bold tracking-widest uppercase mt-1">
                Panel de Orador: <span className="text-primary">{roomName}</span>
                {eventInfo?.sponsorText && <span className="hidden sm:inline mx-2 text-gray-600">•</span>}
                {eventInfo?.sponsorText && <span className="animate-metallic font-extrabold block sm:inline mt-1 sm:mt-0 drop-shadow-md text-sm">{eventInfo.sponsorText}</span>}
              </span>
            </div>
          </div>
          
          {/* BOTONES REUBICADOS EN EL ENCABEZADO */}
          <div className="flex flex-wrap items-center gap-3">
              <div className={`inline-flex items-center justify-center gap-2 px-3 sm:px-4 py-2 rounded-xl sm:rounded-full font-medium text-xs sm:text-sm w-full sm:w-max ${isRecording ? 'bg-red-500/10 text-red-500 border border-red-500/20' : 'bg-gray-800 text-gray-400 border border-gray-700'}`}>
                <Radio className={`w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0 ${isRecording ? 'animate-pulse' : ''}`} />
                <span>{isRecording ? `Transmitiendo en Vivo` : 'Sistema en espera'}</span>
              </div>
              
              <div className={`inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl sm:rounded-full transition-all duration-300 w-full sm:w-auto ${isRecording ? 'bg-green-500/10 border border-green-500/30 shadow-lg shadow-green-500/10' : 'bg-darker border border-gray-800 shadow-inner'}`}>
                  <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${isRecording ? 'bg-green-500 animate-pulse' : 'bg-gray-500'}`}></div>
                  <Users className={`w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0 ${isRecording ? 'text-green-500' : 'text-gray-500'}`} />
                  <span className={`font-bold text-sm leading-none ${isRecording ? 'text-white' : 'text-gray-300'}`}>{audienceCount}</span>
                  <span className="text-gray-400 text-[10px] font-bold tracking-widest uppercase ml-0.5">Oyentes</span>
              </div>

              <button 
                  onClick={toggleQaStatus}
                  className={`inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl sm:rounded-full transition-all duration-300 w-full sm:w-auto ${isQaActive ? 'bg-blue-500/10 border border-blue-500/30 shadow-lg shadow-blue-500/10' : 'bg-darker border border-gray-800 shadow-inner hover:bg-gray-800'}`}
              >
                  <Hand className={`w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0 ${isQaActive ? 'text-blue-500' : 'text-gray-500'}`} />
                  <span className={`font-bold text-sm leading-none ${isQaActive ? 'text-white' : 'text-gray-400'}`}>PREGUNTAS {isQaActive ? 'ON' : 'OFF'}</span>
              </button>

              {!isRecording ? (
                  <button 
                    onClick={startRecording}
                    disabled={activeQuestion !== null}
                    className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl sm:rounded-full bg-primary hover:bg-blue-600 text-white transition-all shadow-lg hover:shadow-blue-500/25 disabled:opacity-50 disabled:cursor-not-allowed w-full sm:w-auto"
                  >
                    <Mic className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
                    <span className="font-bold text-sm leading-none">{activeQuestion ? 'Auditorio en uso' : 'Iniciar Discurso'}</span>
                  </button>
              ) : (
                  <button 
                    onClick={stopRecording}
                    className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl sm:rounded-full bg-red-500 hover:bg-red-600 text-white transition-all shadow-lg hover:shadow-red-500/25 w-full sm:w-auto"
                  >
                    <Square className="w-3.5 h-3.5 sm:w-4 sm:h-4 fill-current shrink-0" />
                    <span className="font-bold text-sm leading-none">Detener Transmisión</span>
                  </button>
              )}
          </div>
        </div>
        
        <div className="w-full lg:w-auto flex flex-row items-center gap-3 sm:gap-5 bg-darker p-3 sm:p-4 rounded-xl border border-gray-700 shadow-inner">
          <button onClick={() => setIsQrModalOpen(true)} className="bg-white p-2 rounded-xl shrink-0 relative group overflow-hidden transition-all hover:ring-2 hover:ring-primary outline-none">
            <QRCodeSVG value={audienceUrl} size={64} />
            <div className="absolute inset-0 bg-black/70 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <ZoomIn className="w-6 h-6 text-white" />
            </div>
          </button>
          <div className="flex flex-col flex-1 justify-center">
            <span className="text-[10px] sm:text-xs text-gray-400 font-bold uppercase tracking-wider mb-1">Acceso Audiencia</span>
            <a href={audienceUrl} target="_blank" rel="noreferrer" className="text-xs sm:text-sm text-primary hover:text-blue-400 font-bold transition-colors mb-2 truncate max-w-[150px] sm:max-w-full">
              Abrir enlace de sala ↗
            </a>
            <div className="flex items-center justify-between sm:justify-start gap-2 bg-black/30 p-1.5 rounded-lg sm:bg-transparent sm:p-0">
                <span className="text-[10px] text-gray-500 font-bold tracking-widest">Cód:</span>
                <span className="bg-gray-800 text-white px-2 py-0.5 rounded text-xs font-mono tracking-widest">{audienceCode}</span>
                <button onClick={() => copyToClipboard(audienceCode)} className="text-gray-400 hover:text-white transition-colors p-1 sm:p-0" title="Copiar código">
                    {copiedText === audienceCode ? <CheckCircle2 className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
            </div>
          </div>
          
          {/* MENÚ DESPLEGABLE (TOGGLES Y DESCARGAS) */}
          <div className="relative border-l border-gray-700 pl-3 sm:pl-5 h-full flex items-center" ref={menuRef}>
            <button 
                onClick={() => setIsMenuOpen(!isMenuOpen)} 
                className={`inline-flex items-center justify-center p-2.5 sm:px-4 sm:py-2.5 rounded-xl sm:rounded-full transition-all duration-300 border shadow-inner ${isMenuOpen ? 'bg-gray-800 border-gray-500 text-white' : 'bg-darker border-gray-700 text-gray-400 hover:bg-gray-800 hover:text-white'}`}
                title="Configurar Vistas y Descargas"
            >
                <Settings className={`w-5 h-5 sm:w-4 sm:h-4 shrink-0 transition-transform duration-300 ${isMenuOpen ? 'rotate-90' : 'rotate-0'}`} />
                <span className="hidden sm:inline font-bold text-xs uppercase tracking-widest ml-2">Vistas</span>
            </button>

            {isMenuOpen && (
                <div className="absolute right-0 top-full mt-3 w-64 bg-darker border border-gray-700 rounded-2xl shadow-2xl z-50 p-5 flex flex-col gap-4">
                    <h4 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest border-b border-gray-800 pb-2">Control de Paneles</h4>
                    
                    <label className="flex items-center justify-between cursor-pointer group">
                        <span className="text-xs font-bold uppercase tracking-wider text-gray-300 group-hover:text-white transition-colors">Moderación Q&A</span>
                        <div className={`w-10 h-5 rounded-full relative transition-colors ${showQaPanel ? 'bg-primary' : 'bg-gray-700'}`}>
                            <div className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${showQaPanel ? 'translate-x-5' : 'translate-x-0'}`} />
                        </div>
                        <input type="checkbox" className="hidden" checked={showQaPanel} onChange={() => setShowQaPanel(!showQaPanel)} />
                    </label>
                    
                    <label className="flex items-center justify-between cursor-pointer group">
                        <span className="text-xs font-bold uppercase tracking-wider text-gray-300 group-hover:text-white transition-colors">Modo TV</span>
                        <div className={`w-10 h-5 rounded-full relative transition-colors ${showTvPanel ? 'bg-primary' : 'bg-gray-700'}`}>
                            <div className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${showTvPanel ? 'translate-x-5' : 'translate-x-0'}`} />
                        </div>
                        <input type="checkbox" className="hidden" checked={showTvPanel} onChange={() => setShowTvPanel(!showTvPanel)} />
                    </label>
                    
                    <label className="flex items-center justify-between cursor-pointer group">
                        <span className="text-xs font-bold uppercase tracking-wider text-gray-300 group-hover:text-white transition-colors">Monitores</span>
                        <div className={`w-10 h-5 rounded-full relative transition-colors ${showMonitorsPanel ? 'bg-primary' : 'bg-gray-700'}`}>
                            <div className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${showMonitorsPanel ? 'translate-x-5' : 'translate-x-0'}`} />
                        </div>
                        <input type="checkbox" className="hidden" checked={showMonitorsPanel} onChange={() => setShowMonitorsPanel(!showMonitorsPanel)} />
                    </label>

                    {!isRecording && fullTranscription && (
                        <>
                            <h4 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest border-b border-gray-800 pb-2 pt-2">Descargas</h4>
                            <div className="flex flex-col gap-2">
                                <button onClick={downloadTranscription} className="flex justify-start items-center gap-2 bg-gray-800 hover:bg-gray-700 text-white px-3 py-2.5 rounded-xl font-bold transition-colors text-xs border border-gray-700">
                                    <Download className="w-3.5 h-3.5 shrink-0" />
                                    <span>Transcripción</span>
                                </button>
                                <button onClick={downloadSummary} className="flex justify-start items-center gap-2 bg-dark hover:bg-gray-800 text-primary px-3 py-2.5 rounded-xl font-bold transition-colors text-xs border border-primary/30">
                                    <Download className="w-3.5 h-3.5 shrink-0" />
                                    <span>Acta de Resumen</span>
                                </button>
                            </div>
                        </>
                    )}
                </div>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 flex flex-col min-h-0 gap-4 pb-4 overflow-y-auto pr-1 sm:pr-2 relative">
        
        {activeQuestion && (
            <div className="absolute top-0 left-1/2 -translate-x-1/2 bg-blue-900/40 border border-blue-500/50 backdrop-blur-md px-5 py-2.5 rounded-full flex items-center gap-3 shadow-[0_0_20px_rgba(59,130,246,0.3)] z-50 animate-pulse">
                <div className="bg-blue-500/20 p-1.5 rounded-full">
                    <User className="w-4 h-4 text-blue-400" />
                </div>
                <div className="flex flex-col">
                    <span className="text-[10px] font-bold text-blue-300 uppercase tracking-widest">Transmitiendo: Pregunta del Público</span>
                    <span className="text-sm font-bold text-white">
                        {activeQuestion.name} {activeQuestion.location ? `(${activeQuestion.location})` : ''}
                    </span>
                </div>
            </div>
        )}

        {/* CAJA DE TEXTO EXPANDIBLE (FLEX-1) */}
        <div className="flex-1 flex flex-col min-h-[10rem] shrink-0">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 sm:gap-6 mb-4 shrink-0">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 w-full sm:w-auto">
              <span className="text-xs sm:text-sm font-semibold text-gray-500 uppercase tracking-wider">Idioma:</span>
              <div className="relative w-full sm:w-auto">
                <select 
                  value={inputLanguage}
                  onChange={(e) => setInputLanguage(e.target.value)}
                  disabled={isRecording || activeQuestion !== null}
                  className="w-full sm:w-auto bg-darker border border-gray-700 text-primary text-xs sm:text-sm font-bold uppercase tracking-wider rounded-lg px-3 py-2 sm:py-1.5 focus:ring-1 focus:ring-primary focus:outline-none appearance-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <option value="es-CO">Español</option>
                  <option value="en-US">Inglés</option>
                  <option value="de-DE">Alemán</option>
                  <option value="fr-FR">Francés</option>
                  <option value="pt-BR">Portugués</option>
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-primary">
                  <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
                    <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/>
                  </svg>
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 w-full sm:w-auto">
              <span className="text-xs sm:text-sm font-semibold text-gray-500 uppercase tracking-wider">Tipo de Voz:</span>
              <div className="relative w-full sm:w-auto">
                <select 
                  value={voiceGender}
                  onChange={(e) => setVoiceGender(e.target.value)}
                  disabled={isRecording || activeQuestion !== null}
                  className="w-full sm:w-auto bg-darker border border-gray-700 text-primary text-xs sm:text-sm font-bold uppercase tracking-wider rounded-lg px-3 py-2 sm:py-1.5 focus:ring-1 focus:ring-primary focus:outline-none appearance-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <option value="female">👩 Mujer</option>
                  <option value="male">👨 Hombre</option>
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-primary">
                  <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
                    <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/>
                  </svg>
                </div>
              </div>
            </div>
          </div>
          
          <p className={`text-2xl sm:text-3xl md:text-4xl font-bold leading-tight flex-1 overflow-y-auto text-left p-4 sm:p-0 bg-black/20 sm:bg-transparent rounded-xl border border-gray-800 sm:border-none transition-colors ${activeQuestion ? 'text-blue-300' : 'text-white'}`}>
            {transcription || "Presiona el botón superior de 'Iniciar Discurso' para comenzar a hablar..."}
          </p>
        </div>

        {/* PANELES OCULTABLES */}
        {isQaActive && showQaPanel && (
            <div className="bg-dark border border-gray-800 rounded-2xl p-4 sm:p-5 shadow-xl shrink-0 flex flex-col gap-3">
                <div className="flex flex-col sm:flex-row items-center justify-between pb-3 border-b border-gray-800 gap-3">
                    <h3 className="text-xs sm:text-sm font-bold text-white uppercase tracking-widest flex items-center gap-2">
                        <Hand className="w-4 h-4 text-blue-500" />
                        Moderación del Público
                    </h3>
                    <div className="flex bg-black p-1 rounded-lg">
                        <button 
                            onClick={() => setActiveQaTab('voice')}
                            className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest rounded-md transition-colors flex items-center gap-1.5 ${activeQaTab === 'voice' ? 'bg-gray-800 text-white shadow' : 'text-gray-500 hover:text-gray-300'}`}
                        >
                            <Mic className="w-3 h-3" /> Fila Voz
                            {qaQueue.filter(q => q.status === 'pending').length > 0 && <span className="bg-blue-500 text-white px-1.5 rounded-full">{qaQueue.filter(q => q.status === 'pending').length}</span>}
                        </button>
                        <button 
                            onClick={() => setActiveQaTab('text')}
                            className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest rounded-md transition-colors flex items-center gap-1.5 ${activeQaTab === 'text' ? 'bg-gray-800 text-white shadow' : 'text-gray-500 hover:text-gray-300'}`}
                        >
                            <MessageSquare className="w-3 h-3" /> Buzón Escrito
                            {qaTextQueue.length > 0 && <span className="bg-blue-500 text-white px-1.5 rounded-full">{qaTextQueue.length}</span>}
                        </button>
                    </div>
                </div>
                
                {activeQaTab === 'voice' && (
                    <>
                        {qaQueue.find(q => q.status === 'approved') && (
                            <div className="bg-blue-900/30 border border-blue-500/50 rounded-lg p-3 flex items-center justify-between mb-1 shadow-inner">
                                <div className="flex items-center gap-3">
                                    <div className="bg-blue-500/20 p-1.5 rounded-full animate-pulse">
                                        <Mic className="w-4 h-4 text-blue-400" />
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="text-[10px] text-blue-300 font-bold uppercase tracking-widest">Tiene la palabra</span>
                                        <span className="text-sm text-white font-bold">
                                            {qaQueue.find(q => q.status === 'approved').name} 
                                            {qaQueue.find(q => q.status === 'approved').location ? ` (${qaQueue.find(q => q.status === 'approved').location})` : ''}
                                        </span>
                                    </div>
                                </div>
                                <button 
                                    onClick={() => rejectQaFloor(qaQueue.find(q => q.status === 'approved').socketId)} 
                                    className="bg-red-500/20 hover:bg-red-500 text-red-400 hover:text-white p-2 rounded-lg transition-colors border border-red-500/30"
                                    title="Quitar Palabra"
                                >
                                    <Square className="w-4 h-4 fill-current" />
                                </button>
                            </div>
                        )}

                        <div className="flex flex-col gap-2 max-h-[160px] overflow-y-auto pr-1">
                            {qaQueue.filter(q => q.status === 'pending').map(req => (
                                <div key={req.socketId} className="bg-black/30 border border-gray-700 rounded-lg p-2.5 flex items-center justify-between">
                                    <div className="flex flex-col">
                                        <span className="text-xs text-white font-bold">{req.name} {req.location ? `(${req.location})` : ''}</span>
                                        <span className="text-[10px] text-gray-500 font-bold uppercase">Habla: {req.language}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button 
                                            onClick={() => approveQaFloor(req.socketId)} 
                                            className="bg-green-500/10 hover:bg-green-500 text-green-500 hover:text-white border border-green-500/20 px-3 py-1.5 rounded-md transition-colors text-[10px] font-bold uppercase flex items-center gap-1"
                                        >
                                            <CheckCircle2 className="w-3 h-3" /> Permitir
                                        </button>
                                        <button 
                                            onClick={() => rejectQaFloor(req.socketId)} 
                                            className="bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white border border-red-500/20 p-1.5 rounded-md transition-colors"
                                        >
                                            <X className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                            ))}
                            {qaQueue.filter(q => q.status === 'pending').length === 0 && !qaQueue.find(q => q.status === 'approved') && (
                                <p className="text-xs text-gray-500 text-center py-4 italic">No hay personas en la fila de micrófono.</p>
                            )}
                        </div>
                    </>
                )}

                {activeQaTab === 'text' && (
                    <>
                        {projectedTextQuestion && (
                            <div className="bg-green-900/20 border border-green-500/50 rounded-lg p-3 flex flex-col sm:flex-row items-start sm:items-center justify-between mb-2 shadow-inner gap-3">
                                <div className="flex flex-col overflow-hidden">
                                    <span className="text-[10px] text-green-400 font-bold uppercase tracking-widest flex items-center gap-1 mb-1">
                                        <MonitorPlay className="w-3 h-3" /> Proyectando Ahora
                                    </span>
                                    <span className="text-sm text-white font-medium italic break-words line-clamp-2">"{projectedTextQuestion.text}"</span>
                                </div>
                                <button 
                                    onClick={stopProjectingText} 
                                    className="bg-gray-800 hover:bg-gray-700 text-white p-2 rounded-lg transition-colors border border-gray-600 flex items-center gap-2 text-xs font-bold whitespace-nowrap shrink-0"
                                >
                                    <StopCircle className="w-4 h-4" /> Ocultar
                                </button>
                            </div>
                        )}

                        <div className="flex flex-col gap-2 max-h-[160px] overflow-y-auto pr-1">
                            {qaTextQueue.map(q => (
                                <div key={q.id} className={`bg-black/30 border p-3 rounded-lg flex flex-col gap-2 ${projectedTextQuestion?.id === q.id ? 'border-green-500/50 opacity-50' : 'border-gray-700'}`}>
                                    <div className="flex flex-col">
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs text-gray-400 font-bold">{q.name} {q.location ? `(${q.location})` : ''}</span>
                                            <span className="bg-gray-800 text-gray-500 text-[9px] px-1.5 py-0.5 rounded font-bold uppercase tracking-widest border border-gray-700">Idioma: {q.language}</span>
                                        </div>
                                        <span className="text-sm text-white leading-snug mt-1 break-words">"{q.text}"</span>
                                    </div>
                                    <div className="flex justify-end items-center gap-2 mt-1">
                                        <button 
                                            onClick={() => deleteTextQuestion(q.id)} 
                                            className="text-gray-500 hover:text-red-500 bg-gray-800/50 hover:bg-red-500/10 p-1.5 rounded-md transition-colors"
                                            title="Descartar Pregunta"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                        <button 
                                            onClick={() => projectTextQuestion(q)} 
                                            disabled={projectedTextQuestion?.id === q.id}
                                            className="bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded-md transition-colors text-[10px] font-bold uppercase flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            <Play className="w-3 h-3 fill-current" /> {projectedTextQuestion?.id === q.id ? 'En Pantalla' : 'Proyectar'}
                                        </button>
                                    </div>
                                </div>
                            ))}
                            {qaTextQueue.length === 0 && (
                                <p className="text-xs text-gray-500 text-center py-4 italic">El buzón de preguntas escritas está vacío.</p>
                            )}
                        </div>
                    </>
                )}
            </div>
        )}

        {showTvPanel && (
            <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between bg-dark border border-gray-800 rounded-2xl p-4 sm:p-5 shadow-xl shrink-0 gap-4">
                <div className="flex flex-col">
                    <h3 className="text-xs sm:text-sm font-bold text-white uppercase tracking-widest flex items-center gap-2 mb-1">
                        <Monitor className="w-4 h-4 text-primary shrink-0" />
                        Pantallas de Subtítulos (Modo TV)
                    </h3>
                    <p className="text-[10px] sm:text-xs text-gray-500 leading-relaxed">Selecciona el idioma y abre los subtítulos a pantalla completa para proyectar.</p>
                </div>
                <div className="flex flex-col xs:flex-row items-stretch xs:items-center gap-3 w-full md:w-auto">
                    <div className="relative w-full xs:w-auto">
                        <select
                            value={tvLanguage}
                            onChange={(e) => setTvLanguage(e.target.value)}
                            className="w-full xs:w-auto bg-gray-800 border border-gray-700 text-white text-xs font-bold uppercase tracking-wider rounded-lg px-3 py-3 xs:py-2.5 focus:ring-1 focus:ring-primary focus:outline-none appearance-none cursor-pointer pr-8"
                        >
                            <option value="es">Español</option>
                            <option value="en">Inglés</option>
                            <option value="de">Alemán</option>
                            <option value="fr">Francés</option>
                            <option value="pt">Portugués</option>
                        </select>
                        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-400">
                            <svg className="fill-current h-3 w-3" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
                                <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/>
                            </svg>
                        </div>
                    </div>
                    <a 
                        href={`${window.location.origin}/?code=${audienceCode}&tv=true&lang=${tvLanguage}`}
                        target="_blank"
                        rel="noreferrer"
                        className="flex justify-center items-center gap-2 bg-primary hover:bg-blue-600 text-white px-4 py-3 xs:py-2.5 rounded-lg font-bold text-xs uppercase tracking-wider transition-colors shadow-lg shadow-blue-500/25 w-full xs:w-auto shrink-0"
                    >
                        <MonitorPlay className="w-4 h-4 shrink-0" />
                        Proyectar
                    </a>
                </div>
            </div>
        )}

        {showMonitorsPanel && (
            <div className="flex flex-col gap-4 shrink-0">
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <span className="text-xs sm:text-sm font-semibold text-primary uppercase tracking-wider">Layout de Monitores:</span>
                <div className="grid grid-cols-3 sm:flex gap-2 w-full sm:w-auto">
                  {[1, 2, 3].map(num => (
                    <button
                      key={num}
                      onClick={() => setPanelCount(num)}
                      className={`w-full sm:w-auto px-2 sm:px-4 py-2 sm:py-1.5 rounded-lg sm:rounded-xl text-[10px] sm:text-xs font-bold uppercase tracking-wider transition-all ${
                        panelCount === num 
                          ? 'bg-primary text-white shadow-[0_0_10px_rgba(59,130,246,0.3)]' 
                          : 'bg-dark border border-gray-700 text-gray-400 hover:bg-gray-800'
                      }`}
                    >
                      {num} <span className="hidden xs:inline">{num === 1 ? 'Panel' : 'Paneles'}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className={`grid gap-4 transition-all duration-500 ${
                panelCount === 1 ? 'grid-cols-1' :
                panelCount === 2 ? 'grid-cols-1 md:grid-cols-2' :
                'grid-cols-1 md:grid-cols-3'
              }`}>
                {Array.from({ length: panelCount }).map((_, index) => (
                  <div key={index} className="bg-dark border border-gray-800 rounded-2xl p-4 sm:p-5 flex flex-col justify-start min-h-[8rem] sm:min-h-[10rem] shadow-xl relative">
                    
                    <div className="mb-3 border-b border-gray-800 pb-2 relative shrink-0">
                      <select 
                        value={panelLanguages[index]}
                        onChange={(e) => handlePanelLanguageChange(index, e.target.value)}
                        className="w-full bg-transparent text-[10px] sm:text-xs font-bold text-gray-400 uppercase tracking-widest focus:outline-none cursor-pointer hover:text-white transition-colors appearance-none pr-6"
                      >
                        <option value="es" className="bg-darker text-white">Español</option>
                        <option value="en" className="bg-darker text-white">Inglés</option>
                        <option value="de" className="bg-darker text-white">Alemán</option>
                        <option value="fr" className="bg-darker text-white">Francés</option>
                        <option value="pt" className="bg-darker text-white">Portugués</option>
                      </select>
                      <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-1 text-gray-500">
                        <svg className="fill-current h-3 w-3" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
                          <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/>
                        </svg>
                      </div>
                    </div>

                    <p className="text-lg sm:text-xl md:text-2xl font-medium leading-relaxed text-gray-300 text-left break-words">
                      {allTranslations[panelLanguages[index]] || "..."}
                    </p>
                  </div>
                ))}
              </div>
            </div>
        )}
      </main>

      {/* FOOTER LIMPIO */}
      <footer className="flex flex-col items-center pt-2 border-t border-gray-800 shrink-0 w-full">
        {eventInfo?.sponsorText && (
          <div className="mt-2 text-[10px] font-bold tracking-widest uppercase text-center w-full">
              <span className="animate-metallic text-xs">{eventInfo.sponsorText}</span>
          </div>
        )}
        
        <div className="mt-2 flex items-center justify-center gap-1.5 text-[9px] font-bold text-gray-600 tracking-widest uppercase opacity-50 w-full text-center">
            <Scale className="w-3 h-3" />
            <span>© {new Date().getFullYear()} ACOFI TRANSLATOR • LICENCIA DE USO EXCLUSIVO</span>
        </div>
      </footer>
    </div>
  );
};

export default SpeakerView;