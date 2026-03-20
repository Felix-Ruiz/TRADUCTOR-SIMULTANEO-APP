import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { Mic, Square, Radio, Globe } from 'lucide-react';

// Conectamos con nuestro backend local
const socket = io('http://localhost:3001', { autoConnect: false });

const SpeakerView = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [transcription, setTranscription] = useState('');
  const [translation, setTranslation] = useState('');
  
  // Referencias para limpiar la memoria al detener
  const audioContextRef = useRef(null);
  const processorRef = useRef(null);
  const streamRef = useRef(null);

  useEffect(() => {
    socket.on('connect', () => setIsConnected(true));
    socket.on('disconnect', () => setIsConnected(false));
    
    socket.on('translation-result', (data) => {
      setTranscription(data.original);
      if (data.translations && data.translations['en']) {
        setTranslation(data.translations['en']);
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
      // 1. Pedir permisos de micrófono
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      
      // 2. Conectar el socket e iniciar la IA en Azure
      socket.connect();
      socket.emit('start-translation', { 
        fromLanguage: 'es-CO', 
        toLanguages: ['en', 'pt'] 
      });
      
      // 3. Crear el contexto de audio exigiendo formato de estudio (16kHz)
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      const audioContext = new AudioContext({ sampleRate: 16000 });
      audioContextRef.current = audioContext;

      // 4. Conectar el micrófono al procesador
      const source = audioContext.createMediaStreamSource(stream);
      // Crear un procesador que tome muestras (4096), con 1 canal de entrada (Mono) y 1 de salida
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      // 5. Convertir y enviar el audio crudo (PCM 16-bit) en tiempo real
      processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0); // Audio en formato Float32
        const pcm16 = new Int16Array(inputData.length); // Array para el formato Int16 que pide Azure
        
        for (let i = 0; i < inputData.length; i++) {
          let s = Math.max(-1, Math.min(1, inputData[i]));
          pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }
        
        if (socket.connected) {
          socket.emit('audio-stream', pcm16.buffer);
        }
      };

      // 6. Completar el circuito de audio (silenciado para que no escuches eco)
      const gainNode = audioContext.createGain();
      gainNode.gain.value = 0; // Volumen cero
      source.connect(processor);
      processor.connect(gainNode);
      gainNode.connect(audioContext.destination);

      setIsRecording(true);
    } catch (error) {
      console.error('Error accediendo al micrófono:', error);
      alert('Por favor, permite el acceso al micrófono en tu navegador para continuar.');
    }
  };

  const stopRecording = () => {
    if (processorRef.current) {
      processorRef.current.disconnect();
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
    }
    
    socket.emit('stop-translation');
    socket.disconnect();
    setIsRecording(false);
  };

  return (
    <div className="flex flex-col h-screen w-full p-8 max-w-5xl mx-auto">
      <header className="flex justify-between items-center mb-12">
        <div className="flex items-center gap-3">
          <Globe className="w-8 h-8 text-primary" />
          <h1 className="text-2xl font-bold tracking-tight">Traducción Simultánea</h1>
        </div>
        
        <div className={`flex items-center gap-2 px-4 py-2 rounded-full font-medium text-sm ${isRecording ? 'bg-red-500/10 text-red-500' : 'bg-gray-800 text-gray-400'}`}>
          <Radio className={`w-4 h-4 ${isRecording ? 'animate-pulse' : ''}`} />
          {isRecording ? 'Transmitiendo en vivo' : 'Sistema en espera'}
        </div>
      </header>

      <main className="flex-1 flex flex-col justify-center gap-8 mb-12">
        <div className="space-y-2">
          <span className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Tu voz (Español)</span>
          <p className="text-4xl md:text-5xl font-bold leading-tight text-white min-h-[3rem]">
            {transcription || "Presiona el botón para comenzar a hablar..."}
          </p>
        </div>

        <div className="space-y-2">
          <span className="text-sm font-semibold text-primary uppercase tracking-wider">Traducción (Inglés)</span>
          <p className="text-3xl md:text-4xl font-medium leading-relaxed text-gray-400 min-h-[3rem]">
            {translation}
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