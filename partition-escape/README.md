# 隔墙 / Partition Escape

西席由真人操作，东席是实时语音搭档 Gemini Live。墙两侧看到的线索不同。你可以让搭档查看东边的机关、递出黄铜钥匙，或在你供电后拉住手闸。需要双方合作的动作会在房间里生成提议，另一席确认后才会生效。

## 本机启动

需要 macOS 或 Linux、Node.js 20+、Python 3.12+、uv，以及可访问私有 ai-gaming 仓库的账号。Node 提供游戏页面和房间，Python 调用该仓库的 TacticalLoop 执行模型请求的游戏动作。实时语音需要服务端的 Gemini API key，对应项目须有权使用 `gemini-3.8-live`。

在一个新目录中并列放置两个仓库。下列命令假设已检出包含本游戏的 ai-games 分支。

```sh
git clone https://github.com/renjie-liu/ai-gaming.git
git -C ai-gaming checkout --detach 65d0749207965af98819a8dd2f222478b0795f56
uv sync --frozen --project ai-gaming
uv pip install --python ai-gaming/.venv/bin/python -r ai-games/partition-escape/requirements-live.txt
cd ai-games/partition-escape
npm start
```

默认为 <http://127.0.0.1:4174/>。需要其他端口时，可用 `PORT=4180 npm start`。已有独立 harness 环境时，可通过 `PARTITION_HARNESS_ROOT` 和 `PARTITION_PYTHON` 指定 checkout 和解释器的绝对路径。

服务启动后就能打开游戏主页。实际通话还需要在启动环境中配置 `GEMINI_API_KEY` 和本机连接授权。首次安装的配置方法见 [Live 配置说明](LIVE.md)。

## 开始合作

1. 在主页点击「创建这次合作」，打开「进入西席」。要看同房 Trace，可从同一张邀请卡另开「打开只读观众」，再选「东席 Live 会话总览」。
2. 点击「开始语音」，阅读页面提示并允许麦克风。出现「在听」后，可以直接与 Gemini 交谈。你的语音、游戏上下文和工具回执会通过本机后端发给 Google。
3. Gemini 递出钥匙后，西席点「接过黄铜钥匙」，再点「用钥匙打开西门门锁」。机关状态和提议以房间显示为准。
4. 切去观战标签时，游戏会关闭麦克风。回西席点「在本局继续语音」可发起下一段连接，沿用房间与钥匙进度。重启 Node 服务会清空内存房间。

会话总览按段展示机关执行结果、回执送达状态、请求 ID 和房间事件 ID。例如，递钥匙可以已产生提议，同时模型仍未收到回执。观战链接是只读凭证，请只分享给要邀请的观众。

## 开发验证

```sh
npm test
export PARTITION_HARNESS_ROOT=/absolute/path/to/ai-gaming
export PYTHONPATH="$PARTITION_HARNESS_ROOT/src"
"$PARTITION_HARNESS_ROOT/.venv/bin/python" -m unittest discover -s . -p 'test_live*.py'
```

这些是本机代码回归。真人语音验收需要玩家亲自开麦，确认听到回复，并将口头指定的动作与同一段 Trace 的房间事件对应。3D 渲染库使用 [Three.js 的 MIT 许可证](vendor/THREE-LICENSE.txt)。
