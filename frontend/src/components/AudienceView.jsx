import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { Headphones, Globe2, Volume2, VolumeX, AlertCircle } from 'lucide-react';

const socket = io(import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001');

const AudienceView = () => {
  const [language, setLanguage] = useState('es'); 
  const [translation, setTranslation] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [isAudioEnabled, setIsAudioEnabled] = useState(false);

  const synthRef = useRef(window.speechSynthesis);
  const lastSpokenTextRef = useRef('');

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

      if (isAudioEnabled && data.type === 'final' && currentText && currentText !== lastSpokenTextRef.current) {
        speak(currentText, language);
        lastSpokenTextRef.current = currentText;
      }
    });

    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('translation-result');
      if (synthRef.current) synthRef.current.cancel();
    };
  }, [language, isAudioEnabled]); 

  const speak = (text, langCode) => {
    if (!synthRef.current) return;
    synthRef.current.cancel(); 
    
    const utterance = new SpeechSynthesisUtterance(text);
    const langMap = {
      'es': 'es-ES', 'en': 'en-US', 'de': 'de-DE', 'fr': 'fr-FR', 'pt': 'pt-BR'
    };
    
    utterance.lang = langMap[langCode] || langCode;
    utterance.rate = 1.05; 
    
    synthRef.current.speak(utterance);
  };

  const toggleAudio = () => {
    if (!isAudioEnabled) {
      const unlockVoice = new SpeechSynthesisUtterance("");
      synthRef.current.speak(unlockVoice);
    } else {
      synthRef.current.cancel();
      lastSpokenTextRef.current = ''; 
    }
    setIsAudioEnabled(!isAudioEnabled);
  };

  return (
    <div className="flex flex-col h-screen w-full p-6 max-w-md mx-auto bg-darker">
      
      <header className="flex justify-between items-center mb-8 pb-4 border-b border-gray-800">
        <div className="flex items-center gap-3">
          <Headphones className="w-7 h-7 text-accent" />
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

      <div className="mb-10">
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
              lastSpokenTextRef.current = '';
              if (synthRef.current) synthRef.current.cancel();
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
              Modo de voz activado. Debido al procesamiento en tiempo real, el audio puede tener un ligero retraso respecto a la transcripción en pantalla.
            </p>
          </div>
        )}
      </div>

      <main className="flex-1 flex flex-col justify-center pb-12">
        <p className="text-3xl md:text-4xl font-medium leading-relaxed text-white min-h-[3rem] text-center transition-all duration-300 ease-in-out">
          {translation || "Esperando al orador..."}
        </p>
      </main>

    </div>
  );
};

export default AudienceView;