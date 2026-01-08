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

Projektile:
 [x] Sichtbarkeit (erledigt)
 [ ] Sollen nur ihr Ziel erreichen können wenn wirklich eine Sichtverbindung zum Gegner besteht (Line-of-Sight)

Türme:
 [ ] Sollen selektiert werden können
 [ ] Benötigen eine Radius-Anzeige wenn selektiert (diese soll wirklich satt auf dem Terrain liegen) und auch eventuelle Verdeckungen berücksichtigen

UI:
 [ ] Sidebar rechts mit den Optionen wie "Start Welle" und "Tower platzieren" sowie Debug
     alles in eine einheitliche Sidebar bringen
 [ ] FPS Anzeige

Kamera:
 [ ] Initiale Position noch nicht perfekt

Gameplay:
 [ ] User soll sich eine eigene Location durch Eingabe seines Ortes wählen können
    [ ] Spawn-Punkte sollen in der Nähe gewürfelt werden in diesem Fall
 [ ] Während Development unsere aktuelle Location als Default
