import { useMemo, useState } from 'react';
import type { Geography, Place } from '../types';
import { categoryLabels, destinationCategories, destinationCategory, destinationPlaces, type DestinationCategory } from '../game/travel';

export function DestinationBrowser({geography,onSelect,selectedId}:{geography:Geography;onSelect:(p:Place)=>void;selectedId?:string}) {
  const [query,setQuery]=useState(''),[district,setDistrict]=useState('all'),[category,setCategory]=useState<DestinationCategory>('all');
  const results=useMemo(()=>destinationPlaces(geography).filter(p=>(district==='all'||district===p.district)&&(category==='all'||destinationCategory(p)===category)&&`${p.name} ${p.localName??''} ${p.district}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())),[geography,query,district,category]);
  return <section className="destination-browser" aria-label="Destination browser">
    <div className="destination-search"><label>Find your next stop<input aria-label="Search places" placeholder="City, village or landmark…" value={query} onChange={e=>setQuery(e.target.value)}/></label>
    <label>District<select aria-label="Destination district filter" value={district} onChange={e=>setDistrict(e.target.value)}><option value="all">All 14 districts</option>{geography.regions.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select></label></div>
    <div className="destination-filters" aria-label="Destination categories">{destinationCategories.map(c=><button key={c} aria-pressed={category===c} onClick={()=>setCategory(c)}>{categoryLabels[c]}</button>)}</div>
    <p className="destination-count" role="status">{results.length} places · select a destination to see travel options</p>
    <div className="destination-results search-results">{results.slice(0,60).map(p=><button key={p.id} className={`place-result ${selectedId===p.id?'selected':''}`}  onClick={()=>onSelect(p)}><strong>{p.name}</strong>{p.localName&&<span lang="ml">{p.localName}</span>}<small>{geography.regions.find(r=>r.id===p.district)?.name} / {categoryLabels[destinationCategory(p)]} · {p.kind.replaceAll("_"," ")}</small></button>)}</div>
    {!results.length&&<p>No matching places. Try another name or district.</p>}{results.length>60&&<p className="destination-count">Showing the first 60. Narrow your search to find more.</p>}
  </section>;
}
