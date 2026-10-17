## 2.7.7 — 16 ottobre 2026

- Barra del singolo file sempre visibile: preparazione, controllo, copia, verifica, passaggio al file successivo e completamento conservano lo stesso spazio.
- Intestazione con altezza minima costante; avanzamento azzerato immediatamente quando non ci sono byte disponibili, senza animazione dal verde del file precedente.
- 79 test automatici. Tre nuove prove riproducono il problema nella 2.7.6 e passano nella 2.7.7. Prova Electron su 12 fasi: pannello 94 px, barra 5 px, posizione identica in tutte le fasi.

## 2.7.6 — 16 ottobre 2026

- Eliminato il blocco prolungato dell’interfaccia con centinaia di migliaia di risultati, trasferendo JSON attraverso il ponte isolato di Electron.
- Firma SHA-256 del confronto calcolata incrementalmente con risultato identico al formato precedente e minore picco di memoria.
- Report di confronto scritti in gruppi, con lo stesso schema e tutti i dati, senza duplicare l’intero inventario.
- Selezione e ripresa di migliaia di file senza ricerche ripetute su tutto l’elenco; conservate le protezioni dei percorsi e gli errori dei mancanti.
- 76 test automatici, confronto di circa 400.000 file, copia oltre 4 GiB, 1.000 allineamenti e guasti di spazio/sola lettura. Backup 2.7.5 separato prima delle modifiche.

## 2.7.5 — 15 ottobre 2026

- Liquid Glass fisso al 70%, anche negli avvisi disco. Rimossi slider e preferenza modificabile; rispettate le opzioni di accessibilità di macOS.
- Corretta la pubblicazione su ExFAT quando cambia l’identificativo del file durante la scrittura, compreso il recupero dopo errori.
- Resource fork conservati e verificati anche nella copia senza hard link; differenze nei dati aggiuntivi impediscono di saltare un file come identico.
- Controllo finale delle copie dal confronto in entrambe le direzioni: rimozioni o alterazioni dei file completati diventano errori visibili e riprovabili.
- Ripresa conservata anche dopo l’uscita ordinata durante una copia.
- Nomi di file e cartelle che collidono per maiuscole/minuscole sul disco di destinazione segnalati senza sostituire il primo elemento.
- 66 test automatici e prove Electron, file da 512 MiB, volumi APFS sensibili alle maiuscole ed ExFAT reali in immagini temporanee.

## 2.7.4 — 15 ottobre 2026

- Risolti i falsi errori di copia dovuti ai metadati del disco: modifica, permessi e attributi accessori producono avvisi separati, mentre contenuto/dimensione/SHA-256 restano obbligatori. Se ditto fallisce sui metadati, copia diretta con la stessa verifica dei byte.
- Data di creazione obbligatoria e verificata anche a fine operazione. Se il disco non la conserva, il contenuto già verificato resta al suo posto, l’errore è esplicito e riprovare tenta la sola correzione della data senza ricopiare i dati.
- Copia e confronto usano la stessa esclusione dei file nascosti (anche flag Finder) e delle cartelle di servizio. Nessun filtro per formato, codec o estensione; inclusi sidecar e file senza estensione.
- Controllo finale dell’inventario e dei file pubblicati: segnala materiale aggiunto alla sorgente durante la copia e file mancanti, troncati o modificati nella destinazione. Recupero dei soli percorsi interessati.
- Report con avvisi e anomalie di data distinti. Dettagli degli avvisi separati nell’interfaccia; testi piccoli e contrasto hover migliorati.
- 51 test automatici, incluse simulazioni di metadati non supportati, date non rappresentabili, corruzione, rimozione e ripresa selettiva.

## 2.7.3 — 5 ottobre 2026

