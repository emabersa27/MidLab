"""MidLab: recupera le foto direttamente dai file di Leaguepedia, senza Cargo.
Inserire in scripts/ accanto a update_visuals.py. Non modifica partite o icone.
"""
import re
from urllib.parse import quote
from update_visuals import ROOT, WIKI_API, WIKI, request_json, read_json, atomic_json, stamp, photo_key, filekey, chunks

# Titoli pubblicati nell'archivio Player Images di Leaguepedia, non URL ipotizzati.
KNOWN = {
    'chovy': 'GEN Chovy 2026 Split 1.png',
    'showmaker': 'DK ShowMaker 2026 Split 1.png',
    'vicla': 'BFX VicLa 2026 Split 1.png',
    'roamer': 'BRO Roamer 2026 Split 1.png',
    'clozer': 'DNS Clozer 2026 Split 1.png',
    'ucal': 'DRX Ucal 2026 Split 1.png',
    'daystar': 'BFX Daystar 2026 Split 1.png',
    'loki (lee sang-min)': 'C9 Loki 2025 Split 1.png',
}

def api(**params):
    return request_json(WIKI_API, dict(action='query', format='json', **params), wiki=True)

def rank(title, name):
    base = title.removeprefix('File:').replace('_', ' ')
    # Match the exact in-game nickname on that player's own profile page.
    nick = name.split(' (', 1)[0].strip()
    m = re.search(r'\b(20\d\d)\b', base)
    if not m or not re.search(r'(?<![\w])'+re.escape(nick)+r'(?![\w])', base, re.I):
        return None
    if not re.search(r'\.(?:png|jpe?g|webp)$', base, re.I):
        return None
    if re.search(r'\b(?:logo|icon|signature|banner|wallpaper)\b', base, re.I):
        return None
    split = re.search(r'\bSplit\s+(\d+)\b', base, re.I)
    return (int(m.group(1)), int(split.group(1)) if split else 0)

def lookup_profiles(names):
    result = {}
    for batch in chunks(names, 12):
        opts = dict(prop='images', imlimit='max', redirects=1, titles='|'.join(batch))
        candidates = {photo_key(n): [] for n in batch}
        while True:
            data = api(**opts)
            query = data.get('query', {})
            aliases = {photo_key(x['from'].replace('_',' ')): photo_key(x['to'].replace('_',' ')) for x in query.get('normalized', [])+query.get('redirects', [])}
            for p in query.get('pages', {}).values():
                title = photo_key(p.get('title','').replace('_',' '))
                for n in batch:
                    k = photo_key(n); target = k
                    for _ in range(5):
                        if target not in aliases: break
                        target = aliases[target]
                    if target != title: continue
                    for img in p.get('images', []):
                        f = img.get('title',''); score = rank(f,n)
                        if score is not None: candidates[k].append((score,f))
            cont = data.get('continue')
            if not cont: break
            opts.update(cont)
        for k, vals in candidates.items():
            if vals: result[k] = max(vals)[1]
    return result

def resolve(files, names, players, path):
    for batch in chunks(list(files), 25):
        titles = [files[k] if files[k].startswith('File:') else 'File:'+files[k] for k in batch]
        data = api(prop='imageinfo', iiprop='url|mime', iiurlwidth=160, redirects=1, titles='|'.join(titles))
        q = data.get('query', {})
        aliases = {filekey(x['from']):filekey(x['to']) for x in q.get('normalized', [])+q.get('redirects', [])}
        pages = {filekey(p.get('title','')):p for p in q.get('pages', {}).values()}
        for k, title in zip(batch,titles):
            f = filekey(title)
            for _ in range(5):
                if f not in aliases: break
                f = aliases[f]
            p = pages.get(f,{})
            info = (p.get('imageinfo') or [{}])[0]
            url = info.get('thumburl') or info.get('url')
            if not isinstance(url,str) or not url.startswith('https://') or not info.get('mime','').startswith('image/'):
                print(f'{names[k]}: file non risolto ({title})',flush=True); continue
            players[k] = {'name':names[k], 'url':url, 'source':info.get('descriptionurl') or WIKI+quote(title.replace(' ','_'),safe=':'), 'profile':WIKI+quote(names[k].replace(' ','_'),safe='()')}
            print(f'{names[k]}: foto trovata',flush=True)
        atomic_json(path,{'updatedAt':stamp(),'players':players})

def main():
    matches = read_json(ROOT/'pro-matches.json',{}).get('matches',[])
    names = {photo_key(g['player']):g['player'] for g in matches if isinstance(g.get('player'),str) and g['player'].strip()}
    path = ROOT/'pro-players.json'; players = read_json(path,{'players':{}}).get('players',{})
    pending = [k for k in names if not players.get(k,{}).get('url')]
    print(f'Foto: {len(names)} giocatori, {len(pending)} mancanti.',flush=True)
    if not pending: return 0
    try:
        known = {k:KNOWN[k] for k in pending if k in KNOWN}
        if known:
            print('Ricerca diretta dei file fotografici gia individuati...',flush=True)
            resolve(known,names,players,path)
        missing = [names[k] for k in pending if not players.get(k,{}).get('url')]
        if missing:
            print('Ricerca nelle gallerie delle pagine: '+', '.join(missing),flush=True)
            files = lookup_profiles(missing)
            if files: resolve(files,names,players,path)
    except Exception as e:
        print(f'Errore: {type(e).__name__}: {e}. Risultati gia salvati conservati.',flush=True)
    missing = [names[k] for k in names if not players.get(k,{}).get('url')]
    print(f'Foto disponibili: {len(names)-len(missing)}/{len(names)}',flush=True)
    if missing: print('Ancora mancanti: '+', '.join(missing),flush=True)
    return int(bool(missing))

if __name__=='__main__':
    raise SystemExit(main())
