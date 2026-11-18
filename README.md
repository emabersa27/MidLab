# MIDLAB

Il vantaggio inizia dal pick — applicazione statica per i matchup della midlane di League of Legends.

## Avvio locale con Visual Studio Code

1. Estrai lo ZIP e apri la cartella `MidLab` con **File > Open Folder**.
2. Installa l’estensione **Live Server** (`ritwickdey.LiveServer`).
3. Fai clic destro su `index.html` e scegli **Open with Live Server**.

Non aprire direttamente il file HTML con doppio clic: il browser può bloccare la lettura di `data.json` con il protocollo `file://`. In alternativa, se Python è installato, esegui `python -m http.server 8000` dal terminale della cartella e visita http://localhost:8000/.

## Struttura

- `index.html`: interfaccia della web app.
- `src/style.css`: grafica e layout responsivo.
- `src/app.js`: tutte le interazioni.
- `data.json`: 66 campioni, 330 matchup e identificativi delle immagini.
- `assets/`: 66 ritratti locali originali.
- `.gitignore`, `.gitattributes`, `.nojekyll`: configurazione Git / GitHub Pages.
- `.vscode/extensions.json`: suggerimento dell’estensione Live Server.

## Pubblicazione su GitHub Pages

Crea su GitHub una repository vuota chiamata `midlab` (senza README, licenza o gitignore iniziali), poi apri il terminale di VS Code nella cartella MidLab. Esegui una riga alla volta, sostituendo `TUO-USERNAME` con il tuo account GitHub:

```bash
git init
git add .
git commit -m "Initial MidLab project"
git branch -M main
git remote add origin https://github.com/TUO-USERNAME/midlab.git
git push -u origin main
```

Se Git richiede un'identità, imposta `git config user.name "Il tuo nome"` e `git config user.email "La tua email GitHub"`, poi ripeti il commit. Su GitHub apri Settings > Pages, seleziona Deploy from a branch, main e /(root), quindi Save. Il sito sarà pubblicato su `https://TUO-USERNAME.github.io/midlab/` dopo il deploy. Se hai già una repository contenente file, non sovrascriverla: usa il clone esistente e copia i file del progetto nella sua cartella.

## Dati e risorse

Snapshot U.GG del 17 novembre 2026 (patch 26.22); ricostruito dal foglio originale delle statistiche. Nessuna chiamata API per aggiornare automaticamente i matchup. I ritratti sono quelli dello ZIP originale. Gli splash art mancanti nello ZIP vengono richiesti al CDN pubblico Riot Data Dragon; in assenza di connessione rimane il ritratto locale. Anche i font Google richiedono connessione, con fallback di sistema. I titoli italiani sono inclusi dalla V2.1 e aggiornati tramite Data Dragon quando disponibile. Le note e i preferiti sono memorizzati nel browser. Non affiliato a Riot Games. Immagini e personaggi © Riot Games; statistiche U.GG.

## V2 — Pro Matchups

- Apri un avversario e premi **Pro build** su uno dei counter, oppure vai su **Pro Matchups** e scegli qualsiasi campione (ad esempio Gallio contro Ahri).
- Filtra LCK, LPL, LEC, LCS, SoloQ/competitiva e periodo. Sono mostrati soltanto record con il campione avversario nello stesso ruolo in squadra opposta.
- I link Probuild.gg, MID.GG e LeagueLab sono immediatamente utilizzabili. Su Probuild.gg imposta manualmente ruolo Mid, avversario e lega. MID.GG comprende anche giocatori non professionisti: non è un filtro rigoroso dei quattro campionati.
- La cache `pro-matches.json` parte vuota: non sono incluse partite non verificate. La grafica visualizza rune, spell e oggetti di ogni record con Data Dragon della patch, ove disponibile; altrimenti mostra i valori originali. Gli oggetti finali non sono un ordine di acquisto.

### Aggiornamento dei dati (da verificare al primo avvio)

