# BiletFlow website

Next.js website for BiletFlow. Requests to `/api/*` are forwarded to the API.

## Run locally

```bash
npm install
npm run dev
```

## Deployment

The Vercel project `biletflow` is connected to this repository (root directory `frontend/`).
Every push to `main` that changes this folder is deployed to https://biletflow-kz.vercel.app.
Pushes to other branches get a preview address.
