# BiletFlow API

Express + TypeScript REST API with PostgreSQL.

## Run locally

```bash
npm install
npm run build
npm run migrate
npm run seed
npm run dev
```

## Deployment

The Vercel project `biletflow-api` is connected to this repository (root directory `api/`).
Every push to `main` that changes this folder is deployed to https://biletflow-api-three.vercel.app.
The build also applies database migrations, so pushes to other branches are not built.
