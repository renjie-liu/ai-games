// Public context only. Never starts a model turn, worker, or connection.
export const UPDATE_LIMITS=Object.freeze({debounceMs:250,intervalMs:2000,batches:3,events:12,bytes:2400,totalBytes:4800});
export class PublicUpdates {
  constructor(room,job,send,{now=Date.now,schedule=setTimeout,cancel=clearTimeout}={}){
    Object.assign(this,{room,job,send,now,schedule,cancel});this.seen=new Set();this.clues=new Set();this.events=new Map();this.receipts=new Map();
    this.timer=null;this.last=-Infinity;this.sent=0;this.bytes=0;this.stats={queued:0,duplicate:0,limited:0,canceled:0,dispatched:0};
  }
  clear(){if(this.timer!==null)this.cancel(this.timer);this.timer=null;this.stats.canceled+=this.events.size;this.events.clear();this.receipts.clear();}
  enqueue(role,command,result){
    const {room:r,job:j}=this;
    if(!j.started||j.ended||r.paused||r.controllers[role]!=='human'||!result.ok||!['share','accept','decline','cancel','action'].includes(command.type))return;
    const receipt=result.receipt;if(!receipt||receipt.source!=='rules'||receipt.seat!==role)return;
    if(this.sent>=UPDATE_LIMITS.batches||this.seen.size>=128){this.stats.limited++;return;}
    let added=false;
    for(const e of r.events.filter(e=>receipt.roomEventIds.includes(e.id))){
      if(!['clue','action','request','decision'].includes(e.type))continue;
      if(this.seen.has(e.id)){this.stats.duplicate++;continue;}
      if(this.seen.size>=128){this.stats.limited++;break;}
      this.seen.add(e.id);
      if(e.type==='clue'){
        const shared=r.shared.find(x=>x.seat===role&&x.id===command.id&&x.text===e.text);
        if(!shared)continue;
        const key=JSON.stringify([role,shared.id,shared.text]);
        if(this.clues.has(key)){this.stats.duplicate++;continue;}this.clues.add(key);
      }
      if(this.events.size>=UPDATE_LIMITS.events){this.stats.limited++;continue;}
      // Do not spread events, receipt, human view, or result.message.
      this.events.set(e.id,{id:e.id,seat:e.seat,type:e.type,text:e.text});added=true;this.stats.queued++;
    }
    if(!added)return;
    this.receipts.set(receipt.requestId,{requestId:receipt.requestId,command:receipt.command,outcome:receipt.outcome,
      roomEventIds:receipt.roomEventIds.filter(id=>this.events.has(id))});
    this.epoch=j.epoch;
    if(this.timer===null)this.timer=this.schedule(()=>this.flush(),Math.max(UPDATE_LIMITS.debounceMs,this.last+UPDATE_LIMITS.intervalMs-this.now()));
  }
  flush(){
    this.timer=null;const {room:r,job:j}=this;
    if(j.ended||r.paused||j.epoch!==this.epoch){this.clear();return;}
    if(!this.events.size)return;
    const p=r.pending;
    const update={rev:r.rev,events:[...this.events.values()],receipts:[...this.receipts.values()],public:r.publicPhysics(),
      pending:p?{id:p.id,from:p.from,action:p.action,label:p.label}:null};
    this.events.clear();this.receipts.clear();
    const size=Buffer.byteLength(JSON.stringify(update));
    if(size>UPDATE_LIMITS.bytes||this.bytes+size>UPDATE_LIMITS.totalBytes||this.sent>=UPDATE_LIMITS.batches){this.stats.limited++;return;}
    this.sent++;this.bytes+=size;this.last=this.now();
    this.send({type:'game_update',scope:j.scope,epoch:j.epoch,sequence:this.sent,update});this.stats.dispatched++;
  }
}
