import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { Mic, Square, Radio, Globe, Download, Lock, AlertTriangle, AlertCircle, Users, Monitor, MonitorPlay, Copy, CheckCircle2 } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';

const socket = io(import.meta.env.VITE_BACKEND_URL, { autoConnect: false });

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
  
  const [isVerifying, setIsVerifying] = useState(!!sessionStorage.getItem('speakerPwd'));
  
  const [eventInfo, setEventInfo] = useState(null);
  const [isSystemActive, setIsSystemActive] = useState(true);
  const [isEventActive, setIsEventActive] = useState(true); 

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
  
  // NUEVO: Estado para el idioma del Modo TV
  const [tvLanguage, setTvLanguage] = useState('es');

  const [fullTranscription, setFullTranscription] = useState('');
  const [audienceCount, setAudienceCount] = useState(0);
  const [copiedText, setCopiedText] = useState(null);

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
    socket.connect();
    socket.emit('speaker-login', pwd, (response) => {
      if (response.success) {
        setIsAuthenticated(true);
        setEventInfo(response.event);
        setIsEventActive(response.event.isActive); 
        setRoomName(response.roomName); 
        setAudienceCode(response.audienceCode); 
        sessionStorage.setItem('speakerPwd', pwd);
        setLoginError('');
      } else {
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

  useEffect(() => {
    const savedPwd = sessionStorage.getItem('speakerPwd');
    if (savedPwd) {
      attemptLogin(savedPwd);
    } else {
      setIsVerifying(false);
    }
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return; 

    socket.on('connect', () => setIsConnected(true));
    
    socket.on('disconnect', () => {
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
    
    socket.on('translation-result', (data) => {
      setTranscription(data.original);
      if (data.translations) {
        setAllTranslations(data.translations); 
      }
      if (data.type === 'final') {
        setFullTranscription(prev => prev + data.original + " ");
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
      socket.off('translation-result');
      socket.off('room-audience-count');
    };
  }, [isAuthenticated, isRecording, eventInfo]);

  const stopRecordingLocally = () => {
    setIsRecording(false);
    if (processorRef.current) processorRef.current.disconnect();
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close().catch(() => {});
    }
    if (streamRef.current) streamRef.current.getTracks().forEach(track => track.stop());
    setAudienceCount(0); 
  };

  const startRecording = async () => {
    try {
      if (!roomName) return;

      const stream = await navigator.mediaDevices.getUserMedia({ 
          audio: { 
              echoCancellation: true, 
              noiseSuppression: true, 
              autoGainControl: true 
          } 
      });
      streamRef.current = stream;
      
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
        if (socket.connected && isSystemActive && isEventActive) {
          socket.emit('audio-stream', event.data);
        }
      };

      const gainNode = audioContext.createGain();
      gainNode.gain.value = 0;
      source.connect(workletNode);
      workletNode.connect(gainNode);
      gainNode.connect(audioContext.destination);

      setIsRecording(true);
      setAudienceCount(0); 
    } catch (error) {
      console.error('Error accediendo al micrófono:', error);
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
          <p className="text-gray-500 text-sm font-semibold tracking-widest uppercase">Verificando sesión...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex flex-col h-screen w-full items-center justify-center p-6 bg-darker relative overflow-hidden">
        <div className="bg-dark border border-gray-800 p-8 rounded-3xl shadow-2xl max-w-md w-full flex flex-col items-center gap-6 text-center z-10">
          <div className="bg-primary/10 p-5 rounded-full">
            <Lock className="w-10 h-10 text-primary" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-white mb-2 tracking-tight">Acceso a Cabina de Orador</h2>
            <p className="text-gray-400 text-sm leading-relaxed">
              Ingresa la Clave de Sala generada por el administrador de tu evento.
            </p>
          </div>
          <form onSubmit={handleLogin} className="w-full flex flex-col gap-4 mt-2">
            <input
              type="password"
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
              placeholder="Clave Secreta de Sala"
              className="w-full bg-darker border border-gray-700 text-white text-lg rounded-xl p-4 focus:ring-2 focus:ring-primary focus:outline-none text-center tracking-widest transition-all"
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

  if (!isSystemActive || !isEventActive) {
    return (
      <div className="flex flex-col h-screen w-full items-center justify-center p-6 bg-black">
        <div className="w-full max-w-md flex flex-col items-center">
          <AlertTriangle className="w-16 h-16 text-yellow-500 mb-6 animate-pulse" />
          <h2 className="text-2xl font-bold text-white mb-2 text-center">Transmisión Pausada</h2>
          <p className="text-gray-400 text-center leading-relaxed">
            El administrador ha pausado el sistema o este evento. Espera instrucciones para reanudar.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen w-full p-8 max-w-6xl mx-auto overflow-hidden relative">
      
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

      <header className="flex justify-between items-start mb-8 shrink-0">
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <Globe className="w-8 h-8 text-primary" />
            <div className="flex flex-col">
              <h1 className="text-2xl font-bold tracking-tight text-white leading-tight">
                {eventInfo?.name || "Traducción Simultánea"}
              </h1>
              <span className="text-xs text-gray-500 font-bold tracking-widest uppercase">
                Panel de Orador: {roomName}
              </span>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
              <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full font-medium text-sm w-max ${isRecording ? 'bg-red-500/10 text-red-500' : 'bg-gray-800 text-gray-400'}`}>
                <Radio className={`w-4 h-4 ${isRecording ? 'animate-pulse' : ''}`} />
                {isRecording ? `Transmitiendo en Vivo` : 'Sistema en espera'}
              </div>
              
              {isRecording && (
                  <div className="inline-flex items-center gap-2 bg-green-500/10 border border-green-500/30 px-3 py-1.5 rounded-full shadow-lg shadow-green-500/10 transition-all duration-300">
                      <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></div>
                      <Users className="w-4 h-4 text-green-500" />
                      <span className="text-white font-bold text-sm leading-none">{audienceCount}</span>
                      <span className="text-gray-400 text-[10px] font-bold tracking-widest uppercase ml-0.5 hidden sm:inline-block">Oyentes</span>
                  </div>
              )}
          </div>
        </div>
        
        <div className="hidden md:flex items-center gap-5 bg-dark p-3 rounded-2xl border border-gray-800 shadow-xl">
          <div className="bg-white p-2 rounded-xl shrink-0">
            <QRCodeSVG value={audienceUrl} size={70} />
          </div>
          <div className="flex flex-col pr-4 justify-center">
            <span className="text-xs text-gray-400 font-bold uppercase tracking-wider mb-1">Acceso Audiencia</span>
            <a href={audienceUrl} target="_blank" rel="noreferrer" className="text-sm text-primary hover:text-blue-400 font-bold transition-colors mb-2">
              Abrir enlace de sala ↗
            </a>
            <div className="flex items-center gap-2">
                <span className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">Cód:</span>
                <span className="bg-gray-800 text-white px-2 py-0.5 rounded text-xs font-mono tracking-widest">{audienceCode}</span>
                <button onClick={() => copyToClipboard(audienceCode)} className="text-gray-400 hover:text-white transition-colors" title="Copiar código">
                    {copiedText === audienceCode ? <CheckCircle2 className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
                </button>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 flex flex-col min-h-0 gap-6 pb-6 overflow-y-auto pr-2">
        <div className="space-y-4 shrink-0">
          
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6 mb-2 flex-wrap">
            <div className="flex items-center gap-3">
              <span className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Idioma:</span>
              <div className="relative">
                <select 
                  value={inputLanguage}
                  onChange={(e) => setInputLanguage(e.target.value)}
                  disabled={isRecording}
                  className="bg-darker border border-gray-700 text-primary text-sm font-bold uppercase tracking-wider rounded-lg px-3 py-1.5 focus:ring-1 focus:ring-primary focus:outline-none appearance-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
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

            <div className="flex items-center gap-3">
              <span className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Voz IA:</span>
              <div className="relative">
                <select 
                  value={voiceGender}
                  onChange={(e) => setVoiceGender(e.target.value)}
                  disabled={isRecording}
                  className="bg-darker border border-gray-700 text-primary text-sm font-bold uppercase tracking-wider rounded-lg px-3 py-1.5 focus:ring-1 focus:ring-primary focus:outline-none appearance-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
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

            <div className="flex items-center gap-3">
              <span className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Sala Asignada:</span>
              <div className="bg-darker border border-gray-700 text-white text-sm font-bold uppercase tracking-wider rounded-lg px-4 py-1.5 min-w-[120px] text-center shadow-inner cursor-not-allowed">
                {roomName}
              </div>
            </div>
          </div>
          
          <p className="text-3xl md:text-4xl font-bold leading-tight text-white min-h-[3rem] text-left">
            {transcription || "Presiona el botón para comenzar a hablar..."}
          </p>
        </div>

        {/* MODIFICADO: Selector de idioma desplegable para Pantallas de TV */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between bg-dark border border-gray-800 rounded-2xl p-5 shadow-xl shrink-0 mt-2">
            <div className="flex flex-col mb-4 sm:mb-0">
                <h3 className="text-sm font-bold text-white uppercase tracking-widest flex items-center gap-2 mb-1">
                    <Monitor className="w-4 h-4 text-primary" />
                    Pantallas de Subtítulos (Modo TV)
                </h3>
                <p className="text-xs text-gray-500">Selecciona el idioma y abre los subtítulos a pantalla completa para proyectar.</p>
            </div>
            <div className="flex items-center gap-3">
                <div className="relative">
                    <select
                        value={tvLanguage}
                        onChange={(e) => setTvLanguage(e.target.value)}
                        className="bg-gray-800 border border-gray-700 text-white text-xs font-bold uppercase tracking-wider rounded-lg px-3 py-2.5 focus:ring-1 focus:ring-primary focus:outline-none appearance-none cursor-pointer pr-8"
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
                    className="flex items-center gap-2 bg-primary hover:bg-blue-600 text-white px-4 py-2.5 rounded-lg font-bold text-xs uppercase tracking-wider transition-colors shadow-lg shadow-blue-500/25"
                >
                    <MonitorPlay className="w-4 h-4" />
                    Proyectar
                </a>
            </div>
        </div>

        <div className="flex flex-col gap-4 shrink-0">
          <div className="flex flex-col md:flex-row md:items-center gap-3">
            <span className="text-sm font-semibold text-primary uppercase tracking-wider">Layout de Monitores:</span>
            <div className="flex gap-2">
              {[1, 2, 3].map(num => (
                <button
                  key={num}
                  onClick={() => setPanelCount(num)}
                  className={`px-4 py-1.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all ${
                    panelCount === num 
                      ? 'bg-primary text-white shadow-[0_0_10px_rgba(59,130,246,0.3)]' 
                      : 'bg-dark border border-gray-700 text-gray-400 hover:bg-gray-800'
                  }`}
                >
                  {num} {num === 1 ? 'Panel' : 'Paneles'}
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
              <div key={index} className="bg-dark border border-gray-800 rounded-2xl p-5 flex flex-col justify-start min-h-[10rem] shadow-xl relative">
                
                <div className="mb-3 border-b border-gray-800 pb-2 relative shrink-0">
                  <select 
                    value={panelLanguages[index]}
                    onChange={(e) => handlePanelLanguageChange(index, e.target.value)}
                    className="w-full bg-transparent text-xs font-bold text-gray-400 uppercase tracking-widest focus:outline-none cursor-pointer hover:text-white transition-colors appearance-none pr-6"
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

                <p className="text-xl md:text-2xl font-medium leading-relaxed text-gray-300 text-left">
                  {allTranslations[panelLanguages[index]] || "..."}
                </p>
              </div>
            ))}
          </div>
        </div>
      </main>

      <footer className="flex flex-col items-center gap-4 pt-4 border-t border-gray-800 shrink-0">
        <div className="flex justify-center">
          {!isRecording ? (
            <button 
              onClick={startRecording}
              className="flex items-center gap-3 bg-primary hover:bg-blue-600 text-white px-8 py-4 rounded-full font-semibold transition-all shadow-lg hover:shadow-blue-500/25"
            >
              <Mic className="w-6 h-6" />
              Iniciar Discurso
            </button>
          ) : (
            <button 
              onClick={stopRecording}
              className="flex items-center gap-3 bg-red-500 hover:bg-red-600 text-white px-8 py-4 rounded-full font-semibold transition-all shadow-lg hover:shadow-red-500/25"
            >
              <Square className="w-6 h-6 fill-current" />
              Detener Transmisión
            </button>
          )}
        </div>

        {!isRecording && fullTranscription && (
          <div className="flex gap-4 mt-2 transition-all duration-500 ease-in-out">
            <button 
              onClick={downloadTranscription}
              className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 text-white px-5 py-2.5 rounded-xl font-medium transition-colors text-sm border border-gray-700 shadow-lg"
            >
              <Download className="w-4 h-4" />
              Transcripción Completa
            </button>
            <button 
              onClick={downloadSummary}
              className="flex items-center gap-2 bg-dark hover:bg-gray-800 text-primary px-5 py-2.5 rounded-xl font-medium transition-colors text-sm border border-primary/30 shadow-lg"
            >
              <Download className="w-4 h-4" />
              Acta de Resumen
            </button>
          </div>
        )}
      </footer>
    </div>
  );
};

export default SpeakerView;