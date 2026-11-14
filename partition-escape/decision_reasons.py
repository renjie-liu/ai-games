"""Publication checks for recorded decisions. Never synthesize a missing branch ID."""
import json
from script_policy import POLICY_VERSION, provider_decision, peer_ready, proposal_intent

STATUS_LABELS={'provided':'已提供','omitted':'已省略','unmapped':'未映射公开说明','not_provided':'未提供','unverified':'未验证'}
RULE_TEXT={
 'power_closed_unheld':'动力未开启、西门关闭，且公开记录没有正在保持的手闸或已安装的木撑，因此接通动力。',
 'accept_key_missing':'东席的钥匙交接提议仍待我确认，公开记录尚无交接完成，因此同意接收。',
 'offer_key_ready':'钥匙位置线索已经分享，交接尚未完成，搭档的公开交互已建立准备状态，因此提出交接，继续等对方确认。',
 'decline_local_safety':'当前提议的安全确认条件未满足，公开记录支持先暂缓，继续沟通。',
 'accept_power_brake':'命中手闸保持分支：我已拉住手闸且尚未松手，因此确认停机提议。',
 'accept_power_braced':'命中木撑承重分支：已安装木撑，因此确认停机提议；这次不是依靠手闸保持。',
 'accept_door_braced_released':'木撑已安装且手闸已松开，因此确认开门；不再依靠人手保持闸门。',
 'brace_stopped_held':'手闸仍保持、风扇已停转、尚未安装木撑，因此进入取出并安装木撑的分支。',
 'release_braced_held':'木撑已安装但手闸仍由我拉住，因此松手，检查支撑能否独立保持闸门。',
 'leave_braced_open':'木撑已安装、西门已经打开，因此前往共同出口。',
 'power_off_peer_held':'动力仍开启、搭档的手闸仍保持，因此提出停机；继续等搭档确认。',
 'open_braced_released_unlocked':'木撑已安装、搭档已经松手、西门已经开锁，因此提出开门。',
 'unlock_key_received':'钥匙交接已完成且尚未开锁，因此先转动钥匙。',
 'hold_raised_unsecured':'闸门已升起、手闸未拉住且尚未支撑，因此先拉住手闸。',
}
ACTION_LABELS={'hold-brake':'拉住手闸','release-brake':'松开手闸','brace':'安装木撑','power-on':'接通动力',
 'power-off':'切断动力','open-door':'推开西门','close-door':'关上西门','unlock':'开锁','send-key':'钥匙交接'}

HANDOFF_REASONS={'power_closed_unheld','accept_key_missing','offer_key_ready','decline_local_safety'}

