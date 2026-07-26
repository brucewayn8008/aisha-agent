package main

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"sync"
	"syscall"

	_ "github.com/lib/pq"

	"go.mau.fi/whatsmeow"
	waProto "go.mau.fi/whatsmeow/binary/proto"
	"go.mau.fi/whatsmeow/store"
	"go.mau.fi/whatsmeow/store/sqlstore"
	"go.mau.fi/whatsmeow/types/events"
	waLog "go.mau.fi/whatsmeow/util/log"
	"go.mau.fi/whatsmeow/types"
	"github.com/mdp/qrterminal/v3"
)

// SessionManager holds active WhatsApp clients mapped by Workspace ID
type SessionManager struct {
	mu      sync.RWMutex
	clients map[string]*whatsmeow.Client
	db      *sql.DB
	store   *sqlstore.Container
}

var manager *SessionManager

// getEnv returns the env variable value or the fallback default.
func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func getEnvInt(key string, fallback int) int {
	if v := os.Getenv(key); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			return n
		}
	}
	return fallback
}

func initSessionManager() {
	log.Println("Initializing Postgres Store for WhatsApp Sessions...")
	connStr := fmt.Sprintf("host=%s port=%d user=%s password=%s dbname=%s sslmode=%s",
		getEnv("DB_HOST", "localhost"),
		getEnvInt("DB_PORT", 5432),
		getEnv("DB_USER", "postgres"),
		getEnv("DB_PASSWORD", "postgres"),
		getEnv("DB_NAME", "wa_mark2"),
		getEnv("DB_SSLMODE", "disable"))
	
	dbLog := waLog.Stdout("Database", "INFO", true)
	// whatsmeow sqlstore expects standard sql.DB
	container, err := sqlstore.New(context.Background(), "postgres", connStr, dbLog)
	if err != nil {
		log.Fatalf("Failed to connect to postgres store: %v", err)
	}

	rawDB, err := sql.Open("postgres", connStr)
	if err != nil {
		log.Fatalf("Failed to open raw db: %v", err)
	}

	manager = &SessionManager{
		clients: make(map[string]*whatsmeow.Client),
		db:      rawDB,
		store:   container,
	}

	log.Println("Session Manager initialized.")
}

// Start a client for a specific workspace
func (sm *SessionManager) startSession(workspaceID string) error {
	sm.mu.Lock()
	defer sm.mu.Unlock()

	if client, exists := sm.clients[workspaceID]; exists {
		if client != nil {
			if client.IsConnected() {
				log.Printf("[%s] Client already running and connected", workspaceID)
				go updateStatusInDB(workspaceID, "CONNECTED")
			} else {
				log.Printf("[%s] Client already running but not connected. Connecting...", workspaceID)
				go func() {
					err := client.Connect()
					if err != nil {
						log.Printf("[%s] Failed to connect: %v", workspaceID, err)
					}
				}()
			}
		}
		return nil
	}

	// Retrieve whatsapp_jid from workspaces table for this workspace
	var whatsappJID sql.NullString
	err := sm.db.QueryRow("SELECT whatsapp_jid FROM workspaces WHERE id = $1", workspaceID).Scan(&whatsappJID)
	if err != nil {
		log.Printf("[%s] Error querying whatsapp_jid: %v", workspaceID, err)
	}

	devices, err := sm.store.GetAllDevices(context.Background())
	if err != nil {
		return err
	}
	
	var deviceStore *store.Device
	
	for _, dev := range devices {
		if whatsappJID.Valid && whatsappJID.String != "" && dev.ID != nil {
			bareJID := fmt.Sprintf("%s@%s", dev.ID.User, dev.ID.Server)
			if bareJID == whatsappJID.String {
				deviceStore = dev
				break
			}
		}
		if dev.PushName == workspaceID {
			deviceStore = dev
			break
		}
	}

	if deviceStore == nil {
		deviceStore = sm.store.NewDevice()
		deviceStore.PushName = workspaceID
		deviceStore.Save(context.Background())
	}

	clientLog := waLog.Stdout("Client-"+workspaceID, "INFO", true)
	client := whatsmeow.NewClient(deviceStore, clientLog)
	
	// Set event handler
	client.AddEventHandler(func(evt interface{}) {
		eventHandler(workspaceID, evt)
	})

	if client.Store.ID == nil {
		// New device, need QR
		log.Printf("[%s] No identity found. Getting QR Code...", workspaceID)
		qrChan, _ := client.GetQRChannel(context.Background())
		err = client.Connect()
		if err != nil {
			return err
		}
		
		go func() {
			for evt := range qrChan {
				if evt.Event == "code" {
					qrterminal.GenerateHalfBlock(evt.Code, qrterminal.L, os.Stdout)
					// Save QR code to postgres
					updateQRInDB(workspaceID, evt.Code)
				} else {
					log.Printf("[%s] QR Channel Event: %s", workspaceID, evt.Event)
				}
			}
		}()
	} else {
		log.Printf("[%s] Identity found. Connecting...", workspaceID)
		err = client.Connect()
		if err != nil {
			return err
		}
		updateStatusInDB(workspaceID, "CONNECTED")
	}

	sm.clients[workspaceID] = client
	return nil
}

