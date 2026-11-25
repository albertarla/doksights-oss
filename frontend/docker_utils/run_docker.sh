#!/bin/bash

# Get the frontend directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -W 2>/dev/null || pwd)"
FRONTEND_DIR="$(cd "${SCRIPT_DIR}/.." && pwd -W 2>/dev/null || pwd)"

# Clean node_modules cache if any weird issues
# find "$FRONTEND_DIR" -name "node_modules" -type d -exec rm -rf {} + 2>/dev/null || true

# Run the React application
# Volume maps local frontend -> /frontend in container
# --volume="/frontend/node_modules" prevents the host's Windows node_modules from overwriting the container's Linux-compiled modules
MSYS_NO_PATHCONV=1 docker run --rm -it \
    --volume="${FRONTEND_DIR}:/frontend:rw" \
    --volume="${FRONTEND_DIR}/../.env:/frontend/.env:ro" \
    --volume="/frontend/node_modules" \
    --privileged \
    -p 8080:8080 \
    --name doksights_frontend \
    doksights_frontend:latest
