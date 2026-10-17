# Installazione di SecureCopy 2.6.1

## macOS 13 o successivo

Usa `SecureCopy-2.6.1-arm64.dmg` su Apple Silicon oppure `SecureCopy-2.6.1.dmg` su Mac Intel. Monta il DMG e trascina l'app nella cartella Applicazioni.

I pacchetti creati in questa sessione non sono firmati né notarizzati perché non era disponibile un certificato Apple Developer. macOS potrebbe impedirne l'apertura o mostrare un avviso. Prima di distribuirli ad altre persone, firma e notarizza l'app. Non disattivare le protezioni del sistema per aggirare un avviso.

## Sviluppo

Con Node.js 22.12 o successivo:

```bash
npm install
npm test
npm start
```

Per creare le build macOS: `npm run build:mac`. Windows e Linux richiedono una verifica specifica sui rispettivi sistemi.
