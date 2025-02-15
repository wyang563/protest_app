import React, { useState, ChangeEvent } from 'react';

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
    <div className="App">
      <header className="App-header">
        <a
          className="App-link"
          href="https://reactjs.org"
          target="_blank"
          rel="noopener noreferrer"
        >
          Learn React
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
