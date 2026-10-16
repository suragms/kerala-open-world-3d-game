import json,sys
from import_geography import OUT,overpass
sys.stdout.reconfigure(encoding='utf-8')
features=[]
for kind,query in [('road','way["highway"~"motorway|trunk|primary"]["ref"~"NH.?66|NH.?544|NH.?85|NH.?183|NH.?966|NH.?766"](8.1,74.8,12.85,77.5);'),('rail','way["railway"="rail"]["service"!~"yard|spur|siding"](8.1,74.8,12.85,77.5);')]:
 try:
  raw=overpass('[out:json][timeout:65];'+query+'out geom;','state-network-'+kind)
  for e in raw['elements']:
   points=[[p['lon'],p['lat']] for p in e.get('geometry',[]) if p and 'lon'in p]
   if len(points)<2:continue
   features.append({'id':e['id'],'kind':kind,'ref':e.get('tags',{}).get('ref',''),'name':e.get('tags',{}).get('name:en',e.get('tags',{}).get('name','')),'points':points})
  print(kind,len(raw['elements']),flush=True)
 except Exception as e:print(kind,'unavailable',e,flush=True)
ids={(f['id'],f['kind']) for f in features}
for path in OUT.glob('*.json'):
 tile=json.loads(path.read_text(encoding='utf-8'))
 if not isinstance(tile,dict) or 'origin'not in tile:continue
 for f in tile.get('features',[]):
  if f.get('tags',{}).get('railway') in ['rail','subway','light_rail'] and (f['id'],'rail')not in ids:
   ids.add((f['id'],'rail'));features.append({'id':f['id'],'kind':'rail','ref':'','name':f['tags'].get('name:en',f['tags'].get('name','')),'points':f['points']})
(OUT/'state-network.json').write_text(json.dumps({'source':'OpenStreetMap contributors','license':'ODbL-1.0','railCoverage':'Local imported areas are always included. Statewide geometry depends on source availability.','features':features},separators=(',',':')),encoding='utf-8')
