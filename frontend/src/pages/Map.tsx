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

const DEFAULT_ZOOM = 13; // Add this constant at the top with other constants

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
    const interval = setInterval(() => {
      fetchAlertMarkers();
    }, 2000);
  
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    return () => {
      // When component unmounts, notify server about disconnection
      fetch(`${API_URL}/api/location`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sessionId: sessionId.current,
          position: position,
          timestamp: 0, // Use 0 to indicate disconnection
          joinedAt: new Date().toISOString(),
          alert: null
        }),
      }).catch(console.error);
    };
  }, []);

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
        position: session.position,
        // Add debug info for alert conditions
        alertConditions: {
          hasAlert: !!session.alert,
          hasAlertType: session.alert?.type,
          configExists: session.alert?.type ? !!ALERT_CONFIGS[session.alert.type] : false,
          fullCondition: !!(session.alert && session.alert.type && ALERT_CONFIGS[session.alert.type])
        }
      });
    }
  };

  const logSessionState = (msg: string, session?: Session) => {
    if (session?.id === sessionId.current) {
      console.log(`${msg}:`, {
        id: session.id.slice(0, 8),
        alert: session.alert,
        timestamp: new Date().toISOString()
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
      setAlertMarkers(data);
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
      headers: {
        'Content-Type': 'application/json',
      },
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
    console.log('[Clear Alert]', {
      time: new Date().toISOString(),
      previousType: activeAlert?.type,
      sessionId: sessionId.current.slice(0, 8)
    });
    
    setActiveAlert(null);
    updateServerPosition(position, null)
      .then(() => {
        console.log('[Clear Alert] Server updated successfully');
        // Only fetch if we have dummy sessions to update
        if (sessions.some(s => s.isDummy)) {
          fetchSessions();
        }
      });
  };

  const getSessionColor = (sessionId: string): string => {
    const colorIndex = parseInt(sessionId, 16) % DOT_COLORS.length;
    return DOT_COLORS[colorIndex];
  };

  const handleDummyCountSubmit = () => {
    const numDummies = parseInt(dummyCount) || 0; // Convert to number, default to 0 if NaN
    setSubmittedDummyCount(numDummies);
    fetchSessions();
  };
  
  // Function to update server with position
  const updateServerPosition = async (pos: [number, number], alert: AlertType | null = null) => {
    try {
      const response = await fetch(`${API_URL}/api/location`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sessionId: sessionId.current,
          position: pos,
          timestamp: Date.now(),
          joinedAt: new Date().toISOString(),
          alert: alert ?? activeAlert
        }),
      });
      
      if (!response.ok) throw new Error('Failed to update location');
      
      const data = await response.json();
      if (data.activeConnections !== undefined) {
        setActiveConnections(data.activeConnections);
      }
      
    } catch (error) {
      console.error('Error updating location:', error);
    }
  };
  
  // Function to fetch all sessions
  const fetchSessions = async () => {
    try {
      const response = await fetch(`${API_URL}/api/sessions?dummy_count=${submittedDummyCount}&creator_id=${sessionId.current}`, {
        credentials: 'include',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        throw new Error(`Server returned ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (!Array.isArray(data)) {
        console.error('Invalid data format received:', data);
        return;
      }
  
      // Update active connections from real session data
      const realSession = data.find((s: Session) => !s.isDummy);
      if (realSession?.activeConnections !== undefined) {
        setActiveConnections(realSession.activeConnections);
      }
  
      const processedIds = new Set<string>();
      
      const updatedSessions = data.reduce((acc: Session[], newSession: Session) => {
        if (!newSession.id || processedIds.has(newSession.id)) return acc;
        
        processedIds.add(newSession.id);
        
        if (newSession.id === sessionId.current) {
          return [...acc, {
            ...newSession,
            alert: activeAlert
          }];
        }
        
        return [...acc, newSession];
      }, []);
  
      setSessions(updatedSessions);
      
      // Update heatmap data
      const heatData = updatedSessions.map((session: Session): [number, number, number] => [
        session.position[0],
        session.position[1],
        session.isDummy ? 0.3 : 0.8
      ]);
      setHeatmapData(heatData);
      
    } catch (error) {
      console.error('Error fetching sessions:', error);
    }
  };

  useEffect(() => {
    let mounted = true;
    const sessionInterval = setInterval(() => {
      if (mounted) {
        fetchSessions();
      }
    }, 2000);  // Increase interval to 2 seconds
    
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (mounted) {
            const newPosition: [number, number] = [pos.coords.latitude, pos.coords.longitude];
            setPosition(newPosition);
            updateServerPosition(newPosition);
          }
        },
        (error) => {
          if (mounted) {
            setLocationError(error.message);
          }
        }
      );
  
      const locationInterval = setInterval(() => {
        if (isTracking && mounted) {
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              if (mounted) {
                const newPosition: [number, number] = [pos.coords.latitude, pos.coords.longitude];
                setPosition(newPosition);
                updateServerPosition(newPosition);
              }
            },
            (error) => {
              if (mounted) {
                setLocationError(error.message);
              }
            }
          );
        }
      }, 5000);
  
      return () => {
        mounted = false;
        clearInterval(locationInterval);
        clearInterval(sessionInterval);
        if (alertTimeoutRef.current) {
          clearTimeout(alertTimeoutRef.current);
        }
      };
    }
    
    return () => {
      mounted = false;
      clearInterval(sessionInterval);
    };
  }, [isTracking]);
    
  const handleCenterMap = () => {
    if (mapRef.current) {
      mapRef.current.setView(position, DEFAULT_ZOOM, {
        animate: true,
        duration: 1
      });
    }
  };
  
  const toggleTracking = () => {
    setIsTracking(!isTracking);
  };
  
  return (
      <div className="h-screen flex flex-col">
        <div className="p-4 bg-gray-100">
          <div className="flex justify-between items-center mb-4">
            <h1 className="text-2xl">Protest Map</h1>
            <div className="flex items-center gap-4">
              <div className="text-gray-600 bg-white px-4 py-2 rounded-lg shadow">
                <span>Active Connections: <span className="font-bold">{activeConnections}</span></span>
              </div>
              {user && (
                <div className="text-gray-600 bg-white px-4 py-2 rounded-lg shadow flex items-center gap-4">
                  <span>Logged in as: <span className="font-semibold">{user.username}</span></span>
                  <button
                    onClick={handleLogout}
                    className="bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded-md text-sm"
                  >
                    Logout
                  </button>
                </div>
              )}
            </div>
          </div>          
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
                onChange={(e) => setDummyCount(e.target.value)} // Remove parseInt
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

      <div className="flex gap-2">
        {Object.entries(ALERT_CONFIGS).map(([type, config]) => (
          <button
            key={type}
            onClick={() => handleAlertRequest(type as AlertType['type'])}
            className={`${
              activeAlert?.type === type 
                ? 'ring-2 ring-white' 
                : ''
            } ${
              type === 'water' ? 'bg-blue-500 hover:bg-blue-600' :
              type === 'medical' ? 'bg-red-500 hover:bg-red-600' :
              type === 'arrest' ? 'bg-yellow-500 hover:bg-yellow-600' :
              'bg-red-700 hover:bg-red-800'
            } text-white p-2 rounded-lg flex items-center gap-1`}
            title={config.tooltip}
          >
            <img src={config.icon} alt={type} className="w-6 h-6" />
            {type.charAt(0).toUpperCase() + type.slice(1)}
          </button>
        ))}
          {activeAlert && (
            <button
              onClick={handleClearAlert}
              className="bg-gray-500 hover:bg-gray-600 text-white p-2 rounded-lg flex items-center gap-1"
              title="Clear Alert"
            >
              Clear Alert
            </button>
          )}
      </div>
      {/* Map Section */}
      <div className="flex-1 p-4"></div>
        <div className="h-[600px] w-[600px] mx-auto rounded-lg overflow-hidden shadow-lg">
          <MapContainer 
            center={position} 
            zoom={DEFAULT_ZOOM} // Use default zoom instead of 15
            style={mapStyle}
            ref={mapRef} // Fix ref assignment
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
              <HeatmapLayer
                fitBoundsOnLoad
                fitBoundsOnUpdate
                points={heatmapData}
                longitudeExtractor={(point: [number, number, number]) => point?.[1] ?? 0}
                latitudeExtractor={(point: [number, number, number]) => point?.[0] ?? 0}
                intensityExtractor={(point: [number, number, number]) => point?.[2] ?? 0}
                {...heatmapOptions}
              />            
                {sessions.map((session) => {
                  const isCurrentUser = session.id === sessionId.current;
                  
                  // Add debug logging for alert state
                  console.log('[Session Alert State]', {
                    id: session.id.slice(0, 8),
                    isCurrentUser,
                    hasAlert: !!session.alert,
                    alertType: session.alert?.type,
                    time: new Date().toISOString()
                  });

                  // Check for valid alert - either from local state (current user) or from server (other users)
                  const effectiveAlert = isCurrentUser ? activeAlert : session.alert;
                  const shouldShowAlert = effectiveAlert?.type && ALERT_CONFIGS[effectiveAlert.type];

                  if (shouldShowAlert) {
                    logMarkerChange(session, 'Rendering Alert Marker');
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
  );
};
