FROM python:3.10-slim

# Install system utilities & curl for Ollama
RUN apt-get update && apt-get install -y \
    curl \
    git \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

# Install Ollama binary
RUN curl -fsSL https://ollama.com/install.sh | sh

# Set working directory
WORKDIR /app

# Copy requirements and install python packages
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy repository code
COPY . .

# Grant execution rights to start script
RUN chmod +x start.sh

# Expose default Flask port
EXPOSE 5000

# Run entry script
CMD ["./start.sh"]
