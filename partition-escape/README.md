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

游戏只认上面固定的 harness 提交。并列的 `ai-gaming` 如果正停在别的分支上，不必切换它，从它导出一份固定版本即可：

```sh
mkdir ai-gaming-pinned
git -C ai-gaming archive 65d0749207965af98819a8dd2f222478b0795f56 | tar -x -C ai-gaming-pinned
uv sync --frozen --project ai-gaming-pinned
uv pip install --python ai-gaming-pinned/.venv/bin/python -r ai-games/partition-escape/requirements-live.txt
export PARTITION_HARNESS_ROOT="$PWD/ai-gaming-pinned"
```

harness 版本或依赖不对时，服务启动会在终端写明所用的 Python 和 harness 路径，西席页面的语音面板也会说明原因（例如「配套的 harness 版本不对」），不会等到开麦后才失败。

服务启动后就能打开游戏主页。实际通话还需要在启动环境中配置 `GEMINI_API_KEY` 和本机连接授权。首次安装的配置方法见 [Live 配置说明](LIVE.md)。

## 开始合作

1. 在主页点击「创建这次合作」，打开「进入西席」。语音房间默认按「标准」规则开局，想玩原来的房间，创建前把「规则」改成「入门」；两套规则的区别见下文「两套规则」。要看同房 Trace，可从同一张邀请卡另开「打开只读观众」，再选「东席 Live 会话总览」。
2. 点击「开始语音」，阅读页面提示并允许麦克风。出现「在听」后，可以直接与 Gemini 交谈。你的语音、游戏上下文和工具回执会通过本机后端发给 Google。
3. Gemini 递出钥匙后，西席点「接过黄铜钥匙」，再点「用钥匙打开西门门锁」。机关状态和提议以房间显示为准。切断动力、推开西门和递钥匙是共同动作：一方提出，另一方确认后才生效。提议等待确认期间，双方仍然可以操作自己的机关，所以可以先提出、再让对方做好准备后确认；同一时间只能有一个提议在等。等你确认的提议，搭档那边还会看到「现在确认的话我这一侧会怎样」，由规则直接算出。
4. 切去观战标签时，游戏会关闭麦克风。回西席点「在本局继续语音」可发起下一段连接，沿用房间与钥匙进度。重启 Node 服务会清空内存房间。

一段语音默认最长 10 分钟。搭档看得到自己房间里每个物件的说明，不需要你告诉它东间的机关怎么用；你只知道西间，它只知道东间，把各自看到的说出来就能推进。2026-11-26 用真实 Gemini 走通过多次整局，做法见「开发验证」：由一个只知道西间信息的玩家打字驱动，以及真实网页加合成语音当麦克风。最终版本上，网页加语音、只知道西间信息、先提议再等对方准备的玩家 79 秒通关，这样的整局只跑了一次。搭档是语言模型，仍然会判断错（比如在闸门没固定时确认断电）；规则没有死局，错了可以重新供电再来。真人对着物理麦克风的整局（房间回声、浏览器的麦克风授权）还没有验收过。通关后页面会等搭档说完最后一句，然后自己关闭麦克风。搭档一轮没有出声，或者你说完后迟迟没有回应，页面会直接说明，可以再说一遍。东席每做一个动作都要先看一眼现场再动手，所以说完话到机关响动通常要等几秒。一段语音结束后（到时、切了标签页或手动结束），机关进度都在，点「在本局继续语音」接着玩；新的一段不记得上一段说过的话，但能看到房间当前的状态、线索和最近的对讲。各项上限的默认值和改法见 [Live 配置说明](LIVE.md)。

会话总览按段展示机关执行结果、回执送达状态、请求 ID 和房间事件 ID。例如，递钥匙可以已产生提议，同时模型仍未收到回执。观战链接是只读凭证，请只分享给要邀请的观众。

## 两套规则

一间房按哪套规则玩，在创建时定下。主页「选择这次合作」里有「规则」一项，默认值由服务端按房间类型给出：有语音搭档的房间用「标准」，其余用「入门」。脚本席位和模型席位只会用一根木撑，所以选了它们就只能选「入门」。

「入门」就是原来的房间：一根木撑，动力随便接。

「标准」加了三样东西：

- **备用电池。** 每组 2 格，每次接通动力耗一格。一组用完后，可以在动力台换上备用组，换一次记一次。
- **支撑要挑。** 风扇后面有 4 根支撑，各刻一个记号。答案分在墙两边：东间看得到每根的记号和长度、支撑槽放得进多长的、闸轨上检修牌的颜色；西间的铭牌写着闸重，新增的「承重表」按记号列出承重，每种牌子颜色一列。放得进槽、并且在检修牌那一列的承重不低于闸重的那一根才撑得住。承重表只能自己看，不能整张分享给搭档；别的线索照常可以分享。
- **装支撑由西席确认，松手才见分晓。** 东席提议「装上刻着某记号的支撑」，西席对照承重表同意或先等等。装进去的支撑看不出好坏，东席要松开手闸才知道：撑住了才能走；撑不住闸门就落下，再升要再耗一格电。西席看不到闸门，但听得到：墙后的动静会说明闸门是升起还是落下了。语音搭档在确认提议前能看到「现在确认会怎样」，但没试过的支撑撑不撑得住不在其中，它只会被告知这一步要靠支撑独自承重。

