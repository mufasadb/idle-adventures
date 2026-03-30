package main

import (
	"log"

	"github.com/danielbeach/idle-adventures/backend/internal/config"
	"github.com/danielbeach/idle-adventures/backend/internal/database"
	"github.com/danielbeach/idle-adventures/backend/internal/router"
)

func main() {
	// Load configuration
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("Failed to load config: %v", err)
	}

	// Connect to database
	db, err := database.Connect(&cfg.Database)
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}

	// Run golang-migrate migrations on startup
	if err := database.RunMigrations(db, cfg.Server.MigrationsPath); err != nil {
		log.Fatalf("Failed to run migrations: %v", err)
	}

	// Setup and run router
	r := router.Setup(db, cfg)

	log.Printf("Server starting on port %s", cfg.Server.Port)
	if err := r.Run(":" + cfg.Server.Port); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}
