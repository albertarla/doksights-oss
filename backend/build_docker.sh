#!/bin/bash 
COLOR_BLUE='\033[1;34m'
NOCOLOR='\033[0m'

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"


TAG=latest
if [[ $# > 0 ]]; then
    TAG=$1  
fi

ARCH=amd64
# if [[ $(uname -m) == "aarch64" ]]; then
#     ARCH=arm64
# fi

if [[ $ARCH == "amd64" ]]; then
    echo "Building docker 'DokSights Python API' image for 'x86_64' as $TAG"
    docker build -t doksights_api:$TAG --build-arg NUM_THREADS=8 --build-arg TAG=$TAG .
fi
# if [[ $ARCH == "arm64" ]]; then
#     echo "Building docker 'DokSights Python API' image for 'arm64' as $TAG-arm64"
#     docker build -t DokSightsPythonAPI:$TAG-arm64 -f Dockerfile.arm  --build-arg TAG=$TAG --build-arg NUM_THREADS=8 .
# fi

# docker image tag smart_manuals_python_api:$TAG-$ARCH smart_manuals_python_api:$TAG