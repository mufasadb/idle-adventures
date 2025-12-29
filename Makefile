.PHONY: dev db backend frontend build clean

# Start everything for development
dev: db
	@echo "Starting backend and frontend..."
	@make -j2 backend frontend

# Start PostgreSQL
db:
	docker compose up -d
	@echo "Waiting for database..."
	@sleep 2

# Run backend
backend:
	cd backend && go run ./cmd/server

# Run frontend
frontend:
	cd frontend && npm run dev

# Build everything
build:
	cd backend && go build -o bin/server ./cmd/server
	cd frontend && npm run build

# Stop database
db-stop:
	docker compose down

# Clean build artifacts
clean:
	rm -rf backend/bin
	rm -rf frontend/dist

# Install dependencies
install:
	cd frontend && npm install
	cd backend && go mod download
