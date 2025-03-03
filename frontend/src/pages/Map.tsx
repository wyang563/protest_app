import { forwardRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import React, { useState, useEffect, useRef } from 'react';
import { HeatmapLayer } from 'react-leaflet-heatmap-layer-v3';
import { MapContainer, TileLayer, CircleMarker, Popup, useMap, Marker } from 'react-leaflet';
import { Icon, PointTuple } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { useNavigate } from 'react-router-dom';
import AudioRecorder from '../components/Recorder';
import { getSentiment } from '../utils/sentimentUtils';  // We'll create this utility



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

interface ClusterInfo {
  type: AlertType['type'];
  position: [number, number];
  strength: number;
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
  alert?: AlertType | null;
  isTracking?: boolean;  // Add this field
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
  const [clusters, setClusters] = useState<ClusterInfo[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'disconnected'>('disconnected');
  const [showHeatmap, setShowHeatmap] = useState(true);
  const [displayedConnections, setDisplayedConnections] = useState<number>(0);
  const [isRecording, setIsRecording] = useState(false);
  const [audioContext, setAudioContext] = useState<AudioContext | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  

  useEffect(() => {
    const fetchActiveConnections = async () => {
      try {
        const response = await fetch(`${API_URL}/api/activeConnections`, {
          credentials: 'include',
          headers: {
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache'
          }
        });
        if (response.ok) {
          const data = await response.json();
          // Always show at least 1 if tracking is enabled locally
          setDisplayedConnections(isTracking ? Math.max(1, data.active) : data.active);
        }
      } catch (error) {
        console.error('Failed to fetch active connections:', error);
        // Still show 1 if tracking is enabled, even on error
        setDisplayedConnections(isTracking ? 1 : 0);
      }
    };

    fetchActiveConnections();
    const interval = setInterval(fetchActiveConnections, 1000);
    return () => clearInterval(interval);
  }, [isTracking]); // Add isTracking as dependency
  
  
  useEffect(() => {
    if (isTracking) {
      // Immediately notify server about connection
      setConnectionStatus('connected');
      updateServerPosition(position).then(() => {
        // Force refresh active connections after connecting
        fetch(`${API_URL}/api/activeConnections`, {
          credentials: 'include'
        }).then(res => res.json())
          .then(data => setActiveConnections(data.active));
      });
    } else {
      setConnectionStatus('disconnected');
      // Notify server about disconnection
      fetch(`${API_URL}/api/location`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: sessionId.current,
          position: position,
          timestamp: 0,
          joinedAt: new Date().toISOString(),
          alert: null,
          status: 'disconnected'
        }),
      }).then(() => {
        // Force refresh active connections after disconnecting
        fetch(`${API_URL}/api/activeConnections`, {
          credentials: 'include'
        }).then(res => res.json())
          .then(data => setActiveConnections(data.active));
      });
    }
  }, [isTracking]);

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

  useEffect(() => {
    setSessions(prev => {
      const hasCurrentUser = prev.some(s => s.id === sessionId.current);
      if (!hasCurrentUser) {
        return [
          ...prev,
          {
            id: sessionId.current,
            position,
            lastUpdate: Date.now(),
            joinedAt: new Date().toISOString(),
            isDummy: false,
            alert: null,
            isTracking: isTracking // Add tracking status
          }
        ];
      }
      return prev.map(s => 
        s.id === sessionId.current 
          ? { ...s, position, lastUpdate: Date.now(), isTracking }
          : s
      );
    });
  }, [position, isTracking]); // Add isTracking to dependencies

  // Add cleanup effect
  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current) {
        mediaRecorderRef.current.stop();
      }
      if (audioContext) {
        audioContext.close();
      }
    };
  }, []);

  const analyzeSentimentFromAudio = async (audioBlob: Blob) => {
    try {
      const response = await fetch(`${API_URL}/transcribe`, {
        method: 'POST',
        body: audioBlob
      });
      
      if (response.ok) {
        const { transcription } = await response.json();
        if (transcription) {
          const sentiment = await getSentiment(transcription);
          // Map sentiment to alert type
          if (sentiment.label === "need supplies") handleAlertRequest("water");
          else if (sentiment.label === "fleeing") handleAlertRequest("stayaway");
          else if (sentiment.label === "medical emergency") handleAlertRequest("medical");
          else if (sentiment.label === "advancing") handleAlertRequest("arrest");
        }
      }
    } catch (error) {
      console.error('Error analyzing audio:', error);
    }
  };

  // Add this function to handle recording
  const toggleRecording = async () => {
    if (!isRecording) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const newAudioContext = new AudioContext();
        setAudioContext(newAudioContext);
        
        const mediaRecorder = new MediaRecorder(stream);
        mediaRecorderRef.current = mediaRecorder;
        
        mediaRecorder.ondataavailable = async (e) => {
          if (e.data.size > 0) {
            await analyzeSentimentFromAudio(e.data);
          }
        };
        
        // Record in 3-second chunks
        mediaRecorder.start(3000);
        setIsRecording(true);
      } catch (err) {
        console.error('Failed to start recording:', err);
      }
    } else {
      mediaRecorderRef.current?.stop();
      setIsRecording(false);
      if (audioContext) {
        await audioContext.close();
        setAudioContext(null);
      }
    }
  };

  const runClusterSimulation = () => {
    const dummySessions = sessions.filter(s => s.isDummy);
    if (dummySessions.length === 0) return;
  
    setSimulationConfig(prev => ({ ...prev, isRunning: true }));
    setClusters([]); // Reset clusters at start
  
    const simulationInterval = setInterval(() => {
      dummySessions.forEach(dummy => {
        // Check for nearby clusters first
        const nearbyCluster = clusters.find(cluster => {
          const distance = Math.sqrt(
            Math.pow(cluster.position[0] - dummy.position[0], 2) + 
            Math.pow(cluster.position[1] - dummy.position[1], 2)
          );
          return distance < 0.005; // Roughly 500m radius
        });
  
        // Higher chance to create alert if near cluster of same type
        const baseChance = 0.2;
        const clusterBonus = nearbyCluster ? 0.4 : 0;
        const totalChance = Math.min(baseChance + clusterBonus, 0.8);
  
        if (Math.random() < totalChance) {
          // If near cluster, higher chance to match its type
          let alertType: AlertType['type'] | null;
          if (nearbyCluster && Math.random() < 0.7) {
            alertType = nearbyCluster.type;
          } else {
            alertType = rollForAlert(simulationConfig.alertProbabilities);
          }
  
          if (!alertType) return;
  
          // Create new alert
          const newAlert: AlertMarker = {
            id: `cluster-alert-${dummy.id}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            position: dummy.position,
            type: alertType,
            createdAt: Date.now(),
            creatorId: dummy.id
          };
  
          // Add to clusters with random initial strength
          setClusters(prev => [...prev, {
            type: alertType!,
            position: dummy.position,
            strength: Math.random() * 0.5 + 0.5 // 0.5 to 1.0
          }]);
  
          // Send alert to server
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
            setTimeout(() => {
              fetch(`${API_URL}/api/alert/${newAlert.id}`, { method: 'DELETE' })
                .then(() => {
                  // Remove from clusters after delay
                  setClusters(prev => 
                    prev.filter(c => 
                      c.position[0] !== newAlert.position[0] || 
                      c.position[1] !== newAlert.position[1]
                    )
                  );
                  
                  // Create new alert after short delay
                  setTimeout(() => {
                    if (simulationConfig.isRunning) {
                      const nextAlertType = rollForAlert(simulationConfig.alertProbabilities);
                      if (nextAlertType) {
                        handleAlertRequest(nextAlertType);
                      }
                    }
                  }, 500);
                })
                .catch(console.error);
            }, 2000);
          })
          .catch(console.error);
        }
      });
    }, 2000);
  
    // Stop simulation after 1 minute
    setTimeout(() => {
      clearInterval(simulationInterval);
      setSimulationConfig(prev => ({ ...prev, isRunning: false }));
      setClusters([]); // Clear clusters
    }, 60000);
  };

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

  const geoOptions = {
    enableHighAccuracy: true,
    timeout: 10000,        // Increase timeout to 10 seconds
    maximumAge: 5000      // Allow cached positions up to 5 seconds old
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
      const response = await fetch(`${API_URL}/api/location`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        },
        body: JSON.stringify({
          sessionId: sessionId.current,
          position: pos,
          timestamp: Date.now(),
          joinedAt: new Date().toISOString(),
          alert: alert,
          isTracking: isTracking // Add this field
        }),
      });
      
      if (response.ok) {
        const data = await response.json();
        setActiveConnections(data.activeConnections);
      }
    } catch (error) {
      console.error('Failed updating server position:', error);
    }
  };
  
  const fetchSessions = async (dummyCountParam?: number) => {
    try {
      const response = await fetch(`${API_URL}/api/sessions?dummy_count=${dummyCountParam || 0}&creator_id=${sessionId.current}`, {
        credentials: 'include',
        headers: {
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        }
      });
      if (!response.ok) throw new Error('Failed to fetch sessions');
      const data: Session[] = await response.json();
      
      // Process sessions more efficiently
      setSessions(prev => {
        const currentUserSession = prev.find(s => s.id === sessionId.current);
        const processedSessions = data.map(session => 
          session.isDummy ? {
            ...session,
            id: `dummy-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            creatorId: sessionId.current
          } : session
        );
  
        return currentUserSession && isTracking 
          ? [currentUserSession, ...processedSessions.filter(s => s.id !== sessionId.current)]
          : processedSessions;
      });
    } catch (error) {
      console.error('Failed to fetch sessions:', error);
    }
  };

  useEffect(() => {
    // Get position immediately without waiting for tracking state
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const newPosition: [number, number] = [pos.coords.latitude, pos.coords.longitude];
          setPosition(newPosition);
          updateServerPosition(newPosition);
        },
        (err) => setLocationError(err.message),
        geoOptions
      );
    }
  }, []); 
  
  useEffect(() => {
    let mounted = true;
    const sessionInterval = setInterval(() => {
      if (!mounted) return;
      fetchSessions(submittedDummyCount);
    }, 3000);

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
          geoOptions
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
    <div className="min-h-screen bg-gray-900 text-gray-100 p-4 md:p-16 flex items-center justify-center">
    <div className="w-full max-w-[1400px] flex flex-col lg:flex-row gap-4">
        {/* Controls Section */}
        <div className="w-full lg:w-96 bg-gray-800 p-4 lg:p-6 flex flex-col gap-4 rounded-2xl">
        {/* Top Bar with Login Info and Network Status */}
          <div className="flex justify-between items-center bg-gray-700/50 p-2 rounded-lg">
            {/* Login Info - Compact */}
            {user && (
              <div className="flex items-center gap-2 text-xs">
                <span className="text-gray-400">{user.username}</span>
                <button
                  onClick={handleLogout}
                  className="bg-red-500/80 hover:bg-red-600 text-white px-2 py-0.5 rounded-sm text-xs"
                >
                  Logout
                </button>
              </div>
            )}
  
            {/* Network Status - Compact */}
            <div className="flex items-center gap-2 text-xs">
              <div className={`h-1.5 w-1.5 rounded-full ${
                connectionStatus === 'connected' ? 'bg-green-500' : 'bg-red-500'
              }`}></div>
              <span className="text-gray-300">
                {displayedConnections} active
              </span>
            </div>
          </div>
  
          {/* Protester Controls - Main Focus */}
          <div className="bg-gray-700 p-4 rounded-lg border-2 border-blue-500/20">
            <h3 className="text-lg font-semibold mb-3 text-blue-100">Protester Controls</h3>
            <div className="grid grid-cols-2 gap-3">
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
                  } text-white p-4 rounded-lg flex items-center justify-center gap-2 transition-colors`}
                  title={config.tooltip}
                >
                  <img src={config.icon} alt={type} className="w-6 h-6" />
                  <span className="text-sm font-medium">{type.charAt(0).toUpperCase() + type.slice(1)}</span>
                </button>
              ))}
            </div>
            {activeAlert && (
              <button
                onClick={handleClearAlert}
                className="w-full mt-3 bg-gray-600 hover:bg-gray-500 text-white p-2 rounded-lg
                  flex items-center justify-center gap-2 transition-colors"
              >
                Clear Alert
              </button>
            )}
          </div>
  
          {/* Map & Location Controls - Secondary */}
          <div className="bg-gray-700/90 p-4 rounded-lg">
            <h3 className="text-md font-medium mb-2 text-gray-200">Map Controls</h3>
            {locationError ? (
              <p className="text-red-400 text-xs mb-2">{locationError}</p>
            ) : (
              <p className="text-green-400 text-xs mb-2">
                Location: {position[0].toFixed(4)}, {position[1].toFixed(4)}
              </p>
            )}
            <div className="flex flex-col gap-2">
              <div className="flex gap-2">
                <button
                  onClick={handleCenterMap}
                  className="flex-1 bg-blue-600/80 hover:bg-blue-700 text-white px-3 py-1.5 rounded-md
                    transition-colors duration-200 text-sm"
                >
                  Center Map
                </button>
                <button
                  onClick={toggleTracking}
                  className={`flex-1 text-sm ${
                    isTracking ? 'bg-red-600/80 hover:bg-red-700' : 'bg-green-600/80 hover:bg-green-700'
                  } text-white px-3 py-1.5 rounded-md transition-colors duration-200`}
                >
                  {isTracking ? 'Stop Tracking' : 'Start Tracking'}
                </button>
              </div>
              
              {/* Heatmap Toggle */}
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-300">Heatmap Overlay</span>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    className="sr-only peer"
                    checked={showHeatmap}
                    onChange={(e) => setShowHeatmap(e.target.checked)}
                  />
                  <div className="w-9 h-5 bg-gray-600 rounded-full peer peer-checked:after:translate-x-full 
                    after:content-[''] after:absolute after:top-[2px] after:left-[2px] 
                    after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all 
                    peer-checked:bg-blue-600"></div>
                </label>
              </div>
            </div>
          </div>

          {/* Simulation Development - De-emphasized */}
          <div className="bg-gray-700/50 p-3 rounded-lg">
            <h3 className="text-sm font-medium mb-2 text-gray-400">Development Tools</h3>
            <div className="grid grid-cols-2 gap-2">
              {/* Top Left: Input */}
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min="0"
                  max="1000"
                  value={dummyCount}
                  onChange={(e) => setDummyCount(e.target.value)}
                  className="w-full px-2 py-0.5 rounded bg-gray-600/50 border border-gray-500/50 text-gray-300 text-xs"
                  placeholder="# of dummies"
                />
              </div>
              
              {/* Top Right: Random Sim */}
              <button
                onClick={runAlertSimulation}
                disabled={simulationConfig.isRunning}
                className="text-xs bg-green-600/50 hover:bg-green-700/50 text-gray-200 px-2 py-1 rounded"
              >
                Random Sim
              </button>

              {/* Bottom Left: Add Dummies */}
              <button
                onClick={handleDummyCountSubmit}
                className="text-xs bg-purple-600/50 hover:bg-purple-700/50 text-gray-200 px-2 py-1 rounded"
              >
                Add Dummies
              </button>

              {/* Bottom Right: Cluster Sim */}
              <button
                onClick={runClusterSimulation}
                disabled={simulationConfig.isRunning}
                className="text-xs bg-blue-600/50 hover:bg-blue-700/50 text-gray-200 px-2 py-1 rounded"
              >
                Cluster Sim
              </button>
            </div>
          </div>
          <div className="bg-gray-700 p-4 rounded-lg border-2 border-blue-500/20">
            <h3 className="text-lg font-semibold mb-3 text-blue-100"> Web Radio </h3>
            <AudioRecorder />
          </div>
        </div>
  
        {/* Map Section - Square on mobile, flex on desktop */}
        <div className="w-full lg:flex-1 flex items-center justify-center">
          <div className="w-full aspect-square lg:aspect-auto lg:h-[80vh] bg-gray-800 rounded-2xl overflow-hidden relative">
            <MapContainer 
              center={position} 
              zoom={DEFAULT_ZOOM}
              style={{
                width: '100%',
                height: '100%',
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0
              }}
              ref={mapRef}
              zoomControl={true}
              attributionControl={false}
              dragging={true}
              scrollWheelZoom={true}
              doubleClickZoom={true}
              touchZoom={true}
              tap={true}
            >
              <TileLayer
                url="https://tiles.stadiamaps.com/tiles/stamen_terrain/{z}/{x}/{y}@2x.png"
                className="map-tiles"
                maxZoom={22}
                minZoom={3}
              />
              {showHeatmap && (
                <HeatmapLayer
                  fitBoundsOnLoad
                  fitBoundsOnUpdate
                  points={heatmapData}
                  longitudeExtractor={(point: [number, number, number]) => point?.[1] ?? 0}
                  latitudeExtractor={(point: [number, number, number]) => point?.[0] ?? 0}
                  intensityExtractor={(point: [number, number, number]) => point?.[2] ?? 0}
                  {...heatmapOptions}
                />
              )}             
              <MapUpdater center={position} />
              {sessions?.map((session) => {
                const isCurrentUser = session.id === sessionId.current;
                const effectiveAlert = isCurrentUser ? activeAlert : session.alert;
                
                return (
                  <React.Fragment key={session.id}>
                    {effectiveAlert?.type && ALERT_CONFIGS[effectiveAlert.type] ? (
                      <Marker 
                        position={session.position}
                        icon={L.divIcon({
                          html: `<img src="${ALERT_CONFIGS[effectiveAlert.type].icon}" class="w-6 h-6" />`,
                          className: '',
                          iconSize: ALERT_CONFIGS[effectiveAlert.type].size as PointTuple,
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
                                <strong>{ALERT_CONFIGS[effectiveAlert.type].tooltip}</strong>
                              </li>
                            </ul>
                          </div>
                        </Popup>
                      </Marker>
                    ) : (
                    <CircleMarker 
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
                  )};
                  </React.Fragment>
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
