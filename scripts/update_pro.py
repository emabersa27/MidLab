"""Update MidLab's static match cache. No keys in the browser.
Official match data: Leaguepedia (CC BY-SA 3.0). SoloQ: Riot Match-V5,
only accounts manually verified as active mid pros by the maintainer.
"""
import argparse, datetime as dt, json, os, re, sys, time
from email.utils import parsedate_to_datetime
from pathlib import Path
from urllib.parse import urlencode, quote
from urllib.request import Request, urlopen
from urllib.error import HTTPError
ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / 'pro-matches.json'
LEAGUES = ('LCK','LPL','LEC','LCS')
NOW = dt.datetime.now(dt.timezone.utc)
CUTOFF = NOW - dt.timedelta(days=365)

def get(url, params=None, token=None):
    if params: url += '?' + urlencode(params)
    headers = {'User-Agent': 'MidLab/2.0 (https://github.com/emabersa27/MidLab; esports data project)', 'Accept':'application/json'}
    if token: headers['X-Riot-Token'] = token
    for attempt in range(3):
        try:
            with urlopen(Request(url, headers=headers), timeout=30) as response:
                return json.load(response)
        except HTTPError as e:
            if e.code == 429 and attempt < 2:
                time.sleep(min(120, int(e.headers.get('Retry-After','15')))); continue
            raise RuntimeError(f'HTTP {e.code} from {url.split("?")[0]}') from None

# Conservative pacing for anonymous Leaguepedia requests. Riot is unaffected.
LP_INTERVAL = 65
LP_LAST_REQUEST = None

def retry_delay(value):
    try:
        return max(0, int(value))
    except (TypeError, ValueError):
        try:
            return max(0, (parsedate_to_datetime(value) - dt.datetime.now(dt.timezone.utc)).total_seconds())
        except (TypeError, ValueError, OverflowError):
            return 0

def leaguepedia_get(api, params):
    global LP_LAST_REQUEST
    url = api + ('&' if '?' in api else '?') + urlencode(params)
    headers = {'User-Agent': 'MidLab/2.2 (https://github.com/emabersa27/MidLab; esports data project)', 'Accept': 'application/json'}
    for attempt in range(4):
        if LP_LAST_REQUEST is not None:
            delay = max(0, LP_INTERVAL - (time.monotonic() - LP_LAST_REQUEST))
            if delay:
                print(f'  Pausa API: {round(delay)} s', flush=True)
                time.sleep(delay)
        LP_LAST_REQUEST = time.monotonic()
        wait = 0
        try:
            with urlopen(Request(url, headers=headers), timeout=45) as response:
                data = json.load(response)
                err = data.get('error', {})
                if err.get('code') != 'ratelimited':
                    return data
                wait = retry_delay(response.headers.get('Retry-After'))
        except HTTPError as exc:
            if exc.code != 429:
                raise RuntimeError(f'Leaguepedia HTTP {exc.code}') from None
            wait = retry_delay(exc.headers.get('Retry-After'))
        if attempt == 3:
            raise RuntimeError('Rate limit ancora attivo: cache parziale conservata. Riprova piu tardi.')
        wait = max(wait, 120 * 2**attempt)
        print(f'  Rate limit Leaguepedia: nuovo tentativo tra {round(wait)} s.', flush=True)
        time.sleep(wait)
    raise RuntimeError('Leaguepedia: retries exhausted')

def split(s):
    return [x.strip() for x in re.split(r'[,;]',s or '') if x.strip()]

def integer(v):
    try: return int(v)
    except (ValueError,TypeError): return None

def is_mid(p):
    # Prefer the actual in-game position; use scoreboard role only if absent.
    aliases = {'mid', 'middle', 'midlane', 'midlaner', '3'}
    for key in ('ingameRole', 'role'):
        role = str(p.get(key) or '').strip().lower().replace(' ', '').replace('-', '')
        if role and role not in ('unknown', 'none', 'null', 'undefined'):
            return role in aliases
    return str(p.get('roleNumber') or '').strip() == '3'

