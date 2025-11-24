// cmd/api/main.go
package main

import (
	"log"
	"os"

	"github.com/joho/godotenv"
	"github.com/labstack/echo/v4"
	"github.com/labstack/echo/v4/middleware"
	"github.com/robertocjunior/zenith-wms-go/internal/auth"
	"github.com/robertocjunior/zenith-wms-go/internal/sankhya"
)

func main() {
	// Carrega variaveis de ambiente
	if err := godotenv.Load(); err != nil {
		log.Println("Arquivo .env não encontrado, usando variáveis do sistema")
	}

	// Inicializa componentes
	sankhyaClient := sankhya.NewClient()
	authHandler := auth.NewHandler(sankhyaClient)

	// Configura o Servidor Web (Echo)
	e := echo.New()

	// Middlewares (Logs, Recuperação de pânico, CORS)
	e.Use(middleware.Logger())
	e.Use(middleware.Recover())
	e.Use(middleware.CORS())

	// Rotas
	api := e.Group("/api")
	api.POST("/login", authHandler.Login)

	// Inicia o servidor
	port := os.Getenv("PORT")
	if port == "" {
		port = "3030"
	}
	e.Logger.Fatal(e.Start(":" + port))
}