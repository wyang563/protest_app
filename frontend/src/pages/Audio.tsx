import React, { useState } from 'react';
import { CSSProperties } from 'react';

const Audio: React.FC = () => {
  const [transcription, setTranscription] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [filePath, setFilePath] = useState<string>('');

  const handleTranscription = async (): Promise<void> => {
    if (!filePath) {
      setTranscription('Please enter a file path first.');
      return;
    }
    try {
      setLoading(true);
      setTranscription('');
      
      const formData = new FormData();
      formData.append('file', {
        uri: filePath,
        name: 'audiofile',
        type: 'audio/wav',
      } as any);

      const response = await fetch('http://localhost:5000/api/transcribe', {
        method: 'POST',
        body: formData,
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      const data = await response.json();
      setTranscription(data.transcription || 'No transcription available');
    } catch (error) {
      console.error('Transcription error:', error);
      setTranscription('Error during transcription');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      <h2 style={styles.title}>Whisper Transcription Demo</h2>
      <input
        style={styles.input}
        placeholder="Enter file path"
        value={filePath}
        onChange={(e) => setFilePath(e.target.value)}
      />
      <button onClick={handleTranscription} disabled={loading || !filePath}>
        Transcribe Audio
      </button>
      {loading && <div style={styles.loader}>Loading...</div>}
      <p style={styles.transcription}>{transcription || 'Press the button to transcribe the audio file.'}</p>
    </div>
  );
};

const styles: { [key: string]: CSSProperties } = {
  container: { display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '16px' },
  title: { fontSize: '24px', fontWeight: 'bold', marginBottom: '20px' },
  input: { width: '80%', padding: '10px', border: '1px solid #ccc', marginBottom: '20px' },
  loader: { marginTop: '10px', fontSize: '16px', color: '#007AFF' },
  transcription: { marginTop: '20px', fontSize: '16px', textAlign: 'center' },
};

export default Audio;
