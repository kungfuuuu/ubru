# UBRU Room Booking

**FOR TEST / EDUCATION ONLY.** The included credentials are demonstration accounts. Change or remove them before any real deployment.

## Development

Requires Node.js 22.13 or newer (`node:sqlite` is used for the embedded SQLite database and session store).

```sh
npm install
npm run seed
npm start
```

Open <http://localhost:3000>.

To run the API smoke checks, leave the server running in one terminal and run `npm run test:smoke` in another.

Seed accounts:

| Role | Email | Password |
| --- | --- | --- |
| User | `user@ubru.test` | `UserTest2026!` |
| Admin | `admin@ubru.test` | `AdminTest2026!` |

The SQLite database is stored in `data/ubru.sqlite` by default. Back up that file while the server is stopped. Do not commit the database or `.env`.

## Deployment

Copy `.env.example` to `.env`, set `NODE_ENV=production`, choose a long random `SESSION_SECRET`, and persist `/app/data` if using Docker. The application uses HTTP-only, SameSite session cookies, CSRF tokens on state-changing API requests, bcrypt password hashes, server-side role checks, SQLite transactions, and overlap checks for bookings. Use HTTPS in production. No external database, Redis, or third-party API is required.

## Docker

```sh
docker compose up --build -d
docker compose exec app npm run seed
```

The compose file mounts a persistent SQLite data volume and maps port 3000.
