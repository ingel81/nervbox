# Hotdog Katapult - Progress

## Status: BETA - Sprites integriert, Testing ausstehend

## Was implementiert wurde:

### Gameplay
- Angry Birds-Style Slingshot-Mechanik
- Hotdog auf Katapult (unten links)
- Ziehen zum Spannen des Katapults
- Loslassen zum Schießen
- Parabelflug mit Schwerkraft und Rotation
- Trajektorie-Vorschau (gestrichelte Linie beim Zielen)

### Grafik/Sprites ✨ NEU
- **Sprite-Sheet** mit Pixel-Art Grafiken
- **Hotdog**: Detailliertes Hotdog-Sprite mit Senf
- **Katapult**: Holz-Schleuder Sprite
- **Gesichter**: 6 verschiedene hungrige Gesichter (Frau, Männer mit Caps)
- **Hintergrund**: Jahrmarkt-Szene (Riesenrad, Heißluftballon, Zaun)
- **Logo**: "HOTDOG KATAPULT" auf Holzschild

### Ziele
- 6 verschiedene hungrige Gesichter-Sprites
- Zufällige Positionierung (rechte Bildschirmhälfte)
- Zufällige Größenskalierung
- Punkte basierend auf Entfernung (weiter = mehr Punkte)
- "YUM!" Animation bei Treffern
- Treffer-Feedback (Schrumpfen + Ausblenden)

### Rundenlogik
- 5 Hotdogs pro Runde
- Nach allen Hotdogs: Nächste Runde wenn Treffer, sonst Game Over
- Steigende Schwierigkeit (mehr Ziele pro Runde, max 6)

### UI
- Orange/Gelb Farbschema (passend zum Hotdog-Theme)
- Score-Anzeige
- Runden-Anzeige
- Hotdog-Counter (🌭 Icons)
- Overlays für Start, Rundenende, Game Over
- Logo-Sprite im Start-Overlay

### Integration
- KAPLAY Engine (Nachfolger von Kaboom.js)
- Game Selection Dialog aktualisiert
- "NEU!" Badge im Spielemenü
- Credit-System Integration vorbereitet

## TODO - Nächste Session:

### Bugfixing
- [ ] Touch-Events testen (Mobile)
- [ ] Kollisionserkennung verfeinern
- [ ] Edge Cases prüfen (z.B. sehr kurze/lange Würfe)

### Testing
- [ ] Manuelles Testing im Browser
- [ ] Mobile Testing
- [ ] Performance prüfen

### Verbesserungen
- [ ] Sound-Effekte hinzufügen
- [ ] Partikel-Effekte bei Treffern
- [ ] Bewegende Ziele in höheren Runden?
- [ ] Power-Ups?
- [ ] Hindernisse?

### Balancing
- [ ] Punkte-System anpassen
- [ ] Schwierigkeitskurve tunen
- [ ] Reward-System (N$) konfigurieren

## Technische Details

### Dateien
- `hotdog-game.component.ts` - Hauptkomponente
- `public/games/hotdog/` - Sprite-Dateien:
  - `sprites.png` - Original Sprite-Sheet (1024x1536)
  - `hotdog.png` - Hotdog Sprite
  - `slingshot.png` - Katapult Sprite
  - `background.png` - Hintergrund
  - `face0.png` - `face5.png` - Gesichter
  - `logo.png` - Spiel-Logo

### Dependencies
- KAPLAY (kaplay) - Game Engine
- Angular Material - UI Components

### Canvas
- 700x500 Pixel
- KAPLAY managed das Rendering

## Bekannte Issues
- TypeScript strict mode erfordert bracket notation für KAPLAY GameObj Properties
- Keine Sounds implementiert
- Keine Partikel-Effekte
