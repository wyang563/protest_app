from flask import Blueprint, request, jsonify, session
from werkzeug.security import generate_password_hash, check_password_hash
import sqlite3
from functools import wraps

auth_bp = Blueprint('auth', __name__)

def init_auth_db():
    conn = sqlite3.connect('users.db')
    c = conn.cursor()
    c.execute('''
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    ''')
    conn.commit()
    conn.close()

def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'user_id' not in session:
            return jsonify({'error': 'Unauthorized'}), 401
        return f(*args, **kwargs)
    return decorated_function

@auth_bp.route('/auth/signup', methods=['POST'])  # Remove /api prefix
def signup():
    data = request.get_json()
    username = data.get('username')
    password = data.get('password')

    if not username or not password:
        return jsonify({'error': 'Missing username or password'}), 400

    try:
        conn = sqlite3.connect('users.db')
        c = conn.cursor()
        c.execute('INSERT INTO users (username, password) VALUES (?, ?)',
                 (username, password))
        conn.commit()
        user_id = c.lastrowid
        conn.close()

        session['user_id'] = user_id
        session['username'] = username
        
        return jsonify({
            'message': 'User created successfully',
            'user_id': user_id,
            'username': username
        }), 201
    except sqlite3.IntegrityError:
        return jsonify({'error': 'Username already exists'}), 409

@auth_bp.route('/auth/login', methods=['POST'])  # Remove /api prefix
def login():
    data = request.get_json()
    username = data.get('username')
    password = data.get('password')

    conn = sqlite3.connect('users.db')
    c = conn.cursor()
    c.execute('SELECT * FROM users WHERE username = ? AND password = ?', 
             (username, password))
    user = c.fetchone()
    conn.close()

    if user:
        session['user_id'] = user[0]
        session['username'] = user[1]
        return jsonify({
            'message': 'Login successful',
            'user_id': user[0],
            'username': user[1]
        })

    return jsonify({'error': 'Invalid credentials'}), 401

@auth_bp.route('/auth/logout', methods=['POST'])  # Remove /api prefix
def logout():
    session.clear()
    return jsonify({'message': 'Logged out successfully'})

@auth_bp.route('/auth/check', methods=['GET'])  # Remove /api prefix
def check_auth():
    if 'user_id' in session:
        return jsonify({
            'authenticated': True,
            'user_id': session['user_id'],
            'username': session['username']
        })
    return jsonify({'authenticated': False}), 401