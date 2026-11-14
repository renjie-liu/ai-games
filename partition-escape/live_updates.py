"""Bounded context delivery on the existing session, never an inference trigger.
No polling, retries, client creation, private seat reads, or new authorization.
"""
import asyncio
import json
import time

MAX_BATCHES=3
MAX_BYTES=2400
MAX_TOTAL_BYTES=4800
INTERVAL=2.0

def encode(value):return json.dumps(value,ensure_ascii=False,separators=(',',':'))
def valid_update(u):
    if not isinstance(u,dict) or set(u)!={'rev','events','receipts','public','pending'}:return False
    if type(u['rev']) is not int or u['rev']<1:return False
    if not isinstance(u['events'],list) or not 1<=len(u['events'])<=12:return False
    for e in u['events']:
        if not isinstance(e,dict) or set(e)!={'id','seat','type','text'}:return False
        if type(e['id']) is not int or not 1<=e['id']<=u['rev'] or e['seat'] not in ('west','east'):return False
        if e['type'] not in ('clue','action','request','decision') or not isinstance(e['text'],str) or len(e['text'])>500:return False
    if len({e['id'] for e in u['events']})!=len(u['events']):return False
    ids={e['id'] for e in u['events']}
    if not isinstance(u['receipts'],list) or not 1<=len(u['receipts'])<=12:return False
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
    return len(encode(u).encode())<=MAX_BYTES

class ContextUpdates:
    def __init__(self,owner,now=time.monotonic):
        self.owner=owner;self.now=now;self.pending=None;self.changed=asyncio.Event()
        self.sequence=0;self.sent=0;self.bytes=0;self.last=-float('inf')
    def audit(self,status,b):
        # Only references, never message/observation/summary content.
        self.owner.record('context_update',status=status,sequences=b['sequences'],update_epoch=b['epoch'],
          room_event_ids=[e['id'] for e in b['update']['events']],
          request_ids=[r['requestId'] for r in b['update']['receipts']],turn_complete=False)
    def cancel(self):
        if self.pending:self.audit('canceled',self.pending)
        self.pending=None;self.changed.set()
    def wake(self):self.changed.set()
    def offer(self,b):
        o=self.owner
        if set(b)!={'type','scope','epoch','sequence','update'} or type(b['sequence']) is not int or not self.sequence<b['sequence']<=MAX_BATCHES:return False
        if type(b['epoch']) is not int or b['epoch']!=o.epoch or b['scope']!=o.scope or o.closed.is_set() or not valid_update(b['update']):return False
        self.sequence=b['sequence'];new={**b,'sequences':[b['sequence']]}
        if self.pending:
            old=self.pending
            merged={**b['update'],'events':list({e['id']:e for e in old['update']['events']+b['update']['events']}.values()),
              'receipts':list({r['requestId']:r for r in old['update']['receipts']+b['update']['receipts']}.values())}
            if valid_update(merged):new['update']=merged;new['sequences']=old['sequences']+new['sequences']
            else:self.audit('coalesced_overflow_omitted',old)
        self.pending=new;self.audit('queued',new);self.changed.set();return True
    async def run(self):
        o=self.owner
        while not o.closed.is_set():
            self.changed.clear()
            b=self.pending
            if b and (b['epoch']!=o.epoch or b['scope']!=o.scope):self.cancel();continue
            if not b or o.speaking or o.turn_open or o.tool_busy or not o.tool_queue.empty():
                await self.changed.wait();continue
            delay=self.last+INTERVAL-self.now()
            if delay>0:
                try:await asyncio.wait_for(self.changed.wait(),delay)
                except TimeoutError:pass
                continue
            # No await from final lifecycle check through accounting and send invocation.
            self.pending=None
            wire=encode({'game_state_update':b['update'],'control_scope':b['scope'],
              'instruction':'Public state context only, not a request to speak or resume. Preserve waiting. Before any future action use observe and its fresh ticket.'})
            size=len(wire.encode())
            if self.sent>=MAX_BATCHES or self.bytes+size>MAX_TOTAL_BYTES:
                self.audit('notification_limit',b);continue
            self.sent+=1;self.bytes+=size;self.last=self.now()
            self.audit('send_attempt',b)
            try:await o.send_content(wire,False)
            except BaseException:
                # A begun transport send cannot be recalled; never retry or refund.
                self.audit('send_failed_or_canceled_no_retry',b);raise
            self.audit('fixture_sent' if o.fixture else 'transport_sent',b)
