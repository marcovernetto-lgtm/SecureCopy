# SecureCopy 🛡️
> **La copia sicura per Mac, spiegata semplice.**  
> Trasferisci file, schede SD e hard disk senza stress, con la certezza matematica che nessun dato venga perso o danneggiato.  
> *powered by **unshapedstudio***

---

### ⬇️ Scarica SecureCopy per il tuo Mac

Scarica l'applicazione pronta all'uso in formato `.dmg`:

- 🍏 **[Scarica per Mac Apple Silicon (M1 / M2 / M3 / M4)](https://github.com/marcovernetto-lgtm/SecureCopy/releases/latest)**
- 💻 **[Scarica per Mac Intel](https://github.com/marcovernetto-lgtm/SecureCopy/releases/latest)**

> **Come si installa:**  
> Apri il file `.dmg` scaricato, trascina l'icona di **SecureCopy** nella cartella **Applicazioni** del tuo Mac, ed è subito pronta! *(Richiede macOS 13 Ventura o successivo)*.

---

## 💡 Perché usare SecureCopy invece del classico "Copia e Incolla" del Mac?

Tutti noi siamo abituati a fare "Copia e Incolla" o a trascinare i file da una chiavetta al computer con il Finder. Nella maggior parte dei casi va bene, ma quando si tratta di **ricordi preziosi, foto di famiglia, o video di lavoro importanti**, il Finder nasconde grandi insidie:

1. ❌ **Il Finder non ti dice se un file è corrotto:** Se durante la copia si verifica un micro-errore sul disco, il Finder non se ne accorge. Ti mostra la barra verde, ma quando vai ad aprire il video mesi dopo... è rovinato o illeggibile.
2. ❌ **Se si scollega la chiavetta, devi ricominciare da zero:** Non sa quali file aveva già copiato e quali mancavano.
3. ❌ **Non può fare copie doppie simultanee:** Sei costretto a copiare prima su un disco, poi aspettare ore e ricopiare sul secondo disco di backup.

### ✨ Come ti protegge SecureCopy?
- 🔒 **Impronta digitale invisibile (Checksum SHA-256):** SecureCopy legge ogni singolo byte dell'originale e della copia. Se anche un solo pixel cambia, se ne accorge all'istante e ti avvisa. Solo quando il controllo è perfetto al 100%, il file viene certificato.
- 👯 **Copia multipla in un solo passaggio:** Puoi selezionare la tua scheda e dire all'app: *"Copiala contemporaneamente sia sull'hard disk principale che sul disco di riserva"*.
- 🔄 **Se si stacca il cavo, riparti da dove eri:** Se il computer si spegne o la scheda viene sfilata, al riavvio SecureCopy sa esattamente cosa mancava.

---

## 🚀 Come funziona: Guida visiva passo dopo passo

---

### 1. La schermata iniziale (Panoramica)
All'avvio trovi due sole scelte grandi e chiare: **Copia sicura** (per trasferire file e schede) e **Confronta cartelle** (per verificare se due cartelle sono identiche). Niente menu complicati o pulsanti misteriosi.

![Schermata iniziale](docs/screenshots/01-home.png)

---

### 2. Prepara la tua copia (Sorgente e Destinazioni)
1. Clicca su **Scegli file o cartelle** a sinistra per indicare cosa vuoi copiare (ad esempio la scheda della fotocamera).
2. Clicca su **Aggiungi destinazione** a destra per scegliere dove salvare i file. Puoi aggiungere anche più dischi per avere una copia di sicurezza immediata!
3. Premi **Avvia copia**.

![Preparazione Copia](docs/screenshots/02-copia-sicura.png)

---

### 3. Ripresa automatica o cancellazione con un click (`×`)
Se per qualunque motivo l'operazione precedente è stata interrotta (ad esempio se hai chiuso il portatile o si è staccata una presa), non perdi nulla.  
All'avvio compare un banner dedicato:
- Clicca **Riprendi copia** per continuare il trasferimento esattamente da dove si era fermato, senza ricopiare ciò che era già sano.
- Oppure clicca la comoda **`×`** per cancellarla e non vederla più se non ti interessa riprenderla.

![Ripresa o cancellazione copia interrotta](docs/screenshots/03-riprendi-copia.png)

---

### 4. Segui il trasferimento in tempo reale
Mentre SecureCopy lavora, una grafica fluida e moderna ti mostra tutto ciò che sta accadendo:
- La **velocità reale di trasferimento** (es. oltre 680 MB al secondo).
- La percentuale complessiva e il file specifico in lavorazione.
- La barra di verifica crittografica continua.

![Operazioni in corso](docs/screenshots/04-operazioni-live.png)

---

### 5. Copia finita e certificata al 100%
Al termine, l'app emette un suono gradevole di notifica e ti mostra il riepilogo verde:
- Clicca **Mostra nel Finder** per trovare subito i tuoi file copiati sul disco.
- Clicca **Report PDF (DIT)** per salvare o stampare un documento ufficiale di avvenuta copia.

![Copia completata](docs/screenshots/05-risultati-copia.png)

---

### 6. Confronta due cartelle o dischi: cosa manca?
Hai due hard disk o due cartelle e non ti ricordi se hai già salvato tutto?  
Seleziona la cartella di sinistra (Sorgente) e quella di destra (Destinazione). Puoi rimuovere o cambiare selezione in un secondo grazie ai comodi pulsanti `×` sui percorsi.

![Impostazione confronto cartelle](docs/screenshots/06-confronta-cartelle-setup.png)

---

### 7. Risultati del confronto chiari e intuitivi
In pochi secondi SecureCopy analizza tutte le cartelle e ti presenta un riassunto immediato:
- **Verde (Identici):** file già perfettamente al sicuro e identici bit per bit.
- **Azzurro (Altra posizione):** il file c'è già, ma si trova in una sottocartella diversa (così eviti di fare doppioni inutili!).
- **Arancione/Rosso (Mancanti o Diversi):** file che non sono ancora presenti sull'altro disco. Puoi copiarli con un solo clic direttamente dalla tabella!

![Risultati confronto](docs/screenshots/07-confronta-cartelle-risultati.png)

---

### 8. Impostazioni su misura e Notifiche Telegram sul telefono
Apri le impostazioni cliccando l'ingranaggio in basso a sinistra:
- 📱 **Notifiche su Telegram:** inserisci il tuo Bot Token per ricevere un messaggio sul cellulare quando la copia è finita. Così puoi allontanarti dal Mac e bere un caffè in totale tranquillità.
- 🗂️ **Separazione automatica file:** puoi chiedere all'app di dividere automaticamente i file della scheda in tre cartelle ordinate: `Video`, `Foto RAW` e `Foto JPEG`.
- 🗓️ **Conservazione dei report:** decidi tu quanti giorni conservare lo storico dei report (2, 5, 10, 20 o 30 giorni).
- 🔄 **Aggiornamenti automatici:** SecureCopy ti avvisa in automatico quando esce una nuova versione.

![Menu Impostazioni](docs/screenshots/08-impostazioni.png)

---

### 9. Il Report Professionale in PDF (Pronto per clienti e produzioni)
Se lavori nel mondo video o fotografico (o semplicemente vuoi conservare una prova documentata di ciò che hai archiviato), SecureCopy genera un **Report PDF completo e certificato**:
- Mostra il modello della fotocamera, risoluzione video, durata e codec.
- Contiene l'elenco di tutti i file con data, ora, dimensione e codice hash SHA-256.
- Perfetto per DIT, registi, clienti o per il tuo archivio personale.

![Report DIT PDF](docs/screenshots/09-report-dit.png)

---

## 🛠️ Requisiti di sistema
- **Sistema operativo:** macOS 13.0 (Ventura), macOS 14 (Sonoma), macOS 15 (Sequoia) o versioni successive.
- **Processore:** Mac con processore Apple Silicon (M1, M2, M3, M4) o processore Intel (64-bit).
- **Lingua:** Italiano e Inglese (si adatta in automatico alla lingua del tuo Mac).

---

## 🔒 Privacy & Sicurezza
SecureCopy lavora **al 100% in locale sul tuo Mac**:
- Nessun dato, video, foto o documento viene mai inviato su internet o su server esterni.
- Se attivi le notifiche Telegram, l'app contatta esclusivamente i server ufficiali di Telegram tramite connessione protetta SSL per inviarti il messaggio di fine copia.

---

### Domande frequenti (FAQ per principianti)

<details>
<summary><b>Posso spegnere il Mac mentre copia?</b></summary>
È consigliabile attendere la fine della copia. Se però la batteria si scarica o devi chiudere il portatile di fretta, SecureCopy salverà lo stato: alla riapertura ti chiederà se vuoi completare i file rimasti.
</details>

<details>
<summary><b>Posso fidarmi a formattare la scheda dopo che SecureCopy ha finito?</b></summary>
Sì! Quando vedi il messaggio verde di completamento con 0 errori, significa che ogni singolo byte della scheda è stato scritto e ricontrollato sul disco di destinazione. Per maggiore tranquillità, puoi anche esportare il report PDF prima di formattare.
</details>

<details>
<summary><b>Cosa vuol dire "Altra posizione" nel confronto cartelle?</b></summary>
Significa che un file presente nella prima cartella esiste anche nella seconda, ma è stato organizzato o spostato in una sottocartella diversa. SecureCopy è abbastanza intelligente da riconoscerlo tramite la sua impronta digitale, evitandoti di ricopiarlo e sprecare spazio su disco!
</details>

---

*Realizzato con cura da **unshapedstudio** per tutti coloro che amano i propri file.*
