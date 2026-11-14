import asyncio,json,tempfile,unittest
from pathlib import Path
from unittest.mock import patch,AsyncMock
from live_updates import ContextUpdates,valid_update,encode,MAX_BYTES,MAX_TOTAL_BYTES
from live_budget import Ledger,LIMITS
from live_trace import page

def packet(seq=1,epoch=0):
    return {'type':'game_update','epoch':epoch,'scope':'scope','sequence':seq,'update':{
      'rev':seq+4,'events':[{'id':seq+4,'seat':'west','type':'decision','text':'确认共同动作：递出钥匙，已执行。'}],
      'receipts':[{'requestId':str(seq)*24,'command':'确认：递出钥匙','outcome':'applied','roomEventIds':[seq+4]}],
      'public':dict(doorOpen=False,gateOpen=False,power=False,escaped=False),'pending':None}}

class Owner:
    def __init__(self):
        self.closed=asyncio.Event();self.scope='scope';self.epoch=0;self.speaking=False;self.turn_open=False;self.tool_busy=False;self.tool_queue=asyncio.Queue();self.fixture=True;self.rows=[];self.sent=[]
    def record(self,kind,**kw):self.rows.append(dict(kind=kind,source='offline-fixture',epoch=self.epoch,at_ms=0,**kw))
    async def send_content(self,text,complete):self.sent.append((text,complete))

