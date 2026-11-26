# CLAUDE.md

This file provides guidance to Claude Code when working with code in this repository.

## Critical Instructions

### German Feedback Requirements
1. **Objektives Feedback**: Gib immer Feedback, das auf überprüfbaren Fakten und Daten basiert.
2. **Sicherheit bei Zustimmung**: Bestätige nur dann, dass ich richtig liege, wenn du zu 100% sicher bist.
3. **Nachfragen bei Unklarheiten**: Wenn eine Aussage mehrdeutig ist, frage nach Klarstellung.

### Development Constraints
- **niemals starten ...nur bauen** - Never run `npm start`, only build
- **niemals issues schließen oder commiten ohne befehl dazu** - Never close issues or commit without explicit command
- **Full ESLint + Prettier setup** - Strict TypeScript linting with auto-fix capabilities
- **Strict Angular Templates** - strictTemplates enabled for maximum type safety

## Commands

- `npm run build` - Create production build
- `npm run build:prod` - Production build with optimizations
- `npm run build:lan` - Build for Raspberry Pi deployment
- `npx eslint src` - Run ESLint (no npm lint script)
- `npx eslint src --fix` - Run ESLint with auto-fix
- `npm run format` - Format code with Prettier

## Architecture

### Standalone Angular 22 Application
- **No NgModules** - Components use standalone: true and import dependencies directly
- **Angular Signals** - All state management uses signals
- **Bootstrap** - Uses `bootstrapApplication()` in main.ts
- **State Management** - Services with signals for reactive state

### Single Page Layout
```
┌─────────────────────────────────────────────────────────────┐
│  TOOLBAR: Logo | Search | Tags | [Stats] [Chat] [User]      │
├─────────────────────────────────────────────────────────────┤
│  Sound Grid (responsive, multiple cards per row)            │
├─────────────────────────────────────────────────────────────┤
│  KANALZÜGE: alle gleichzeitig laufenden Sounds              │
└─────────────────────────────────────────────────────────────┘
```

### File Structure
```
src/app/
├── app.ts                        # Root + Main Layout
├── app.config.ts                 # Provider configuration
├── core/
│   ├── services/                 # API, Auth, Sound, Chat, SignalR, Achievements, etc.
│   │   ├── achievement.service.ts
│   │   ├── api.service.ts
│   │   ├── auth.service.ts
│   │   ├── avatar.service.ts
│   │   ├── credit.service.ts
│   │   ├── favorites.service.ts
│   │   ├── selection.service.ts
│   │   ├── signalr.service.ts
│   │   ├── sound.service.ts
│   │   ├── user-cache.service.ts
│   │   ├── user.service.ts
│   │   ├── vote.service.ts
│   │   └── welcome-tour.service.ts
│   ├── interceptors/             # JWT interceptor
│   └── models/                   # TypeScript interfaces
├── components/
│   ├── admin/                    # Admin Panel
│   ├── auth/                     # Login/Register dialogs
│   ├── avatar-upload-dialog/     # Avatar upload
│   ├── chat/                     # Chat component
│   ├── chat-widget/              # Chat overlay widget
│   ├── mini-games/               # Minispiele
│   ├── now-playing/              # Live playback indicator
│   ├── shared/                   # Shared components
│   ├── sound-grid/               # Sound list + cards
│   ├── stats/                    # Stats component
│   ├── stats-popup/              # Top sounds/users dialog
│   ├── tag-filter/               # Tag chip filters
│   └── toolbar/                  # Header toolbar
└── shared/
    └── pipes/                    # Duration pipe, etc.
```

### Backend API
- Base URL: `/api` (relativ, dev + prod). Dev: Backend auf 4710 proxied den Player, `ng serve` (4711) nutzt `proxy.conf.json` → 4710
- Authentication: JWT Bearer tokens (14 days validity)
- Real-time: SignalR hubs at `/ws/chatHub`, `/ws/soundHub`

### Key Endpoints
- `GET /api/sound` - List all sounds
- `GET /api/sound/{hash}/play` - Play sound
- `GET /api/sound/statistics/topsounds` - Top 25 sounds
- `GET /api/sound/statistics/topusers` - Top 25 users
- `POST /api/users/auth/login` - Login
- `POST /api/users/auth/register` - Register (1 account per IP)
- `GET /api/chat` - Get chat messages

## Design System – „Nachtschicht“ (Jubiläumsedition 30 Jahre CABD)

Das ganze Gerät ist ein Putty-Vintage-Soundboard um 3 Uhr nachts: Licht kommt aus hinterleuchteten
Gummitasten, LCD und LEDs plus Schreibtischlampe oben links. Quelle des Designs: Claude-Design-Canvas
(Seite „Runde 6“), Datei `nacht.css`.

### Wo liegt was
- `src/styles/nacht/` – Nacht-Kit als SCSS-Partials (`_01-tokens` … `_18-cart`), Präfix `nk-`, BEM.
  Tokens als CSS-Variablen in `:root` (`--nk-*`). Neue Bausteine IMMER hier ergänzen, nicht pro Komponente.
- `src/styles/_material-nacht.scss` – Angular Material an das Gerät angepasst (M3-Systemtokens, Dialog-,
  Menü-, Tooltip-, Snackbar-Oberflächen).
- `src/styles/nervbox.scss` – Einstieg (in `angular.json` registriert).
- `src/styles.css` – nur Tour (Shepherd), Legacy-Variablen, Plattform-Fixes.
- `src/app/shared/tag-tone.ts` – DB-Tagfarbe → Gummi-Palette (`--nk-key-*` inline).

### Farbsemantik
- Grün `--nk-own` = eigener laufender Sound · Eisblau `--nk-other` = fremder laufender Sound
- Rot = Gefahr/Stopp/ungelesen · Lampenweiß = Auswahl/Primäraktion (`nk-key--accent`)
- Kein Lila/Pink, Orange nicht als Highlight.

### Schriften (index.html)
Barlow Condensed (UI), IBM Plex Mono (Meta), VT323 (LCD), Courier Prime (Chat-Bondrucker), Michroma (Logo).

### Layout
`app.ts`: `.nk-desk` › `.nk-device` mit Deck (`toolbar`), Tag-Leiste (`tag-filter`), Pad-Platte
(`sound-grid` mit CABD-Wasserzeichen, Top-Sounds groß bei „Meistgespielt“), Bondrucker-Chat
(`chat-sidebar`), Kanalzüge (`channels/channel-strip`). ≤ 768 px: `mobile/mobile-bar` (Laufend-Leiste +
Tastenreihe Sounds/Chat/Spielhalle/Shop/Mehr).
`core/services/now-playing.service.ts` leitet aus SignalR `soundPlayed` ab, was gerade läuft (Pads + Kanäle).

### Dialoge
Wurzel `.nk-dlg`, darin `.nk-dialog__head` / `__body` / `__foot`; Felder `.nk-field` + `.nk-input`,
Tasten `.nk-key` (`--accent`, `--ghost`, `--danger`, `--sm`, `--icon`). Breite bestimmt der Inhalt
(`dialog.open(...)` nur mit `maxWidth: '95vw'`).

## Git Configuration

### Commit Message Format
Use conventional prefixes:
- `fix:` - Bug fixes
- `feat:` - New features
- `refactor:` - Code restructuring
- `chore:` - Maintenance tasks

**Kein Claude Footer** - No automatic Claude signatures in commits

## Quality Gates

```bash
# Before committing changes:
npm run lint          # Check for linting errors
npm run lint:fix      # Auto-fix what's possible
npm run format        # Format code consistently
npm run build         # Verify build succeeds
```
