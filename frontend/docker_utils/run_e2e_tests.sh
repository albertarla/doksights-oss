#!/bin/bash

# Run E2E tests inside the Docker container
# Usage: ./run_e2e_tests.sh [playwright args]

CONTAINER_NAME="doksights_frontend"

# Check if container is running
if ! docker ps --format "{{.Names}}" | grep -q "^${CONTAINER_NAME}$"; then
    echo "Error: Container '${CONTAINER_NAME}' is not running."
    echo "Start it first with: ./run_docker.sh"
    exit 1
fi

echo "Running frontend E2E tests inside Docker..."
echo "=============================================="

if [ $# -eq 0 ]; then
    # No arguments
    docker exec -it "${CONTAINER_NAME}" npm run test:e2e
else
    # Pass through any arguments
    docker exec -it "${CONTAINER_NAME}" npm run test:e2e -- "$@"
fi

EXIT_CODE=$?

echo "=============================================="
if [ $EXIT_CODE -eq 0 ]; then
    echo "✅ All E2E tests passed!"
else
    echo "❌ Some E2E tests failed (exit code: $EXIT_CODE)"
fi

exit $EXIT_CODE
