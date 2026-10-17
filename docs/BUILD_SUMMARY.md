# SecureCopy 2.7.7 — barra di avanzamento stabile, 16 ottobre 2026

Barra del singolo file sempre visibile, anche prima dei byte e tra un file e l’altro. Intestazione con spazio costante e reset immediato allo 0%. Nessuna modifica al motore di copia o alla verifica SHA-256.

79 test passati. Tre nuove prove falliscono sulla 2.7.6 e passano sulla 2.7.7. Verifica Electron su 12 fasi: pannello 94 px, barra 5 px, posizione verticale invariata, confermati 0/50/100% e assenza di residui al reset. Screenshot: audit/2026-10-16/screenshots/file-progress-fixed-1.png e file-progress-fixed-5.png.

2.7.7 ARM64 installata e riaperta dopo verifica di inattività, archivio identico alla build. DMG/ZIP Apple Silicon e Intel verificati; versione precedente conservata.

## Storico precedente

# SecureCopy 2.7.6 — stress test e release, 16 ottobre 2026

76 test automatici e prove reali nell’app passati. Confronto di 399.999 file e 4.000 cartelle: 202.000 risultati; prova completa circa 31 secondi invece di 48, attesa UI massima rilevata 585 ms invece di 20.307 ms. Picco del motore circa 853 MiB invece di 1.267 MiB su processi separati con lo stesso inventario. Report interamente riletto e verificato.

Copiati/verificati file oltre 4 GiB, 90 file con 27 estensioni, 1.000 allineamenti e 1.000 copie selettive; test di spazio esaurito e sola lettura su ExFAT temporaneo. Limiti e metodologia: audit/2026-10-16/REPORT.md. Non è una certificazione su ogni dispositivo o numero illimitato di file.

Build ARM64 e Intel con runtime verificato; firma ad hoc, senza Developer ID/notarizzazione. Minimo macOS 13. Backup stabile 2.7.5 separato accanto al progetto, sorgenti e installabili con checksum.

Installazione /Applications aggiornata alla 2.7.6 ARM64 dopo verifica di inattività, riaperta e confrontata con la build. Precedente app conservata in dist/builds.

## Storico precedente

# SecureCopy 2.7.5 — audit e release, 15 ottobre 2026

Liquid Glass fisso al 70%, slider rimosso. Correzioni verificate: pubblicazione ExFAT, resource fork, controllo finale delle copie dal confronto, ripresa dopo uscita ordinata e collisioni di nomi per maiuscole/minuscole.

66 test automatici passati; prove Electron con 72 file, coda/concorrenza/pausa/annullamento/ripresa, copia da 512 MiB, immagini disco reali APFS sensibile alle maiuscole ed ExFAT. Build Intel provata tramite Rosetta, non su hardware Intel fisico. Dettagli e limiti: audit/2026-10-15/REPORT.md.

DMG e ZIP ARM64/x64 verificati; quattro checksum SHA-256 corretti. Entrambi i bundle corrispondono ai 22 file runtime attuali, firme ad hoc verificate; nessuna notarizzazione o firma Developer ID. Minimo macOS 13.

L’avviso macOS 28 è coerente con il test Intel tramite Rosetta. La build ARM64 e l’installazione verificata contengono 13 binari Mach-O tutti ARM64 nativi, senza dipendenza Intel.

## Storico precedente

# Build corrente — SecureCopy 2.7.4

15 ottobre 2026. Build separate Apple Silicon e Intel, Electron 44.4.5, macOS 13 o successivo. Firma ad hoc verificata; senza Developer ID o notarizzazione.

51 test automatici passati. Test Electron con profili temporanei passati su Apple Silicon e Intel tramite Rosetta: copie e recupero selettivo, SHA-256, data di creazione preservata, file identici non riscritti, metadati accessori come avvisi separati salvati nel report e mostrati nell’interfaccia, confronto nelle due direzioni e presenza verde in tempo reale. Nessuna prova su hardware Intel fisico. I limiti dei filesystem sono simulati nei test: non attestano tutti i dischi reali.

Il report reale del 13 ottobre aveva 188 errori esclusivamente sulla data di creazione, su MP4, JPG, DNG e LRF. La nuova versione non elimina una copia integralmente verificata per un problema di data: il file resta nella destinazione, l’esito resta parziale e la ripresa tenta solo il ripristino della data di creazione. Nessun codec viene interpretato o filtrato. Report/log conservano la pulizia interna limitata a 20 giorni.

DMG e ZIP 2.7.4 per entrambe le architetture verificati con hdiutil/unzip; quattro checksum controllati in `dist/SHA256SUMS-2.7.4.txt`. Installazione in /Applications lasciata intatta. I bundle di build 2.7.3 sono conservati sotto `dist/builds/2.7.3`; gli installabili precedenti non sono stati eliminati.

## Storico della build 2.7.3

# SecureCopy 2.7.3

Build Apple Silicon con runtime Electron 44.4.5 dell’app installata e build Intel x64 con lo stesso runtime scaricato dalla release ufficiale Electron (checksum SHA-256 verificato). Requisito minimo macOS 13 per entrambe. Firma ad hoc verificata; senza Developer ID o notarizzazione.

39 test automatici passati. Prova Electron in profilo temporaneo passata: progressi monotoni sotto il 100% fino al completamento, cartelle copiate nelle due direzioni, conferma che comprende i discendenti, righe verdi e spunte dopo verifica, file già identici non riscritti, recupero dei soli falliti e conservazione report/log di 20 giorni.

DMG e ZIP 2.7.3 per Apple Silicon e Intel verificati con hdiutil e unzip; i quattro checksum sono in `dist/SHA256SUMS-2.7.3.txt`. I 21 sorgenti runtime di primo livello corrispondono alle build. L’intera prova Electron è passata anche sulla build Intel tramite Rosetta; non è stata eseguita su hardware Intel fisico. Le prove di errore senza hard link sono simulate su APFS; non attestano tutti i filesystem reali.

L’installazione corrente non è stata sostituita durante una copia reale attiva. Il nuovo pacchetto è pronto per l’installazione dopo il completamento delle attività.

## Nota storica — 2.6.1

La versione 2.6.1 usa Electron 44.4.5 ed electron-builder 26.15.3. L'icona attuale usa il PNG personalizzato da 1024×1024 pixel come sorgente e un ICNS con tutte le dimensioni standard e Retina da 16 a 1024 pixel. Il precedente SVG è conservato come `Assets/ICON-previous.svg`. I 15 test automatici (`npm test`) passano su macOS, inclusi il caso di data di creazione successiva alla data di modifica e l'esclusione del solo marcatore `com.apple.provenance` dal confronto. Le prove integrate con Electron confermano la lingua inglese e italiana, la persistenza della scelta, il nome e il progresso del singolo file, la velocità media nelle diverse fasi, il pulsante Finder dopo la copia, le schermate alla finestra minima e l'elenco degli elementi da controllare. Le prove della versione 2.5.0 hanno confermato dieci operazioni simultanee (un confronto e nove copie), la decima copia in coda, l'annullamento e il riavvio di una copia.

Le build macOS Intel e Apple Silicon sono state generate localmente. **Non sono firmate né notarizzate**: su questo Mac non è disponibile un'identità di firma valida. Prima di distribuire pubblicamente l'app, firmare e notarizzare i pacchetti con un account Apple Developer e ripetere la verifica della firma. Le build Windows e Linux richiedono prove sui rispettivi sistemi.

Electron 44 richiede macOS 13 o successivo. Il file `package.json` definisce la stessa versione minima.