func updateQRInDB(workspaceID, qrCode string) {
	_, err := manager.db.Exec("UPDATE whatsapp_sessions SET qr_code = $1, status = 'QR_PENDING', last_updated = NOW() WHERE workspace_id = $2", qrCode, workspaceID)
	if err != nil {
		log.Printf("Failed to update QR for %s: %v", workspaceID, err)
	}
}

func updateStatusInDB(workspaceID, status string) {
	_, err := manager.db.Exec("UPDATE whatsapp_sessions SET status = $1, qr_code = NULL, last_updated = NOW() WHERE workspace_id = $2", status, workspaceID)
	if err != nil {
		log.Printf("Failed to update status for %s: %v", workspaceID, err)
	}
}

func eventHandler(workspaceID string, evt interface{}) {
	switch v := evt.(type) {
	case *events.Message:
		text := v.Message.GetConversation()
		if text == "" && v.Message.ExtendedTextMessage != nil {
			text = v.Message.ExtendedTextMessage.GetText()
		}
		
		pushWebhook(workspaceID, v.Info.ID, v.Info.Chat.String(), v.Info.Sender.String(), v.Info.PushName, text, v.Info.Timestamp.Unix(), v.Info.IsFromMe, v.Info.IsGroup)
		
	case *events.Connected:
		log.Printf("[%s] Connected to WhatsApp", workspaceID)
		updateStatusInDB(workspaceID, "CONNECTED")
		
		manager.mu.RLock()
		client, exists := manager.clients[workspaceID]
		manager.mu.RUnlock()
		if exists && client != nil && client.Store.ID != nil {
			bareJID := fmt.Sprintf("%s@%s", client.Store.ID.User, client.Store.ID.Server)
			log.Printf("[%s] Saving connected JID: %s", workspaceID, bareJID)
			_, err := manager.db.Exec("UPDATE workspaces SET whatsapp_jid = $1 WHERE id = $2", bareJID, workspaceID)
			if err != nil {
				log.Printf("[%s] Failed to save JID: %v", workspaceID, err)
			}
		}
	case *events.LoggedOut:
		log.Printf("[%s] Logged out from WhatsApp", workspaceID)
		updateStatusInDB(workspaceID, "UNCONFIGURED")
	}
}

func pushWebhook(workspaceID, msgID, chatJID, senderJID, senderName, text string, timestamp int64, fromMe bool, isGroup bool) {
	payload := map[string]interface{}{
		"workspace_id": workspaceID,
		"id":           msgID,
		"chat_jid":     chatJID,
		"sender_jid":   senderJID,
		"sender":       senderName,
		"text":         text,
		"timestamp":    timestamp,
		"fromMe":       fromMe,
		"is_group":     isGroup,
	}
	
	jsonData, _ := json.Marshal(payload)

	url1 := getEnv("WEBHOOK_URL", "http://localhost:8000/api/v1/webhook/message")
	url2 := getEnv("WEBHOOK_URL_2", "http://localhost:5001/api/v1/webhook/message")

	deliver := func(url string, label string) {
		if url == "" {
			return
		}
		resp, err := http.Post(url, "application/json", bytes.NewBuffer(jsonData))
		if err != nil {
			log.Printf("[%s] Error pushing webhook (%s - %s): %v", workspaceID, label, url, err)
			return
		}
		defer resp.Body.Close()
		log.Printf("[%s] Webhook delivered (%s - %s): %d", workspaceID, label, url, resp.StatusCode)
	}

	go deliver(url1, "primary")
	if url2 != "" {
		go deliver(url2, "secondary")
	}
}

