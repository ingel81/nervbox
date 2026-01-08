Bug:
 [x] ist ein turm selektiert und man macht mit der LMB ein Pan und lässt los, wird der turm deselektiert. das soll nicht sein
     - Fix: GlobeControls 'start'/'end' Events nutzen
     - Nur als Drag werten wenn: Dauer > 150ms ODER Kamera bewegte sich > 1 unit
     - Click Handler ignoriert Clicks innerhalb 100ms nach echtem Drag
 [ ] gegner laufen am HQ angekommen die letzte etappe in der luft bis sie exakt am HQ Marker sind. liegt der in der Luft? Die sollten am boden bleiben und eher in das Gebäude  reinlaufen

Performance:
 [ ] spielt man das in einer größeren Stadt mit vielen 3d Gebäuden und straßen, kommt es beim zoomen oder panen und auch beim laden kurz zu aussetzern. 
     da läuft jeweils irgendwas langlaufendes. da sollten wir feedback geben was gerade gemacht wird und das ggfs. auch noch optimeren. parallalsieren.
     [ ] Viele gegner sind erfreulicherweiße überhaupt kein problem...nur ein problem mit paning und zooming wenn tiles dazu kommen, etc.
     [ ] ist aber nicht so dramatisch wie es sich anhört.

Allgemein:
 [x] Soundlaustärke abhängig von Kamerentfernung (kein cutoff - natürliches Verhalten)
     - SpatialAudioManager mit Three.js PositionalAudio implementiert
     - Sounds werden automatisch leiser bei Entfernung (inverse distance model)
     - Siehe docs/SPATIAL_AUDIO.md

Gegner:
 [x] Blutsystem (Gegner hinterlassen Blutflecken bei Treffer und Tod)
     - ThreeEffectsRenderer.spawnBloodSplatter() für Partikel-Effekte
     - ThreeEffectsRenderer.spawnBloodDecal() für persistente Blutflecken am Boden
     - Bei Treffer: kleine Blut-Partikel (15) + kleiner Decal (0.8m)
     - Bei Tod: große Blut-Partikel (40) + großer Decal (2.0m)
     - Decals faden nach 20s aus (über 10s)
 [ ] Spawn verhalten: wird der spawn irgendwie verzögert? es dauert bei 1000 gegner bis die wellte los geht "Gegner sammeln sich..."
    [ ] die laufen dann alle im Pulk los und sollten etwas verzögert werden. konfigurierbar am besten


Projektile:
 [x] Sichtbarkeit (erledigt)
 [ ] Sollen nur ihr Ziel erreichen können wenn wirklich eine Sichtverbindung zum Gegner besteht (Line-of-Sight)

Türme:
 [x] Sollen selektiert werden können
     - Klick auf Tower selektiert ihn (15m Click-Radius)
     - Selection Ring Animation mit Pulse-Effekt
     - Radius-Anzeige wird eingeblendet
     - Bug-Fix: geoToLocalSimple statt geoToLocal für korrekte Distanzberechnung
 [x] Tower-Details in Sidebar bei Selektion
     - TOWER Section zeigt: Name, Schaden, Reichweite, Feuerrate, Kills
     - Verkaufen-Button (50% Erstattung)
     - Upgrade-Button (disabled, "Bald verfuegbar")

 [x] Benötigen eine Radius-Anzeige wenn selektiert (diese soll wirklich satt auf dem Terrain liegen)
     - TerrainRaycaster: Direktes Raycasting für lokale X,Z Koordinaten
     - createTerrainDiscGeometryRaycast() + createTerrainEdgePointsRaycast()
     - Passt sich automatisch an Terrain-Höhen an

 [x] Hex-Grid Line-of-Sight Visualisierung
     - Flat-Top Hexagon-Grid über Turm-Reichweite
     - Grün = sichtbar, Rot = blockiert (durch Gebäude)
     - LineOfSightRaycaster raycastet von Turm-Spitze zu Hex-Zellen
     - hasLineOfSight() API für Targeting-Entscheidungen
     - Gebäude-Verdeckung funktioniert via 3D-Tiles Mesh-Intersection

UI:
 [x] Sidebar rechts mit den Optionen wie "Start Welle" und "Tower platzieren" sowie Debug
     alles in eine einheitliche Sidebar bringen (WC3/Ancient Command Style)
 [x] Sidebar neu strukturiert in Sections:
     - WELLE Section: Wave-Nummer, Gegner-Count, "Naechste Welle" Button
     - BAUEN Section: Tower-Buttons mit Kosten
     - TOWER Section: Details bei Selektion (Name, Stats, Upgrade/Verkaufen)
     - DEBUG Section: wie bisher
 [x] FPS Anzeige
     - Im Header rechts neben den Stats
     - Aktualisiert jedes Frame vom Engine
 [ ] Location Dialog nicht in unserem Style des TD. bitte Styleguide anwenden und selben background und schatten wie sidebar verwenden für dialog background. KEIN PURPLE

Kamera:
 [x] Initiale Position optimiert
     - 45 Grad Blickwinkel, Blickrichtung Norden, HQ im Zentrum
     - Initiale Position wird nach 2s gespeichert (wenn Tiles geladen)
     - Reset-Button stellt exakt diese gespeicherte Position wieder her

Gameplay:
 [x] User soll sich eine eigene Location durch Eingabe seines Ortes wählen können
     - Location-Dialog im Header (klickbarer Ortsname + Edit-Icon)
     - Autocomplete-Suche via Nominatim
     - Manuelle Koordinaten-Eingabe (Erweitert-Sektion)
     - Siehe docs/LOCATION_SYSTEM.md
 [x] Spawn-Punkte sollen in der Nähe gewürfelt werden
     - Random Spawn: 500m-1km vom HQ, muss auf Straße liegen
     - Pfad-Validierung: Nur erreichbare Punkte werden akzeptiert
     - Marker wird automatisch an Pfad-Start gesnapped
 [x] Während Development unsere aktuelle Location als Default (Erlenbach)

Location-System Bekannte Einschränkungen:
 [ ] Nominatim-Geocoding gibt oft Straßen-Koordinaten statt Gebäude-Koordinaten
     - Workaround: Manuelle Koordinaten-Eingabe nutzen
     - Mögliche Verbesserung: Alternative Geocoding-API (Photon, Google)
