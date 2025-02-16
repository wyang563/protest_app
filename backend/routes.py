from flask import Blueprint, request, jsonify
from datetime import datetime, timedelta
import threading
import time
from math import cos, sin, pi, radians
import random
import numpy as np
from collections import defaultdict
from functools import lru_cache


routes_bp = Blueprint('routes', __name__)

# In-memory storage for sessions
sessions = {}
session_lock = threading.Lock()

alert_markers = {}
alert_lock = threading.Lock()

# Use a more efficient data structure
active_sessions = defaultdict(dict)
session_lock = threading.RLock()  # Use RLock instead of Lock

# Cache the active connection count for 1 second
@lru_cache(maxsize=1)
def get_cached_connection_count():
    current_time = time.time() * 1000
    count = 0
    with session_lock:
        for session in active_sessions.values():
            if (
                current_time - session.get('timestamp', 0) < 30000 and
                not session.get('isDummy', False) and
                session.get('id') is not None
            ):
                count += 1
    return count, current_time // 1000  # Include timestamp in cache key

def count_active_connections():
    """Count real (non-dummy) active sessions within last 30 seconds"""
    count, _ = get_cached_connection_count()
    return count

def generate_random_coordinates(center: tuple[float, float], min_distance: float, max_distance: float, count: int) -> list:
    """Generate random coordinates within a radius range from center point"""
    dummy_positions = []
    for _ in range(count):
        # Random distance between min and max (in meters)
        distance = random.uniform(min_distance, max_distance)  # Changed to have minimum distance
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

@routes_bp.route('/api/activeConnections', methods=['GET'])
def get_active_connections():
    """Get count of non-dummy active sessions that are tracking in last 30 seconds"""
    current_time = time.time() * 1000
    with session_lock:
        active_count = sum(
            1 for session in active_sessions.values()
            if not session.get('isDummy', False)
            and session.get('isTracking', False)  # Only count if tracking is enabled
            and current_time - session.get('timestamp', 0) < 30000
        )
    return jsonify({'active': active_count})

@routes_bp.route('/api/location', methods=['POST'])
def update_location():
    current_time = time.time() * 1000
    data = request.json
    session_id = data.get('sessionId')
    position = data.get('position')
    timestamp = data.get('timestamp', time.time() * 1000)
    is_tracking = data.get('isTracking', False)  # Get tracking status
    
    if not all([session_id, position]):
        return jsonify({'error': 'Missing required fields'}), 400

    with session_lock:
        is_new_session = session_id not in active_sessions
        active_sessions[session_id].update({
            'id': session_id,
            'position': position,
            'timestamp': timestamp,
            'joinedAt': data.get('joinedAt', datetime.now().isoformat()),
            'ip': request.remote_addr,
            'alert': data.get('alert'),
            'isDummy': False,
            'isTracking': is_tracking  # Store tracking status
        })
        
        # Count active connections (non-dummy and tracking enabled)
        active_count = sum(
            1 for s in active_sessions.values()
            if not s.get('isDummy', False) 
            and s.get('isTracking', False)
            and current_time - s.get('timestamp', 0) < 30000
        )
        
    return jsonify({
        'success': True,
        'activeConnections': active_count,
        'isNewSession': is_new_session
    })
        
@routes_bp.route('/api/sessions', methods=['GET'])
def get_sessions():
    try:
        dummy_count = request.args.get('dummy_count', default=0, type=int)
        creator_id = request.args.get('creator_id')
        current_time = time.time() * 1000
        
        with session_lock:
            # Get real sessions efficiently
            real_sessions = []
            for session_id, session in active_sessions.items():
                if (
                    not session.get('isDummy', False) and 
                    current_time - session.get('timestamp', 0) < 30000
                ):
                    real_sessions.append({
                        'id': session['id'],
                        'position': session['position'],
                        'lastUpdate': session['timestamp'],
                        'joinedAt': session['joinedAt'],
                        'ip': session['ip'],
                        'isDummy': False,
                        'alert': session.get('alert'),
                        'creatorId': session.get('creatorId'),
                        'activeConnections': count_active_connections()
                    })

            # Handle dummy sessions more efficiently
            if dummy_count > 0 and real_sessions:
                positions = np.array([s['position'] for s in real_sessions])
                center_of_mass = positions.mean(axis=0)
                
                # Generate dummy positions in bulk
                dummy_positions = generate_random_coordinates(
                    center=tuple(center_of_mass),
                    min_distance=30,
                    max_distance=300,
                    count=dummy_count
                )
                
                # Clear old dummy sessions
                to_delete = [
                    sid for sid, session in active_sessions.items()
                    if session.get('isDummy') and session.get('creatorId') == creator_id
                ]
                for sid in to_delete:
                    del active_sessions[sid]
                
                # Add new dummy sessions
                for i, pos in enumerate(dummy_positions):
                    dummy_id = f'dummy-{int(current_time)}-{i}'
                    active_sessions[dummy_id] = {
                        'id': dummy_id,
                        'position': pos,
                        'timestamp': current_time,
                        'joinedAt': datetime.now().isoformat(),
                        'ip': '0.0.0.0',
                        'isDummy': True,
                        'creatorId': creator_id,
                        'alert': None
                    }
            
            # Combine real and dummy sessions efficiently
            all_sessions = real_sessions + [
                {
                    'id': session['id'],
                    'position': session['position'],
                    'lastUpdate': session['timestamp'],
                    'joinedAt': session['joinedAt'],
                    'ip': session['ip'],
                    'isDummy': True,
                    'creatorId': session.get('creatorId'),
                    'alert': session.get('alert')
                }
                for session in active_sessions.values()
                if session.get('isDummy', False)
            ]
            
            return jsonify(all_sessions)
            
    except Exception as e:
        print(f"Error in get_sessions: {str(e)}")
        return jsonify({'error': str(e)}), 500
        
@routes_bp.route('/api/alert', methods=['POST'])
def create_alert():
    data = request.json
    marker_id = data.get('markerId')
    position = data.get('position')
    alert_type = data.get('type')
    creator_id = data.get('creatorId')
    created_at = data.get('createdAt')

    with alert_lock:
        alert_markers[marker_id] = {
            'id': marker_id,
            'position': position,
            'type': alert_type,
            'creatorId': creator_id,
            'createdAt': created_at
        }
    
    return jsonify({'success': True})

@routes_bp.route('/api/alert/<marker_id>', methods=['DELETE'])
def remove_alert(marker_id):
    with alert_lock:
        if marker_id in alert_markers:
            del alert_markers[marker_id]
    
    return jsonify({'success': True})

@routes_bp.route('/api/alerts', methods=['GET'])
def get_alerts():
    current_time = time.time() * 1000
    
    with alert_lock:
        # Filter out expired alerts (older than 30 seconds)
        valid_alerts = [
            alert for alert in alert_markers.values()
            if current_time - alert['createdAt'] < 30000
        ]
    
    return jsonify(valid_alerts)

# Add cleanup function for old alerts
def cleanup_old_alerts():
    while True:
        current_time = time.time() * 1000
        with alert_lock:
            markers_to_remove = [
                marker_id for marker_id, alert in alert_markers.items()
                if current_time - alert['createdAt'] > 30000
            ]
            for marker_id in markers_to_remove:
                del alert_markers[marker_id]
        time.sleep(10)

# Start alert cleanup thread
alert_cleanup_thread = threading.Thread(target=cleanup_old_alerts, daemon=True)
alert_cleanup_thread.start()