// What a room adds to the fixed mechanisms of engine.mjs: a battery, a choice of supports, a rating.
// The rule sets and which kind of room gets which are in room-rules.json; a JSON file named by
// PARTITION_ROOM_RULES may change any of them or add a set. A set with neither a battery nor a
// choice of supports is the room as it always was. Unknown names and a puzzle that could not be
// built are refused when the file is read, not when a room is made.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));
export const RULES_FILE='room-rules.json';
const invalid=why=>new Error(`room_rules_invalid: ${why} (check room-rules.json and the file named by PARTITION_ROOM_RULES)`);
const SET_KEYS=['title','battery_cells','supports','marks','tags','gate_weights_kg','margins_kg','slot_cm','fit_lengths_cm','long_lengths_cm','stars'];
// A choice of supports needs all of these or none.
const CHOICE_KEYS=SET_KEYS.slice(2,10);
// Words the room rewrites when it tells a seat what the rules said (world.mjs, Room.told): the
// rules name the partner in the third person. A mark or a tag is put into those messages, so it
// cannot contain one.
export const RETOLD_WORDS=Object.freeze(['阿澄','东席搭档','他']);
// What the checks below take for sane. A cell is drawn as one square on the page and a mark is said
// aloud and sits in a button; the rest only has to stay a number that can be kept exactly.
const MOST_CELLS=12,MOST_LETTERS=8,MOST=1e6;
const plain=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const whole=(v,least=1,most=MOST)=>Number.isSafeInteger(v)&&v>=least&&v<=most;
const distinct=(v,ok)=>Array.isArray(v)&&v.length>0&&v.every(ok)&&new Set(v).size===v.length;
const word=v=>typeof v==='string'&&v.trim().length>0;
const spoken=v=>word(v)&&v===v.trim()&&[...v].length<=MOST_LETTERS&&!RETOLD_WORDS.some(w=>v.includes(w));
const freeze=v=>{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;};
function checkSet(name,set){
  const no=why=>{throw invalid(`rule set ${name}: ${why}`);};
  const unknown=Object.keys(set).find(k=>!SET_KEYS.includes(k));
  if(unknown)no(`unknown name ${unknown}`);
  if(!word(set.title))no('needs a title');
  if('battery_cells' in set&&!whole(set.battery_cells,1,MOST_CELLS))no(`battery_cells is a whole number from 1 to ${MOST_CELLS}`);
  const given=CHOICE_KEYS.filter(k=>k in set);
  if(given.length&&given.length!==CHOICE_KEYS.length)no(`a choice of supports needs all of ${CHOICE_KEYS.join(', ')}`);
  if(given.length){
    const {supports:n,marks,tags,gate_weights_kg:weights,margins_kg:margins,slot_cm:slot,fit_lengths_cm:fit,long_lengths_cm:long}=set;
    if(!plain(n)||Object.keys(n).sort().join()!=='too_long,weak'||!whole(n.weak,0)||!whole(n.too_long,0))no('supports counts weak and too_long');
    if(!distinct(marks,spoken)||!distinct(tags,spoken))no(`marks and tags are lists of different words: no spaces around them, at most ${MOST_LETTERS} letters, none of ${RETOLD_WORDS.join(' ')}`);
    if(marks.length<1+n.weak+n.too_long)no('fewer marks than supports');
    // Under every tag but the true one, some support that fits has to look strong enough; each needs its own.
    if(tags.length-1>n.weak)no('more tags than there are weak supports to mislead with');
    if(!distinct(weights,v=>whole(v))||!distinct(margins,v=>whole(v)))no('weights and margins are lists of different whole numbers');
    if(Math.max(...margins)>=Math.min(...weights))no('a margin as large as a gate weight');
    // Within one column of the table no two supports carry the same number.
    if(margins.length<Math.max(1+n.too_long,n.weak))no('too few margins to keep the ratings in a column apart');
    if(!Array.isArray(slot)||slot.length!==2||!slot.every(v=>whole(v))||slot[0]>=slot[1])no('slot_cm is [shortest, longest]');
    if(!distinct(fit,v=>whole(v)&&v>=slot[0]&&v<=slot[1]))no('a length said to fit does not');
    if(!distinct(long,v=>whole(v)&&v>slot[1]))no('a length said to be too long fits');
  }
  if('stars' in set){
    if(!('battery_cells' in set))no('stars count cells, so they need battery_cells');
    const tiers=set.stars;
    if(!plain(tiers)||Object.keys(tiers).some(k=>!['three','two'].includes(k)))no('stars has three and two');
    for(const tier of Object.values(tiers))
      if(!plain(tier)||!Object.keys(tier).length||Object.entries(tier).some(([k,v])=>!['power_ons','spare_packs'].includes(k)||!whole(v,0)))no('a star tier caps power_ons and spare_packs');
  }
}
export function mergeRules(defaults,changes={}){
  if(!plain(changes)||Object.keys(changes).some(k=>!['rooms','rule_sets'].includes(k)))throw invalid('the file has rooms and rule_sets');
  const given=changes.rule_sets??{},sets={};
  if(!plain(given)||!plain(changes.rooms??{}))throw invalid('rooms and rule_sets are objects');
  for(const name of new Set([...Object.keys(defaults.rule_sets),...Object.keys(given)])){
    const change=Object.hasOwn(given,name)?given[name]:{};
    if(!plain(change))throw invalid(`rule set ${name} is an object`);
    const merged={...defaults.rule_sets[name],...change};
    // null takes a name out of a set, so an override can remove the battery or the stars.
    for(const k of Object.keys(merged))if(merged[k]===null)delete merged[k];
    checkSet(name,merged);sets[name]=merged;
  }
  const rooms={...defaults.rooms,...changes.rooms};
  if(Object.keys(rooms).sort().join()!=='live,other'||Object.values(rooms).some(n=>!Object.hasOwn(sets,n)))throw invalid('rooms names a rule set for live and for other');
  // A room with a scripted or a model seat is one of the other rooms, and those seats know one brace.
  if(sets[rooms.other].supports)throw invalid('rooms.other is what scripted and model seats get, and they cannot take a choice of supports');
  return freeze({rooms,rule_sets:sets});
}
export function loadRules(override=process.env.PARTITION_ROOM_RULES,root=here){
  let defaults,changes;
  try{
    defaults=JSON.parse(fs.readFileSync(path.join(root,RULES_FILE),'utf8'));
    changes=override?JSON.parse(fs.readFileSync(override,'utf8')):{};
  }catch{throw invalid('a file could not be read as JSON');}
  return mergeRules(defaults,changes);
}
export const RULES=loadRules();
// The rule set a new room gets when the request names none.
export const rulesFor=(controllers,rules=RULES)=>rules.rooms[Object.values(controllers||{}).includes('live')?'live':'other'];

