# SecureCopy 2.7.7

SecureCopy copia cartelle localmente e confronta il checksum SHA-256 di **ogni file** con quello della sorgente. I file già identici vengono saltati. I file saltati per scelta non sono dichiarati verificati. Ogni operazione produce un report JSON con gli hash dei file verificati, l'esito e gli eventuali errori. La coda delle operazioni in attesa viene conservata fra le sessioni.

## Copia e metadati

- Ogni file viene preparato nella cartella di destinazione con un nome temporaneo, verificato e poi sostituito al file finale. Un'interruzione rimuove il temporaneo; i file completati restano nella destinazione.
- Ogni file visibile viene copiato come sequenza di byte: nessun filtro per estensione, formato o codec. Sono inclusi video, immagini, RAW, file ausiliari e formati sconosciuti, anche senza estensione. File/cartelle nascosti (punto iniziale o flag Finder) e cartelle di servizio riconosciute sono esclusi anche dalla copia normale.
- Su macOS la copia usa `ditto` senza shell e tenta di conservare tutti i metadati. Se il disco rifiuta i metadati, prova una copia diretta dei byte; dimensione, SHA-256 e stabilità della sorgente restano obbligatori. Le differenze di modifica, permessi o attributi accessori sono avvisi separati dagli errori di contenuto.
- **La data di creazione deve essere conservata.** Viene ripristinata con Foundation tramite `osascript`, senza Xcode. Se il disco non la rappresenta, il file integro e verificato resta nella destinazione, ma l’esito è parziale con un errore specifico e le due date nel report. Riprovare rilegge e verifica il contenuto già presente e corregge solo la data, senza riscrivere i dati. La data di modifica può differire. Nessun errore di data elimina un file già pubblicato e verificato.
- I file già uguali per dimensione, SHA-256 e resource fork non sono riscritti per sole differenze accessorie. L’eventuale data di creazione diversa viene corretta separatamente. Su Windows viene conservata tramite PowerShell; la build distribuita è macOS.
- Un esito può essere **completato**, **parziale**, **fallito** o **annullato**. File illeggibili, tipi non supportati e link simbolici vengono segnalati come problemi; non sono ignorati.
- Un controllo finale ricontrolla l’elenco visibile della sorgente e la presenza/dimensione dei file verificati nella destinazione; i file cambiati sono nuovamente letti con SHA-256. File comparsi durante la copia, mancanti o alterati vengono segnalati con un percorso per il recupero selettivo.
- Le cartelle vuote vengono ricreate. Le date di modifica delle cartelle vengono ripristinate dopo il trasferimento dei file.
- L'app blocca sorgenti sovrapposte, due sorgenti con lo stesso nome finale e una destinazione dentro la sorgente. Non segue link simbolici nella destinazione.
- I file nella destinazione che non sono nella sorgente non vengono cancellati. Una copia non è un backup con versioni storiche.

SHA-256 verifica l'uguaglianza dei contenuti letti durante l'operazione. **SecureCopy non cifra i file** e non protegge da modifiche successive alla verifica. Conservare almeno un'altra copia indipendente dei dati importanti.

Il report è una registrazione prodotta dall'app, non una certificazione firmata da un ente terzo. È salvato nella cartella dati dell'app, sotto `reports`, e si apre dal monitor con **Mostra report** o **Apri report**. Un esito parziale o fallito non certifica la completezza della copia.

## Interfaccia

1. Seleziona una o più cartelle sorgente. Premi **Aggiungi destinazione** più volte per scegliere due o più destinazioni. Puoi anche trascinare cartelle nei due riquadri. Le destinazioni sono operazioni indipendenti, ciascuna con verifica e report propri.
2. **Avvia copia** parte subito. Si possono eseguire fino a dieci operazioni contemporaneamente, incluse le analisi delle cartelle. Le altre attendono in coda; copie che leggerebbero o scriverebbero nelle stesse cartelle non vengono sovrapposte. **Aggiungi alla coda** avvia dopo le operazioni attive.
3. In **Operazioni** scegli un'operazione per vedere percentuale complessiva, numero dei file completati, file corrente e avanzamento del singolo file. Dopo i primi secondi di trasferimento, la velocità media dell'intera operazione resta visibile anche durante la verifica. Al termine, **Mostra nel Finder** apre la cartella copiata se la sorgente era una sola, oppure la destinazione che contiene tutte le cartelle. Se una copia è parziale, espandi **Elementi da controllare** per vedere i percorsi e il motivo preciso. I report e il registro sono disponibili sotto **Dettagli attività**.
4. **Pausa** arresta il lavoro dopo il file corrente. **Interrompi** annulla solo l'operazione selezionata e lascia i file già completati. **Nuova copia** riapre la preparazione; **Pulisci concluse** libera l'elenco senza cancellare i report.

