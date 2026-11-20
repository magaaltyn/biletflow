// Vercel entry point: serves the API compiled by `npm run vercel-build` (dist/).
// Locally and in Docker the API starts with `npm run dev` / `npm start` instead.
export { default } from "./dist/index.js";
