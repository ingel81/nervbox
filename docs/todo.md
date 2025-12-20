# generell:

# backend:

2) wenn man einen browser reloaded bricht die websocket verbindung natürlich zusammen (impolizit) wir loggen das aber als WRN. können wir diese eine Sache loswerden...möchte das nicht in den logs:

[15:15:57 WRN] UpgradeResponseCanceled: Copying the upgraded response body was canceled.
System.Threading.Tasks.TaskCanceledException: The operation was canceled.
 ---> System.IO.IOException: Unable to read data from the transport connection: Operation canceled.
 ---> System.Net.Sockets.SocketException (125): Operation canceled
   --- End of inner exception stack trace ---
   at System.Net.Sockets.Socket.AwaitableSocketAsyncEventArgs.ThrowException(SocketError error, CancellationToken cancellationToken)
   at System.Net.Sockets.Socket.AwaitableSocketAsyncEventArgs.System.Threading.Tasks.Sources.IValueTaskSource<System.Int32>.GetResult(Int16 token)
   at System.Net.Http.HttpConnection.ReadAsync(Memory`1 destination)
   at System.Net.Http.HttpConnection.RawConnectionStream.ReadAsync(Memory`1 buffer, CancellationToken cancellationToken)
   --- End of inner exception stack trace ---
   at System.Net.Http.HttpConnection.RawConnectionStream.ReadAsync(Memory`1 buffer, CancellationToken cancellationToken)
   at System.Runtime.CompilerServices.PoolingAsyncValueTaskMethodBuilder`1.StateMachineBox`1.System.Threading.Tasks.Sources.IValueTaskSource<TResult>.GetResult(Int16 token)
   at Yarp.ReverseProxy.Forwarder.StreamCopier.CopyAsync(Stream input, Stream output, Int64 promisedContentLength, StreamCopierTelemetry telemetry, ActivityCancellationTokenSource activityToken, Boolean autoFlush, CancellationToken cancellation)
[15:15:57 WRN] Player proxy error: UpgradeResponseCanceled, The operation was canceled.



# player:

# mixer:

# ideen:
  - minispiele um credits wieder aufzufüllen (arkanoid, irgendwas moorhuhn artiges, flappy bird,...)

  - bei klick auf die N$ Anzeige in der Toolbar soll ein Popover daruntet erscheinen mit folgenden Optionen:
    - user sollen gambeln können...doppelte Shekel oder null (das Ergbenis davon soll auch als NERVBOX System USER auch via chat propagiert werden als normale chat message)
      bei totalverlust entsprechend hämisch und bei success mit gratulationstext
    - user sollen anderen usern shekel senden können (das auch im chat propagieren)

    - führe für solche nachrichten einen neuen message type (shekel-transactions) einrichten und verwenden, wir machen damit zunächst nichts...aber vielleicht mal für spätere filterungen

  - wir brauchen auch ein achievement system für user:
    - die achievements sollen auf dem Userprofile angezeigt werden
      - sie sollen hübsch aufbereitet sein, und entweder farbig ausgefüllt sein wenn man es hat oder monochrome einfarbig oder niedere opacty falls noch nicht
      - man soll alle achievements vorab sehen können 
      - denkbare achievements
        - angemeldet
        - guided tour beendet
        - erster sound abgespielt
        - 10 sounds agespielt
        - 100 sounds abgespielt
        - 1000 sounds abgespielt
        - 5000 sounds abgespielt
        - mixer besucht
        - sound im mixer erstellt und upload zurück zur nervbox
        - jemand hat deinen erstellten sound gefavt
        - 1 minispiel gespielt (egal welches)
        - 5 minispiele gespielt (egal welches)
        - 25 minispiele gespielt (egal welches)
        - 100 minispiele gespielt (egal welches)
        - N$ gegambelt und gewonnen
        - N$ gegambelt und alles verloren
        - im chat etwas geschrieben
        - im chat ein gif versendet
        - im chat 100 nahcrichten geschrieben
        - einem anderen user geld gesendet
        - geld von einem anderen user erhalten
        - mehr als 500 N$ besessen (momenaufnahme - achievement verschwindet danach nicht mehr)
        - mehr als 1000 N$ gehabt (momenaufnahme - achievement verschwindet danach nicht mehr)
        - von einem Admin N$ erhalten haben
        - u.v. mehr - sehr erweiterbar alles


  