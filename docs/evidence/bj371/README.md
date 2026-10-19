# BJ371 剃刀台风 409（2622）定谳探针截图归档

归档自 `/tmp/bj371/`（2026-09-29 清偿刀 C 执行，/tmp 挥发性）。伴跑探针：
`game/scripts/_bj371-typhoon-verdict.mjs`（M1 页内 tintedTex 微测 + M2 实机连发
对拍）与 `game/scripts/_bj371-typhoon-shot.mjs`（实机复查），经
`node tools/run-diag.mjs` 驱动（SW_ORIGIN 私有实例）。定谳与判别面见
`game/tests/bj371-typhoon-409.test.ts` 头注（三症状：白底半透明大方块 / 缺旋转 /
缺尾迹粒子；修 = tintedTex flatten=false + GHOST_TINT[409] + bodyAlpha + 子步节拍
块旋转/缘尘）。

## 文件清单

| 文件 | 内容 |
| --- | --- |
| `typhoon-17904882137*.png` ×6（13:50 两批三连） | 修前复现跑实机连发截图（探针早期版本时间戳命名）——白底半透明大方块病灶面 |
| `crop0.png` / `crop1.png`（13:51） | 修前批人工裁切（弹域放大对拍用） |
| `v2crop0-2.png`（13:54） | 中间轮裁切 |
| `typhoon-v2-0/1/2.png`（14:05，verdict 探针 `:169` 直出） | 定谳 v2 轮 M2 三连（freezeClock 正午、日间空旷天空连发 409） |
| `after1.png` / `after2.png`（14:05） | 修后裁切对拍 |
| `typhoon-live-0/2.png` + `typhoon-live-0/2-crop.png`（14:06，shot 探针 `:63` 直出） | 修后实机复查轮 + 弹域裁切 |
| `disc-zoom.png` / `disc-zoom2.png`（14:07） | 残影盘（GHOST 拖影）放大检查 |

## 与定谳的关联

- 修前批（13:50 + crop）：症状①白底半透明大方块物证（M1 定谳 =
  tintedTex(flatten=true) 对透明底贴图把透明域 multiply 填成不透明白，
  srcOpaquePx 5028→13872 页内微测）。
- v2/after/live 批（14:05-14:07）：修后同面复拍 = 白底消失、旋转与尾迹粒子在位
  （M2 对拍亮度/白像素/spinRot/d217 尘计数数值面在探针 stdout 录，测试
  bj371-typhoon-409 判别面为正式行为锁）。

## 备注

- `arrow.bak` / `pgt.bak`（Arrow.ts / projGhostTrail.ts 修前源码快照）非截图，
  未归档（git 历史可考）。
- 截图为探针伴跑产物（headless Chrome 抓帧），色彩经 GL 页面预乘层，仅作物证
  参考，不作像素级金标。
