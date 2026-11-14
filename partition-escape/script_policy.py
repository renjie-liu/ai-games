"""Versioned deterministic stub policy. Reason IDs are returned AT the winning branch.
This is a rule trace, not a model thought process. IDs are private until the public projector checks them.
"""
from dataclasses import dataclass
import json
import re

POLICY_VERSION = 'partition-script-reasons-v1'

@dataclass(frozen=True)
class Decision:
    command: dict | None
    reason_id: str

    def record(self):
        return json.dumps({'kind':'script_rule','policy_version':POLICY_VERSION,
                           'reason_id':self.reason_id},separators=(',',':'))

def proposal_intent(text, action):
    """Small, explicit stub vocabulary; never interpret arbitrary prose as consent."""
    normalized=re.sub(r'[\s，。！、,.!]', '', text)
    if any(word in normalized for word in ('先别','别递','别给','别提','别交接','别开','别断','别动',
                                            '不要','等等','等一下','稍等','暂缓','还没准备好','不递','不准备')):
        return 'wait'
    common={'再提一次','请再提一次','重新提议','我准备好了','准备好了'}
    specific={
        'send-key':{'钥匙递过来吧','好钥匙递过来吧','把钥匙递过来','把钥匙递过来吧','好把钥匙递过来吧','请递钥匙','重新提议递钥匙'},
        'power-off':{'请提议断电','重新提议断电'},
        'open-door':{'请提议开门','重新提议开门'},
    }
    return 'resume' if normalized in common | specific.get(action,set()) else None

def peer_ready(events, seat, action, *, after=0, first_contact=False):
    """Replay public readiness changes. Neutral conversation neither grants nor revokes readiness."""
    ready=False
    for event in events:
        if event['id']<=after or event['seat']==seat or event['seat'] not in ('west','east'): continue
        if event['type'] in ('action','clue') or (first_contact and event['type']=='inspect'):
            ready=True
        elif event['type']=='message' and event.get('source','human')=='human':
            intent=proposal_intent(event['text'],action)
            if intent=='resume': ready=True
            elif intent=='wait': ready=False
    return ready

def script_decision(v):
    """Same first-match policy as c3e998b; action and cause travel together."""
    if v['paused']: return Decision(None,'paused')
    if v['complete']: return Decision(None,'complete')
    seat, local = v['role'], v['local']
    signals=v.get('signals',{})
    p=v['pending']
    if p:
        if p['from']==seat: return Decision(None,'pending_own')
        # Preserve the original OR order; two branches can choose the SAME accept command.
        if p['action']=='send-key' and seat=='west' and not local['keyHere']:
            return Decision({'type':'accept','id':p['id']},'accept_key_missing')
        if p['action']=='power-off' and local.get('holdingBrake'):
            return Decision({'type':'accept','id':p['id']},'accept_power_brake')
        if p['action']=='power-off' and local.get('braced'):
            return Decision({'type':'accept','id':p['id']},'accept_power_braced')
        if p['action']=='open-door' and local.get('braced') and not local.get('holdingBrake'):
            return Decision({'type':'accept','id':p['id']},'accept_door_braced_released')
        return Decision({'type':'decline','id':p['id']},'decline_local_safety')
    for obj in v['scene']:
        if not obj['inspected']:
            return Decision({'type':'inspect','id':obj['id']},'inspect_unseen')
    if seat=='east' and local['braceSeen'] and not any(n['id']=='brace-found' for n in v['notes']):
        return Decision({'type':'inspect','id':'fan'},'inspect_revealed_brace')
    for note in v['notes']:
        if not any(f['id']==note['id'] for f in v['shared']):
            return Decision({'type':'share','id':note['id']},'share_unshared')
    own=[m['text'] for m in v['messages'] if m['seat']==seat]
    def tell_once(text,reason):
        return Decision(None if text in own else {'type':'say','text':text},reason)
    def act(name,reason):
        decisions=[e for e in v.get('events',[]) if e.get('proposal')==name and e.get('proposer')==seat and e.get('resolution') in ('decline','cancel')]
        if decisions:
            last=decisions[-1]['id']
            if not peer_ready(v.get('events',[]),seat,name,after=last):
                return tell_once('提议已暂缓。准备好可说「再提一次」；分享新发现或操作机关后，我也会重新检查条件。','deferred_wait')
        return Decision({'type':'action','id':name},reason)
    incoming=[m for m in v['messages'] if m['seat']!=seat and m['source']=='human' and m['text'] not in [f['text'] for f in v['shared']]]
    if incoming:
        text=incoming[-1]['text'];prefix='收到“'+text[:18]+'”：'
        if not any(t.startswith(prefix) for t in own):
            if proposal_intent(text,'send-key')=='wait':
                reply='我会等着。准备好交接时可说「准备好了」；共同动作仍需按钮确认。';reason='reply_wait'
            elif any(proposal_intent(text,a)=='resume' for a in ('send-key','power-off','open-door')):
                reply='收到提议请求。我会检查本侧条件；共同动作仍需你在确认区同意，不会直接执行。';reason='reply_resume'
            elif any(w in text for w in ('看到','发现','线索','哪里','有什么')):
                reply='我已把查看到的事实放在线索本里，可重看「搭档分享」。';reason='reply_clues'
            else:
                reply='脚本暂不能理解这句。可问「你发现了什么」，或用「准备好了」「先等等」表达你的准备状态。';reason='reply_unknown'
            return Decision({'type':'say','text':prefix+reply},reason)
    if seat=='east':
        if local['keyHere']:
            events=v.get('events',[])
            deferred=any(e.get('proposal')=='send-key' and e.get('proposer')==seat and e.get('resolution') in ('decline','cancel') for e in events)
            if not deferred and not peer_ready(events,seat,'send-key',first_contact=True):
                return Decision(None,'first_contact_wait')
            return act('send-key','offer_key_ready')
        if local['gateOpen'] and not local['holdingBrake'] and not local['braced']:
            return act('hold-brake','hold_raised_unsecured')
        if local['holdingBrake'] and local['fanSpinning']:
            return tell_once('我已拉住手闸。闸门保持开启，风扇还在转。','report_brake_fan')
        if local['holdingBrake'] and not local['fanSpinning'] and not local['braced']:
            return act('brace','brace_stopped_held')
        if local['braced'] and local['holdingBrake']:
            return act('release-brake','release_braced_held')
        if local['braced']:
            if signals.get('open-door',0)>signals.get('close-door',0):
                return act('leave','leave_braced_open')
            return tell_once('木撑已经承重，松手后闸门仍然开着。我准备好去共同出口了。','report_braced_released')
        return tell_once('我这边的闸门还关着，风扇没有转。我会等你。','report_gate_closed')
    braced=bool(signals.get('brace'))
    held=signals.get('hold-brake',0)>signals.get('release-brake',0)
    if local['keyHere'] and not local['unlocked']: return act('unlock','unlock_key_received')
    if not local['power'] and not local['doorOpen'] and not held and not braced:
        return act('power-on','power_closed_unheld')
    if local['power'] and held: return act('power-off','power_off_peer_held')
    if braced and not held and local['unlocked'] and not local['doorOpen']:
        return act('open-door','open_braced_released_unlocked')
    return tell_once('我已经查看了本侧机关。请把你的发现告诉我；共同动作会等你确认。','report_west_wait')

def script_command(v):
    return script_decision(v).command

def provider_decision(v):
    d=script_decision(v)
    return d if d.command is not None else Decision({'type':'say','text':'我在等你准备好。'},d.reason_id)
