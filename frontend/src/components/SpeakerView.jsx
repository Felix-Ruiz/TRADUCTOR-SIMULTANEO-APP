import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { Mic, Square, Radio, Globe } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';

const socket = io(import.meta.env.VITE_BACKEND_URL, { autoConnect: false });

const SpeakerView = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [transcription, setTranscription] = useState('');
  
  // Guardamos TODAS las traducciones que llegan del backend
  const [allTranslations, setAllTranslations] = useState({}); 
  
  const [inputLanguage, setInputLanguage] = useState('es-CO'); 
  const [outputLanguage, setOutputLanguage] = useState('en'); // Estado para el idioma de salida en pantalla
  
  const audioContextRef = useRef(null);
  const processorRef = useRef(null);
  const streamRef = useRef(null);

  const audienceUrl = `${window.location.origin}/audience`;

  useEffect(() => {
    socket.on('connect', () => setIsConnected(true));
    socket.on('disconnect', () => setIsConnected(false));
    
    socket.on('translation-result', (data) => {
      setTranscription(data.original);
      if (data.translations) {
        // Guardamos el objeto completo con los 15 idiomas
        setAllTranslations(data.translations); 
      }
    });

    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('translation-result');
    };
  }, []);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      
      socket.connect();
      socket.emit('start-translation', { 
        fromLanguage: inputLanguage, 
        toLanguages: ['en', 'pt', 'fr', 'de', 'it', 'zh-Hans', 'ja', 'ko', 'ru', 'ar', 'hi', 'nl', 'tr', 'pl', 'sv'] 
      });
      
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      const audioContext = new AudioContext({ sampleRate: 16000 });
      audioContextRef.current = audioContext;

      const source = audioContext.createMediaStreamSource(stream);
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      processor.onaudioprocess = (e) => {
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

      const gainNode = audioContext.createGain();
      gainNode.gain.value = 0;
      source.connect(processor);
      processor.connect(gainNode);
      gainNode.connect(audioContext.destination);

      setIsRecording(true);
    } catch (error) {
      console.error('Error accediendo al micrófono:', error);
      alert('Por favor, permite el acceso al micrófono en tu navegador.');
    }
  };

  const stopRecording = () => {
    if (processorRef.current) processorRef.current.disconnect();
    if (audioContextRef.current) audioContextRef.current.close();
    if (streamRef.current) streamRef.current.getTracks().forEach(track => track.stop());
    
    socket.emit('stop-translation');
    socket.disconnect();
    setIsRecording(false);
  };

  return (
    <div className="flex flex-col h-screen w-full p-8 max-w-5xl mx-auto">
      
      <header className="flex justify-between items-start mb-12">
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <Globe className="w-8 h-8 text-primary" />
            <h1 className="text-2xl font-bold tracking-tight">Traducción Simultánea</h1>
          </div>
          <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full font-medium text-sm w-max ${isRecording ? 'bg-red-500/10 text-red-500' : 'bg-gray-800 text-gray-400'}`}>
            <Radio className={`w-4 h-4 ${isRecording ? 'animate-pulse' : ''}`} />
            {isRecording ? 'Transmitiendo en vivo' : 'Sistema en espera'}
          </div>
        </div>
        
        <div className="hidden md:flex items-center gap-5 bg-dark p-3 rounded-2xl border border-gray-800 shadow-xl">
          <div className="bg-white p-2 rounded-xl">
            <QRCodeSVG value={audienceUrl} size={70} />
          </div>
          <div className="flex flex-col pr-4">
            <span className="text-xs text-gray-400 font-bold uppercase tracking-wider mb-1">Acceso Audiencia</span>
            <a href={audienceUrl} target="_blank" rel="noreferrer" className="text-sm text-primary hover:text-blue-400 font-medium transition-colors">
              Abrir enlace remoto ↗
            </a>
          </div>
        </div>
      </header>

      <main className="flex-1 flex flex-col justify-center gap-8 mb-12">
        <div className="space-y-2">
          <div className="flex items-center gap-3 mb-2">
            <span className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Idioma del Orador:</span>
            <div className="relative">
              <select 
                value={inputLanguage}
                onChange={(e) => setInputLanguage(e.target.value)}
                disabled={isRecording}
                className="bg-darker border border-gray-700 text-primary text-sm font-bold uppercase tracking-wider rounded-lg px-3 py-1.5 focus:ring-1 focus:ring-primary focus:outline-none appearance-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <option value="es-CO">Español</option>
                <option value="en-US">Inglés</option>
                <option value="pt-BR">Portugués</option>
                <option value="fr-FR">Francés</option>
                <option value="de-DE">Alemán</option>
                <option value="it-IT">Italiano</option>
                <option value="zh-CN">Chino</option>
                <option value="ja-JP">Japonés</option>
                <option value="ko-KR">Coreano</option>
                <option value="ru-RU">Ruso</option>
                <option value="ar-EG">Árabe</option>
                <option value="hi-IN">Hindi</option>
                <option value="nl-NL">Holandés</option>
                <option value="tr-TR">Turco</option>
                <option value="pl-PL">Polaco</option>
                <option value="sv-SE">Sueco</option>
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-primary">
                <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
                  <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/>
                </svg>
              </div>
            </div>
          </div>
          
          <p className="text-4xl md:text-5xl font-bold leading-tight text-white min-h-[3rem] transition-all duration-300 ease-in-out">
            {transcription || "Presiona el botón para comenzar a hablar..."}
          </p>
        </div>

        <div className="space-y-2">
          {/* Selector de idioma de Salida Principal */}
          <div className="flex items-center gap-3 mb-2">
            <span className="text-sm font-semibold text-primary uppercase tracking-wider">Traducción Principal:</span>
            <div className="relative">
              <select 
                value={outputLanguage}
                onChange={(e) => setOutputLanguage(e.target.value)}
                // No se bloquea al grabar, permitiendo cambio dinámico
                className="bg-darker border border-gray-700 text-gray-400 text-sm font-bold uppercase tracking-wider rounded-lg px-3 py-1.5 focus:ring-1 focus:ring-gray-400 focus:outline-none appearance-none cursor-pointer"
              >
                <option value="en">Inglés</option>
                <option value="pt">Portugués</option>
                <option value="fr">Francés</option>
                <option value="de">Alemán</option>
                <option value="it">Italiano</option>
                <option value="zh-Hans">Chino</option>
                <option value="ja">Japonés</option>
                <option value="ko">Coreano</option>
                <option value="ru">Ruso</option>
                <option value="ar">Árabe</option>
                <option value="hi">Hindi</option>
                <option value="nl">Holandés</option>
                <option value="tr">Turco</option>
                <option value="pl">Polaco</option>
                <option value="sv">Sueco</option>
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-400">
                <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
                  <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/>
                </svg>
              </div>
            </div>
          </div>

          <p className="text-3xl md:text-4xl font-medium leading-relaxed text-gray-400 min-h-[3rem] transition-all duration-300 ease-in-out">
            {allTranslations[outputLanguage] || ""}
          </p>
        </div>
      </main>

      <footer className="flex justify-center pb-8">
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
      </footer>
    </div>
  );
};

export default SpeakerView;