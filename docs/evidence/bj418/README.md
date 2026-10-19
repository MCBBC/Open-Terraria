# BJ418 证据档案：独眼巨鹿（668 Deerclops）"一闪一闪"定谳刀

日期：2026-09-30 ｜ 状态：已定谳+已修复 ｜ 判别测试：`tests/bj418-deerclops-flicker.test.ts`

## 用户实报

贴图有 bug，**一闪一闪**（先报「攻击时消失」，后修正为「一闪一闪」=间歇性消失/变透明闪烁）。

## 定谳

**根因层 = alpha 面（`deerclopsDrawLayers`，src/render/Renderer.ts:2164+）。**
本仓旧公式 `本体α = Opacity·(1−r²)·(1−num7)` 漏掉了原版 alpha 链中**两次紫影
Lerp 的 alpha 回升**。原版（1457 Main.cs DrawNPCDirect_Deerclops :26714-26800，
XNA Color.Lerp 四通道同插，npcColor.A=255、npc.alpha=0）：

```
A = [(1−num3)(1−r1) + r1]                    ← lai3>0 支(:26742 Lerp(Transparent)后
                                                :26759-26762 Lerp(·,(50,0,160,A=255),r1) 拉回)
  →（ai0∈{7,8}）[(·)(1−num7)+num7]×(1−num7)  ← :26767-26768
```

lai3∈[0,30]（AI_123 远距免伤爬升，NPC.cs:44485-44487，阈值 450px）时 **A 恒
≥0.9543——原版远距态=不透明紫影剪影**（r1→1 时纯 (50,0,160)），从不整段淡出。
本仓漏回升 → 玩家 ≥450px（28.1 格，弓/法/召唤常驻距离）时本体衰减到 **0.3056**；
450px 阈值往返/进退循环 → alpha 1↔0.31 逐拍翻转 = 用户所见闪烁。

闪烁机理三面排除：
- **帧表面**：deerclopsNextFrame idx∈0..24 与 NPC_GRIDS[668]（5×5,perRow 5）全域
  内收，无越界空帧（帧表对账闸+tests/sw-bj51 全绿）。
- **残影/拖影面**：668 不在 projGhostTrail（弹幕 id 域）/npcExtraParts 派发表；
  唯一 ghost=原版 redGhost/purpleGhost，同源于本纯函数，无本体/残影交替绘制面。
- **alphaOf/tint 面**：alphaOf=dust 域；668 无 NPC_STATIC_ALPHA/colorRGBA 静态档，
  spawnAlpha=0 恒定（BJ342 alphaOf 全表与 668 无涉）。

## 落刀

`src/render/Renderer.ts` deerclopsDrawLayers（纯函数）：
- `a1 = lai3>0 ? (1−r2)(1−r1)+r1 : 1`、`a2 = 7/8 态 ? (a1(1−num7)+num7)(1−num7) : a1`、
  `bodyAlpha = opacity·a2`（alpha 链 1:1）。
- rgb 折叠同步精确化：`t1 = 1−(1−num3)(1−r1)`（首段 Transparent lerp 的向黑档），
  `tPurple = 1−(1−t1)(1−num7)`。
- BJ51 三处旧断言把误转录钉成金标（lai3=18→0.75、lai3=30→0.3056、tPurple(lai3=10)
  →0.5），按反编译直读重产（SC2 判例：金标陈旧须 oracle 重产）。

## 测试与变异证据

- `tests/bj418-deerclops-flicker.test.ts`（9 测）：60 拍序列恒定锁——近距恒 ≡1、
  远距爬升窗每拍 ≥0.95（旧式跌 0.3056）、阈值锯齿逐拍 |Δ|<0.02、7/8 消散三角
  曲线逐点锁、红雾/雾层回归锁。
- **变异红**：旧公式回潮 → 7 发全红（bj418 5 + bj51 重产断言 2）。
- 逐字节还原+sha256 对拍 ✓（bak3=56a4015f…，还原后同值，无变异标记残留）。

## 实机验证（私有 vite :5540，scripts/_bj418-flicker.mjs + _bj418-shot.mjs）

- **AI 面在机**：逐帧采样 lai3/dist——远距窗 lai3 0→30 爬升后 hold（B 窗 66 帧
  lai3 25..30、dist 981..1198）；近距窗 lai3 衰减（A 窗 132..189px→0）；锯齿窗
  dist 246..453 往返（C 窗 lai3 0..30 全摆）。
- **视觉对拍**（同语义 lai3=30、dist=551、ai0=0 两轮，唯一差异=修复行）：
  - `far-hold-fixed.png`：本体=**实心不透明紫影剪影**（原版本相）。
  - `far-hold-mutated.png`（旧公式注入）：本体=**~30% 半透明幽灵**（树影透体，
    即用户实报的「消失/一闪一闪」）。
  - 注：两轮世界种子不同，全幅像素差统计不可比（地形/时辰噪声），以剪影形态
    定性对拍为准。
- **探针边界（登记）**：ctx 级逐拍 alpha 序列不可靠——r.ctx 为逐访问瞬态面
  （一次会话 627 个实例）+GPU 批管线/批量回放，drawImage/globalAlpha 钩子均
  只能观测到烘焙内部绘制（插桩自捕伪影，BJ328 判例族）。alpha 序列判别由纯
  函数级 60 拍锁承担；E2E 层以同语义视觉对拍+AI 面序列佐证。

## 新登记债

1. **BJ418-债1**：7/8 消散中段 rgb 未乘末段 ×(1−num7)（原版 color2×(1−num7) 整体
   乘 rgb+alpha；本仓只折 alpha）——消散中段紫影亮度略偏高，视觉面窄（仅
   ai0∈{7,8} 且 num7∈(0,1) 窗），不影响闪烁判据。
2. **BJ418-债2**：render-v2 的 ctx 访问面为逐访问瞬态（627 实例/会话），外部
   插桩无法稳定钩到绘制面 globalAlpha——后续需要绘制级取证时应由 render-v2
   暴露受控观测口（spf/trace 面同源）。

## 边界声明

- 修复面仅 deerclopsDrawLayers 纯函数与 BJ51 陈旧 oracle 三处重产；668 AI/
  弹幕/音效/帧机零触碰。并行会话 C13b（液体批钩）同文件改动按盘上最新内容
  保留（bak2/bak3 sha 链可溯）。
- 450px 阈值语义（远距免伤 ramp + 紫影化 + 红雾）为原版本相，本刀只修
  「紫影化被错绘成半透明淡出」；原版远距免疫（lai3=30 dontTakeDamage）不变。
