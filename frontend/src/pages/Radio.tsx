import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { utcToLocalString, localToUTCString } from '../utils';

interface Transcription {
  id: number;
  radio_stream: string;
  start_time: string;
  text: string;
}

function getSentiment(radioStream: string): string {
  if (radioStream.toLowerCase().includes("a")) return "stressed";
  if (radioStream.toLowerCase().includes("b")) return "fleeing";
  if (radioStream.toLowerCase().includes("c")) return "needs rescue";
  return "advancing";
}

const API_BASE_URL = process.env.REACT_APP_API_URL || '/api';

const Radio: React.FC = () => {
  const [sources, setSources] = useState<string[]>([]);
  const [selectedSource, setSelectedSource] = useState<string>('');
  const [transcriptions, setTranscriptions] = useState<Transcription[]>([]);
  const [error, setError] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);

  // For time-range queries
  const [startTime, setStartTime] = useState<string>('');
  const [endTime, setEndTime] = useState<string>('');

  const [userTimeZone] = useState(
    Intl.DateTimeFormat().resolvedOptions().timeZone
  );

  useEffect(() => {
    const fetchSources = async () => {
      try {
        const sqlForDistinct = encodeURIComponent("SELECT DISTINCT radio_stream FROM transcriptions");
        const response = await axios.get(`${API_BASE_URL}/query?query=${sqlForDistinct}`);
        const data = response.data;
        const distinctSources = data.map((row: any) => row.radio_stream);
        setSources(distinctSources);
        if (distinctSources.length > 0) {
          setSelectedSource(distinctSources[0]);
        }
      } catch (err: any) {
        console.error("Error fetching sources:", err);
        setError("Error fetching sources: " + err.message);
      }
    };
    fetchSources();
  }, []);

  const fetchTranscriptions = async () => {
    setLoading(true);
    setError('');
    try {
      const params: any = { radio_stream: selectedSource };
      const utcStart = localToUTCString(startTime);
      const utcEnd = localToUTCString(endTime);
      if (startTime) params.start_time = utcStart;
      if (endTime) params.end_time = utcEnd;
      const response = await axios.get(`${API_BASE_URL}/range_transcriptions`, { params });
      setTranscriptions(response.data);
    } catch (err: any) {
      console.error("Error fetching data:", err);
      setError("Error fetching data: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedSource) {
      fetchTranscriptions();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSource]);

  const sentiment = getSentiment(selectedSource);

  return (
    <div className="container mx-auto p-4">
      {/* Centered, bold heading */}
      <h2 className="text-2xl font-bold text-center mb-6">
        Radio Transcriptions
      </h2>

      {/* Source Dropdown */}
      <div className="mb-4">
        <label className="block mb-2 font-semibold">
          Select Radio Source:
        </label>
        <select
          className="w-full p-2 border rounded"
          value={selectedSource}
          onChange={(e) => setSelectedSource(e.target.value)}
        >
          {sources.map((src) => (
            <option key={src} value={src}>
              {src}
            </option>
          ))}
        </select>
      </div>

      {/* Time Range Inputs */}
      <div className="mb-4">
        <label className="block mb-2">
          Detected Time Zone: <span className="font-semibold">{userTimeZone}</span>
        </label>
        <div className="flex flex-wrap gap-4">
          <div>
            <label className="block mb-1">Start Time:</label>
            <input
              type="datetime-local"
              className="p-2 border rounded"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
            />
          </div>
          <div>
            <label className="block mb-1">End Time:</label>
            <input
              type="datetime-local"
              className="p-2 border rounded"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
            />
          </div>
          <div className="flex items-end">
            <button
              className="bg-blue-500 hover:bg-blue-600 text-white font-semibold px-4 py-2 rounded shadow"
              onClick={fetchTranscriptions}
            >
              Filter
            </button>
          </div>
        </div>
      </div>

      {/* Loading and Error Messages */}
      {loading && <p>Loading transcriptions...</p>}
      {error && <p className="text-red-500">{error}</p>}

      {/* Layout: 3-column grid (left 2/3, right 1/3) */}
      <div className="grid grid-cols-3 gap-4">
        {/* Left: Scrollable transcriptions box */}
        <div className="col-span-2">
          <div className="p-4 bg-gray-100 rounded shadow h-96 overflow-y-auto">
            <h4 className="text-xl font-bold mb-4">
              Transcriptions for {selectedSource}
            </h4>
            {!loading &&
              transcriptions.map((item) => (
                <div
                  key={item.id}
                  className="mb-3 p-3 bg-white rounded border"
                >
                  <p>
                    <span className="font-semibold">Time:</span>{" "}
                    {utcToLocalString(item.start_time + 'Z', userTimeZone)}
                  </p>
                  <p>
                    <span className="font-semibold">Text:</span> {item.text}
                  </p>
                </div>
              ))}
          </div>
        </div>

        {/* Right: Status/Sentiment block at the top */}
        <div className="col-span-1">
          <div className="p-4 bg-yellow-100 rounded shadow">
            <h4 className="text-xl font-bold mb-2">Sentiment</h4>
            {sentiment === "stressed" && (
              <p className="text-red-600 font-bold">Stressed</p>
            )}
            {sentiment === "fleeing" && (
              <p className="text-orange-600 font-bold">Fleeing</p>
            )}
            {sentiment === "needs rescue" && (
              <p className="text-blue-600 font-bold">Needs Rescue</p>
            )}
            {sentiment === "advancing" && (
              <p className="text-green-600 font-bold">Advancing</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Radio;
