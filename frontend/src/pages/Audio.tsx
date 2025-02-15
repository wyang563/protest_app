import React, { useState, ChangeEvent } from 'react';

// Define the API base URL based on environment
const API_BASE_URL = process.env.REACT_APP_API_URL || '/api';

const Audio: React.FC = () => {
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

      // Use relative path for API calls
      const response = await fetch(`${API_BASE_URL}/transcribe_file`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      setTranscription(data.transcription || 'No transcription was returned');
    } catch (error) {
      console.error('Error during transcription:', error);
      setTranscription('An error occurred during transcription.');
    }
  };

  return (
    <div className="App">
      <header className="App-header">
        <a
          className="App-link"
          href="https://reactjs.org"
          target="_blank"
          rel="noopener noreferrer"
        >
        </a>
      </header>

      <main style={{ marginTop: '2rem' }}>
        {/* File input for audio selection */}
        <input
          type="file"
          accept="audio/*"
          onChange={handleFileChange}
          style={{ marginBottom: '1rem' }}
        />

        {/* Button to initiate the transcription request */}
        <button onClick={handleTranscribe}>
          Transcribe
        </button>

        {/* Display transcription result if available */}
        {transcription && (
          <p style={{ marginTop: '1rem' }}>
            <strong>Transcription:</strong> {transcription}
          </p>
        )}
      </main>
    </div>
  );
} 

export default Audio;