La lingua dell'interfaccia si cambia da **Impostazioni**: Italiano o English. La scelta resta salvata sul Mac.

La coda ripristinata dopo una chiusura riparte dai file già verificati; un file interrotto viene copiato nuovamente dall'inizio.

## Confronta cartelle

Apri **Confronta cartelle**, scegli due cartelle separate nella prima schermata e premi **Avvia confronto**. Analisi, copie e risultati vengono mostrati in una seconda schermata senza i selettori delle cartelle. **Scelta cartelle** torna alla configurazione quando non ci sono operazioni in corso; la ricerca è sotto l’elenco. La modalità predefinita **Rapida** visita anche le sottocartelle e confronta percorsi, dimensioni e date di modifica senza leggere il contenuto dei file o interrogare i metadati estesi. File con la stessa dimensione e data possono avere contenuti diversi: una corrispondenza rapida non è una verifica SHA-256.

File e cartelle con nome che inizia con un punto (inclusi `.DS_Store` e `._…`) vengono esclusi dal confronto e dalle relative copie; su macOS sono esclusi anche quelli con il flag nascosto del Finder. La copia sicura ordinaria mantiene il suo comportamento.

La lista mostra solo mancanti, diversi ed elementi che richiedono una verifica manuale. Apri **Dettagli** su una riga per leggere motivi, dimensioni e date; nella modalità completa sono disponibili anche gli hash. In **Dettagli e report** puoi mostrare anche gli elementi corrispondenti e aprire il report; nella schermata di scelta cartelle, **Opzioni di analisi** permette di scegliere **Completa**, che confronta SHA-256, creazione, modifica, permessi, proprietario e gruppo, oltre a flag, ACL e attributi estesi su macOS (escluso `com.apple.provenance`).

- **→ Destra / ← Sinistra** su una riga copia quel file nella direzione scelta; su una cartella comprende anche i discendenti copiabili. Per un file in una sottocartella mancante vengono create le cartelle necessarie. La conferma comprende i file e le cartelle della selezione espansa.
- **Copia tutti i mancanti** completa i mancanti in entrambe le cartelle senza sostituire i file presenti.
- **Tutti sinistra → destra / Tutti destra → sinistra** copia i mancanti e diversi presenti nel lato scelto. I file presenti soltanto nella destinazione restano conservati. Una conferma riepiloga le sostituzioni prima di avviarle.

Durante la copia lo sfondo della riga si riempie di verde nella direzione scelta; durante SHA-256 resta al 95%. Ogni file diventa completamente verde soltanto dopo il completamento della verifica SHA-256, senza attendere la fine dell’intera operazione. Le righe completate restano visibili fino alla successiva analisi; eventuali errori restano segnalati.

Le copie mantengono la verifica SHA-256 anche con analisi rapida. Prima di copiare vengono controllati i file scelti e i loro percorsi; al termine sono aggiornati i risultati interessati, senza rifare il confronto dell’intero albero. Gli altri esiti risalgono all’ultima analisi; **Analizza di nuovo** li aggiorna tutti. Link simbolici ed elementi non supportati non vengono copiati automaticamente.

Il clic destro apre **Mostra nel Finder**. Ogni analisi e copia salva un report JSON nella cartella `reports` dell’app, con modalità, differenze, eventuali errori e hash dei file copiati e verificati. Nella modalità rapida i file solamente confrontati non hanno un hash.

## Protezione, ripresa e opzioni

Le sostituzioni conservano la versione precedente nella cartella nascosta `.securecopy-versions` accanto al file. Nei dettagli di una riga puoi aprire le versioni precedenti. Sono disponibili anche **Conserva entrambi** e **Salta**; i file saltati restano non verificati. I percorsi delle versioni conservate vengono registrati nei report. Le versioni non vengono eliminate automaticamente e possono occupare spazio.

Se una pubblicazione fallisce, un file incompleto creato dall’operazione viene conservato nella stessa cartella delle versioni, con riferimento nell’errore. L’app tenta il ripristino verificato del contenuto precedente senza sostituire file creati esternamente. La pulizia a 20 giorni non riguarda questi file.

La percentuale resta sotto il 100% fino al completamento e al salvataggio dell’esito. Durante il controllo dei file già presenti sono mostrati anche i byte letti per SHA-256. L’app protegge le attività dalla sospensione automatica; Esci richiede l’annullamento e attende il salvataggio dello stato.

Il confronto offre selezione multipla, filtri per stato, riepilogo di byte e spazio disponibile prima delle copie, pausa dopo il file, ripresa dei rimanenti e riprova dei falliti. Il verde completo arriva dopo la verifica; gli errori restano segnalati. Annullamenti e copie parziali salvano un report.

