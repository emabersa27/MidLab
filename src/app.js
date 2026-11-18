const $ = s => document.querySelector(s), esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let db, selected = 'Ahri', sort = 'gold', favorites = new Set(), comparison = new Set(), favOnly = false, timer;
try {
    favorites = new Set(JSON.parse(localStorage.getItem('midlab.pool') || '[]'));
}
catch { }
const fmt = n => new Intl.NumberFormat('it-IT').format(n), pct = n => n == null ? 'N/D' : (n * 100).toFixed(1).replace('.', ',') + '%', gold = n => (n > 0 ? '+' : '') + fmt(n);
function picture(n, cls = '') { const a = db.assets[n]; return a ? `<img class="${cls}" src="assets/${esc(a.id)}.png" alt="${esc(n)}" loading="lazy">` : `<span class="fallback ${cls}">${esc(n.slice(0, 2))}</span>`; }
function toast(t) { $('#toast').textContent = t; $('#toast').classList.add('show'); clearTimeout(timer); timer = setTimeout(() => $('#toast').classList.remove('show'), 2200); }
function persist() { try {
    localStorage.setItem('midlab.pool', JSON.stringify([...favorites]));
}
catch {
    toast('Salvataggio non disponibile in questo browser.');
} $('#poolCount').textContent = favorites.size; }
function toggleFav(n) { favorites.has(n) ? favorites.delete(n) : favorites.add(n); persist(); renderRoster(); renderCards(); $('#favEnemy').textContent = favorites.has(selected) ? '★' : '☆'; }
function renderRoster() { const q = $('#search').value.toLowerCase().trim(); const names = Object.keys(db.champions).sort((a, b) => a.localeCompare(b)).filter(n => n.toLowerCase().includes(q) && (!favOnly || favorites.has(n))); $('#champCount').textContent = names.length + ' campioni'; $('#roster').innerHTML = names.length ? names.map(n => `<button class="champ ${selected === n ? 'selected' : ''}" data-enemy="${esc(n)}" aria-label="Seleziona ${esc(n)}" aria-pressed="${selected === n}">${picture(n)}<span>${esc(n)}</span></button>`).join('') : '<p class="empty">Nessun campione trovato.</p>'; }
function pick(n) {
    selected = n;
    const assetId = db.assets[n]?.id || 'Ahri';
    const hero = document.getElementById('hero');
    hero.style.backgroundImage = `linear-gradient(90deg,#15222b 8%,#15222bea 35%,#12202a30 100%),url('https://ddragon.leagueoflegends.com/cdn/img/champion/splash/${assetId}_0.jpg'),url('assets/${assetId}.png')`;
    comparison.clear();
    updateBar();
    renderRoster();
    $('#enemyImage').innerHTML = picture(n);
    $('#enemyName').textContent = n;
    $('#enemyTitle').textContent = db.assets[n]?.title || 'Campione della midlane';
    $('#favEnemy').textContent = favorites.has(n) ? '★' : '☆';
    $('#noteLabel').textContent = 'Note contro ' + n;
    try {
        $('#notes').value = localStorage.getItem('midlab.note.' + n) || '';
    }
    catch {
        $('#notes').value = '';
    }
    $('#saveState').textContent = 'Note salvate solo in questo browser.';
    $('#source').href = db.champions[n][0].source;
    renderCards();
    history.replaceState(null, '', '#' + encodeURIComponent(n));
}
function renderCards() { let ps = [...db.champions[selected]].sort((a, b) => sort === 'gold' ? b.gold - a.gold : (b.wr ?? -1) - (a.wr ?? -1)); if ($('#poolFilter').checked)
    ps = ps.filter(p => favorites.has(p.name)); $('#resultCount').textContent = String(ps.length).padStart(2, '0'); $('#sortGold').classList.toggle('active', sort === 'gold'); $('#sortWin').classList.toggle('active', sort === 'wr'); $('#sortDescription').textContent = sort === 'gold' ? 'Ordinati per oro medio di vantaggio al minuto 15.' : 'Win rate più alto tra i 5 matchup presenti nel dataset.'; const max = Math.max(...ps.map(p => Math.abs(p.gold)), 1); $('#cards').innerHTML = ps.length ? ps.map((p, i) => `<article class="card ${i === 0 ? 'first' : ''}"><div class="cardtop"><span class="rank">${String(i + 1).padStart(2, '0')} / ${sort === 'gold' ? 'LANE' : 'WIN RATE'}</span><button class="star ${favorites.has(p.name) ? 'on' : ''}" data-fav="${esc(p.name)}" aria-label="${favorites.has(p.name) ? 'Rimuovi' : 'Aggiungi'} ${esc(p.name)} ${favorites.has(p.name) ? 'dal' : 'al'} pool">${favorites.has(p.name) ? '★' : '☆'}</button></div>${picture(p.name, 'portrait')}<h3>${esc(p.name)}</h3><div class="hint">${p.gold > 0 ? 'Vantaggio in oro nella lane' : 'Matchup meno sfavorevole'}</div><div class="metric ${p.gold <= 0 ? 'negative' : ''}">${gold(p.gold)} <small>oro</small></div><div class="metriclabel">DIFFERENZA AL MINUTO 15</div><div class="meter"><i style="width:${Math.abs(p.gold) / max * 100}%;${p.gold <= 0 ? 'background:var(--gold)' : ''}"></i></div><div class="stat"><span>Win rate partita</span><strong>${pct(p.wr)}</strong></div><div class="stat"><span>Partite analizzate</span><strong>${fmt(p.games)}</strong></div><p class="warning">${p.games < 500 ? 'Campione ridotto: meno di 500 partite' : p.gold <= 0 ? 'Il pick resta sotto in oro.' : 'Almeno 500 partite nel matchup'}</p><label class="compare"><input type="checkbox" data-compare="${esc(p.name)}" ${comparison.has(p.name) ? 'checked' : ''}> Confronta</label></article>`).join('') : '<div class="empty">Nessuno dei 5 counter è nel tuo pool.<br><br>Disattiva il filtro o aggiungi un campione con la stella ☆.</div>'; }
