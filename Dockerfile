FROM node:24.12.0-alpine
WORKDIR /app
RUN apk add --no-cache tar
COPY assetmanager_backend/package*.json ./assetmanager_backend/
RUN cd assetmanager_backend && npm ci --omit=dev
COPY assetmanager_backend/server.js assetmanager_backend/restore.js assetmanager_backend/import-legacy.js ./assetmanager_backend/
COPY assetmanager_frontend ./assetmanager_frontend
ENV NODE_ENV=production DATA_DIR=/data PORT=4030
VOLUME /data
EXPOSE 4030
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD node -e "fetch('http://127.0.0.1:4030/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "assetmanager_backend/server.js"]
