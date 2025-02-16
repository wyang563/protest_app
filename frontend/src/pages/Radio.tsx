import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { utcToLocalString, localToUTCString } from '../utils';

// If using Bootstrap, remember to import it somewhere, e.g.:
// import 'bootstrap/dist/css/bootstrap.min.css';

interface Transcription {
  id: number;
  radio_stream: string;
  start_time: string;
  text: string;
}

// Mock function to determine sentiment (or fetch from backend):
function getSentiment(radioStream: string): string {
  // For demonstration, do a naive mapping
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

  const [userTimeZone, setUserTimeZone] = useState(
    Intl.DateTimeFormat().resolvedOptions().timeZone
  );

  // 1) Fetch distinct radio streams on mount
  useEffect(() => {
    const fetchSources = async () => {
      try {
        // If you created a separate endpoint:
        // const response = await axios.get(`${API_BASE_URL}/radio_sources`);
        
        // OR using the /api/query param (Option A from above):
        const sqlForDistinct = encodeURIComponent("SELECT DISTINCT radio_stream FROM transcriptions");
        const response = await axios.get(`${API_BASE_URL}/query?query=${sqlForDistinct}`);
        
        const data = response.data;
        // data might be an array of objects => convert to just an array of strings
        // e.g. [ { "radio_stream": "Source A" }, { "radio_stream": "Source B"} ]
        const distinctSources = data.map((row: any) => row.radio_stream);

        setSources(distinctSources);
        // Default to the first source, if any
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

  // 2) Whenever selectedSource changes OR user changes time range, we can fetch new transcriptions.
  //    We'll do it on demand if you prefer (e.g. a "Search" button), or automatically in an effect.
  const fetchTranscriptions = async () => {
    setLoading(true);
    setError('');

    try {
      // We'll use the new /api/transcriptions endpoint
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

  // Optionally, automatically fetch on initial source selection
  useEffect(() => {
    if (selectedSource) {
      fetchTranscriptions();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSource]);

  // 3) Determine sentiment for the selected source
  const sentiment = getSentiment(selectedSource);

  return (
    <div className="container mt-4">
      <h2 className="mb-4">Radio Transcriptions</h2>
      
      {/*  A) Source Dropdown */}
      <div className="form-group row mb-3">
        <label className="col-sm-2 col-form-label">Select Radio Source:</label>
        <div className="col-sm-6">
          <select
            className="form-control"
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
      </div>

      {/*  B) Time Range Inputs */}
      <div style={{ marginTop: '1rem' }}>
        <label>Detected Time Zone: {userTimeZone}</label>
      </div>
      <div className="row mb-4">
        <div className="col-md-3">
          <label>Start Time:</label>
          <input
            type="datetime-local"
            className="form-control"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
          />
        </div>
        <div className="col-md-3">
          <label>End Time:</label>
          <input
            type="datetime-local"
            className="form-control"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
          />
        </div>
        <div className="col-md-3 d-flex align-items-end">
          <button className="btn btn-primary" onClick={fetchTranscriptions}>
            Filter
          </button>
        </div>
      </div>

      {/* Error or loading messages */}
      {loading && <p>Loading transcriptions...</p>}
      {error && <p style={{ color: 'red' }}>{error}</p>}

      {/* 2-column layout: left for broadcasts, right for sentiment */}
      <div className="row">
        <div className="col-md-7">
          {/* Latest or filtered transcriptions box */}
          <div className="p-3 mb-4" style={{ backgroundColor: '#f8f9fa', borderRadius: '8px' }}>
            <h4>Transcriptions for {selectedSource}</h4>
            {!loading && transcriptions && transcriptions.map((item) => (
              <div
                key={item.id}
                className="mb-2 p-2"
                style={{
                  backgroundColor: '#fff',
                  borderRadius: '5px',
                  border: '1px solid #ddd'
                }}
              >
                <strong>Time:</strong> {utcToLocalString(item.start_time + 'Z', userTimeZone)} <br />
                <strong>Text:</strong> {item.text}
              </div>
            ))}
          </div>
        </div>

        <div className="col-md-5">
          {/* Sentiment box */}
          <div
            className="p-3 mb-4"
            style={{
              backgroundColor: '#ffe59e',
              borderRadius: '8px',
              minHeight: '150px'
            }}
          >
            <h4>Sentiment</h4>
            {sentiment === "stressed" && (
              <p style={{ color: 'red', fontWeight: 'bold' }}>Stressed</p>
            )}
            {sentiment === "fleeing" && (
              <p style={{ color: 'orange', fontWeight: 'bold' }}>Fleeing</p>
            )}
            {sentiment === "needs rescue" && (
              <p style={{ color: 'blue', fontWeight: 'bold' }}>Needs Rescue</p>
            )}
            {sentiment === "advancing" && (
              <p style={{ color: 'green', fontWeight: 'bold' }}>Advancing</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Radio;
