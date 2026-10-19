# Open Terraria

一个完全开放的 Terraria 1.4.5.8，历经70天，总消耗1238亿Tokens，其中GLM-5.3贡献477亿，GLM-5.3-Flash贡献761亿，使用Claude Code作为Vibe Coding工具。

未基于任何游戏引擎，完全基于Web平台原生实现，采用 Canvas 2D + WebGL2 混合渲染管线，部分模块采用Web Worker并行化处理或编译为WebAssembly以提升性能。

人类不写代码只发指令，我发送了7827条指令，会话数达到124个，使用1484个子代理

Agent侧产生了112338条消息，工具调用数量达36815次

## 在线地址

[sandboxworld.online](https://sandboxworld.online)

## 项目历程

起初，我只是对尚未发布的GLM-5.3的预览版本进行性能测试，复刻一个 Terraria 游戏是我给它的第一个挑战性任务，初版源码仍可从仓库的首次提交获得，当时已经获得相当不错的表现。

这使得一个疯狂的想法在我的脑海中萌生：在不基于任何游戏引擎的情况下，把最新的 Terraria 完整的1:1的搬上网页中游玩？

此前虽然已有先行者基于fna-wasm-threads实现原版Terraria载入，但我认为它应该在开发者更活跃的平台上运行，特别是在后Vibe Coding时代，一个活在Web平台开放运行的Terraria也许会迸发出更有趣的火花。

在第一阶段里，我们尝试了基于TEdit（一款Terraria地图编辑器）源码+原版多个存档的方式，逐Tile还原存档的世界地图，我们导入存档可以获得一个地图上长得很像原版的东西，但这还远远不够，TEdit本质上不包含世界生成、AI、游戏机制等等，所以我们开始对反编译源码下手，起初并不打算直接解包反编译我Steam目录下的Terraria，所以直接采用了Github上一个Terraria1405的源码，进行逐功能移植，后来我们发现该源码仍缺失各类NPC、怪物、弹幕等的AI行为代码后，改为锚定本机原版1.4.5.6的反编译源码

我们基于数个种子生成的世界建立金标流程，用于实现C#-JS的世界生成实现的逐格一致，由于跨语言平台的语法与数据底层存在极大的差异，需要通过大量的自动化测试一步步建立金标。

为了实现在网页这种资源分配极为紧张的环境中进行大型2D游戏内容的渲染，AI逐步建立了一套自研的 Canvas 2D + WebGL2 混合渲染引擎：chunk 静态烘焙、逐格脏标记光照、液体增量元胞自动机、插值动画系统、支持120fps，后来又把世界生成、烘焙、光照、存档三座大山搬进了 Web Worker。渲染不对的时候就去反编译里找答案，原版怎么画，我们就怎么画，滤镜的效果以字节码级别反汇编为准。性能的仗一场一场打，逐个热点消灭，文字渲染、光照引擎、雨滴批渲染、四柱 Boss 掉帧，每一刀都要求改前改后逐像素或逐字节可证。

8月底Steam静默升级了原版到1.4.5.8，把本地真值源也顶上去了，把 1.4.5.8 的全量反编译立为最终唯一行为标杆，配了数据对账双闸门和 3600+ 用例的测试矩阵，立下**先定谳，再动刀**的铁律，确保任何修复先有机制级证据，改完必过独立复核。36/36 全种子逐格一致的认证打完，才能算复刻到位。

后来具有原生多模态的GLM-5.3-Flash杀入，让我们具备了更多视觉探针和输入图像的调试能力，使整体功能质量获得极大提升。

我们这套流程里比较有意思的一环是**红蓝对抗**：让一个 AI 子代理去修，再派另一个独立的红队子代理专职攻击这次改动——找回归、找边界、找修复者自己都没意识到的副作用，发现的问题按 CONFIRMED/PLAUSIBLE 分级定谳，攻击了什么、为什么没打穿要写进报告。AI 写的代码让 AI 自己来审，比人审更深刻，红队翻过的案（连修复者引用的行号都能查出漂移）比比皆是。很多诡异 bug 的真相，就是在这种自己人打自己人的对抗里被逼出来的。

接着项目 beta 上线了。真实的玩家、真实的机器、真实的报障潮暴露了缓存生命周期、SW 更新、边缘节点等工程问题。version 一路从 0.1.x 迭代到 0.1.7x，背包 UI 推倒重做成原版 1:1，资产分片走上CDN。最近战场又转向了 mod 生态：目标是正确驱动 tModLoader 那边的灾厄Mod。

70 天，150 万行 TypeScript（引擎 47 万手写 + 数据定义 2 万 + 测试 45 万 + 探针工具 46 万 + mod 参考实现 5.5 万），2600+ 测试用例，全部开发过程有逐日开发日志（[docs/devlog/DAILY_DEVLOG.md](docs/devlog/DAILY_DEVLOG.md)）存档。这个仓库本身，就是这场人机协作实验的完整记录。

## 快速开始

```bash
npm install
npm run dev          # http://localhost:5199
npm test             # vitest 全量(2600+ 用例)
npm run build        # 产物 dist/
```

## Mod 开发

**→ 完整指南:[docs/mod-dev-guide.md](docs/mod-dev-guide.md)**

10 分钟从零做出第一个 mod(脚手架/L1 声明式内容 15 域/L2 脚本 API 总表/
浏览器独有六接口/实战示例/发布):

```bash
node scripts/mod-cli.mjs init mods/my_mod --ts   # TypeScript 入口(缺省=JavaScript)
node scripts/mod-cli.mjs validate mods/my_mod    # 校验
node scripts/mod-cli.mjs build mods/my_mod       # → mods/dist/my_mod.swmod
```

- 接口类型签名(IDE):[templates/mod-api.d.ts](templates/mod-api.d.ts)
- Boss mod 工作流:[docs/howto-boss-mod.md](docs/howto-boss-mod.md)
- 城镇 NPC mod 工作流:[docs/howto-town-npc-mod.md](docs/howto-town-npc-mod.md)
- 平台设计定谳:[docs/mod-loader-design.md](docs/mod-loader-design.md)
- 参考实现:`mods/`(rivals=双 Boss AI / glmgirl=城镇 NPC / calamity=全量转译 /
  magic-storage=tile entity / lights-and-shadows=screenFx)

## 文档

| 域 | 文档 |
|---|---|
| Mod 开发(入口) | [docs/mod-dev-guide.md](docs/mod-dev-guide.md) |
| 迭代方法论 | [docs/methodology/campaign-playbook.md](docs/methodology/campaign-playbook.md) |
| 架构定谳史 | [docs/](docs/)(按域归档;战役实录见各 recon/wave 文档) |

## 许可证

**工程代码以 [MIT](LICENSE) 授权**;仓库内的游戏资产(贴图/音效/BGM)与
反编译数据表属 © Re-Logic,不在 MIT 范围内,仅供个人学习与研究——
边界详见 [ASSETS.md](ASSETS.md)。

## 技术栈

TypeScript · Canvas 2D · WebGL2 · Vite · vitest · Web Assembly · Web Worker