# Tower Defense - TODO

[x] Zombies:
    [x] mehr lateraler Versatz (1.5m → 3.0m)

[x] Panzer:
    [x] Überlappen sich gegenseitig → spawnStartDelay: 800ms (statt 300ms)
    [x] drehen sich manchmal kurz etwas weird:
        - Rotation Smoothing (lerp mit factor 0.15)
        - Heading basiert auf tatsächlicher Bewegungsrichtung (currentPos - previousPos) statt next waypoint
    [x] mehr lateraler Versatz (0.8m → 2.5m)
