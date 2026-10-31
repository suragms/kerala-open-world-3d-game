"""Reproducible OSM terminal and OSRM road-corridor import. No timetables are inferred.
Raw responses are cached in output/phase8-source. Run with --refresh to re-query.
Road routing uses OSRM's OSM-derived driving profile, not an official bus-service feed.
"""
import json, math, pathlib, sys, urllib.request, urllib.parse, datetime

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / 'public/data'
CACHE = ROOT / 'output/phase8-source'
CACHE.mkdir(exist_ok=True)
refresh = '--refresh' in sys.argv
def fetch(url, name):
    file = CACHE / (name + '.json')
    if file.exists() and not refresh:
        return json.loads(file.read_text(encoding='utf-8'))
    request = urllib.request.Request(url, headers={'User-Agent': 'KeralaOpenWorld/phase8 geographic research'})
    with urllib.request.urlopen(request, timeout=55) as response:
        data = json.load(response)
    file.write_text(json.dumps(data, ensure_ascii=False), encoding='utf-8')
    return data

regions = json.loads((OUT / 'regions.json').read_text(encoding='utf-8'))
stations = []
nodes = {}
def import_elements(data, district, tile):
    elements = data.get('elements', [])
    nodes.update({e['id']: [e['lon'], e['lat']] for e in elements if e['type'] == 'node'})
    for e in elements:
        tags = e.get('tags', {})
        if tags.get('amenity') != 'bus_station' or tags.get('disused') == 'yes': continue
        if not tags.get('name'): continue
        key = f"{e['type']}-{e['id']}"
        if any(s['id'] == key for s in stations): continue
        points = [nodes[n] for n in e.get('nodes', []) if n in nodes]
        coordinate = [e['lon'], e['lat']] if e['type'] == 'node' else [sum(p[i] for p in points) / len(points) for i in [0, 1]] if points else None
        if not coordinate: continue
        stations.append(dict(id=key, name=tags['name'], localName=tags.get('name:ml', 'ബസ് സ്റ്റേഷൻ'), district=district,
            coordinate=coordinate, source=f"https://www.openstreetmap.org/{e['type']}/{e['id']}", fidelity='C',
            status='Mapped bus terminal; live operating status and schedules not verified', tile=tile))

# Preserve previously imported geometry and original identities.
for file in OUT.glob('*.json'):
    try: data = json.loads(file.read_text(encoding='utf-8'))
    except ValueError: continue
    if not isinstance(data, dict) or 'features' not in data or 'origin' not in data: continue
    district = next((r['id'] for r in regions if r['id'] in file.stem), None)
    if file.stem == 'airport-ccj': district = 'malappuram'
    if not district: continue
    for e in data['features']:
        if e['tags'].get('amenity') != 'bus_station' or not e['tags'].get('name'): continue
        key = f"{e['type']}-{e['id']}"
        if any(s['id'] == key for s in stations): continue
        pts = e['points']; coordinate = [sum(p[i] for p in pts) / len(pts) for i in [0, 1]]
        stations.append(dict(id=key, name=e['tags']['name'], localName=e['tags'].get('name:ml', 'ബസ് സ്റ്റേഷൻ'), district=district,
            coordinate=coordinate, source=f"https://www.openstreetmap.org/{e['type']}/{e['id']}", fidelity='C',
            status='Mapped bus terminal; live operating status and schedules not verified', tile=file.stem))

# Small OSM API extracts provide actual terminal records, access roads, stops and building footprints.
towns = [('guruvayur', 'thrissur', 76.0417924, 10.5950431, 'station-thrissur-guruvayur'),
         ('aluva', 'ernakulam', 76.3526, 10.1087, 'bus-aluva'),
         ('kozhikode', 'kozhikode', 75.7847, 11.2588, 'kozhikode'),
         ('kannur', 'kannur', 75.371, 11.873, 'kannur'),
         ('ernakulam', 'ernakulam', 76.2854, 9.9715, 'bus-ernakulam'),
         ('kottayam', 'kottayam', 76.5216, 9.5916, 'kottayam'),
         ('vyttila', 'ernakulam', 76.3217772, 9.9685632, 'vyttila-hub')]
towns.append(('thampanoor', 'thiruvananthapuram', 76.9517, 8.4873, 'bus-thampanoor'))
towns.append(('sakthan', 'thrissur', 76.2147284, 10.5151357, 'bus-sakthan'))
towns.append(('east-fort', 'thiruvananthapuram', 76.9473301, 8.4826038, 'bus-east-fort'))
places = json.loads((OUT / 'places.json').read_text(encoding='utf-8'))
for district, town in [('thiruvananthapuram', 'Thiruvananthapuram'), ('kollam', 'Kollam'),
    ('pathanamthitta', 'Pathanamthitta'), ('alappuzha', 'Alappuzha'), ('idukki', 'Thodupuzha'),
    ('palakkad', 'Palakkad'), ('malappuram', 'Malappuram'), ('wayanad', 'Kalpetta'), ('kasaragod', 'Kasaragod'), ('thrissur', 'Kunnamkulam')]:
    place = next((p for p in places if p['district'] == district and p['name'].lower() == town.lower() and p['kind'] in ['town', 'city']), None)
    if place: towns.append((town.lower(), district, place['lon'], place['lat'], 'bus-' + town.lower()))
