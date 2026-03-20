import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import SpeakerView from './components/SpeakerView';
import AudienceView from './components/AudienceView';

function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-darker text-white">
        <Routes>
          {/* La ruta principal y pública ahora es exclusivamente para la Audiencia */}
          <Route path="/" element={<AudienceView />} />
          
          {/* El panel de control del Orador se mueve a una ruta privada/oculta */}
          <Route path="/admin" element={<SpeakerView />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}

export default App;