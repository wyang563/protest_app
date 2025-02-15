import React, { useEffect, useState } from 'react';
import axios from 'axios';

interface Transcription {
  id: number;
  radio_stream: string;
  start_time: string;
  text: string;
}

const API_BASE_URL = process.env.REACT_APP_API_URL || '/api';

const Radio: React.FC = () => {
  const [transcriptions, setTranscriptions] = useState<Transcription[]>([]);
  const [error, setError] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    const fetchTranscriptions = async () => {
      try {
        // Build the SQL query and encode it for safe transport as a URL parameter
        const sqlQuery = encodeURIComponent("SELECT * FROM transcriptions");
        const response = await axios.get(`${API_BASE_URL}/query?query=${sqlQuery}`);
        setTranscriptions(response.data);
      } catch (err: any) {
        console.error("Error fetching data:", err);
        setError("Error fetching data: " + err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchTranscriptions();
  }, []);

  return (
    <div>
      <h1>Radio Transcriptions</h1>
      {loading && <p>Loading transcriptions...</p>}
      {error && <p style={{ color: 'red' }}>{error}</p>}
      {!loading && !error && (
        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead>
            <tr>
              <th style={{ border: '1px solid black', padding: '8px' }}>ID</th>
              <th style={{ border: '1px solid black', padding: '8px' }}>Radio Stream</th>
              <th style={{ border: '1px solid black', padding: '8px' }}>Start Time</th>
              <th style={{ border: '1px solid black', padding: '8px' }}>Text</th>
            </tr>
          </thead>
          <tbody>
            {transcriptions.map((transcription) => (
              <tr key={transcription.id}>
                <td style={{ border: '1px solid black', padding: '8px' }}>{transcription.id}</td>
                <td style={{ border: '1px solid black', padding: '8px' }}>{transcription.radio_stream}</td>
                <td style={{ border: '1px solid black', padding: '8px' }}>{transcription.start_time}</td>
                <td style={{ border: '1px solid black', padding: '8px' }}>{transcription.text}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};

export default Radio;
