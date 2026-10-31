"""Cache small, sourced OSM samples along existing corridors for the phase-8 importer.
No public game data is changed by this command; rerun import_phase8.py afterwards.
"""
import json, math, pathlib, urllib.request
ROOT = pathlib.Path(__file__).resolve().parents[1]
CACHE = ROOT/'output/phase8-source'
registry = json.loads((ROOT/'public/data/bus-services.json').read_text(encoding='utf-8'))
for service in registry['routes']:
    route = json.loads((ROOT/'public/data'/service['file']).read_text(encoding='utf-8'))
    pts = route['points']; lengths=[0]
    for a,b in zip(pts,pts[1:]): lengths.append(lengths[-1]+math.hypot((b[0]-a[0])*109400,(b[1]-a[1])*111320))
    for part in [1,2,3]:
        name=f"scenery-{service['id']}-{part}"
        if (CACHE/(name+'.json')).exists(): continue
        index=min(range(len(pts)),key=lambda i:abs(lengths[i]-lengths[-1]*part/4))
        lon,lat=pts[index]; delta=.004
        url=f'https://api.openstreetmap.org/api/0.6/map.json?bbox={lon-delta},{lat-delta},{lon+delta},{lat+delta}'
        try:
            with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'KeralaOpenWorld phase8 scenery research'}),timeout=45) as response: data=json.load(response)
            data['kowCorridor']=service['id']
            (CACHE/(name+'.json')).write_text(json.dumps(data,ensure_ascii=False),encoding='utf-8')
            stops=sum(1 for e in data['elements'] if e.get('tags',{}).get('highway')=='bus_stop')
            print(name, len(data['elements']), 'source elements', stops, 'bus stop records',flush=True)
        except Exception as e: print(name, 'unavailable',str(e),flush=True)
