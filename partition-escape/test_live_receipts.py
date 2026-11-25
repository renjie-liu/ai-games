"""B1: a tool must never change the room unless its receipt can still reach the model.
Offline only: fake engine, fixture ledger, no SDK client or network."""
import asyncio,json,tempfile,threading,time,unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch,AsyncMock
from live_budget import Ledger,LIMITS
from live_trace import page
from live_updates import ContextUpdates
import live_worker
from live_worker import Session,RECEIPT_RESERVE_BYTES,compact_receipt,live_config,initial_text

SENTINEL='PRIVATE_SENTINEL_east_only'

class Engine:
    """Stands in for Room.command: counts applied commands; optional gate to hold a call mid-flight."""
    def __init__(self,view_bytes=1500,fail=None):
        self.applied=[];self.view_bytes=view_bytes;self.fail=fail;self.gate=None;self.entered=threading.Event()
    def execute(self,api,seat,root,a,ticket,c,fixture=False):
        self.entered.set()
        if self.gate:self.gate.wait(5)
        if self.fail:raise self.fail
        self.applied.append(c);n=len(self.applied)
        return {'ok':True,'code':None,'message':'已提出递钥匙，等待搭档确认。',
          'receipt':{'requestId':f'{n:024x}','source':'rules','seat':seat,'command':'递出钥匙','outcome':'proposed','code':'ok',
            'roomEventIds':[4+n],'changes':{},'proposalId':'abcdef012345'},
          'harness_run':'tool-'+a,'harness_chunk':'chunk-1','view':{'role':seat,'notes':['x'*self.view_bytes],'secret':SENTINEL}}

class ReceiptTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup)
    def session(self,engine,fixture=True):
        s=Session.__new__(Session)
        s.fixture=fixture;s.api=SimpleNamespace(url='http://127.0.0.1/api/rooms/room');s.root=Path(self.temp.name)
        s.seat='east';s.scope='scope';s.epoch=0
        s.ledger=Ledger(Path(self.temp.name)/'fixture-ledger',fixture=True);s.ledger.reserve();self.addCleanup(s.ledger.close)
        s.closed=asyncio.Event();s.session=SimpleNamespace(send_tool_response=AsyncMock());s.reason='closed'
        s.speaking=False;s.drop_audio=False;s.turn_open=False;s.calls={};s.canceled=set();s.tool_queue=asyncio.Queue()
        s.public=[];s.started=time.monotonic();s.tool_busy=False;s.updates=ContextUpdates(s)
        p1=patch('live_worker.execute',engine.execute);p2=patch('live_worker.emit');p1.start();p2.start()
        self.addCleanup(p1.stop);self.addCleanup(p2.stop)
        return s
    def use_text_until(self,s,available):
        s.ledger.debit('text_bytes',s.ledger.available('text_bytes')-available)
    def rows(self,s,kind='tool_response'):return [r for r in s.public if r['kind']==kind]
    async def run_calls(self,s,*calls,expect=None):
        for c in calls:await s.tool_queue.put({'epoch':s.epoch,**c})
        task=asyncio.create_task(s.tool_loop())
        if expect:
            with self.assertRaisesRegex(RuntimeError,expect):await asyncio.wait_for(task,5)
        else:
            await asyncio.wait_for(s.tool_queue.join(),5);task.cancel();await asyncio.gather(task,return_exceptions=True)
    def command(self,i=1,kind='action',target='send-key'):
        return {'id':f'call-{i}','name':'seat_command','args':{'ticket':'t'*32,'type':kind,'id':target}}
    def full_size(self,engine,s):
        r=engine.execute(s.api,'east',s.root,live_worker.alias('call-1'),'t',{'type':'action','id':'send-key'});engine.applied.clear()
        r['view']=live_worker.slim(r['view']);return len(json.dumps(r,ensure_ascii=False).encode())

    async def test_b1_insufficient_reserve_refuses_before_engine(self):
        e=Engine();s=self.session(e);self.use_text_until(s,RECEIPT_RESERVE_BYTES-1);before=dict(s.ledger.row)
        await self.run_calls(s,self.command(),expect='live_text_bytes_limit')
        self.assertEqual(e.applied,[]);self.assertEqual(s.ledger.row['tools'],before['tools']);self.assertEqual(s.ledger.row['text_bytes'],before['text_bytes'])
        r=self.rows(s)[-1];self.assertEqual((r['execution'],r['delivery'],r['reason']),('not_executed','not_sent','live_text_bytes_limit_before_execution'))
        self.assertFalse(self.rows(s,'tool_result'))
    async def test_exact_reserve_executes_and_compact_receipt_reaches_model(self):
        e=Engine();s=self.session(e);self.use_text_until(s,RECEIPT_RESERVE_BYTES)
        await self.run_calls(s,self.command())
        self.assertEqual(len(e.applied),1);r=self.rows(s)[-1]
        self.assertEqual((r['execution'],r['delivery'],r['response_form']),('engine_receipt','fixture_sent','compact_receipt'))
        self.assertLessEqual(r['response_bytes'],RECEIPT_RESERVE_BYTES);self.assertLessEqual(s.ledger.row['text_bytes'],LIMITS['text_bytes'])
        self.assertEqual(s.ledger.held,0)
    async def test_full_response_at_exact_fit_compact_one_byte_short(self):
        for slack,form in ((0,'full'),(-1,'compact_receipt')):
            with self.subTest(slack=slack):
                self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup)
                e=Engine();s=self.session(e);size=self.full_size(e,s);self.use_text_until(s,size+slack)
                await self.run_calls(s,self.command())
                r=self.rows(s)[-1];self.assertEqual((r['delivery'],r['response_form']),('fixture_sent',form))
                if form=='full':self.assertEqual(r['response_bytes'],size);self.assertEqual(s.ledger.row['text_bytes'],LIMITS['text_bytes'])
    async def test_tool_count_exact_limit_then_refused_before_engine(self):
        e=Engine(view_bytes=10);s=self.session(e);s.ledger.debit('tools',LIMITS['tools']-1)
        await self.run_calls(s,self.command(1));self.assertEqual(len(e.applied),1);self.assertEqual(s.ledger.row['tools'],LIMITS['tools'])
        await self.run_calls(s,self.command(2),expect='live_tools_limit')
        self.assertEqual(len(e.applied),1);r=self.rows(s)[-1]
        self.assertEqual((r['execution'],r['delivery'],r['reason']),('not_executed','not_sent','live_tools_limit_before_execution'))
    async def test_concurrent_text_cannot_consume_held_receipt_bytes(self):
        e=Engine();e.gate=threading.Event();s=self.session(e);self.use_text_until(s,RECEIPT_RESERVE_BYTES+100)
        await s.tool_queue.put({'epoch':0,**self.command()});task=asyncio.create_task(s.tool_loop())
        await asyncio.to_thread(e.entered.wait,5)
        self.assertEqual(s.ledger.held,RECEIPT_RESERVE_BYTES)
        with self.assertRaisesRegex(RuntimeError,'live_text_bytes_limit'):await s.send_content('x'*101,False)
        await s.send_content('x'*100,False)  # exactly the unheld remainder still works
        e.gate.set();await asyncio.wait_for(s.tool_queue.join(),5);task.cancel();await asyncio.gather(task,return_exceptions=True)
        r=self.rows(s)[-1];self.assertEqual((r['execution'],r['delivery'],r['response_form']),('engine_receipt','fixture_sent','compact_receipt'))
        self.assertEqual(s.ledger.row['text_bytes'],LIMITS['text_bytes']-RECEIPT_RESERVE_BYTES+r['response_bytes'])
    async def test_stop_mid_execution_records_late_receipt_never_sends(self):
        e=Engine();e.gate=threading.Event();s=self.session(e,fixture=False)
        await s.tool_queue.put({'epoch':0,**self.command()});task=asyncio.create_task(s.tool_loop())
        await asyncio.to_thread(e.entered.wait,5)
        s.stop('user_stop');task.cancel();await asyncio.sleep(0);e.gate.set()
        results=await asyncio.gather(task,return_exceptions=True);self.assertIsInstance(results[0],asyncio.CancelledError)
        self.assertEqual(len(e.applied),1);s.session.send_tool_response.assert_not_called()
        self.assertEqual(self.rows(s,'tool_result')[-1]['receipt']['requestId'],f'{1:024x}')
        r=self.rows(s)[-1];self.assertEqual((r['execution'],r['delivery'],r['reason']),('engine_receipt','not_sent','session_closed'))
        self.assertEqual(s.ledger.held,0)
    async def test_close_after_execution_before_response_is_not_sent(self):
        e=Engine();e.gate=threading.Event();s=self.session(e,fixture=False)
        await s.tool_queue.put({'epoch':0,**self.command()});task=asyncio.create_task(s.tool_loop())
        await asyncio.to_thread(e.entered.wait,5);s.stop('client_heartbeat_lost');e.gate.set()
        await asyncio.wait_for(s.tool_queue.join(),5);await asyncio.wait_for(task,5)
        self.assertEqual(len(e.applied),1);s.session.send_tool_response.assert_not_called()
        r=self.rows(s)[-1];self.assertEqual((r['execution'],r['delivery'],r['reason']),('engine_receipt','not_sent','session_closed'))
    async def test_execution_exception_is_unknown_bounded_and_sent_once(self):
        e=Engine(fail=OSError('socket detail '+SENTINEL));s=self.session(e)
        await self.run_calls(s,self.command())
        r=self.rows(s)[-1];self.assertEqual((r['execution'],r['delivery'],r['code']),('outcome_unknown','fixture_sent','live_outcome_unknown'))
        self.assertNotIn(SENTINEL,json.dumps(s.public,ensure_ascii=False))
    async def test_duplicate_call_not_reexecuted_and_tool_slot_used_once(self):
        e=Engine(view_bytes=10);s=self.session(e)
        await self.run_calls(s,self.command(),self.command())
        self.assertEqual(len(e.applied),1);self.assertEqual(s.ledger.row['tools'],1)
        self.assertEqual([r['execution'] for r in self.rows(s)],['engine_receipt','not_executed_duplicate'])
        conflict={**self.command(),'args':{'ticket':'u'*32,'type':'inspect','id':'hatch'}}
        await self.run_calls(s,conflict);self.assertEqual(self.rows(s)[-1]['code'],'duplicate_call_conflict');self.assertEqual(len(e.applied),1)
    async def test_superseded_or_canceled_calls_never_reach_engine(self):
        e=Engine();s=self.session(e);s.epoch=1;s.canceled.add('call-2')
        await self.run_calls(s,{**self.command(1),'epoch':0},{**self.command(2),'epoch':1})
        self.assertEqual(e.applied,[]);self.assertEqual(s.ledger.row['tools'],0)
        self.assertEqual({r['execution'] for r in self.rows(s)},{'not_executed'})
    async def test_transport_failure_is_delivery_unknown_without_retry(self):
        e=Engine(view_bytes=10);s=self.session(e,fixture=False);s.session.send_tool_response=AsyncMock(side_effect=ConnectionError('wire'))
        await s.tool_queue.put({'epoch':0,**self.command()})
        with self.assertRaises(ConnectionError):await asyncio.wait_for(s.tool_loop(),5)
        self.assertEqual(s.session.send_tool_response.await_count,1);self.assertEqual(len(e.applied),1)
        r=self.rows(s)[-1];self.assertEqual((r['execution'],r['delivery']),('engine_receipt','delivery_unknown_no_retry'))
    async def test_real_mode_sends_response_after_debit(self):
        e=Engine(view_bytes=10);s=self.session(e,fixture=False)
        await self.run_calls(s,self.command())
        s.session.send_tool_response.assert_awaited_once();r=self.rows(s)[-1]
        self.assertEqual((r['delivery'],r['response_form']),('transport_sent','full'));self.assertEqual(s.ledger.row['text_bytes'],r['response_bytes'])
        sent=s.session.send_tool_response.await_args.kwargs['function_responses'][0].response;self.assertNotIn(SENTINEL,json.dumps(sent))
    async def test_observe_is_never_truncated_into_a_blind_ticket(self):
        e=Engine();s=self.session(e)
        s.observation=AsyncMock(return_value={'ok':True,'ticket':'t'*32,'scope':'scope','view':{'notes':['y'*1500]}})
        self.use_text_until(s,RECEIPT_RESERVE_BYTES)
        await self.run_calls(s,{'id':'obs','name':'observe','args':{'scope':'scope'}},expect='live_text_bytes_limit')
        r=self.rows(s)[-1];self.assertEqual((r['execution'],r['delivery'],r['reason']),('read_only','not_sent','text_budget_limit'))
        self.assertEqual(e.applied,[])
    async def test_trace_page_separates_execution_from_delivery(self):
        e=Engine();e.gate=threading.Event();s=self.session(e)
        await s.tool_queue.put({'epoch':0,**self.command()});task=asyncio.create_task(s.tool_loop())
        await asyncio.to_thread(e.entered.wait,5);s.stop('user_stop');task.cancel();await asyncio.sleep(0);e.gate.set()
        await asyncio.gather(task,return_exceptions=True)
        html=page({'events':s.public,'audit':s.ledger.row},'room','east')
        self.assertIn('已交引擎',html);self.assertIn('未发送给模型',html);self.assertIn('session_closed',html);self.assertIn('#5',html)
        self.assertNotIn(SENTINEL,html);self.assertNotIn('xxxxxxxxxx',html)

