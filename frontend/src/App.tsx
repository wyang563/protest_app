import React, { useState, ChangeEvent } from 'react';
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import { Map } from './pages/Map';
import { Audio } from './pages/Audio';
import 'leaflet/dist/leaflet.css';

function App() {

  // Handler for file selection
  return (
    <Router>
      <div className="App">
        <Routes>
          <Route path="/" element={<Navigate to="/map" replace />} />
          <Route path="/map" element={<Map />} />
          <Route path="/audio" element={<Audio />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;