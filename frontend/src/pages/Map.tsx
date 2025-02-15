import React, { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Custom style for the map container
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
    const mapRef = useRef<L.Map | null>(null);
    const watchIdRef = useRef<number | null>(null);
  
    useEffect(() => {
      if ('geolocation' in navigator) {
        // Get initial position
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const newPosition: [number, number] = [pos.coords.latitude, pos.coords.longitude];
            setPosition(newPosition);
            console.log('Initial location acquired:', pos.coords);
          },
          (error) => {
            setLocationError(error.message);
            console.error('Location error:', error);
          }
        );
  
        // Set up periodic location updates
        const intervalId = setInterval(() => {
          if (isTracking) {
            navigator.geolocation.getCurrentPosition(
              (pos) => {
                const newPosition: [number, number] = [pos.coords.latitude, pos.coords.longitude];
                setPosition(newPosition);
                console.log('Location updated:', pos.coords);
              },
              (error) => {
                setLocationError(error.message);
                console.error('Location update error:', error);
              }
            );
          }
        }, 5000); // Update every 5 seconds
  
        // Cleanup function
        return () => {
          clearInterval(intervalId);
          if (watchIdRef.current) {
            navigator.geolocation.clearWatch(watchIdRef.current);
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
                url="https://tiles.stadiamaps.com/tiles/stamen_terrain/{z}/{x}/{y}@2x.png"
                className="map-tiles"
                maxZoom={22}
                minZoom={3}
              />
              <CircleMarker 
                center={position}
                {...circleMarkerStyle}
              >
                <Popup>Your Location</Popup>
              </CircleMarker>
            </MapContainer>
          </div>
        </div>
      </div>
    );
  };