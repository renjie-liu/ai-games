# Gemini Live 本机配置

由项目负责人在运行 Node 的本机环境中配置 `GEMINI_API_KEY`。游戏也兼容从当前用户的 `~/.bashrc` 读取独立一行的同名赋值。密钥留在后端；游戏页面只连接本机服务。请把实际密钥、房间链接、`.live/` 账本及 `.runs/` 原始记录保存在本机。

## 首次配置本机连接授权

全新 checkout 默认显示剩余 0 次。这个数字是本机允许发起连接的次数，Google 项目的模型访问权、余额和计费由项目负责人另行核对。每次手动续连都会占用一次。项目负责人应先确认本机可用的连接次数、项目计费与真人音频处理设置。

下面是**全新安装**的两次连接示例，可供一次同房两段试玩。仅在负责人批准这两次后，在游戏目录执行。已有 `.live` 目录时命令会直接退出，以保留原授权与已用次数。首次建房或启动服务均不会自动创建额度。

```sh
python3 - <<'PY'
import json
import os
from pathlib import Path
from uuid import uuid4
from live_budget import grant_limits

os.umask(0o077)
directory = Path(".live")
directory.mkdir(mode=0o700, exist_ok=False)
grant = {
    "schema": 2,
    "authorization": str(uuid4()),
    "connectionLimit": 2,
    "projectVerified": True,
}
ledger = {"authorization": grant["authorization"], "limits": grant_limits(grant), "attempts": []}
(directory / "ledger.json").write_text(json.dumps(ledger), encoding="utf-8")
(directory / "authorization.json").write_text(json.dumps(grant), encoding="utf-8")
PY
```

在游戏目录运行 `python3 live_budget.py` 可查看本机剩余次数。运行 `"$PARTITION_PYTHON" live_runtime.py` 可单独检查 SDK 和代理依赖（先将该变量设为 harness 虚拟环境的 Python 路径）。该检查的 `network_requests` 为 0；只有玩家在西席点击语音并授予麦克风权限后才会发起 Gemini 握手。

## 每段语音

连接使用 `gemini-3.8-live`。一段语音能用多少，全部写在 [live-limits.json](live-limits.json) 里，worker、服务端和页面读的是同一份：

| 名称 | 默认 | 含义 |
|---|---|---|
| `session.seconds` | 600 | 一段语音的最长时间 |
| `session.input_seconds` / `output_seconds` | 300 / 300 | 真人发言、搭档回复各自的音频时长 |
| `session.turns` / `tools` | 120 / 120 | 搭档的回合数、工具调用数（一个机关动作是「观察 + 操作」两次调用） |
| `session.text_bytes` | 160000 | 发给模型的文字（设定、观察、回执、状态同步）总量 |
| `session.max_output_tokens` | 1024 | 单次生成的输出上限。模型的思考也算在里面：2026-11-26 的真实记录里，上限为 256 时，思考用掉 220 到 244 个 token 的回合，回复被截在半句或完全没有声音 |
| `session.usage_stop_usd` | 1.00 | 按服务商返回用量估算的费用到这个数就结束本段 |
| `updates.*` | 60 批，每批 2400 字节 | 真人按钮结果同步进模型上下文的次数与大小 |

要改某一项，不必动仓库里的文件：写一个只含要改的键的 JSON，用 `PARTITION_LIVE_LIMITS` 指向它再启动服务。写错键名或给了非正数时，服务会指出 `live_limits_invalid`，不会带着半套上限运行。

```sh
echo '{"session":{"seconds":300,"usage_stop_usd":0.5}}' > ~/partition-limits.json
PARTITION_LIVE_LIMITS=~/partition-limits.json npm start
```

费用估算按每百万 token 输入 3 美元、输出 12 美元保守计，逐条累加服务商返回的用量。它是提前停止用的估算，实际费用以项目账单为准。

估算主要随轮数涨，和时长关系不大。服务商每一轮都把这段语音此前的全部上下文重新计入，一轮里每多一次工具调用就再计一遍，所以每一轮都比上一轮贵，累计大致按轮数的平方增长。碰到上限后本段结束、机关进度保留；继续语音是一段新的小上下文，所以两段各十来轮比一段二十多轮便宜。想让一段撑更多轮，就调高 `session.usage_stop_usd`。

2026-11-26 的实测，都是真实 Gemini 的一整局。只有最后一行是现在这一关；前面几行的房间还没有备用电池，支撑只有一根木撑：

| 版本 | 玩家 | 轮数 / 工具调用 | 估算 |
|---|---|---|---|
| 当天早先 | 逐步指挥（打字） | 7 / 14 | 0.41 美元 |
| 当天早先 | 逐步指挥（网页加合成语音） | 8 / 14 | 0.41 美元 |
| 加了票据、只说一次和输出上限之后 | 只知道西间（打字），两次 | 6 / 9 和 6 / 8 | 0.34 和 0.30 美元 |
| 没有备用电池和挑支撑时的最后一版 | 只知道西间、先提议（网页加合成语音） | 5 / 9 | 0.33 美元 |
| 现在这一关 | 只知道西间、先提议，按承重表决定支撑（打字） | 7 / 7 | 0.32 美元 |

一位真人当天的一段语音在第 16 轮、约 4 分钟时碰到 1 美元（24 次工具调用，其中不少被作废或被规则拒绝）。之后做了三件事来压低每一轮的开销：搭档每轮和每个回执都直接拿到下一张 ticket，不必为每个动作先多调用一次观察；同一条说明、线索和消息在一段语音里只发一次；搭档一开始就知道自己房间的机关，少走弯路。真人的整局在这之后还没有量过。授权文件只管连接次数，改上限不影响已有授权和已用次数；每次连接实际适用的上限记在账本的该次记录里。切页会停麦；回到原页后由真人手动点击续连。

房间、席位和钥匙在 Node 服务运行期间保留。查看跨段动作请打开观众页的「东席 Live 会话总览」。它分别列出每段的机关回执与模型送达状态。
