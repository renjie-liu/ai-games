# Ironyard 铁场

Agent 先**造车**，再**写策略**，然后比赛完全离线推演：同样的文件加同样的种子，结果永远一样。

- 积木式拼车：9×11 凸点、底盘 + 上层两层，36 种零件占 1×1 到 2×2、1×3 颗凸点（板/砖/装甲/斜面、轮子/大脚轮/履带/悬浮/推进/陀螺/增压器/尾翼、7 种武器 + 圆锯撞角、电池/反应堆/雷达/护盾/维修臂、5 种免费装饰），有预算上限和点缀色涂装
- 每块积木有自己的血量，会被打掉；重心、转向、极速、级别都由拼法算出来；子弹先打上层，撞击先打底盘，斜面会跳弹
- 7 张地图（墙、矮栏、深坑、泥地、冰面、熔岩、维修台、悬空岛），每张有自己的实景主题（混凝土试车场、海上钢甲板、沙漠峡谷、雪原、铸造厂、云上平台、沼泽），6 种道具，收缩毒圈
- 1v1 / 2v2 / 3v3，队友之间只能靠 `say` 传话，可以混编不同作者的 bot
- 浏览器、命令行、MCP 服务共用同一份引擎；引擎、CLI、MCP 服务零依赖（Node 20+）

## 马上跑

```bash
open dist/index.html                      # 单文件网页：3D 回放、车库、代码、联赛，离线可用

node node/cli.js bots                     # 内置 9 个参考 bot
node node/cli.js match --a hornet --b bastion --map canyon --seed 3
node node/cli.js match --mode 3v3 --map bog --a wolfpack --b longshot,bastion,medic
node node/cli.js tournament --mode 1v1 --seeds 2 --matrix
node node/cli.js validate path/to/mybot.js
```

## 让 Agent 接进来（MCP）

```bash
# Claude Code（stdio）
claude mcp add ironyard -- node /绝对路径/ironyard/node/mcp-server.js

# 或者起一个 HTTP 端点（Streamable HTTP，默认只监听 127.0.0.1）
node node/mcp-server.js --http 8787
claude mcp add --transport http ironyard http://127.0.0.1:8787/mcp
```

其它客户端用通用配置：`{"mcpServers": {"ironyard": {"command": "node", "args": ["/绝对路径/ironyard/node/mcp-server.js"]}}}`

| 工具 | 用途 |
|---|---|
| `get_rules` | 完整规则书和控制器约定（就是 `AGENTS.md`） |
| `list_parts` / `list_maps` | 零件、道具、地形、常量、地图的结构化数据 |
| `list_bots` / `get_bot` | 现有 bot 列表和源码 |
| `validate_design` | 只校验蓝图：错误、警告、推导性能、ASCII 图 |
| `submit_bot` | 编译 + 三种模式冒烟测试，通过才存到 `user_bots/` |
| `run_match` | 跑一场，返回战报；`save_replay: true` 写回放到 `replays/` |
| `evaluate_bot` | 对一群对手、多图、多种子、换边，给胜率表和最惨的几场 |
| `run_tournament` | 循环赛积分榜和交手记录 |

还带一个 `build-a-bot` 提示词模板和 `ironyard://rules` 资源。环境变量：`IRONYARD_BOTS_DIR`、`IRONYARD_REPLAY_DIR`、`IRONYARD_MATCH_TIMEOUT_MS`。

## 写一个 bot

一个 JS 文件，顶层定义 `design`（蓝图对象，或 `(ctx, api) => 蓝图`）和 `tick(state, api)`。完整字段见 [AGENTS.md](AGENTS.md)，`bots/` 里是 9 个带注释的样板，设计思路见 [docs/DESIGN.md](docs/DESIGN.md)：

| bot | 流派 |
|---|---|
| `rookie` | 基准：四轮三机枪，故意没花完预算，中距离对射 |
| `bulldozer` | 履带 + 推铲撞角圆锯 + 推进器，冲撞 |
| `longshot` | 磁轨炮 + 双加农炮 + 雷达，风筝 |
| `hornet` | 所有武器朝左的舷炮快车，绕圈 |
| `bastion` | 履带重甲 + 护盾 + 双炮，正面推进 |
| `medic` | 双维修臂 + 护盾，跟着队友修 |
| `wasp` | 悬浮导弹艇，飞过坑和熔岩 |
| `thumper` | 大脚轮迫击炮车，隔着墙轰预判落点 |
| `wolfpack` | 团队 bot：一个文件按槽位出坦克/舷炮手/维修车，`say` 集火 |

## 目录

```
engine/   确定性引擎（零件表、蓝图校验、物理、武器、道具、地图、寻路、比赛、赛程）
docs/     DESIGN.md：积木套件的调研和设计取舍
bots/     内置 bot
node/     cli.js、mcp-server.js、带看门狗的工作线程池
web/      网页端源码和构建脚本（three.js r128；kit.js 是积木模型，terrain.js 是程序化场地，render3d.js 是场景）
dist/     构建好的单文件网页
tests/    引擎单测、MCP 端到端（官方 SDK 客户端，stdio + HTTP）、网页端到端（无头 Chrome）
```

```bash
npm test                 # 引擎单测，不需要装依赖
npm install              # 下面两个和重新构建网页才需要
npm run test:mcp
npm run test:ui          # 需要本机有 Chrome，可用 CHROME=/path/to/chrome 指定
npm run build            # 重新生成 dist/ 和 AGENTS.md
node tests/maps.mjs      # 给每张地图截远景和近景（需要 Chrome），输出到 /tmp/shots 或 $SHOTS
```

## 现在的边界

- 控制器跑在 Node `vm` 上下文 + 工作线程里（浏览器里是 Web Worker），死循环会被看门狗杀掉并判负。`vm` 不是对抗恶意代码的沙箱：现在适合本机和自己信任的 Agent。开放给陌生人提交之前，要换成 QuickJS / isolated-vm 或容器隔离。
- CPU 预算目前只统计并上报（`cpu.avgMs`），没有做成确定性的指令计数。
- 三角函数用的是宿主 JS 引擎的实现：同一台机器上完全可复现；不同引擎（V8 / JavaScriptCore）之间理论上可能有末位浮点差异，回放文件本身不受影响。
- 平衡性只用内置 9 个 bot 的循环赛粗调过（1v1 七张图：longshot 约 71%，其余 41% 到 58%，rookie 是故意留的低预算靶子）；狙击流偏强，是留给新 bot 的靶子。
