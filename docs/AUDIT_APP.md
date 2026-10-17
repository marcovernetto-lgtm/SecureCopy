# SecureCopy — correzioni del controllo del 30 settembre 2026

Documento storico: per la versione corrente vedere `AUDIT_2026-10-05.md`, `CHANGELOG.md` e `README.md`. I conteggi dei test e le opzioni di conservazione riportati qui sotto descrivono quella revisione, non la 2.7.3.

Le anomalie riprodotte nel controllo sono state corrette. Questa revisione sostituisce il rapporto precedente: sotto sono documentati interventi, verifiche e limiti pratici.

## Integrità dei file e dei percorsi

- La copia conserva e riverifica identità (`dev`, `ino`, tipo e permessi) della radice, del volume e degli antenati, sia della sorgente sia della destinazione. Una radice sostituita o un disco cambiato ferma la scrittura. Le identità vengono salvate anche nella coda per la ripresa.
- Prima della pubblicazione del file verificato viene controllato lo snapshot della destinazione. Una modifica esterna intervenuta durante la copia produce un conflitto e non viene sostituita silenziosamente.
- I file sostituiti vengono conservati nella cartella nascosta `.securecopy-versions` accanto alla destinazione. Le cartelle delle versioni che sono link simbolici vengono rifiutate. I percorsi delle versioni sono inclusi nei report.
- La pubblicazione su filesystem che supportano hard link usa la creazione esclusiva del nuovo percorso; se nel frattempo compare un altro file, l'app non lo sovrascrive. La versione precedente resta conservata anche se la pubblicazione fallisce.
- Su filesystem senza hard link viene utilizzata una copia con creazione esclusiva, controllo dei metadati e checksum finale. Se il filesystem non può conservare i metadati richiesti, l'operazione viene segnalata come fallita, senza dichiararla verificata.
- Sono disponibili tre politiche: sostituire conservando la versione precedente, conservare entrambi con un nome nuovo, oppure saltare. I file saltati per scelta non vengono dichiarati verificati.
- Le cartelle interne delle versioni e i temporanei SecureCopy non vengono ricopiati dalla copia ordinaria.

## Confronto e prestazioni

- La copia di un singolo file controlla quel file, la destinazione e gli antenati, senza rileggere l'intero albero. Le selezioni multiple usano indici Map.
- Il risultato viene aggiornato per gli elementi effettivamente interessati. Gli altri risultati restano quelli dell'ultima analisi: interfaccia e report lo indicano esplicitamente. `Analizza di nuovo` esegue un controllo completo dello stato corrente.
- La creazione di `.DS_Store` non invalida la scelta di file invariati: per le cartelle vengono controllati identità e tipo, evitando di confondere cambiamenti delle loro date con cambiamenti del contenuto selezionato.
- File dot e cartelle dot restano esclusi; su macOS viene letto anche il flag nascosto Finder. Se un gruppo di letture dei flag fallisce, viene riprovato elemento per elemento. È aggiunta la lettura dell'attributo Hidden su Windows tramite PowerShell.
- Le opzioni consentono esclusioni per nomi, per esempio `*.tmp, cache`; i nomi di cartella esclusi escludono anche i loro figli.
- SHA-256 della copia rimane conservativo: la sorgente viene verificata prima e dopo il trasferimento. Non è stato eliminato questo controllo per risparmiare letture I/O.

## Avanzamento, annullamento e ripresa

