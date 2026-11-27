"""Public-only projection on the existing Trace Studio. No free-form disclosure filter claims."""
import json
import math
import re
from pathlib import Path
from harness.trace import studio_page
from decision_reasons import project_reason
from seat_protocol import safe_audit

LABELS={'power-on':'接通动力','power-off':'切断动力','unlock':'转动钥匙','open-door':'推开西门',
        'close-door':'关上西门','send-key':'递出钥匙','hold-brake':'拉住手闸','brace':'取出并安装木撑',
        'release-brake':'松开手闸','leave':'走向共同出口'}
GENERIC={'inspect':'查看本侧物件','share':'主动分享已发现线索','say':'发送消息','hint':'请求本席提示','pause':'暂停/恢复'}
OUTCOMES={'proposed':'提议已建立，等待对席确认；机关尚未执行。','applied':'固定引擎已执行机关动作。',
          'recorded':'查看/通信/控制请求已记录；不代表机关执行。',
          'waiting':'预期冲突：机关未执行，等待并重新观察。','rejected':'规则或权限拒绝；机关未执行。'}
OUTCOME_LABELS={'proposed':'提议中','applied':'机关已执行','recorded':'仅记录','waiting':'等待','rejected':'已拒绝'}
RECOVERABLE={'proposal_pending','stale_proposal','paused'}
SOURCES={'脚本 stub','真实模型 · public-safe','离线 fixture · 非真实模型','离线重放 · 历史模型回复（无新请求）'}
HISTORICAL_REPLAY_NOTICE=('45fc946 原真实请求因动作格式不符，机关执行 0 次。'
    '本页显示规范化后的离线重放成功，不代表新增真实合作；新增真实模型请求 0 次。')


def summary_options(v,c):
    """Finite safe sentences, checked against the observation AT DECISION TIME.

    Only public action receipts / explicit coordination signals justify physical reasons.
    Private facts are never spliced into a public sentence. Unsupported prose is omitted in full.
    """
    kind=c.get('type'); action=c.get('id'); signals=v.get('signals',{})
    if kind=='inspect': return ['本侧仍需观察，先查看一个物件；查看内容不会自动公开。']
    if kind=='share': return ['主动把本席已发现的线索分享给搭档，供双方安排下一步。']
    if kind=='say': return ['发送一条沟通消息；消息本身不会执行机关。']
    if kind in ('accept','decline','cancel'):
        p=v.get('pending')
        if (p and p.get('id')==action and v.get('role') in ('west','east')
                and ((kind=='cancel' and p.get('from')==v['role'])
                     or (kind!='cancel' and p.get('from') in ('west','east') and p['from']!=v['role']))):
            return [dict(accept='对席提出共同动作；按本席观察确认，实际结果由机关判定。',
                         decline='暂缓当前共同动作，先继续沟通。',cancel='撤回本席尚未执行的提议。')[kind]]
        return []
    if kind!='action': return []
    if action=='send-key': return ['发起钥匙交接提议；须对席明确确认后才递出。']
    if action=='power-on': return ['尝试接通动力，观察两侧机关的公开变化。']
    if action=='unlock' and signals.get('send-key'): return ['公开记录已有钥匙交接，尝试转动钥匙；开锁不等于推门。']
    if action=='hold-brake' and signals.get('power-on',0)>signals.get('power-off',0):
        return ['公开记录显示已供电；尝试拉住手闸固定升起的闸门。']
    if action=='power-off' and signals.get('hold-brake',0)>signals.get('release-brake',0):
        return ['对席已拉住手闸，提议切断动力并等待确认。']
    if action=='brace' and signals.get('hold-brake',0)>signals.get('release-brake',0) and signals.get('power-off',0)>signals.get('power-on',0):
        return ['已记录拉住手闸和切断动力；尝试安装支撑，实际可行性由机关检查。']
    if action=='release-brake' and signals.get('brace'): return ['已记录安装支撑；松开手闸，检验闸门是否仍能保持开启。']
    if action=='open-door' and signals.get('brace') and signals.get('release-brake',0)>signals.get('hold-brake',0):
        return ['对席已安装支撑并松手，提议开门并等待确认。']
    if action=='leave' and signals.get('open-door',0)>signals.get('close-door',0):
        return ['公开记录显示西门已打开；尝试共同撤离，成功由引擎判定。']
    return []


