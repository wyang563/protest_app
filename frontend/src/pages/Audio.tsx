import React, { useState } from 'react';
import { StyleSheet, Text, View, Button, ActivityIndicator } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';

const Audio: React.FC = () => {
  const [transcription, setTranscription] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [selectedFile, setSelectedFile] = useState<DocumentPicker.DocumentPickerResult | null>(null);

  const pickFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: 'audio/*' });
      if (!result.canceled) {
        setSelectedFile(result); 
      }
    } catch (error) {
      console.error('Error selecting file:', error);
    }
  };

  const handleTranscription = async (): Promise<void> => {
    if (!selectedFile) {
      setTranscription('Please select a file first.');
      return;
    }
    try {
      setLoading(true);
      setTranscription('');
      
      const formData = new FormData();
      formData.append('file', {
        uri: selectedFile.assets[0].uri,
        name: selectedFile.assets[0].name,
        type: selectedFile.assets[0].mimeType,
      });

      const response = await fetch('http://your-flask-api-url/transcribe', {
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
    <View style={styles.container}>
      <Text style={styles.title}>Whisper Transcription Demo</Text>
      <Button title="Select Audio File" onPress={pickFile} disabled={loading} />
      {selectedFile && <Text style={styles.fileText}>Selected: {selectedFile.assets[0].name}</Text>}
      <Button title="Transcribe Audio" onPress={handleTranscription} disabled={loading || !selectedFile} />
      {loading && <ActivityIndicator size="large" color="#007AFF" />}
      <Text style={styles.transcription}>{transcription || 'Press the button to transcribe the audio file.'}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 16 },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 20 },
  fileText: { marginTop: 10, fontSize: 16, textAlign: 'center' },
  transcription: { marginTop: 20, fontSize: 16, textAlign: 'center' },
});