- Confronto e Operazioni condividono una percentuale complessiva monotona: controllo preliminare 0–15%, copie 15–90%, verifica 90–99%, completamento 100%. Il riparto per fasi è una stima, non un ETA.
- Ogni riga usa lo sfondo come progresso del file. Il riempimento verde cresce da sinistra se si copia a destra, da destra se si copia a sinistra. Durante il controllo SHA-256 resta al 95%; il verde completo viene applicato soltanto dopo il completamento verificato. Gli eventi tardivi dei byte non fanno tornare rossa una riga completata.
- Annullamenti e errori restituiscono e salvano un riepilogo parziale. I file già completati restano presenti e le righe vengono mantenute aggiornate.
- Sono disponibili pausa tra i file, ripresa dei rimanenti e riprova dei falliti. Prima di riprovare dal confronto viene aggiornata l'analisi e richiesta la conferma della nuova scelta.
- La coda registra anche le copie attive: dopo un'interruzione vengono riproposte come lavori recuperati, da avviare esplicitamente. La ripresa usa verifiche dei file, non una continuazione cieca del vecchio stato.
- Il confronto salva una ricetta persistente con direzioni, modalità, esclusioni e scelte rimanenti; al riavvio `Riprendi confronto interrotto` aggiorna l'analisi prima di proporre le copie.
- Le operazioni che puntano a percorsi equivalenti tramite link vengono bloccate prima di avviare le scritture. Il controllo del caso su macOS/Windows è conservativo. Sono consentite al massimo due copie simultanee per dispositivo di destinazione; le altre vengono accodate.

## Interfaccia e report

- Scelta delle cartelle e risultati restano in due schermate separate. La ricerca rimane sotto l'elenco.
- Il pannello dei risultati è scorrevole alle dimensioni minime, mantenendo raggiungibili ricerca, filtri e dettagli.
- Sono disponibili filtri per mancanti, diversi, verificati ed errori, checkbox per la selezione multipla e comandi per copiare la selezione nella direzione scelta. I comandi della selezione appaiono solo quando serve.
- Prima delle copie dal confronto viene presentato un riepilogo con numero di elementi, byte, politica sulle sostituzioni e spazio disponibile nei volumi di destinazione.
- Operazioni distingue una corrispondenza rapida da una verifica dei contenuti.
- La cronologia delle copie e dei confronti viene ricostruita dai report al riavvio; l'indice mantiene fino a 200 report e la cronologia visibile 20 operazioni.
- Le impostazioni offrono conservazione dei report per sempre, 90 giorni oppure un anno. Il valore predefinito conserva tutto. Una durata finita richiede conferma nell'interfaccia e riguarda soltanto i report SecureCopy, mai i file copiati né le versioni precedenti.

## Verifiche effettuate

- 41 test automatizzati passati: motore di copia e confronto, progresso, radice sostituita, modifica esterna alla destinazione, versioni precedenti, conservazione di entrambi, salto senza falsa verifica, `.DS_Store`, annullamento parziale, confronto incrementale, byte e direzione, alias, limite per dispositivo, coda recuperata e cronologia.
- Verifica Electron con dati simulati: passaggio fra schermate, copia singola, copia direzionale, verde dopo verifica, fallimento senza verde, riempimento nelle due direzioni e controllo a 740×560.
- Prova completa Electron con profilo e cartelle temporanei: due file copiati da destra a sinistra, video da 8 MiB, eventi reali di byte, due righe verdi finali, una versione precedente conservata, journal di ripresa rimosso a successo, operazione completed al 100%, nessun errore JavaScript.
- Nessuna prova ha usato o modificato i file dell'utente. L'app già aperta non è stata interrotta.

## Limiti della verifica

Le prove sono state eseguite su macOS/APFS. Non sono una certificazione su hardware guasto, spegnimenti improvvisi, exFAT, SMB, Windows o Linux. Il fallback senza hard link e la lettura Hidden Windows sono implementati ma richiedono prove su quei sistemi. I controlli di identità riducono le race tra verifica e uso; non costituiscono isolamento del filesystem contro un processo ostile che modifica contemporaneamente gli stessi percorsi. Le copie interrotte ripartono dal file intero, non dal byte interrotto. Le versioni precedenti sono conservate senza eliminazione automatica e occupano spazio.

Comandi di verifica (la prova Electron usa un profilo e file temporanei):

```bash
npm test
node test/audit-repros.cjs
npm run test:electron
```
