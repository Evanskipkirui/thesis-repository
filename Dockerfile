FROM node:20.11.0-alpine

WORKDIR /app

COPY package*.json ./

RUN npm install --production

COPY . .

EXPOSE 3333

CMD ["node", "server/server.js"]
