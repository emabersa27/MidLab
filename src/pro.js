/* MidLab Pro Matchups — static UI, data cache populated off-browser. */
(() => {
  'use strict';
  const el = id => document.getElementById(id);
  const safe = x => String(x ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const norm = x => String(x ?? '').toLowerCase().replace(/[^a-z0-9]/g,'');
  const CDN = 'https://ddragon.leagueoflegends.com';
  let cache = {matches:[], updatedAt:null}, versionList, ready = false;
  let activePick = '', currentEnemy = 'Ahri', seq = 0;
  const metadata = new Map();
  const leagues = ['LCK','LPL','LEC','LCS'];
  function championId(name) { return db?.assets?.[name]?.id || name.replace(/[^a-z0-9]/gi,''); }
  function portrait(name) { return `<img class="pro-portrait" src="assets/${safe(championId(name))}.png" alt="${safe(name)}">`; }
  function https(url) { try { const u = new URL(url); return u.protocol === 'https:' ? u.href : ''; } catch { return ''; } }
  async function json(url) { const r = await fetch(url); if (!r.ok) throw Error(`HTTP ${r.status}`); return r.json(); }
  function assets(patch) {
    const tag = String(patch || '');
    if (!metadata.has(tag)) metadata.set(tag, (async () => {
      versionList ||= json(CDN+'/api/versions.json').catch(()=>[]);
      const versions = await versionList;
      const parts = tag.split('.');
      const major = parts[0] === '26' ? '16' : parts[0];
      const prefix = `${major}.${parts[1]}.`;
      const v = versions.find(x => x.startsWith(prefix)) || (/^\d+\.\d+\.\d+$/.test(tag) ? tag : '');
      if (!v) return null;
      const root = `${CDN}/cdn/${v}/data/`;
      const [items,runelist,spells] = await Promise.all([
        json(root+'en_US/item.json'),json(root+'en_US/runesReforged.json'),json(root+'en_US/summoner.json')
      ]);
      const idx = list => {const result={}; for(const a of list) {result[String(a.id)]=a;result[norm(a.name)]=a; if(a.key)result[norm(a.key)]=a;}return result;};
      const itemArray=Object.entries(items.data).map(([id,a])=>({...a,id}));
      return {v,items:idx(itemArray),runes:idx(runelist.flatMap(t=>t.slots.flatMap(s=>s.runes))),trees:idx(runelist),spells:idx(Object.values(spells.data).map(a=>({...a,id:a.key}))),rawTrees:runelist};
    })().catch(()=>null));
    return metadata.get(tag);
  }
  const shard = {'5001':['Salute crescente','StatModsHealthScalingIcon.png'],'5002':['Armatura','StatModsArmorIcon.png'],'5003':['Resistenza magica','StatModsMagicResIcon.png'],'5005':['Velocità d’attacco','StatModsAttackSpeedIcon.png'],'5007':['Velocità abilità','StatModsCDRScalingIcon.png'],'5008':['Forza adattiva','StatModsAdaptiveForceIcon.png'],'5010':['Velocità di movimento','StatModsMovementSpeedIcon.png'],'5011':['Salute','StatModsHealthPlusIcon.png'],'5013':['Tenacia e resistenza rallentamenti','StatModsTenacityIcon.png']};
  function icon(a,type,m) { if (!a) return ''; return type==='rune' || type==='tree' ? `${CDN}/cdn/img/${a.icon}` : `${CDN}/cdn/${m.v}/img/${type==='spell'?'spell':'item'}/${a.image.full}`; }
  function unit(v,type,m) {
    if (!v || v===0 || v==='0') return '<span class="pro-slot blank" aria-label="Slot vuoto"></span>';
    const map = m?.[type==='item'?'items':type==='spell'?'spells':'runes'];
    const a = map?.[String(v)] || map?.[norm(v)];
    const name = a?.name || String(v), src = icon(a,type,m);
    return `<span class="pro-slot ${type}" title="${safe(name)}">${src?`<img src="${safe(src)}" alt="${safe(name)}" loading="lazy">`:`<span>${safe(name)}</span>`}</span>`;
  }
  function runeTree(treeKey,chosen,m,title) {
    const tree = m?.trees?.[String(treeKey)] || m?.trees?.[norm(treeKey)] || m?.rawTrees.find(t=>t.slots.some(s=>s.runes.some(r=>chosen.some(c=>String(c)===String(r.id)||norm(c)===norm(r.name)))));
    if(!tree) return `<div class="pro-tree"><h4>${safe(title)}</h4><div class="pro-rune-row">${chosen.map(r=>unit(r,'rune',m)).join('')||'<span class="pro-muted">Non disponibile</span>'}</div></div>`;
    return `<div class="pro-tree"><h4><img src="${safe(icon(tree,'tree',m))}" alt="">${safe(tree.name)} <small>${safe(title)}</small></h4>${tree.slots.map(slot=>`<div class="pro-rune-row">${slot.runes.map(r=>{const on=chosen.some(c=>String(c)===String(r.id)||norm(c)===norm(r.name));return `<span class="pro-rune ${on?'chosen':''}" title="${safe(r.name)}${on?' · selezionata':''}"><img src="${safe(icon(r,'rune',m))}" alt="${safe(r.name)}" loading="lazy"></span>`;}).join('')}</div>`).join('')}</div>`;
  }
  function build(g,m){
    const runes = g.runes || {}, items = Array.isArray(g.items)?g.items:[], stats = runes.shards || [];
    const src = https(g.source);
    const start = Array.isArray(g.startingItems)?g.startingItems:[], path = Array.isArray(g.buildPath)?g.buildPath:[];
    const day = new Date(g.date); const date = Number.isFinite(+day)?day.toLocaleDateString('it-IT'):'Data non disponibile';
    return `<article class="pro-game"><div class="pro-game-head"><div><div class="eyebrow">${safe(g.league)} · ${g.type==='soloq'?'SOLOQ PRO':'COMPETITIVA'} · PATCH ${safe(g.patch||'N/D')}</div><h3>${safe(g.player)} <span class="pro-team">${safe(g.team||'')}</span></h3><p>${date} · ${safe(g.champion)} vs ${safe(g.opponent)}${g.enemyPlayer?' · '+safe(g.enemyPlayer):''}</p></div><div class="pro-result ${g.win===true?'win':g.win===false?'loss':''}">${g.win===true?'VITTORIA':g.win===false?'SCONFITTA':'ESITO N/D'}<strong>${safe(g.kda||'KDA N/D')}</strong></div></div>
    <div class="pro-build"><div><h4>INVENTARIO FINALE</h4><div class="pro-inventory">${Array.from({length:6},(_,i)=>unit(items[i],'item',m)).join('')}${unit(g.trinket,'item',m)}</div><p class="pro-muted">Gli slot finali non indicano l’ordine di acquisto.</p><h4>INCANTESIMI</h4><div class="pro-icons">${(g.spells||[]).map(x=>unit(x,'spell',m)).join('')||'Non disponibili'}</div>${start.length?`<h4>OGGETTI INIZIALI</h4><div class="pro-icons">${start.map(x=>unit(x,'item',m)).join('')}</div>`:''}${path.length?`<h4>ACQUISTI (IN ORDINE)</h4><div class="pro-icons">${path.map(x=>unit(x,'item',m)).join('')}</div>`:''}</div><div><h4>PAGINA RUNE</h4><div class="pro-trees">${runeTree(runes.primaryTree,runes.primary||[],m,'Primaria')}${runeTree(runes.secondaryTree,runes.secondary||[],m,'Secondaria')}</div><div class="pro-icons pro-shards">${stats.map(v=>{const a=shard[String(v)];return a?`<span class="pro-slot rune" title="${safe(a[0])}"><img src="${CDN}/cdn/img/perk-images/StatMods/${a[1]}" alt="${safe(a[0])}"></span>`:unit(v,'rune',m)}).join('')}</div></div></div><div class="pro-game-foot"><span>${m?'Icone della patch '+safe(m.v):'Icone della patch non disponibili; dati originali mantenuti.'}</span>${src?`<a href="${safe(src)}" target="_blank" rel="noopener noreferrer">${g.type==='soloq'?'Profilo / fonte identità':'Fonte della partita'} ↗</a>`:''}</div></article>`;
  }
  function setPick(n,scroll=false){if(!ready||!db.champions)return; if(n!==currentEnemy&&db.assets[n])activePick=n;el('proPick').value=activePick;render(); if(scroll)el('proPanel').scrollIntoView({behavior:'smooth',block:'start'});}
  function populate(enemy){
    currentEnemy=enemy;
    const names=Object.keys(db.assets).filter(n=>n!==enemy).sort((a,b)=>a.localeCompare(b,'it'));
    const suggested=(db.champions[enemy]||[]).map(p=>p.name).filter(n=>names.includes(n));
    const others=names.filter(n=>!suggested.includes(n));
    const options=ns=>ns.map(n=>`<option value="${safe(n)}">${safe(n)}</option>`).join('');
    el('proEnemy').value=enemy;
    el('proPick').innerHTML=`<optgroup label="Counterpick consigliati">${options(suggested)}</optgroup><optgroup label="Tutti gli altri campioni">${options(others)}</optgroup>`;
    if(!names.includes(activePick))activePick=suggested[0]||names[0];
    setPick(activePick);
  }
  async function render(){
    const token=++seq;const pick=el('proPick').value, enemy=currentEnemy;activePick=pick;
    el('proDuel').innerHTML=`<div>${portrait(pick)}<b>${safe(pick)}</b><span class="pro-champ-title">${safe(db.assets[pick]?.title)}</span><small>IL TUO PICK</small></div><strong>VS</strong><div>${portrait(enemy)}<b>${safe(enemy)}</b><span class="pro-champ-title">${safe(db.assets[enemy]?.title)}</span><small>AVVERSARIO MID</small></div>`;
    const a=encodeURIComponent(championId(pick)),b=encodeURIComponent(championId(enemy));
    el('proSources').innerHTML=`<a href="https://www.probuild.gg/champions/builds/${a}" target="_blank" rel="noopener noreferrer">SoloQ · Probuild.gg ↗</a><a href="https://mid.gg/champion/${a}/vs/${b}" target="_blank" rel="noopener noreferrer">Replay matchup · MID.GG ↗</a><a href="https://leaguelab.cc/en" target="_blank" rel="noopener noreferrer">Competitive · LeagueLab ↗</a><small>Su Probuild.gg seleziona Mid, avversario ${safe(enemy)} e il campionato desiderato. MID.GG può includere anche non professionisti.</small>`;
    const league=el('proLeague').value,type=el('proType').value,days=Number(el('proDays').value);
    const cutoff=Date.now()-days*864e5;
    const results=(cache.matches||[]).filter(g=>[norm(pick),norm(championId(pick))].includes(norm(g.champion))&&[norm(enemy),norm(championId(enemy))].includes(norm(g.opponent))&&g.role==='MID'&&leagues.includes(g.league)&&(league==='all'||g.league===league)&&(type==='all'||g.type===type)&&Date.parse(g.date)>=cutoff).sort((a,b)=>Date.parse(b.date)-Date.parse(a.date));
    const stamp=cache.updatedAt?` · Cache aggiornata ${new Date(cache.updatedAt).toLocaleString('it-IT')}`:' · Cache non ancora popolata';
    el('proStatus').textContent=`${results.length} partite corrispondenti${stamp}`;
    el('proMatches').innerHTML=results.length?'Caricamento delle icone…':`<div class="pro-empty"><h3>Nessuna partita importata per questo matchup</h3><p>Non mostriamo build generiche o inventate. Aumenta il periodo, modifica i filtri o consulta le fonti sopra. Per alimentare la cache usa lo script di aggiornamento descritto nel README.</p></div>`;
    if(!results.length)return;
    const games=await Promise.all(results.slice(0,12).map(async g=>build(g,await assets(g.patch))));if(token!==seq)return;el('proMatches').innerHTML=games.join('')+(results.length>12?'<p class="pro-muted">Mostrate le 12 partite più recenti.</p>':'');
  }
  async function start(){if(ready||typeof db==='undefined'||!db?.assets)return;ready=true;el('proEnemy').innerHTML=Object.keys(db.champions).sort((a,b)=>a.localeCompare(b,'it')).map(n=>`<option value="${safe(n)}">${safe(n)}</option>`).join('');el('proEnemy').addEventListener('change',()=>pick(el('proEnemy').value));populate(selected);for(const id of ['proPick','proLeague','proType','proDays'])el(id).addEventListener('change',render);el('navPro').onclick=()=>el('proPanel').scrollIntoView({behavior:'smooth'});try{cache=await json('pro-matches.json');if(!Array.isArray(cache.matches))throw Error('Cache non valida');}catch{cache={matches:[],updatedAt:null};}render();}
  document.addEventListener('midlab:enemy',e=>{if(!ready){start();return;}populate(e.detail);});
  document.addEventListener('midlab:titles',()=>{if(ready)render();});
  el('cards').addEventListener('click',e=>{const b=e.target.closest('[data-pro]');if(b)setPick(b.dataset.pro,true);});
  if(typeof db!=='undefined'&&db?.assets)start();
})();
