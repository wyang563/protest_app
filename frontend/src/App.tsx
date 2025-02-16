import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import { Map } from './pages/Map';
import HeadRadio from './pages/HeadRadio';
import Radio from './pages/Radio';
import 'leaflet/dist/leaflet.css';

function App() {
  return (
    <Router>
      <div className="App">
        <Routes>
          <Route path="/" element={<Navigate to="/map" replace />} />
          <Route path="/map" element={<Map />} />
          <Route path="/head_radio" element={<HeadRadio />} />
          <Route path="/radio" element={<Radio />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;