"""Public Live session index; tool receipts, not thoughts or private observations."""
import json
import sys
from html import escape as h
from pathlib import Path

EXECUTION={'read_only':'只读观察','engine_receipt':'已交引擎（结果见机关回执）','harness_aborted':'harness 中止，未交引擎',
  'outcome_unknown':'执行结果未知','not_executed':'未执行','not_executed_duplicate':'重复调用，未再执行'}
DELIVERY={'fixture_sent':'离线模拟发送','transport_sent':'发送方法已返回（不代表模型理解）','not_sent':'未发送给模型',
  'delivery_unknown_no_retry':'送达不确定，不重试'}
def label(table, value):
    if not isinstance(value, str):
        return '未记录'
    return f'{table[value]}（{value}）' if value in table else '未知'

def earlier_segments(base, generation):
    # Reread prior segments on each render so a repaired file is picked up.
    sections = []
    for old in range(generation):
        folder = base / 'sessions' / str(old) if old else base
        try:
            data = json.loads((folder / 'live-public.json').read_text(encoding='utf-8'))
            if not isinstance(data, dict) or not isinstance(data.get('events'), list):
                raise ValueError('missing public event list')
            body = segment_body(data)
            section = f'<details><summary>第 {old + 1} 段 · {source_label(data)}</summary>{body}</details>'
        except (OSError, ValueError, KeyError, TypeError, AttributeError):
            sections.append(f'<p data-unreadable-segment="{old + 1}">第 {old + 1} 段 · 无可读记录</p>')
        else:
            sections.append(section)
    return ''.join(sections)

def source_label(data):
    events = data['events']
    if any(e.get('source') == 'offline-fixture' for e in events):
        return '离线 fixture · 非真实模型'
    if any(e.get('kind') == 'connected' for e in events):
        return '真实 Gemini Live'
    return 'Gemini Live · 未建立连接'


def result_deliveries(events):
    # Match only the response to this execution. A duplicate can reuse the same
    # alias and send its own response later; that cannot change the first result.
    pending = {}
    deliveries = {}
    for index, event in enumerate(events):
        alias = event.get('call_alias')
        if not alias:
            continue
        if event.get('kind') == 'tool_result':
            pending[alias] = index
        elif event.get('kind') == 'tool_response' and alias in pending:
            result_index = pending.pop(alias)
            if event.get('execution') not in ('not_executed', 'not_executed_duplicate', 'read_only'):
                deliveries[result_index] = event
    return deliveries


