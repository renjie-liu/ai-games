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

连接使用 `gemini-3.8-live`，每段最多 60 秒、30 秒输入音频、20 秒输出音频、6 个工具调用，输出配置上限为 256 tokens。应用根据服务商返回的用量估算费用并提前停止，实际费用以项目账单为准。切页会停麦；回到原页后由真人手动点击续连。

房间、席位和钥匙在 Node 服务运行期间保留。查看跨段动作请打开观众页的「东席 Live 会话总览」。它分别列出每段的机关回执与模型送达状态。
