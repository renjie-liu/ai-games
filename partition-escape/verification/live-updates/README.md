# 有界 Live 公开状态同步：离线验收

本增量基于 PR #3 的 `afb3b374a55ffb6967eb23e427daf0a4cb8a0dd1`。目标是补上真人按钮确认／分享后，现有 Live 会话没有收到公开状态的缺口。**这里只完成上下文传输，不让空闲搭档自动接话，不宣称真实合作已恢复。**

## 实现与取舍

- 同一人＋Live房间内，成功的 `accept / decline / cancel / action / share` 才能产生更新。失败命令、查看、私有提示、普通聊天不进入此通路。聊天仍走原有用户回合，不重复发送。
- 根据实际 `receipt.roomEventIds` 从服务端公开事件选取字段；分享还必须与已经公开的 clue 对上。只附公开物理状态、当前公开提议和精简回执，不复制真人视图、`result.message`、未分享 notes、私有库存、可用动作列表或凭据。
- 250 ms 合并窗口；每会话最多 3 批，至少间隔 2 秒。待发最多 12 个事件，单批内容最多 2,400 UTF-8 字节，Node累计最多 4,800 字节；事件去重表最多128条。相同事件和重复分享同一线索均去重，合并窗口不因连点无限延长。
- worker再校验来源消息形状、epoch/scope、事件与请求关联；忙碌、说话或工具未完成时只保留一个合并队列。通过真实 `turn_complete` / 工具结束 / 输入事件恢复处理，没有轮询唤醒。worker最多3次发送、间隔2秒，包含控制说明的发送文本累计不超过4,800字节，并继续扣既有8,000字节文本预算；不提高任何连接、音频、回合、工具或金额额度。
- 每次送入**已有 SDK session**，调用 `send_client_content(..., turn_complete=False)`。不建立第二模型／连接，不触发新回答回合，不把状态更新当作“继续”。不更改等待词表或策略。这也意味着按钮之后立即主动继续解谜仍未实现。
- 用户开始新语音／文字时取消旧epoch待发队列；同epoch说话期间新发生的按钮更新仍能排队。暂停、关闭和断开取消未发消息。已开始的发送无法撤回，消耗不退、不重试；旧工具仍须通过观察票据、版本及Room引擎检查。已执行机关不回滚。
- 数量／大小超限会省略通知而非拆成无限批次；Node保留本地计数，worker记录省略状态。新一轮正常 `observe` 仍可获取当前本席／共享状态。被取消或省略的通知不自动重发。

官方文档支持[会话中追加结构化内容](https://aistudio.google.com/docs/live-api/capabilities#incremental-updates)。已安装SDK同时警示client content与realtime input交错可能有意外行为：本轮没有真实音频或供应商验证，不能承诺下一次音频一定正确利用更新。上下文也可能增加后续计费；未把它宣称为免费。

## 证据

| 检查 | 结果 / 文件 |
|---|---|
| Node全部回归 | 76/76，`node-tests.txt`；新增9项公开更新测试 |
| Python全部回归 | 94/94，`python-tests.txt`；新增12项 |
| 原有人/脚本四组合 | 4/4通关，`integration.txt`；不等于Live合作 |
| 实际HTTP/worker/harness fixture | `http/results.json`，4/4；临时副本只替换fixture提供者脚本及捕获发送文本，生产路由、输入循环、预算和工具执行保持原样 |
| 实际Trace页面 | `browser-results.json`，4页×1440/390共8次；页面错误0、外部请求0、横向溢出0；两张截图 |
| 本地独立只读审查 | `peer/REVIEW.md`，产品和测试hash见`peer/PRODUCT-SHA256SUMS`。这是本地独立审查，不是Mark/Bezos或GitHub审批 |
| 当前4174与原账本 | `runtime-unchanged.json`：仍旧ai-gaming工作区a2952a4，健康；额度0；固定账本hash未变，没有重启／替换 |

HTTP delivery场景由明确测试驱动（不是玩家或模型）确认fixture工具提出的钥匙交接，Room产生事件#3/#4；玩家查看动力台但不分享，其私有说明没有进入更新。再分享铭牌产生#7，三事件合成一次`fixture_sent`，含真实请求ID；重复分享4次未新增发送。另三场景在合并窗口内暂停、语音起始或结束，发送0次，已执行交接仍保留真实回执。`delivered-context.json`仅将测试control scope替换为占位，公开事件及请求ID保持原样。

Trace单列`context_update`，`queued/send_attempt/fixture_sent/transport_sent/canceled`与机关结果分开。`transport_sent`只证明发送方法返回；没有供应商接收确认、模型理解或新增动作的含义。fixture来源常驻可见，摘要不填造。

浏览器探针初版曾把说明图例中的`fixture_sent`算作状态，造成测试误报；已改为检查实际状态行。初始静态页favicon 404已在探针中返回204，不影响产品。最后8项检查通过。

## 离线重现（不运行start:live）

在`partition-escape/`，使用已安装harness依赖的解释器：

```sh
export PARTITION_HARNESS_ROOT=/absolute/path/to/ai-gaming
export PARTITION_PYTHON="$PARTITION_HARNESS_ROOT/.venv/bin/python"
export PYTHONPATH="$PARTITION_HARNESS_ROOT/src"
npm test
"$PARTITION_PYTHON" -m unittest discover -p 'test_*.py' -v
PARTITION_TEST_PORT=4332 "$PARTITION_PYTHON" integration_test.py
"$PARTITION_PYTHON" verification/live-updates/http_fixture.py --output /absolute/path/to/persistent-offline-output
```

HTTP脚本清除API key／代理环境，使用临时游戏副本与fixture账本，不构造Gemini SDK客户端。生产源码不附带授权或真实账本。独立session探针还禁止`socket.connect`，只用fake SDK验证实际发送函数。

页面复核：只将去敏`http/`目录用`python3 -m http.server 4331 --bind 127.0.0.1 --directory ...`临时发布到loopback，Playwright CLI打开`delivery.html`，执行`browser-check.js`；截图先写`output/playwright/live-updates/`。未申请麦克风。复核完关闭临时浏览器与4331。

## PR链与未完成项

核查时PR #3仍为draft/open，head为afb3b37，GitHub reviews/comments/checks均为空；它的先前本地定点复核通过。新PR以其分支为base，只包含本增量；两者均未合并、未部署到4174。James可统一安排Mark/Bezos定点复核，无自动通知。

真实Gemini请求、语音、计费、主动接话及真人试玩均未验证；本轮新增真实请求0。真实合作仍不能标完成。新授权、真实音频交错验证与自动回应策略均不在此PR范围。
