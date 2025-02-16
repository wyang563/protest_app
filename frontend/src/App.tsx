import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import { Map } from './pages/Map';
import HeadRadio from './pages/HeadRadio';
import Radio from './pages/Radio';
import { Login } from './pages/Login';
import { Signup } from './pages/Signup';
import { AuthProvider } from './contexts/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import 'leaflet/dist/leaflet.css';

function App() {
  return (
    <AuthProvider>
      <Router>
        <div className="App">
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/" element={<Navigate to="/map" replace />} />
            <Route path="/map" element={
              <ProtectedRoute>
                <Map />
              </ProtectedRoute>
            } />
            <Route path="/head_radio" element={
              <ProtectedRoute>
                <HeadRadio />
              </ProtectedRoute>
            } />
            <Route path="/radio" element={
              <ProtectedRoute>
                <Radio />
              </ProtectedRoute>
            } />
          </Routes>
        </div>
      </Router>
    </AuthProvider>
  );
}

export default App;