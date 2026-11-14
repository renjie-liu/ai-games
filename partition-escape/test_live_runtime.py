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
