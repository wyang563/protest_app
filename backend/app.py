from flask import Flask, request, jsonify
from flask_cors import CORS, cross_origin
import whisper
import os
from routes import routes_bp
from auth import auth_bp, init_auth_db
import sqlite3
from transformers import pipeline
from sentence_transformers import SentenceTransformer, util  # New import
from datetime import timedelta

app = Flask(__name__) # here

CORS(app,
    resources={
        r"/api/*": {
            "origins": ["https://protest.morelos.dev", "http://localhost:3000"],
            "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
            "allow_headers": ["Content-Type", "Authorization"],
            "supports_credentials": True,
            "expose_headers": ["Set-Cookie"]
        }
    },
    supports_credentials=True
)


# Basic session config without security
app.config.update(
    SECRET_KEY=os.environ.get('SECRET_KEY', 'dev-key-change-this'),
    SESSION_COOKIE_SECURE=True,
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE='Lax',
    SESSION_COOKIE_DOMAIN='protest.morelos.dev',  # Update for production
    PERMANENT_SESSION_LIFETIME=timedelta(days=7),
    SESSION_COOKIE_NAME='protest_session'
)

app.register_blueprint(auth_bp)  # Was: url_prefix='/api'
app.register_blueprint(routes_bp)  # Was: url_prefix='/api'

init_auth_db()

# Load the Whisper model once at startup to avoid reloading on every request.
# You can choose a model size: tiny, base, small, medium, large.
MODEL_TYPE = "base"
model = whisper.load_model(MODEL_TYPE)
classifier = pipeline("text-classification", model="martin-ha/toxic-comment-model", device=-1)
embedding_model = SentenceTransformer("all-MiniLM-L6-v2")

# Load the DistilBERT model once at startup to avoid reloading on every request.
@app.route('/sentiment_analysis', methods=['GET'])
@cross_origin(origin="https://protest.morelos.dev")
def sentiment_analysis():
    """
    Run the sentiment analysis model, then compute sentence embeddings for the 
    returned label using BERT (SentenceTransformers) and compare it to standard 
    candidate labels to output the one most similar.
    """
    text = request.args.get('text')
    if not text:
        return jsonify({"error": "Missing text parameter for input to ML model"}), 400

    # Run the sentiment analysis classifier
    result = classifier(text)[0]
    if not result:
        return jsonify({"error": "Failed to classify text"}), 500
    api_label = result.get("label", "")
    api_score = result.get("score", 0)

    # Define candidate labels
    candidate_labels = ["need supplies", "fleeing", "medical emergency", "advancing"]

    # Compute embeddings using the SentenceTransformer model
    api_embedding = embedding_model.encode(api_label, convert_to_tensor=True)
    candidate_embeddings = embedding_model.encode(candidate_labels, convert_to_tensor=True)

    # Compute cosine similarity scores and pick the best matching candidate
    cosine_scores = util.cos_sim(api_embedding, candidate_embeddings)
    best_idx = int(cosine_scores.argmax())
    best_candidate = candidate_labels[best_idx]
    
    # Optionally, include the similarity score (confidence) if desired:
    similarity_confidence = cosine_scores[0][best_idx].item()

    # Return the best matching candidate along with the original confidence score from the classifier
    return jsonify({
        "label": best_candidate,
        "score": api_score,
        "similarity_confidence": similarity_confidence
    })

@app.route('/query', methods=['GET'])
@cross_origin(origin="https://protest.morelos.dev")
def query_transcriptions_db():
    """
    SQL Query the transcriptions database for all transcriptions.
    """ 
    # Retrieve the SQL query from the GET request parameters
    sql_query = request.args.get('query')
    if not sql_query:
        return jsonify({"error": "Missing query parameter"}), 400

    # Define the path to the SQLite database file
    # Adjust this path as necessary to point to your transcriptions.db
    db_file = os.path.join("backend", "transcriptions.db")
    
    try:
        # Connect to the SQLite database
        conn = sqlite3.connect(db_file)
        cursor = conn.cursor()

        # Execute the query (WARNING: In production, never execute unsanitized SQL)
        cursor.execute(sql_query)
        rows = cursor.fetchall()

        # Retrieve column names for building dict results
        col_names = [description[0] for description in cursor.description]

        # Convert each row to a dictionary keyed by column name
        results = [dict(zip(col_names, row)) for row in rows]

        # Close the connection
        conn.close()

        # Return the results as JSON
        return jsonify(results)

    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/range_transcriptions', methods=['GET'])
@cross_origin(origin="https://protest.morelos.dev")
def get_transcriptions():
    """
    Example endpoint to get transcriptions filtered by:
      - radio_stream
      - optional start_time (YYYY-MM-DDTHH:MM)
      - optional end_time   (YYYY-MM-DDTHH:MM)
    """
    db_file = os.path.join("backend", "transcriptions.db")

    # Query parameters from the request
    radio_stream = request.args.get('radio_stream')
    start_time   = request.args.get('start_time')  # expects e.g. "2023-09-01T10:00"
    end_time     = request.args.get('end_time')    # expects e.g. "2023-09-02T09:59"

    # Basic validation
    if not radio_stream:
        return jsonify({"error": "Missing radio_stream"}), 400

    try:
        conn = sqlite3.connect(db_file)
        cursor = conn.cursor()

        # Build a base query
        sql = "SELECT * FROM transcriptions WHERE radio_stream = ?"
        params = [radio_stream]

        # If start_time is provided, filter by start_time
        if start_time:
            sql += " AND start_time >= ?"
            params.append(start_time)

        # If end_time is provided, filter by end_time
        if end_time:
            sql += " AND start_time <= ?"
            params.append(end_time)

        sql += " ORDER BY id DESC"
        # Finally, run
        cursor.execute(sql, params)
        rows = cursor.fetchall()
        col_names = [desc[0] for desc in cursor.description]
        conn.close()

        results = [dict(zip(col_names, row)) for row in rows]
        return jsonify(results)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/transcribe', methods=['POST'])
@cross_origin(origin="https://protest.morelos.dev")
def transcribe_audio():
    """
    Expects an audio file in the POST request, e.g., form-data with a field "audio_file".
    Example: fetch('http://localhost:5000/api/transcribe', { method: 'POST', body: FormData(...)})
    """
    # 1. Ensure an audio file was provided
    if 'audio_file' not in request.files:
        return jsonify({"error": "No audio file found"}), 400

    audio_file = request.files['audio_file']

    # 2. Optionally save the file temporarily if needed (or process in-memory)
    #    Below, we save to a temporary path. Adjust as necessary.
    temp_path = "../test.wav"
    audio_file.save(temp_path)

    # 3. Transcribe using Whisper
    #    Note: If your audio is not in English, set language="xx" or use detect_language=True
    result = model.transcribe(temp_path)
    text = result["text"]

    # 4. Clean up temp file if desired
    os.remove(temp_path)

    # 5. Return the transcription
    return jsonify({"transcription": text})

def init_transcription_db():
    # Create database if it doesn't already exist
    db_file = os.path.join("backend", "transcriptions.db")
    conn = sqlite3.connect(db_file)
    cursor = conn.cursor()
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS transcriptions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        radio_stream TEXT,
        start_time TEXT,
        text TEXT
        )
    """)
    conn.commit()

if __name__ == '__main__':
    # Run on port 5000 so React (port 3000) can access it
    app.run(host='0.0.0.0', port=5001, debug=True)
