FROM node:22-bookworm-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
RUN mkdir -p /app/data && chown -R node:node /app
ENV NODE_ENV=production PORT=3000 DATABASE_FILE=/app/data/ubru.sqlite
USER node
EXPOSE 3000
CMD ["node", "server.js"]
