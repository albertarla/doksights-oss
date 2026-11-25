#!/bin/bash

# Run tests with coverage inside the Docker container
# Usage: ./run_coverage.sh

CONTAINER_NAME="doksights_frontend"

# Check if container is running
if ! docker ps --format "{{.Names}}" | grep -q "^${CONTAINER_NAME}$"; then
    echo "Error: Container '${CONTAINER_NAME}' is not running."
    echo "Start it first with: ./run_docker.sh"
    exit 1
fi

echo "Running frontend tests with coverage inside Docker..."
echo "=============================================="

docker exec -it "${CONTAINER_NAME}" npm run test:coverage

EXIT_CODE=$?

echo "=============================================="
if [ $EXIT_CODE -eq 0 ]; then
    echo "✅ Coverage report generated!"
    echo "   Open: frontend/coverage/index.html"
else
    echo "❌ Coverage run failed (exit code: $EXIT_CODE)"
fi

exit $EXIT_CODE
