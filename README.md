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

Snapshot U.GG del 17 novembre 2026 (patch 26.22); ricostruito dal foglio originale delle statistiche. Nessuna chiamata API per aggiornare automaticamente i matchup. I ritratti sono quelli dello ZIP originale. Gli splash art mancanti nello ZIP vengono richiesti al CDN pubblico Riot Data Dragon; in assenza di connessione rimane il ritratto locale. Anche i font Google richiedono connessione, con fallback di sistema. I sottotitoli originali dei campioni non erano disponibili a eccezione di Ahri, perciò gli altri usano una descrizione generica. Le note e i preferiti sono memorizzati nel browser. Non affiliato a Riot Games. Immagini e personaggi © Riot Games; statistiche U.GG.
