# SandboxWorld

Terraria 1.4.5.8 的浏览器复刻(TypeScript + Canvas + Vite),单文件零安装即玩,
桌面壳(Electron)同仓支持。反编译源码为唯一行为标杆。

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

## 技术栈

TypeScript · Canvas 2D + WebGL2 混合渲染 · Vite · vitest · Electron(桌面壳)·
Web Worker(世界生成/烘焙/存档三池)· IndexedDB(KvStore 持久层)
