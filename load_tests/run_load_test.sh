#!/bin/bash

# Configurable Load Testing Script for DokSights
# Usage: ./run_load_test.sh [options]
# Options:
#   -u, --users        Number of concurrent users (default: 10)
#   -s, --spawn        Users spawned per second (default: 1)
#   -t, --time         Test duration (e.g., 5m, 1h) (default: none, manual stop)
#   -h, --host         Target backend URL (default: http://host.docker.internal:8000)
#   --headless         Run without web UI (default: false)

# Defaults
USERS=10
SPAWN=1
TIME=""
HOST="http://host.docker.internal:8000"
HEADLESS=false
IMAGE_NAME="doksights_load_test"

# Get current directory absolute path (Windows-friendly)
LOAD_TEST_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -W)"

# Simple arg parsing
while [[ $# -gt 0 ]]; do
  case $1 in
    -u|--users)
      USERS="$2"
      shift 2
      ;;
    -s|--spawn)
      SPAWN="$2"
      shift 2
      ;;
    -t|--time)
      TIME="$2"
      shift 2
      ;;
    -h|--host)
      HOST="$2"
      shift 2
      ;;
    --headless)
      HEADLESS=true
      shift
      ;;
    *)
      echo "Unknown option $1"
      exit 1
      ;;
  esac
done

# Build the load test image
echo "Building Docker image ${IMAGE_NAME}..."
docker build -t "$IMAGE_NAME" "$LOAD_TEST_DIR"

# Construct the locust command
LOCUST_OPTS="-u $USERS -r $SPAWN -H $HOST"

if [ -n "$TIME" ]; then
  LOCUST_OPTS="$LOCUST_OPTS -t $TIME"
fi

if [ "$HEADLESS" = true ]; then
  LOCUST_OPTS="$LOCUST_OPTS --headless"
  echo "Running in HEADLESS mode: $USERS users, $SPAWN spawn-rate, duration: ${TIME:-indefinite}"
else
  echo "Running with Web UI on http://localhost:8089"
  echo "Target Host: $HOST"
  # Port forward for the web UI
  PORT_MAP="-p 8089:8089"
fi

# Run the container
# MSYS_NO_PATHCONV=1 prevents Git Bash from mangling Windows paths for Docker
MSYS_NO_PATHCONV=1 docker run --rm -it \
    $PORT_MAP \
    --name load_tester \
    "$IMAGE_NAME" \
    $LOCUST_OPTS
