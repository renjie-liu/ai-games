# Live 启动取消：离线迭代与互审

目标：用户取消、切后台、暂停或设备失效后，不因迟到的权限/连接响应再次开始收音、发起模型启动或恢复播放。基线为 ai-games `9271f1232eb09c8fc8e78ec96a9886ad28a2a144`（PR #1）。本增量只改生产 `live-client.mjs`；服务端、harness、规则、协议及预算不变。

## 复现与决定

两份只读审查先独立检查生命周期和游戏事件桥接，决定优先处理音频/费用相关的启动取消。

- 原客户端在权限待定期间切后台后，仍发出模拟 start，音轨未关闭。
- 下行已结束但 start 响应晚到时，原客户端重新显示运行态。
- 首次修复被独立审查指出：启动中 AudioContext 挂起仍可能继续 start。补齐设备事件和 start 前检查后，再审通过。

每次启动现有独立资源对象。取消即使该对象失效；迟到的音轨立即 stop；旧事件不更新页面、不播放音频。开始阶段可点“取消启动”，本地 worklet 加载完成后才向服务端申请连接。关闭后的 start 响应不重开计时器。已发往服务器的连接不会被当成“未发生”，没有退款、重置账本或自动重连。

## 验证结果

- Node **67/67**（其中客户端生命周期 **18/18**），见 `node-tests.txt`。
- 独立探针：原两项、六项交错事件、音频挂起均通过；审查锁定的产品 SHA256 见 `PEER-REVIEW.md`。其审查时客户端有17项测试，随后只新增初始status迟到用例，产品代码未再变。
- 浏览器组件 fixture：**8/8**，四场景 × 1440/390，页面错误0、外部请求0、横向溢出0。见 `browser-results.json`。
- 实际本机游戏页面：离线 Live worker 经正常 harness 查看物件，回执 `recorded`、房间事件 #2；实际浏览器 AudioContext 播放 fixture 提示音，结束后 closed、结束和打断按钮禁用。见 `game-result.json`。
- 真麦克风采集0、真实模型请求0；原目录账本哈希保持不变，新目录没有授权账本。

这是离线启动生命周期验收。组件 fixture 使用假麦克风/设备/网络；游戏页面使用实际本机 HTTP、harness 与音频播放，但 worker 明确为 fixture。没有真实合作或真人麦克风结论。本次未重复 Python、四组合或30局测试；对应旧证据仍只属于迁移基线。

## 重放

从 `partition-escape/` 执行：

```sh
npm test
node verification/live-start/peer-lifecycle-probe.mjs
node verification/live-start/peer-interleaving-probe.mjs
node verification/live-start/peer-suspension-probe.mjs
python3 -m http.server 4319 --bind 127.0.0.1
```

浏览器打开 `http://127.0.0.1:4319/verification/live-start/fixture.html?case=permission`。这是测试组件，不会请求浏览器真实麦克风或调用模型。`case=eof`、`case=suspended` 可复现另外两类时序。`browser-check.js` 是传给 Playwright CLI `run-code` 的函数，截图默认写入运行目录的 `output/playwright/`。

实际游戏验证使用单独4320端口、`PARTITION_ALLOW_MODEL=0`、`PARTITION_ALLOW_LIVE=1`、`PARTITION_LIVE_FIXTURE=1`、`PARTITION_TTS_MODE=off` 启动现有服务；环境移除所有key/token，创建真人＋Live房间，点击“离线 mock（无麦克风）”。`game-check.js` 使用该玩家页面，且主动阻止任何 getUserMedia 调用。未改动原4174服务。

## 下一项明确缺口（未实现）

另一份审查用原 HTTP 路由、Room 引擎和 stub worker 证实：玩家确认交接、机关操作、分享线索后，新事件不会通知空闲 Live 会话；只有 say 会被转发。结果见 `next-public-event-gap.json`。下一独立增量应给同一会话发送去重、有界的公开状态通知，保持观察票据与按钮权限，不能用轮询或第二模型解决。此问题不在本次修复内。

证据校验：在本目录执行 `shasum -a 256 -c SHA256SUMS`。没有密钥、席位令牌、私有观察、原始模型日志或真实授权记录。
