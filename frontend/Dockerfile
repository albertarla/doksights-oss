FROM node:20-bookworm

WORKDIR /frontend

# Copy package files
COPY package.json package-lock.json ./

# Install dependencies (will include Playwright later)
RUN npm install

# Download and install Playwright browsers and dependencies
RUN npx playwright install --with-deps chromium

# Copy application files
COPY . .

# Expose Vite's default port
EXPOSE 8080

# Command to run the dev server
CMD ["npm", "run", "dev"]
