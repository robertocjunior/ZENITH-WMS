// internal/sankhya/client.go
package sankhya

import (
	"fmt"
	"os"
	"sync"
	"time"

	"github.com/go-resty/resty/v2"
)

type Client struct {
	http        *resty.Client
	bearerToken string
	mu          sync.RWMutex // Protege o token em concorrência
}

// NewClient cria uma nova instância do cliente Sankhya
func NewClient() *Client {
	client := resty.New()
	client.SetBaseURL(os.Getenv("SANKHYA_API_URL"))
	client.SetTimeout(30 * time.Second)
	
	// Debug em dev (opcional)
	if os.Getenv("NODE_ENV") != "production" {
		client.SetDebug(true)
	}

	return &Client{http: client}
}

// authenticateSystem obtém o Bearer Token do sistema (igual ao getSystemBearerToken do Node)
func (c *Client) authenticateSystem() error {
	resp, err := c.http.R().
		SetHeaders(map[string]string{
			"appkey":   os.Getenv("SANKHYA_APPKEY"),
			"username": os.Getenv("SANKHYA_USERNAME"),
			"password": os.Getenv("SANKHYA_PASSWORD"),
			"token":    os.Getenv("SANKHYA_TOKEN"),
		}).
		Post("/login")

	if err != nil {
		return err
	}

	// Extrai o token usando uma struct anônima rápida ou map
	var result map[string]interface{}
	// O Resty já pode fazer o parse se configurado, mas aqui faremos manual p/ simplicidade
	if err := c.http.JSONUnmarshal(resp.Body(), &result); err != nil {
		return err
	}

	if token, ok := result["bearerToken"].(string); ok {
		c.mu.Lock()
		c.bearerToken = token
		c.mu.Unlock()
		return nil
	}

	return fmt.Errorf("falha ao obter bearer token: %v", result)
}

// CallService executa uma chamada genérica (DbExplorerSP, etc)
func (c *Client) CallService(service string, body interface{}) (*resty.Response, error) {
	c.mu.RLock()
	token := c.bearerToken
	c.mu.RUnlock()

	if token == "" {
		if err := c.authenticateSystem(); err != nil {
			return nil, err
		}
		c.mu.RLock()
		token = c.bearerToken
		c.mu.RUnlock()
	}

	req := c.http.R().
		SetHeader("Authorization", "Bearer "+token).
		SetBody(map[string]interface{}{"requestBody": body})

	resp, err := req.Post("/gateway/v1/mge/service.sbr?serviceName=" + service + "&outputType=json")
    
    // Se der erro de autorização (token expirado), tenta renovar 1 vez
    if err == nil && resp.StatusCode() == 401 {
        c.authenticateSystem()
        // Tenta de novo com novo token... (simplificado aqui)
    }

	return resp, err
}

// MobileLogin executa o login específico do usuário (MobileLoginSP.login)
func (c *Client) MobileLogin(user, pass string) (string, error) {
    // Esta chamada não usa Bearer Token do sistema necessariamente, depende da config do Sankhya,
    // mas seu código original usava o proxy. Vamos manter o padrão.
    
    body := map[string]interface{}{
        "NOMUSU":  map[string]string{"$": user},
        "INTERNO": map[string]string{"$": pass},
    }
    
    // Nota: No seu código original, o login do usuário não passava Bearer token
    // mas usava a instância 'sankhyaApi' base. Vamos assumir chamada direta aqui.
	resp, err := c.http.R().
		SetBody(map[string]interface{}{"requestBody": body}).
		Post("/gateway/v1/mge/service.sbr?serviceName=MobileLoginSP.login&outputType=json")

	if err != nil {
		return "", err
	}
    
    // Parse simplificado para pegar o JSESSIONID
    // Em produção usaremos structs dedicadas para parsear o XML/JSON complexo do Sankhya
    var result map[string]interface{}
    c.http.JSONUnmarshal(resp.Body(), &result)
    
    if responseBody, ok := result["responseBody"].(map[string]interface{}); ok {
        if jsession, ok := responseBody["jsessionid"].(map[string]interface{}); ok {
            return jsession["$"].(string), nil
        }
    }
    
    statusMessage, _ := result["statusMessage"].(string)
    return "", fmt.Errorf("erro login sankhya: %s", statusMessage)
}