两个人都走出去后，页面给出评级：一格电通关三星，没有换过电池两星，换过一星。每个房间的闸重、表里的数字、牌子颜色和哪一根合适都是随机的。

不商量也能通关：东席挨个提议放得进槽的支撑，西席凭运气确认，最坏要接通三次动力、换一次电池，只有一星。这套规则没有失败，压力来自评级。

各项数值（每组几格电、几根支撑、评级线、可用的记号和颜色）在 `room-rules.json`；哪类房间默认用哪套规则也在里面。要改，另写一个 JSON 文件只列出要改的项，启动前用 `PARTITION_ROOM_RULES` 指向它。写错名字，或者给出一组生成不了谜题的数值，服务启动时就会报 `room_rules_invalid` 并说明原因。

## 开发验证

```sh
npm test
export PARTITION_HARNESS_ROOT=/absolute/path/to/ai-gaming
export PYTHONPATH="$PARTITION_HARNESS_ROOT/src"
"$PARTITION_HARNESS_ROOT/.venv/bin/python" -m unittest discover -s . -p 'test_live*.py'
```

`test_live_playthrough.py` 是通关验收：生产 worker、真实的 LiveHub 和规则引擎，对着一个脚本化的模型端（`live_scripted.py`）在一段语音里走完整局，不读密钥、不联网、不用麦克风。改动上限或 worker 后先跑它。

下面两个脚本连的是真实 Gemini，各占用一次连接并产生实际用量，只在项目负责人同意后运行。服务先用 `npm start` 起好：

```sh
# 打字驱动整局：脚本按西席的按钮，用文字和搭档说话。不开麦克风。--scenario 决定玩家是谁：
#   west-only       只知道西间信息，台词不提东间的任何物件或动作（检验搭档自己会不会玩）
#   proposal-first  先提切断动力，再让搭档准备（一位真人的游戏曾卡在这里）
#   supports        「标准」规则的房间里只知道西间信息的玩家：自己查承重表，向搭档问检修牌颜色，
#                   逐个决定搭档提议的支撑。2026-11-26 写成，还没有对着真实 Gemini 跑过
# 前三种玩家是按「入门」规则写的，脚本创建房间时会指明；要换规则用 --rules。
#   dictated        知道全部解法，逐步指挥（只检验通路和规则，默认）
"$PARTITION_HARNESS_ROOT/.venv/bin/python" live_text_playthrough.py --out .runs/text-playthrough --scenario west-only --spend-one-connection
# 真实网页整局：Chrome 里的真实页面，系统语音（macOS say）当麦克风，页面自己的语音检测、上行和回放。
# E2E_SCENARIO=west-only 换成只知道西间信息、先提议的玩家；默认是逐步指挥的玩家。
# 这两种玩家都按「入门」规则写，脚本会在主页选好它（E2E_RULES，默认 classic）。「标准」规则的网页加语音整局还没有脚本。
E2E_PLAYWRIGHT=/absolute/path/to/node_modules/playwright node e2e-voice.mjs --dry-run              # 不开会话，不占连接
E2E_PLAYWRIGHT=/absolute/path/to/node_modules/playwright node e2e-voice.mjs --spend-one-connection # 加 --opening-only 只跑开场
```

`e2e-voice.mjs` 的开场是两句话，第二句紧跟在第一句的语音检测结束之后，正是此前回复被整段丢掉的时序；它会从 worker 的记录里核对这段期间服务商有没有报告打断。地址、输出目录、Chrome 路径、语音和间隔都可用 `E2E_*` 环境变量改，见脚本开头。

`node flow_audit.mjs [规则] [种子]` 不连模型：它用真实的规则引擎和房间，走遍规则能到达的全部局面（「入门」43 个；`node flow_audit.mjs standard 1` 是「标准」规则的一个房间，151 个），报告有没有走不出去的局面、提议等待时哪些自己的动作会被拒绝、以及在哪些局面下确认提议会让闸门落下。`integration_test.py`、`offline_protocol_check.py --output DIR` 和 `verify_concurrency.py --out DIR` 不在 `test_*.py` 的匹配范围内，改规则后要单独跑。

其余都是本机代码回归。真人语音验收需要玩家亲自开麦，确认听到回复，并将口头指定的动作与同一段 Trace 的房间事件对应。3D 渲染库使用 [Three.js 的 MIT 许可证](vendor/THREE-LICENSE.txt)。
