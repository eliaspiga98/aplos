# Aplo's — installazione semplificata su Windows

Questa procedura prepara una postazione Windows con NVIDIA per eseguire in
locale web app, PostgreSQL e Ollama con `qwen3.5:9b-q4_K_M`. Dopo la prima
configurazione l'uso quotidiano richiede soltanto un doppio clic.

## Requisiti

- Windows 10 22H2 o Windows 11 a 64 bit;
- driver NVIDIA aggiornato;
- connessione Internet durante la prima configurazione;
- almeno 20 GB liberi (codice, dipendenze, PostgreSQL e modello AI).

Ollama espone l'API soltanto su `http://127.0.0.1:11434`. Non pubblicare questa
porta su Internet.

## Installazione iniziale

1. Scarica o clona il repository in una cartella stabile, per esempio
   `C:\Aplos`. Non spostare la cartella dopo la configurazione.
2. Fai doppio clic su **Aplos Launcher.cmd**.
3. Accetta la richiesta di Windows (UAC).
4. Premi **Prima configurazione / Aggiorna**.

Lo script installa automaticamente Node.js LTS e Ollama tramite Windows
Package Manager. Se PostgreSQL non è presente, mostra il suo installer: lascia
le opzioni predefinite e annota la password scelta. Subito dopo lo script
chiede quella password una sola volta e poi:

- crea database, ruoli e password applicative casuali;
- crea `.env` senza inserire segreti nel repository;
- installa e compila Aplo's;
- applica migrazioni e seed;
- scarica `qwen3.5:9b-q4_K_M` (circa 6,6 GB);
- crea i collegamenti sul Desktop;
- avvia tutto e apre il browser.

Il primo download può richiedere diversi minuti. L'utente iniziale è `Admin`
con PIN `0000`: cambiarlo al primo accesso.

## Uso quotidiano

Dal Desktop si può usare il launcher grafico **Aplo's**, oppure i due pulsanti
diretti:

- **Avvia Aplo's**: avvia PostgreSQL, Ollama e la web app, carica il modello e
  apre `http://127.0.0.1:3001`;
- **Chiudi Aplo's**: chiude la web app, scarica il modello dalla GPU e arresta
  soltanto i servizi che erano stati avviati da Aplo's.

È sicuro premere Avvia più volte: se il programma è già pronto viene soltanto
aperto il browser. Le migrazioni vengono controllate a ogni avvio. Dopo un
aggiornamento Git, il primo Avvia ricompila automaticamente il software.

## Aggiornamento e manutenzione

Per una manutenzione ordinaria basta aprire il launcher e premere **Prima
configurazione / Aggiorna**. Le configurazioni e i dati esistenti vengono
conservati. I log diagnostici sono in `var\logs`; gli allegati in
`var\uploads`.

PostgreSQL deve comunque essere incluso in un piano di backup. La comodità del
launcher non sostituisce copie cifrate e testate dei dati sanitari.

## Avvio manuale da PowerShell

I comandi equivalenti, dalla root del repository, sono:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/windows/Install-Aplos.ps1
powershell -ExecutionPolicy Bypass -File scripts/windows/Start-Aplos.ps1
powershell -ExecutionPolicy Bypass -File scripts/windows/Stop-Aplos.ps1
```

MLX resta il provider consigliato su Apple Silicon. Su Windows il launcher usa
Ollama, che sfrutta automaticamente la GPU NVIDIA supportata.
