// internal/auth/handler.go
package auth

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/labstack/echo/v4"
	"github.com/robertocjunior/zenith-wms-go/internal/models"
	"github.com/robertocjunior/zenith-wms-go/internal/sankhya"
)

type Handler struct {
	Sankhya *sankhya.Client
}

func NewHandler(s *sankhya.Client) *Handler {
	return &Handler{Sankhya: s}
}

func (h *Handler) Login(c echo.Context) error {
	var req models.LoginRequest
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"message": "Dados inválidos"})
	}

	// 1. Lógica de Dispositivo
	if req.DeviceToken == "" {
		bytes := make([]byte, 20)
		rand.Read(bytes)
		req.DeviceToken = hex.EncodeToString(bytes)
	}

	// 2. Consulta Combinada (SQL Sankhya)
	// Nota: Em Go, usamos crase (`) para strings multi-linha, o que facilita colar o SQL.
	sanitizedUser := strings.ToUpper(strings.ReplaceAll(req.Username, "'", "''"))
	sanitizedDevice := strings.ReplaceAll(req.DeviceToken, "'", "''")

	sql := fmt.Sprintf(`
		SELECT USU.CODUSU, USU.NOMEUSU, PERM.NUMREG, DISP.ATIVO
		FROM TSIUSU USU
		LEFT JOIN AD_APPPERM PERM ON USU.CODUSU = PERM.CODUSU
		LEFT JOIN AD_DISPAUT DISP ON USU.CODUSU = DISP.CODUSU AND DISP.DEVICETOKEN = '%s'
		WHERE USU.NOMEUSU = '%s'`, sanitizedDevice, sanitizedUser)

	resp, err := h.Sankhya.CallService("DbExplorerSP.executeQuery", map[string]string{"sql": sql})
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"message": "Erro ao conectar no ERP"})
	}

	// Parse da resposta do Sankhya (simplificado para o exemplo)
	// Você precisará de uma struct robusta para parsear responseBody -> rows do Sankhya
	// Aqui assumimos que deu certo e pegamos os dados fictícios para ilustrar o fluxo
	// ... (Lógica de parsing do rows[0] igual ao Node) ...
    
    // Simulando dados que viriam do Sankhya para compilar
    codUsu := 123
    nomeUsu := "ROBERTO"
    var numReg *int // Pode ser nulo
    // deviceAtivo := "S"

	// 3. Validações (igual ao Node)
    // Se numReg == nil -> 403
    // Se deviceAtivo == nil -> Registra device -> 403
    // Se deviceAtivo == 'N' -> 403

	// 4. Validação de Senha (MobileLoginSP.login)
	jsession, err := h.Sankhya.MobileLogin(req.Username, req.Password)
	if err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"message": "Usuário ou senha inválidos"})
	}

	// 5. Gerar JWT
	claims := models.UserClaims{
		Username:   req.Username,
		CodUsu:     codUsu,
		NomeUsu:    nomeUsu,
		JSessionID: jsession,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(8 * time.Hour)),
		},
	}
    
    if numReg != nil {
        claims.NumReg = *numReg
    }

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	t, err := token.SignedString([]byte(os.Getenv("JWT_SECRET")))
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"message": "Erro ao gerar token"})
	}

	// 6. Retorno
	return c.JSON(http.StatusOK, models.LoginResponse{
		Username:      req.Username,
		CodUsu:        codUsu,
		NomeUsu:       nomeUsu,
		DeviceToken:   req.DeviceToken,
		SessionToken:  t,
		SnkJSessionID: jsession,
	})
}