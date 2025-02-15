from flask import Flask, request, jsonify
from flask_cors import CORS
import whisper
import os
from routes import bp

app = Flask(__name__)
CORS(app)  # Allow cross-origin requests for local dev, if needed

app.register_blueprint(bp)

# Load the Whisper model once at startup to avoid reloading on every request.
# You can choose a model size: tiny, base, small, medium, large.
model = whisper.load_model("tiny")

@app.route('/api/transcribe', methods=['POST'])
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
    app.run(host='0.0.0.0', port=5000, debug=True)
