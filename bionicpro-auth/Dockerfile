# Build stage
FROM node:22-alpine

# Set working directory
WORKDIR /app

# Download dependencies
COPY package*.json ./
RUN npm install

# Copy the source code
COPY . .

# Run the application
CMD ["node", "src/index.js"]
