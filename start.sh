#!/bin/bash
# Start Ollama service in background
ollama serve &

# Wait for Ollama service to boot up
echo "Waiting for Ollama service to initialize..."
sleep 5

# Pull the lightweight model (phi3:mini or tinyllama)
echo "Pulling Ollama model phi3:mini..."
ollama pull phi3:mini

# Start Flask App
echo "Starting AI Study Assistant Application..."
exec python app.py
