FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=production

COPY package.json ./
COPY index.html app.js styles.css refinement.css favicon.svg app.config.ts manus-routes.json ./
COPY server.mjs ./
COPY assets ./assets
COPY data ./data

EXPOSE 3000
CMD ["node", "server.mjs"]