def leaguepedia(league_filter=None):
    """Fetch rows, then pair midlaners locally by exact game ID and opposing team."""
    api = os.getenv('LEAGUEPEDIA_API','https://lol.fandom.com/api.php')
    wiki = os.getenv('LEAGUEPEDIA_WIKI','https://lol.fandom.com/wiki/')
    fields = 'GameId=game,DateTime_UTC=date,_pageName=page,OverviewPage=tournament,Link=player,Team=team,Champion=champion,Items__full=items,Trinket=trinket,SummonerSpells__full=spells,PrimaryTree=primaryTree,SecondaryTree=secondaryTree,Runes=runes,Kills=k,Deaths=d,Assists=a,PlayerWin=win,CS=cs,TeamKills=teamKills,UniqueRole=roleId,UniqueRoleVs=enemyRoleId,IngameRole=ingameRole,Role=role,Role_Number=roleNumber'
    for league in (league_filter or LEAGUES):
        print(f'Leaguepedia: {league}...',flush=True)
        games = {}; offset = 0; mid_rows = 0; samples = []; emitted = set()
        while True:
            q = dict(action='cargoquery',format='json',tables='ScoreboardPlayers',fields=fields,where=f'OverviewPage LIKE "{league}/%" AND DateTime_UTC >= "{CUTOFF:%Y-%m-%d}"',order_by='DateTime_UTC DESC,GameId,Link',limit=200,offset=offset)
            data=leaguepedia_get(api,q)
            if 'error' in data:
                err=data['error']
                raise RuntimeError(f'Leaguepedia [{league}, offset {offset}, {err.get("code","unknown")}]: {err.get("info","query failed")}')
            rows=data.get('cargoquery')
            if not isinstance(rows,list): raise RuntimeError('Unexpected Leaguepedia response')
            for row in rows:
                p=row['title']
                if len(samples)<3: samples.append({k:p.get(k) for k in ('game','tournament','date','role','ingameRole','roleNumber')})
                if not is_mid(p): continue
                mid_rows+=1
                if all(p.get(k) for k in ('game','player','team','champion','date')):
                    games.setdefault(p['game'],{})[(p['team'],p['player'])]=p
            print(f'  Righe ricevute: {offset+len(rows)}; mid={mid_rows}',flush=True)
            batch=[]
            for game_id, players in games.items():
                if game_id in emitted: continue
                players=list(players.values())
                if len(players)!=2 or players[0]['team']==players[1]['team']:
                    continue
                emitted.add(game_id)
                for p,e in (players,players[::-1]):
                    # Both rows have the same game ID, opposite teams, and verified mid role.
                    r=split(p.get('runes')); scores=[integer(p.get(k)) for k in ('k','d','a')]
                    team_kills=integer(p.get('teamKills')); win=str(p.get('win','')).lower(); date=str(p['date']).replace(' ','T')
                    batch.append(dict(id='leaguepedia:'+p['game']+':'+p['player'],type='competitive',league=league,role='MID',date=date.rstrip('Z')+'Z',patch=None,player=p['player'],team=p['team'],champion=p['champion'],opponent=e['champion'],enemyPlayer=e['player'],items=split(p.get('items')),trinket=p.get('trinket'),spells=split(p.get('spells')),runes=dict(primaryTree=p.get('primaryTree'),secondaryTree=p.get('secondaryTree'),primary=r[:4],secondary=r[4:6],shards=r[6:9]),win=True if win in ('1','true','yes') else False if win in ('0','false','no') else None,kda='/'.join(map(str,scores)) if None not in scores else None,source=wiki+quote((p.get('page') or p['tournament']).replace(' ','_'),safe='/'),tournament=p.get('tournament'),cs=integer(p.get('cs')),duration=None,killParticipation=(scores[0]+scores[2])/team_kills if team_kills and scores[0] is not None and scores[2] is not None else None))
            if batch:
                yield batch
            print(f'  {league}: {len(emitted)*2} matchup completi individuati.',flush=True)
            if len(rows)<200: break
            offset+=len(rows)
        print(f'  Fine {league}: {len(emitted)*2} matchup; giochi non abbinati={len(games)-len(emitted)}',flush=True)
        if not emitted: print(f'  ATTENZIONE: nessun matchup verificato per {league}.',file=sys.stderr)

