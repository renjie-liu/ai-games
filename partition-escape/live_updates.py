"""Bounded context delivery on the existing session, never an inference trigger.
No polling, retries, client creation, private seat reads, or new authorization.
"""
import asyncio
import json
import time
from live_budget import UPDATES  # batches, events, batch_bytes, total_bytes, interval_ms: live-limits.json

def encode(value):return json.dumps(value,ensure_ascii=False,separators=(',',':'))
def valid_update(u):
    if not isinstance(u,dict) or set(u)!={'rev','events','receipts','public','pending'}:return False
    if type(u['rev']) is not int or u['rev']<1:return False
    if not isinstance(u['events'],list) or not 1<=len(u['events'])<=UPDATES['events']:return False
    for e in u['events']:
        if not isinstance(e,dict) or set(e)!={'id','seat','type','text'}:return False
        if type(e['id']) is not int or not 1<=e['id']<=u['rev'] or e['seat'] not in ('west','east'):return False
        if e['type'] not in ('clue','action','request','decision') or not isinstance(e['text'],str) or len(e['text'])>500:return False
    if len({e['id'] for e in u['events']})!=len(u['events']):return False
    ids={e['id'] for e in u['events']}
    if not isinstance(u['receipts'],list) or not 1<=len(u['receipts'])<=UPDATES['events']:return False
    for r in u['receipts']:
        if not isinstance(r,dict) or set(r)!={'requestId','command','outcome','roomEventIds'}:return False
        if not isinstance(r['requestId'],str) or len(r['requestId'])!=24 or any(x not in '0123456789abcdef' for x in r['requestId']):return False
        if not isinstance(r['command'],str) or len(r['command'])>100 or r['outcome'] not in ('proposed','applied','recorded'):return False
        if not isinstance(r['roomEventIds'],list) or not r['roomEventIds'] or any(type(i) is not int or i not in ids for i in r['roomEventIds']):return False
    if {i for r in u['receipts'] for i in r['roomEventIds']}!=ids:return False
    if not isinstance(u['public'],dict) or set(u['public'])!={'doorOpen','gateOpen','power','escaped'} or any(type(v) is not bool for v in u['public'].values()):return False
    p=u['pending']
    if p is not None:
        if not isinstance(p,dict) or set(p)!={'id','from','action','label'}:return False
        if not isinstance(p['id'],str) or len(p['id'])!=12 or any(x not in '0123456789abcdef' for x in p['id']):return False
        if p['from'] not in ('west','east') or p['action'] not in ('power-off','open-door','send-key') or not isinstance(p['label'],str) or len(p['label'])>100:return False
    return len(encode(u).encode())<=UPDATES['batch_bytes']

class ContextUpdates:
    def __init__(self,owner,now=time.monotonic):
        self.owner=owner;self.now=now;self.pending=None;self.changed=asyncio.Event()
        self.sequence=0;self.sent=0;self.bytes=0;self.last=-float('inf')
    def audit(self,status,b=None,reason=None):
        # Validate before taking references, never reflect malformed input or private text.
        safe=isinstance(b,dict) and valid_update(b.get('update'))
        self.owner.record('context_update',stage='worker',status=status,reason=reason or status,
          sequences=b.get('sequences',[]) if safe else [],
          update_epoch=b.get('epoch') if safe and type(b.get('epoch')) is int and b['epoch']>=0 else None,
          current_epoch=self.owner.epoch,as_of_rev=b['update']['rev'] if safe else None,
          room_event_ids=[e['id'] for e in b['update']['events']] if safe else [],
          request_ids=[r['requestId'] for r in b['update']['receipts']] if safe else [],turn_complete=False)
    def cancel(self,reason='session_closed'):
        if self.pending:self.audit('canceled',self.pending,reason)
        self.pending=None;self.changed.set()
    def rebind(self):
        if self.pending:
            self.pending['epoch']=self.owner.epoch;self.pending['scope']=self.owner.scope
            self.audit('rebound',self.pending,'epoch_changed_facts_retained')
        self.changed.set()
    def wake(self):self.changed.set()
    def offer(self,b):
        o=self.owner
        if not isinstance(b,dict) or set(b)!={'type','scope','epoch','sequence','update'} or b['type']!='game_update' or type(b['sequence']) is not int or not valid_update(b['update']):
            self.audit('rejected',reason='invalid_packet');return False
        new={**b,'sequences':[b['sequence']]}
        if not self.sequence<b['sequence']<=UPDATES['batches']:
            self.audit('not_delivered' if b['sequence']>UPDATES['batches'] else 'rejected',new,'batch_limit' if b['sequence']>UPDATES['batches'] else 'sequence_replay');return False
        if type(b['epoch']) is not int or b['epoch']!=o.epoch or b['scope']!=o.scope or o.closed.is_set():
            self.audit('rejected',new,'closed_or_stale_packet');return False
        self.sequence=b['sequence']
        if self.pending:
            old=self.pending
            merged={**b['update'],'events':list({e['id']:e for e in old['update']['events']+b['update']['events']}.values()),
              'receipts':list({r['requestId']:r for r in old['update']['receipts']+b['update']['receipts']}.values())}
            if not valid_update(merged):
                self.audit('not_delivered',new,'merge_overflow_retained_earlier_facts');return False
            new['update']=merged;new['sequences']=old['sequences']+new['sequences']
            self.audit('merged',new,'worker_busy_coalesce')
        self.pending=new;self.audit('queued',new,'await_idle');self.changed.set();return True
    async def run(self):
        o=self.owner
        while not o.closed.is_set():
            self.changed.clear()
            b=self.pending
            if b and (b['epoch']!=o.epoch or b['scope']!=o.scope):self.rebind();continue
            if not b or o.speaking or o.turn_open or o.tool_busy or not o.tool_queue.empty():
                await self.changed.wait();continue
            delay=self.last+UPDATES['interval_ms']/1000-self.now()
            if delay>0:
                try:await asyncio.wait_for(self.changed.wait(),delay)
                except TimeoutError:pass
                continue
            # No await from final lifecycle check through accounting and send invocation.
            self.pending=None
            wire=encode({'game_state_update':b['update'],'as_of_rev':b['update']['rev'],'current_state_verified':False,'control_scope':b['scope'],
              'instruction':'Historical public snapshot as_of_rev; may be stale, including pending. No reply/resume request. Preserve waiting. Use observe and a fresh ticket before any action.'})
            size=len(wire.encode())
            if self.sent>=UPDATES['batches'] or self.bytes+size>UPDATES['total_bytes']:
                self.audit('not_delivered',b,'batch_limit' if self.sent>=UPDATES['batches'] else 'total_bytes_limit');continue
            self.sent+=1;self.bytes+=size;self.last=self.now()
            self.audit('send_attempt',b)
            try:await o.send_content(wire,False)
            except BaseException as error:
                # A begun transport send cannot be recalled; never retry or refund.
                if isinstance(error,RuntimeError) and str(error)=='live_text_bytes_limit':
                    self.audit('not_delivered',b,'text_budget_limit_before_transport')
                else:self.audit('send_failed_or_canceled_no_retry',b,'delivery_unknown_no_retry')
                raise
            self.audit('fixture_sent' if o.fixture else 'transport_sent',b,'returned_after_epoch_change' if b['epoch']!=o.epoch else 'transport_return_only')
