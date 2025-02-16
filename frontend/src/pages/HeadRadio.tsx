import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { utcToLocalString } from '../utils';

interface Transcription {
  id: number;
  radio_stream: string;
  start_time: string;
  text: string;
}

const API_BASE_URL = process.env.REACT_APP_API_URL || '/api';

const HeadRadio: React.FC = () => {
  const [transcriptions, setTranscriptions] = useState<Transcription[]>([]);
  const [error, setError] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);

  const [userTimeZone, setUserTimeZone] = useState(
    Intl.DateTimeFormat().resolvedOptions().timeZone
  );

  useEffect(() => {
    const fetchTranscriptions = async () => {
      try {
        // Build the SQL query and encode it for safe transport as a URL parameter
        const sqlQuery = encodeURIComponent("SELECT * FROM transcriptions WHERE radio_stream = 'CNN' ORDER BY id DESC LIMIT 1000");
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
    <div className="p-4">
      <h1 className="text-center text-2xl font-bold mb-4">
        Head Radio Logs 
      </h1>
      {loading && <p>Loading transcriptions...</p>}
      {error && <p className="text-red-500">{error}</p>}
      {!loading && !error && (
        <table className="min-w-full border-collapse border border-gray-300">
          <thead className="bg-gray-100">
            <tr>
              <th className="border border-gray-300 px-4 py-2">ID</th>
              <th className="border border-gray-300 px-4 py-2">Radio Stream</th>
              <th className="border border-gray-300 px-4 py-2">Start Time</th>
              <th className="border border-gray-300 px-4 py-2">Text</th>
            </tr>
          </thead>
          <tbody>
            {transcriptions.map((transcription) => (
              <tr
                key={transcription.id}
                className="hover:bg-gray-50"
              >
                <td className="border border-gray-300 px-4 py-2">{transcription.id}</td>
                <td className="border border-gray-300 px-4 py-2">{transcription.radio_stream}</td>
                <td className="border border-gray-300 px-4 py-2">{utcToLocalString(transcription.start_time + 'Z', userTimeZone)}</td>
                <td className="border border-gray-300 px-4 py-2">{transcription.text}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};

export default HeadRadio;
