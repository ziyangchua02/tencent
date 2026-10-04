# One container: the API plus the built web app on port 8080. Keep /app/data on a volume.
FROM node:22-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && mkdir -p data && chown node data
USER node
EXPOSE 8080
CMD ["node", "server/main.ts"]