extracts = {}
for name, district, lon, lat, tile in towns:
    delta = 0.004 if name in ['thampanoor','sakthan','east-fort'] else 0.012
    try:
        # Reuse the initial research extract when available.
        existing = ROOT / 'output/phase8-guruvayur-source.json'
        if name == 'guruvayur' and existing.exists() and not (CACHE / 'guruvayur.json').exists():
            (CACHE / 'guruvayur.json').write_text(existing.read_text(encoding='utf-8'), encoding='utf-8')
        raw = fetch(f'https://api.openstreetmap.org/api/0.6/map.json?bbox={lon-delta},{lat-delta},{lon+delta},{lat+delta}', name)
        extracts[name] = raw
        import_elements(raw, district, tile)
        print(name, 'terminal records imported', flush=True)
    except Exception as e:
        print(name, 'source unavailable:', str(e), flush=True)

for file in CACHE.glob('scenery-*.json'):
    extracts[file.stem] = json.loads(file.read_text(encoding='utf-8'))

boundaries = json.loads((OUT/'districts.geojson').read_text(encoding='utf-8'))
def inside_ring(point, ring):
    x,y=point; inside=False
    for a,b in zip(ring,ring[1:]+ring[:1]):
        if (a[1]>y)!=(b[1]>y) and x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0]: inside=not inside
    return inside
def district_at(point, fallback):
    for f in boundaries['features']:
        g=f['geometry']; polys=[g['coordinates']] if g['type']=='Polygon' else g['coordinates']
        for poly in polys:
            if inside_ring(point,poly[0]) and not any(inside_ring(point,hole) for hole in poly[1:]): return f['properties']['id']
    return fallback

for station in stations:
    if station['id'] == 'way-241740100':
        station['reference'] = 'https://www.onlineksrtcswift.com/contact_us'
    if station['id'] == 'way-931648255':
        station['name'] = 'Guruvayur KSRTC Bus Stand'
        station['reference'] = 'https://www.dtpcthrissur.com/destination/guruvayur-sree-krishna-temple'
vyttila = next(p for p in places if p['name'] == 'Vyttila Mobility Hub')
stations.append(dict(id='relation-17712257', name=vyttila['name'], localName='വൈറ്റില മൊബിലിറ്റി ഹബ്', district='ernakulam',
    coordinate=[vyttila['lon'], vyttila['lat']], source=vyttila['source'], reference='https://www.vyttilamobilityhub.com/bus-timing',
    fidelity='C', status='Published facility reference; schedules simulated, not live', tile='vyttila-hub'))
for station in stations:
    name=station['name'].lower()
    station['verifiedAt']='2026-10-23'
    station['type']='mobility_hub' if station['id']=='relation-17712257' else 'private_terminal' if 'private' in name else 'public_terminal' if 'ksrtc' in name or 'state road' in name else 'bus_station'
    station['verification']='OSM facility identity and district checked; original procedural architecture'
    if station['type']=='public_terminal':
        station['reference']='https://onlineksrtcswift.com/contact_us'
        station['status']='Facility listed in the operator directory checked 2026-10-23; not a live operating-status or timetable feed'

def choose(district, text, prefer=''):
    found = [s for s in stations if s['district'] == district and text.lower() in s['name'].lower()]
    return next((s for s in found if prefer.lower() in s['name'].lower()), found[0] if found else None)

def features(raw):
    local_nodes = {e['id']: [e['lon'], e['lat']] for e in raw.get('elements', []) if e['type'] == 'node'}
    result = []
    for e in raw.get('elements', []):
        tags = e.get('tags', {})
        if e['type'] == 'way' and any(k in tags for k in ['highway', 'building', 'railway', 'natural', 'waterway', 'landuse']):
            pts = [local_nodes[n] for n in e.get('nodes', []) if n in local_nodes]
            if len(pts) > 1: result.append(dict(id=e['id'], type='way', tags=tags, points=pts))
        if e['type'] == 'node' and (tags.get('highway') in ['bus_stop', 'traffic_signals'] or tags.get('public_transport') == 'platform'):
            result.append(dict(id=e['id'], type='node', tags=tags, points=[local_nodes[e['id']]]))
    return result

all_features = [f for raw in extracts.values() for f in features(raw)]
for name, district, lon, lat, tile in towns:
    if tile.startswith('bus-') and name in extracts:
        (OUT / (tile + '.json')).write_text(json.dumps(dict(id=tile, origin=[lon, lat], radius=1600,
            features=features(extracts[name]), source='OpenStreetMap contributors', license='ODbL-1.0'), ensure_ascii=False, separators=(',', ':')), encoding='utf-8')

