# Stress test SecureCopy 2.7.6 — 16 ottobre 2026

## Backup prima delle modifiche

Versione stabile 2.7.5 conservata separatamente in:
`../BACKUP_SecureCopy_2.7.5_2026-10-16`.
Contiene sorgenti, DMG/ZIP Apple Silicon e Intel, istruzioni e checksum. L’archivio sorgenti è stato riaperto e confrontato con i sorgenti originali prima di modificarli. Le dipendenze di sviluppo sono ripristinabili dal package-lock.json.

## Problemi riprodotti e corretti

1. **Blocco dell’interfaccia su elenchi grandi.** La copia ricorsiva di centinaia di migliaia di oggetti attraverso il ponte isolato di Electron fermava la risposta per circa 20 secondi. I risultati attraversano ora il ponte come JSON e sono decodificati nella pagina. Dati e controlli conservati; provate sia analisi sia copie nelle due direzioni.
2. **Picco di memoria nella firma del confronto.** La costruzione di un secondo inventario completo e della sua stringa JSON consumava molta memoria. La stessa identica firma SHA-256 viene ora calcolata in sequenza: un test verifica l’uguaglianza esatta con il formato precedente, anche per nomi Unicode e nuove righe.
3. **Ripresa con selezioni grandi.** Per ogni file si ripercorreva l’intero elenco delle selezioni. Ora gli insiemi di percorsi e antenati permettono controlli legati alla profondità della cartella. Conservati selezione di cartelle, recupero dei soli file richiesti, errori per percorsi mancanti e protezioni contro percorsi non validi.
4. **Report grandi.** Serializzazione e scrittura in gruppi di 256 righe, invece di creare una seconda lista e un’enorme stringa formattata. Lo schema JSON e tutti i dati restano disponibili; il report di prova è stato riletto e verificato su tutte le 202.000 righe.

## Misure sullo stesso dataset

| Prova | 2.7.5 | 2.7.6 |
|---|---:|---:|
| Confronto completo nell’app, report e risultati | 48,0 s | 30,7 s |
| Massima attesa rilevata per una risposta dell’interfaccia | 20.307 ms | 585 ms |
| Dimensione report completo | 232,0 MiB | 137,9 MiB |
| Picco RSS motore in processi separati sullo stesso inventario | 1.266,9 MiB | 852,8 MiB |
| Solo motore confronto rapido | 21,3 s | 21,9 s |
| Selezione: 50.000 percorsi, 2.000 selezionati | 1.982 ms | 27,5 ms |

Il miglioramento misurato riguarda la reattività e la memoria: il motore non legge meno file e il solo censimento non è diventato più veloce. Il microbenchmark della selezione non misura la velocità di copia dei byte.

Dataset: 200.000 file per lato prima delle mutazioni; uno rimosso a destra e uno reso diverso. Quindi 399.999 file fisici enumerati e 4.000 cartelle, 202.000 risultati. Il contenuto minuscolo condiviso tramite hard link è intenzionale: misura censimento, corrispondenze, report e UI senza creare centinaia di gigabyte. Non è una prova di lettura di altrettanti video grandi. I tempi sono locali su APFS e risentono delle cache, non una previsione per USB lenti o NAS.

## Prove passate

