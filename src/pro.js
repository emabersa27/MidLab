/* MidLab Pro Matchups — static UI, data cache populated off-browser. */
(() => {
  'use strict';
  const el = id => document.getElementById(id);
  const safe = x => String(x ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const norm = x => String(x ?? '').toLowerCase().replace(/[^a-z0-9]/g,'');
  const CDN = 'https://ddragon.leagueoflegends.com';
  let cache = {matches:[], updatedAt:null}, versionList, ready = false;
  let activePick = 'all', currentEnemy = 'Ahri', seq = 0;
  const metadata = new Map();
  let playerPhotos = {}, archivedIcons = {};
  const photoKey = name => String(name || '').trim().toLowerCase();
  const leagues = ['LCK','LPL','LEC','LCS'];
  function championId(name) { return db?.assets?.[name]?.id || String(name??'').replace(/[^a-z0-9]/gi,''); }
  function portrait(name,m) { const known=Object.values(db.assets).find(a=>norm(a.id)===norm(name)); const id=known?.id||db.assets[name]?.id; const remote=m?.champions?.[norm(name)]?.id||championId(name); return `<img class="pro-portrait" src="${safe(id?'assets/'+id+'.png':m?`${CDN}/cdn/${m.v}/img/champion/${remote}.png`:'assets/'+remote+'.png')}" alt="${safe(name)}" loading="lazy">`; }
  function https(url) { try { const u = new URL(url); return u.protocol === 'https:' ? u.href : ''; } catch { return ''; } }
  async function json(url) {
    const r = await fetch(url, {cache: url.startsWith(CDN) ? 'default' : 'no-store'});
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  }
  // The competitive importer may not supply a patch. Use real Riot icons from
  // the newest available version, without pretending it was the match's patch.
  async function loadAssets(v) {
    if (!metadata.has(v)) metadata.set(v, (async () => {
      const root = `${CDN}/cdn/${v}/data/en_US/`;
      const [items, runelist, spells, champions] = await Promise.all([
        json(root+'item.json').catch(()=>({data:{}})),
        json(root+'runesReforged.json').catch(()=>[]),
        json(root+'summoner.json').catch(()=>({data:{}})),
        json(root+'champion.json').catch(()=>({data:{}}))
      ]);
      const idx = entries => {const out=Object.create(null);for(const x of entries){out[String(x.id)]=x; if(x.name)out[norm(x.name)]=x;if(x.key)out[norm(x.key)]=x;} return out;};
      // Prefer Summoner's Rift variants for names shared with another mode.
      const itemArray=Object.entries(items.data).map(([id,x])=>({...x,id})).sort((a,b)=>Number(!!a.maps?.['11'])-Number(!!b.maps?.['11']));
      return {v,champions:idx(Object.values(champions.data)),items:idx(itemArray),runes:idx(runelist.flatMap(t=>t.slots.flatMap(s=>s.runes))),trees:idx(runelist),spells:idx(Object.values(spells.data).map(x=>({...x,id:x.key,key:x.id}))),rawTrees:runelist};
    })());
    return metadata.get(v);
  }
  async function assets(patch) {
    versionList ||= json(CDN+'/api/versions.json').catch(()=>[]);
    const versions=await versionList;
    const latest=versions[0] || '16.22.1';
    const parts=String(patch||'').split('.');
    const major=parts[0]==='26'?'16':parts[0];
    const match=parts[1] && versions.find(x=>x.startsWith(`${major}.${parts[1]}.`));
    const primary=await loadAssets(match||latest);
    const fallback=match&&match!==latest?await loadAssets(latest):primary;
    return {...primary, fallback, exact:!!match};
  }
  function playerPhoto(g) {
    const record=playerPhotos[photoKey(g.player)] || {};
    const url=https(g.playerImage)||https(record.url);
    const name=g.player||'Pro';
    return `<span class="history-avatar" title="${safe(name)}"><span class="history-initials" aria-hidden="true">${safe(name.slice(0,2).toUpperCase())}</span>${url?`<img src="${safe(url)}" alt="${safe(name)}" loading="lazy" decoding="async">`:''}</span>`;
  }
  function photoCredit(g){
    const r=playerPhotos[photoKey(g.player)], url=https(r?.source);
    return url?`<a href="${safe(url)}" target="_blank" rel="noopener noreferrer">Foto: Leaguepedia / fonte originale ↗</a>`:'';
  }
  const shard = {'5001':['Salute crescente','StatModsHealthScalingIcon.png'],'5002':['Armatura','StatModsArmorIcon.png'],'5003':['Resistenza magica','StatModsMagicResIcon.png'],'5005':['Velocità d’attacco','StatModsAttackSpeedIcon.png'],'5007':['Velocità abilità','StatModsCDRScalingIcon.png'],'5008':['Forza adattiva','StatModsAdaptiveForceIcon.png'],'5010':['Velocità di movimento','StatModsMovementSpeedIcon.png'],'5011':['Salute','StatModsHealthPlusIcon.png'],'5013':['Tenacia e resistenza rallentamenti','StatModsTenacityIcon.png']};
  const shardAliases = {'attack speed':'5005','adaptive force':'5008','ability haste':'5007','health scaling':'5001','scaling health':'5001','health':'5011','flat health':'5011','move speed':'5010','movement speed':'5010','armor':'5002','magic resist':'5003','tenacity and slow resist':'5013','tenacity':'5013'};
  function shardIcon(v) { const a=shard[String(v)]||shard[shardAliases[String(v).trim().toLowerCase()]]; return a?{name:a[0],url:`${CDN}/cdn/img/perk-images/StatMods/${a[1]}`} :null; }
  function icon(a,type,m) { if (!a||!m) return ''; return type==='rune'||type==='tree' ? (a.icon?`${CDN}/cdn/img/${a.icon}`:'') : (a.image?.full?`${CDN}/cdn/${m.v}/img/${type==='spell'?'spell':'item'}/${a.image.full}`:''); }
  function lookup(v,type,m) {
    const key=type==='item'?'items':type==='spell'?'spells':'runes';
    for(const source of [m,m?.fallback]) {
      const a=source?.[key]?.[String(v)] || source?.[key]?.[norm(v)];
      const url=icon(a,type,source); if(url)return {name:a.name||String(v),url};
    }
    const a=archivedIcons[key]?.[norm(v)];
    if(a && https(a.url))return {name:a.name||String(v),url:a.url};
    return null;
  }
  function unit(v,type,m) {
    if (!v || v===0 || v==='0') return '<span class="pro-slot blank" aria-label="Slot vuoto"></span>';
    const a=lookup(v,type,m);
    const name=a?.name||String(v), src=a?.url;
    return `<span class="pro-slot ${type}" title="${safe(name)}"><span class="history-icon-label">${safe(name)}</span>${src?`<img src="${safe(src)}" alt="${safe(name)}" loading="lazy" decoding="async">`:''}</span>`;
  }
  function statShard(v,m) {
    const a=shardIcon(v);
    return a?`<span class="pro-slot rune" title="${safe(a.name)}"><span class="history-icon-label">${safe(a.name)}</span><img src="${safe(a.url)}" alt="${safe(a.name)}" loading="lazy"></span>`:unit(v,'rune',m);
  }
  function runeTree(treeKey,chosen,m,title) {
    const present=(m?.rawTrees||[]).flatMap(t=>t.slots.flatMap(s=>s.runes));
    const missing=chosen.filter(c=>!present.some(r=>String(r.id)===String(c)||norm(r.name)===norm(c)));
    const extra=missing.length?`<div class="pro-rune-row historical-runes">${missing.map(r=>unit(r,'rune',m)).join('')}</div>`:'';
    const tree = m?.trees?.[String(treeKey)] || m?.trees?.[norm(treeKey)] || m?.rawTrees?.find(t=>t.slots.some(s=>s.runes.some(r=>chosen.some(c=>String(c)===String(r.id)||norm(c)===norm(r.name)))));
    if(!tree) return `<div class="pro-tree"><h4>${safe(title)}</h4><div class="pro-rune-row">${chosen.map(r=>unit(r,'rune',m)).join('')||'<span class="pro-muted">Non disponibile</span>'}</div></div>`;
    return `<div class="pro-tree"><h4><img src="${safe(icon(tree,'tree',m))}" alt="">${safe(tree.name)} <small>${safe(title)}</small></h4>${tree.slots.map(slot=>`<div class="pro-rune-row">${slot.runes.map(r=>{const on=chosen.some(c=>String(c)===String(r.id)||norm(c)===norm(r.name));return `<span class="pro-rune ${on?'chosen':''}" title="${safe(r.name)}${on?' · selezionata':''}"><img src="${safe(icon(r,'rune',m))}" alt="${safe(r.name)}" loading="lazy"></span>`;}).join('')}</div>`).join('')}${extra}</div>`;
  }
  const list = v => Array.isArray(v)?v:[];
  const num = v => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v));
  const val = v => num(v) ? Number(v).toLocaleString('it-IT') : '—';
  const empty = msg => `<p class="history-unavailable">${safe(msg)}</p>`;
  const fmtTime = v => num(v)?`${Math.floor(v/60)}m ${String(Math.floor(v%60)).padStart(2,'0')}s`:'Durata N/D';
  function relative(date) { const t=Date.parse(date);if(!Number.isFinite(t))return 'Data N/D';const d=Math.max(0,Math.floor((Date.now()-t)/864e5));return d===0?'Oggi':d===1?'Ieri':`${d} giorni fa`; }
  function normalizedItems(values){
    const items=list(values), result=[];
    for(let i=0;i<items.length;i++){
      if(norm(items[i])==='jaksho'&&norm(items[i+1])==='theprotean'){
        result.push("Jak'Sho, The Protean");i++;
      }else result.push(items[i]);
    }
    return result;
  }
  function inventory(g,m){const items=normalizedItems(g.items);return Array.from({length:6},(_,i)=>unit(items[i],'item',m)).join('')+unit(g.trinket,'item',m);}
  function result(g){return g.win===true?'Vittoria':g.win===false?'Sconfitta':'Esito N/D';}
  function kda(g){const a=String(g.kda||'').split('/').map(Number);return a.length===3&&a.every(Number.isFinite)?a[1]===0?'Perfect':`${((a[0]+a[2])/a[1]).toFixed(2)} KDA`:'KDA N/D';}
  function timeline(g,m){
    const groups=list(g.purchaseTimeline);
    if(groups.length)return `<div class="history-path">${groups.map((step,i)=>`<div class="history-step"><div class="pro-icons">${list(step.items).map(x=>unit(x,'item',m)).join('')}</div><small>${num(step.minute)?Math.floor(step.minute)+' min':'—'}</small></div>${i<groups.length-1?'<span class="history-arrow">›</span>':''}`).join('')}</div><p class="pro-muted">Acquisti registrati, al netto degli annullamenti tracciati. Gli slot finali sono riportati sopra.</p>`;
    if(list(g.buildPath).length)return `<div class="history-path">${list(g.buildPath).map(x=>unit(x,'item',m)).join('')}</div><p class="pro-muted">Ordine disponibile senza orari.</p>`;
    return empty('Cronologia acquisti non disponibile per questa partita. L’inventario finale è visibile nella riga.');
  }
  function skills(g){const order=list(g.skillOrder);if(!order.length)return empty('Ordine delle abilità non disponibile dalla fonte.');const columns=Math.min(order.length,18);return `<div class="history-skill-scroll"><table class="history-skills"><thead><tr><th>Skill</th>${Array.from({length:columns},(_,i)=>`<th>${i+1}</th>`).join('')}</tr></thead><tbody>${['Q','W','E','R'].map((letter,j)=>`<tr><th>${letter}</th>${Array.from({length:columns},(_,i)=>`<td class="${Number(order[i])===j+1||String(order[i]).toUpperCase()===letter?'learned':''}">${Number(order[i])===j+1||String(order[i]).toUpperCase()===letter?i+1:''}</td>`).join('')}</tr>`).join('')}</tbody></table></div><p class="pro-muted">Progressione dei punti abilità registrati.</p>`;}
  function teamTable(g,m){const teams=list(g.teams); if(!teams.length)return empty('Composizione delle squadre e statistiche individuali non disponibili.');return `<div class="history-teams">${teams.map(t=>`<div class="history-team"><h4 class="${t.win?'win':t.win===false?'loss':''}">${t.win===true?'Vittoria':t.win===false?'Sconfitta':'Squadra'}</h4>${list(t.players).map(p=>`<div class="history-player ${p.focus?'focus':''}">${portrait(p.champion,m)}<div class="history-player-name"><b>${safe(p.champion)}</b><small>${safe(p.name||'')}</small></div><div class="history-player-stats">${safe(p.kda||'—')}<small>${val(p.cs)} CS · ${num(p.gold)?(p.gold/1000).toFixed(1)+'K':'—'} oro</small></div><div class="history-mini-items">${list(p.items).filter(Boolean).map(x=>unit(x,'item',m)).join('')}</div></div>`).join('')}</div>`).join('')}</div>`;}
  function build(g,m){
    const runes=g.runes||{}, src=https(g.source), day=new Date(g.date), date=Number.isFinite(+day)?day.toLocaleDateString('it-IT'):'Data N/D';
    const csMin=num(g.cs)&&num(g.duration)&&g.duration>0?(g.cs/(g.duration/60)).toFixed(1):null;
    return `<details class="history-game ${g.win===true?'won':g.win===false?'lost':'unknown'}"><summary class="history-row" aria-label="Dettagli partita ${safe(g.player)} ${safe(g.champion)} contro ${safe(g.opponent)}">
    <div class="history-result"><strong>${result(g)}</strong><small>${fmtTime(g.duration)}</small><small title="${safe(date)}">${relative(g.date)}</small></div>
    <div class="history-pro">${playerPhoto(g)}<div class="history-pro-copy"><b>${safe(g.player||'Pro')}</b><small>${safe(g.team||'Squadra N/D')}</small><small>${safe(g.league)} · ${g.type==='soloq'?'SoloQ':'Competitiva'}</small></div></div>
    <div class="history-versus"><span>${portrait(g.champion,m)}<small>${safe(g.champion)}</small></span><b>VS</b><span>${portrait(g.opponent,m)}<small>${safe(g.opponent)}</small></span></div>
    <div class="history-kda"><b>${safe(g.kda||'—')}</b><small>${kda(g)}</small><small>Patch ${safe(g.patch||'—')}</small></div>
    <div class="history-stats"><small>CS ${val(g.cs)}${csMin?' ('+csMin+'/min)':''}</small><small>KP ${num(g.killParticipation)?(g.killParticipation*100).toFixed(0)+'%':'—'}</small><small>GD15 ${num(g.goldDiff15)?(g.goldDiff15>0?'+':'')+val(g.goldDiff15):'—'}</small></div>
    <div class="history-loadout"><div class="history-items">${inventory(g,m)}</div><div class="history-secondary">${list(g.spells).map(x=>unit(x,'spell',m)).join('')}${list(runes.primary).slice(0,1).map(x=>unit(x,'rune',m)).join('')}</div></div><span class="history-chevron" aria-hidden="true">⌄</span></summary>
    <div class="history-detail"><section class="history-section"><h3>Item Build <small>Ordine di acquisto</small></h3><div class="history-final"><small>Inventario finale</small><div class="pro-icons">${inventory(g,m)}</div></div>${timeline(g,m)}</section><section class="history-section"><h3>Skill Order <small>Progressione Q · W · E · R</small></h3>${skills(g)}</section><section class="history-section history-detail-grid"><div><h3>Runes <small>Pagina rune</small></h3>${list(runes.primary).length||list(runes.secondary).length?`<div class="pro-trees">${runeTree(runes.primaryTree,list(runes.primary),m,'Primaria')}${runeTree(runes.secondaryTree,list(runes.secondary),m,'Secondaria')}</div><div class="pro-icons pro-shards">${list(runes.shards).map(v=>statShard(v,m)).join('')}</div>`:empty('Rune non disponibili.')}</div><div><h3>Squadre <small>Scoreboard</small></h3>${teamTable(g,m)}</div></section><div class="pro-game-foot"><span>${safe(date)} · ${m?(m.exact?'Icone patch ':'Icone di riferimento ')+safe(m.v):'Icone non disponibili'}</span>${src?`<a href="${safe(src)}" target="_blank" rel="noopener noreferrer">Fonte ${g.type==='soloq'?'del profilo':'della partita'} ↗</a>`:''}${photoCredit(g)}</div></div></details>`;
  }
  function setPick(n,scroll=false){if(!ready)return;activePick=n;el('proDirection').value='against';el('proPick').value=n;render();if(scroll)el('proPanel').scrollIntoView({behavior:'smooth',block:'start'});}
  function populate(enemy){currentEnemy=enemy;activePick='all';const names=Object.keys(db.assets).filter(n=>n!==enemy).sort((a,b)=>a.localeCompare(b,'it'));const suggested=(db.champions[enemy]||[]).map(p=>p.name).filter(n=>names.includes(n));const options=ns=>ns.map(n=>`<option value="${safe(n)}">${safe(n)}</option>`).join('');el('proEnemy').value=enemy;el('proPick').innerHTML=`<option value="all">Tutti i campioni</option><optgroup label="Counterpick consigliati">${options(suggested)}</optgroup><optgroup label="Altri campioni">${options(names.filter(n=>!suggested.includes(n)))}</optgroup>`;render();}
  function same(a,b){return norm(a)===norm(b)||norm(a)===norm(championId(b));}
  let limit=20;
  async function render(reset=true){
    if(reset)limit=20;const token=++seq, other=el('proPick').value||'all', enemy=currentEnemy, direction=el('proDirection').value;activePick=other;
    el('proDuel').innerHTML=`${portrait(enemy)}<div><b>${direction==='as'?'Partite giocate con':'Partite contro'} ${safe(enemy)}</b><small>${safe(db.assets[enemy]?.title)} · ${other==='all'?'Tutti gli avversari / pick':safe(other)}</small></div>`;
    const p=direction==='as'?enemy:other;const a=encodeURIComponent(championId(p==='all'?enemy:p));
    el('proSources').innerHTML=`<a href="https://www.probuild.gg/champions/builds/${a}" target="_blank" rel="noopener noreferrer">Probuild.gg ↗</a><a href="https://leaguelab.cc/en" target="_blank" rel="noopener noreferrer">LeagueLab ↗</a><small>Fonti esterne: applica i filtri del matchup sul sito di origine.</small>`;
    const league=el('proLeague').value,type=el('proType').value,cutoff=Date.now()-Number(el('proDays').value)*864e5;
    const results=list(cache.matches).filter(g=>same(direction==='as'?g.champion:g.opponent,enemy)&&(other==='all'||same(direction==='as'?g.opponent:g.champion,other))&&g.role==='MID'&&leagues.includes(g.league)&&(league==='all'||g.league===league)&&(type==='all'||g.type===type)&&Date.parse(g.date)>=cutoff).sort((a,b)=>Date.parse(b.date)-Date.parse(a.date));
    const stamp=cache.updatedAt?` · Cache aggiornata ${new Date(cache.updatedAt).toLocaleString('it-IT')}`:' · Cache non ancora popolata';
    el('proStatus').textContent=`${results.length} partite corrispondenti${stamp}`;
    el('proMatches').innerHTML=results.length?'Caricamento delle partite…':`<div class="pro-empty"><h3>${list(cache.matches).length?'Nessuna partita con questi filtri':'Database partite ancora vuoto'}</h3><p>${list(cache.matches).length?'Prova tutti i campioni, un periodo più lungo o cambia il verso del matchup.':'Importa partite competitive o SoloQ tramite lo script nel README. Non vengono mostrate partite o build inventate.'}</p></div>`;
    if(!results.length)return;const games=await Promise.all(results.slice(0,limit).map(async g=>build(g,await assets(g.patch))));if(token!==seq)return;
    el('proMatches').innerHTML=games.join('')+(results.length>limit?`<button class="pro-card-button" id="historyMore">Mostra altre partite (${Math.min(limit,results.length)}/${results.length})</button>`:'');if(el('historyMore'))el('historyMore').onclick=()=>{limit+=20;render(false);};
  }
  async function start(){if(ready||typeof db==='undefined'||!db?.assets)return;ready=true;el('proEnemy').innerHTML=Object.keys(db.champions).sort((a,b)=>a.localeCompare(b,'it')).map(n=>`<option value="${safe(n)}">${safe(n)}</option>`).join('');el('proEnemy').addEventListener('change',()=>pick(el('proEnemy').value));populate(selected);for(const id of ['proPick','proDirection','proLeague','proType','proDays'])el(id).addEventListener('change',()=>render());el('navPro').onclick=()=>el('proPanel').scrollIntoView({behavior:'smooth'});try{cache=await json('pro-matches.json');if(!Array.isArray(cache.matches))throw Error('Cache non valida');}catch(error){console.error('Errore database MidLab:',error);el('proStatus').textContent='Errore caricamento database: '+error.message;el('proMatches').textContent=error.message;return;}const extras=await Promise.all([json('pro-players.json').catch(()=>({})),json('pro-icons.json').catch(()=>({}))]);playerPhotos=extras[0].players||{};archivedIcons=extras[1].icons||{};render();}
  // Failed remote images reveal the real name or initials rather than a broken icon.
  document.addEventListener('error',e=>{if(e.target instanceof HTMLImageElement && e.target.closest('.history-avatar,.pro-slot'))e.target.hidden=true;},true);
  document.addEventListener('midlab:enemy',e=>{if(!ready){start();return;}populate(e.detail);});
  document.addEventListener('midlab:titles',()=>{if(ready)render();});
  el('cards').addEventListener('click',e=>{const b=e.target.closest('[data-pro]');if(b)setPick(b.dataset.pro,true);});
  if(typeof db!=='undefined'&&db?.assets)start();
})();
