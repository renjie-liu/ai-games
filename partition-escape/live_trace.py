"""Public Live session index; tool receipts, not thoughts or private observations."""
from html import escape as h
from pathlib import Path

def page(data,room,seat):
    source='离线 fixture · 非真实模型' if any(e['source']=='offline-fixture' for e in data['events']) else '真实 Gemini Live'
    if source=='真实 Gemini Live' and not any(e['kind']=='connected' for e in data['events']):source='Gemini Live · 未建立连接'
    audit=data.get('audit') or {};rows=[]
    for e in data['events']:
        if e['kind']!='tool_result':continue
        r=e.get('receipt') or {};call=e['call_alias'];events='、'.join('#'+str(i) for i in r.get('roomEventIds',[])) or '无新增'
        url=f'/api/rooms/{room}/studio?seat={seat}&call={call}'
        rows.append('<tr>'+''.join('<td>'+h(str(x))+'</td>' for x in [e['at_ms'],r.get('command','未发送'),r.get('outcome','aborted'),r.get('code','harness_aborted'),events,r.get('requestId','—'),call,e.get('harness_chunk','—')])+'<td>'+h(str(e.get('harness_run','—')))+'</td></tr>')
    return '<!doctype html><html lang="zh"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Live 会话公开 Trace</title><style>body{background:#152029;color:#edf1f3;font:16px system-ui;padding:20px}a{color:#8cdef5}table{border-collapse:collapse;font-size:13px}td,th{padding:10px;border:1px solid #52616b;word-break:break-all}section{overflow:auto}p{max-width:850px}</style><body><h1>'+h(source)+' · 会话公开 Trace</h1><p>每个工具经过现有单席 harness / Room.command。执行结果以机关回执为准；Live 的语音回复不是内部思维。本版未提取模型可公开决策摘要，状态为“未提供”。</p><p>音频生成不等于客户端已播放，也不等于玩家听懂；本版未记录逐句播放确认。</p><p>'+h(f"连接预留 {audit.get('connections',0)} · 自动重连 {audit.get('retries',0)} · 输入音频 {audit.get('input_seconds',0):.3f}s · 输出音频 {audit.get('output_seconds',0):.3f}s · 保守估算 USD {audit.get('estimated_usd',0):.6f}（非账单，credits未核验） · {audit.get('status','未开始')}")+'</p><section><table><tr>'+''.join('<th>'+x+'</th>' for x in ['毫秒','命令','机关结果','code','房间事件','请求ID','Live调用别名(SHA256前24位)','harness chunk','harness run'])+'</tr>'+''.join(rows)+'</table></section></body></html>'

def write(root,data,room,seat):Path(root,'live-studio.html').write_text(page(data,room,seat))
