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
- `npm run lint` - Run ESLint to check for code quality issues
- `npm run lint:fix` - Run ESLint with auto-fix
- `npm run format` - Format code with Prettier

## Architecture

### Standalone Angular 21 Application
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
│  NOW PLAYING: [User] spielt [Sound]                         │
└─────────────────────────────────────────────────────────────┘
```

### File Structure
```
src/app/
├── app.component.ts              # Root + Main Layout
├── app.config.ts                 # Provider configuration
├── core/
│   ├── services/                 # API, Auth, Sound, Chat, SignalR
│   ├── interceptors/             # JWT interceptor
│   └── models/                   # TypeScript interfaces
├── components/
│   ├── toolbar/                  # Header toolbar
│   ├── sound-grid/               # Sound list + cards
│   ├── tag-filter/               # Tag chip filters
│   ├── chat-widget/              # Chat overlay
│   ├── now-playing/              # Live playback indicator
│   ├── stats-popup/              # Top sounds/users dialog
│   └── auth/                     # Login/Register dialogs
└── shared/
    └── pipes/                    # Duration pipe, etc.
```

### Backend API
- Base URL: `/api` (production), `http://localhost:5000/api` (development)
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

## Design System

### Colors (match nervbox-mixer)
- Primary Purple: #9333ea
- Secondary Pink: #ec4899
- Dark Background: #0a0a0a / #1a1b1f
- Accent Orange: #f97316

### Typography
- Monospace: JetBrains Mono
- Body: Inter, system-ui

### Material Theme
- Dark theme with heavy customization
- Purple/pink accent colors
- Glassmorphism effects

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
