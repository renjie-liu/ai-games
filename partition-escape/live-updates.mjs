// Public facts are not action authority. No model turn, worker or connection is started here.
export const UPDATE_LIMITS=Object.freeze({debounceMs:250,intervalMs:2000,batches:3,events:12,bytes:2400,totalBytes:4800});
const esc=x=>String(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function updateTrace(rows,omitted=0){
  return '<section id="node-context-updates"><h2>公开状态上下文同步 · 本地队列</h2><p>queued／merged／rebound 只是排队；dispatched 只到 worker 管道，不是模型送达。not_delivered／canceled 表示未送达且不会自动补送；3批上限不增加。delivery_unknown 表示发送异常，不能确定是否送达，不重试。已有机关回执不受影响，不能据此认定模型理解或主动接话。</p><ul>'+rows.map(e=>'<li>'+esc(e.source)+' · '+esc(e.status)+' · '+esc(e.reason)+' · epoch '+e.update_epoch+' · 本地记录 '+e.audit_id+' · 批次 '+(e.sequence??'未分配')+' · 房间事件 '+esc(e.room_event_ids.map(i=>'#'+i).join(', '))+' · 请求 '+esc(e.request_ids.join(', '))+'</li>').join('')+'</ul>'+(omitted?'<p>Trace 明细上限：另有 '+omitted+' 条未保留；不能把缺失行解释为已送达。</p>':'')+'</section>';
}
export class PublicUpdates {
  constructor(room,job,send,{now=Date.now,schedule=setTimeout,cancel=clearTimeout,audit=()=>{}}={}){
    Object.assign(this,{room,job,send,now,schedule,cancel,onAudit:audit});this.seen=new Set();this.clues=new Set();this.events=new Map();this.receipts=new Map();
    this.rows=[];this.omitted=0;this.serial=0;this.timer=null;this.last=-Infinity;this.sent=0;this.bytes=0;this.stats={queued:0,duplicate:0,limited:0,canceled:0,dispatched:0};
  }
  audit(status,reason,events=[...this.events.values()],receipts=[...this.receipts.values()],sequence=null){
    // References only; never text, caller fields, private view, tokens or error messages.
    const row={kind:'context_update',stage:'node',source:this.job.fixture?'offline-fixture':'live-local',audit_id:++this.serial,
      status,reason,update_epoch:this.job.epoch,sequence,
      room_event_ids:[...new Set(events.map(e=>e.id).filter(i=>Number.isSafeInteger(i)&&i>0))].slice(0,12),
      request_ids:[...new Set(receipts.map(r=>r.requestId).filter(i=>typeof i==='string'&&/^[a-f0-9]{24}$/.test(i)))].slice(0,12)};
    if(this.rows.length<512)this.rows.push(row);else this.omitted++;
    this.onAudit(this.rows,this.omitted,row);
  }
  clear(reason='session_closed'){
    if(this.timer!==null)this.cancel(this.timer);this.timer=null;
    if(this.events.size)this.audit('canceled',reason);
    this.stats.canceled+=this.events.size;this.events.clear();this.receipts.clear();
  }
  rebind(){if(this.events.size)this.audit('rebound','epoch_changed_facts_retained');}
  enqueue(role,command,result){
    const {room:r,job:j}=this;
    if(!j.started||j.ended||r.controllers[role]!=='human'||!['share','accept','decline','cancel','action'].includes(command.type))return;
    const receipt=result.receipt;
    if(!receipt||receipt.source!=='rules'||receipt.seat!==role||!Array.isArray(receipt.roomEventIds))return;
    const candidates=r.events.filter(e=>receipt.roomEventIds.includes(e.id)&&['clue','action','request','decision'].includes(e.type));
    if(!result.ok){this.audit('rejected','engine_rejected',[],[receipt]);return;}
    if(r.paused){this.audit('canceled','game_paused',candidates,[receipt]);return;}
    let added=false;
    for(const e of candidates){
      if(this.seen.has(e.id)){this.stats.duplicate++;this.audit('deduplicated','event_already_seen',[e],[receipt]);continue;}
      let clueKey;
      if(e.type==='clue'){
        const shared=r.shared.find(x=>x.seat===role&&x.id===command.id&&x.text===e.text);
        if(!shared){this.audit('rejected','clue_not_public',[],[receipt]);continue;}
        clueKey=JSON.stringify([role,shared.id,shared.text]);
        if(this.clues.has(clueKey)){this.stats.duplicate++;this.audit('deduplicated','shared_fact_already_seen',[e],[receipt]);continue;}
      }
      if(this.sent>=UPDATE_LIMITS.batches||this.seen.size>=128||this.events.size>=UPDATE_LIMITS.events){
        this.stats.limited++;this.audit('not_delivered',this.sent>=UPDATE_LIMITS.batches?'batch_limit':this.seen.size>=128?'dedupe_limit':'pending_limit',[e],[receipt]);continue;
      }
      this.seen.add(e.id);if(clueKey)this.clues.add(clueKey);
      this.events.set(e.id,{id:e.id,seat:e.seat,type:e.type,text:e.text});added=true;this.stats.queued++;
    }
    if(!added)return;
    const merged=this.receipts.size>0;
    this.receipts.set(receipt.requestId,{requestId:receipt.requestId,command:receipt.command,outcome:receipt.outcome,
      roomEventIds:receipt.roomEventIds.filter(id=>this.events.has(id))});
    this.audit(merged?'merged':'queued',merged?'coalesce_window':'public_receipt');
    if(this.timer===null)this.timer=this.schedule(()=>this.flush(),Math.max(UPDATE_LIMITS.debounceMs,this.last+UPDATE_LIMITS.intervalMs-this.now()));
  }
  flush(){
    this.timer=null;const {room:r,job:j}=this;
    if(j.ended||r.paused){this.clear(r.paused?'game_paused':'session_closed');return;}
    if(!this.events.size)return;
    const p=r.pending;
    const update={rev:r.rev,events:[...this.events.values()],receipts:[...this.receipts.values()],public:r.publicPhysics(),
      pending:p?{id:p.id,from:p.from,action:p.action,label:p.label}:null};
    this.events.clear();this.receipts.clear();
    const report=(status,reason,seq=null)=>this.audit(status,reason,update.events,update.receipts,seq);
    const size=Buffer.byteLength(JSON.stringify(update));
    if(size>UPDATE_LIMITS.bytes||this.bytes+size>UPDATE_LIMITS.totalBytes||this.sent>=UPDATE_LIMITS.batches){
      this.stats.limited++;report('not_delivered',this.sent>=UPDATE_LIMITS.batches?'batch_limit':size>UPDATE_LIMITS.bytes?'batch_bytes_limit':'total_bytes_limit');return;
    }
    this.sent++;this.bytes+=size;this.last=this.now();
    try{
      if(this.send({type:'game_update',scope:j.scope,epoch:j.epoch,sequence:this.sent,update})===false){report('not_delivered','worker_unavailable_no_retry',this.sent);return;}
      report('dispatched','worker_pipe_only',this.sent);this.stats.dispatched++;
    }catch{report('delivery_unknown','worker_write_failed_no_retry',this.sent);}
  }
}
