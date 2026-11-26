import asyncio,json,tempfile,unittest
from pathlib import Path
from unittest.mock import patch,AsyncMock
from live_updates import ContextUpdates,valid_update,encode
from live_budget import Ledger,LIMITS,UPDATES
# These tests are about the queue's mechanics, so they pin their own small limits instead of
# following live-limits.json, which sizes a whole game.
PINNED=dict(debounce_ms=250,interval_ms=2000,batches=3,events=12,batch_bytes=2400,total_bytes=4800)
MAX_BYTES=PINNED['batch_bytes'];MAX_TOTAL_BYTES=PINNED['total_bytes']
_pinned=patch.dict(UPDATES,PINNED)
def setUpModule():_pinned.start()
def tearDownModule():_pinned.stop()
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
    async def test_epoch_and_scope_rebind_but_stop_clears_worker_facts(self):
        for mode in ('epoch','scope','stop'):
            o=Owner();o.turn_open=True;u=await self.start(o);u.offer(packet());await self.settle()
            if mode=='epoch':o.epoch=1
            elif mode=='scope':o.scope='new'
            else:o.closed.set();u.cancel()
            o.turn_open=False;u.wake();await self.settle();self.assertEqual(len(o.sent),0 if mode=='stop' else 1)
            if mode!='stop':
                self.assertTrue(any(e['status']=='rebound' for e in o.rows))
                self.assertEqual(json.loads(o.sent[0][0])['control_scope'],o.scope)
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
        o2=Owner();v=await self.start(o2);v.bytes=MAX_TOTAL_BYTES-1;v.offer(p);await self.settle();self.assertFalse(o2.sent);self.assertEqual(o2.rows[-1]['status'],'not_delivered');self.assertEqual(o2.rows[-1]['reason'],'total_bytes_limit')
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
                self.assertEqual(len(o.sent),1);self.assertEqual(o.rows[-1]['status'],'not_delivered');self.assertEqual(o.rows[-1]['reason'],'text_budget_limit_before_transport')
            finally:ledger.close()
    async def test_inflight_send_cannot_be_recalled_or_retried(self):
        o=Owner();started=asyncio.Event();release=asyncio.Event()
        async def send(text,complete):o.sent.append((text,complete));started.set();await release.wait()
        o.send_content=send;u=await self.start(o);u.offer(packet());await started.wait();o.closed.set();u.cancel();release.set();await self.settle()
        self.assertEqual(len(o.sent),1);self.assertEqual(o.rows[-1]['status'],'fixture_sent');self.assertFalse(u.offer(packet(2)))
    async def test_send_failure_not_retried_and_merged_overflow_is_explicit(self):
        o=Owner();o.turn_open=True;u=await self.start(o)
        a=packet();a['update']['events'][0]['text']='文'*500;b=packet(2);b['update']['events'][0]['text']='字'*500
        u.offer(a);u.offer(b);self.assertTrue(any(r.get('reason')=='merge_overflow_retained_earlier_facts' for r in o.rows))
        attempts=[]
        async def send(*args):attempts.append(args);raise OSError('PRIVATE_SENTINEL')
        o.send_content=send;o.turn_open=False;u.wake();await self.settle();self.assertEqual(len(attempts),1);self.assertNotIn('PRIVATE_SENTINEL',json.dumps(o.rows))
    async def test_wire_validation_rejects_private_fields_and_bad_references(self):
        for f in (lambda u:u.update(local={'secret':'PRIVATE_SENTINEL'}),lambda u:u['events'][0].update(type='inspect'),lambda u:u['receipts'][0].update(roomEventIds=[99]),lambda u:u['public'].update(keyHere=True)):
            p=packet();f(p['update']);self.assertFalse(valid_update(p['update']))

    async def test_busy_rebind_then_merge_retains_both_facts_once(self):
        o=Owner();o.turn_open=True;u=await self.start(o);u.offer(packet());await self.settle()
        o.speaking=True;o.epoch=1;o.scope='new';u.rebind()
        b=packet(2,1);b['scope']='new';self.assertTrue(u.offer(b));await self.settle();self.assertFalse(o.sent)
        o.speaking=False;o.turn_open=False;u.wake();await self.settle()
        self.assertEqual(len(o.sent),1);self.assertEqual(json.loads(o.sent[0][0])['control_scope'],'new')
        self.assertEqual([e['id'] for e in json.loads(o.sent[0][0])['game_state_update']['events']],[5,6])
        self.assertTrue(any(e['status']=='merged' for e in o.rows));self.assertFalse(o.sent[0][1])
    async def test_overflow_keeps_old_facts_and_identifies_new_unsent(self):
        o=Owner();o.turn_open=True;u=await self.start(o)
        a=packet();a['update']['events'][0]['text']='文'*500;b=packet(2);b['update']['events'][0]['text']='字'*500
        self.assertTrue(u.offer(a));self.assertFalse(u.offer(b));self.assertEqual(u.pending['sequences'],[1])
        self.assertEqual(o.rows[-1]['status'],'not_delivered');self.assertEqual(o.rows[-1]['room_event_ids'],[6])
        o.turn_open=False;u.wake();await self.settle();self.assertEqual(json.loads(o.sent[0][0])['game_state_update']['events'][0]['id'],5)
    async def test_invalid_types_rejected_without_reflecting_private_data(self):
        o=Owner();u=await self.start(o)
        for bad in [None,[],{'secret':'PRIVATE_SENTINEL'},packet()|{'type':'PRIVATE_SENTINEL'}]:self.assertFalse(u.offer(bad))
        self.assertNotIn('PRIVATE_SENTINEL',json.dumps(o.rows));self.assertTrue(all(e['status']=='rejected' for e in o.rows))
    async def test_rebound_pending_is_canceled_on_stop_with_references(self):
        o=Owner();o.turn_open=True;u=await self.start(o);u.offer(packet());o.epoch=2;u.rebind();o.closed.set();u.cancel('session_stopped');await self.settle()
        self.assertFalse(o.sent);self.assertIsNone(u.pending);self.assertEqual(o.rows[-1]['room_event_ids'],[5]);self.assertEqual(o.rows[-1]['request_ids'],['1'*24]);self.assertEqual(o.rows[-1]['status'],'canceled')


    async def test_carried_snapshot_is_explicitly_historical_not_refreshed_authority(self):
        o=Owner();o.turn_open=True;u=await self.start(o);b=packet()
        b['update']['pending']={'id':'a'*12,'from':'west','action':'open-door','label':'打开门'}
        u.offer(b);o.epoch=2;o.scope='new';u.rebind()
        o.turn_open=False;u.wake();await self.settle()
        wire=json.loads(o.sent[0][0]);self.assertEqual(wire['as_of_rev'],5)
        self.assertIs(wire['current_state_verified'],False);self.assertEqual(wire['game_state_update']['pending'],b['update']['pending'])
        self.assertIn('may be stale',wire['instruction']);self.assertIn('observe',wire['instruction']);self.assertNotIn('ticket',wire)
        self.assertFalse(o.sent[0][1]);self.assertEqual(o.rows[-1]['as_of_rev'],5)
        self.assertEqual(o.rows[-1]['update_epoch'],2);self.assertEqual(o.rows[-1]['current_epoch'],2)
        html=page({'events':o.rows},'room','east');self.assertIn('截至房间版本 5',html);self.assertIn('不是当前状态保证',html)

    async def test_rejected_packet_epoch_distinct_from_current_and_invalid_not_echoed(self):
        o=Owner();o.epoch=5;u=await self.start(o);self.assertFalse(u.offer(packet(epoch=4)))
        row=o.rows[-1];self.assertEqual(row['update_epoch'],4);self.assertEqual(row['current_epoch'],5)
        self.assertEqual(row['as_of_rev'],5);self.assertEqual(row['room_event_ids'],[5])
        self.assertFalse(u.offer(packet()|{'epoch':'PRIVATE_SENTINEL'}))
        self.assertIsNone(o.rows[-1]['update_epoch']);self.assertNotIn('PRIVATE_SENTINEL',json.dumps(o.rows))

    async def test_server_stop_reason_allowlist_and_first_terminal_reason_preserved(self):
        from live_worker import Session,node_stop_reason,NODE_STOP_REASONS
        for reason in NODE_STOP_REASONS:self.assertEqual(node_stop_reason(reason),reason)
        for bad in (None,{},[],42,'PRIVATE_SENTINEL'):
            self.assertEqual(node_stop_reason(bad),'server_stop_unknown')
        o=Owner();o.reason='closed';u=ContextUpdates(o);o.updates=u;u.offer(packet())
        Session.stop(o,'client_heartbeat_lost');Session.stop(o,'user_stop')
        self.assertEqual(o.reason,'client_heartbeat_lost');self.assertIsNone(u.pending)
        self.assertEqual(o.rows[-1]['reason'],'client_heartbeat_lost');self.assertEqual(o.rows[-1]['request_ids'],['1'*24])
        o.record('closed',reason=o.reason)
        html=page({'events':o.rows},'room','east');self.assertIn('停止原因：client_heartbeat_lost',html);self.assertNotIn('user_stop',html)

if __name__=='__main__':unittest.main()
