import requests
import subprocess
import os
import time
from datetime import datetime

def stream_audio_continuous(stream_url, duration="120"):
    """
    Continuously stream audio from a given URL.
    Each audio segment is 'duration' seconds long.
    Audio files are saved in the 'audio_store' directory with unique timestamped filenames.
    """
    # Ensure the audio_store directory exists
    os.makedirs("audio_store", exist_ok=True)

    while True:
        # Generate a timestamped filename to avoid overwriting
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        output_file = os.path.join("audio_store", f"output_{timestamp}.wav")
        print(f"Recording to {output_file} for {duration} seconds...")

        # Build the FFmpeg command to capture the stream
        ffmpeg_command = [
            'ffmpeg',
            '-i', stream_url,      # Input stream URL
            '-t', duration,        # Duration for each segment (in seconds)
            '-c', 'copy',          # Copy the audio stream without re-encoding
            output_file
        ]

        try:
            subprocess.run(ffmpeg_command, text=True)
        except Exception as e:
            print(f"Error during streaming: {e}")
            # Wait a few seconds before trying again to avoid rapid looping
            time.sleep(5)

def get_station(params):
    api_url = "https://de1.api.radio-browser.info/json/stations"
    response = requests.get(api_url, params=params)
    stations = response.json() 
    stream_station = stations[1]["url"]
    return stream_station

if __name__ == "__main__":
    # load the radio station
    params = {
        'countrycode': 'US',  # Adjust the country code as needed
        'limit': 10           # Limit the results to 10 stations
    }
    stream_url = get_station(params)
    stream_audio_continuous(stream_url, duration="120")