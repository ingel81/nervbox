#!/bin/bash

# nervbox Dev-Setup Startskript
# Verwendung: ./start-dev.sh [start|stop|status|logs]

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/NervboxDeamon"
RELEASE_DIR="$SCRIPT_DIR/Release"
PLAYER_DIR="$SCRIPT_DIR/nervbox-player"
MIXER_DIR="$SCRIPT_DIR/../nervbox-mixer"
PID_FILE="/tmp/nervbox-dev.pids"

# Farben
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

cleanup() {
    echo ""
    echo -e "${YELLOW}=== Strg+C erkannt - Beende alle Services ===${NC}"
    stop
    exit 0
}

start() {
    echo -e "${YELLOW}=== nervbox Dev-Setup starten ===${NC}"

    # Trap für Strg+C - beendet alle Services
    trap cleanup SIGINT SIGTERM

    # Prüfen ob bereits läuft
    if [ -f "$PID_FILE" ]; then
        echo -e "${RED}nervbox läuft bereits! Erst stoppen: ./start-dev.sh stop${NC}"
        exit 1
    fi

    # Player starten (im Hintergrund)
    echo -e "${GREEN}Starte Player (Port 4200)...${NC}"
    cd "$PLAYER_DIR"
    npx ng serve --host 0.0.0.0 --allowed-hosts=all > /tmp/nervbox-player.log 2>&1 &
    PLAYER_PID=$!
    echo "  Player PID: $PLAYER_PID"

    # Mixer starten (im Hintergrund)
    echo -e "${GREEN}Starte Mixer (Port 4201)...${NC}"
    cd "$MIXER_DIR"
    npx ng serve --port 4201 --host 0.0.0.0 --allowed-hosts=all --configuration lan --serve-path /mixer > /tmp/nervbox-mixer.log 2>&1 &
    MIXER_PID=$!
    echo "  Mixer PID: $MIXER_PID"

    # PIDs speichern (Backend PID wird später ergänzt)
    echo "0 $PLAYER_PID $MIXER_PID" > "$PID_FILE"

    echo ""
    echo -e "${GREEN}URLs:${NC}"
    echo -e "  Backend: http://localhost:8080"
    echo -e "  Player:  http://localhost:4200"
    echo -e "  Mixer:   http://localhost:4201/mixer"
    echo ""
    echo -e "${CYAN}Strg+C beendet alle Services${NC}"
    echo ""
    # Backend bauen (für lokale Architektur)
    echo -e "${GREEN}Baue Backend...${NC}"
    cd "$BACKEND_DIR"
    dotnet build -o "$RELEASE_DIR" -c Debug --nologo -v q

    echo -e "${YELLOW}=== Backend Log ===${NC}"

    # Backend im Vordergrund starten (saubere Serilog-Ausgabe)
    cd "$RELEASE_DIR"
    ASPNETCORE_ENVIRONMENT=Development dotnet NervboxDeamon.dll &
    BACKEND_PID=$!

    # PIDs aktualisieren
    echo "$BACKEND_PID $PLAYER_PID $MIXER_PID" > "$PID_FILE"

    # Warten auf Backend-Prozess
    wait $BACKEND_PID
}

stop() {
    echo -e "${YELLOW}=== nervbox Dev-Setup stoppen ===${NC}"

    # Prozesse über PID-File stoppen
    if [ -f "$PID_FILE" ]; then
        read -r BACKEND_PID PLAYER_PID MIXER_PID < "$PID_FILE"

        for PID in $BACKEND_PID $PLAYER_PID $MIXER_PID; do
            if kill -0 $PID 2>/dev/null; then
                kill $PID 2>/dev/null
                echo "  Prozess $PID beendet"
            fi
        done
        rm -f "$PID_FILE"
    fi

    # Sicherheitshalber alle nervbox-Prozesse beenden
    pkill -f "NervboxDeamon.dll" 2>/dev/null || true
    pkill -f "ng serve.*nervbox" 2>/dev/null || true

    sleep 1
    echo -e "${GREEN}Gestoppt!${NC}"
}

