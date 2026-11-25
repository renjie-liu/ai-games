// Player-facing delivery evidence only. No world reads, model calls or action authority.
// Track bounded public event references, never event text or private observations.
const NODE={queued:'queued',merged:'queued',rebound:'queued',dispatched:'forwarded',not_delivered:'not_delivered',canceled:'not_delivered',delivery_unknown:'uncertain'};
const WORKER={queued:'forwarded',merged:'forwarded',rebound:'forwarded',send_attempt:'sending',fixture_sent:'sent',transport_sent:'sent',not_delivered:'not_delivered',canceled:'not_delivered',rejected:'not_delivered',send_failed_or_canceled_no_retry:'uncertain'};
const LIMIT_REASONS=new Set(['batch_limit','batch_bytes_limit','total_bytes_limit','pending_limit','dedupe_limit','merge_overflow_retained_earlier_facts','text_budget_limit_before_transport']);
export class SyncStatus {
  constructor(){this.version=0;this.phase='off';this.fixture=false;this.facts=new Map();this.limited=false;this.untracked=false;}
  start(fixture){if(this.phase!=='off')return;this.fixture=fixture;this.phase='active';this.version++;}
  accept(row){
    if(this.phase!=='active'||!row||!['node','worker'].includes(row.stage))return false;
    const mapping=row.stage==='node'?NODE:WORKER;
    if(typeof row.status!=='string'||!Object.hasOwn(mapping,row.status))return false;
    const target=mapping[row.status];
    if(!target||!Array.isArray(row.room_event_ids)||row.room_event_ids.length>12||row.room_event_ids.some(x=>!Number.isSafeInteger(x)||x<1))return false;
    const sequences=row.stage==='worker'?row.sequences:[row.sequence];
    if(row.stage==='worker'&&(!Array.isArray(sequences)||!sequences.length||sequences.length>3||sequences.some(x=>!Number.isSafeInteger(x)||x<1||x>3)))return false;
    let changed=false;
    for(const id of row.room_event_ids){
      let prior=this.facts.get(id);
      // Worker messages must correlate to an actual Node-dispatched batch.
      if(row.stage==='worker'&&(!prior||!sequences.includes(prior.sequence)))continue;
      if(!prior&&this.facts.size>=128){if(!this.untracked){this.untracked=true;changed=true;}continue;}
      if(LIMIT_REASONS.has(row.reason)&&!this.limited){this.limited=true;changed=true;}
      // Queue/rebind notifications cannot erase a delivery result or a gap.
      if(prior&&['sent','not_delivered','uncertain'].includes(prior.state)&&['queued','forwarded','sending'].includes(target))continue;
      const sequence=row.stage==='node'&&Number.isSafeInteger(row.sequence)?row.sequence:prior?.sequence??null;
      if(!prior||prior.state!==target||prior.sequence!==sequence){this.facts.set(id,{state:target,sequence});changed=true;}
    }
    if(changed)this.version++;return changed;
  }
  close(){
    if(this.phase==='closed')return;
    this.phase='closed';
    for(const f of this.facts.values()){
      if(f.state==='queued')f.state='not_delivered';
      // A pipe write is not a provider receipt. Late replies cannot reopen a closed run.
      else if(['forwarded','sending'].includes(f.state))f.state='uncertain';
    }
    this.version++;
  }
  snapshot(){
    const counts={queued:0,forwarded:0,sending:0,sent:0,not_delivered:0,uncertain:0};
    for(const f of this.facts.values())counts[f.state]++;
    return {version:this.version,phase:this.phase,source:this.fixture?'offline-fixture':'live-local',...counts,limited:this.limited,untracked:this.untracked};
  }
}
