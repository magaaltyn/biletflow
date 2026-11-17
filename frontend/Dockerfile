FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build
EXPOSE 5173
# vite preview serves the production build and proxies /api and /media to the backend container
CMD ["npm", "run", "preview"]