- Pubblicazione esclusiva anche senza hard link: scrittura tramite file handle, conservazione delle copie incomplete e ripristino verificato del contenuto precedente quando possibile. I percorsi di recupero sono registrati negli errori; file comparsi esternamente non vengono sostituiti.
- Controllo dello spazio aggiuntivo richiesto dal fallback prima di spostare la versione precedente.
- La ripresa segnala percorsi spariti e selezioni vuote; crea soltanto le directory necessarie ai percorsi selezionati.
- La copia di una cartella dal confronto include i discendenti copiabili, esclusi i file nascosti. Conferma, controllo spazio e ricetta di recupero comprendono i file selezionati.
- Percentuale monotona fino al 99% durante le operazioni, 100% soltanto dopo il completamento. Avanzamento in byte visibile durante SHA-256 anche per i file già identici.
- Nomi interni brevi per temporanei e versioni; “Conserva entrambi” limita la lunghezza UTF-8 del nuovo nome.
- Protezione dalla sospensione durante attività e salvataggio report; uscita ordinata con annullamento e attesa dei lavori. Censimento del confronto aggiornato in tempo reale e annullabile nelle letture dei flag nascosti.
- Suite ampliata a 39 test, più verifica Electron delle cartelle nelle due direzioni, presenza verde, conferma e avanzamento.

## 2.7.2 — 5 ottobre 2026

- Verifica integrale dei file già presenti: SHA-256 e metadati preservabili completi. Se identici, nessuna copia o sovrascrittura, esito completato e zero byte trasferiti.
- Verificati anche ACL, attributi estesi, flag, proprietario, gruppo e precisione delle date; rimosso il bypass che forzava la riscrittura dal confronto.

- Eliminazione automatica a 20 giorni, soltanto dei report e log riconosciuti nella cartella dati dell’app. Esecuzione all’avvio e ogni 15 minuti. Nessuna scansione dei dischi o delle destinazioni di copia.
- Controlli su nome, schema, identità, data e link; nessuna cancellazione ricorsiva. File estranei, symlink, hard link e cartelle reindirizzate sono esclusi. I report non vengono usati come istruzioni di cancellazione.
- Salva log usa la cartella logs privata dell’app; le esportazioni precedenti in Download o altre cartelle restano fuori dalla pulizia. Impostazione fissa visibile: 20 giorni.

## 2.7.1 — 5 ottobre 2026

- Conservazione della data di creazione tramite Foundation: nessuna dipendenza da SetFile o dalla licenza Xcode. Precisione in millisecondi e controllo dopo la scrittura.
- Correzione anche per dischi senza hard link e copie da entrambi i lati del confronto.
- Operazioni distingue file esaminati e file verificati; i falliti non vengono conteggiati come completati.
- Sorgenti recuperati dall’app installata, poiché la cartella di progetto originale non era più disponibile. I test storici esclusi dal pacchetto non sono stati recuperati; nuova suite di regressione in test/mac-metadata.test.cjs.

# Changelog

## 2.6.1 - 2026-09-29

- Velocità media calcolata sull'intera operazione e mantenuta visibile durante controllo e verifica; rimossa la stima del tempo che oscillava tra le fasi.
- Pulsante **Mostra nel Finder** al termine di ogni copia, riferito alla destinazione dell'operazione selezionata anche con più copie o destinazioni.
- Il confronto ignora il solo attributo di sistema `com.apple.provenance`, aggiunto da macOS alla destinazione: contenuti e altri metadati continuano a essere verificati.
- Icona aggiornata con il PNG personalizzato fornito dall'utente; rigenerati tutti i formati ICNS per macOS.

## 2.6.0 - 2026-09-29

- Nuova icona vettoriale coerente con l'interfaccia: cartella blu, documento e scudo verde di verifica.
- Icona macOS a pieno formato, con sorgente SVG 1024×1024, PNG per Windows e Linux e ICNS con tutte le dimensioni standard e Retina da 16 a 1024 pixel.
- Interfaccia semplificata: rimossi i testi tecnici dalla schermata iniziale, dettagli nel monitor richiudibili e nome/avanzamento del file corrente in primo piano.
- Impostazioni con scelta tra Italiano e English, ricordata tra i riavvii. Icona dell'app accanto al nome nella barra laterale.
- Esiti parziali con elenco espandibile dei file da controllare e motivo specifico del mancato completamento.
- Ripristino della data di creazione quando `ditto` la appiattisce alla data di modifica, con verifica finale e test dedicato.

## 2.5.0 - 2026-09-28