status() {
    echo -e "${YELLOW}=== nervbox Status ===${NC}"

    echo -n "Backend (8080): "
    if curl -s -o /dev/null -w "" --connect-timeout 2 http://localhost:8080/api/sound 2>/dev/null; then
        echo -e "${GREEN}RUNNING${NC}"
    else
        echo -e "${RED}STOPPED${NC}"
    fi

    echo -n "Player  (4200): "
    if curl -s -o /dev/null -w "" --connect-timeout 2 http://127.0.0.1:4200/ 2>/dev/null; then
        echo -e "${GREEN}RUNNING${NC}"
    else
        echo -e "${RED}STOPPED${NC}"
    fi

    echo -n "Mixer   (4201): "
    if curl -s -o /dev/null -w "" --connect-timeout 2 http://127.0.0.1:4201/mixer 2>/dev/null; then
        echo -e "${GREEN}RUNNING${NC}"
    else
        echo -e "${RED}STOPPED${NC}"
    fi

    echo ""
    if [ -f "$PID_FILE" ]; then
        read -r BACKEND_PID PLAYER_PID MIXER_PID < "$PID_FILE"
        echo "PIDs: Backend=$BACKEND_PID, Player=$PLAYER_PID, Mixer=$MIXER_PID"
    fi
}

logs() {
    echo -e "${YELLOW}=== nervbox Logs (Ctrl+C zum Beenden) ===${NC}"
    echo -e "${CYAN}[B]${NC}=Backend ${CYAN}[P]${NC}=Player ${CYAN}[M]${NC}=Mixer"
    echo ""
    tail -f /tmp/nervbox-backend.log /tmp/nervbox-player.log /tmp/nervbox-mixer.log 2>/dev/null
}

restart() {
    stop
    sleep 2
    start
}

start_silent() {
    echo -e "${YELLOW}=== nervbox Dev-Setup starten (silent) ===${NC}"

    # Prüfen ob bereits läuft
    if [ -f "$PID_FILE" ]; then
        echo -e "${RED}nervbox läuft bereits! Erst stoppen: ./start-dev.sh stop${NC}"
        exit 1
    fi

    # Backend bauen und starten
    echo -e "${GREEN}Baue und starte Backend (Port 8080)...${NC}"
    cd "$BACKEND_DIR"
    dotnet build -o "$RELEASE_DIR" -c Debug --nologo -v q
    cd "$RELEASE_DIR"
    ASPNETCORE_ENVIRONMENT=Development dotnet NervboxDeamon.dll > /tmp/nervbox-backend.log 2>&1 &
    BACKEND_PID=$!

    sleep 2
    if ! kill -0 $BACKEND_PID 2>/dev/null; then
        echo -e "${RED}Backend Start fehlgeschlagen!${NC}"
        exit 1
    fi

    # Player starten
    echo -e "${GREEN}Starte Player (Port 4200)...${NC}"
    cd "$PLAYER_DIR"
    npx ng serve --host 0.0.0.0 --allowed-hosts=all > /tmp/nervbox-player.log 2>&1 &
    PLAYER_PID=$!

    # Mixer starten
    echo -e "${GREEN}Starte Mixer (Port 4201)...${NC}"
    cd "$MIXER_DIR"
    npx ng serve --port 4201 --host 0.0.0.0 --allowed-hosts=all --configuration lan --serve-path /mixer > /tmp/nervbox-mixer.log 2>&1 &
    MIXER_PID=$!

    echo "$BACKEND_PID $PLAYER_PID $MIXER_PID" > "$PID_FILE"
    echo -e "${GREEN}Gestartet! Logs: ./start-dev.sh logs${NC}"
}

case "$1" in
    start)
        start
        ;;
    start-silent)
        start_silent
        ;;
    stop)
        stop
        ;;
    status)
        status
        ;;
    logs)
        logs
        ;;
    restart)
        restart
        ;;
    *)
        echo "Verwendung: $0 {start|stop|status|logs|restart|start-silent}"
        echo ""
        echo "  start        - Startet alle Services und zeigt Logs"
        echo "  start-silent - Startet alle Services ohne Logs"
        echo "  stop         - Stoppt alle Prozesse"
        echo "  status       - Zeigt Status aller Services"
        echo "  logs         - Zeigt Live-Logs aller Services"
        echo "  restart      - Neustart aller Services"
        exit 1
        ;;
esac
