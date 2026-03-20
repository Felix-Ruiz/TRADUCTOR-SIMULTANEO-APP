import React, { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import { Headphones, Globe2 } from 'lucide-react';

const socket = io(import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001');

const AudienceView = () => {
  const [language, setLanguage] = useState('es'); 
  const [translation, setTranslation] = useState('');
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    socket.on('connect', () => setIsConnected(true));
    socket.on('disconnect', () => setIsConnected(false));
    
    socket.on('translation-result', (data) => {
      // Si existe la traducción de Azure, la mostramos.
      if (data.translations && data.translations[language]) {
        setTranslation(data.translations[language]);
      } else if (data.original) {
        // Fallback: Si el usuario elige español y el orador habla en español, 
        // Azure no siempre "traduce", simplemente mostramos el texto original.
        setTranslation(data.original);
      }
    });

    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('translation-result');
    };
  }, [language]); 

  return (
    <div className="flex flex-col h-screen w-full p-6 max-w-md mx-auto bg-darker">
      
      <header className="flex justify-between items-center mb-8 pb-4 border-b border-gray-800">
        <div className="flex items-center gap-3">
          <Headphones className="w-7 h-7 text-accent" />
          <h1 className="text-xl font-bold text-white">Audiencia en Vivo</h1>
        </div>
        <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-accent animate-pulse shadow-[0_0_10px_rgba(16,185,129,0.5)]' : 'bg-red-500'}`} />
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