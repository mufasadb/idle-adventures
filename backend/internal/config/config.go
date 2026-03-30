package config

import (
	"log"
	"os"

	"github.com/joho/godotenv"
	"github.com/spf13/viper"
)

type Config struct {
	Server   ServerConfig
	Database DatabaseConfig
	JWT      JWTConfig
}

type ServerConfig struct {
	Port           string
	Mode           string // "debug", "release", "test"
	MigrationsPath string
}

type DatabaseConfig struct {
	// URL is the full Postgres connection string (from DB_URL env var).
	// If set, it takes precedence over individual host/port/user/password fields.
	URL      string
	Host     string
	Port     string
	User     string
	Password string
	DBName   string
	SSLMode  string
}

type JWTConfig struct {
	Secret      string
	ExpireHours int
}

func Load() (*Config, error) {
	// Load .env file if present (silently ignore if missing).
	if err := godotenv.Load(); err != nil && !os.IsNotExist(err) {
		log.Printf("No .env file found, using environment variables only")
	}

	// Viper env-var bindings for the spec's required names.
	// These map canonical env var names → viper keys.
	viper.SetEnvPrefix("")
	viper.AutomaticEnv()
	_ = viper.BindEnv("server.port", "PORT")
	_ = viper.BindEnv("database.url", "DB_URL")
	_ = viper.BindEnv("jwt.secret", "JWT_SECRET")

	// Set defaults
	viper.SetDefault("server.port", "8080")
	viper.SetDefault("server.mode", "debug")
	viper.SetDefault("server.migrations_path", "./migrations")
	viper.SetDefault("database.host", "localhost")
	viper.SetDefault("database.port", "5432")
	viper.SetDefault("database.user", "postgres")
	viper.SetDefault("database.password", "postgres")
	viper.SetDefault("database.dbname", "idle_rpg")
	viper.SetDefault("database.sslmode", "disable")
	viper.SetDefault("jwt.secret", "change-me-in-production")
	viper.SetDefault("jwt.expire_hours", 72)

	// Try to read optional YAML config file.
	viper.SetConfigName("config")
	viper.SetConfigType("yaml")
	viper.AddConfigPath(".")
	viper.AddConfigPath("./config")
	if err := viper.ReadInConfig(); err != nil {
		if _, ok := err.(viper.ConfigFileNotFoundError); !ok {
			return nil, err
		}
	}

	return &Config{
		Server: ServerConfig{
			Port:           viper.GetString("server.port"),
			Mode:           viper.GetString("server.mode"),
			MigrationsPath: viper.GetString("server.migrations_path"),
		},
		Database: DatabaseConfig{
			URL:      viper.GetString("database.url"),
			Host:     viper.GetString("database.host"),
			Port:     viper.GetString("database.port"),
			User:     viper.GetString("database.user"),
			Password: viper.GetString("database.password"),
			DBName:   viper.GetString("database.dbname"),
			SSLMode:  viper.GetString("database.sslmode"),
		},
		JWT: JWTConfig{
			Secret:      viper.GetString("jwt.secret"),
			ExpireHours: viper.GetInt("jwt.expire_hours"),
		},
	}, nil
}

// DSN returns a Postgres connection string.
// If DB_URL is set it's used directly; otherwise it's built from individual fields.
func (c *DatabaseConfig) DSN() string {
	if c.URL != "" {
		return c.URL
	}
	return "host=" + c.Host +
		" user=" + c.User +
		" password=" + c.Password +
		" dbname=" + c.DBName +
		" port=" + c.Port +
		" sslmode=" + c.SSLMode
}