- Palette blu, verde, nero e arancione in tutta l'interfaccia e nelle illustrazioni SVG, senza viola.
- Fino a dieci operazioni simultanee: copie sicure e confronto cartelle possono procedere insieme. Le operazioni aggiuntive restano in coda e partono quando si libera uno slot compatibile.
- Confronto e copie visibili nella stessa schermata Operazioni, con stato e avanzamento aggiornati.
- Protezione contro letture e scritture concorrenti sulle stesse cartelle.
- Dopo una copia conclusa o annullata, il pulsante Nuova copia riapre la preparazione; Pulisci concluse libera l'elenco senza eliminare i report.

## 2.4.0 - 2026-09-28

- Nuova schermata iniziale con accesso diretto a Copia sicura e Confronta cartelle, barra laterale e illustrazioni SVG animate al passaggio del mouse.
- Schermate di copia, confronto e operazioni ridisegnate con spaziature e comandi allineati, colori più sobri e adattamento alla finestra minima.
- Stato della copia conclusa mostrato correttamente nel monitor; navigazione tra schermate senza perdere la coda o il risultato del confronto.

## 2.3.1 - 2026-09-28

- Pulsante di avvio analisi più grande e centrato nella schermata Confronta cartelle; l’analisi parte solo su richiesta.
- Annulla analisi appare soltanto durante l’operazione attiva.
- Censimento iniziale delle due cartelle e avanzamento percentuale basato su elementi esaminati e byte effettivamente letti per SHA-256, con barra e dettagli della fase corrente.
- Rilevazione dei file cambiati tra censimento e lettura, segnalati come errore nel confronto.

## 2.3.0 - 2026-09-27

- Interfaccia a tutta finestra, pulsanti allineati e flusso dati esteso sullo sfondo, collegato a copia e pausa.
- Coda ricostruita con avvio esplicito, due copie parallele, avvio al termine, destinazioni multiple e controlli per operazione.
- Velocità ricavata dai byte effettivamente trasferiti; rimosso il grafico statico.
- Report JSON per ciascuna copia con SHA-256 e metadati dei file verificati.
- Confronto ricorsivo di due cartelle con contenuti, metadati, file mancanti, scelta dei file divergenti, copia selettiva verificata e report; menu contestuale per mostrare gli elementi nel Finder.

## 2.1.0 - 2026-09-27

- Conservazione della data di creazione e modifica dei file su macOS; verifica dei metadati prima della sostituzione finale.
- SHA-256 per ogni file, scrittura temporanea, esiti parziali e controllo di link simbolici e percorsi sovrapposti.
- Coda in attesa persistente, progresso a byte e flusso visivo leggero da sorgente a copia.
- Prevenzione dell’iniezione HTML nei log, CSP, controlli IPC e aggiornamento a Electron 44.4.5.
- Layout corretto e font di sistema al posto degli asset font non validi.

# 📝 Changelog - SecureCopy v2.0.0

## 🎉 Versione 2.0.0 - "Modern Interface & Offline Ready"

### 🚀 Novità Principali

#### 🎨 Interfaccia Completamente Ridisegnata
- **Design Glassmorphism**: Effetto vetro smerigliato con texture sottile
- **Palette Colori Moderna**: Blu scuro, teal, verde fosforescente, arancione fluo
- **Particelle Animate**: Sistema di particelle fluttuanti nell'header
- **Font Personalizzati**: Overpass Medium/Light per UI, Andale Mono per log
- **Responsive Design**: Si adatta perfettamente a tutte le dimensioni schermo

#### 🔌 Completamente Offline
- **CSS Localizzato**: TailwindCSS integrato localmente
- **Font Localizzati**: Overpass e Andale Mono scaricati e integrati
- **Zero Dipendenze Esterne**: Nessuna connessione internet richiesta
- **Installazione Standalone**: Tutto incluso nei file di distribuzione

#### 🎯 Logica Pulsanti Migliorata
- **"Genera Log"**: Appare solo alla fine della copia
- **"Interrompi Copia"**: Appare solo durante la copia
- **Gestione Stati**: Transizioni fluide tra stati dell'applicazione
- **Feedback Visivo**: Indicatori chiari dello stato corrente

