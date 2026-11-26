# 把《隔墙》放到公网上，凭邀请玩

默认的服务只给本机用（见 [README](README.md)）。这份说明讲怎样架一台别人能打开的服务：访客凭邀请链接进来，和 Gemini Live 语音搭档玩这一关，费用记在服务所有者的 Gemini 密钥上。

> 状态（2026-11-26）：服务端的公网模式、邀请和并发在本机验证过（见文末「验证到哪一步」）。**容器镜像还没有构建过，也没有部署过**：第一次 `fly deploy` 就是它的第一次测试。

## 三道闸和它们各管什么

| 闸 | 在哪里定 | 管什么 |
|---|---|---|
| 邀请 | 服务器上的邀请文件，用 `invites.mjs` 加 | 谁能开房间。没有有效邀请的人只看得到「需要邀请链接」，看不到别人的邀请 |
| 每条邀请的次数 | 加邀请时给的数字 | 这条邀请总共能开始多少段语音 |
| 总额度 | 服务器上的 grant，用 `deploy/grant.py` 写一次 | 这台服务总共能开始多少段语音。用完就停，重新部署也不会复位 |

每段语音在费用估算到 `session.usage_stop_usd`（默认 1 美元）时结束，所以总额度 N 次就是「按估算最多 N 美元」。按 2026-11-26 的实测，一整局的估算在 0.30 到 0.41 美元之间。

**估算不是账单。** 它按服务商返回的用量保守累加，实际费用以 Google 项目的账单为准。请在 Google 项目上另设预算提醒或配额，把它当作真正的上限。

另外两个数字：`server.concurrent_sessions`（同时进行的语音段数，线上默认 3）和 `rooms.idle_minutes`（没人碰的房间多久回收，线上默认 30 分钟）。

## 服务器上会留下什么

- **不保存**：麦克风的声音、搭档的声音、双方说了什么。
- **保存**在卷上的 `/data/runs`：每段语音的计数（时长、轮数、工具调用、估算费用）、搭档每次动手时看到的房间状态。房间状态里有房间事件，所以**玩家打字发给搭档的话和房间里的操作会留在里面**。主页的说明里写了这一点。
- 玩家的语音和游戏上下文会经由这台服务发送给 Google。付费项目下 Google 不用它改进产品，为防滥用保留 55 天（2026-03-23 生效的 Gemini API 附加条款，下同）。

## 只有项目所有者能定和能做的

1. **Gemini 项目要开计费。** 免费额度下，Google 可以用提交的内容改进产品，并可能由人工审阅，访客的语音也在内；面向欧洲经济区、瑞士、英国的用户必须使用付费服务。`deploy/grant.py` 的 `--billing-is-on` 就是你对这一点的确认。
2. **条款里和公开游戏有关的两条**（转述，不是法律意见）：不得把服务用在面向或可能被未满 18 岁的人使用的应用里；API 是「供开发者用于专业或商业目的，不面向消费者」。主页写了「仅限年满 18 岁的玩家」，邀请制也收窄了范围，是否足够由你判断。
3. **私有的 harness 会进入镜像**，存在你的 Fly 账号里。
4. **密钥只由你输入**，见下面第 3 步。不要把它贴进聊天、提交或任何文件。

## 部署到 Fly.io

需要：`flyctl`、一份固定版本的 harness（README「本机启动」里的 `ai-gaming-pinned`）、这个仓库的一份干净检出。

```sh
# 1. 组装镜像目录。它必须在任何仓库之外，因为里面有私有的 harness。
#    只带上已提交的游戏文件：本机的额度（.live）、运行记录（.runs）和没提交的改动都不会进去。
export PARTITION_HARNESS_ROOT=/absolute/path/to/ai-gaming-pinned
sh deploy/make-context.sh ~/partition-image

# 2. 应用和卷。区域选离玩家近、Gemini API 可用的地方（香港不行）。
fly auth login
fly apps create <应用名>
#    编辑 ~/partition-image/fly.toml，把两处 CHANGE-ME 换成应用名和区域。
fly volumes create partition_data --app <应用名> --region <区域> --size 1

# 3. 密钥。自己输入；--stage 表示先存着，等第一次部署时生效。
fly secrets set GEMINI_API_KEY=<你的密钥> --app <应用名> --stage

# 4. 部署。永远只有一台：房间在服务的内存里，账本是一个文件。
cd ~/partition-image
fly deploy --ha=false
fly scale count 1 --app <应用名>
fly status --app <应用名>          # 应当只有一台机器，挂着 partition_data
```

服务起来以后，写额度、发邀请。没有人访问时机器会自己停转，`fly ssh console` 这时连不上：先打开一次主页，或者 `curl https://<应用名>.fly.dev/api/health`，把它叫醒再执行。

