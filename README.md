# Calendar Subscription Hub

A self-hosted web application that aggregates calendar data from external providers and exposes them as standard iCalendar (`.ics`) feeds — ready to subscribe to from any calendar app (Google Calendar, Apple Calendar, Outlook, etc.).

This is the official open-source frontend and backend for [asismetro-automations](https://github.com/Ismola/asismetro-automations), a project that automates schedule retrieval from Asismetro and makes it available as a subscribable calendar feed.

**Public instance:** [calendar-subscription-hub.ismola.dev](https://calendar-subscription-hub.ismola.dev)

## Features

- **Provider integrations** — fetch schedules from third-party services (e.g. Asismetro) and convert them to iCal format
- **Per-user subscriptions** — each user manages their own set of calendar subscriptions
- **Background sync** — a BullMQ worker refreshes subscriptions on a configurable schedule
- **Shareable iCal URLs** — each subscription generates a stable public URL that any calendar client can poll
- **Session-based auth** — register, log in, and manage subscriptions through a dashboard

## Demo

### Asismetro Automation

https://github.com/user-attachments/assets/4716658d-8547-4c46-87fd-c2d0dfc50b83

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) |
| Database | PostgreSQL + Prisma |
| Queue / Cache | Redis + BullMQ |
| Auth | Session tokens (jose + bcryptjs) |
| Styling | Tailwind CSS v4 |
| Runtime | Node.js 22 |

## Prerequisites

- Node.js ≥ 22
- PostgreSQL 16
- Redis 7
- Docker & Docker Compose (for the easy setup)

## Quick Start (Docker)

1. **Copy and fill in the environment file:**

   ```bash
   cp .env.example .env
   ```

   | Variable | Description | Required |
   |---|---|---|
   | `DATABASE_URL` | PostgreSQL connection string | Yes |
   | `DATABASE_URL_DOCKER` | PostgreSQL URL used by containers in Docker Compose | No (default: compose internal postgres service) |
   | `DIRECT_DATABASE_URL` | Direct PostgreSQL URL (for migrations) | Yes |
   | `REDIS_URL` | Redis connection string | No (default: `redis://redis:6379`) |
   | `REDIS_URL_DOCKER` | Redis URL used by containers in Docker Compose | No (default: `redis://redis:6379`) |
   | `APP_BASE_URL` | Public URL of the app | Yes |
   | `ASISMETRO_API_BASE_URL` | Base URL for Asismetro Automations API | No (default: `https://asismetro-automations.ismola.dev`) |
   | `ASISMETRO_MIN_SYNC_HOURS` | Minimum hours between sync calls to Asismetro | No (default: `4`) |
   | `APP_ENCRYPTION_KEY` | 32-byte hex key for encrypting provider credentials | Yes |
   | `SESSION_SECRET` | Secret used to sign session tokens | Yes |
   | `ASISMETRO_BEARER_TOKEN` | Bearer token for the Asismetro Automations API | Yes |
   | `DEFAULT_REFRESH_MINUTES` | Subscription sync interval in minutes | No (default: `60`) |

2. **Start all services:**

   ```bash
   docker compose -f docker-compose.prod.yml up -d
   ```

   This starts Asismetro Automations, PostgreSQL, Redis, runs database migrations, and launches the web app and the background worker.

3. Open [http://localhost:3000](http://localhost:3000) and create an account.

## Local Development

1. Start the infrastructure (database + Redis):

   ```bash
   docker compose up -d
   ```

2. Install dependencies and run migrations:

   ```bash
   npm install
   npm run prisma:migrate:dev
   ```

3. Start the development server and the background worker in separate terminals:

   ```bash
   npm run dev          # Next.js dev server on :3000
   npm run dev:worker   # BullMQ worker with hot-reload
   ```

### Dev Container

If you open the project in a Dev Container, it works out of the box without creating `.env` or `.env.local`.

On container creation/start, it automatically:

- Starts `postgres`, `redis`, and `asismetro-automations`
- Applies pending Prisma migrations
- Starts the worker (`npm run dev:worker`) in the background

The Dev Container sets:

- `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/calendar_subscription_hub?schema=public`
- `DIRECT_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/calendar_subscription_hub?schema=public`
- `REDIS_URL=redis://localhost:6379`
- `APP_BASE_URL=http://localhost:3000`
- `ASISMETRO_API_BASE_URL=http://localhost:3001`

For missing required secrets in development (`SESSION_SECRET`, `APP_ENCRYPTION_KEY`, `ASISMETRO_BEARER_TOKEN`), the app now uses development-only fallbacks when running in the Dev Container.

Worker logs are written to `.devcontainer/dev-worker.log`.

## Project Structure

```
src/
├── app/               # Next.js App Router pages and API routes
│   ├── [guid]/        # Public iCal feed endpoint
│   ├── api/           # REST API (auth, subscriptions, providers, events)
│   └── dashboard/     # Authenticated dashboard pages
├── components/        # Shared React components
├── lib/
│   ├── auth/          # Session and password utilities
│   ├── ics/           # iCalendar parser
│   ├── providers/     # Provider definitions and registry
│   ├── queue/         # BullMQ client helpers
│   └── subscriptions/ # Subscription service logic
└── worker/            # Background sync worker entry point
```

## Adding a Provider

1. Create a new file under `src/lib/providers/my-provider.ts` exporting a `ProviderDefinition`.
2. Register it in `src/lib/providers/registry.ts`:

   ```ts
   import { myProvider } from "./my-provider";
   registry.push(myProvider);
   ```

## Available Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start Next.js in development mode |
| `npm run dev:worker` | Start the BullMQ worker with hot-reload |
| `npm run build` | Build for production (includes `prisma generate`) |
| `npm run start` | Start the production server |
| `npm run start:worker` | Start the production worker |
| `npm run prisma:migrate:dev` | Create and apply a new migration |
| `npm run prisma:migrate:deploy` | Apply pending migrations (production) |
| `npm run lint` | Run ESLint |
