# Barra del singolo file — 2.7.7

La barra veniva nascosta negli eventi di cambio fase senza conteggio dei byte, poi mostrata nuovamente durante copia o lettura. Cambiava anche l’altezza della riga con nome e avanzamento.

Correzione circoscritta a renderer, markup e altezza minima dell’intestazione. Pannello e traccia restano presenti; i dati del file precedente vengono azzerati subito, senza animare il ritorno da 100 a 0%. La scheda generale rimane nascosta quando non esistono operazioni. Il motore e i controlli di sicurezza non cambiano.

79 test automatici passati. Le tre nuove prove falliscono sui sorgenti archiviati 2.7.6 e passano sui nuovi. Prova Electron: 12 fasi tra preparazione, letture, copia, verifica, file successivo e file vuoto; pannello 94 px, traccia 5 px, sommità 389 px e scheda 233 px invariati. Completamento conserva pannello e barra vuota. Screenshot a barra vuota e al 50% controllati visivamente. Dati: file-progress-layout.json.

Revisione Ponytail: controllati reset, risultato, cambio operazione e monitor del confronto oltre alla sola funzione di copia; nessuna dipendenza aggiunta. Graphify aggiornato localmente senza backend LLM. Nessun nuovo ignore del detector grafico; conservate le scelte visive già approvate.

La prima prova grafica era stata bloccata dal limite d’uso del controllo automatico; il successivo controllo è riuscito e la prova è stata completata.

Consegna: 2.7.7 ARM64 installata e riaperta dopo verifica di inattività; archivio installato identico alla build. Installabili DMG/ZIP ARM64 e Intel verificati, checksum corretti. Versione precedente conservata; il backup separato 2.7.5 resta intatto.
