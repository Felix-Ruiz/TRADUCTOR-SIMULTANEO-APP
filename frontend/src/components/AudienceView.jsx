import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { Headphones, Globe2, Volume2, VolumeX } from 'lucide-react';

const socket = io(import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001');

const AudienceView = () => {
  const [language, setLanguage] = useState('es'); 
  const [translation, setTranslation] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [isAudioEnabled, setIsAudioEnabled] = useState(false);

  // Referencias para control estricto de la voz (sin repeticiones ni delay)
  const synthRef = useRef(window.speechSynthesis);
  const lastSpokenTextRef = useRef('');

  useEffect(() => {
    socket.on('connect', () => setIsConnected(true));
    socket.on('disconnect', () => setIsConnected(false));
    
    socket.on('translation-result', (data) => {
      let currentText = '';

      // 1. Mostrar el texto en pantalla
      if (data.translations && data.translations[language]) {
        currentText = data.translations[language];
        setTranslation(currentText);
      } else if (data.original) {
        currentText = data.original;
        setTranslation(currentText);
      }

      // 2. Lógica de voz estricta
      // Solo habla si: el audio está activo + es frase final + hay texto + no es la misma frase anterior
      if (isAudioEnabled && data.type === 'final' && currentText && currentText !== lastSpokenTextRef.current) {
        speak(currentText, language);
        lastSpokenTextRef.current = currentText; // Guardamos en memoria para no repetirla
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
    
    // El secreto para no tener delay: cortar inmediatamente cualquier proceso anterior
    synthRef.current.cancel();
    
    const utterance = new SpeechSynthesisUtterance(text);
    
    const langMap = {
      'es': 'es-ES', 'en': 'en-US', 'pt': 'pt-BR', 'fr': 'fr-FR',
      'de': 'de-DE', 'it': 'it-IT', 'ja': 'ja-JP', 'ko': 'ko-KR',
      'zh-Hans': 'zh-CN', 'ru': 'ru-RU'
    };
    
    utterance.lang = langMap[langCode] || langCode;
    utterance.rate = 1.05; // Velocidad ligeramente ágil para el "En Vivo"
    
    synthRef.current.speak(utterance);
  };

  const toggleAudio = () => {
    if (!isAudioEnabled) {
      // Reproducir silencio corto para desbloquear las políticas de audio de iOS/Chrome Mobile
      const unlockVoice = new SpeechSynthesisUtterance("");
      synthRef.current.speak(unlockVoice);
    } else {
      // Al apagar, silenciamos de golpe y limpiamos memoria
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
        {/* Añadimos el botón de audio junto al indicador de conexión para mantener estética */}
        <div className="flex items-center gap-4">
          <button 
            onClick={toggleAudio}
            className={`p-2 rounded-full transition-colors ${isAudioEnabled ? 'bg-accent/20 text-accent' : 'bg-gray-800 text-gray-500 hover:bg-gray-700'}`}
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
              // Purgar memoria y cortar audio al instante si cambia de idioma
              lastSpokenTextRef.current = ''; 
              if (synthRef.current) synthRef.current.cancel();
            }}
            className="w-full bg-dark border border-gray-700 text-white text-lg rounded-xl p-4 focus:ring-2 focus:ring-accent focus:outline-none appearance-none cursor-pointer"
          >
            <option value="es">Español</option>
            <option value="en">English (Inglés)</option>
            <option value="pt">Português (Portugués)</option>
            <option value="fr">Français (Francés)</option>
            <option value="de">Deutsch (Alemán)</option>
            <option value="it">Italiano (Italiano)</option>
            <option value="zh-Hans">中文 (Chino Simplificado)</option>
            <option value="ja">日本語 (Japonés)</option>
            <option value="ko">한국어 (Coreano)</option>
            <option value="ru">Русский (Ruso)</option>
            <option value="ar">العربية (Árabe)</option>
            <option value="hi">हिन्दी (Hindi)</option>
            <option value="nl">Nederlands (Holandés)</option>
            <option value="tr">Türkçe (Turco)</option>
            <option value="pl">Polski (Polaco)</option>
            <option value="sv">Svenska (Sueco)</option>
            {/* 10 Nuevos Idiomas para la Audiencia */}
            <option value="da">Dansk (Danés)</option>
            <option value="fi">Suomi (Finés)</option>
            <option value="el">Ελληνικά (Griego)</option>
            <option value="he">עברית (Hebreo)</option>
            <option value="id">Bahasa Indonesia (Indonesio)</option>
            <option value="nb">Norsk (Noruego)</option>
            <option value="th">ไทย (Tailandés)</option>
            <option value="vi">Tiếng Việt (Vietnamita)</option>
            <option value="cs">Čeština (Checo)</option>
            <option value="hu">Magyar (Húngaro)</option>
          </select>
          <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-gray-400">
            <svg className="fill-current h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
              <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/>
            </svg>
          </div>
        </div>
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