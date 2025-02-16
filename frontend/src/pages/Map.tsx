import { forwardRef } from 'react';

import React, { useState, useEffect, useRef } from 'react';
import { HeatmapLayer } from 'react-leaflet-heatmap-layer-v3';
import { MapContainer, TileLayer, CircleMarker, Popup, useMap, Marker } from 'react-leaflet';
import { Icon, PointTuple } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

const API_BASE_URL = process.env.REACT_APP_API_URL || '/api';

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

  useEffect(() => {
    const cleanup = setInterval(() => {
      const now = Date.now();
      setAlertMarkers(prev => 
        prev.filter(marker => now - marker.createdAt < 30000) // 30 seconds
      );
    }, 1000);
  
    return () => clearInterval(cleanup);
  }, []);  

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

  const handleAlertRequest = (type: AlertType['type']) => {
    const newAlertMarker: AlertMarker = {
      id: crypto.randomUUID(),
      position: position,
      type: type,
      createdAt: Date.now(),
      creatorId: sessionId.current
    };
    
    console.log('[Alert Marker Added]', {
      type,
      position,
      time: new Date().toISOString()
    });
  
    setAlertMarkers(prev => [...prev, newAlertMarker]);
  };

  const handleRemoveAlertMarker = (markerId: string) => {
    setAlertMarkers(prev => prev.filter(marker => marker.id !== markerId));
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
  const updateServerPosition = async (pos: [number, number], alert: AlertType | null = null): Promise<void> => {
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
          joinedAt: new Date().toISOString(),
          alert: alert ?? activeAlert // This will now work with the updated type
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
      const response = await fetch(`${API_BASE_URL}/sessions?dummy_count=${submittedDummyCount}&creator_id=${sessionId.current}`);
      if (!response.ok) throw new Error('Failed to fetch sessions');
      const data = await response.json();
      
      const processedIds = new Set<string>();
      
      const updatedSessions = data.reduce((acc: Session[], newSession: Session) => {
        if (processedIds.has(newSession.id)) return acc;
        
        processedIds.add(newSession.id);
        
        // For current user's session, always use local state
        if (newSession.id === sessionId.current) {
          console.log('[Session Update] Current user state:', {
            id: newSession.id.slice(0, 8),
            alert: activeAlert,
            time: new Date().toISOString()
          });
          return [...acc, {
            ...newSession,
            alert: activeAlert // Always use local alert state
          }];
        }
        
        // For dummy sessions, preserve existing state
        const existingSession = sessions.find(s => s.id === newSession.id);
        if (existingSession?.isDummy) {
          return [...acc, {
            ...existingSession,
            lastUpdate: newSession.lastUpdate
          }];
        }
        
        // For other sessions, use server state
        return [...acc, newSession];
      }, []);
  
      setSessions(updatedSessions);
      
      // Update heatmap data with proper typing
      const heatData = updatedSessions.map((session: Session): HeatmapPoint => [
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
    }, 1000); 
    
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
                  if (isCurrentUser) {
                    console.log('[Render State]', {
                      id: session.id.slice(0, 8),
                      hasAlert: !!session.alert,
                      alertType: session.alert?.type,
                      time: new Date().toISOString()
                    });
                  }                  
                  // For current user, strictly use local alert state
                  const shouldShowAlert = isCurrentUser ? 
                    !!activeAlert : 
                    !!(session.alert && session.alert.type && ALERT_CONFIGS[session.alert.type]);

                  if (shouldShowAlert && session.alert?.type) {
                    logMarkerChange(session, 'Rendering Alert Marker');
                    const alertConfig = ALERT_CONFIGS[session.alert.type];
                    
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
                              session.id === sessionId.current ? 'You' : 'Other Protester'}
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
