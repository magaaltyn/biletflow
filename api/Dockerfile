FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY migrations ./migrations
COPY assets ./assets
EXPOSE 4000
# Apply migrations, load demo data once (skipped if data exists), then serve the API.
CMD ["sh", "-c", "npm run migrate && npm run seed && npm start"]
