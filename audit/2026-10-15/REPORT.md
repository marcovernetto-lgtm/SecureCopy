# Audit SecureCopy 2.7.5 — 15 ottobre 2026

## Correzioni riprodotte e verificate

1. **ExFAT:** l’inode cambia all’allocazione dei primi dati. Aggiornata l’identità dal descrittore aperto prima della chiusura; restano i controlli contro modifiche concorrenti. Provati file vuoti, non vuoti, sostituzioni e ripristino dopo ENOSPC simulato sul volume ExFAT reale.
2. **Resource fork:** conservazione e hash obbligatori anche nel fallback senza hard link. Un file con soli dati aggiuntivi diversi non è saltato come identico. Se il filesystem non li conserva, esito parziale esplicito.
3. **Confronto:** ricontrollo finale dei file e delle cartelle pubblicati. Rimozione e corruzione della stessa dimensione producono righe di errore aggiornate, non un verde verificato obsoleto; ripresa selettiva provata nelle due direzioni.
4. **Uscita:** la chiusura ordinata non cancella più la ricetta di ripresa delle copie attive. Riavvio provato: 18 file copiati, 2 già validi saltati senza sostituzione.
5. **Nomi:** collisioni Clip.MOV/clip.MOV e Folder/folder su destinazioni insensibili alle maiuscole non sovrascrivono né uniscono silenziosamente elementi. Su APFS sensibile alle maiuscole entrambi i file sono copiati.

## Verifiche

- 66 test automatici passati, zero errori.
- Electron ARM: 72 file verificati SHA-256; due copie concorrenti e una in coda, pausa, annullamento, recupero selettivo, percentuali, esclusione di percorsi sovrapposti e reset dei selettori.
- Uscita ordinata e ripresa con applicazione Electron reale e profilo temporaneo.
- File opaco da 512 MiB: hash completo, avanzamento monotono, annullamento durante la scrittura, nessun file finale incompleto.
- Immagini disco temporanee APFS sensibile alle maiuscole ed ExFAT: copie nelle due direzioni, file vuoti, date rappresentabili, salti dei già identici, sostituzione e ripristino dopo errore. Nessun disco di materiale personale usato nei test.
- Build Intel provata su Apple Silicon tramite Rosetta: metadati, ripresa, righe verdi nelle due direzioni e pulizia limitata ai report interni oltre 20 giorni. Hardware Intel fisico non provato.
- Entrambi i bundle: 22 file runtime corrispondenti ai sorgenti, firme ad hoc verificate. DMG verificati con hdiutil, ZIP con unzip, quattro checksum SHA-256 verificati.

## Interfaccia

Liquid Glass fisso al 70% su tutte le schermate e avvisi disco. Slider rimosso; precedenti preferenze ignorate. Verificati italiano/inglese, tastiera, Esc e ricaricamento. Screenshot: [Impostazioni](screenshots/settings-fixed-70.png).

Triage Impeccable: corretti leggibilità e contrasto degli avvisi disco; conservato il materiale vetro richiesto. Le segnalazioni su bordo sottile/ombra dei pannelli sono state escluse solo per index.html, con motivazione registrata in .impeccable/config.json. Le eccezioni già esistenti per avanzamento e registro tecnico non sono state ampliate.

## Avviso macOS 28

Durante i test è stata eseguita anche la build Intel tramite Rosetta. Il messaggio mostrato dall’utente è coerente con questa prova (attribuzione inferita, non confermata da un log del sistema). L’app installata 2.7.4 e la nuova build 2.7.5 ARM contengono ciascuna 13 binari Mach-O, tutti ARM64; non richiedono Rosetta. Apple documenta l’avviso per le app Intel: https://support.apple.com/en-gb/102527 . Questo controllo non certifica la compatibilità con una futura versione di macOS.

## Limiti concreti

- Il driver ExFAT provato non conserva determinate frazioni di secondo nella data di creazione. Il contenuto verificato resta al suo posto e l’esito resta parziale con le date attese/reali. Riprovare non riscrive i dati già integri.
- Sullo stesso ExFAT i resource fork non sono supportati dalle API native provate: segnalazione esplicita, nessuna dichiarazione falsa di copia completa. Su APFS il fallback conserva e verifica anche questi dati.
- Niente certificazione su ogni dispositivo fisico, filesystem o futura versione macOS. Test su macOS 27.0.1 Apple Silicon; Intel tramite Rosetta.
- Build con firma ad hoc, senza firma Developer ID e senza notarizzazione. Minimo macOS 13.
