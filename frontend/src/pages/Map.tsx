import { forwardRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import React, { useState, useEffect, useRef } from 'react';
import { HeatmapLayer } from 'react-leaflet-heatmap-layer-v3';
import { MapContainer, TileLayer, CircleMarker, Popup, useMap, Marker } from 'react-leaflet';
import { Icon, PointTuple } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { useNavigate } from 'react-router-dom';

const API_URL = process.env.NODE_ENV === 'production'
  ? 'https://protest.morelos.dev'
  : 'http://localhost:5001';

type HeatmapPoint = [number, number, number];

const DEFAULT_ZOOM = 13; // Add this constant at the top with other constan

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

interface SimulationConfig {
  isRunning: boolean;
  alertProbabilities: {
    none: number;     // 50%
    water: number;    // 28%
    medical: number;  // 10%
    arrest: number;   // 8%
    stayaway: number; // 4%
  };
}

interface AlertType {
  type: 'water' | 'medical' | 'arrest' | 'stayaway';
  expiresAt: number;
}

interface AlertMarker {
  id: string;
  position: [number, number];
  type: AlertType['type'];
  createdAt: number;
  creatorId: string;
}

// First update the Session interface to allow null
interface Session {
  id: string;
  position: [number, number];
  lastUpdate: number;
  joinedAt: string;
  colorIndex?: number;
  isDummy: boolean;
  creatorId?: string;
  ip?: string;
  alert?: AlertType | null;  // Update this line to allow null
}

const ALERT_CONFIGS: {
  [key: string]: {
    icon: string;
    size: PointTuple;  // Use PointTuple instead of readonly tuple
    tooltip: string;
  }
} = {
  water: {
    icon: '/icons/water.svg',
    size: [24, 24] as PointTuple,  // Cast to PointTuple
    tooltip: 'Needs Water'
  },
  medical: {
    icon: '/icons/medical.svg',
    size: [24, 24] as PointTuple,
    tooltip: 'Needs Medical Help'
  },
  arrest: {
    icon: '/icons/warning.svg',
    size: [24, 24] as PointTuple,
    tooltip: 'Potential Arrest'
  },
  stayaway: {
    icon: '/icons/stop.svg',
    size: [24, 24] as PointTuple,
    tooltip: 'Stay Away'
  }
};

// This component handles map position updates
const MapUpdater: React.FC<{ center: [number, number] }> = ({ center }) => {
  const map = useMap();
  
  useEffect(() => {
    map.setView(center, map.getZoom());
  }, [center, map]);

  return null;
};

export const Map: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const alertTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const sessionId = useRef<string>(crypto.randomUUID());

  const [position, setPosition] = useState<[number, number]>([40.7128, -74.0060]);
  const [locationError, setLocationError] = useState<string>('');
  const [isTracking, setIsTracking] = useState(true);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [dummyCount, setDummyCount] = useState<string>(''); // Change from number to string
  const [submittedDummyCount, setSubmittedDummyCount] = useState<number>(0);
  const [heatmapData, setHeatmapData] = useState<[number, number, number][]>([]);
  const [activeAlert, setActiveAlert] = useState<AlertType | null>(null);
  const [alertMarkers, setAlertMarkers] = useState<AlertMarker[]>([]);
  const [activeConnections, setActiveConnections] = useState<number>(0);
  const [simulationConfig, setSimulationConfig] = useState<SimulationConfig>({
    isRunning: false,
    alertProbabilities: {
      none: 0.45,
      water: 0.40,
      medical: 0.04,
      arrest: 0.1,
      stayaway: 0.01
    }
  });
  const [usedAlertPositions, setUsedAlertPositions] = useState<Set<string>>(new Set());

  useEffect(() => {
    const cleanup = setInterval(() => {
      const now = Date.now();
      setAlertMarkers(prev => 
        prev.filter(marker => now - marker.createdAt < 30000) // 30 seconds
      );
    }, 1000);
  
    return () => clearInterval(cleanup);
  }, []);  

  useEffect(() => {
    // Periodically fetch alerts
    const interval = setInterval(() => {
      fetchAlertMarkers();
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    // Convert sessions to heatmap points
    const points: [number, number, number][] = sessions.map(session => [
      session.position[0],
      session.position[1],
      session.isDummy ? 0.7 : 0.7 // Lower intensity for dummy sessions
    ]);
    setHeatmapData(points);
  }, [sessions]);
  
  useEffect(() => {
    return () => {
      // Notify server about disconnection
      fetch(`${API_URL}/api/location`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: sessionId.current,
          position: position,
          timestamp: 0,
          joinedAt: new Date().toISOString(),
          alert: null
        }),
      }).catch(console.error);
    };
  }, [position]);

  // Core simulation function
  const runAlertSimulation = () => {
    const dummySessions = sessions.filter(s => s.isDummy);
    if (dummySessions.length === 0) return;
  
    setSimulationConfig(prev => ({ ...prev, isRunning: true }));
  
    const simulationInterval = setInterval(() => {
      dummySessions.forEach(dummy => {
        // 20% chance for each dummy
        if (Math.random() < 0.2) {
          const alertType = rollForAlert(simulationConfig.alertProbabilities);
          if (!alertType) return;
  
          const newAlert: AlertMarker = {
            id: `alert-${dummy.id}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            position: dummy.position,
            type: alertType,
            createdAt: Date.now(),
            creatorId: dummy.id
          };
  
          fetch(`${API_URL}/api/alert`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              markerId: newAlert.id,
              position: newAlert.position,
              type: newAlert.type,
              creatorId: newAlert.creatorId,
              createdAt: newAlert.createdAt
            })
          })
          .then(() => {
            // Reduced delay - remove after 2 seconds and create new one after 0.5 second
            setTimeout(() => {
              fetch(`${API_URL}/api/alert/${newAlert.id}`, { method: 'DELETE' })
                .then(() => {
                  // Much shorter delay before potentially creating new alert
                  setTimeout(() => {
                    if (simulationConfig.isRunning) {
                      // Trigger new alert check immediately
                      const nextAlertType = rollForAlert(simulationConfig.alertProbabilities);
                      if (nextAlertType) {
                        handleAlertRequest(nextAlertType);
                      }
                    }
                  }, 500); // Only 0.5 second gap
                })
                .catch(console.error);
            }, 2000);
          })
          .catch(console.error);
        }
      });
    }, 2000); // Reduced from 5000 to 2000ms for more frequent checks
  
    setTimeout(() => {
      clearInterval(simulationInterval);
      setSimulationConfig(prev => ({ ...prev, isRunning: false }));
    }, 60000);
  };

  // Probability-based alert roll
  const rollForAlert = (probabilities: SimulationConfig['alertProbabilities']): AlertType['type'] | null => {
    const rollVal = Math.random();
    if (rollVal < probabilities.none) {
      return null;
    } else if (rollVal < probabilities.none + probabilities.water) {
      return 'water';
    } else if (rollVal < probabilities.none + probabilities.water + probabilities.medical) {
      return 'medical';
    } else if (rollVal < probabilities.none + probabilities.water + probabilities.medical + probabilities.arrest) {
      return 'arrest';
    } else {
      return 'stayaway';
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/login');
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  const logMarkerChange = (session: Session, action: string) => {
    const isCurrentUser = session.id === sessionId.current;
    if (isCurrentUser) {
      console.log(`[Marker Change] ${action}:`, {
        time: new Date().toISOString(),
        sessionId: session.id.slice(0, 8),
        type: session.alert ? `Alert: ${session.alert.type}` : 'Circle',
        position: session.position
      });
    }
  };

  // Utility to log session states
  const logSessionState = (msg: string, session?: Session) => {
    if (session?.id === sessionId.current) {
      console.log(`[Session Alert State] ${msg}`, {
        id: session.id,
        isCurrentUser: session.id === sessionId.current,
        hasAlert: !!session.alert,
        alertType: session.alert?.type,
        time: new Date().toISOString()
      });
    }
  };

  const heatmapOptions = {
    radius: 30,           // Reduced radius for more defined hotspots
    blur: 20,            // Increased blur for smoother transitions
    maxZoom: 20,
    minOpacity: 0.3,
    maxOpacity: 0.8,     // Reduced max opacity for better color visibility
  };

  const fetchAlertMarkers = async () => {
    try {
      const response = await fetch(`${API_URL}/api/alerts`);
      if (!response.ok) throw new Error('Failed to fetch alerts');
      const data = await response.json();
      setAlertMarkers(() => [...data]);
    } catch (error) {
      console.error('Error fetching alerts:', error);
    }
  };

  const handleAlertRequest = (type: AlertType['type']) => {
    const newAlertMarker: AlertMarker = {
      id: crypto.randomUUID(),
      position: position,
      type: type,
      createdAt: Date.now(),
      creatorId: sessionId.current
    };
    
    fetch(`${API_URL}/api/alert`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        markerId: newAlertMarker.id,
        position: newAlertMarker.position,
        type: newAlertMarker.type,
        creatorId: newAlertMarker.creatorId,
        createdAt: newAlertMarker.createdAt
      })
    }).then(() => fetchAlertMarkers());
  };

    
  const handleRemoveAlertMarker = (markerId: string) => {
    fetch(`${API_URL}/api/alert/${markerId}`, {
      method: 'DELETE'
    }).then(() => fetchAlertMarkers());
  };

  // Add handleClearAlert function
  const handleClearAlert = () => {
    setActiveAlert(null);
    updateServerPosition(position, null);
  };

  const getSessionColor = (sId: string): string => {
    const colorIndex = parseInt(sId, 16) % DOT_COLORS.length;
    return DOT_COLORS[colorIndex];
  };

  const handleDummyCountSubmit = () => {
    const numDummies = parseInt(dummyCount) || 0;
    setSubmittedDummyCount(numDummies);
    fetchSessions(numDummies);
  };
  
  // Function to update server with position
  const updateServerPosition = async (pos: [number, number], alert: AlertType | null = null) => {
    try {
      await fetch(`${API_URL}/api/location`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: sessionId.current,
          position: pos,
          timestamp: Date.now(),
          joinedAt: new Date().toISOString(),
          alert: alert
        }),
      });
    } catch (error) {
      console.error('Failed updating server position:', error);
    }
  };
  
  // Function to fetch all sessions
  const fetchSessions = async (dummyCountParam?: number) => {
    try {
      const response = await fetch(`${API_URL}/api/sessions?dummy_count=${dummyCountParam || 0}`);
      if (!response.ok) throw new Error('Failed to fetch sessions');
      const data: Session[] = await response.json();
      const mapped = data.map(session => {
        if (!session.isDummy) return session;
        session.id = `dummy-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        return session;
      });
      setSessions(mapped);
    } catch (error) {
      console.error('Failed to fetch sessions:', error);
    }
  };

  useEffect(() => {
    let mounted = true;
    const sessionInterval = setInterval(() => {
      if (!mounted) return;
      fetchSessions(submittedDummyCount);
    }, 2000);

    if ('geolocation' in navigator) {
      if (isTracking) {
        watchIdRef.current = navigator.geolocation.watchPosition(
          (pos) => {
            const { latitude, longitude } = pos.coords;
            setPosition([latitude, longitude]);
            updateServerPosition([latitude, longitude]);
          },
          (err) => {
            console.error(err);
            setLocationError('Unable to retrieve location.');
          },
          { enableHighAccuracy: true }
        );
      } else if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    }

    return () => {
      mounted = false;
      clearInterval(sessionInterval);
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, [isTracking, submittedDummyCount]);

  const handleCenterMap = () => {
    if (mapRef.current) {
      mapRef.current.setView(position, DEFAULT_ZOOM);
    }
  };

  const toggleTracking = () => {
    setIsTracking(!isTracking);
  };
  
  return (
    <div className="min-h-screen bg-gray-900 text-gray-100">
      {/* Main Container - Flex column on mobile, row on desktop */}
      <div className="flex flex-col lg:flex-row h-screen">
        {/* Controls Section - Full width on mobile, sidebar on desktop */}
        <div className="w-full lg:w-96 bg-gray-800 p-4 lg:p-6 flex flex-col gap-4 lg:gap-6 order-1 lg:order-2">
          {/* User Info & Logout - Now as a normal block */}
          <div className="bg-gray-700 p-4 rounded-lg">
            {user && (
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <span className="text-sm">
                  <span className="text-gray-400">Logged in as:</span>{" "}
                  <span className="font-semibold">{user.username}</span>
                </span>
                <button
                  onClick={handleLogout}
                  className="bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded-md text-sm transition-colors w-full sm:w-auto"
                >
                  Logout
                </button>
              </div>
            )}
          </div>
  
          {/* Connection Counter */}
          <div className="bg-gray-700 p-4 rounded-lg">
            <h3 className="text-lg font-semibold mb-2">Network Status</h3>
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-green-500"></div>
              <span className="text-sm">
                Active Connections: <span className="font-bold">{activeConnections}</span>
              </span>
            </div>
          </div>
  
          {/* Map & Location Controls */}
          <div className="bg-gray-700 p-4 rounded-lg">
            <h3 className="text-lg font-semibold mb-3">Map & Location Controls</h3>
            {locationError ? (
              <p className="text-red-400 text-sm mb-3">{locationError}</p>
            ) : (
              <p className="text-green-400 text-sm mb-3">
                Location: {position[0].toFixed(4)}, {position[1].toFixed(4)}
              </p>
            )}
            <div className="flex flex-col sm:flex-row gap-2">
              <button
                onClick={handleCenterMap}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg
                  transition-colors duration-200 flex items-center justify-center gap-2"
              >
                <span>Center Map</span>
              </button>
              <button
                onClick={toggleTracking}
                className={`flex-1 ${
                  isTracking ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'
                } text-white px-4 py-2 rounded-lg transition-colors duration-200 flex items-center justify-center gap-2`}
              >
                {isTracking ? 'Stop Tracking' : 'Start Tracking'}
              </button>
            </div>
          </div>
  
          {/* Protester Controls */}
          <div className="bg-gray-700 p-4 rounded-lg">
            <h3 className="text-lg font-semibold mb-3">Protester Controls</h3>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(ALERT_CONFIGS).map(([type, config]) => (
                <button
                  key={type}
                  onClick={() => handleAlertRequest(type as AlertType['type'])}
                  className={`${
                    activeAlert?.type === type ? 'ring-2 ring-white' : ''
                  } ${
                    type === 'water' ? 'bg-blue-600 hover:bg-blue-700' :
                    type === 'medical' ? 'bg-red-600 hover:bg-red-700' :
                    type === 'arrest' ? 'bg-yellow-600 hover:bg-yellow-700' :
                    'bg-red-800 hover:bg-red-900'
                  } text-white p-3 rounded-lg flex items-center justify-center gap-2 transition-colors`}
                  title={config.tooltip}
                >
                  <img src={config.icon} alt={type} className="w-5 h-5" />
                  <span className="text-sm">{type.charAt(0).toUpperCase() + type.slice(1)}</span>
                </button>
              ))}
            </div>
            {activeAlert && (
              <button
                onClick={handleClearAlert}
                className="w-full mt-2 bg-gray-600 hover:bg-gray-500 text-white p-2 rounded-lg
                  flex items-center justify-center gap-2 transition-colors"
                title="Clear Alert"
              >
                Clear Alert
              </button>
            )}
          </div>
  
          {/* Simulation Controls */}
          <div className="bg-gray-700 p-4 rounded-lg">
            <h3 className="text-lg font-semibold mb-3">Simulation Development</h3>
            <div className="grid grid-cols-2 gap-3">
              {/* Dummy Controls */}
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <label htmlFor="dummyCount" className="text-xs text-gray-300 whitespace-nowrap">
                    Dummy Users:
                  </label>
                  <input
                    id="dummyCount"
                    type="number"
                    min="0"
                    max="1000"
                    value={dummyCount}
                    onChange={(e) => setDummyCount(e.target.value)}
                    className="w-16 px-2 py-1 rounded bg-gray-600 border border-gray-500 text-white text-xs"
                  />
                </div>
                <button
                  onClick={handleDummyCountSubmit}
                  className="bg-purple-600 hover:bg-purple-700 text-white px-3 py-1.5 rounded-lg
                    transition-colors duration-200 flex items-center justify-center text-xs"
                >
                  Add Dummies
                </button>
              </div>

              {/* Alert Simulation Controls */}
              <div className="flex flex-col gap-2">
                <button
                  onClick={runAlertSimulation}
                  disabled={simulationConfig.isRunning || sessions.filter(s => s.isDummy).length === 0}
                  className={`w-full ${
                    simulationConfig.isRunning 
                      ? 'bg-gray-500 cursor-not-allowed' 
                      : 'bg-green-600 hover:bg-green-700'
                  } text-white px-3 py-1.5 rounded-lg transition-colors duration-200 text-xs`}
                >
                  {simulationConfig.isRunning ? 'Running...' : 'Start Simulation'}
                </button>
                </div>
              </div>
            </div>
          </div>

        {/* Map Section - Scrollable on mobile, fixed on desktop */}
        <div className="flex-1 p-4 order-2 lg:order-1 min-h-[60vh] lg:h-full">
          <div className="h-full rounded-lg overflow-hidden shadow-2xl relative map-container">
            <MapContainer 
              center={position} 
              zoom={DEFAULT_ZOOM}
              style={mapStyle}
              ref={mapRef}
              zoomControl={true}
              attributionControl={false}
              dragging={true}
              scrollWheelZoom={true}
              doubleClickZoom={true}
              touchZoom={true}
              tap={true}
              className="z-0"
            >
              <TileLayer
                url="https://tiles.stadiamaps.com/tiles/stamen_terrain/{z}/{x}/{y}@2x.png"
                className="map-tiles"
                maxZoom={22}
                minZoom={3}
              />
              <HeatmapLayer
                fitBoundsOnLoad
                fitBoundsOnUpdate
                points={heatmapData}
                longitudeExtractor={(point: [number, number, number]) => point?.[1] ?? 0}
                latitudeExtractor={(point: [number, number, number]) => point?.[0] ?? 0}
                intensityExtractor={(point: [number, number, number]) => point?.[2] ?? 0}
                {...heatmapOptions}
              />
              <MapUpdater center={position} />
              {sessions && sessions.map((session) => {
                const isCurrentUser = session.id === sessionId.current;
                const effectiveAlert = isCurrentUser ? activeAlert : session.alert;
                const shouldShowAlert = effectiveAlert?.type && ALERT_CONFIGS[effectiveAlert.type];

                if (shouldShowAlert) {
                  const alertConfig = ALERT_CONFIGS[effectiveAlert.type];
                  return (
                    <Marker 
                      key={session.id}
                      position={session.position}
                      icon={L.divIcon({
                        html: `<img src="${alertConfig.icon}" class="w-6 h-6" />`,
                        className: '',
                        iconSize: alertConfig.size as PointTuple,
                      })}
                    >
                        <Popup>
                          <div className="p-2">
                            <h3 className="font-bold mb-2">
                              {session.isDummy ? 'Simulated User' : 
                              isCurrentUser ? 'You' : 'Other Protester'}
                            </h3>
                            <ul className="text-sm">
                              <li><strong>Session ID:</strong> {session.id.slice(0, 8)}...</li>
                              <li><strong>Joined:</strong> {new Date(session.joinedAt).toLocaleTimeString()}</li>
                              <li><strong>Last Update:</strong> {new Date(session.lastUpdate).toLocaleTimeString()}</li>
                              <li><strong>Location:</strong> {session.position[0].toFixed(4)}, {session.position[1].toFixed(4)}</li>
                              {session.isDummy && <li className="text-gray-500">(Simulated User)</li>}
                              <li className="text-red-500">
                                <strong>{alertConfig.tooltip}</strong>
                              </li>
                            </ul>
                          </div>
                        </Popup>
                      </Marker>
                    );
                  }
                  // If no valid alert, render circle marker
                  logMarkerChange(session, 'Rendering Circle Marker');
                  return (
                    <CircleMarker 
                      key={session.id}
                      center={session.position}
                      {...circleMarkerStyle}
                      color={getSessionColor(session.id)}
                      radius={isCurrentUser ? 10 : 8}
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
                  );
                })}
              {alertMarkers.map(marker => (
                <Marker
                  key={marker.id}
                  position={marker.position}
                  icon={L.divIcon({
                    html: `<img src="${ALERT_CONFIGS[marker.type].icon}" class="w-6 h-6" />`,
                    className: '',
                    iconSize: ALERT_CONFIGS[marker.type].size as PointTuple,
                  })}
                >
                  <Popup>
                    <div className="p-2">
                      <h3 className="font-bold mb-2">{ALERT_CONFIGS[marker.type].tooltip}</h3>
                      <p className="text-sm mb-2">
                        Expires in: {Math.max(0, Math.floor((30000 - (Date.now() - marker.createdAt)) / 1000))}s
                      </p>
                      {marker.creatorId === sessionId.current && (
                        <button
                          onClick={() => handleRemoveAlertMarker(marker.id)}
                          className="bg-red-500 hover:bg-red-600 text-white px-2 py-1 rounded text-sm"
                        >
                          Delete Marker
                        </button>
                      )}
                    </div>
                  </Popup>
                </Marker>
              ))}
            </MapContainer>
          </div>
        </div>
      </div>
    </div>
  );
};
