// Per-session and context-update caps for a Live voice session, read by Node and by Python
// (live_budget.py) from the same file. Defaults are in live-limits.json; a JSON file named by
// PARTITION_LIVE_LIMITS may override any of them. Unknown names and non-positive numbers are
// refused, so a typo cannot silently lift or zero a cap.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));
export const LIMITS_FILE='live-limits.json';
const invalid=()=>new Error('live_limits_invalid: check live-limits.json and the file named by PARTITION_LIVE_LIMITS');
export function mergeLimits(defaults,changes={}){
  if(!changes||typeof changes!=='object'||Array.isArray(changes)||Object.keys(changes).some(k=>!Object.hasOwn(defaults,k)))throw invalid();
  const out={};
  for(const [section,base] of Object.entries(defaults)){
    const given=changes[section]??{};
    if(typeof given!=='object'||Array.isArray(given)||Object.keys(given).some(k=>!Object.hasOwn(base,k)))throw invalid();
    const merged={...base,...given};
    for(const [name,value] of Object.entries(merged)){
      // Money may be fractional; every other cap is a whole number.
      if(typeof value!=='number'||!Number.isFinite(value)||value<=0||(!name.endsWith('_usd')&&!Number.isInteger(value)))throw invalid();
    }
    out[section]=Object.freeze(merged);
  }
  return Object.freeze(out);
}
export function loadLimits(override=process.env.PARTITION_LIVE_LIMITS,root=here){
  try{
    const defaults=JSON.parse(fs.readFileSync(path.join(root,LIMITS_FILE),'utf8'));
    return mergeLimits(defaults,override?JSON.parse(fs.readFileSync(override,'utf8')):{});
  }catch{throw invalid();}
}
