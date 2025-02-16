#!/bin/bash

# Set up Python virtual environment
python3.10 -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Start Flask app in the background
python backend/app.py &