def soloq_details(info, p, e, timeline):
    """Extract recorded purchases, ability ranks, scoreboard and CS from Match-V5."""
    duration=info.get('gameDuration')
    def cs(x): return x.get('totalMinionsKilled',0)+x.get('neutralMinionsKilled',0)
    teams=[]
    for teamid in (p['teamId'],e['teamId']):
        members=[x for x in info['participants'] if x['teamId']==teamid]
        teams.append(dict(win=members[0].get('win') if members else None,players=[dict(champion=x['championName'],name=x.get('riotIdGameName') or x.get('summonerName'),kda=f"{x['kills']}/{x['deaths']}/{x['assists']}",cs=cs(x),gold=x.get('goldEarned'),items=[x.get(f'item{i}',0) for i in range(6)],focus=x['participantId']==p['participantId']) for x in members]))
    kills=sum(x['kills'] for x in info['participants'] if x['teamId']==p['teamId'])
    out=dict(duration=duration,cs=cs(p),killParticipation=(p['kills']+p['assists'])/kills if kills else None,teams=teams)
    if timeline is None: return out
    pid=p['participantId']; purchases=[]; skills=[]; gold15=None
    for frame in timeline.get('info',{}).get('frames',[]):
        if frame.get('timestamp')==900000:
            f=frame.get('participantFrames',{}); a=f.get(str(pid),{}).get('totalGold');b=f.get(str(e['participantId']),{}).get('totalGold')
            if a is not None and b is not None: gold15=a-b
        for ev in frame.get('events',[]):
            if ev.get('participantId')!=pid: continue
            if ev.get('type')=='ITEM_PURCHASED' and ev.get('itemId'):
                purchases.append((ev['timestamp']//60000,ev['itemId']))
            elif ev.get('type')=='ITEM_UNDO':
                before=ev.get('beforeId')
                for i in range(len(purchases)-1,-1,-1):
                    if purchases[i][1]==before: purchases.pop(i);break
            elif ev.get('type')=='SKILL_LEVEL_UP' and ev.get('levelUpType')=='NORMAL' and ev.get('skillSlot') in (1,2,3,4): skills.append(ev['skillSlot'])
    groups=[]
    for minute,item in purchases:
        if groups and groups[-1]['minute']==minute:groups[-1]['items'].append(item)
        else:groups.append(dict(minute=minute,items=[item]))
    return dict(out,purchaseTimeline=groups,skillOrder=skills,goldDiff15=gold15)

def soloq(existing):
    token=os.getenv('RIOT_API_KEY')
    accounts=json.loads((ROOT/'scripts/pro-accounts.json').read_text())
    if not token or not accounts:
        print('SoloQ skipped: configure approved RIOT_API_KEY and verified accounts.');return
    valid_regions={'americas','europe','asia','sea'}
    for a in accounts:
        if a.get('league') not in LEAGUES or a.get('region') not in valid_regions or not a.get('rosterSource') or not a.get('player') or not a.get('team'): continue
        region=a['region']; base=f'https://{region}.api.riotgames.com'; puuid=a.get('puuid')
        if not puuid:
            name,tag=a['riotId'].rsplit('#',1); puuid=get(base+'/riot/account/v1/accounts/by-riot-id/'+quote(name,safe='')+'/'+quote(tag,safe=''),token=token)['puuid'];time.sleep(1.3)
        ids=get(base+'/lol/match/v5/matches/by-puuid/'+quote(puuid,safe='')+'/ids',{'queue':420,'startTime':int(CUTOFF.timestamp()),'count':30},token);time.sleep(1.3)
        for mid in ids:
            key=f'riot:{mid}:{a["player"]}'
            if key in existing and 'skillOrder' in existing[key]: continue
            info=get(base+'/lol/match/v5/matches/'+quote(mid,safe=''),token=token)['info'];time.sleep(1.3)
            if info.get('queueId')!=420 or info.get('gameDuration',0)<300: continue
            players=info['participants'];p=next((x for x in players if x['puuid']==puuid and x.get('teamPosition')=='MIDDLE'),None)
            if not p: continue
            enemies=[x for x in players if x['teamId']!=p['teamId'] and x.get('teamPosition')=='MIDDLE']
            if len(enemies)!=1: continue
            e=enemies[0]; styles=p.get('perks',{}).get('styles',[]); stat=p.get('perks',{}).get('statPerks',{}); rune=lambda i:[r['perk'] for r in styles[i].get('selections',[])] if len(styles)>i else []
            when=dt.datetime.fromtimestamp(info['gameStartTimestamp']/1000,dt.timezone.utc)
            try:
                timeline=get(base+'/lol/match/v5/matches/'+quote(mid,safe='')+'/timeline',token=token);time.sleep(1.3)
            except RuntimeError as exc:
                print(f'Timeline unavailable for {mid}: {exc}',file=sys.stderr);timeline=None
            details=soloq_details(info,p,e,timeline)
            yield dict(id=key,type='soloq',league=a['league'],role='MID',date=when.isoformat(),patch='.'.join(info['gameVersion'].split('.')[:2]),player=a['player'],team=a['team'],champion=p['championName'],opponent=e['championName'],items=[p.get(f'item{i}',0) for i in range(6)],trinket=p.get('item6'),spells=[p.get('summoner1Id'),p.get('summoner2Id')],runes=dict(primaryTree=styles[0]['style'] if styles else None,secondaryTree=styles[1]['style'] if len(styles)>1 else None,primary=rune(0),secondary=rune(1),shards=[stat.get(k) for k in ('offense','flex','defense') if stat.get(k)]),win=p['win'],kda=f"{p['kills']}/{p['deaths']}/{p['assists']}",source=a.get('matchHistoryUrl') or a['rosterSource'],matchId=mid,rosterSource=a['rosterSource'],**details)

def diagnose():
    api = os.getenv('LEAGUEPEDIA_API','https://lol.fandom.com/api.php')
    print('API:',api,'UTC cutoff:',CUTOFF.isoformat(),flush=True)
    base = dict(action='cargoquery',format='json',tables='ScoreboardPlayers',fields='GameId=game,OverviewPage=tournament,DateTime_UTC=date,IngameRole=ingameRole,Role=role,Role_Number=roleNumber',order_by='DateTime_UTC DESC',limit=5)
    for label, where in [('Ultime partite senza filtri',None),('LCK, senza limite di data','OverviewPage LIKE "LCK/%"'),('LCK, torneo 2026 documentato','OverviewPage="LCK/2026 Season/Rounds 1-2"'),('LCK, ultimo anno',f'OverviewPage LIKE "LCK/%" AND DateTime_UTC >= "{CUTOFF:%Y-%m-%d}"')]:
        print('\n'+label,flush=True)
        try:
            q=dict(base)
            if where: q['where']=where
            result=leaguepedia_get(api,q)
            print(json.dumps(result,ensure_ascii=False,indent=2),flush=True)
        except Exception as exc: print(type(exc).__name__,str(exc),flush=True)
    return 0

def save_cache(matches, partial):
    out=[]
    for g in matches.values():
        try:
            stamp=dt.datetime.fromisoformat(g['date'].replace('Z','+00:00'))
            if stamp.tzinfo is None: stamp=stamp.replace(tzinfo=dt.timezone.utc)
            if stamp>=CUTOFF: out.append(g)
        except (KeyError,ValueError,TypeError): continue
    out.sort(key=lambda g:g['date'],reverse=True)
    tmp=CACHE.with_suffix('.tmp')
    tmp.write_text(json.dumps({'updatedAt':dt.datetime.now(dt.timezone.utc).isoformat(),'matches':out},ensure_ascii=False,indent=2)+'\n',encoding='utf8')
    tmp.replace(CACHE)
    print(f'{"Cache parziale" if partial else "Cache finale"}: {len(out)} matchup salvati in {CACHE}',flush=True)

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--only',choices=['competitive','soloq','all'],default='all')
    parser.add_argument('--league',choices=LEAGUES,help='Importa solo questa lega competitiva')
    parser.add_argument('--diagnose',action='store_true')
    args=parser.parse_args()
    if args.diagnose: return diagnose()
    if args.league and args.only!='competitive': parser.error('--league richiede --only competitive')
    original=json.loads(CACHE.read_text(encoding='utf8')) if CACHE.exists() else {'matches':[]}
    matches={g['id']:g for g in original['matches']}; errors=[]; saved=False
    if args.only in ('competitive','all'):
        count=0
        try:
            for batch in leaguepedia([args.league] if args.league else None):
                for game in batch: matches[game['id']]=game
                count+=len(batch)
                save_cache(matches,partial=True);saved=True
            if not count: raise RuntimeError('Nessun matchup competitivo verificato.')
            print(f'competitive: {count} records',flush=True)
        except KeyboardInterrupt:
            print('Importazione interrotta: le pagine gia salvate restano nel database.',flush=True);return 130
        except Exception as e:
            errors.append('competitive');print(f'competitive: {type(e).__name__}: {e}',file=sys.stderr)
            print('Cache precedente e pagine gia salvate conservate.',flush=True)
            # Stop on competitive failure; do not continue requesting data.
            return 1
    if args.only in ('soloq','all'):
        accounts_path=ROOT/'scripts/pro-accounts.json'
        if not os.getenv('RIOT_API_KEY') or not accounts_path.exists() or not json.loads(accounts_path.read_text(encoding='utf8')):
            print('SoloQ non configurata.',flush=True)
        else:
            count=0
            try:
                for game in soloq(matches):
                    matches[game['id']]=game;count+=1
                if count: save_cache(matches,partial=True);saved=True
                print(f'soloq: {count} records',flush=True)
            except Exception as e:
                errors.append('soloq');print(f'soloq: {type(e).__name__}: {e}',file=sys.stderr)
                if count: save_cache(matches,partial=True);saved=True
    if saved and not errors: save_cache(matches,partial=False)
    return 1 if errors else 0
if __name__=='__main__': sys.exit(main())
