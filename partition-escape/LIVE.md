# Gemini Live：保留接线，迁移不产生授权

链路仍是浏览器麦克风 → localhost 服务 → 单个 Gemini Live 会话；完整工具调用通过现有 harness 和 `Room.command`。不另开脚本或第二个模型。用户语音触发本地停声、旧观察票据失效；共同动作保留真人按钮确认。

## 此 checkout 的状态

真实授权文件不随源码分发。`.live/authorization.json` 与 `.live/ledger.json` 缺失时 worker 在读取 key 和联网之前退出；健康接口显示 0 次剩余额度。不会因为换仓库、换房间、重启或换输出目录自动获得新额度，也不修改旧 `ai-gaming` 目录的已消费记录。

`npm run start:live` 只开启本机 Live 页面和离线依赖检查，不自动连接 Google。**没有另行批准的授权时，不能开始真实语音。** 页面先检查环境/额度，再由用户点击并亲自授予麦克风；不要手工复制、重写或删除旧账本来绕过这个边界。未来授权配置不属于此次目录迁移。

保留旧实现上限：2 次连接、每次60秒、30秒输入音频、20秒输出音频、6回合/6工具、累计8,000字节文字、256输出token，每次预留USD0.25，最多USD0.50；这描述的是实现的上限，并非本仓库已获准使用的额度。费用是应用估算，非供应商硬账单上限；credits 未核实。

密钥只由 Python 服务端读取。暂停、后台切换、断线或用量触发时停止，不自动重连。`live_runtime.py` 先检查 SDK、HTTP/SOCKS 与 WebSocket 依赖，不读密钥或打开网络。依赖安装见 [README.md](README.md)。

## 纯离线 Live 验证

先按 README 设置绝对的 `PARTITION_HARNESS_ROOT`、`PARTITION_PYTHON`、`PYTHONPATH`，然后两个终端分别执行：

```sh
PORT=4316 PARTITION_ALLOW_LIVE=1 PARTITION_LIVE_FIXTURE=1 \
PARTITION_ALLOW_MODEL=0 PARTITION_TTS_MODE=off node server3d.mjs
```

```sh
"$PARTITION_PYTHON" live_check.py --origin http://127.0.0.1:4316 --out /absolute/path/to/new-fixture-output
```

没有 `--real`。fixture 使用人工提示音和工具输入，不采集麦克风、不构造 Google client；fixture 账本与真实授权分开。关闭该测试服务后再启动正常游戏。

## 证据边界

上游 `2329af2` 曾做 1 次真实连接：合成输入语音正确转写、返回音频并查看成功；交接被错误动作ID拒绝。其后用户启动遇到 ImportError，上游 `a2952a4` 补齐代理依赖并离线验证。上述均是**历史证据，不是本仓库的新实测**，原故障唯一根因未确证。

本次迁移只做离线验证；真实合作、真人麦克风体验与当前账户计费仍未验收。公开 Trace 没有输出模型内部推理，真实模型简短依据未提供时明确标为“未提供”。
