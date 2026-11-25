#!/bin/bash

# Run tests inside the Docker container with coverage report
# Usage: ./run_tests.sh [pytest args]
# Example: ./run_tests.sh -v
# Example: ./run_tests.sh tests/test_auth.py

CONTAINER_NAME="doksights_api"

# Check if container is running
if ! docker ps --format "{{.Names}}" | grep -q "^${CONTAINER_NAME}$"; then
    echo "Error: Container '${CONTAINER_NAME}' is not running."
    echo "Start it first with: ./run_docker.sh"
    exit 1
fi

# Install pytest-cov if not already installed (silent)
docker exec "${CONTAINER_NAME}" pip install -q pytest-cov 2>/dev/null

# Run pytest with coverage
echo "Running tests with coverage..."
echo "=============================================="

if [ $# -eq 0 ]; then
    # No arguments: run all tests with coverage
    docker exec "${CONTAINER_NAME}" pytest --cov=app --cov-report=term-missing -v
else
    # Pass through any arguments
    docker exec "${CONTAINER_NAME}" pytest "$@"
fi

EXIT_CODE=$?

echo "=============================================="
if [ $EXIT_CODE -eq 0 ]; then
    echo "✅ All tests passed!"
else
    echo "❌ Some tests failed (exit code: $EXIT_CODE)"
fi

exit $EXIT_CODE