def handoff_support(v,reason_id):
    """Publish only an atomic public signals snapshot and explicitly public events/facts.

    Missing signal keys mean no successful action yet in this fixed level (initial
    power/door/brake/brace are false). A missing/malformed *snapshot* is not zero.
    Do not inspect local, notes, or copy message/fact text into explanations.
    """
    rev=v.get('rev');s=v.get('signals');events=v.get('events')
    if type(rev) is not int or rev<1 or not isinstance(s,dict) or not isinstance(events,list):return None
    if any(k not in set(ACTION_LABELS)|{'leave'} or type(x) is not int or not 0<x<=rev for k,x in s.items()):return None
    if any(not isinstance(e,dict) or type(e.get('id')) is not int or not 0<e['id']<=rev for e in events):return None
    ids=[e['id'] for e in events]
    if ids!=sorted(set(ids)):return None
    n=lambda a:s.get(a,0)
    held=n('hold-brake')>max(n('release-brake'),n('leave'))
    powered=n('power-on')>max(n('power-off'),n('open-door'),n('leave'))
    opened=n('open-door')>n('close-door');braced=bool(n('brace'))
    def snapshot(keys,label):
        return {'kind':'public_signals','revision':rev,'signals':{k:n(k) for k in keys},
                'label':f'公开动作记录（房间版本 #{rev}）：'+label}
    def event_ref(e,label):
        return {'kind':'public_event','room_event':e['id'],'event_type':e['type'],'seat':e['seat'],'label':label}
    def proposal(action,seat):
        p=v.get('pending');requests=[e for e in events if e.get('type')=='request']
        if not isinstance(p,dict) or p.get('action')!=action or p.get('from')!=seat or not requests:return None
        e=requests[-1]
        label={'send-key':'递出钥匙','power-off':'切断动力','open-door':'推开西门'}[action]
        if e.get('seat')!=seat or e.get('text')!=f'提议{label}，等待对面准备好。':return None
        if any(x.get('type') in ('action','decision') for x in events if x['id']>e['id']):return None
        return event_ref(e,'仍待确认的'+label+'提议')
    if reason_id=='power_closed_unheld':
        if v.get('role')!='west' or powered or opened or held or braced:return None
        return [snapshot(['power-on','power-off','open-door','close-door','hold-brake','release-brake','brace','leave'],
                         '动力关闭、西门关闭、手闸未保持、尚无木撑安装记录。')]
    if reason_id=='accept_key_missing':
        ref=proposal('send-key','east')
        if v.get('role')!='west' or not ref or n('send-key'):return None
        return [ref,snapshot(['send-key'],'尚无钥匙交接完成记录；当前提议已由机关预检。')]
    if reason_id=='offer_key_ready':
        if v.get('role')!='east' or v.get('pending') or n('send-key'):return None
        if not any(f.get('id')=='key-found' and f.get('seat')=='east' for f in v.get('shared',[])):return None
        deferred=[e for e in events if e.get('proposal')=='send-key' and e.get('proposer')=='east' and e.get('resolution') in ('decline','cancel')]
        after=deferred[-1]['id'] if deferred else 0;first=not deferred
        if not peer_ready(events,'east','send-key',after=after,first_contact=first):return None
        ready=None
        for e in reversed(events):
            if e['id']<=after or e.get('seat')!='west':continue
            if e.get('type') in ('action','clue') or (first and e.get('type')=='inspect'):
                ready=event_ref(e,'搭档的公开探索/操作建立了交接准备');break
            if e.get('type')=='message' and e.get('source','human')=='human' and proposal_intent(e.get('text',''),'send-key')=='resume':
                ready=event_ref(e,'搭档明确恢复交接准备');break
        if not ready:return None
        return [snapshot(['send-key'],'尚无钥匙交接完成记录。'),
                {'kind':'shared_fact','fact_id':'key-found','label':'双方已分享的东侧钥匙位置线索'},ready]
    if reason_id=='decline_local_safety':
        p=v.get('pending') or {};action=p.get('action')
        if v.get('role')!='east' or action not in ('power-off','open-door'):return None
        ref=proposal(action,'west')
        if not ref:return None
        if action=='power-off' and not held and not braced:
            label='停机确认需要手闸保持或木撑承重；当前两项均无公开成立记录。'
        elif action=='open-door' and (not braced or held):
            label='开门确认需要木撑承重且已松手；当前'+('尚无木撑安装记录' if not braced else '手闸仍保持')+'。'
        else:return None
        return [ref,snapshot(['hold-brake','release-brake','brace','leave'],label)]
    return None

def public_support(v,reason_id):
    """Use ONLY deliberately public action signals / shared fact IDs, never local or notes.
    Return exact public references, or None when the real branch cannot be explained publicly.
    """
    if reason_id in HANDOFF_REASONS:return handoff_support(v,reason_id)
    s=v.get('signals',{})
    if not isinstance(s,dict): return None
    def n(a):
        x=s.get(a,0)
        return x if isinstance(x,int) and not isinstance(x,bool) and x>0 else 0
    held=n('hold-brake')>n('release-brake')
    released=n('release-brake')>n('hold-brake')
    powered=n('power-on')>max(n('power-off'),n('open-door'))
    stopped=n('power-off')>n('power-on')
    braced=bool(n('brace'))
    opened=n('open-door')>n('close-door')
    if reason_id=='accept_power_brake' and held: actions=['hold-brake']
    elif reason_id=='accept_power_braced' and braced and not held: actions=['brace']+(['release-brake'] if released else [])
    elif reason_id=='accept_door_braced_released' and braced and released: actions=['brace','release-brake']
    elif reason_id=='brace_stopped_held' and held and stopped and not braced:
        if not any(f.get('id')=='brace-found' for f in v.get('shared',[])): return None
        actions=['hold-brake','power-off']
    elif reason_id=='release_braced_held' and braced and held: actions=['brace','hold-brake']
    elif reason_id=='leave_braced_open' and braced and opened: actions=['brace','open-door']
    elif reason_id=='power_off_peer_held' and powered and held: actions=['power-on','hold-brake']
    elif reason_id=='open_braced_released_unlocked' and braced and released and n('unlock') and not opened:
        actions=['brace','release-brake','unlock']+(['close-door'] if n('close-door') else [])
    elif reason_id=='unlock_key_received' and n('send-key') and not n('unlock'): actions=['send-key']
    elif reason_id=='hold_raised_unsecured' and powered and not held and not braced:
        actions=['power-on']+(['release-brake'] if n('release-brake') else [])
    else: return None
    refs=[{'kind':'public_action','action':a,'label':ACTION_LABELS[a],'room_event':n(a)} for a in actions]
    if reason_id=='brace_stopped_held':
        refs.append({'kind':'shared_fact','fact_id':'brace-found','label':'双方已分享的木撑线索'})
    return refs