def summary_menu(v):
    commands=[{'type':k} for k in ('inspect','share','say')]+[{'type':'action','id':a} for a in LABELS]
    if v.get('pending'):commands += [{'type':k,'id':v['pending']['id']} for k in ('accept','decline','cancel')]
    return [{'label':LABELS.get(c.get('id'),GENERIC.get(c['type'],c['type'])),'choices':summary_options(v,c)} for c in commands if summary_options(v,c)]


def safe_receipt(r):
    """Do not expose arbitrary server message strings or raw action arguments."""
    if not isinstance(r,dict) or r.get('outcome') not in OUTCOMES:return None
    labels=set(LABELS.values())|set(GENERIC.values())|{'未支持的操作'}
    labels |= {prefix+x for prefix in ('确认：','暂缓：','撤回：') for x in LABELS.values()}
    return {'requestId':identifier(r.get('requestId')), 'source':'live-gate' if r.get('source')=='live-gate' else 'rules',
        'seat':r.get('seat') if r.get('seat') in ('west','east') else 'unknown',
        'command':r.get('command') if r.get('command') in labels else '参数未公开',
        'outcome':r['outcome'], 'summary':OUTCOMES[r['outcome']],
        'code':r.get('code') if r.get('code') in RECOVERABLE|{'ok','permission_denied','rule_rejected','live_superseded'} else 'rejected',
        'roomEventIds':[x for x in r.get('roomEventIds',[]) if isinstance(x,int) and not isinstance(x,bool) and x>0],
        'proposalId':identifier(r.get('proposalId')),
        'changes':{k:x for k,x in r.get('changes',{}).items() if k in ('doorOpen','gateOpen','power','escaped') and isinstance(x,bool)}}


def identifier(x):return x if isinstance(x,str) and re.fullmatch(r'[a-zA-Z0-9_-]{1,100}',x) else None


def public_execution(receipt,results):
    if receipt:
        return {'state':receipt['outcome'],'label':OUTCOME_LABELS[receipt['outcome']],'detail':receipt['summary']}
    aborted=[r for r in results if r.get('status')=='aborted']
    if aborted:
        reasons=', '.join(dict.fromkeys(r['reason'] for r in aborted if r.get('reason')))
        return {'state':'aborted','label':'已中止','detail':'输入已中止'+(' · '+reasons if reasons else '')+'；无机关回执，不推断执行成功。'}
    return {'state':'unknown','label':'无机关回执','detail':'无机关回执：尚无明确的机关执行结果；不推断成功。'}


