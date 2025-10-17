# Base image
FROM node:20-bullseye

# Install runtime deps: Chromium + ffmpeg for wwebjs sticker/video
RUN apt-get update   && apt-get install -y --no-install-recommends      chromium      fonts-noto-color-emoji      ffmpeg      ca-certificates      git   && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Workdir
WORKDIR /app

# Install deps
COPY package.json package-lock.json* ./
RUN npm ci --only=production || npm i --production

# Copy source
COPY prisma ./prisma
COPY src ./src

# Create persistent auth dir
RUN mkdir -p /app/.wwebjs_auth
VOLUME ["/app/.wwebjs_auth"]

# Port
EXPOSE 3000

CMD ["npm", "start"]
