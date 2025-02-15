from flask import Blueprint, request, jsonify
from datetime import datetime, timedelta
import threading
import time
from math import cos, sin, pi, radians
import random
import numpy as np

bp = Blueprint('routes', __name__)

# In-memory storage for sessions
sessions = {}
session_lock = threading.Lock()

def generate_random_coordinates(center: tuple[float, float], min_distance: float, max_distance: float, count: int) -> list:
    """Generate random coordinates within a radius range from center point"""
    dummy_positions = []
    for _ in range(count):
        # Random distance between min and max (in meters)
        distance = random.uniform(min_distance, max_distance)
        # Random angle
        angle = random.uniform(0, 2 * pi)
        
        # Convert distance from meters to degrees (approximately)
        # 111,111 meters = 1 degree of latitude
        lat_change = (distance * cos(angle)) / 111111
        # Adjust longitude change based on latitude (earth gets narrower at poles)
        lon_change = (distance * sin(angle)) / (111111 * cos(radians(center[0])))
        
        new_lat = center[0] + lat_change
        new_lon = center[1] + lon_change
        dummy_positions.append([new_lat, new_lon])
    
    return dummy_positions

def cleanup_old_sessions():
    """Remove sessions that haven't been updated in 30 seconds"""
    while True:
        with session_lock:
            current_time = datetime.now().timestamp() * 1000
            sessions_to_remove = []
            for session_id, session in sessions.items():
                if current_time - session['timestamp'] > 30000:  # 30 seconds
                    sessions_to_remove.append(session_id)
            for session_id in sessions_to_remove:
                del sessions[session_id]
        time.sleep(10)  # Check every 10 seconds

# Start cleanup thread
cleanup_thread = threading.Thread(target=cleanup_old_sessions, daemon=True)
cleanup_thread.start()

@bp.route('/api/location', methods=['POST'])
def update_location():
    data = request.json
    session_id = data.get('sessionId')
    position = data.get('position')
    timestamp = data.get('timestamp')
    joined_at = data.get('joinedAt', datetime.now().isoformat())

    if not all([session_id, position, timestamp]):
        return jsonify({'error': 'Missing required fields'}), 400

    with session_lock:
        # If this is a new session, store the original join time
        if session_id not in sessions:
            sessions[session_id] = {
                'id': session_id,
                'position': position,
                'timestamp': timestamp,
                'joinedAt': joined_at,
                'ip': request.remote_addr
            }
        else:
            # Update only position and timestamp for existing sessions
            sessions[session_id].update({
                'position': position,
                'timestamp': timestamp
            })

    return jsonify({'success': True})

@bp.route('/api/sessions', methods=['GET'])
def get_sessions():
    dummy_count = request.args.get('dummy_count', default=0, type=int)
    
    with session_lock:
        real_sessions = [{
            'id': session['id'],
            'position': session['position'],
            'lastUpdate': session['timestamp'],
            'joinedAt': session['joinedAt'],
            'ip': session['ip'],
            'isDummy': False
        } for session in sessions.values() if not session.get('isDummy', False)]  # Only get real sessions
        
        # Get or generate dummy sessions
        if dummy_count > 0:
            # If there are no real sessions, use a default center point
            if real_sessions:
                positions = np.array([s['position'] for s in real_sessions])
                center_of_mass = positions.mean(axis=0)
                print(f"Center of mass: {center_of_mass}")  # Debug print
            else:
                # Default to New York City coordinates if no real users
                center_of_mass = np.array([40.7128, -74.0060])
                print(f"Using default center: {center_of_mass}")  # Debug print
            
            # Clear old dummy sessions
            sessions_to_remove = [sid for sid, session in sessions.items() 
                                if session.get('isDummy', False)]
            for sid in sessions_to_remove:
                del sessions[sid]
            
            # Generate new dummy positions
            dummy_positions = generate_random_coordinates(
                center=tuple(center_of_mass),
                min_distance=100,  # 100 meters
                max_distance=200,  # 200 meters
                count=dummy_count
            )
            
            print(f"Generated dummy positions: {dummy_positions}")  # Debug print
            
            # Create and store dummy sessions
            base_time = time.time() * 1000
            for i, pos in enumerate(dummy_positions):
                dummy_id = f'dummy-{int(base_time)}-{i}'
                dummy_session = {
                    'id': dummy_id,
                    'position': pos,
                    'timestamp': base_time,
                    'joinedAt': datetime.now().isoformat(),
                    'ip': '0.0.0.0',
                    'isDummy': True
                }
                sessions[dummy_id] = dummy_session
        
        # Return all sessions including dummies
        all_sessions = [{
            'id': session['id'],
            'position': session['position'],
            'lastUpdate': session['timestamp'],
            'joinedAt': session['joinedAt'],
            'ip': session['ip'],
            'isDummy': session.get('isDummy', False)
        } for session in sessions.values()]
        
        return jsonify(all_sessions)