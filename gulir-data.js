const ROOT = new URL('./data/', import.meta.url);
const LATIN_EXCEPTIONS = new Map([
  ['2:181', "Famam baddalahū ba‘da mā sami‘ahū fa innamā iṡmuhū ‘alal-lażīna yubaddilūnah(ū), innallāha samī‘un ‘alīm(un)."],
  ['8:6', "Yujādilūnaka fil-ḥaqqi ba‘da mā tabayyana ka'annamā yusāqūna ilal-mauti wa hum yanẓurūn(a)."],
  ['13:37', "Wa każālika anzalnāhu ḥukman ‘arabiyyā(n), wa la'inittaba‘ta ahwā'ahum ba‘da mā jā'aka minal-‘ilm(i), mā laka minallāhi miw waliyyiw wa lā wāq(in)."],
  ['37:130', "Salāmun ‘alā ilyāsīn(a)."],
]);
const bad = (m) => { throw new TypeError(`Gulir Ayat: ${m}`); };
export function joinWords(words) {
  if(!Array.isArray(words))bad('Data kata tidak valid.');
  const tokens=[];
  for(const w of words){
    if(!Array.isArray(w)||typeof w[0]!=='string')bad('Data kata tidak valid.');
    let signs=w[7]||'';
    if(signs.startsWith('۞')){tokens.push('۞');signs=signs.slice(1);}
    tokens.push(w[0]);
    for(const sign of signs)tokens.push(sign);
  }
  return tokens.join(' ');
}
export function sentenceRanges(texts){
  if(!Array.isArray(texts)||texts.some(t=>typeof t!=='string'))bad('Terjemahan tidak valid.');
  const ranges=[];let first=1;
  for(let i=0;i<texts.length;i++){
    const end=texts[i].replace(/[\s)\]}'"”’»›]+$/gu,'');
    const next=texts[i+1]?.replace(/^[\s([{'"“‘«‹]+/gu,'');
    if(i===texts.length-1||(/[.!?؟。！？]$/u.test(end)&&/^[\p{Lu}\d]/u.test(next||''))){ranges.push([first,i+1]);first=i+2;}
  }
  return ranges;
}
export function createGulirData(index,{fetcher=globalThis.fetch}={}){
  if(!Array.isArray(index)||index.length!==114||index.some((m,i)=>m.n!==i+1||!Number.isInteger(m.ayat)||m.ayat<1))bad('Daftar surah tidak valid.');
  const files=new Map(),loaded=new Map(),pending=new Map(),rangesCache=new Map();
  function validateRef(ref){if(!ref||!Number.isInteger(ref.s)||!Number.isInteger(ref.a)||!index[ref.s-1]||ref.a<1||ref.a>index[ref.s-1].ayat)bad('Referensi ayat tidak valid.');return ref;}
  async function get(file){
    if(!files.has(file)){
      const p=(async()=>{const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000);try{const r=await fetcher(new URL(file,ROOT).href,{signal:controller.signal});if(!r||!r.ok)throw Error(`HTTP ${r?.status||0}`);return await r.json();}finally{clearTimeout(timer);}})();
      files.set(file,p);p.catch(()=>{if(files.get(file)===p)files.delete(file);});
    }
    return files.get(file);
  }
  async function surah(s){
    if(!Number.isInteger(s)||!index[s-1])bad('Nomor surah tidak valid.');
    if(loaded.has(s))return loaded.get(s);
    if(!pending.has(s)){
      const n=String(s).padStart(3,'0'),names=[`s${n}.json`,`id/t${n}.json`,`links/l${n}.json`];
      const promise=(async()=>{try{
        const [words,translations,links]=await Promise.all(names.map(get));
        for(const value of [words,translations,links])if(value?.n!==s||!Array.isArray(value.ayat)||value.ayat.length!==index[s-1].ayat)bad('Berkas surah tidak lengkap.');
        if(translations.ayat.some(t=>typeof t!=='string')||words.ayat.some(w=>!Array.isArray(w)))bad('Isi surah tidak valid.');
        const value={meta:index[s-1],words,translations,links};loaded.set(s,value);rangesCache.set(s,sentenceRanges(translations.ayat));return value;
      }catch(e){names.forEach(name=>files.delete(name));throw e;}finally{pending.delete(s);}})();
      pending.set(s,promise);
    }
    return pending.get(s);
  }
  async function verse(ref){
    const {s,a}=validateRef(ref),d=await surah(s),range=rangesCache.get(s).find(([f,l])=>f<=a&&a<=l);
    const words=d.words.ayat[a-1],wordLatin=words.map(w=>typeof w[6]==='string'?w[6].trim():'').filter(Boolean).join(' '),latin=wordLatin||LATIN_EXCEPTIONS.get(`${s}:${a}`)||'';
    return {s,a,name:d.meta.latin,arabic:joinWords(words),latin,latinSource:wordLatin?'Quranic Arabic Corpus':latin?'EQuran.id':'',translation:d.translations.ayat[a-1],words,part:a-range[0]+1,of:range[1]-range[0]+1,unitKey:`${s}:${range[0]}`};
  }
  async function context(ref){
    const {s,a}=validateRef(ref),v=await verse(ref),first=a-v.part+1,last=first+v.of-1,items=[];
    for(let n=first;n<=last;n++)items.push(await verse({s,a:n}));
    return {items,before:first>1?await verse({s,a:first-1}):null,after:last<index[s-1].ayat?await verse({s,a:last+1}):null};
  }
  async function batch({seed=1,exclude=new Set(),count=10}={}){
    if(!Number.isInteger(count)||count<0||count>100)bad('Ukuran pilihan tidak valid.');
    let state=Number(seed)>>>0||1;
    const random=()=>((state=(Math.imul(state,1664525)+1013904223)>>>0)/4294967296);
    const items=[],units=new Set();
    for(let tries=0;items.length<count&&tries<32;tries++){
      const candidates=globalThis.navigator?.onLine===false&&loaded.size?[...loaded.values()].map(d=>d.meta):index;
      const total=candidates.reduce((n,m)=>n+m.ayat,0);let k=Math.floor(random()*total),selected=candidates[0];
      for(const m of candidates){selected=m;if(k<m.ayat)break;k-=m.ayat;}
      try{
        const v=await verse({s:selected.n,a:k+1});
        if(v.of>5||exclude.has(v.unitKey)||units.has(v.unitKey))continue;
        const group=await context(v);units.add(v.unitKey);items.push(...group.items);
      }catch{/* Bounded selection can still use other cached surahs. */}
    }
    return {items,units:[...units]};
  }
  async function roots(){const list=await get('roots.json');if(!Array.isArray(list))bad('Data akar tidak valid.');return list;}
  async function related(ref,limit=8){
    const {s,a}=validateRef(ref);if(!Number.isInteger(limit)||limit<0||limit>32)bad('Batas hubungan tidak valid.');
    const d=await surah(s),rootList=await roots(),out=[];
    for(const row of (d.links.ayat[a-1]||[]).slice(0,limit)){
      if(!Array.isArray(row)||row.length<4)continue;
      try{const [rs,ra,score,ids]=row;out.push({...await verse({s:rs,a:ra}),score,sharedRoots:(ids||[]).map(id=>rootList[id-1]).filter(Boolean)});}catch{/* Keep available related verses offline. */}
    }
    return out;
  }
  return {surah,verse,context,batch,related,roots};
}
