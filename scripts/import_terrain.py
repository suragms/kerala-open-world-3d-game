"""Import attributed Terrain Tiles DEM grids without changing any horizontal coordinates.
Decoded Skadi HGT samples are resampled onto local 80 m scene / 160 m corridor grids.
Values are decimetres above the dataset's vertical datum, with no vertical exaggeration.
Sources, processing and coarse resolution are recorded in every output and the manifest.
"""
import array, datetime, gzip, json, math, pathlib, sys, urllib.request

ROOT=pathlib.Path(__file__).resolve().parents[1]
OUT=ROOT/'public/data'
CACHE=ROOT/'output/phase8-source/terrain'
CACHE.mkdir(parents=True,exist_ok=True)
grids={}
urls=set()

def source_grid(lon,lat):
    west,south=math.floor(lon),math.floor(lat)
    name=f"N{south:02}E{west:03}"
    url=f'https://s3.amazonaws.com/elevation-tiles-prod/skadi/N{south:02}/{name}.hgt.gz'
    urls.add(url)
    if name not in grids:
        file=CACHE/(name+'.hgt.gz')
        if not file.exists():
            request=urllib.request.Request(url,headers={'User-Agent':'KeralaOpenWorld terrain research/phase8'})
            with urllib.request.urlopen(request,timeout=60) as response: data=response.read()
            file.write_bytes(data)
        values=array.array('h'); values.frombytes(gzip.decompress(file.read_bytes()))
        if sys.byteorder=='little': values.byteswap()
        size=math.isqrt(len(values))
        if size*size!=len(values) or size not in [1201,3601]: raise ValueError('Unexpected HGT grid dimensions')
        grids[name]=(size,values)
    size,values=grids[name]
    return size,values,west,south

def elevation(lon,lat):
    n,values,west,south=source_grid(lon,lat)
    x=(lon-west)*(n-1); y=(south+1-lat)*(n-1)
    ix=min(n-2,max(0,math.floor(x))); iy=min(n-2,max(0,math.floor(y)))
    fx,fy=x-ix,y-iy
    samples=[(values[iy*n+ix],(1-fx)*(1-fy)),(values[iy*n+ix+1],fx*(1-fy)),
        (values[(iy+1)*n+ix],(1-fx)*fy),(values[(iy+1)*n+ix+1],fx*fy)]
    valid=[(v,w) for v,w in samples if v!=-32768]
    weight=sum(w for v,w in valid)
    if weight>0: return sum(v*w for v,w in valid)/weight
    for r in range(1,9):
        for dx,dz in [(r,0),(-r,0),(0,r),(0,-r)]:
            px,pz=min(n-1,max(0,ix+dx)),min(n-1,max(0,iy+dz))
            value=values[pz*n+px]
            if value!=-32768: return value
    raise ValueError(f'No valid elevation sample near {lon},{lat}')

def local(p,origin):
    return ((p[0]-origin[0])*111320*math.cos(math.radians(origin[1])), -(p[1]-origin[1])*111320)

areas=[]
for file in sorted(OUT.glob('*.json')):
    try: tile=json.loads(file.read_text(encoding='utf-8'))
    except ValueError: continue
    if isinstance(tile,dict) and all(k in tile for k in ['id','origin','radius','features']):
        areas.append((tile['id'],tile['origin'],[-2800,-2800,2800,2800],80))
registry=json.loads((OUT/'bus-services.json').read_text(encoding='utf-8'))
for service in registry['routes']:
    route=json.loads((OUT/service['file']).read_text(encoding='utf-8'))
    origin=next(s['coordinate'] for s in registry['stations'] if s['id']==service['from'])
    pts=[local(p,origin) for p in route['points']]
    bounds=[min(p[0] for p in pts)-2800,min(p[1] for p in pts)-2800,max(p[0] for p in pts)+2800,max(p[1] for p in pts)+2800]
    areas.append(('corridor-'+service['id'],origin,bounds,160))

manifest={'source':'Mapzen / Tilezen Terrain Tiles; SRTM and GMTED2010 courtesy of USGS; ETOPO1 courtesy of NOAA',
    'reference':'https://registry.opendata.aws/terrain-tiles/',
    'attribution':'https://github.com/tilezen/joerd/blob/master/docs/attribution.md',
    'retrieved':str(datetime.date.today()),'areas':{}}
for area_id,origin,bounds,step in areas:
    min_x,min_z=math.floor(bounds[0]/step)*step,math.floor(bounds[1]/step)*step
    width=math.ceil((bounds[2]-min_x)/step)+1
    height=math.ceil((bounds[3]-min_z)/step)+1
    heights=[]; urls.clear()
    for iz in range(height):
        z=min_z+iz*step; lat=origin[1]-z/111320
        for ix in range(width):
            x=min_x+ix*step; lon=origin[0]+x/(111320*math.cos(math.radians(origin[1])))
            value=elevation(lon,lat)
            if not math.isfinite(value) or value < -500 or value > 4000: raise ValueError(f'Invalid DEM sample for Kerala: {value}')
            heights.append(round(value*10))
    field={'origin':origin,'minX':min_x,'minZ':min_z,'width':width,'height':height,'step':step,'scale':10,'values':heights,
        'source':manifest['source'],'reference':manifest['reference'],'attribution':manifest['attribution'],
        'retrieved':manifest['retrieved'],'sourceAngularResolutionArcSeconds':1,'sourceVerticalDatum':'WGS84 / EGM96 as documented by the Skadi HGT format','sourceResolutionMetres':30.9,
        'processing':'Skadi HGT decoded, void samples excluded or filled from nearest valid neighbours, bilinearly resampled to a local grid and quantized to 0.1 m; game uses triangular interpolation. No vertical exaggeration. Coarse DEM, not surveyed road/bridge elevations.',
        'tiles':sorted(urls)}
    filename='elevation-'+area_id+'.json'
    (OUT/filename).write_text(json.dumps(field,separators=(',',':')),encoding='utf-8')
    manifest['areas'][area_id]={'file':filename,'step':step,'minimum':min(heights)/10,'maximum':max(heights)/10,'samples':len(heights)}
    print(area_id,len(heights),'samples',round(min(heights)/10,1),round(max(heights)/10,1),'m',flush=True)
(OUT/'terrain-index.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
print('Imported terrain for',len(manifest['areas']),'areas from',len(grids),'source tiles',flush=True)
