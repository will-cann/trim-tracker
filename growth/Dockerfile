# Build context is the REPO ROOT (growth imports ../shared). Railway: leave the
# service Root Directory empty and set the config file path to growth/railway.json.
FROM node:22-slim
WORKDIR /app
COPY shared/ shared/
COPY growth/package.json growth/package-lock.json growth/
RUN cd growth && npm ci --omit=dev
COPY growth/ growth/
WORKDIR /app/growth
ENV NODE_ENV=production
CMD ["npm", "start"]
