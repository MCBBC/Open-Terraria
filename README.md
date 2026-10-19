# Open Terraria

一个完全开放的 Terraria 1.4.5.8，历经70天，总消耗1238亿Tokens，其中GLM-5.3贡献477亿，GLM-5.3-Flash贡献761亿，使用Claude Code作为Vibe Coding工具。

未基于任何游戏引擎，完全基于Web平台原生实现，采用 Canvas 2D + WebGL2 混合渲染管线，部分模块采用Web Worker并行化处理或编译为WebAssembly以提升性能。

人类不写代码只发指令，我发送了7827条指令，会话数达到124个，使用1484个子代理

Agent侧产生了112338条消息，工具调用数量达36815次

150 万行 TypeScript（引擎 47 万手写 + 数据定义 2 万 + 测试 45 万 + 探针工具 46 万 + mod 参考实现 5.5 万），2600+ 测试用例，全部开发过程有逐日开发日志（[docs/devlog/DAILY_DEVLOG.md](docs/devlog/DAILY_DEVLOG.md)）存档。这个仓库本身，就是这场人机协作实验的完整记录。

## 在线地址

[sandboxworld.online](https://sandboxworld.online)

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