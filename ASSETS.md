# 资产与第三方材料声明(ASSETS.md)

> 本文件界定本仓库中**不属于本项目作者所有**的材料。代码本体按 [LICENSE](LICENSE)(MIT)
> 授权;下述材料的权利归属各自的原权利人,**不包含在 MIT 授权范围内**。

## 1. Terraria 游戏资产 —— © Re-Logic

| 位置 | 内容 | 说明 |
|---|---|---|
| `public/sprites/vanilla/`、`public/sprites/vanilla-ui/`、`public/sprites/portraits/` | 贴图(物块/NPC/弹幕/UI/头像,共 ~1.3 万件) | 从 Terraria 1.4.5.x 客户端提取 |
| `public/sounds/`(源:`assets-src/sounds/*.wav`) | 音效(863 件,已转码 Opus) | 同上 |
| `public/audios/music/` | 游戏原声 BGM | 同上 |

- **权利归属 Re-Logic**。本项目以复刻学习为目的提取并随源码分发,仅供**个人学习、
  研究、非商业使用**;
- 本项目作者**未**获得 Re-Logic 的任何授权,亦无权就上述资产授予任何人任何许可;
  若您是权利人并希望本项目移除相关资产,请提出 issue,将在第一时间配合处理;
- 任何将上述资产用于商业目的的行为,均不在本项目授权范围内,风险自担。

## 2. 反编译数据表 —— 源自 © Re-Logic 的游戏逻辑

`src/data/vanilla-*.json` 等数据文件(物品/NPC 数值、掉落表、帧表、配方等)系从
Terraria 反编译产物中机械提取,用于实现与原版 1:1 的行为对齐。这些数据是对
Re-Logic 游戏逻辑的派生描述,与资产同样**仅供个人学习与研究用途**,不含在本仓库
的 MIT 授权之内。

> 仓库内不含反编译源码本体;行为基准的对照工作在仓库之外进行。

## 3. 第三方开源组件(各自 license 有效)

| 组件 | 位置 | License |
|---|---|---|
| Fusion Pixel Font(缝合像素字体,TakWolf) | `public/fonts/` | SIL OFL 1.1(全文见 `public/fonts/OFL.txt`) |
| npm 依赖(vite/vitest/fflate/puppeteer 等) | `node_modules/`(不入库) | 各自 package.json 声明 |
| `@sandboxworld/mod-api` 类型包模板 | `templates/npm/` | MIT |

## 4. 开源精神声明

本项目的**全部工程代码**(渲染引擎/世界生成/网络/UI/工具链/测试,~30 万行
TypeScript)以 MIT 自由开放:学习、修改、再分发、嵌入你自己的项目均可,保留版权
声明即可。唯一不可转让的部分是上面第 1/2 节的第三方材料——它们从一开始就不属于
本项目作者。

若您希望制作一个**完全清洁**的衍生分发(剥离全部 Re-Logic 材料、仅保留工程代码),
本项目结构上支持:替换 `public/sprites|sounds|audios` 与 `src/data/vanilla-*.json`
为你自有或已获授权的数据源即可构建运行。