class CompactTests(unittest.TestCase):
    def test_worst_case_compact_receipt_fits_reserve_and_drops_view(self):
        huge='界'*5000
        r={'ok':True,'code':'c'*500,'message':huge,'view':{'secret':SENTINEL},'harness_run':'r'*500,'harness_chunk':'k'*500,
           'receipt':{'requestId':'f'*24,'command':huge,'outcome':'applied','code':'ok','roomEventIds':list(range(10**6-50,10**6)),
             'changes':{'doorOpen':True,'gateOpen':False,'power':True,'escaped':False,'private':SENTINEL},'proposalId':'a'*12,'private':SENTINEL}}
        c=compact_receipt(r);wire=json.dumps(c,ensure_ascii=False)
        self.assertLessEqual(len(wire.encode()),RECEIPT_RESERVE_BYTES);self.assertNotIn(SENTINEL,wire);self.assertNotIn('view',c)
        self.assertEqual(c['receipt']['requestId'],'f'*24);self.assertEqual(len(c['receipt']['roomEventIds']),12)
    def test_malformed_receipt_values_are_dropped_not_echoed(self):
        c=compact_receipt({'ok':'yes','receipt':{'requestId':'<script>','outcome':'pwned','roomEventIds':['1',True,-1,3],'changes':'x'}})
        self.assertIs(c['ok'],False);self.assertIsNone(c['receipt']['requestId']);self.assertIsNone(c['receipt']['outcome'])
        self.assertEqual(c['receipt']['roomEventIds'],[3]);self.assertEqual(c['receipt']['changes'],{})

