# Use Python 3.12 slim image (mediapipe ships 3.12 wheels since 0.10.9)
FROM python:3.12-slim-bookworm

# Set working directory
WORKDIR /app

# Install system dependencies for OpenCV and MediaPipe
# libgles2-mesa is required by MediaPipe FaceLandmarker (libGLESv2.so.2)
# libegl1 is its EGL companion, also pulled in by mediapipe's GL stack
RUN apt-get update && apt-get install -y \
    libgl1 \
    libgles2-mesa \
    libegl1 \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the service code
COPY . .

# Expose the WebSocket port
EXPOSE 8765

# Start the WebSocket server
CMD ["uvicorn", "ws_server:app", "--host", "0.0.0.0", "--port", "8765"]
