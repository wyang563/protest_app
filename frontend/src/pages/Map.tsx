import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Fix for default marker icons
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: require('leaflet/dist/images/marker-icon-2x.png'),
  iconUrl: require('leaflet/dist/images/marker-icon.png'),
  shadowUrl: require('leaflet/dist/images/marker-shadow.png'),
});

export const Map: React.FC = () => {
  const [position, setPosition] = useState<[number, number]>([40.7128, -74.0060]);
  const [locationError, setLocationError] = useState<string>('');

  useEffect(() => {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setPosition([pos.coords.latitude, pos.coords.longitude]);
          console.log('Location acquired:', pos.coords);
        },
        (error) => {
          setLocationError(error.message);
          console.error('Location error:', error);
        }
      );
    }
  }, []);

  return (
    <div className="h-screen flex flex-col">
      <div className="p-4 bg-gray-100">
        <h1 className="text-2xl mb-4">Protest Map</h1>
        
        {/* Location Status */}
        <div className="mb-4">
          <h2 className="text-xl mb-2">Location Status</h2>
          {locationError ? (
            <p className="text-red-500 font-medium">{locationError}</p>
          ) : (
            <p className="text-green-500 font-medium">
              Location: {position[0].toFixed(4)}, {position[1].toFixed(4)}
            </p>
          )}
        </div>
      </div>

      {/* Map Section */}
      <div className="flex-1 p-4">
        <div className="h-[400px] w-full rounded-lg overflow-hidden shadow-lg">
          <MapContainer 
            center={position} 
            zoom={15}
            style={{ height: '100%', width: '100%' }}
            zoomControl={true}
          >
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            />
            <Marker position={position}>
              <Popup>
                Your Location
              </Popup>
            </Marker>
          </MapContainer>
        </div>
      </div>
    </div>
  );
};