- **76 test automatici**, zero fallimenti: protezioni, metadati, guasti, ripresa e selezioni grandi.
- **90 file**, 27 estensioni e file senza estensione; contenuti opachi, file vuoti e dimensioni attorno a 64 KiB e 1 MiB. Tutti verificati SHA-256 e data di creazione. Nomi Unicode, nuove righe, virgolette, caratteri della shell e 40 livelli di cartelle. Il nome lungo provato ha 249 byte. Nascosti esclusi.
- **4.295.032.833 byte**, oltre 4 GiB, copia intera e SHA-256 confrontati. Sorgente sparsa con marcatori casuali; tutti i byte sono stati letti per il controllo. Circa 12,4 secondi e picco RSS 179 MiB nel processo di test; non certifica ogni possibile dimensione.
- **1.000 file allineati**, 1.000 eventi verificati con presenza da entrambi i lati, verde confermato nel risultato. Seconda prova di copia selettiva su 1.000 percorsi con un percorso mancante segnalato. Circa 49,7 secondi complessivi per le due operazioni del test.
- **500.000 risultati sintetici nell’interfaccia** della 2.7.5: 300 righe iniziali, ricerca dell’ultimo risultato circa 148 ms, selezione e deselezione corrette. La prova reale 2.7.6 copre 202.000 risultati nell’intero percorso Electron.
- **Disco ExFAT reale in immagine temporanea da 64 MiB**: spazio esaurito e rimontaggio in sola lettura. Errori segnalati; contenuto precedente e sorgente conservati. Il driver può restituire ENOENT per mkdir su volume in sola lettura: la prova controlla il rifiuto della scrittura, non presume un unico codice di errore.
- File illeggibile, sorgente rinominata durante la verifica, destinazione sostituita con symlink, destinazione apparsa dopo l’analisi: nessuna sovrascrittura del contenuto estraneo. Annullamento del censimento tempestivo.
- App reale con profilo temporaneo: 72 file, coda/concorrenza/pausa/annullamento/ripresa, reset selettori; chiusura ordinata e recupero di 18 file con 2 già validi non riscritti.
- App reale 2.7.6 ARM64: conferma di cartelle espanse, copia nelle due direzioni, verde e spunte, percentuali monotone, recupero dei soli falliti, date e pulizia dei soli artefatti interni oltre 20 giorni.

## Sicurezza e limiti delle conclusioni

Tutti gli attacchi sono stati eseguiti su profili, file e immagini disco temporanei creati dal test. Nessun materiale personale o volume di lavoro è stato usato come bersaglio. Nessuno spegnimento forzato del Mac o scollegamento fisico di un disco personale.

Non è possibile certificare qualsiasi dispositivo, numero di file o dimensione: restano capacità di RAM/disco, permessi, filesystem, connessione e guasti hardware. FAT32 non ammette file oltre 4 GiB; un errore del disco non può essere eliminato dall’app. Su ExFAT possono restare limiti nel rappresentare date di creazione frazionarie o resource fork: esito parziale esplicito, mai un falso completamento. Restano le protezioni intenzionali contro link simbolici, file speciali e profondità oltre 256 livelli. Il confronto rapido usa dimensione e data: per identità dei contenuti serve il confronto completo SHA-256. Le copie continuano sempre a verificare SHA-256.

Non provati: ogni lettore/camera/NAS, scollegamento fisico sotto carico, esaurimento RAM dell’intero Mac, file nell’ordine dei terabyte, tutti i filesystem né un Mac Intel fisico. I test della nuova build sono su Apple Silicon; il runtime Intel è lo stesso precedentemente verificato tramite Rosetta.

## Strumenti e revisione

Graphify usato solo localmente in modalità AST, senza LLM/cloud e senza indicizzare dist, node_modules o audit. Il grafo aiuta a trovare chiamanti; i sorgenti e i risultati sono stati controllati direttamente. Ponytail full e revisione limitata ai cambiamenti: nessuna dipendenza aggiunta, nessun ridisegno, nessun indebolimento della verifica o dei controlli sui percorsi. Nessun problema bloccante emerso nelle verifiche del cambiamento.

I dati grezzi sono nei JSON accanto a questo documento. I percorsi temporanei riportati sono riferimenti delle prove e vengono rimossi al termine.

## Consegna

SecureCopy 2.7.6 ARM64 installata in /Applications e riaperta dopo aver verificato che non ci fossero attività. Archivio installato identico alla build verificata; precedente installazione conservata in dist/builds. DMG e ZIP 2.7.6 per entrambe le architetture verificati, quattro checksum corretti. Backup separato 2.7.5 ricontrollato: tutti i checksum corretti. Nessuna modifica al materiale personale.
