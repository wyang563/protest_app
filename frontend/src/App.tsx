import React, { useState, ChangeEvent } from 'react';
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import { Map } from './pages/Map';
import 'leaflet/dist/leaflet.css';

function App() {
  const [file, setFile] = useState<File | null>(null);
  const [transcription, setTranscription] = useState<string>('');

  // Handler for file selection
  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files && e.target.files[0];
    setFile(selectedFile || null);
  };

  // Handler to call the Whisper API
  const handleTranscribe = async () => {
    if (!file) {
      alert('Please select an audio file first!');
      return;
    }

    try {
      const formData = new FormData();
      formData.append('audio_file', file);

      // Adjust your endpoint URL if necessary
      const response = await fetch('http://localhost:5000/api/transcribe', {
        method: 'POST',
        body: formData,
      });

      // You can define a type/interface for your JSON response if you want
      const data = await response.json();
      setTranscription(data.transcription || 'No transcription was returned');
    } catch (error) {
      console.error('Error during transcription:', error);
      setTranscription('An error occurred during transcription.');
    }
  };

  return (
    <Router>
      <div className="App">
        <Routes>
          <Route path="/" element={<Navigate to="/map" replace />} />
          <Route path="/map" element={<Map />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;