// internal/models/types.go
package models

import "github.com/golang-jwt/jwt/v5"

// LoginRequest representa o corpo da requisição de login (igual ao seu auth.controller.js)
type LoginRequest struct {
	Username    string `json:"username"`
	Password    string `json:"password"`
	DeviceToken string `json:"deviceToken"`
}

// LoginResponse é o que devolvemos para o frontend
type LoginResponse struct {
	Username      string `json:"username"`
	CodUsu        int    `json:"codusu"`
	NomeUsu       string `json:"nomeusu"`
	NumReg        int    `json:"numreg"`
	DeviceToken   string `json:"deviceToken"`
	SessionToken  string `json:"sessionToken"`
	SnkJSessionID string `json:"snkjsessionid"`
	IsTestEnv     bool   `json:"isTestEnvironment"`
	Message       string `json:"message,omitempty"` // Usado para erros ou avisos
}

// UserClaims define o que vai dentro do nosso JWT
type UserClaims struct {
	Username   string `json:"username"`
	CodUsu     int    `json:"codusu"`
	NomeUsu    string `json:"nomeusu"`
	NumReg     int    `json:"numreg"`
	JSessionID string `json:"jsessionid"`
	jwt.RegisteredClaims
}