#!/bin/bash
COLOR_BLUE='\033[1;34m'
NOCOLOR='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -W 2>/dev/null || pwd)"

TAG=latest
if [[ $# > 0 ]]; then
    TAG=$1  
fi

echo -e "${COLOR_BLUE}Building docker 'DokSights Frontend' image as $TAG${NOCOLOR}"
MSYS_NO_PATHCONV=1 docker build -t doksights_frontend:$TAG "${SCRIPT_DIR}"
