package main

import (
	"log"

	"github.com/danielbeach/idle-adventures/backend/internal/config"
	"github.com/danielbeach/idle-adventures/backend/internal/database"
	"github.com/danielbeach/idle-adventures/backend/internal/models"
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

	// Auto-migrate models (creates tables if they don't exist)
	if err := db.AutoMigrate(&models.Player{}); err != nil {
		log.Fatalf("Failed to migrate database: %v", err)
	}

	// Setup and run router
	r := router.Setup(db, cfg)

	log.Printf("Server starting on port %s", cfg.Server.Port)
	if err := r.Run(":" + cfg.Server.Port); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}