Le copie attive vengono conservate nella coda per una ripresa esplicita dopo il riavvio. Il confronto interrotto può essere ripreso dalla schermata di scelta delle cartelle, aggiornando prima l’analisi. La ripresa ricontrolla i file e i dischi e non riparte dal byte interrotto.

Operazioni mostra solo le attività della sessione corrente e riparte vuota a ogni avvio, senza pannelli di progresso fittizi. I report restano salvati sul disco. Le copie in sospeso sono conservate separatamente e si recuperano con **Riprendi copie in sospeso** in Copia sicura; dopo il recupero puoi avviare la coda. I report e i log generati dall’app vengono conservati per **20 giorni**, soltanto nella cartella dati di SecureCopy. Le opzioni di analisi accettano nomi da escludere separati da virgola, anche con `*`, per esempio `*.tmp, cache`.

I controlli bloccano destinazioni cambiate e operazioni su percorsi sovrapposti. Vengono eseguite al massimo due copie contemporaneamente per dispositivo di destinazione. Le prove sono state svolte su macOS/APFS; la compatibilità pratica di filesystem e altri sistemi va verificata separatamente.

## Sviluppo e verifiche

La 2.7.1 è stata recuperata dal pacchetto installato, perché la cartella di progetto precedente non era più disponibile. Il runtime installato è Electron 44.4.5. Node.js 22.12 o successivo è richiesto dagli strumenti di confezionamento.

```bash
npm ci
npm test
npm run build:mac
node test/package-metadata-smoke.cjs
npm run package:mac
```

`npm run build:mac` crea `dist/mac-arm64/SecureCopy.app` riutilizzando il runtime dell’app installata in `/Applications/SecureCopy.app`, senza modificare l’installazione. Il pacchetto generato deve essere assente prima di ripetere il comando; un pacchetto già presente viene lasciato intatto. La build verifica identità, firma, integrità ASAR e corrispondenza ai sorgenti. `npm run package:mac` verifica la build Apple Silicon corrente, genera DMG e ZIP, controlla entrambi e salva i checksum SHA-256.

Per Intel: scarica lo ZIP `electron-v44.4.5-darwin-x64.zip` e `SHASUMS256.txt` dalla release ufficiale Electron; esegui `node scripts/package-intel.cjs /percorso/electron-v44.4.5-darwin-x64.zip /percorso/SHASUMS256.txt`. Lo script controlla il checksum, la stessa versione del runtime e l’architettura Intel, riutilizza le risorse dell’app corrente e firma la build. Verifica con `npm run test:electron -- x64`, poi genera gli installabili con `npm run package:mac -- x64`. Il file dei checksum comprende i pacchetti presenti di entrambe le architetture.

La firma è ad hoc, non Developer ID e non notarizzata. Electron 44 richiede macOS 13 o successivo. Gli script storici per altri sistemi e i test esclusi dall’app originale non sono stati recuperati.

L'app non invia i file a server e non include telemetria. I collegamenti esterni presenti nelle impostazioni sono limitati a indirizzi fissi.

Licenza: ISC.

Nel confronto il colore della riga indica la presenza: rosso se manca da un lato, verde se presente in entrambi. La conferma SHA-256 è distinta dalla presenza e gli errori rimangono visibili nei dettagli. Durante l’allineamento, differenze di date o permessi non rappresentabili sul filesystem sono avvisi nel report; i controlli sui contenuti e sulle modifiche concorrenti restano obbligatori. La copia sicura ordinaria mantiene la verifica rigorosa dei metadati.

### Aspetto e Liquid Glass

L’interfaccia usa Avenir Next su macOS, con alternative native sulle altre piattaforme. Copia sicura ha accenti teal, Confronta cartelle accenti verdi, con sfumature ambientali lente. Le animazioni delle illustrazioni in Panoramica sono conservate.

Liquid Glass è fisso al 70% in tutta l’interfaccia, inclusi gli avvisi dei dischi. Lo slider e la preferenza modificabile sono stati rimossi; i valori salvati nelle versioni precedenti non hanno effetto. I colori di presenza e l’avanzamento delle righe restano indipendenti dall’effetto vetro. Le preferenze di sistema per ridurre movimento e trasparenza vengono rispettate. Le impostazioni si chiudono con Esc e mantengono la navigazione da tastiera all’interno della finestra.

Verifica Electron isolata: `npm run test:electron`. Usa un profilo e cartelle temporanei; i dati reali dell’app non vengono modificati. Lo script storico `test/design-preview.cjs` non è stato recuperato.

### Scaricamento di schede e dischi · 2.7.0