function updateBar() { $('#compareBar').hidden = comparison.size === 0; $('#compareCount').textContent = `${comparison.size}/3 pick selezionati`; }
function open(content) { $('#dialogBody').innerHTML = content; $('#dialog').showModal(); }
function pool() { open(`<div class="eyebrow">IL TUO POOL PERSONALE</div><h2>I campioni che vuoi giocare.</h2><p>Tocca un ritratto per aggiungerlo o rimuoverlo. Le stelle dorate indicano i preferiti; vengono salvati solo in questo browser.</p><div class="poolgrid">${Object.keys(db.champions).sort().map(n => `<button class="champ ${favorites.has(n) ? 'selected' : ''}" data-pool="${esc(n)}" aria-pressed="${favorites.has(n)}">${picture(n)}<span>${esc(n)} ${favorites.has(n) ? '★' : ''}</span></button>`).join('')}</div>`); }
async function init() {
    try {
        const res = await fetch('data.json');
        if (!res.ok)
            throw Error();
        db = await res.json();
        let hash = '';
        try {
            hash = decodeURIComponent(location.hash.slice(1));
        }
        catch { }
        if (Object.hasOwn(db.champions, hash))
            selected = hash;
        persist();
        pick(selected);
        $('#search').addEventListener('input', renderRoster);
        $('#roster').addEventListener('click', e => { const b = e.target.closest('[data-enemy]'); if (b)
            pick(b.dataset.enemy); });
        $('#onlyFav').onclick = () => { favOnly = !favOnly; $('#onlyFav').classList.toggle('on', favOnly); $('#onlyFav').setAttribute('aria-pressed', favOnly); renderRoster(); };
        $('#favEnemy').onclick = () => toggleFav(selected);
        $('#cards').addEventListener('click', e => { const f = e.target.closest('[data-fav]'); if (f)
            toggleFav(f.dataset.fav); });
        $('#cards').addEventListener('change', e => { const n = e.target.dataset.compare; if (!n)
            return; if (e.target.checked) {
            if (comparison.size >= 3) {
                e.target.checked = false;
                toast('Puoi confrontare fino a 3 pick.');
                return;
            }
            comparison.add(n);
        }
        else
            comparison.delete(n); updateBar(); });
        $('#sortGold').onclick = () => { sort = 'gold'; renderCards(); };
        $('#sortWin').onclick = () => { sort = 'wr'; renderCards(); };
        $('#poolFilter').onchange = renderCards;
        $('#notes').oninput = () => { try {
            localStorage.setItem('midlab.note.' + selected, $('#notes').value);
            $('#saveState').textContent = 'Salvato su questo dispositivo.';
        }
        catch {
            $('#saveState').textContent = 'Impossibile salvare: archiviazione del browser non disponibile.';
        } };
        $('#navPool').onclick = pool;
        $('#navMatch').onclick = () => { $('#dialog').close(); $('#search').focus(); };
        $('#dialogBody').addEventListener('click', e => { const b = e.target.closest('[data-pool]'); if (b) {
            toggleFav(b.dataset.pool);
            b.classList.toggle('selected', favorites.has(b.dataset.pool));
            b.setAttribute('aria-pressed', favorites.has(b.dataset.pool));
            b.querySelector('span:last-child').textContent = b.dataset.pool + (favorites.has(b.dataset.pool) ? ' ★' : '');
        } });
        $('#method').onclick = () => open(`<div class="eyebrow">METODO E TRASPARENZA</div><h2>Numeri utili. Contesto necessario.</h2><p><b>Copertura:</b> 66 campioni abituali e situazionali mid, 5 matchup ciascuno. Non include ogni possibile pick off-meta.</p><p><b>Selezione:</b> i 5 valori GD15 più alti disponibili su U.GG con almeno 100 partite. Ordinare per win rate riordina questi cinque; non ricerca altri counter.</p><p><b>GD15:</b> oro del counter meno oro del nemico al minuto 15. Un numero positivo indica un vantaggio medio. Un valore negativo indica che il pick resta sotto: è tra i matchup meno sfavorevoli, non un counter positivo per questa metrica.</p><p><b>Win rate:</b> percentuale di partite vinte dal counter contro l’avversario, non probabilità di vincere la lane. Non misura da solo l’effetto del counterpick.</p><p><b>Campione:</b> sotto 500 partite la stima è più sensibile a variazioni. Non è una garanzia statistica sopra tale soglia.</p><p><b>Snapshot:</b> patch 26.22, 17 novembre 2026. Emerald+, Ranked Solo, tutte le regioni. Nessun aggiornamento automatico. Fonte: U.GG. Ritratti: Riot Games / Data Dragon.</p><p><b>Preferiti e note:</b> rimangono in questo browser, senza sincronizzazione fra dispositivi.</p>`);
        $('#compareOpen').onclick = () => { const picks = db.champions[selected].filter(p => comparison.has(p.name)); open(`<div class="eyebrow">CONFRONTO CONTRO ${esc(selected.toUpperCase())}</div><h2>Quale pick fa per te?</h2><div class="comparegrid">${picks.map(p => `<article>${picture(p.name)}<h3>${esc(p.name)}</h3><p>Oro al minuto 15<strong>${gold(p.gold)}</strong></p><p>Win rate partita<strong>${pct(p.wr)}</strong></p><p>Partite<strong>${fmt(p.games)}</strong></p><p>${p.gold <= 0 ? 'Resta sotto in oro.' : p.games < 500 ? 'Campione ridotto.' : 'Vantaggio medio in lane.'}</p></article>`).join('')}</div><p>Considera anche il campione che sai usare meglio e la composizione della squadra.</p>`); };
        $('#compareClear').onclick = () => { comparison.clear(); updateBar(); renderCards(); };
        $('.close').onclick = () => $('#dialog').close();
        $('#dialog').onclick = e => { if (e.target === $('#dialog')) {
            const r = $('#dialog').getBoundingClientRect();
            if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom)
                $('#dialog').close();
        } };
        $('#export').onclick = () => { const rows = [['Nemico', 'Counter', 'GD15', 'Win rate partita', 'Partite', 'Patch', 'Fonte'], ...db.champions[selected].map(p => [selected, p.name, p.gold, p.wr == null ? '' : (p.wr * 100).toFixed(2) + '%', p.games, '26.22', p.source])]; const csv = '\uFEFF' + rows.map(r => r.map(v => '"' + String(v).replaceAll('"', '""') + '"').join(';')).join('\r\n'); const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); const a = document.createElement('a'); a.href = url; a.download = 'MIDLAB_' + selected.replace(/[^a-z]/gi, '') + '.csv'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); toast('Matchup esportati.'); };
        document.addEventListener('keydown', e => { if (e.key === '/' && !['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName) && !$('#dialog').open) {
            e.preventDefault();
            $('#search').focus();
        } });
    }
    catch (e) {
        $('#cards').innerHTML = '<div class="empty">Non riesco a caricare i dati. Avvia il progetto tramite Live Server (non aprire direttamente index.html).</div>';
        console.error(e);
    }
}
init();
