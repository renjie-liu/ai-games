// Add game receipts to the EXISTING Studio; no extra viewer, no private trace fetches.
const nativeActionName=actionName;
if(data.replay_notice){
 const panel=node('section',undefined,'panel');panel.id='replay-origin';
 panel.style.cssText='margin:12px 24px;padding:16px;overflow-wrap:anywhere';
 panel.append(node('h2','历史调用与本次离线重放'),node('p',data.replay_notice));
 document.querySelector('main').before(panel);
}
if(data.smoke_transport){
 const t=data.smoke_transport,panel=node('section',undefined,'panel');panel.id='smoke-audit';
 panel.style.cssText='margin:12px 24px;padding:16px;overflow-wrap:anywhere';
 panel.append(node('h2','真实模型 smoke · HTTP 发送审计'),
  node('p',`实际 HTTP 请求 ${t.http_attempts} · 重试 ${t.retries} · 发送前拦截 ${t.blocked_before_send}`),
  node('p',`按返回用量估算 USD ${Number(t.usage_estimate_usd).toFixed(7)} · 配置上限 USD ${t.budget_usd} · 无用量回执的发送 ${t.unknown_billing_attempts}`),
  node('p','下方调用记录可能包含本地拒绝，不等于网络请求数；$0.00 是两位小数显示，不代表免费。用量估算不是账单；失败/未结束请求可能产生未计入费用。'));
 document.querySelector('main').before(panel);
}
actionName=function(a){return a?.public_label || nativeActionName(a);};
const outcome=s=>s.public_execution || {state:'unknown',label:'无机关回执',detail:'无机关回执；不推断执行成功。'};
const statusClass=s=>({applied:'good',proposed:'warn',waiting:'warn',rejected:'bad',aborted:'warn'})[outcome(s).state]||'muted';
const nativeIsIssue=isIssue;
isIssue=s=>['proposed','waiting','rejected','aborted'].includes(outcome(s).state)||nativeIsIssue(s);
const nativeTimeline=renderTimeline;
renderTimeline=function(){
 nativeTimeline();
 $('timeline').querySelectorAll('button[data-step]').forEach(b=>{
  const s=data.steps[Number(b.dataset.step)],e=outcome(s);
  b.querySelector('small').textContent=`harness #${s.observation.seq} · ${money(s.cumulative_cost)}`;
  b.append(node('small',e.label,'public-status '+statusClass(s)));
  b.dataset.outcome=e.state;
 });
};
$('filter').querySelector('[value="issues"]').textContent='提议 / 等待 / 拒绝 / 中止';
$('filter').onchange=()=>renderTimeline();
const publicPanel=node('section',undefined,'panel');publicPanel.id='public-action';
publicPanel.style.cssText='padding:20px;overflow-wrap:anywhere';
document.querySelector('.visual-column').prepend(publicPanel);
const nativeRender=render;
render=function(){
 nativeRender();const s=data?.steps[at];if(!s)return;
 const r=s.public_receipt,e=outcome(s);publicPanel.replaceChildren(node('h2','公开动作与机关回执'));
 publicPanel.append(node('p',s.chunk?.actions?.map(actionName).join(' / ')||'未提供动作','rationale'));
 publicPanel.append(node('p',e.detail,statusClass(s)));
 publicPanel.append(node('p',`房间事件：${r?.roomEventIds?.length?r.roomEventIds.map(id=>'#'+id).join('、'):'无（本步未新增）'}`,'public-room-events'));
 publicPanel.append(node('p',`来源：${s.public_reason?.source||'未验证'} ｜ 回执：${r?.source||'未提供'} ｜ ${e.label}`));
 if(s.public_protocol?.length){
  const protocol=node('div',undefined,'public-protocol');
  protocol.append(node('h3','协议适配记录（不是机关结果或决策依据）'));
  for(const a of s.public_protocol)protocol.append(node('p',
   `normalized: ${a.normalized} · ${a.status==='accepted'?'语法通过':'语法拒绝，未发送命令'} · 来源 ${a.source} · ${a.input_format} · ${a.version} · 调用 ${a.request_id}`));
  protocol.append(node('small','只规范命令包装；权限、提议有效性和机关规则仍由服务器检查。offline-replay 为历史回复离线重放；offline-fixture 为人工测试场景，非真实模型。两者均无新模型请求。'));
  publicPanel.append(protocol);
 }
 const reason=s.public_reason;
 if(reason){
  const reasonPanel=node('div',undefined,'public-reason');
  reasonPanel.append(node('h3',`${reason.label} · ${reason.status_label}`),node('p',reason.text));
  if(reason.reason_id)reasonPanel.append(node('p',`reason ID：${reason.reason_id} ｜ ${reason.policy_version}`));
  if(reason.evidence?.length)reasonPanel.append(node('p','公开核验：'+reason.evidence.map(x=>x.room_event?`房间事件 #${x.room_event} · ${x.label}`:x.label).join('；')));
  reasonPanel.append(node('small','记录阶段：决策时；不是机关执行成功或模型内部思维的证明。 '+reason.validation));
  publicPanel.append(reasonPanel);
 }
 if(r){
  const fields={power:'动力',gateOpen:'东闸',doorOpen:'西门',escaped:'共同撤离'};
  publicPanel.append(node('p',Object.entries(r.changes||{}).map(([k,v])=>`${fields[k]}：${v?'是/开启':'否/关闭'}`).join('；')||'该请求未产生四项公开物理状态变化。'));
 }
 const ids={room_events:r?.roomEventIds||[],command_request:r?.requestId||null,proposal:r?.proposalId||null,
            chunk:s.chunk?.chunk_id||null,chunk_harness_seq:s.chunk?.seq||null,
            calls:s.calls.map(c=>({request_id:c.request_id,harness_seq:c.seq})),
            observation:s.observation.observation_id,observation_harness_seq:s.observation.seq,
            result_harness_seqs:s.results.map(x=>x.seq)};
 details(publicPanel,'关联编号：房间事件 / 请求 / chunk / provider 调用',ids);
 // Preserve raw input-delivery results in data/Raw records. All game-facing badges use the receipt.
 $('move-strip').replaceChildren(...(s.chunk?.actions||[]).map(a=>{
  const card=node('div',undefined,'move');card.append(node('span',actionName(a)),node('span',e.label,'public-status '+statusClass(s)));return card;
 }));
 const execute=$('pipeline').children[4];
 execute.replaceChildren(document.createTextNode('机关结果'),node('small',e.label));
 execute.className=e.state==='applied'?'done':['proposed','waiting','rejected','aborted'].includes(e.state)?'issue':'';
 execute.dataset.outcome=e.state;
 $('step-label').textContent=`harness #${s.observation.seq} · ${s.observation.trigger.toUpperCase()}`;
 $('last-seq').textContent=`harness #${data.trace.last_seq}`;
 // Text-seat adapter has no camera frames. Keep the Studio's evidence panels, not a false screenshot placeholder.
 $('capture-help').textContent='本席使用结构化文字观察；私有观察不向观众公开，不代表视觉模型读取 3D。';
 $('video-panel').hidden=true;
 document.querySelector('.capture-panel .capture').style.minHeight='90px';
 $('actual').textContent=e.detail+(e.state==='waiting'?' 需要重新观察，不重放旧动作。':'');
};
render();