class UpdateTests(unittest.IsolatedAsyncioTestCase):
    async def start(self,o):
        u=ContextUpdates(o);t=asyncio.create_task(u.run());self.addAsyncCleanup(self.finish,t);return u
    async def finish(self,t):
        t.cancel();await asyncio.gather(t,return_exceptions=True)
    async def settle(self):
        for _ in range(10):await asyncio.sleep(0)
    async def test_same_session_context_only_with_ids_not_new_action(self):
        o=Owner();u=await self.start(o);self.assertTrue(u.offer(packet()));await self.settle()
        self.assertEqual(len(o.sent),1);wire,complete=o.sent[0];self.assertFalse(complete);self.assertIn('Preserve waiting',wire)
        self.assertEqual(json.loads(wire)['game_state_update']['receipts'][0]['requestId'],'1'*24)
        html=page({'events':o.rows},'room','east');self.assertIn('#5',html);self.assertIn('fixture_sent',html);self.assertIn('不证明模型已理解',html);self.assertNotIn('<td>applied</td>',html)
    async def test_production_send_uses_existing_sdk_session_with_false_turn_flag(self):
        from live_worker import Session
        with tempfile.TemporaryDirectory() as tmp:
            ledger=Ledger(tmp,fixture=True);ledger.reserve()
            try:
                s=Session.__new__(Session);s.ledger=ledger;s.fixture=False;s.turn_open=False
                s.session=type('SDK',(),{'send_client_content':AsyncMock()})()
                with patch('socket.socket.connect',side_effect=AssertionError('offline only')):
                    await s.send_content('public context',False)
                s.session.send_client_content.assert_awaited_once_with(turns={'role':'user','parts':[{'text':'public context'}]},turn_complete=False)
                self.assertEqual(ledger.row['text_bytes'],14);self.assertFalse(s.turn_open)
            finally:ledger.close()
    async def test_busy_merges_until_actual_turn_complete(self):
        o=Owner();o.turn_open=True;u=await self.start(o);u.offer(packet());await self.settle();u.offer(packet(2));await self.settle()
        self.assertFalse(o.sent);o.turn_open=False;u.wake();await self.settle()
        self.assertEqual(len(o.sent),1);self.assertEqual([e['id'] for e in json.loads(o.sent[0][0])['game_state_update']['events']],[5,6])
        self.assertEqual(o.rows[-1]['sequences'],[1,2])
    async def test_speaking_tool_busy_and_tool_queue_hold_updates(self):
        for mode in ('speaking','tool_busy','tool_queue'):
            o=Owner();u=await self.start(o)
            if mode=='tool_queue':await o.tool_queue.put({})
            else:setattr(o,mode,True)
            u.offer(packet());await self.settle();self.assertFalse(o.sent)
            if mode=='tool_queue':o.tool_queue.get_nowait()
            else:setattr(o,mode,False)
            u.wake();await self.settle();self.assertEqual(len(o.sent),1)
    async def test_duplicate_out_of_order_wrong_scope_and_schema_never_send(self):
        o=Owner();o.turn_open=True;u=await self.start(o);self.assertTrue(u.offer(packet(2)));self.assertFalse(u.offer(packet(2)));self.assertFalse(u.offer(packet(1)))
        for change in [dict(scope='wrong'),dict(epoch=1),dict(sequence=4),dict(private='PRIVATE_SENTINEL')]:
            self.assertFalse(u.offer(packet(3)|change))
        bad=packet(3);bad['update']['events'][0]['private']='PRIVATE_SENTINEL';self.assertFalse(u.offer(bad));await self.settle();self.assertFalse(o.sent);self.assertNotIn('PRIVATE_SENTINEL',json.dumps(o.rows))
    async def test_epoch_or_stop_cancels_worker_queued_message(self):
        for mode in ('epoch','scope','stop'):
            o=Owner();o.turn_open=True;u=await self.start(o);u.offer(packet());await self.settle()
            if mode=='epoch':o.epoch=1
            elif mode=='scope':o.scope='new'
            else:o.closed.set();u.cancel()
            o.turn_open=False;u.wake();await self.settle();self.assertFalse(o.sent)
    async def test_rate_limit_wait_is_cancelable_no_timer_poll(self):
        o=Owner();u=await self.start(o);u.offer(packet());await self.settle();u.offer(packet(2));await self.settle();self.assertEqual(len(o.sent),1)
        u.cancel();await self.settle();self.assertIsNone(u.pending);self.assertEqual(len(o.sent),1)
    async def test_three_batches_and_cumulative_notification_bytes(self):
        o=Owner();u=await self.start(o)
        for i in range(1,4):
            u.last=-float('inf');self.assertTrue(u.offer(packet(i)));await self.settle()
        self.assertEqual(len(o.sent),3);self.assertFalse(u.offer(packet(4)));self.assertLessEqual(u.bytes,MAX_TOTAL_BYTES)
        p=packet();p['update']['events'][0]['text']='文'*500;p['update']['receipts'][0]['command']='文'*100
        self.assertTrue(valid_update(p['update']))
        o2=Owner();v=await self.start(o2);v.bytes=MAX_TOTAL_BYTES-1;v.offer(p);await self.settle();self.assertFalse(o2.sent);self.assertEqual(o2.rows[-1]['status'],'notification_limit')
    async def test_existing_text_budget_debited_before_transport_no_retry(self):
        with tempfile.TemporaryDirectory() as tmp:
            ledger=Ledger(tmp,fixture=True);ledger.reserve()
            try:
                o=Owner()
                async def send(text,complete):
                    ledger.debit('text_bytes',len(text.encode()));o.sent.append((text,complete))
                o.send_content=send;u=await self.start(o);u.offer(packet());await self.settle()
                self.assertEqual(ledger.row['text_bytes'],len(o.sent[0][0].encode()))
                ledger.debit('text_bytes',LIMITS['text_bytes']-ledger.row['text_bytes']);u.last=-float('inf');u.offer(packet(2));await self.settle()
                self.assertEqual(len(o.sent),1);self.assertEqual(o.rows[-1]['status'],'send_failed_or_canceled_no_retry')
            finally:ledger.close()
    async def test_inflight_send_cannot_be_recalled_or_retried(self):
        o=Owner();started=asyncio.Event();release=asyncio.Event()
        async def send(text,complete):o.sent.append((text,complete));started.set();await release.wait()
        o.send_content=send;u=await self.start(o);u.offer(packet());await started.wait();o.closed.set();u.cancel();release.set();await self.settle()
        self.assertEqual(len(o.sent),1);self.assertEqual(o.rows[-1]['status'],'fixture_sent');self.assertFalse(u.offer(packet(2)))
    async def test_send_failure_not_retried_and_merged_overflow_is_explicit(self):
        o=Owner();o.turn_open=True;u=await self.start(o)
        a=packet();a['update']['events'][0]['text']='文'*500;b=packet(2);b['update']['events'][0]['text']='字'*500
        u.offer(a);u.offer(b);self.assertTrue(any(r['status']=='coalesced_overflow_omitted' for r in o.rows))
        attempts=[]
        async def send(*args):attempts.append(args);raise OSError('PRIVATE_SENTINEL')
        o.send_content=send;o.turn_open=False;u.wake();await self.settle();self.assertEqual(len(attempts),1);self.assertNotIn('PRIVATE_SENTINEL',json.dumps(o.rows))
    async def test_wire_validation_rejects_private_fields_and_bad_references(self):
        for f in (lambda u:u.update(local={'secret':'PRIVATE_SENTINEL'}),lambda u:u['events'][0].update(type='inspect'),lambda u:u['receipts'][0].update(roomEventIds=[99]),lambda u:u['public'].update(keyHere=True)):
            p=packet();f(p['update']);self.assertFalse(valid_update(p['update']))

if __name__=='__main__':unittest.main()