def project_reason(raw,v,command,source,model_choices):
    script=source=='脚本 stub'
    model=source=='真实模型 · public-safe'
    replay=source=='离线重放 · 历史模型回复（无新请求）'
    fixture=source=='离线 fixture · 非真实模型' or replay
    title='脚本规则原因' if script else '模型提供的简短摘要' if model else '离线 fixture · 模型摘要通路（未调用模型）' if fixture else '来源未验证'
    if replay:title='历史回复的可公开摘要 · 离线重放，非新模型决策'
    r={'source':source,'kind':'script_rule' if script else 'model_summary' if model else 'fixture_model_summary' if fixture else 'unknown',
       'stage':'planned','status':'not_provided','label':title,'text':'未提供原因或摘要。',
       'reason_id':None,'policy_version':None,'trigger_rule_recorded':False,'evidence':[],
       'validation':'仅公开输出核验；不展示或推断隐藏内部思维。'}
    if not (script or model or fixture):
        r.update(status='unverified',text='来源未验证；不展示原因原文。')
    elif script:
        if raw:
            try:
                record=json.loads(raw)
                assert isinstance(record,dict) and set(record)=={'kind','policy_version','reason_id'}
                assert record['kind']=='script_rule' and record['policy_version']==POLICY_VERSION
                # Validate the stored decision, NEVER fill a missing record from this replay.
                actual=provider_decision(v)
                assert record['reason_id']==actual.reason_id and command==actual.command
            except (ValueError,TypeError,KeyError,AssertionError,AttributeError):
                r.update(status='unverified',text='未验证：缺少有效的分支记录，或版本、分支、动作与当时观察不一致；不补写原因。')
            else:
                r.update(trigger_rule_recorded=True,validation='记录于命中分支；同版本观察重放核对动作和分支，再核对公开事实。')
                if actual.reason_id not in RULE_TEXT:
                    # Missing implementation is not evidence that the cause is private.
                    # Still withhold the ID: its name has not passed a publication check.
                    r.update(status='unmapped',text='未映射公开说明：此分支尚未配置公开解释；这不表示已认定涉及私有信息。分支 ID 暂不公开。',
                             validation='记录于命中分支；已重放核对动作和分支；尚无公开说明映射，未进行公开证据核验。')
                else:
                    try: refs=public_support(v,actual.reason_id)
                    except (TypeError,ValueError,KeyError,AttributeError): refs=None
                    if refs is None:
                        # Even the branch NAME may reveal a private inventory/condition.
                        r.update(status='omitted',text='已省略：当前公开证据不足以核验此分支的说明；分支 ID 与细节不公开。')
                    else:
                        r.update(status='provided',reason_id=actual.reason_id,policy_version=POLICY_VERSION,
                                 text=RULE_TEXT[actual.reason_id],evidence=refs)
    elif raw:
        if isinstance(raw,str) and raw in model_choices:
            r.update(status='provided',text=raw,
                     validation='保留提供者实际输出；仅核验公开短语与当时公开事实，不验证模型内部因果。')
        else:
            r.update(status='omitted',text='已省略：摘要不符合公开短语与事实检查，可能包含私有内容；不展示原文。')
    r['status_label']=STATUS_LABELS[r['status']]
    return r
