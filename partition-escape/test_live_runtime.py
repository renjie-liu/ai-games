"""Real SDK imports/serialization, but fake transports only. No keys or paid calls."""
import asyncio, contextlib, importlib, json, os, socket, tempfile, unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch
from live_runtime import check, diagnostic
from live_budget import Ledger
from live_worker import Session, SYSTEM, TOOLS

class RuntimeTests(unittest.TestCase):
    def test_complete_dependency_preflight_without_socket_or_credentials(self):
        with patch('socket.create_connection',side_effect=AssertionError('network')), patch('live_worker.key',side_effect=AssertionError('key read')):
            self.assertEqual(check(),{'ok':True,'code':'ready','network_requests':0})

    def test_each_missing_dependency_has_safe_specific_code(self):
        original=importlib.import_module
        for module,code in [('google.genai','sdk'),('socksio','http_proxy'),('python_socks.async_.asyncio','socks'),('websockets.asyncio.client','websocket')]:
            def load(name):
                if name==module:raise ImportError('PRIVATE_SENTINEL_PROXY_PASSWORD')
                return original(name)
            with self.subTest(module=module),patch('live_runtime.importlib.import_module',side_effect=load):
                with self.assertRaisesRegex(RuntimeError,'^live_dependency_'+code+'$'):check()

    def test_a_harness_checkout_that_is_not_the_pinned_one_is_named_before_any_session(self):
        original=importlib.import_module
        def load(name):
            if name=='live_harness':raise ModuleNotFoundError("No module named 'harness.trace' at /PRIVATE_SENTINEL/path")
            return original(name)
        with patch('live_runtime.importlib.import_module',side_effect=load):
            with self.assertRaisesRegex(RuntimeError,'^live_harness_mismatch$'):check()

    def test_a_limits_file_that_cannot_be_used_is_named_before_any_session(self):
        original=importlib.import_module
        def load(name):
            if name=='live_budget':raise RuntimeError('live_limits_invalid PRIVATE_SENTINEL')
            return original(name)
        with patch('live_runtime.importlib.import_module',side_effect=load):
            with self.assertRaisesRegex(RuntimeError,'^live_limits_invalid$'):check()

    def test_the_preflight_process_reports_a_wrong_harness_and_a_bad_override_as_codes_only(self):
        import subprocess,sys
        here=Path(__file__).resolve().parent
        with tempfile.TemporaryDirectory() as empty:
            bad=Path(empty)/'limits.json';bad.write_text('{"session":{"second":90}}')
            cases=[({'PYTHONPATH':empty,'PARTITION_HARNESS_ROOT':empty},'live_harness_mismatch'),({'PARTITION_LIVE_LIMITS':str(bad)},'live_limits_invalid')]
            for change,code in cases:
                with self.subTest(code=code):
                    r=subprocess.run([sys.executable,str(here/'live_runtime.py')],cwd=here,env={**os.environ,**change},capture_output=True,text=True,timeout=60)
                    self.assertEqual(r.returncode,1)
                    self.assertEqual(json.loads(r.stdout),{'ok':False,'code':code,'network_requests':0})
                    self.assertNotIn(empty,r.stdout)

    def test_diagnostics_do_not_echo_exception_or_import_name(self):
        error=ImportError('PRIVATE_SENTINEL',name='PRIVATE_SENTINEL')
        self.assertEqual(diagnostic(error),'live_dependency_import')
        self.assertIsNone(diagnostic(ValueError('PRIVATE_SENTINEL')))

    def test_no_connected_event_never_claims_real_connection(self):
        from live_trace import page
        data={'events':[{'source':'gemini-live','kind':'closed','at_ms':0}],'audit':None}
        html=page(data,'room','east')
        self.assertIn('未建立连接',html);self.assertNotIn('真实 Gemini Live',html)

