from flask import Blueprint, request, jsonify
from datetime import datetime, timedelta
import threading
import time

bp = Blueprint('routes', __name__)

# In-memory storage for sessions
sessions = {}
session_lock = threading.Lock()

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
    with session_lock:
        return jsonify([{
            'id': session['id'],
            'position': session['position'],
            'lastUpdate': session['timestamp'],
            'joinedAt': session['joinedAt'],
            'ip': session['ip']
        } for session in sessions.values()])