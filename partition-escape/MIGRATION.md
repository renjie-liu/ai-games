# 导入与离线验收

目标：将隔墙游戏放到 `renjie-liu/ai-games/partition-escape/`，仍复用独立 `ai-gaming` harness。旧目录保持原样。本次不扩玩法，不更改规则、权限、提示词或命令解析。

## 来源与调整

- 游戏源码：`ai-gaming@a2952a4c1372169535c3b05cd30c31152e67640f`，原路径 `prototypes/partition-escape/`；60 个导入文件的原始 SHA256 见 `IMPORT.json`。
- Harness：验证源码与 `65d0749207965af98819a8dd2f222478b0795f56` 的 `src`/`config` 树相同。harness 本体不导入。
- 新增统一路径配置：默认并列 `ai-gaming` checkout，也支持绝对 `PARTITION_HARNESS_ROOT` 与 `PARTITION_PYTHON`。修正服务、worker、启动器及离线测试的路径。
- 新目录不含任何旧额度账本。Live 和旧模型 smoke 缺少授权时拒绝，不自动初始化；已消费授权的负例用人工构造的临时 fixture 验证，不携带用户原记录。
- 规则、权限投影、动作协议、3D 页面和静态素材与原版文件哈希一致。7 个 Python 文件只去除多余末尾空行，包含策略文件；没有逻辑变化。路径/授权适配与纯格式文件分别列在 `verification/results.json`。
- 未导入密钥、`.runs`、`.live`、`.voice`、模型账本、私人配置、原始轨迹或历史复审包。新增验证记录只含公开摘要和离线测试输出。

## 本次实际验证

| 检查 | 结果 |
| --- | --- |
| Node | 49/49 |
| Python | 82/82 |
| 四种人／脚本组合，正常 harness 与 HTTP 权限 | 4/4 通关 |
| mock TTS HTTP、缓存、暂停与停用 | 通过，外部请求0 |
| 默认并列目录 `npm run start:local` | 健康检查通过，6个页面/静态资源200，Live和TTS关闭 |
| 离线 Live fixture | 提示音9600字节；查看经过harness，房间rev 1→2 |
| 新目录自动额度 | 未创建，真实剩余额度0 |
| 旧目录账本 | SHA256与迁移前一致 |

对应日志与校验见 `verification/`。这里的 Live 是明确标记的 fixture，不是新的真实音频／模型测试。真实模型请求0，麦克风采集0。没有重跑旧版30局稳定性测试，未宣称真实合作或真人语音体验通过。

## 复核与边界

按 README 的离线命令复跑即可，不需要 API key。测试只允许 loopback 游戏服务或 mock provider。新 checkout 不代表任何付费授权；不要重建账本取得请求名额。

本目录通过草稿PR提交，仍需独立评审后才能合并。旧 `ai-gaming` 原型何时删除、后续授权如何迁移均不在本次范围。
