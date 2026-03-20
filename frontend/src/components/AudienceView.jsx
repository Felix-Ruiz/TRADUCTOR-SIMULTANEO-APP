import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { Headphones, Globe2, Volume2, VolumeX, AlertCircle } from 'lucide-react';

const socket = io(import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001');

const AudienceView = () => {
  const queryParams = new URLSearchParams(window.location.search);
  const isTvMode = queryParams.get('tv') === 'true';
  const urlLang = queryParams.get('lang');

  const [language, setLanguage] = useState(urlLang || 'es'); 
  const [translation, setTranslation] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [isAudioEnabled, setIsAudioEnabled] = useState(false);

  useEffect(() => {
    socket.on('connect', () => setIsConnected(true));
    socket.on('disconnect', () => setIsConnected(false));
    
    socket.on('translation-result', (data) => {
      let currentText = '';

      if (data.translations && data.translations[language]) {
        currentText = data.translations[language];
        setTranslation(currentText);
      } else if (data.original) {
        currentText = data.original;
        setTranslation(currentText);
      }
    });

    // ==========================================
    // REPRODUCTOR HTML5 ROBUSTO (SIN AUDIO CONTEXT)
    // ==========================================
    socket.on('neural-audio', async (data) => {
      if (!isTvMode && isAudioEnabled && data.language === language && data.audioBuffer) {
        try {
          console.log("[Audio] Recibido paquete de Azure. Preparando HTML5 Audio...");
          
          // 1. Convertimos el paquete crudo en un archivo MP3 virtual
          const blob = new Blob([data.audioBuffer], { type: 'audio/mp3' });
          const url = URL.createObjectURL(blob);
          
          // 2. Usamos el reproductor nativo del celular
          const audioPlayer = new Audio(url);
          
          // 3. Limpiamos la memoria del celular cuando termina de hablar
          audioPlayer.onended = () => {
            URL.revokeObjectURL(url);
          };
          
          // 4. Reproducir
          await audioPlayer.play();
          console.log("[Audio] Reproducción exitosa.");
        } catch (error) {
          console.error("[Audio] Error al reproducir el MP3 con HTML5:", error);
        }
      }
    });

    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('translation-result');
      socket.off('neural-audio');
    };
  }, [language, isAudioEnabled, isTvMode]); 

  // ==========================================
  // BOTÓN DE DESBLOQUEO DE AUDIO MÁS SENCILLO
  // ==========================================
  const toggleAudio = async () => {
    if (!isAudioEnabled) {
      try {
        // En HTML5, reproducir un archivo vacío desbloquea el motor en iOS/Chrome
        const silentAudio = new Audio("data:audio/mp3;base64,//NExAAAAANIAAAAAExBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq");
        await silentAudio.play();
        console.log("[Audio] Motor HTML5 desbloqueado por el usuario.");
      } catch (e) {
        console.log("[Audio] Advertencia al desbloquear, pero continuaremos:", e);
      }
    }
    setIsAudioEnabled(!isAudioEnabled);
  };

  if (isTvMode) {
    return (
      <div className="flex flex-col justify-end h-screen w-full bg-black p-8 md:p-16 lg:pb-24 overflow-hidden relative">
        <div className="absolute top-6 right-8 z-10 opacity-30 hover:opacity-100 transition-opacity duration-300">
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

  return (
    <div className="flex flex-col h-screen w-full p-6 max-w-md mx-auto bg-darker">
      
      <header className="flex justify-between items-center mb-8 pb-4 border-b border-gray-800 shrink-0">
        <div className="flex items-center gap-3">
          <img src="/logo.png" alt="Logo" className="h-8 w-auto object-contain" onError={(e) => { e.target.style.display = 'none'; }} />
          <h1 className="text-xl font-bold text-white">Audiencia en Vivo</h1>
        </div>
        <div className="flex items-center gap-4">
          <button 
            onClick={toggleAudio}
            className={`p-2 rounded-full transition-colors ${isAudioEnabled ? 'bg-accent/20 text-accent' : 'bg-gray-800 text-gray-500 hover:bg-gray-700'}`}
            title="Activar traducción por voz"
          >
            {isAudioEnabled ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
          </button>
          <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-accent animate-pulse shadow-[0_0_10px_rgba(16,185,129,0.5)]' : 'bg-red-500'}`} />
        </div>
      </header>

      <div className="mb-6 shrink-0">
        <label className="flex items-center gap-2 text-sm font-semibold text-gray-400 mb-3 uppercase tracking-wider">
          <Globe2 className="w-4 h-4" />
          Selecciona tu idioma
        </label>
        <div className="relative">
          <select 
            value={language} 
            onChange={(e) => {
              setLanguage(e.target.value);
              setTranslation('');
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

        {isAudioEnabled && (
          <div className="mt-4 flex items-start gap-2 bg-yellow-500/10 border border-yellow-500/20 p-3 rounded-lg">
            <AlertCircle className="w-4 h-4 text-yellow-500 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-yellow-500/90 leading-relaxed">
              Modo de voz activado. Transmisión de voz neuronal de alta fidelidad en curso.
            </p>
          </div>
        )}
      </div>

      <main className="flex-1 flex flex-col justify-end pb-8 overflow-hidden">
        <p className="text-2xl md:text-3xl font-normal leading-relaxed text-white min-h-[5rem] text-left tracking-wide">
          {translation || "Esperando al orador..."}
        </p>
      </main>

    </div>
  );
};

export default AudienceView;