Il collector competitivo usa la Cargo API documentata di Leaguepedia. È predisposto, ma non è stato provato con una connessione esterna in questa sessione. Eventuali errori API interrompono l'aggiornamento senza cancellare la cache precedente. Il prefisso delle pagine restringe le competizioni alle quattro leghe; tornei internazionali non sono compresi. Attribuzione: Leaguepedia, https://lol.fandom.com/wiki/League_of_Legends_Esports_Wiki, CC BY-SA 3.0 (https://creativecommons.org/licenses/by-sa/3.0/); link al record in ogni scheda. Per modificare l'endpoint usare `LEAGUEPEDIA_API` e `LEAGUEPEDIA_WIKI`.

Per eseguirlo localmente, con Python 3 installato, dalla cartella del sito:

```powershell
python scripts/update_pro.py --only competitive
git add pro-matches.json
git commit -m "Update competitive matches"
git push
```

Per la raccolta SoloQ, **non pubblicare una chiave development/personale su un sito pubblico**. Serve registrare il progetto presso Riot, ottenere una chiave adeguata all'uso pubblico e configurare il repository secret `RIOT_API_KEY` solo dopo l'approvazione. Non scrivere mai la chiave in file o JS. Inserire esclusivamente account pubblicamente verificati di midlaner attivi nelle quattro leghe in `scripts/pro-accounts.json`. Il file parte vuoto perché non è stata verificata una lista di account. Aggiornarla dopo i trasferimenti. Schema di un record (valori illustrativi, non account reali):

```json
{"player":"Nome verificato", "team":"Squadra verificata", "league":"LCK", "region":"asia", "riotId":"GameName#TagLine", "rosterSource":"https://pagina-del-roster-verificato", "matchHistoryUrl":"https://profilo-pubblico-verificato"}
```

Regioni Match-V5: `asia`, `europe`, `americas`, `sea`. La lega è quella del pro, non la regione in cui gioca. Per i pro LPL, gli account sui server cinesi non sono coperti dalla normale API pubblica Match-V5: usare account verificati su server supportati. Il collector esamina le ultime 30 ranked per account e scarta remakes e ruoli diversi. Dalla V2.2 il collector SoloQ tenta anche il recupero della timeline; quando disponibile, salva gli acquisti registrati, l’ordine delle abilità, le statistiche e lo scoreboard.

Il workflow `Update Pro Matchups` è avviabile da GitHub > Actions > Run workflow; è anche pianificato quotidianamente. Il push effettuato con GITHUB_TOKEN **non attiva necessariamente** il deploy Pages da branch: se la nuova cache non appare, eseguire in locale lo script, fare commit e push con il proprio account (oppure configurare un workflow Pages dedicato). Non è necessario configurare Riot per provare il collector competitivo. Verificare il log del primo run e controllare campioni, leghe, date e build contro la fonte prima di usare i dati.

MIDLAB isn't endorsed by Riot Games and doesn't reflect the views or opinions of Riot Games or anyone officially involved in producing or managing Riot Games properties. Riot Games and all associated properties are trademarks or registered trademarks of Riot Games, Inc.

## V2.2 — Lista partite espandibile

Il pannello Partite pro mostra automaticamente tutti i matchup contro il campione selezionato. Usa il filtro Mostra per visualizzare invece i match giocati con il campione, e Altro campione per cercare una coppia precisa. I pulsanti Partite pro sui counter impostano direttamente il filtro. Le righe sono ordinate dalla più recente, 20 alla volta; la freccia apre acquisti, abilità, rune e scoreboard. La lista usa record reali importati, non dati simulati. La cache inclusa è vuota. Il collector competitivo esistente non fornisce timeline/skill order/scoreboard; i campi assenti sono marcati come non disponibili. La raccolta della timeline SoloQ richiede API Riot autorizzata e account verificati, come sopra.

### Aggiornamento di una repository esistente

Fai prima una copia di `pro-matches.json` e `scripts/pro-accounts.json` se li hai già popolati. Estrai lo ZIP in una cartella temporanea, copia il contenuto nella cartella originale senza cancellare `.git` e ripristina gli eventuali file dati/account salvati. Esegui `git add .`, `git commit -m "MidLab V2.2 - Match history"`, `git push`. Non serve creare una nuova repository.