class AsyncRuntimeTests(unittest.IsolatedAsyncioTestCase):
    async def test_actual_sdk_constructs_with_http_socks_proxy_offline(self):
        from google import genai
        with patch.dict(os.environ,{'HTTPS_PROXY':'socks5://127.0.0.1:9'}),patch('socket.create_connection',side_effect=AssertionError('network')):
            client=genai.Client(api_key='offline-dummy-key')
            self.assertIsNotNone(client.aio.live)
            await client.aio.aclose();client.close()

    async def test_actual_sdk_socks_route_reaches_mock_transport(self):
        from google import genai
        from google.genai import types
        from websockets.exceptions import ProxyError
        client=genai.Client(api_key='offline-dummy-key')
        loop=asyncio.get_running_loop()
        with patch('websockets.asyncio.client.get_proxy',return_value='socks5h://127.0.0.1:9'),patch('websockets.asyncio.client.SocksProxy.connect',AsyncMock(side_effect=RuntimeError('OFFLINE_STOP'))) as transport,patch.object(loop,'create_connection',AsyncMock(side_effect=AssertionError('NETWORK_BLOCKED'))) as network:
            with self.assertRaises(ProxyError):
                async with client.aio.live.connect(model='gemini-3.8-live',config=types.LiveConnectConfig(response_modalities=['AUDIO'],tools=TOOLS,system_instruction=SYSTEM)):pass
            self.assertEqual(transport.await_count,1);self.assertEqual(network.call_count,0)
        await client.aio.aclose();client.close()

    async def test_actual_sdk_handshake_serializes_with_fixture_websocket(self):
        from google import genai
        from google.genai import types
        messages=[]
        class WS:
            async def send(self,data):messages.append(json.loads(data))
            async def recv(self,**kwargs):return '{"setupComplete":{"sessionId":"offline-fixture"}}'
        @contextlib.asynccontextmanager
        async def fixture_socket(*args,**kwargs):yield WS()
        client=genai.Client(api_key='offline-dummy-key')
        with patch('google.genai.live.ws_connect',fixture_socket):
            async with client.aio.live.connect(model='gemini-3.8-live',config=types.LiveConnectConfig(response_modalities=['AUDIO'],tools=TOOLS,system_instruction=SYSTEM)) as session:
                self.assertEqual(session.session_id,'offline-fixture')
        self.assertEqual(len(messages),1);self.assertIn('setup',messages[0])
        await client.aio.aclose();client.close()

    async def test_player_first_startup_over_sdk_wire(self):
        for acknowledged in (False, True):
            with self.subTest(acknowledged=acknowledged), tempfile.TemporaryDirectory() as tmp:
                root = Path(tmp)
                traffic = []

                class Socket:
                    async def send(self, message):
                        traffic.append(json.loads(message))

                    async def recv(self, **kwargs):
                        if len(traffic) == 1:
                            return '{"setupComplete":{}}' if acknowledged else '{}'
                        await asyncio.Event().wait()

                @contextlib.asynccontextmanager
                async def connect(*args, **kwargs):
                    yield Socket()

                def emit(row):
                    traffic.append(row['type'])

                async def stop_after_start(worker):
                    worker.stop('user_stop')

                env = {'PARTITION_RUN_ROOT': str(root/'run'), 'PARTITION_SEAT': 'east',
                       'PARTITION_LIVE_SCOPE': 'scope', 'PARTITION_ENDPOINT': 'http://127.0.0.1:9/fixture',
                       'PARTITION_SEAT_TOKEN': 'fixture'}
                with (patch.dict(os.environ, env), patch('google.genai.live.ws_connect', connect),
                      patch('live_worker.key', return_value='offline-dummy-key'),
                      patch('live_worker.Ledger', return_value=Ledger(root/'ledger', fixture=True)),
                      patch('live_worker.emit', emit), patch.object(Session, 'input_loop', stop_after_start),
                      patch.object(Session, 'observation', AsyncMock(return_value={'ok': True, 'view': {}}))):
                    worker = Session()
                    await asyncio.wait_for(worker.run(), 5)
                self.assertIn('setup', traffic[0])
                self.assertEqual(worker.ledger.row['tools'], 0)
                if acknowledged:
                    seed = traffic[1]['client_content']
                    self.assertFalse(seed['turnComplete'])
                    self.assertIn('initial_observation', seed['turns'][0]['parts'][0]['text'])
                    self.assertEqual(traffic[2:], ['ready', 'closed'])
                else:
                    self.assertEqual(traffic[1:], ['closed'])
                    self.assertEqual(worker.reason, 'live_setup_unacknowledged')

    async def failure_before_reservation(self,failure_at):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);ledger=Ledger(root/'ledger',fixture=True);before=ledger.path.read_bytes()
            env={'PARTITION_RUN_ROOT':str(root/'run'),'PARTITION_ENDPOINT':'http://127.0.0.1:9/api/rooms/fixture','PARTITION_SEAT_TOKEN':'fixture','PARTITION_SEAT':'east','PARTITION_LIVE_SCOPE':'fixture'}
            with patch.dict(os.environ,env),patch('live_worker.Ledger',return_value=ledger),patch('live_worker.emit') as output,patch.object(Session,'observation',AsyncMock(side_effect=AssertionError('network'))) as observation:
                session=Session()
                if failure_at=='dependency':
                    with patch('live_worker.check_runtime',side_effect=RuntimeError('live_dependency_socks')),patch('live_worker.key',side_effect=AssertionError('key read')):
                        await session.run()
                else:
                    with patch('live_worker.key',return_value='offline-dummy-key'),patch('google.genai.Client',side_effect=ImportError('PRIVATE_SENTINEL')):
                        await session.run()
                self.assertEqual(ledger.path.read_bytes(),before);self.assertIsNone(ledger.row);observation.assert_not_called()
                data=json.loads((root/'run/live-public.json').read_text())
                self.assertFalse(any(x['kind']=='connection_reserved' for x in data['events']))
                self.assertNotIn('PRIVATE_SENTINEL',json.dumps(data));self.assertNotIn('PRIVATE_SENTINEL',str(output.call_args_list))
                self.assertIn('未建立连接',(root/'run/live-studio.html').read_text())

    async def test_missing_dependency_stops_before_key_observation_or_reservation(self):await self.failure_before_reservation('dependency')
    async def test_client_import_failure_stops_before_observation_or_reservation(self):await self.failure_before_reservation('client')

if __name__=='__main__':unittest.main()
