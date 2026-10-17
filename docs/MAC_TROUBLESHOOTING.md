# SecureCopy 2.6.1: problemi su macOS

SecureCopy 2.6.1 richiede **macOS 13 o successivo**. I pacchetti generati in questa sessione sono privi di firma e notarizzazione Apple perché non era disponibile un certificato di distribuzione.

## L'app non si apre

1. Controlla in **Informazioni su questo Mac** la versione di macOS e usa il DMG adatto al processore: `arm64` per Apple Silicon, quello senza suffisso per Intel.
2. Se macOS segnala l'assenza di firma o notarizzazione, controlla la provenienza del pacchetto. Per una distribuzione pubblica, l'app deve essere firmata e notarizzata dal suo sviluppatore.
3. Se il processo si chiude dopo l'avvio, annota il messaggio di errore e la versione dell'app. Un riavvio del computer non è una correzione sistematica.

**Non disattivare Gatekeeper o altre protezioni del Mac.**

## Accesso negato a una cartella

Se macOS chiede accesso a Documenti, Scrivania o volumi rimovibili, concedilo solo per le cartelle che vuoi copiare. Puoi verificare le autorizzazioni in **Impostazioni di Sistema → Privacy e sicurezza → File e cartelle**. L'app non richiede normalmente Accesso completo al disco.

## Esito parziale

Apri il monitor e leggi le righe `ERROR` o `WARNING` nel log. Link simbolici, file illeggibili, permessi insufficienti e tipi speciali vengono segnalati invece di essere saltati in silenzio. I file già completati restano nella destinazione; puoi correggere il problema e ripetere la copia.

## Date dei file

Su macOS SecureCopy usa `ditto` e controlla data di creazione e modifica del file temporaneo prima della sostituzione finale. Se la destinazione è un filesystem che non supporta questi metadati, il file viene segnalato come non riuscito nel log.
