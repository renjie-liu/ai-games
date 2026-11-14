# 隔墙 / Partition Escape

两个人隔着墙，分别查看本侧物件、分享线索，再确认共同动作一起逃离。脚本搭档是明确标注的固定策略，不是真实语言模型。3D 页面和全部静态资源在本目录，通用 `TacticalLoop`、执行器、provider 和 Trace Studio 来自独立的 [ai-gaming](https://github.com/renjie-liu/ai-gaming) checkout。

本次从 `ai-gaming` 的 `prototypes/partition-escape/` 导入，源码基线 `a2952a4c1372169535c3b05cd30c31152e67640f`。原始文件 SHA256 与排除项见 [IMPORT.json](IMPORT.json)。原目录未删除或改动；这次是独立落位与路径适配，不改机关规则、权限、脚本词表或模型协议。

## 本机启动

要求 Node >=20、Python >=3.12、uv。建议两个仓库并列；本目录默认查找 `../../ai-gaming`。**以下 checkout 命令只用于全新 harness 副本，不要切换正在运行的工作目录：**

```sh
# 在一个新的工作目录，已经有 ai-games 时省略第一行
git clone https://github.com/renjie-liu/ai-games.git
git clone https://github.com/renjie-liu/ai-gaming.git
git -C ai-gaming checkout 65d0749207965af98819a8dd2f222478b0795f56
uv sync --frozen --project ai-gaming
uv pip install --python ai-gaming/.venv/bin/python -r ai-games/partition-escape/requirements-live.txt
cd ai-games/partition-escape
npm run start:local
```

打开 http://127.0.0.1:4174 ，选择真人＋脚本或真人＋真人，创建房间并打开席位链接。另一席只能看见你主动分享的内容。共同动作需对席确认；文字消息不会代替确认按钮。

非并列目录请指定**绝对路径**：

```sh
PARTITION_HARNESS_ROOT=/absolute/path/to/ai-gaming \
PARTITION_PYTHON=/absolute/path/to/ai-gaming/.venv/bin/python \
npm run start:local
```

`PARTITION_PYTHON` 可省略，默认使用指定 harness 的 `.venv/bin/python`。安装 `requirements-live.txt` 也是离线 SDK 测试的必要依赖，不会发起模型请求。验证使用的 harness `src` 和 `config` 与上述 `65d0749` 一致；未宣称所有未来 harness 版本均兼容。

已有 4174 服务时，可以用 `PORT=4175 npm run start:local`。所有入口仅监听 `127.0.0.1`，保留 Host/Origin 检查。重启服务会清空内存房间，需要重新建房。

## 语音与模型边界

- `npm run start:local` 默认关闭全部付费模型、Gemini Live 和 ElevenLabs；可用浏览器已有的本机朗读。不是语音识别或实时 AI。
- `npm run start:local -- mock` 启用明确标注的离线提示音，测试 TTS 接线，不读 key、不产生语音账单。
- [LIVE.md](LIVE.md) 说明 Gemini Live 接线与离线验证。真实 Live 需要另行批准的本机授权记录；本仓库不附带记录，缺失时剩余额度为 0，worker 不会自动创建额度。旧的一次模型 smoke 同样默认无授权。
- ElevenLabs 的真实模式也需现有机制要求的独立授权、费率与账本；本目录没有这些文件。密钥仅服务器读取，绝不能放进客户端、提交或 Trace。
- 不复制旧目录的 `.live`、`.voice`、`.model`、`.runs` 或密钥来“恢复”额度。目录迁移不延长、增加或重置任何授权。

## Harness 与 Trace

Node 服务只向每个 worker 提供该席位凭证。Python 从 `PARTITION_HARNESS_ROOT/src` 加载真实 harness；`seat_worker.py` 使用该 checkout 的 `config/example.yaml` 构造离线脚本配置。没有复制一份 harness，也没有另起游戏控制器。

`Room.command` 仍负责权限和机关规则。观众链接提供公开时间轴与 Studio；原始 `.runs` 记录含席位私有观察，不应作为观众附件分享。公开 Trace 区分真实动作回执、脚本分支原因、离线 fixture 和历史模型回复；缺失/省略的理由不补写。

## 离线验证

在本目录运行，`PARTITION_HARNESS_ROOT` 需要是绝对路径：

```sh
export PARTITION_HARNESS_ROOT=/absolute/path/to/ai-gaming
export PARTITION_PYTHON="$PARTITION_HARNESS_ROOT/.venv/bin/python"
export PYTHONPATH="$PARTITION_HARNESS_ROOT/src"
npm test
"$PARTITION_PYTHON" -m unittest discover -s . -p 'test_*.py'
PARTITION_TEST_PORT=4315 "$PARTITION_PYTHON" integration_test.py
"$PARTITION_PYTHON" voice_http_check.py
```

当前迁移验收结果见 [MIGRATION.md](MIGRATION.md)。不运行 `model_smoke_run.py --execute-one` 或 `live_check.py --real`，这些不是离线测试。

## 已知限制

这次没有真实模型调用或麦克风采集，不把旧版本的音频成功当成本版本的真实合作验证。脚本仍有已知等待词表局限；Live 的真实交接与真人麦克风体验未验收。Three.js 许可证见 [vendor/THREE-LICENSE.txt](vendor/THREE-LICENSE.txt)。
