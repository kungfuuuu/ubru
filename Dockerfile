FROM node:22-bookworm-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY db.js server.js index.html script.js styles.css ./
COPY assets ./assets
COPY scripts ./scripts
RUN mkdir -p /app/data && chown -R node:node /app
ENV NODE_ENV=production PORT=3000 HOST=0.0.0.0 DATABASE_FILE=/app/data/ubru.sqlite
USER node
EXPOSE 3000
CMD ["node", "server.js"]
