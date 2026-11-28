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
│   ├── deck3d/                   # 3D-Szene, Tasten-Relief, 3D-Ansicht (three.js)
│   ├── intro/                    # Lade-Intro (nutzt deck3d)
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

### 3D: Intro und 3D-Ansicht (`components/deck3d`, `components/intro`)
Die Oberseite des Geräts ist immer das echte `.app-device`-DOM: Es wird per CSS `matrix3d` exakt auf ein
three.js-Gehäuse projiziert (three.js-Canvas liegt dahinter). Blickt die Kamera senkrecht von oben, ist die
Matrix die Identität → nahtloser Übergang in die flache Oberfläche.
- `deck-scene.ts` – gemeinsame Szene (Tisch, Lampe, Kamera-Posen, `applyCssMatrix`, `unproject`).
- `deck-housing.ts` / `deck-textures.ts` – Gehäuse und Texturen, alles prozedural (keine Assets).
- `deck-relief.ts` – Tasten stehen heraus: Oberseiten per `translate` (Parallaxe aus der Kameraposition),
  Flanken/Schächte/Schatten auf einem 2D-Canvas über dem DOM (in Scroll-Containern ein mitscrollendes).
  CSS dazu: `styles/nacht/_20-view3d.scss`. Neue Bedienelement-Klassen dort in `classify()` eintragen.
- `intro/intro-engine.ts` – nur der Ablauf des Lade-Intros (Zeitplan oben in der Datei).
- `deck-view-engine.ts` + `core/services/deck-view.service.ts` – Umschalter 2D/3D (Deck-Taste „3D“, nur
  Desktop; localStorage `nervbox-view-3d`). Rendert nur bei Änderungen, keine Dauerschleife.
- `deck-layout-shim.ts` – das virtuelle Scrollen (CDK) misst per `getBoundingClientRect`; unter der
  Projektion bekommen Scroll-Container/Viewport ihr unverzerrtes Rechteck.
- Zeigerkoordinaten mit Layoutmaßen verrechnen → `DeckViewService.unproject()` (siehe Chat-Griff in `app.ts`).
- Testen: localStorage `nervbox-intro-force=1` (Intro auch in Playwright), `nervbox-intro-debug-t=<s>`
  (Standbild), `nervbox-intro-disabled=1` bzw. `?nointro`.

- **Intro-Ton / Einschalt-Taste** (`intro.component.ts`): Vor dem 3D-Intro prüft `IntroSound.canPlay()`,
  ob der Browser Ton ohne Geste erlaubt. Wenn nicht, erscheint „NERVBOX EINSCHALTEN“ (Klick/Taste gibt
  den Ton frei), währenddessen lädt `intro-engine` vor. Der Sound wird per `IntroOptions.sound` an die
  Engine übergeben. Aufprall-Sound erst planen, wenn die Intro-Uhr läuft (`clockRunning`).
- **Browser-Weichen** (`deck3d/deck-support.ts`): `isWebKitEngine()` (Safari/iOS) → flaches Intro und keine
  3D-Taste (matrix3d-Projektion weicht in WebKit ab). `isWeakDevice()` / kein WebGL → flach.
- Die Willkommens-Tour wartet, bis `html.nb-intro` weg ist (`waitForIntro()` in `welcome-tour.service.ts`).

### Weitere Bausteine
- **Neue Version nach Deploy** – `core/services/app-update.service.ts`: Service Worker (`ngsw`) liefert die
  gecachte Hülle; der Dienst fragt `SwUpdate` (Start, alle 5 min, Tab-Fokus) und zeigt eine Snackbar
  „Neu laden“. Im Dev-Server (`ng serve`) ist der Service Worker aus.
- **Schnelltasten 1–9** – `core/services/hotkey.service.ts`: Pad-Menü „Auf Taste legen“, gespeichert pro
  Benutzer in localStorage; ignoriert in Eingabefeldern, mit Modifikatoren, in Dialogen/Spielen, offenen Menüs.
- **Avatar-Kürzel** – immer `userInitials(username)` aus `shared/user-initials.ts` (nie Vor-/Nachname).
- **Audio im Browser** – `core/services/audio-engine.service.ts` (Web Audio, Effekte `core/audio/sound-fx.ts`); ohne
  Web Audio bricht nichts ab (`AUDIO_CTOR`-Prüfung), der Klick geht trotzdem an den Server.
- **Toolbar schmal** – Media-Queries in `toolbar.component.ts` (≤ 1420/1300/1240/1080 px); bei neuen
  Deck-Tasten 1024–1440 px auf Überlauf prüfen.
- **Dev-Server ist langsamer** als der Live-Build (Dev-Modus, Lazy-Chunks werden beim ersten Öffnen
  übersetzt) – Ladezeiten von Dialogen immer gegen `https://nervbox.sgeht.net` beurteilen.

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
