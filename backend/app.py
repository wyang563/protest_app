from flask import Flask, request, jsonify
from flask_cors import CORS, cross_origin
import whisper
import os
from routes import bp
import sqlite3

app = Flask(__name__)
CORS(app, origins=["https://protest.morelos.dev", "http://localhost:3000"])

app.register_blueprint(bp)

# Load the Whisper model once at startup to avoid reloading on every request.
# You can choose a model size: tiny, base, small, medium, large.
MODEL_TYPE = "base"
model = whisper.load_model(MODEL_TYPE)

@app.route('/api/query', methods=['GET'])
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
    # db_file = os.path.join("backend", "transcriptions.db")
    db_file = "transcriptions.db"
    
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

@app.route('/api/transcribe', methods=['POST'])
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

if __name__ == '__main__':
    # Run on port 5000 so React (port 3000) can access it
    app.run(host='0.0.0.0', port=5001, debug=True)
