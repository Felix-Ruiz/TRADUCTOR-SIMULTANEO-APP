import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import SpeakerView from './components/SpeakerView';
import AudienceView from './components/AudienceView';
import MasterView from './components/MasterView'; 
// NUEVO: Importamos el panel del Cliente (Administrador de Evento)
import EventAdminView from './components/EventAdminView';

function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-darker text-white">
        <Routes>
          <Route path="/" element={<AudienceView />} />
          <Route path="/admin" element={<SpeakerView />} />
          <Route path="/master" element={<MasterView />} />
          {/* NUEVO: Ruta privada para que tu cliente administre su evento */}
          <Route path="/event-admin" element={<EventAdminView />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}

export default App;