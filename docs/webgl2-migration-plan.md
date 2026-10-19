# WebGL2 分阶段迁移计划(2026-08-18 评估定稿)

## 背景

Canvas2D 常驻面(chunk 画布 384×~1MB + 小地图 80MB + tintCache 族 + 合成器表面)
吃的是 Chrome 的**每进程画布内存配额**,不是物理 GPU——双开窗口共享配额直接
打爆(contextlost 抖动环,见 imagebitmap-root-cure.md 第九台)。迁移目标:
把"整图离屏烘焙/每帧全屏乘法/整幅缩放采样"三类工作移入 WebGL2 纹理+quad,
同时保持逐像素视觉零差。

## 前置事实

- 主画布 `getContext('2d')` 默认 `alpha:true` → GL 层可垫底/可离屏合成,不动现有 2D 链绘制顺序
- `BiomeBackground.tintCache` 键含 `tint.toFixed(2)`,天色连续变化 → 晨昏期每新 tint 一次 2048px 整图 multiply + 64 条 clear 重建循环(预算+CPU 双重负担)
- 全屏地图是独占视图(Renderer :1977 `return`),迁移不需与世界层交错
- M 系列 GL MAX_TEXTURE_SIZE=16384,大世界 8400×2400 小地图可整张入纹理

## 排名表(代价↓收益↓风险↓)

| # | 目标 | 迁移内容 | 内存收益 | 带宽/CPU | 成本 | 视觉风险 |
|---|------|---------|---------|----------|------|---------|
| 1 | 背景层族(BiomeBackground) | ImageBitmap 一次 texImage2D;tint→shader uniform;视差/带序公式原样 | tintCache 峰值 ~300MB→0 | 每帧 5 次全屏乘法层消失;晨昏 churn 消失 | ~1.5 天 | 低(乘法可对拍) |
| 2 | 全屏地图视图 | 地图内容+迷雾=纹理 quad;NEAREST/LINEAR 按 zoom 切换 | 0 | 残项#3 归零(每帧 33M 采样) | ~1 天 | 极低(过滤 1:1) |
| 3 | 小地图后备存储 | 拆带构建直写 GL 纹理(R8 调色板/RGB565),2D 画布退役 | 80MB→20~40MB/窗口 | 持平 | ~2 天 | 中(565 渐变带状风险) |
| 4 | 天空渐变层 | 全屏三角+每像素渐变 shader | 小 | 小 | ~0.5 天 | 极低 |
| ✗ | chunk 烘焙+光照合成+实体粒子 | =渲染器 v2 本体 | 最大头 | 最大头 | 数周 | 高(超采样/双线性语义) |

## 实施形态(一期 #1+#2)

- **共享模块 `src/render/GLSpriteLayer.ts`**(前置投资):离屏 WebGL2 画布 +
  纹理缓存(LRU)+ `quad(texKey, src, dst, {alpha,tint,rot,smooth})` API;
  两个 sampler 对象(NEAREST/LINEAR)按次绑定;输出预乘
  (blend ONE/ONE_MINUS_SRC_ALPHA)与 canvas 合成语义一致;
  调用方在原 2D 链的同一时序 `ctx.drawImage(glCanvas)` 单次合成——
  层序/透明度/遮挡关系零改动。
- **#1**:BiomeBackground 引擎无关化(内部 Blitter 接口,2D/GL 双实现,
  同一份几何/视差/带序数学),`?bggl=0` 逃生门。
- **#2**:drawFullMap 的 背景+卷轴+地图内容+迷雾 四段走 GL,标记/头像/
  文字留 2D;小地图纹理按 dirtyChunks 子区 texSubImage2D 增量上传,
  `?mapgl=0` 逃生门。
- **验收**:像素 diff 探针——同种子同时刻开关逃生门各截帧逐像素对拍
  (灰度差≤1);性能由 trace 复核(残项#3 消失)。

## 预算账(双开)

#1+#2 ≈ 每窗口 -300MB+(tintCache 退役),双开 -600MB+;补 #3 再 -100MB+
——目标是双开免旗标。渲染器 v2(chunk 烘焙/光照)立项另议,不夹带。

## 待办登记(2026-08-19 双开 IOSurface 压基数,第二批)

- ~~**#A CloudGL 并入 GLSpriteLayer**~~ ✅ 已落地(2026-08-19 午后):CloudGL.ts
  退役;SkyRenderer.cloudGlLayer 由 Renderer 每帧注入共享 glfx(bggl/cloudgl 两门
  任一开即获取);quad 几何从"中心+半宽高"换算为"左上+宽高",色/α/rot/flip
  经 QuadOpts(tint+alpha+rot+smooth+flipX——flipX 为本次给 GLSpriteLayer 新增的
  u 镜像)。验证:weatherCounter 到期重掷后 13 张 cloud: 纹理进共享层,vclouds
  35+ 正常渲染;`?cloudgl=0` 2D 兜底与 cpuRender 注入 null 语义保留。每窗再省
  1 个 WebGL 上下文+全屏背板(≈3-4 张 surface)。
- **#B 全屏地图纹理封顶/降采样**(崩溃日志 3040×448 级):仅开图时存在,可按
  maxTextureSize/预算分块或降采样,开图略糊。风险低,优先级最低。
- 已落地第一批:MAX_CHUNKS 384→192(-24 张/窗)、防御盾 canvas→img dataURL
  (-2 张/窗)、TintAtlas 染色图集(战斗态 1024→≤4 张)。