def segment_body(data):
    audit=data.get('audit') or {};rows=[];updates=[];responses=[]
    delivered=result_deliveries(data['events'])
    closed=next((e.get('reason','unknown') for e in reversed(data['events']) if e['kind']=='closed'),None)
    for index,e in enumerate(data['events']):
        if e['kind']=='context_update':
            updates.append('<li>'+h(str(e.get('status','unknown')))+' · '+h(str(e.get('reason','')))+' · 更新 epoch '+h(str(e.get('update_epoch','—')))+' / 当前 epoch '+h(str(e.get('current_epoch','—')))+' · 截至房间版本 '+h(str(e.get('as_of_rev','—')))+' · 批次 '+h(str(e.get('sequences',[])))+' · 房间事件 '+h(', '.join('#'+str(i) for i in e.get('room_event_ids',[])))+' · 请求 '+h(', '.join(e.get('request_ids',[])))+'</li>')
        if e['kind']=='tool_response':
            fields = [
                e.get('call_alias', '—'), e.get('tool', 'unknown'),
                '执行：' + label(EXECUTION, e.get('execution')),
                '回执：' + label(DELIVERY, e.get('delivery')),
                e.get('reason') or '—', e.get('code') or '—', e.get('response_form') or '—',
                f"{e['response_bytes']} 字节" if type(e.get('response_bytes')) is int else '—',
            ]
            responses.append('<li>' + ' · '.join(h(str(v)) for v in fields) + '</li>')
        if e['kind']!='tool_result':continue
        receipt = e.get('receipt') or {}
        delivery = delivered.get(index, {})
        unknown = delivery.get('execution') == 'outcome_unknown'
        ids = '、'.join(f'#{i}' for i in receipt.get('roomEventIds', []) if type(i) is int)
        cells = [
            e.get('at_ms', '—'), receipt.get('command', '未发送'),
            receipt.get('outcome', 'unknown' if unknown else 'aborted'),
            receipt.get('code', 'live_outcome_unknown' if unknown else 'harness_aborted'),
            ids or '无新增', receipt.get('requestId', '—'), e.get('call_alias', '—'),
            e.get('harness_chunk', '—'), label(EXECUTION, delivery.get('execution')),
            label(DELIVERY, delivery.get('delivery')), delivery.get('reason') or '—',
            e.get('harness_run', '—'),
        ]
        rows.append('<tr>' + ''.join('<td>' + h(str(v)) + '</td>' for v in cells) + '</tr>')
    headers = ['毫秒','命令','机关结果','code','房间事件','请求ID','Live调用别名(SHA256前24位)',
               'harness chunk','执行状态','回执送达模型','送达原因','harness run']
    usage = (f"连接预留 {audit.get('connections',0)} · 自动重连 {audit.get('retries',0)} · "
             f"输入音频 {audit.get('input_seconds',0):.3f}s · 输出音频 {audit.get('output_seconds',0):.3f}s · "
             f"保守估算 USD {audit.get('estimated_usd',0):.6f}（非账单，credits未核验） · {audit.get('status','未开始')}")
    return ''.join([
        '<p>每个工具经过现有单席 harness / Room.command。执行结果以机关回执为准；Live 的语音回复不是内部思维。'
        '本版未提取模型可公开决策摘要，状态为“未提供”。</p>',
        '<p>音频生成不等于客户端已播放，也不等于玩家听懂；本版未记录逐句播放确认。</p>',
        '<p>', h(usage), '</p><p>停止原因：', h(str(closed or '会话尚未结束')), '</p>',
        '<section><table><tr>', ''.join('<th>'+x+'</th>' for x in headers), '</tr>',
        ''.join(rows), '</table></section>',
        '<h2>工具调用：执行与回执送达</h2><p>机关是否执行以回执为准；回执是否送达模型单独记录。'
        '未发送给模型的回执不会补发，模型可能不知道该动作已执行。compact_receipt 表示文本额度不足时只回送回执与ID、省略视图。</p>',
        '<ul>', ''.join(responses), '</ul><h2>公开状态上下文同步</h2>',
        '<p>仅更新同一会话上下文，turn_complete=false，不发起回答或解除等待。transport_sent 仅指发送方法已返回；'
        'fixture_sent 是离线模拟。两者都不证明模型已理解、已说话或执行新机关。'
        '开口／打字只重新绑定未发送的事实，不恢复旧动作权限。快照截至 as_of_rev（入队／合并时的房间版本），'
        '不是当前状态保证，包含的提议可能已过期；行动前须重新观察。停止时清空；not_delivered 表示超限等原因导致未送达，'
        '不自动补送。发送失败不重试，已开始发送无法撤回。</p><ul>', ''.join(updates), '</ul>',
    ])


def page(data,room,seat,number=1,history=''):
    header = '<!doctype html><html lang="zh"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Live 会话公开 Trace</title><style>body{background:#152029;color:#edf1f3;font:16px system-ui;padding:20px}a{color:#8cdef5}table{border-collapse:collapse;font-size:13px}td,th{padding:10px;border:1px solid #52616b;word-break:break-all}section{overflow:auto}p{max-width:850px}</style><body>'
    return (header + f'<h1>{source_label(data)} · 第 {number} 段</h1>' + history
            + '<section aria-label="当前段记录">' + segment_body(data) + '</section></body></html>')

def render(root, data, room, seat):
    generation = 0
    history = ''
    if root.parent.name == 'sessions' and root.name.isdecimal():
        base = root.parent.parent
        if base.name == seat and base.parent.name == room:
            generation = int(root.name)
            history = '<section aria-label="本房间之前的语音段"><h2>本房间之前的语音</h2>' + earlier_segments(base, generation) + '</section>'
    return page(data, room, seat, generation + 1, history)


def write(root, data, room, seat):
    root = Path(root)
    target = root / 'live-studio.html'
    temporary = target.with_suffix('.html.tmp')
    temporary.write_text(render(root, data, room, seat), encoding='utf-8')
    temporary.replace(target)


if __name__ == '__main__':
    # Authenticated HTTP reads can recover an incomplete final HTML snapshot.
    root, room, seat = sys.argv[1:]
    root = Path(root)
    data = json.loads((root / 'live-public.json').read_text(encoding='utf-8'))
    sys.stdout.write(render(root, data, room, seat))
