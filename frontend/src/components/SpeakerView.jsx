import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { Mic, Square, Radio, Globe, Download, Lock } from 'lucide-react';
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
  const [isAuthenticated, setIsAuthenticated] = useState(sessionStorage.getItem('isAdminAuth') === 'true');
  const [passwordInput, setPasswordInput] = useState('');
  const [loginError, setLoginError] = useState('');

  const [isRecording, setIsRecording] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [transcription, setTranscription] = useState('');
  
  const [allTranslations, setAllTranslations] = useState({}); 
  const [inputLanguage, setInputLanguage] = useState('es-CO'); 
  const [voiceGender, setVoiceGender] = useState('female');
  
  // NUEVO: Estado para el nombre de la sala dinámica
  const [roomName, setRoomName] = useState('PRINCIPAL');
  
  const [panelCount, setPanelCount] = useState(1); 
  const [panelLanguages, setPanelLanguages] = useState(['en', 'de', 'fr']); 
  
  const [fullTranscription, setFullTranscription] = useState('');
  
  const audioContextRef = useRef(null);
  const processorRef = useRef(null);
  const streamRef = useRef(null);

  // ACTUALIZADO: El enlace del QR ahora incluye a qué sala deben unirse
  const audienceUrl = `${window.location.origin}/?room=${roomName}`;

  const handleLogin = (e) => {
    e.preventDefault();
    const ADMIN_PASSWORD = import.meta.env.VITE_ADMIN_PASSWORD || 'admin123';
    
    if (passwordInput === ADMIN_PASSWORD) {
      setIsAuthenticated(true);
      sessionStorage.setItem('isAdminAuth', 'true');
      setLoginError('');
    } else {
      setLoginError('Contraseña incorrecta. Acceso denegado.');
      setPasswordInput('');
    }
  };

  useEffect(() => {
    if (!isAuthenticated) return; 

    socket.on('connect', () => setIsConnected(true));
    
    socket.on('disconnect', () => {
      setIsConnected(false);
      setIsRecording(false);
      if (processorRef.current) processorRef.current.disconnect();
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close().catch(() => {});
      }
      if (streamRef.current) streamRef.current.getTracks().forEach(track => track.stop());
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

    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('translation-result');
    };
  }, [isAuthenticated]);

  const startRecording = async () => {
    try {
      if (!roomName.trim()) {
        alert("Por favor ingresa un nombre para la sala antes de iniciar.");
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      
      socket.connect();
      
      // ACTUALIZADO: Le decimos al backend qué sala vamos a inaugurar
      socket.emit('start-translation', { 
        fromLanguage: inputLanguage, 
        toLanguages: ['es', 'en', 'pt', 'fr', 'de'],
        voiceGender: voiceGender,
        roomName: roomName 
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
        if (socket.connected) {
          socket.emit('audio-stream', event.data);
        }
      };

      const gainNode = audioContext.createGain();
      gainNode.gain.value = 0;
      source.connect(workletNode);
      workletNode.connect(gainNode);
      gainNode.connect(audioContext.destination);

      setIsRecording(true);
    } catch (error) {
      console.error('Error accediendo al micrófono:', error);
      alert('Por favor, permite el acceso al micrófono en tu navegador.');
    }
  };

  const stopRecording = () => {
    if (processorRef.current) processorRef.current.disconnect();
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close().catch(() => {});
    }
    if (streamRef.current) streamRef.current.getTracks().forEach(track => track.stop());
    
    socket.emit('stop-translation');
    socket.disconnect();
    setIsRecording(false);
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
    
    const summaryText = `--- RESUMEN DE LA SESIÓN ---\nSala: ${roomName}\nFecha: ${fecha}\nIdioma Original del Orador: ${inputLanguage}\nIdiomas Monitoreados: ${activeLangs}\n\n--- REGISTRO COMPLETO ---\n${fullTranscription}`;
    
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

  if (!isAuthenticated) {
    return (
      <div className="flex flex-col h-screen w-full items-center justify-center p-6 bg-darker">
        <div className="bg-dark border border-gray-800 p-8 rounded-3xl shadow-2xl max-w-md w-full flex flex-col items-center gap-6 text-center">
          <div className="bg-primary/10 p-5 rounded-full">
            <Lock className="w-10 h-10 text-primary" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-white mb-2">Acceso Restringido</h2>
            <p className="text-gray-400 text-sm leading-relaxed">
              Ingresa la clave de administrador para gestionar el módulo de traducción simultánea.
            </p>
          </div>
          <form onSubmit={handleLogin} className="w-full flex flex-col gap-4 mt-2">
            <input
              type="password"
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
              placeholder="Contraseña"
              className="w-full bg-darker border border-gray-700 text-white text-lg rounded-xl p-4 focus:ring-2 focus:ring-primary focus:outline-none text-center tracking-widest transition-all"
            />
            {loginError && <p className="text-red-500 text-xs font-semibold animate-pulse">{loginError}</p>}
            <button
              type="submit"
              className="w-full bg-primary hover:bg-blue-600 text-white px-6 py-4 rounded-xl font-bold transition-all shadow-lg hover:shadow-blue-500/25 mt-2"
            >
              Ingresar al Panel
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen w-full p-8 max-w-6xl mx-auto overflow-hidden">
      
      <header className="flex justify-between items-start mb-8 shrink-0">
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <Globe className="w-8 h-8 text-primary" />
            <h1 className="text-2xl font-bold tracking-tight">Traducción Simultánea</h1>
          </div>
          <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full font-medium text-sm w-max ${isRecording ? 'bg-red-500/10 text-red-500' : 'bg-gray-800 text-gray-400'}`}>
            <Radio className={`w-4 h-4 ${isRecording ? 'animate-pulse' : ''}`} />
            {isRecording ? `Transmitiendo en: ${roomName}` : 'Sistema en espera'}
          </div>
        </div>
        
        <div className="hidden md:flex items-center gap-5 bg-dark p-3 rounded-2xl border border-gray-800 shadow-xl">
          <div className="bg-white p-2 rounded-xl">
            <QRCodeSVG value={audienceUrl} size={70} />
          </div>
          <div className="flex flex-col pr-4">
            <span className="text-xs text-gray-400 font-bold uppercase tracking-wider mb-1">Acceso Audiencia</span>
            <a href={audienceUrl} target="_blank" rel="noreferrer" className="text-sm text-primary hover:text-blue-400 font-medium transition-colors">
              Abrir enlace de sala ↗
            </a>
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

            {/* NUEVO: Campo de texto para nombrar la sala dinámica */}
            <div className="flex items-center gap-3">
              <span className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Sala:</span>
              <input 
                type="text"
                value={roomName}
                onChange={(e) => setRoomName(e.target.value.toUpperCase().replace(/\s+/g, '-'))}
                disabled={isRecording}
                placeholder="Ej: AUDITORIO"
                className="bg-darker border border-gray-700 text-white text-sm font-bold uppercase tracking-wider rounded-lg px-3 py-1.5 focus:ring-1 focus:ring-primary focus:outline-none w-36 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              />
            </div>
          </div>
          
          <p className="text-3xl md:text-4xl font-bold leading-tight text-white min-h-[3rem] text-left">
            {transcription || "Presiona el botón para comenzar a hablar..."}
          </p>
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