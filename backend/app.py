from flask import Flask, request, jsonify
from flask_cors import CORS, cross_origin
import whisper
import os
from routes import bp

app = Flask(__name__)
CORS(app, origins=["https://protest.morelos.dev", "http://localhost:3000"])

app.register_blueprint(bp)

# Load the Whisper model once at startup to avoid reloading on every request.
# You can choose a model size: tiny, base, small, medium, large.
MODEL_TYPE = "base"
model = whisper.load_model(MODEL_TYPE)

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
    app.run(host='0.0.0.0', port=5001, debug=True)