// A small seeded generator (mulberry32), so a room's puzzle can be made again from its seed.
export function seeded(seed){
  let a=seed>>>0;
  return ()=>{a=(a+0x6D2B79F5)>>>0;let t=a;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};
}
// One room's puzzle from a rule set, or null when the set adds nothing.
//
// The choice of supports is split across the wall. East sees the supports (mark and length), the
// slot they must fit, and a tag on the gate rail. West has the gate's weight and a table of what
// each mark bears, one column per tag. A support holds if it fits and its rating in the column of
// the tag that hangs is at least the weight. The numbers are drawn so that:
//  - exactly one support holds;
//  - under every other tag a different support that fits would look right, so the table without
//    the tag does not give the answer;
//  - the supports that are strong enough under every tag are the ones too long for the slot.
export function makePuzzle(set,random){
  const cells=set.battery_cells??null,stars=set.stars??null;
  if(!set.supports)return cells===null?null:freeze({cells,supports:null,stars});
  const pick=list=>list[Math.floor(random()*list.length)];
  const shuffle=list=>{const a=[...list];for(let i=a.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;};
  const weight=pick(set.gate_weights_kg),tag=pick(set.tags),others=set.tags.filter(t=>t!==tag);
  // -1 is the right one, 0.. are the weak ones, null the ones that do not fit.
  const kinds=[-1,...Array.from({length:set.supports.weak},(_,i)=>i),...Array(set.supports.too_long).fill(null)];
  const marks=shuffle(set.marks),ratings=kinds.map(()=>({}));
  for(const t of set.tags){
    const above=shuffle(set.margins_kg),below=shuffle(set.margins_kg);
    kinds.forEach((kind,i)=>{
      // The weak support number n looks strong enough under the n-th of the other tags, and only there.
      const enough=kind===null||(kind===-1?t===tag:t!==tag&&others.indexOf(t)===kind);
      ratings[i][t]=enough?weight+above.pop():weight-below.pop();
    });
  }
  const supports=kinds.map((kind,i)=>({mark:marks[i],length:pick(kind===null?set.long_lengths_cm:set.fit_lengths_cm),
    fits:kind!==null,holds:kind===-1,ratings:ratings[i]}));
  return freeze({cells,weight,tag,tags:[...set.tags],slot:[...set.slot_cm],supports:shuffle(supports),stars});
}
