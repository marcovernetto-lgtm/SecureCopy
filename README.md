# SecureCopy 2.7.7
by **Unshaped Studio**

> Copia sicura, offloading e confronto cartelle per macOS con verifica di integrità SHA-256 byte per byte.

---

### ⬇️ Download per macOS (v2.7.7)

Scarica il file per il tuo Mac:

- 🍏 **[Download per Mac con Apple Silicon (M1 / M2 / M3 / M4)](https://github.com/marcovernetto-lgtm/SecureCopy/releases/download/v2.7.7/SecureCopy-2.7.7-arm64.dmg)** (`.dmg`)
- 💻 **[Download per Mac Intel](https://github.com/marcovernetto-lgtm/SecureCopy/releases/download/v2.7.7/SecureCopy-2.7.7-x64.dmg)** (`.dmg`)

*(Requisito: macOS 13 Ventura o successivo)*

---

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
- SHA-256 verifica l'uguaglianza dei contenuti letti durante l'operazione. **SecureCopy non cifra i file** e non protegge da modifiche successive alla verifica. Conservare almeno un'altra copia indipendente dei dati importanti.
- Il report è una registrazione prodotta dall'app, non una certificazione firmata da un ente terzo. È salvato nella cartella dati dell'app, sotto `reports`, e si apre dal monitor con **Mostra report** o **Apri report**. Un esito parziale o fallito non certifica la completezza della copia.

---

## Interfaccia

1. Seleziona una o più cartelle sorgente. Premi **Aggiungi destinazione** più volte per scegliere due o più destinazioni. Puoi anche trascinare cartelle nei due riquadri. Le destinazioni sono operazioni indipendenti, ciascuna con verifica e report propri.
2. **Avvia copia** parte subito. Si possono eseguire fino a dieci operazioni contemporaneamente, incluse le analisi delle cartelle. Le altre attendono in coda; copie che leggerebbero o scriverebbero nelle stesse cartelle non vengono sovrapposte. **Aggiungi alla coda** avvia dopo le operazioni attive.
3. In **Operazioni** scegli un'operazione per vedere percentuale complessiva, numero dei file completati, file corrente e avanzamento del singolo file. Dopo i primi secondi di trasferimento, la velocità media dell'intera operazione resta visibile anche durante la verifica. Al termine, **Mostra nel Finder** apre la cartella copiata se la sorgente era una sola, oppure la destinazione che contiene tutte le cartelle. Se una copia è parziale, espandi **Elementi da controllare** per vedere i percorsi e il motivo preciso. I report e il registro sono disponibili sotto **Dettagli attività**.
4. **Pausa** arresta il lavoro dopo il file corrente. **Interrompi** annulla solo l'operazione selezionata e lascia i file già completati. **Nuova copia** riapre la preparazione; **Pulisci concluse** libera l'elenco senza cancellare i report.

La lingua dell'interfaccia si cambia da **Impostazioni**: Italiano o English. La scelta resta salvata sul Mac.

La coda ripristinata dopo una chiusura riparte dai file già verificati; un file interrotto viene copiato nuovamente dall'inizio.

---

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

---

## Protezione, ripresa e opzioni

Le sostituzioni conservano la versione precedente nella cartella nascosta `.securecopy-versions` accanto al file. Nei dettagli di una riga puoi aprire le versioni precedenti. Sono disponibili anche **Conserva entrambi** e **Salta**; i file saltati restano non verificati. I percorsi delle versioni conservate vengono registrati nei report. Le versioni non vengono eliminate automaticamente e possono occupare spazio.

Se una pubblicazione fallisce, un file incompleto creato dall’operazione viene conservato nella stessa cartella delle versioni, con riferimento nell’errore. L’app tenta il ripristino verificato del contenuto precedente senza sostituire file creati esternamente. La pulizia a 20 giorni non riguarda questi file.

La percentuale resta sotto il 100% fino al completamento e al salvataggio dell’esito. Durante il controllo dei file già presenti sono mostrati anche i byte letti per SHA-256. L’app protegge le attività dalla sospensione automatica; Esci richiede l’annullamento e attende il salvataggio dello stato.

Il confronto offre selezione multipla, filtri per stato, riepilogo di byte e spazio disponibile prima delle copie, pausa dopo il file, ripresa dei rimanenti e riprova dei falliti. Il verde completo arriva dopo la verifica; gli errori restano segnalati. Annullamenti e copie parziali salvano un report.

Le copie attive vengono conservate nella coda per una ripresa esplicita dopo il riavvio. Il confronto interrotto può essere ripreso dalla schermata di scelta delle cartelle, aggiornando prima l’analisi. La ripresa ricontrolla i file e i dischi e non riparte dal byte interrotto.

Operazioni mostra solo le attività della sessione corrente e riparte vuota a ogni avvio, senza pannelli di progresso fittizi. I report restano salvati sul disco. Le copie in sospeso sono conservate separatamente e si recuperano con **Riprendi copie in sospeso** in Copia sicura; dopo il recupero puoi avviare la coda. I report e i log generati dall’app vengono conservati per **20 giorni**, soltanto nella cartella dati di SecureCopy. Le opzioni di analisi accettano nomi da escludere separati da virgola, anche con `*`, per esempio `*.tmp, cache`.

I controlli bloccano destinazioni cambiate e operazioni su percorsi sovrapposti. Vengono eseguite al massimo due copie contemporaneamente per dispositivo di destinazione. Le prove sono state svolte su macOS/APFS; la compatibilità pratica di filesystem e altri sistemi va verificata separatamente.
