import React, { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

const API_BASE_URL = process.env.REACT_APP_API_URL || '/api';

const DOT_COLORS = [
  '#3B82F6', // blue
  '#10B981', // green
  '#F59E0B', // yellow
  '#EF4444', // red
  '#8B5CF6', // purple
  '#EC4899', // pink
];

// Custom style for the map container a
const mapStyle = {
  height: '100%',
  width: '100%',
};

// Circle marker style
const circleMarkerStyle = {
  color: '#3B82F6',
  fillColor: '#3B82F6',
  fillOpacity: 0.7,
  weight: 2,
  radius: 8,
};

interface Session {
  id: string;
  position: [number, number];
  lastUpdate: number;
  joinedAt: string;
  colorIndex?: number;
  isDummy: boolean;  // Make this required
  ip?: string;
}

// This component handles map position updates
const MapUpdater: React.FC<{ center: [number, number] }> = ({ center }) => {
  const map = useMap();
  
  useEffect(() => {
    map.setView(center, map.getZoom());
  }, [center, map]);

  return null;
};

export const Map: React.FC = () => {
    const [position, setPosition] = useState<[number, number]>([40.7128, -74.0060]);
    const [locationError, setLocationError] = useState<string>('');
    const [isTracking, setIsTracking] = useState(true);
    const [sessions, setSessions] = useState<Session[]>([]);
    const mapRef = useRef<L.Map | null>(null);
    const watchIdRef = useRef<number | null>(null);
    const sessionId = useRef<string>(crypto.randomUUID());
    const [dummyCount, setDummyCount] = useState<number>(0);
    const [submittedDummyCount, setSubmittedDummyCount] = useState<number>(0);

    const getSessionColor = (sessionId: string): string => {
      const colorIndex = parseInt(sessionId, 16) % DOT_COLORS.length;
      return DOT_COLORS[colorIndex];
    };

    const handleDummyCountSubmit = () => {
      setSubmittedDummyCount(dummyCount);
      // Force an immediate fetch of sessions with new dummy count
      fetchSessions();
    };
    
    // Function to update server with position
    const updateServerPosition = async (pos: [number, number]) => {
      try {
        const response = await fetch(`${API_BASE_URL}/location`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            sessionId: sessionId.current,
            position: pos,
            timestamp: Date.now(),
            joinedAt: new Date().toISOString(), // Add join time
          }),
        });
        if (!response.ok) throw new Error('Failed to update location');
      } catch (error) {
        console.error('Error updating location:', error);
      }
    };
    
    // Function to fetch all sessions
    const fetchSessions = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/sessions?dummy_count=${submittedDummyCount}`);
        if (!response.ok) throw new Error('Failed to fetch sessions');
        const data = await response.json();
        setSessions(data);
      } catch (error) {
        console.error('Error fetching sessions:', error);
      }
    };
    
    useEffect(() => {
      // Fetch sessions periodically
      const sessionInterval = setInterval(fetchSessions, 2000);

      if ('geolocation' in navigator) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const newPosition: [number, number] = [pos.coords.latitude, pos.coords.longitude];
            setPosition(newPosition);
            updateServerPosition(newPosition);
            console.log('Initial location acquired:', pos.coords);
          },
          (error) => {
            setLocationError(error.message);
            console.error('Location error:', error);
          }
        );
    
        const intervalId = setInterval(() => {
          if (isTracking) {
            navigator.geolocation.getCurrentPosition(
              (pos) => {
                const newPosition: [number, number] = [pos.coords.latitude, pos.coords.longitude];
                setPosition(newPosition);
                updateServerPosition(newPosition);
                console.log('Location updated:', pos.coords);
              },
              (error) => {
                setLocationError(error.message);
                console.error('Location update error:', error);
              }
            );
          }
        }, 5000);
    
        return () => {
          clearInterval(intervalId);
          clearInterval(sessionInterval);
          const watchId = watchIdRef.current;
          if (watchId) {
            navigator.geolocation.clearWatch(watchId);
          }
        };
      }
  }, [isTracking]);
      
    const handleCenterMap = () => {
      if (mapRef.current) {
        mapRef.current.setView(position, 15);
      }
    };
  
    const toggleTracking = () => {
      setIsTracking(!isTracking);
    };
  
    return (
      <div className="h-screen flex flex-col">
        <div className="p-4 bg-gray-100">
          <h1 className="text-2xl mb-4">Protest Map</h1>
          
          {/* Location Status and Controls */}
          <div className="mb-4">
            <h2 className="text-xl mb-2">Location Status</h2>
            <div className="flex items-center gap-4">
              {locationError ? (
                <p className="text-red-500 font-medium">{locationError}</p>
              ) : (
                <p className="text-green-500 font-medium">
                  Location: {position[0].toFixed(4)}, {position[1].toFixed(4)}
                </p>
              )}
              <button
                onClick={handleCenterMap}
                className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg
                         transition-colors duration-200 ease-in-out transform hover:scale-105 
                         active:scale-95 shadow-lg focus:outline-none focus:ring-2 
                         focus:ring-blue-500 focus:ring-opacity-50"
              >
                Center Map
              </button>
              <button
                onClick={toggleTracking}
                className={`${
                  isTracking ? 'bg-red-500 hover:bg-red-600' : 'bg-green-500 hover:bg-green-600'
                } text-white px-4 py-2 rounded-lg transition-colors duration-200 ease-in-out 
                transform hover:scale-105 active:scale-95 shadow-lg focus:outline-none focus:ring-2 
                focus:ring-opacity-50`}
              >
                {isTracking ? 'Stop Tracking' : 'Start Tracking'}
              </button>
              <div className="flex items-center gap-2">
                <label htmlFor="dummyCount" className="text-sm font-medium">
                  Dummy Users:
                </label>
                <input
                  id="dummyCount"
                  type="number"
                  min="0"
                  max="1000"
                  value={dummyCount}
                  onChange={(e) => setDummyCount(Math.max(0, parseInt(e.target.value) || 0))}
                  className="w-20 px-2 py-1 border rounded-lg"
                />
                <button
                  onClick={handleDummyCountSubmit}
                  className="bg-purple-500 hover:bg-purple-600 text-white px-4 py-2 rounded-lg
                            transition-colors duration-200 ease-in-out transform hover:scale-105 
                            active:scale-95 shadow-lg focus:outline-none focus:ring-2 
                            focus:ring-purple-500 focus:ring-opacity-50"
                >
                  Add Dummies
                </button>
              </div>
            </div>
          </div>
        </div>
  
        {/* Map Section */}
        <div className="flex-1 p-4">
                <div className="h-[600px] w-[600px] mx-auto rounded-lg overflow-hidden shadow-lg">
                    <MapContainer 
                        center={position} 
                        zoom={15}
                        style={mapStyle}
                        ref={mapRef}
                        zoomControl={true}
                        attributionControl={false}
                        dragging={true}
                        scrollWheelZoom={true}
                        doubleClickZoom={true}
                        touchZoom={true}
                        tap={true}
                    >
                        <MapUpdater center={position} />
                        <TileLayer
                            // Original URL (requires authentication):
                            url="https://tiles.stadiamaps.com/tiles/stamen_terrain/{z}/{x}/{y}@2x.png"
                            // url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                            className="map-tiles"
                            maxZoom={22}
                            minZoom={3}
                        />
                        {sessions.map((session) => (
                          <CircleMarker 
                          key={session.id}
                          center={session.position}
                          {...circleMarkerStyle}
                          color={session.isDummy ? '#999999' : getSessionColor(session.id)}
                          radius={session.id === sessionId.current ? 10 : 8}
                          opacity={session.isDummy ? 0.5 : 1}
                        >
                            <Popup>
                              <div className="p-2">
                                <h3 className="font-bold mb-2">
                                  {session.isDummy ? 'Simulated User' : 
                                  session.id === sessionId.current ? 'You' : 'Other Protester'}
                                </h3>
                                <ul className="text-sm">
                                  <li><strong>Session ID:</strong> {session.id.slice(0, 8)}...</li>
                                  <li><strong>Joined:</strong> {new Date(session.joinedAt).toLocaleTimeString()}</li>
                                  <li><strong>Last Update:</strong> {new Date(session.lastUpdate).toLocaleTimeString()}</li>
                                  <li><strong>Location:</strong> {session.position[0].toFixed(4)}, {session.position[1].toFixed(4)}</li>
                                  {session.isDummy && <li className="text-gray-500">(Simulated User)</li>}
                                </ul>
                              </div>
                            </Popup>
                          </CircleMarker>
                        ))}
                    </MapContainer>
                </div>
            </div>
        </div>
    );
  };