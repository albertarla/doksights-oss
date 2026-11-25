#!/bin/bash

# Get the backend directory (parent of docker_utils)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -W)"
BACKEND_DIR="$(cd "${SCRIPT_DIR}/.." && pwd -W)"

# Clean __pycache__ to prevent Windows/Linux compatibility issues with volume mounts
find "$BACKEND_DIR" -name "__pycache__" -type d -exec rm -rf {} + 2>/dev/null || true

# Run the FastAPI application
# Volume maps local backend -> /backend in container
# Uses Dockerfile CMD: uvicorn app.main:app ... --reload
# MSYS_NO_PATHCONV=1 prevents Git Bash from mangling the path for Docker
MSYS_NO_PATHCONV=1 docker run --rm -it \
    --volume="${BACKEND_DIR}:/backend:rw" \
    --env-file="${BACKEND_DIR}/../.env" \
    -e PYTHONDONTWRITEBYTECODE=1 \
    --privileged \
    -p 8000:8000 \
    --name doksights_api \
    doksights_api:latest