Su macOS, SecureCopy riconosce i nuovi volumi esterni mentre resta aperta anche in background. Non scandisce tutti i file per rilevarli: legge il punto di montaggio, le informazioni del disco e l’eventuale cartella DCIM. Ignora i dischi già presenti all’avvio, dischi interni, immagini disco e volumi di rete. Il pannello in alto a destra compare una sola volta per collegamento e si chiude dopo 25 secondi; la scheda rimane accessibile dal menu SecureCopy nella barra dei menu finché è collegata.

**Prepara copia** apre Copia sicura con il nuovo volume come sorgente e nessuna destinazione. Nessun trasferimento parte automaticamente. La rimozione del disco chiude l’avviso; una sorgente sostituita dopo la preparazione viene rifiutata fino a una nuova scelta. **Non ora** chiude solo l’avviso. Chiudere la finestra lascia SecureCopy nella barra dei menu; **Esci da SecureCopy** e Cmd+Q terminano il monitoraggio.

In **Impostazioni → Schede e dischi** puoi disattivare gli avvisi e abilitare l’avvio in background all’accesso, disattivato per default. L’app installata usa gli Elementi login di macOS; se macOS richiede un’approvazione, le impostazioni indicano dove concederla. La versione di sviluppo usa un LaunchAgent dedicato alla sola SecureCopy, scritto esclusivamente quando attivi l’opzione e rimosso quando la disattivi. L’avvio di sviluppo richiede che il progetto rimanga nello stesso percorso.

Gli installatori 2.7.0 richiedono **macOS 13 Ventura o successivo**: è il requisito di Electron 44. Sono disponibili per Intel (`x64`) e Apple Silicon (`arm64`). Le versioni macOS precedenti richiederebbero un ramo distinto basato su un runtime precedente.

La versione precedente disponeva di test del flusso scheda in sessione isolata; i relativi sorgenti non erano inclusi nell’app recuperata. Il pacchetto 2.7.1 non include cartelle di test, dipendenze di sviluppo, backup o installatori precedenti.

### Report e log · 2.7.2

La conservazione è fissa a 20 giorni. La pulizia viene eseguita all’avvio e ogni 15 minuti, soltanto nei figli `reports` e `logs` della cartella dati dell’app. Richiede nomi, schema/marker e identificativo di SecureCopy corrispondenti, e sia il completamento sia la modifica del file devono risalire ad almeno 20 giorni. Non visita sorgenti, destinazioni, dischi, sottocartelle né cartelle di versioni; non segue symlink e non elimina hard link. Le vecchie esportazioni manuali altrove non vengono cercate o rimosse. **Salva log** salva un HTML leggibile nella cartella interna `logs` e lo mostra nel Finder. File copiati, versioni precedenti, configurazioni e dati di recupero restano esclusi dalla pulizia.

### File già presenti · 2.7.2

La copia sicura legge interamente ogni sorgente e ogni destinazione candidata per confrontare SHA-256. Per considerarli già validi devono corrispondere anche dimensione, creazione/modifica, permessi, proprietario, gruppo, flag, ACL e attributi estesi. I valori operativi del filesystem (inode, ctime e ultimo accesso) e il marcatore di sistema macOS com.apple.provenance non indicano identità del materiale. La tolleranza delle date è soltanto di 10 microsecondi per l’arrotondamento delle API, anche dopo la copia; viene preservata la precisione sotto il millisecondo. File già validi non vengono copiati o sovrascritti, nemmeno con Conserva entrambi o Salta; sono elencati con SHA-256 nel report e conteggiati tra i già validi. Con tutti i file corrispondenti: Completata, zero copiati, tutti già validi, zero byte trasferiti, nessuna nuova versione e nessuna riscrittura delle directory esistenti. La prova verifica contenuti diversi anche quando dimensione e data coincidono.

## Stress test 2.7.6

Confronto reale di circa 400.000 file, 202.000 risultati e report completo: circa 31 secondi sul Mac di prova, contro 48 secondi della 2.7.5; eliminato il blocco dell’interfaccia di circa 20 secondi. Firma del confronto e report serializzati senza duplicare l’intero inventario. Ripresa con grandi selezioni indicizzata per percorso. Nessuna riduzione dei controlli SHA-256.

Provati file oltre 4 GiB, 27 estensioni senza interpretare codec, nomi Unicode, 1.000 allineamenti, spazio esaurito e sola lettura su ExFAT temporaneo. Dettagli, misure e limiti: [resoconto dello stress test](audit/2026-10-16/REPORT.md).

La barra del singolo file rimane sempre visibile nella scheda di avanzamento: quando non sono ancora disponibili i byte del nuovo file resta vuota allo 0%. Preparazione, copia, verifica e passaggio al file successivo mantengono lo stesso spazio.
