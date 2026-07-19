FROM node:20-alpine

WORKDIR /app

# Copy package files first for layer caching
COPY package.json package-lock.json* ./
RUN npm install

# Copy application code
COPY . .

EXPOSE 3000

# Run in development mode
CMD ["npm", "run", "dev"]
