FROM node:20-alpine

WORKDIR /app

COPY package.json ./
COPY src ./src

# Keep runtime data outside image layer for persistence/mounting.
RUN mkdir -p /app/data

ENV NODE_ENV=production

CMD ["npm", "start"]
