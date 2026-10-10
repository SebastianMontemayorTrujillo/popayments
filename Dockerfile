FROM node:22.23.2-bookworm-slim

ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --include=dev

COPY . .
RUN npm run build && chown -R node:node /app

USER node
EXPOSE 3000
CMD ["npm", "run", "start"]
