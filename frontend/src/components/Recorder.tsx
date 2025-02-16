import React, { useState, useRef } from 'react';
import { 
  Button, 
  Alert,
  CircularProgress,
  Box,
  Container
} from '@mui/material';
import MicIcon from '@mui/icons-material/Mic';
import StopIcon from '@mui/icons-material/Stop';

const AudioRecorder = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const audioChunks = useRef<Blob[]>([]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorder.current = new MediaRecorder(stream);
      audioChunks.current = [];

      mediaRecorder.current.ondataavailable = (event) => {
        audioChunks.current.push(event.data);
      };

      mediaRecorder.current.onstop = async () => {
        const audioBlob = new Blob(audioChunks.current, { type: 'audio/wav' });
        await uploadAudio(audioBlob);
      };

      mediaRecorder.current.start();
      setIsRecording(true);
      setError(null);
    } catch (err) {
      setError('Failed to access microphone. Please ensure microphone permissions are granted.');
      console.error('Error accessing microphone:', err);
    }
  };

  const stopRecording = () => {
    if (mediaRecorder.current && isRecording) {
      mediaRecorder.current.stop();
      mediaRecorder.current.stream.getTracks().forEach(track => track.stop());
      setIsRecording(false);
    }
  };

  const uploadAudio = async (audioBlob: Blob) => {
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('audio', audioBlob);

      const response = await fetch('/api/upload-audio', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        throw new Error('Failed to upload audio');
      }

      const data = await response.json();
      console.log('Upload successful:', data);
    } catch (err) {
      setError('Failed to upload audio. Please try again.');
      console.error('Error uploading audio:', err);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <Container maxWidth="sm">
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, p: 2 }}>
        <Box sx={{ display: 'flex', justifyContent: 'center' }}>
          {!isRecording ? (
            <Button
              variant="contained"
              color="primary"
              onClick={startRecording}
              disabled={isUploading}
              startIcon={<MicIcon />}
            >
              Start Recording
            </Button>
          ) : (
            <Button
              variant="contained"
              color="error"
              onClick={stopRecording}
              startIcon={<StopIcon />}
            >
              Stop Recording
            </Button>
          )}
        </Box>

        {isUploading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', gap: 1, alignItems: 'center' }}>
            <CircularProgress size={20} />
            <span>Uploading audio...</span>
          </Box>
        )}

        {error && (
          <Alert severity="error">
            {error}
          </Alert>
        )}
      </Box>
    </Container>
  );
};

export default AudioRecorder;