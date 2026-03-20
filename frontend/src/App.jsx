import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import SpeakerView from './components/SpeakerView';
import AudienceView from './components/AudienceView';
// NUEVO: Importamos el panel de Dios
import MasterView from './components/MasterView'; 

function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-darker text-white">
        <Routes>
          <Route path="/" element={<AudienceView />} />
          <Route path="/admin" element={<SpeakerView />} />
          {/* NUEVO: Ruta ultrasecreta para ti */}
          <Route path="/master" element={<MasterView />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}

export default App;