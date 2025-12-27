# Tower Defense - TODO

[x] health bars nicht permanent sichtbar, erscheint erst wenn gegner eigentlich schon tod sein müsste.
    - FIXED: Billboard scale erhöht (1.0 -> 1.5), pixelOffset hinzugefügt

[x] gegner sterben nicht richtig und verschwinden manchmal nicht (death animation fehlt auch)
    - FIXED: _destroyed Flag verhindert dass async geladene Models zur Scene hinzugefügt werden
    - FIXED: playDeathAnimation wartet jetzt auf Model-Loading falls nötig

