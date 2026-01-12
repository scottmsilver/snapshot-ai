# Python API server Dockerfile for Fly.io
FROM python:3.11-slim

WORKDIR /app

# Install system dependencies for opencv-python-headless
RUN apt-get update && apt-get install -y --no-install-recommends \
    libglib2.0-0 \
    libgl1 \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Pre-download LPIPS AlexNet model weights during build
# This prevents a ~90 second download delay on first API request
RUN python -c "import lpips; lpips.LPIPS(net='alex')"

# Copy application code
COPY . .

# Expose port
EXPOSE 8000

# Run the application
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
