# BiletFlow Backend

Node.js + TypeScript + Express + Prisma (PostgreSQL).

## Stack decisions

- **Express** over Fastify: SRS section 9 lists it as the primary suggested option, and it keeps
  onboarding friction low across a larger team with mixed experience.
- **Prisma** over Knex: schema-first models, generated TypeScript types, and versioned
  `prisma migrate` migrations make it easier for two backend teams to evolve the shared data
  model (`prisma/schema.prisma`) without stepping on each other.

## Folder structure

```
src/
  config/       env loading, Prisma client singleton
  middleware/   error handler, 404 handler
  modules/
    auth/       registration, login, sessions (stub)
    events/     event CRUD (GET / list is wired up as a working example)
    tickets/    ticket types, inventory (stub)
    orders/     checkout, orders, refunds (stub)
  app.ts        Express app wiring
  server.ts     entrypoint
prisma/
  schema.prisma           User + Event models (SRS section 6)
  migrations/              versioned SQL migrations
```

Each module follows `<module>.routes.ts` (+ `.service.ts` once there's real logic). Stub routes
return `501 Not Implemented` so the shape of the API surface is visible from day one; replace
them in place rather than restructuring.

Entities beyond `User`/`Event` (Venue, Seat, TicketType, Order, Ticket, Payment, ...) belong to
the module that implements them and should be added to `schema.prisma` as their own migration.

## Running locally with Docker (recommended)

From the repo root:

```bash
cp .env.example .env
cp backend/.env.example backend/.env
docker compose up --build
```

This starts Postgres and the backend (with `prisma migrate deploy` run automatically), API on
`http://localhost:4000`. Check `GET /health` and `GET /api/v1/events`.

## Running locally without Docker

Requires Node.js 20+ and a running PostgreSQL instance.

```bash
cd backend
cp .env.example .env   # adjust DATABASE_URL if needed
npm install
npm run prisma:migrate # applies migrations, generates the Prisma client
npm run dev
```

## Useful scripts

- `npm run dev` — dev server with hot reload
- `npm run build` / `npm start` — production build and run
- `npm run prisma:migrate` — create/apply a migration in dev (`prisma migrate dev`)
- `npm run prisma:deploy` — apply existing migrations without prompting (CI/Docker)
- `npm run prisma:studio` — browse the database in a GUI
