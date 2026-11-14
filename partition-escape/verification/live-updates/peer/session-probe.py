"""Independent offline probe: real Session.send_content, fake SDK transport, fixture ledger."""
import asyncio, json, tempfile, socket
from pathlib import Path
from live_worker import Session
from live_updates import ContextUpdates
from live_budget import Ledger, LIMITS

# No external or local network needed for this probe.
def refused(*a,**kw):raise AssertionError('network forbidden in independent probe')
socket.socket.connect=refused

class Transport:
    def __init__(self):self.calls=[];self.gate=None;self.entered=asyncio.Event()
    async def send_client_content(self,**kw):
        self.calls.append(kw);self.entered.set()
        if self.gate:await self.gate.wait()

def packet(n=1):
    return dict(type='game_update',scope='scope',epoch=0,sequence=n,update=dict(
      rev=n+3,events=[dict(id=n+3,seat='west',type='decision',text='确认共同动作，已执行。')],
      receipts=[dict(requestId=str(n)*24,command='确认：递出钥匙',outcome='applied',roomEventIds=[n+3])],
      public=dict(doorOpen=False,gateOpen=False,power=False,escaped=False),pending=None))

async def settle():
    for _ in range(12):await asyncio.sleep(0)

async def scenario(mode):
    with tempfile.TemporaryDirectory() as folder:
        s=Session.__new__(Session);s.fixture=False;s.closed=asyncio.Event();s.scope='scope';s.epoch=0
        s.speaking=False;s.turn_open=False;s.tool_busy=False;s.tool_queue=asyncio.Queue();s.session=Transport();s.rows=[]
        s.ledger=Ledger(Path(folder)/'fixture',fixture=True);s.ledger.reserve()
        s.record=lambda kind,**kw:s.rows.append(dict(kind=kind,**kw));s.updates=ContextUpdates(s)
        task=asyncio.create_task(s.updates.run())
        try:
            if mode=='busy_merge':s.turn_open=True
            if mode=='scope_cancel':s.turn_open=True
            if mode=='budget':s.ledger.debit('text_bytes',LIMITS['text_bytes'])
            if mode=='inflight_stop':s.session.gate=asyncio.Event()
            assert s.updates.offer(packet())
            if mode=='busy_merge':
                assert s.updates.offer(packet(2));await settle();assert not s.session.calls
                s.turn_open=False;s.updates.wake()
            if mode=='scope_cancel':
                await settle();s.scope='new';s.epoch=1;s.updates.cancel();s.turn_open=False;s.updates.wake()
            if mode=='inflight_stop':
                await s.session.entered.wait();s.stop('user_stop');s.session.gate.set()
            await settle()
            calls=s.session.calls
            if mode in ('scope_cancel','budget'):assert calls==[]
            else:
                assert len(calls)==1;assert calls[0]['turn_complete'] is False
                assert s.turn_open is False
                text=calls[0]['turns']['parts'][0]['text']
                assert s.ledger.row['text_bytes']==len(text.encode())
                assert 'Preserve waiting' in text
                if mode=='busy_merge':assert len(json.loads(text)['game_state_update']['events'])==2
            assert not any(row.get('kind')=='tool_result' for row in s.rows)
            return dict(scenario=mode,transport_calls=len(calls),all_turn_complete_false=all(x['turn_complete'] is False for x in calls),ledger_text_bytes=s.ledger.row['text_bytes'],statuses=[r.get('status') for r in s.rows],fixture_ledger_only=True)
        finally:
            task.cancel();await asyncio.gather(task,return_exceptions=True);s.ledger.close()

async def main():
    results=[await scenario(x) for x in ('idle','busy_merge','scope_cancel','budget','inflight_stop')]
    print(json.dumps(dict(real_requests=0,network_blocked=True,results=results),indent=2))
asyncio.run(main())