#### 🔒 Finestra Credits Riprogettata
- **Design Moderno**: Layout spazioso e professionale
- **Controllo Visibilità**: Si apre solo al click sul logo
- **Animazioni Fluide**: Transizioni eleganti
- **Contenuto Arricchito**: Sezioni informative dettagliate

### 🔧 Miglioramenti Tecnici

#### 🎮 Sistema Particelle
- **Animazione File Flow**: Particelle che si muovono da sinistra a destra durante la copia
- **Stati Dinamici**: Idle → Active → Idle
- **Posizionamento Intelligente**: Evita l'area del logo
- **Performance Ottimizzata**: Gestione efficiente delle animazioni

#### 🎨 Styling Avanzato
- **Ombre Moderne**: Rimozione ombre grigie, aggiunta ombre normali
- **Effetti Glow**: Illuminazione neon per elementi importanti
- **Gradienti Dinamici**: Sfondi animati con transizioni fluide
- **Texture Sottile**: Effetto texture per maggiore profondità

#### 🔧 Gestione Errori
- **Try-Catch Completo**: Tutti i blocchi di codice protetti
- **Logging Dettagliato**: Console.error per debugging
- **Recovery Automatico**: Ripristino da errori senza crash
- **User Feedback**: Messaggi di errore chiari e informativi

### 🐛 Bug Fix

#### 🔧 Problemi Risolti
- **Duplicato Event Listener**: Rimosso listener duplicato per startBtn
- **Conflitti CSS**: Risolti override che bloccavano i pulsanti
- **Visibilità Pulsanti**: "Genera Log" e "Interrompi Copia" ora seguono la logica corretta
- **Credits Auto-opening**: Finestra credits non si apre più automaticamente
- **Font Rendering**: Risolti problemi di blur e rendering

#### 🎯 Ottimizzazioni
- **Performance**: Codice ottimizzato per velocità di esecuzione
- **Memoria**: Gestione memoria migliorata
- **Avvio**: Tempo di avvio ridotto
- **Responsività**: Interfaccia più reattiva

### 📦 Build System

#### 🔧 Configurazione
- **Electron 28.3.3**: Versione aggiornata e stabile
- **Code Signing**: Firma digitale per tutte le piattaforme
- **Entitlements**: Configurazione sicurezza per macOS
- **Multi-arch**: Supporto Intel e ARM per macOS

#### 🎯 Piattaforme Supportate
- **macOS Intel**: DMG e ZIP installer
- **macOS ARM**: DMG e ZIP installer (Apple Silicon)
- **Windows x64**: NSIS installer e versione portable
- **Dimensioni Ottimizzate**: File di distribuzione compressi

### 📋 Specifiche Tecniche

#### 🎨 Design System
- **Colori**: Blu scuro (#020617), teal (#06b6d4), verde (#22c55e), arancione (#f97316)
- **Font**: Overpass Medium 500, Overpass Light 300, Andale Mono Regular 400
- **Effetti**: Glassmorphism, glow, ombre, particelle animate
- **Layout**: Responsive, flexbox, grid system

#### 🔧 Architettura
- **Main Process**: Electron main.js
- **Renderer Process**: HTML/CSS/JavaScript
- **Preload Script**: Bridge di sicurezza
- **Assets**: Icone, font, suoni localizzati

### 🚀 Installazione

#### 📦 File di Distribuzione
- **macOS Intel**: `SecureCopy-2.0.0.dmg` (101 MB)
- **macOS ARM**: `SecureCopy-2.0.0-arm64.dmg` (95 MB)
- **Windows**: `SecureCopy Setup 2.0.0.exe` (75 MB)
- **Portable**: `SecureCopy 2.0.0.exe` (74 MB)

#### 🔧 Requisiti
- **macOS**: 10.13+ (Intel/ARM)
- **Windows**: 10 1803+ (x64)
- **RAM**: 512 MB minimo
- **Disco**: 200 MB liberi

### 📞 Supporto

- **Sviluppo**: Unshaped Studio
- **Versione**: 2.0.0
- **Data Release**: Settembre 2024
- **Compatibilità**: macOS Intel/ARM, Windows x64

---

**🎉 Grazie per aver scelto SecureCopy v2.0!**
