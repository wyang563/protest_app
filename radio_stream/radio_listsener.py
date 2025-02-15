import requests
import subprocess
import os
import time
from datetime import datetime
import sys

def get_station(stream_search_url, params):
    response = requests.get(stream_search_url, params=params)
    stations = response.json() 
    stream_station = stations[0]["url"]
    return stream_station

def transcribe_stream(audio_store, search_params, stream_search_url, duration="120"):
    """
    Continuously stream audio from the given URL.
    Each segment is 'duration' seconds long.
    Files are saved in the audio_store directory with unique timestamped filenames.
    """
    stream_url = get_station(stream_search_url, search_params)
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

if __name__ == "__main__":
    # load the radio station
    params = {
        'countrycode': 'US',  # Adjust the country code as needed
        'limit': 10           # Limit the results to 10 stations
    }
    stream_url = get_station(params)
    transcribe_stream(stream_url, duration="120")