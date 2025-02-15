import requests
import subprocess
import os
import time
from datetime import datetime
import sys
import whisper
import threading
import sqlite3

# A global lock to help with any directory access if needed
directory_lock = threading.Lock()

def get_station(stream_search_url, params):
    response = requests.get(stream_search_url, params=params)
    print(response)
    stations = response.json() 
    stream_station = stations[0]["url"]
    return stream_station

def record_stream(audio_store, stream_url, duration="120"):
    """
    Continuously stream audio from the given URL.
    Each segment is 'duration' seconds long.
    Files are saved in the audio_store directory with unique timestamped filenames.
    """
    try:
        while True:
            # Create a unique filename based on the current timestamp
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            output_file = os.path.join(audio_store, f"output_{timestamp}.wav")

            # Build the FFmpeg command
            ffmpeg_command = [
                'ffmpeg',
                '-i', stream_url,    # Input stream URL
                '-t', duration,      # Duration of the segment in seconds
                '-c', 'copy',        # Copy the stream without re-encoding
                output_file
            ]

            subprocess.run(ffmpeg_command, text=True)
    except KeyboardInterrupt:
        print("User pressed Ctrl+C. Exiting continuous stream.")
        sys.exit(0)
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)

def transcribe_stream(audio_store, stream_name, model, segment_duration):
    """
    Continuously looks for the earliest audio file in 'audio_store', transcribes it using Whisper,
    and writes the transcription (with timestamps for each segment) to a text file.
    """
    try:
        conn = sqlite3.connect("../backend/transcriptions.db")
        db = conn.cursor()

        while True:
            # List all .wav files in the audio_store
            with directory_lock:
                files = [f for f in os.listdir(audio_store) if f.endswith('.wav')]
            
            if not files:
                time.sleep(1)
                continue

            # Sort files by filename (which embeds the timestamp) to get the earliest one
            files.sort()
            earliest_file = files[0]
            full_path = os.path.join(audio_store, earliest_file)

            # Check that the file is not "fresh" (i.e. still being written)
            if time.time() - os.path.getmtime(full_path) < int(segment_duration):
                # File is too new; wait a little and try again
                time.sleep(5)
                continue

            print(f"Transcribing {full_path} ...")
            result = model.transcribe(full_path)

            # Create a transcription text file with the same base filename
            start_time = time.time()
            for segment in result.get("segments", []):
                start_sec = segment["start"]
                text = segment["text"].strip()
                # Format seconds to HH:MM:SS
                cur_time = start_time + start_sec 
                start_time_str = time.strftime('%H:%M:%S', time.gmtime(cur_time))
                db.execute("""
                INSERT INTO transcriptions (radio_stream, start_time, text)
                VALUES (?, ?, ?)
                """, (stream_name, start_time_str, text))
                conn.commit()

            # After processing, remove the audio file
            with directory_lock:
                os.remove(full_path)

    except KeyboardInterrupt:
        print("User pressed Ctrl+C. Exiting continuous transcription.")
        sys.exit(0) 
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)

def init_stream_process(stream_name, stream_url, model):
    """
    Initialize the recording and transcription threads for a given stream.
    """
    audio_store = f"audio_store/{stream_name}"
    segment_duration = "120"

    if not os.path.exists(audio_store):
        os.makedirs(audio_store)

    # Create threads for recording and transcribing streams.
    # Running them as daemon threads allows the program to exit cleanly.
    record_thread = threading.Thread(
        target=record_stream, 
        args=(audio_store, stream_url, segment_duration),
        daemon=True
    )
    transcribe_thread = threading.Thread(
        target=transcribe_stream, 
        args=(audio_store, stream_name, model, segment_duration),
        daemon=True
    )

    record_thread.start()
    transcribe_thread.start()

    # Keep the main thread running as long as the child threads are active
    record_thread.join()
    transcribe_thread.join()

if __name__ == "__main__":
    MODEL_TYPE = "base"
    model = whisper.load_model(MODEL_TYPE)

    # create SQLite database if it doesn't exist
    db_file = "../backend/transcriptions.db"
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

    # stream_search_url = "https://de1.api.radio-browser.info/json/stations"
    stream_url = "https://tunein.cdnstream1.com/2868_96.mp3"
    stream_name = "CNN" 

    init_stream_process(stream_name, stream_url, model)