```sh
# 5. 总额度。100 次即按估算最多 100 美元。只能写一次。
fly ssh console --app <应用名> -C "/app/game/deploy/run.sh /app/harness/.venv/bin/python deploy/grant.py 100 --billing-is-on"

# 6. 邀请。名字给自己看，数字是这条邀请能开始的语音段数。链接只在这时打印一次。
fly ssh console --app <应用名> -C "/app/game/deploy/run.sh node invites.mjs add 朋友 20"
```

把打印出来的链接（`https://<应用名>.fly.dev/#invite=…`）发给对方。`#` 后面的部分浏览器不会发给任何服务器，页面在开房间时才把它放在请求头里交给这台服务。

## 上线后先做的检查

```sh
curl -s https://<应用名>.fly.dev/api/health          # ok:true，localOnly:false，live.remaining 等于你写的额度
```

如果每个请求都得到 403「请从公开地址访问」，说明服务收到的 `Host` 和 `/data/hosting.json` 里的 `public_origin` 对不上：要么换了域名而没改这一项，要么前面的代理没有原样转发访客用的域名。Fly 的代理是否原样转发，这里没有验证过；这一步就是验证。

然后**自己用一条邀请完整玩一局**，再把链接发出去。这一局同时是三件事的第一次：这个区域到 Gemini 的连接、合并后的语音客户端的真实会话、以及经过公网代理的语音延迟。

## 日常

```sh
# 每条邀请用了多少、总额度还剩多少
fly ssh console --app <应用名> -C "/app/game/deploy/run.sh node invites.mjs list"
fly ssh console --app <应用名> -C "/app/game/deploy/run.sh /app/harness/.venv/bin/python live_budget.py"

# 再加一条邀请：同第 6 步，不用重启。
# 收回一条邀请：从 /data/access/invites.json 里删掉那一项，不用重启。它不能再开新房间；
# 已经开着的房间在被回收前还能继续开始语音，仍然记在这条邀请的次数里。

# 立刻停掉一切
fly scale count 0 --app <应用名>
```

- **改设置**：`/data/hosting.json`（地址、房间上限、回收时间）和 `/data/limits.json`（并发数、每段语音的上限）在第一次启动时写到卷上，之后归你改；改完 `fly apps restart <应用名>`。重启会结束所有房间。
- **自己的域名**：第一次启动前设 `PARTITION_PUBLIC_ORIGIN=https://你的域名`，或者改 `/data/hosting.json` 里的 `public_origin` 后重启。
- **增加总额度**：`grant.py` 不会覆盖已有的 grant。没有语音在进行时，把 `/data/live/authorization.json` 的 `connectionLimit` 和 `/data/live/ledger.json` 里 `limits.connections` 改成同一个新数字。
- **机器大小**：`fly.toml` 给的是 1 GB。一个语音进程在离线替身会话里实测约 150 MB，真实会话没有量过；内存不够时把并发数调低，或把机器调大。
- **刚结束一段就开下一段**：一段语音结束后的一两秒内，新的一段可能被答复「现在同时在玩的人已满」，因为上一段的进程还没有退出。再点一次即可。
- **更新版本**：重新做第 1 步（换一个空目录），把 `fly.toml` 里的两处改回来，再 `fly deploy --ha=false`。卷上的额度、邀请和设置都保留。

## 不用 Fly 的话

镜像是普通的容器：对外监听 8080，需要一个挂在 `/data` 的持久目录和环境变量 `GEMINI_API_KEY`。不在 Fly 上时没有 `FLY_APP_NAME`，要自己设 `PARTITION_PUBLIC_ORIGIN`。前面得有一层提供 HTTPS 的代理，并且原样转发 `Host`。只能运行一个实例。

## 验证到哪一步

- **自动测试**：账本的并发和邀请计数（包括两个进程同时写同一份账本）、中枢的并发上限和后台读额度、公网模式下谁能进（真实的服务进程，按公网地址发请求）、邀请文件和命令行、房间回收、镜像目录里不会带上本机的额度和记录。
- **没有屏幕的环境**：把 macOS 专用的模块全部屏蔽后，语音进程的启动检查通过，六个离线整局测试通过，进程不加载任何截屏或输入模块。运行记录里的 PNG 是由房间状态的哈希生成的指纹图，不是截屏。
- **「不保存说了什么」**：在三次真实的网页加语音会话留下的全部文件里，查不到玩家或搭档说过的话，也没有转写字段。
- **本机走过一遍**：把公开地址设成 `http://localhost:4191`，没有邀请进不去，无效邀请进不去，有效邀请能开房间、进西席、接通离线替身搭档，会话记在这条邀请名下。
- **没有做过的**：构建镜像；部署；真实的 Gemini 会话经过公网；两个人同时进行真实语音；Fly 代理对长时间没有数据的下行连接的处理（服务每 15 秒发一行保活，`server.stream_keepalive_ms`）；机器停转后再启动的耗时。
