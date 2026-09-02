# Aggiornamento di Aplo's tramite ZIP

Questa guida spiega come aggiornare Aplo's mantenendo i lavori, i dottori,
i materiali, gli operatori e gli allegati già presenti.

## Prima di iniziare

- Usa esclusivamente lo ZIP di aggiornamento ricevuto da Elia.
- Esegui l'aggiornamento sul PC principale sul quale è installato Aplo's.
- Non disinstallare PostgreSQL, Node.js oppure Ollama.
- Non eliminare la vecchia cartella di Aplo's fino al termine delle verifiche.

## 1. Creare un backup

1. Apri Aplo's.
2. Vai in **Impostazioni → Database e backup**.
3. Premi **Esegui backup ora**.
4. Attendi la conferma del completamento.

Se la pagina mostra un errore o il backup non viene completato, non procedere
con l'aggiornamento e contatta Elia.

## 2. Chiudere Aplo's

Chiudi completamente il programma usando **Chiudi tutto** dal launcher oppure
il collegamento **Chiudi Aplo's** presente sul Desktop.

## 3. Conservare la vecchia installazione

Apri `C:\` con Esplora file e rinomina la cartella attuale:

```text
C:\Aplos → C:\Aplos-old
```

Non eliminare `C:\Aplos-old`: sarà la copia di sicurezza temporanea.

## 4. Estrarre la nuova versione

1. Estrai lo ZIP ricevuto direttamente in `C:\`.
2. Lo ZIP potrebbe creare una cartella chiamata `aplos-master`, `aplos-main`
   oppure con un nome simile. Rinominala in:

   ```text
   C:\Aplos
   ```

3. Verifica che il launcher si trovi esattamente qui:

   ```text
   C:\Aplos\Aplos Launcher.cmd
   ```

## 5. Controllare configurazione e allegati

Incolla questo percorso nella barra degli indirizzi di Esplora file:

```text
C:\ProgramData\Aplos\config
```

Se nella cartella è presente il file `.env`, non devi copiare manualmente
configurazioni o allegati: puoi passare direttamente alla sezione successiva.

Se la cartella o il file `.env` non esistono, copia dalla vecchia
installazione:

```text
C:\Aplos-old\.env → C:\Aplos\.env
```

Copia inoltre le seguenti cartelle, se presenti:

```text
C:\Aplos-old\var\uploads → C:\Aplos\var\uploads
C:\Aplos-old\var\backups → C:\Aplos\var\backups
```

La nuova versione trasferirà automaticamente questi dati nelle cartelle
persistenti di Windows al primo avvio.

## 6. Eseguire l'aggiornamento

1. Fai doppio clic su:

   ```text
   C:\Aplos\Aplos Launcher.cmd
   ```

2. Accetta la richiesta di autorizzazione di Windows.
3. Premi **Prima configurazione / Aggiorna**.
4. Attendi il completamento senza chiudere le finestre aperte dal launcher.

Il sistema aggiornerà automaticamente le dipendenze, ricompilerà
l'applicazione e applicherà le modifiche necessarie al database. I dati già
presenti non vengono cancellati.

## 7. Verificare il risultato

Apri Aplo's e controlla:

- l'accesso con il proprio operatore;
- la presenza dei lavori precedenti;
- la presenza di dottori, materiali e allegati;
- le nuove sezioni **Collaboratori** e **Macchinari**;
- l'apertura della pagina **Impostazioni**;
- la corretta visualizzazione delle date di consegna.

Se uno di questi controlli non riesce, chiudi Aplo's, non eliminare alcun file
e contatta Elia indicando il messaggio visualizzato.

## Cosa non deve essere copiato o modificato

Non copiare dalla vecchia installazione:

```text
node_modules
api\dist
web\dist
```

Questi elementi vengono ricreati automaticamente durante l'aggiornamento.

Non spostare, copiare o modificare manualmente la cartella fisica di
PostgreSQL. Il database che contiene lavori, dottori, materiali e operatori è
gestito separatamente dalla cartella del programma.

## Dopo l'aggiornamento

Conserva `C:\Aplos-old` fino a quando Elia non avrà confermato che
l'aggiornamento è riuscito correttamente. Soltanto dopo la conferma la vecchia
cartella potrà essere eliminata.
