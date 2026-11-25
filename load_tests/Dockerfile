FROM python:3.11-slim

# Set working directory
WORKDIR /mnt/locust

# Install Locust
RUN pip install --no-cache-dir locust

# Copy the locustfile
COPY locustfile.py .

# Expose the web UI port
EXPOSE 8089

# Default command: run locust pointing to the current file
ENTRYPOINT ["locust", "-f", "locustfile.py"]