// REST Handlers

func startSessionHandler(w http.ResponseWriter, r *http.Request) {
	workspaceID := r.URL.Query().Get("workspace_id")
	if workspaceID == "" {
		http.Error(w, "missing workspace_id", http.StatusBadRequest)
		return
	}
	
	err := manager.startSession(workspaceID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	fmt.Fprintf(w, "Session start initiated for %s", workspaceID)
}

func sendHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	
	var req struct {
		WorkspaceID string `json:"workspace_id"`
		To          string `json:"to"`
		Text        string `json:"text"`
	}
	
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	
	manager.mu.RLock()
	client, exists := manager.clients[req.WorkspaceID]
	manager.mu.RUnlock()
	
	if !exists || client == nil || !client.IsConnected() {
		http.Error(w, "Client not connected for this workspace", http.StatusServiceUnavailable)
		return
	}
	
	recipient, err := types.ParseJID(req.To)
	if err != nil {
		http.Error(w, "Invalid JID", http.StatusBadRequest)
		return
	}
	
	msg := &waProto.Message{
		Conversation: &req.Text,
	}
	
	_, err = client.SendMessage(context.Background(), recipient, msg)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	
	fmt.Fprintf(w, "Message sent to %s", req.To)
}

func listGroupsHandler(w http.ResponseWriter, r *http.Request) {
	workspaceID := r.URL.Query().Get("workspace_id")
	if workspaceID == "" {
		http.Error(w, "missing workspace_id", http.StatusBadRequest)
		return
	}

	manager.mu.RLock()
	client, exists := manager.clients[workspaceID]
	manager.mu.RUnlock()

	if !exists || client == nil || !client.IsConnected() {
		if err := manager.startSession(workspaceID); err != nil && err.Error() != fmt.Sprintf("session already running for workspace %s", workspaceID) {
			http.Error(w, "Client not connected for this workspace", http.StatusServiceUnavailable)
			return
		}
		manager.mu.RLock()
		client, exists = manager.clients[workspaceID]
		manager.mu.RUnlock()
		if !exists || client == nil || !client.IsConnected() {
			http.Error(w, "Client not connected for this workspace", http.StatusServiceUnavailable)
			return
		}
	}

	groups, err := client.GetJoinedGroups(context.Background())
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	type groupPayload struct {
		JID              string `json:"jid"`
		Name             string `json:"name"`
		Topic            string `json:"topic,omitempty"`
		ParticipantCount int    `json:"participant_count"`
		IsDefaultSub     bool   `json:"is_default_sub"`
		IsAnnounce       bool   `json:"is_announce"`
		IsLocked         bool   `json:"is_locked"`
	}

	payload := make([]groupPayload, 0, len(groups))
	for _, group := range groups {
		payload = append(payload, groupPayload{
			JID:              group.JID.String(),
			Name:             group.Name,
			Topic:            group.Topic,
			ParticipantCount: group.ParticipantCount,
			IsDefaultSub:     group.IsDefaultSubGroup,
			IsAnnounce:       group.IsAnnounce,
			IsLocked:         group.IsLocked,
		})
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"ok":     true,
		"groups": payload,
	})
}

func main() {
	initSessionManager()
	
	http.HandleFunc("/api/session/start", startSessionHandler)
	http.HandleFunc("/api/send", sendHandler)
	http.HandleFunc("/api/groups", listGroupsHandler)
	
	port := getEnv("GATEWAY_PORT", "5005")
	log.Printf("Starting Go Gateway on :%s", port)
	
	server := &http.Server{Addr: ":" + port}
	go func() {
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Server error: %v", err)
		}
	}()
	
	c := make(chan os.Signal, 1)
	signal.Notify(c, os.Interrupt, syscall.SIGTERM)
	<-c
	
	log.Println("Shutting down Go Gateway...")
	manager.mu.Lock()
	for _, client := range manager.clients {
		client.Disconnect()
	}
	manager.mu.Unlock()
}
