# Idle Adventures

An active exploration RPG with idle convenience features. Manual play yields 85-100% efficiency, auto mode yields 70%.

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React + TypeScript + MobX + Tailwind + Vite |
| Backend | Go + Gin + GORM |
| Database | PostgreSQL |

## Project Structure

```
idle-adventures/
├── backend/          # Go API server
│   ├── cmd/server/   # Entry point
│   ├── internal/     # Private packages
│   │   ├── config/   # Configuration
│   │   ├── database/ # DB connection
│   │   ├── handlers/ # HTTP handlers
│   │   ├── middleware/
│   │   ├── models/   # GORM models
│   │   ├── router/   # Route setup
│   │   └── services/ # Business logic
│   └── pkg/gamedata/ # Static game data
├── frontend/         # React PWA
│   └── src/
│       ├── api/      # API client
│       ├── components/
│       ├── pages/
│       ├── stores/   # MobX stores
│       └── types/    # TypeScript types
└── docker-compose.yml
```

## Getting Started

### Prerequisites

- Go 1.21+
- Node.js 20+
- Docker (for PostgreSQL)

### 1. Start the Database

```bash
docker compose up -d
```

### 2. Run the Backend

```bash
cd backend
go run ./cmd/server
```

The API will be available at http://localhost:8080

### 3. Run the Frontend

```bash
cd frontend
npm install
npm run dev
```

The app will be available at http://localhost:3000

## API Endpoints

### Auth (Public)
- `POST /api/auth/register` - Create account
- `POST /api/auth/login` - Login

### Player (Protected)
- `GET /api/player` - Get player state

## Design Documents

- [Game Design](idle-rpg-game-design.md) - Core mechanics and philosophy
- [Dev Spec](idle-rpg-dev-spec.md) - Technical specification
- [UX Flows](idle-rpg-ux-flows.md) - User journeys
- [Sprints](idle-rpg-sprints.md) - Development roadmap
- [Decisions Log](design-decisions-log.md) - Design decision history