def public_trace(data,source):
    source=source if source in SOURCES else '来源未验证'
    safe={'header':{'run_id':identifier(data.get('header',{}).get('run_id')),
          'manifest':{'name':'隔墙 / '+source+' / 公开回放'},'models':{'actor':{'model':source}}},
          'steps':[],'frames':{},'events':[],'milestones':[],'unresolved_requests':[],'truncated':False,
          'evaluation':{'verified_completions':[]},'verified_milestone_seqs':[],
          'memory':{'episodic':{},'start':{},'snapshot':{'omitted':0,'files':[]},'writes':[],'layers':[]},
          'reflections':[],'videos':[],
          'trace':{k:data.get('trace',{}).get(k,0 if k!='runtime_end' else None) for k in
                   ('last_seq','elapsed_s','runtime_end','moves_executed','moves_aborted')}}
    if source=='离线重放 · 历史模型回复（无新请求）':
        # Fixed provenance statement, never copied from model text or arbitrary trace fields.
        safe['replay_notice']=HISTORICAL_REPLAY_NOTICE
    if source=='真实模型 · public-safe' and isinstance(data.get('smoke_transport'),dict):
        audit=data['smoke_transport']
        safe['smoke_transport']={k:audit[k] for k in ('http_attempts','http_responses','retries','blocked_before_send',
            'usage_estimate_usd','unknown_billing_attempts','budget_usd')
            if isinstance(audit.get(k),(int,float)) and not isinstance(audit[k],bool) and math.isfinite(audit[k]) and audit[k]>=0}
    protocols={e.get('request_id'):safe_audit(e) for e in data.get('events',[])
        if isinstance(e,dict) and e.get('type')=='progress' and e.get('channel')=='partition_protocol' and e.get('request_id')}
    receipts={e.get('chunk_id'):safe_receipt(e.get('receipt')) for e in data.get('events',[])
              if isinstance(e,dict) and e.get('type')=='progress' and e.get('channel')=='partition_command'}
    for event in data.get('events',[]):
        if isinstance(event,dict) and event.get('type') in ('model_call','session'):
            safe['events'].append({k:event[k] for k in ('type','seq','ts','request_id','cost_usd','kind') if k in event})
    for m in data.get('milestones',[]):
        if m.get('name')=='both-escaped':safe['milestones'].append({k:m[k] for k in ('seq','ts','name','index','detected_by') if k in m})
    for step in data.get('steps',[]):
        obs=step.get('observation') or {}; chunk=step.get('chunk') or {}; receipt=receipts.get(chunk.get('chunk_id'))
        try:
            v=json.loads(obs.get('state_text','{}')); actions=chunk.get('actions',[])
            command=json.loads(actions[0]['text']) if len(actions)==1 and actions[0].get('type')=='type' else {}
            choices=summary_options(v,command)
        except (ValueError,KeyError,TypeError,AttributeError):choices=[];command={};v={}
        reason=project_reason(chunk.get('commentary'),v,command,source,choices)
        if source=='真实模型 · public-safe' and not chunk and any(c.get('outcome')=='text' for c in step.get('calls',[])):
            reason.update(status='unverified',status_label='未验证',
                text='收到模型文本，但未通过动作协议解析；未提取可公开摘要。不能据此认定模型没有提供文本。')
        label=receipt['command'] if receipt else LABELS.get(command.get('id'),'本席操作（参数未公开）') if command.get('type')=='action' else GENERIC.get(command.get('type'),'本席操作（参数未公开）')
        s={'observation':{k:obs[k] for k in ('observation_id','ts','seq','trigger','channels') if k in obs},
           'commentary':reason['label']+' · '+reason['status_label']+'：'+reason['text'],
           'public_reason':reason,
           'public_receipt':receipt, 'results':[],'calls':[],'checks':[],'views':{},'requests':[],
           'memory_writes':[],'reflections':[],'reviews_of_action':[],'evidence_checks':[], 'harness_chunks':[],
           'cumulative_cost':step.get('cumulative_cost',0)}
        s['observation']['state_text']='Private seat observation withheld from spectators.'
        s['chunk']={k:chunk[k] for k in ('chunk_id','observation_id','ts','seq') if k in chunk}
        s['chunk']['actions']=[{'type':'type','text':'私有参数未公开','public_label':label} for _ in chunk.get('actions',[])]
        for r in step.get('results',[]):
            row={k:r[k] for k in ('chunk_id','index','status','executed','ts','seq') if k in r}
            if r.get('reason') in ('frame_diverged','operator','person_active','error'):row['reason']=r['reason']
            s['results'].append(row)
        for c in step.get('calls',[]):
            row={k:c[k] for k in ('request_id','role','latency_ms','input_tokens','output_tokens','cached_tokens','cost_usd','ts','seq','status','outcome','accepted') if k in c}
            row['model']=source;s['calls'].append(row)
        s['public_protocol']=[{**protocols[c['request_id']], 'request_id':identifier(c['request_id'])}
            for c in s['calls'] if protocols.get(c.get('request_id'))]
        s['public_execution']=public_execution(receipt,s['results'])
        s['visual_outcome']={'summary':s['public_execution']['detail']}
        safe['steps'].append(s)
    return safe


def public_studio(data,source):
    html=studio_page(public_trace(data,source))
    html=(html.replace('model responses','provider responses').replace('Executed actions','输入执行回执（非机关成功数）')
          .replace('No completion evidence yet','无独立评测器完成凭据')
          .replace('Outcome · platform evidence','完成凭据 · 独立评测器')
          .replace('Stated rationale · model','决策时记录的原因 / 提供者摘要')
          .replace('MODEL-REPORTED DECISION','PUBLIC ACTION RECORD').replace('Why this action?','来源与公开核验')
          .replace('No readable thinking summary was returned for this decision. The stated rationale is shown separately.',
                   '不展示内部思维、私有提示词或原始输出。'))
    extension=Path(__file__).with_name('public-studio.js').read_text()
    return html.replace('</body>','<script>'+extension+'</script></body>')
