# One container serves the API and the built web app (same origin, so session cookies are first-party).
FROM node:22-slim AS build
WORKDIR /app
COPY client/package*.json client/
RUN npm ci --prefix client
COPY server/package*.json server/
RUN npm ci --prefix server
COPY client client
COPY server server
RUN npm run build --prefix client && npm run build --prefix server

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production PORT=4000
COPY server/package*.json server/
RUN npm ci --omit=dev --prefix server
COPY --from=build /app/server/dist server/dist
COPY --from=build /app/client/dist client/dist
USER node
EXPOSE 4000
CMD ["node", "server/dist/index.js"]
