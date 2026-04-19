FROM python:3.12-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements
COPY requirements.txt ./

# Install dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy source code
COPY . .

# Expose port (as per index.ts proxy)
EXPOSE 8001

# Start the service
CMD ["uvicorn", "api:app", "--host", "0.0.0.0", "--port", "8001"]
