#!/bin/bash
echo "Starting AI Study Assistant Application with Gunicorn..."
exec gunicorn --bind 0.0.0.0:${PORT:-5000} --workers 2 --timeout 300 app:app
