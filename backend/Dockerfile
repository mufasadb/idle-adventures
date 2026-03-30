# Stage 1: build the binary
FROM golang:1.25-alpine AS builder

WORKDIR /app

# Download dependencies first (cached layer)
COPY go.mod go.sum ./
RUN go mod download

# Copy source and build
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o server ./cmd/server

# Stage 2: minimal runtime image
FROM alpine:3.20

# ca-certificates for HTTPS outbound calls; tzdata for correct timestamps
RUN apk add --no-cache ca-certificates tzdata

WORKDIR /app

# Copy compiled binary
COPY --from=builder /app/server .

# Copy migration files (golang-migrate reads them at runtime)
COPY --from=builder /app/migrations ./migrations

EXPOSE 8080

CMD ["./server"]
