# 光照引擎备份

`LightingEngine.legacy.bak.ts` — 原自制 BFS 光照引擎(2026-08-10 备份)。

已被 Terarria1456(`Terraria.Graphics.Light/`)LightingEngine/LightMap/TileLightScanner 的
1:1 移植替代(见 src/lighting/ 新模块)。

**回滚方式**:将本文件内容还原回 `src/lighting/LightingEngine.ts` 并删除新模块文件
(FastRandom/lightTables/SkyColor/TileLightScanner/LightMap)。
注意:回滚时还需恢复 `Renderer.compositeLight` 的 0.78 gamma LUT 与 amb=10 环境光底。
