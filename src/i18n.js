// UI language is local to this Mac. File names and paths are never sent anywhere.
(() => {
  const words = new Map(Object.entries({
    'Scegli le due cartelle da confrontare.': 'Choose the two folders to compare.',
    'Opzioni di analisi': 'Analysis options',
    'Avvia confronto': 'Start comparison',
    'Analisi e risultati': 'Analysis and results',
    'Scelta cartelle': 'Folder selection',
    'Dettagli e report': 'Details and report',
    'Opzioni e dettagli': 'Options and details',
    'Analisi': 'Analysis',
    'Rapida · dimensione e data': 'Quick · size and date',
    'Completa · SHA-256 e metadati': 'Full · SHA-256 and metadata',
    'Mostra anche i corrispondenti': 'Show matching items too',
    'La modalità rapida include le sottocartelle, senza leggere i contenuti. Stessa dimensione e data non garantiscono contenuti identici.': 'Quick mode includes subfolders without reading contents. Matching size and date do not guarantee identical contents.',
    'Tutti sinistra → destra': 'All left → right',
    'Tutti destra → sinistra': 'All right → left',
    'Tutti Sorgente → Destinazione': 'All source → destination',
    'Tutti Destinazione → Sorgente': 'All destination → source',
    '→ Destra': '→ Right',
    '← Sinistra': '← Left',
    '→ Destinazione': '→ Destination',
    '← Sorgente': '← Source',
    'Manca a destra': 'Missing on right',
    'Manca a sinistra': 'Missing on left',
    'Manca in destinazione': 'Missing in destination',
    'Manca in sorgente': 'Missing in source',
    'Diverso': 'Different',
    'Corrispondente': 'Matching',
    'Dettagli': 'Details',
    'Copiato e verificato': 'Copied and verified',
    'Cartella creata': 'Folder created',
    'Copia da controllare · apri Dettagli': 'Copy needs attention · open Details',
    '✓ Verificato': '✓ Verified',
    'Nessuna differenza rilevata': 'No differences detected',
    'Nessun risultato per questa ricerca.': 'No results for this search.',
    'Nessun file mancante o diverso.': 'No missing or different files.',
    'File diversi': 'Different files',
    'File esistenti': 'Existing files',
    'Sostituisci e conserva la versione precedente': 'Replace and keep the previous version',
    'Conserva entrambi': 'Keep both',
    'Salta': 'Skip',
    'Riprova i falliti': 'Retry failures',
    'Riprendi i rimanenti': 'Resume remaining files',
    'Riprendi / riprova i falliti': 'Resume / retry failures',
    'Riprendi confronto interrotto': 'Resume interrupted comparison',
    'Tutti i risultati': 'All results',
    'Tipo di risultato': 'Result type',
    'Mancanti': 'Missing',
    'Diversi': 'Different',
    'Verificati': 'Verified',
    'Errori': 'Errors',
    'Seleziona visibili': 'Select visible',
    'Deseleziona': 'Clear selection',
    'Copia e Dischi': 'Copy and Disks',
    'Sistema e Preferenze': 'System and Preferences',
    'Separa Video, RAW e JPEG': 'Separate Video, RAW and JPEG',
    'Avviso sonoro a fine copia': 'Sound alert on completion',
    'Espulsione automatica disco': 'Auto-eject disk after copy',
    'Notifiche Telegram': 'Telegram Notifications',
    'Notifica a fine copia': 'Notification on copy completion',
    'Rileva ID': 'Detect ID',
    'Invia notifica di prova': 'Send test notification',
    'Selezionati → destra': 'Selected → right',
    'Selezionati → sinistra': 'Selected → left',
    'Selezionati → Destinazione': 'Selected → destination',
    'Selezionati → Sorgente': 'Selected → source',
    'Opzioni di copia': 'Copy options',
    'Controllo sorgente…': 'Checking source…',
    'Verifica SHA-256…': 'Verifying SHA-256…',
    'Corrispondenza rapida': 'Quick match',
    'Contenuti verificati': 'Verified contents',
    'Esiti aggiornati per i file scelti; gli altri risalgono all’ultima analisi.': 'Results updated for selected files; other results are from the last analysis.',
    'Versioni sinistra': 'Left versions',
    'Versioni destra': 'Right versions',
    'Versioni sorgente': 'Source versions',
    'Versioni destinazione': 'Destination versions',
    'Mantieni sorgente': 'Keep source',
    'Mantieni destinazione': 'Keep destination',
    'Nessuna versione precedente disponibile.': 'No previous version available.',
    'Escludi nomi': 'Exclude names',
    'Nomi esclusi dal confronto': 'Names excluded from comparison',
    'Conservazione report': 'Report retention',
    'Report di Verifica PDF': 'PDF Verification Report',
    'I tuoi file originali non vengono mai modificati né cancellati (sorgente protetta in sola lettura).': 'Your original files are never modified or deleted (source is write-protected).',
    'Puoi ridurre la finestra a icona. Non scollegare la scheda o il disco finché la barra non è verde.': 'You can minimize this window. Do not disconnect the card or disk until the bar turns green.',
    'Conservazione report e log': 'Report and log retention',
    '20 giorni': '20 days',
    'Solo report e log nella cartella dell’app. I file copiati e le versioni precedenti non vengono eliminati.': 'Only reports and logs in the app data folder. Copied files and previous versions are never removed.',
    '✓ Log salvato nella cartella dell’app (20 giorni)': '✓ Log saved in the app data folder (20 days)',
    'Sempre': 'Forever',
    '90 giorni': '90 days',
    '1 anno': '1 year',
    'In pausa dopo il file': 'Paused after the file',
    'Panoramica': 'Overview',
    'Copia sicura': 'Secure copy',
    'Confronta cartelle': 'Compare folders',
    'Operazioni': 'Operations',
    'Impostazioni': 'Settings',
    'Schede e dischi': 'Cards and drives',
    'Avvia in background all’accesso': 'Start in background at login',
    'Avvisa quando collego un nuovo disco': 'Alert when a new drive is connected',
    'Il messaggio prepara la sorgente. Scegli tu la destinazione e quando iniziare.': 'The alert prepares the source. You choose the destination and when to start.',
    'Consenti SecureCopy in Impostazioni di Sistema → Generali → Elementi login.': 'Allow SecureCopy in System Settings → General → Login Items.',
    'L’avvio automatico è disponibile su macOS.': 'Automatic startup is available on macOS.',
    'Nessuna operazione in questa sessione.': 'No operations in this session.',
    'Riprendi copie in sospeso': 'Recover pending copies',
    'Riprendi copia': 'Resume copy',
    'Copia interrotta in sospeso': 'Interrupted copy pending',
    'Confronto interrotto in sospeso': 'Interrupted comparison pending',
    'Annulla e non riprendere': 'Cancel and do not resume',
    'Annulla e non riprendere la copia': 'Cancel and do not resume copy',
    'Annulla e non riprendere il confronto': 'Cancel and do not resume comparison',
    'Aspetto': 'Appearance',
    'Generali': 'General',
    'Solido': 'Solid',
    'Vetro': 'Glass',
    'Regola trasparenza, riflessi e profondità dei pannelli.': 'Adjust panel transparency, reflections and depth.',
    'Cosa vuoi fare?': 'What would you like to do?',
    'Copia i file in una o più destinazioni.': 'Copy files to one or more destinations.',
    'Prepara una copia': 'Set up a copy',
    'Trova differenze e file mancanti.': 'Find differences and missing files.',
    'Scegli le cartelle': 'Choose folders',
    'Vedi attività': 'View activity',
    'Scegli cosa copiare e dove conservarlo.': 'Choose what to copy and where to save it.',
    'Vedi operazioni': 'View operations',
    'Sorgente': 'Source',
    'Destinazioni': 'Destinations',
    'Nessuna sorgente selezionata': 'No source selected',
    'Nessuna destinazione selezionata': 'No destination selected',
    'Scegli cartelle': 'Choose folders',
    'Aggiungi destinazione': 'Add destination',
    'Aggiungi alla coda': 'Add to queue',
    'Avvia copia': 'Start copy',
    'In attesa': 'Waiting',
    'Avvia coda': 'Start queue',
    'Nuova copia': 'New copy',
    'Nuovo confronto': 'New comparison',
    'Pronto': 'Ready',
    'Nessuna operazione selezionata': 'No operation selected',
    'File in corso': 'Current file',
    'Elemento in esame': 'Current item',
    'Pausa': 'Pause',
    'Riprendi': 'Resume',
    'Interrompi': 'Stop',
    'Mostra report': 'Show report',
    'Mostra nel Finder': 'Show in Finder',
    'Destinazione non disponibile per questa operazione.': 'Destination unavailable for this operation.',
    'File non copiati': 'Files not copied',
    'Pulisci concluse': 'Clear finished',
    'Svuota coda': 'Clear queue',
    'Dettagli attività': 'Activity details',
    'Registro attività': 'Activity log',
    'Apri report': 'Open reports',
    'Salva log': 'Save log',
    'Qui trovi i dettagli delle operazioni.': 'Operation details appear here.',
    'Cartella sinistra': 'Left folder',
    'Cartella destra': 'Right folder',
    'Nessuna cartella scelta': 'No folder selected',
    '1 cartella selezionata': '1 folder selected',
    'Scegli cartella': 'Choose folder',
    'Avvia analisi cartelle': 'Compare folders',
    'Annulla analisi': 'Cancel analysis',
    'Seleziona due cartelle per iniziare.': 'Select two folders to begin.',
    'Copia e verifica i file mancanti': 'Copy and verify missing files',
    'Identico': 'Identical',
    'Da verificare': 'Review',
    'Mancante': 'Missing',
    'Nome e differenze': 'Name and differences',
    'Sin.': 'Left',
    'Des.': 'Right',
    'Azione': 'Action',
    'Clic destro su un risultato per mostrarlo nel Finder.': 'Right-click a result to show it in Finder.',
    'Lingua': 'Language',
    'Informazioni sull’app': 'About the app',
    'Copie verificate e confronto delle cartelle.': 'Verified copies and folder comparison.',
    'Powered by Unshaped Studio': 'powered by unshapedstudio',
    'powered by unshapedstudio': 'powered by unshapedstudio',
    'Aggiornamenti': 'Updates',
    'Verifica nuova versione': 'Check for new version',
    'Verifica ora': 'Check now',
    'Verifica aggiornamenti': 'Check for updates',
    'Controllo aggiornamenti in corso...': 'Checking for updates...',
    'SecureCopy è aggiornato all’ultima versione.': 'SecureCopy is up to date.',
    'Aggiornamento disponibile': 'Update available',
    'Aggiornamento pronto': 'Update ready',
    'Riavvia ora': 'Restart now',
    'Riavvia per completare l’aggiornamento': 'Restart to complete the update',
    'Scaricamento in corso...': 'Downloading update...',
    'Installazione in corso...': 'Installing update...',
    'Offrimi un caffè': 'Buy me a coffee',
    'Operazione non riuscita': 'Operation failed',
    'Chiudi': 'Close',
    'Chiudi impostazioni': 'Close settings',
    'Filtra risultati': 'Filter results',
    'Cerca nei risultati': 'Search results',
    'Avanzamento analisi': 'Analysis progress',
    'Completata': 'Completed',
    'Avvisi sui metadati': 'Metadata notices',
    'Questi avvisi riguardano date, permessi o attributi del disco. Gli errori di contenuto sono elencati separatamente.': 'These notices concern dates, permissions or filesystem attributes. Content errors are listed separately.',
    'Completato': 'Completed',
    'Parziale': 'Partial',
    'Fallita': 'Failed',
    'Fallito': 'Failed',
    'Annullata': 'Cancelled',
    'Annullato': 'Cancelled',
    'Terminata': 'Finished',
    'Copia perfetta': 'Perfect copy',
    'Copia da verificare': 'Copy needs review',
    'File mancanti': 'Missing files',
    'Pausa dopo il file': 'Pausing after file',
    'In pausa': 'Paused',
    'Preparazione': 'Preparing',
    'Controllo dei file': 'Checking files',
    'Copia in corso': 'Copying',
    'Verifica in corso': 'Verifying',
    'In corso': 'In progress',
    'Verifica': 'Verifying',
    'Controllo': 'Checking',
    'Inizializzazione...': 'Starting…',
    'In attesa...': 'Waiting…',
    'Confronto cartelle': 'Folder comparison',
    'Allineamento cartelle': 'Folder synchronization',
    'Censimento delle cartelle…': 'Scanning folders…',
    'Dieci operazioni già in corso': 'Ten operations already running',
    'Avvia ora in parallelo': 'Start now in parallel',
    'Avvia al termine delle operazioni': 'Start after current operations',
    'In attesa di uno spazio': 'Waiting for a slot',
    'Sposta su': 'Move up',
    'Sposta giù': 'Move down',
    'Rimuovi dalla coda': 'Remove from queue',
    'Copia automatica': 'Copy automatically',
    'Verifica manuale': 'Review manually',
    'Presente': 'Present',
    'Scegli quale tenere': 'Choose which to keep',
    'Mantieni sinistra': 'Keep left',
    'Mantieni destra': 'Keep right',
    'Analisi in corso…': 'Analyzing…',
    'Copia in corso…': 'Copying…',
    'Analizza di nuovo': 'Analyze again',
    'Annulla copia': 'Cancel copy',
    'Cartelle pronte. Premi Avvia analisi cartelle.': 'Folders ready. Start the analysis.',
    'Censimento delle cartelle in corso…': 'Scanning folders…',
    'Controllo delle cartelle prima della copia…': 'Checking folders before copying…',
    'Motivo non disponibile': 'Reason unavailable',
    'Metadati non conservati: data di creazione.': 'Creation date could not be preserved.',
    'Metadati non conservati: data di modifica.': 'Modification date could not be preserved.',
    'Metadati non conservati: permessi.': 'Permissions could not be preserved.',
    'data di creazione non conservata': 'Creation date could not be preserved',
    'Data di creazione, modifica o permessi non conservati.': 'Creation date, modification date or permissions could not be preserved.',
    'Impossibile conservare la data di creazione: SetFile non è disponibile su questo Mac.': 'Creation date could not be preserved: SetFile is unavailable on this Mac.',
    'Link simbolico non copiato per sicurezza': 'Symbolic link not copied for safety',
    'Tipo di file non supportato': 'Unsupported file type',
    'Interrompi copia': 'Stop copy',
    'Vuoi interrompere? I file già completati rimarranno; il file in corso non verrà salvato.': 'Stop this copy? Completed files will remain; the current file will not be saved.',
    'Continua': 'Continue',
    'Coda completata': 'Queue complete',
    'Copia ripresa': 'Copy resumed',
    'Coda svuotata': 'Queue cleared',
    '✓ Log HTML generato': '✓ HTML log created',
    'Trascina solo cartelle nella sorgente.': 'Drop folders in the source area only.',
    'La destinazione deve essere una cartella.': 'The destination must be a folder.',
    'tipo': 'type',
    'contenuto SHA-256': 'SHA-256 content',
    'dimensione': 'size',
    'data di creazione': 'creation date',
    'data di modifica': 'modification date',
    'permessi': 'permissions',
    'proprietario': 'owner',
    'gruppo': 'group',
    'attributi estesi': 'extended attributes',
    'collegamento': 'link'
  }));

  function translateItalian(value) {
    if (words.has(value)) return words.get(value);
    let match;
    if ((match = value.match(/^(\d+) cartell[ae] selezionat[ae]$/)))
      return `${match[1]} folder${match[1] === '1' ? '' : 's'} selected`;
    if ((match = value.match(/^(\d+) destinazion[ei] selezionat[ae]$/)))
      return `${match[1]} destination${match[1] === '1' ? '' : 's'} selected`;
    if ((match = value.match(/^(\d+) di (\d+) file completati$/)))
      return `${match[1]} of ${match[2]} files completed`;
    if ((match = value.match(/^(\d+) di (\d+) file esaminati$/)))
      return `${match[1]} of ${match[2]} files processed`;
    if ((match = value.match(/^(\d+) di (\d+) file verificati$/)))
      return `${match[1]} of ${match[2]} files verified`;
    if ((match = value.match(/^(\d+) file trovati$/))) return `${match[1]} files found`;
    if ((match = value.match(/^Avvia (\d+) copie$/))) return `Start ${match[1]} copies`;
    if ((match = value.match(/^(\d+) di (\d+) elementi analizzati$/)))
      return `${match[1]} of ${match[2]} items analyzed`;
    if ((match = value.match(/^Avvisi sui metadati \((\d+)\)$/))) return `Metadata notices (${match[1]})`;
    if ((match = value.match(/^(\d+) element(?:o|i) da controllare$/)))
      return `${match[1]} item${match[1] === '1' ? '' : 's'} to review`;
    if ((match = value.match(/^(\d+) operazion[ei] in corso · (\d+) in attesa$/)))
      return `${match[1]} running · ${match[2]} waiting`;
    if ((match = value.match(/^(\d+) in corso · (\d+) in attesa$/)))
      return `${match[1]} running · ${match[2]} waiting`;
    if ((match = value.match(/^(\d+) in attesa$/))) return `${match[1]} waiting`;
    if ((match = value.match(/^Copia (\d+) cartella\/e → (.*)$/)))
      return `Copy ${match[1]} folder${match[1] === '1' ? '' : 's'} → ${match[2]}`;
    if ((match = value.match(/^Confronto: (.*)$/))) return `Comparison: ${match[1]}`;
    if ((match = value.match(/^Allineamento: (.*)$/))) return `Synchronization: ${match[1]}`;
    if ((match = value.match(/^In corso (\d+)%$/))) return `Running ${match[1]}%`;
    if ((match = value.match(/^Velocità media · (.*)$/))) return `Average speed · ${match[1]}`;
    if ((match = value.match(/^(Controllo|Verifica) · (\d+%) · (.*)$/))) return `${match[1] === 'Controllo' ? 'Checking' : 'Verification'} · ${match[2]} · ${match[3]}`;
    if ((match = value.match(/^(\d+) selezionati$/))) return `${match[1]} selected`;
    if ((match = value.match(/^Seleziona (.*)$/))) return `Select ${match[1]}`;
    if ((match = value.match(/^Circa (\d+)m (\d+)s rimanenti$/)))
      return `About ${match[1]}m ${match[2]}s remaining`;
    if ((match = value.match(/^(\d+) elementi analizzati\.$/))) return `${match[1]} items analyzed.`;
    if ((match = value.match(/^Mostra altri \((\d+)\)$/))) return `Show more (${match[1]})`;
    if ((match = value.match(/^Copia e verifica: (\d+) mancanti · (\d+) scelti$/)))
      return `Copy and verify: ${match[1]} missing · ${match[2]} selected`;
    if ((match = value.match(/^(Completata|Parziale|Fallita|Annullata) — (\d+) copiati · (\d+) già validi · (\d+) problemi$/)))
      return `${words.get(match[1])} — ${match[2]} copied · ${match[3]} already valid · ${match[4]} issues`;
    if ((match = value.match(/^Copia tutti i mancanti \((\d+)\)$/))) return `Copy all missing (${match[1]})`;
    if ((match = value.match(/^(\d+) elementi corrispondono per dimensione e data\.$/))) return `${match[1]} items match by size and date.`;
    if ((match = value.match(/^(\d+) elementi identici secondo l’analisi completa\.$/))) return `${match[1]} identical items according to full analysis.`;
    if ((match = value.match(/^Copia perfetta — (\d+) elementi identici\.$/)))
      return `Perfect copy — ${match[1]} identical items.`;
    if ((match = value.match(/^File mancanti — (\d+) elementi assenti, (\d+) da verificare\.$/)))
      return `Missing files — ${match[1]} missing, ${match[2]} to review.`;
    if ((match = value.match(/^Copia da verificare — (\d+) elementi con differenze\.$/)))
      return `Copy needs review — ${match[1]} different items.`;
    if ((match = value.match(/^Metadati non conservati: (.*)\.$/)))
      return `Metadata not preserved: ${match[1].replaceAll('data di creazione', 'creation date').replaceAll('data di modifica', 'modification date').replaceAll('permessi', 'permissions')}.`;
    if ((match = value.match(/^Copia e verifica (\d+) di (\d+): (.*)$/)))
      return `Copy and verify ${match[1]} of ${match[2]}: ${match[3]}`;
    if ((match = value.match(/^(\d+) file copiati e verificati · (\d+) errori · (\d+) elementi ancora da verificare\.$/)))
      return `${match[1]} files copied and verified · ${match[2]} errors · ${match[3]} items left to review.`;
    if ((match = value.match(/^Scegli quale file tenere: (.*)$/))) return `Choose which file to keep: ${match[1]}`;
    if ((match = value.match(/^Rimuovi (.*)$/))) return `Remove ${match[1]}`;
    if ((match = value.match(/^(\d+) copia\/e avviata\/e o pianificata\/e$/)))
      return `${match[1]} copies started or scheduled`;
    if ((match = value.match(/^(\d+) copia\/e aggiunta\/e alla coda$/)))
      return `${match[1]} copies added to the queue`;
    if ((match = value.match(/^Pausa richiesta per (.*)$/))) return `Pause requested for ${match[1]}`;
    if ((match = value.match(/^Sorgente \(Drag\): (.*)$/))) return `Source (drag): ${match[1]}`;
    if ((match = value.match(/^Destinazione \(Drag\): (.*)$/))) return `Destination (drag): ${match[1]}`;
    if ((match = value.match(/^1 cartella selezionata: (.*)$/))) return `1 folder selected: ${match[1]}`;
    if ((match = value.match(/^SecureCopy · Versione (.*)$/))) return `SecureCopy · Version ${match[1]}`;
    if ((match = value.match(/^(Analisi|Controllo preliminare|Verifica finale): censimento (?:cartella )?(sinistra|destra|sorgente|destinazione) · (\d+) elementi trovati · (.*)$/)))
      return `${{Analisi:'Analysis','Controllo preliminare':'Pre-check','Verifica finale':'Final verification'}[match[1]]}: scanning ${(match[2] === 'sinistra' || match[2] === 'sorgente') ? 'source' : 'destination'} · ${match[3]} items found · ${match[4]}`;
    if ((match = value.match(/^(Analisi|Controllo preliminare|Verifica finale) (?:cartella )?(sinistra|destra|sorgente|destinazione): (\d+)\/(\d+) elementi( · .* letti)? · (.*)$/)))
      return `${{Analisi:'Analysis','Controllo preliminare':'Pre-check','Verifica finale':'Final verification'}[match[1]]} ${(match[2] === 'sinistra' || match[2] === 'sorgente') ? 'source' : 'destination'}: ${match[3]}/${match[4]} items${match[5] ? match[5].replace(' di ', ' of ').replace(' letti', ' read') : ''} · ${match[6]}`;
    if ((match = value.match(/^Sorgente: (.*)$/))) return `Source: ${translateItalian(match[1])}`;
    if ((match = value.match(/^Destinazione aggiunta: (.*)$/))) return `Destination added: ${match[1]}`;
    if ((match = value.match(/^Avvio: (.*)$/))) return `Started: ${translateItalian(match[1])}`;
    if ((match = value.match(/^Copia completata: (.*)$/))) return `Copy completed: ${translateItalian(match[1])}`;
    if (value.includes(' · Esiti aggiornati per i file scelti; gli altri risalgono all’ultima analisi.')) return translateItalian(value.replace(' · Esiti aggiornati per i file scelti; gli altri risalgono all’ultima analisi.', '')) + ' · Results updated for selected files; other results are from the last analysis.';
    if (value.includes(' · ')) {
      const parts = value.split(' · ');
      if (parts.every(part => words.has(part))) return parts.map(part => words.get(part)).join(' · ');
    }
    return value;
  }

  let language = 'it';
  try { language = localStorage.getItem('securecopy-language') === 'en' ? 'en' : 'it'; }
  catch { /* The app still works if localStorage is unavailable. */ }
  const originals = new WeakMap();
  const originalAttributes = new WeakMap();
  const attributes = ['title', 'aria-label', 'placeholder'];

  function localizeText(node) {
    if (!node.parentElement || node.parentElement.closest('script, style')) return;
    if (!originals.has(node)) originals.set(node, node.nodeValue);
    const original = originals.get(node);
    const match = original.match(/^(\s*)([\s\S]*?)(\s*)$/);
    const next = language === 'en'
      ? match[1] + translateItalian(match[2]) + match[3] : original;
    if (node.nodeValue !== next) node.nodeValue = next;
  }
  function localizeElement(element) {
    let saved = originalAttributes.get(element);
    if (!saved) { saved = new Map(); originalAttributes.set(element, saved); }
    for (const attribute of attributes) {
      if (!element.hasAttribute(attribute)) continue;
      if (!saved.has(attribute)) saved.set(attribute, element.getAttribute(attribute));
      const original = saved.get(attribute);
      const next = language === 'en' ? translateItalian(original) : original;
      if (element.getAttribute(attribute) !== next) element.setAttribute(attribute, next);
    }
  }
  function localizeSubtree(root) {
    if (root.nodeType === Node.TEXT_NODE) { localizeText(root); return; }
    if (root.nodeType !== Node.ELEMENT_NODE) return;
    localizeElement(root);
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      if (walker.currentNode.nodeType === Node.TEXT_NODE) localizeText(walker.currentNode);
      else localizeElement(walker.currentNode);
    }
  }
  function setLanguage(value) {
    language = value === 'en' ? 'en' : 'it';
    document.documentElement.lang = language;
    try { localStorage.setItem('securecopy-language', language); } catch { /* optional */ }
    const select = document.getElementById('language-select');
    if (select) select.value = language;
    localizeSubtree(document.body);
    window.electronAPI?.setLanguage(language).catch(() => {});
  }
  const observer = new MutationObserver(records => {
    for (const record of records) {
      if (record.type === 'attributes') {
        const element = record.target;
        const name = record.attributeName;
        const saved = originalAttributes.get(element);
        const oldOriginal = saved?.get(name);
        const current = element.getAttribute(name);
        const expected = oldOriginal == null ? null :
          language === 'en' ? translateItalian(oldOriginal) : oldOriginal;
        if (current === null) saved?.delete(name);
        else if (current !== expected && saved) saved.set(name, current);
        localizeElement(element);
      } else for (const node of record.addedNodes) localizeSubtree(node);
    }
  });
  observer.observe(document.body, { childList: true, attributes: true,
    attributeFilter: attributes, subtree: true });
  document.getElementById('language-select')?.addEventListener('change', event => setLanguage(event.target.value));
  setLanguage(language);
  window.SecureCopyI18n = { setLanguage, getLanguage: () => language, translateItalian };
})();