services = []
pairs = [(choose('thrissur', 'Thrissur KSRTC'), choose('thrissur', 'Guruvayur KSRTC')),
         (choose('ernakulam', 'Vyttila'), choose('ernakulam', 'Aluva', 'Private')),
         (choose('thrissur', 'Thrissur KSRTC'), choose('ernakulam', 'Ernakulam', 'KSRTC')),
         (choose('kozhikode', 'KSRTC'), choose('kannur', 'KSRTC')),
         (choose('kottayam', 'KSRTC'), choose('ernakulam', 'Ernakulam', 'KSRTC'))]
for start, end in pairs:
    if not start or not end: continue
    route_id = start['district'] + '-' + ('guruvayur' if 'Guruvayur' in end['name'] else 'aluva' if 'Aluva' in end['name'] else end['district'])
    url = 'https://router.project-osrm.org/route/v1/driving/' + ';'.join(','.join(str(v) for v in s['coordinate']) for s in [start, end]) + '?overview=full&geometries=geojson&steps=true&annotations=nodes'
    try:
        raw = fetch(url, 'route-' + route_id)
        if raw.get('code') != 'Ok': raise ValueError('No connected road route')
        route = raw['routes'][0]
        points = route['geometry']['coordinates']
        dense = [points[0]]
        for a, b in zip(points, points[1:]):
            length = math.hypot((b[0]-a[0])*109400, (b[1]-a[1])*111320)
            count = max(1, math.ceil(length/60))
            dense.extend([[a[k]+(b[k]-a[k])*i/count for k in [0,1]] for i in range(1,count+1)])
        points = dense
        total = sum(math.hypot((b[0]-a[0])*109400, (b[1]-a[1])*111320) for a,b in zip(points,points[1:]))
        if len(points) < 3 or abs(total-route['distance']) > route['distance']*.08: raise ValueError('Imported route failed geometry validation')
        service = dict(id=route_id, **{'from': start['id']}, to=end['id'], file='bus-route-' + route_id + '.json',
            distance=route['distance'], source=url, simulation=True)
        # Expose road geometry in small segments, without assigning fabricated OSM way identities.
        road_features = []
        for i, step in enumerate(route['legs'][0]['steps']):
            if len(step['geometry']['coordinates']) < 2: continue
            road_features.append(dict(id=-1000000 - i, type='derived-road', tags={'highway': 'secondary', 'name': step.get('name') or 'OSM routed road', 'oneway': 'yes', 'source': 'OSRM / OpenStreetMap', 'derived': 'yes'}, points=step['geometry']['coordinates']))
        # Retain only nearby sourced scenery; avoid loading unrelated city extracts for every journey.
        grid = {}
        for p in points: grid.setdefault((math.floor(p[0]*1000), math.floor(p[1]*1000)), []).append(p)
        nearby = []
        for f in all_features:
            p = f['points'][0]; gx, gy = math.floor(p[0]*1000), math.floor(p[1]*1000)
            if any((gx+dx,gy+dy) in grid for dx in range(-3,4) for dy in range(-3,4)): nearby.append(f)
        combined = { (f['type'], f['id']): f for f in nearby }
        for f in road_features: combined[(f['type'], f['id'])] = f
        # Intermediate stop coordinates are sourced; game dwell/schedules are fictional.
        stops = []
        for raw_extract in extracts.values():
            for e in raw_extract.get('elements', []):
                tags = e.get('tags', {})
                if e['type'] == 'node' and tags.get('highway') == 'bus_stop' and tags.get('name'):
                    coordinate=[e['lon'],e['lat']]
                    stops.append(dict(name=tags['name'], coordinate=coordinate, source=f"https://www.openstreetmap.org/node/{e['id']}", district=district_at(coordinate,start['district'])))
        stops.sort(key=lambda s: min(range(len(points)), key=lambda i: (points[i][0]-s['coordinate'][0])**2+(points[i][1]-s['coordinate'][1])**2))
        data = dict(service=service, points=points, features=list(combined.values()), stops=stops,
            provenance=dict(retrieved=str(datetime.date.today()), profile='OSRM driving; not a bus-access survey', license='ODbL-1.0', schedules='Simulated in game; no real service number or timetable'))
        (OUT / service['file']).write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
        services.append(service)
        print(route_id, round(route['distance']), 'metres', len(points), 'road vertices', flush=True)
    except Exception as e: print(route_id, 'disabled:', str(e), flush=True)

(OUT / 'bus-services.json').write_text(json.dumps(dict(stations=stations, routes=services), ensure_ascii=False, indent=2), encoding='utf-8')
print(len(stations), 'mapped terminals;', len(services), 'connected simulated road journeys', flush=True)