class FixtureAccountingTests(unittest.IsolatedAsyncioTestCase):
    async def test_fixture_debits_same_config_and_initial_observation_as_real_session(self):
        with tempfile.TemporaryDirectory() as tmp:
            ledger=Ledger(Path(tmp)/'fixture-ledger',fixture=True)
            initial={'ok':True,'ticket':'t'*32,'scope':'scope','view':{'role':'east','notes':['n'*300]}}
            env={'PARTITION_RUN_ROOT':tmp,'PARTITION_SEAT':'east','PARTITION_LIVE_SCOPE':'scope','PARTITION_ENDPOINT':'http://127.0.0.1:9/api/rooms/r','PARTITION_SEAT_TOKEN':'x'}
            async def idle(self,*a):await asyncio.Event().wait()
            async def done(self,*a):return None
            with patch.dict('os.environ',env),patch('live_worker.Ledger',return_value=ledger),patch('live_worker.emit'),\
                 patch.object(Session,'observation',AsyncMock(return_value=initial)),patch.object(Session,'input_loop',idle),patch.object(Session,'fixture_loop',done):
                s=Session(True);await s.run()
            expected=len(json.dumps(live_config('east'),ensure_ascii=False).encode())+len(initial_text(initial).encode())
            self.assertEqual(ledger.row['text_bytes'],expected);self.assertGreater(expected,2000)

if __name__=='__main__':unittest.main()
