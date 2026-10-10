// ★BJ603 tileGlowMask 运行时叠画扫描（TileDrawing.cs:1196-1341 DrawBasicTile 尾段）。
//
// 设计：视口逐格扫描（drawTileFlames 同款遍历域），命中 TILE_GLOWMASK 表的格
// 产出 op 计划（tex+源矩形+dest+blend/tint/alpha），由 Renderer 收进 itemGlowQueue
// 合成后冲刷（光罩色不取光照=自发光,合成后逃逸判例域——BJ509/BJ597/BJ601 同槽）。
// 源矩形 = 本体同矩形：vframeAt 基框 + drawAdjust（410/480/509/657/720/721/725/658
// 带门动画同本体侧）+ 390/708 无门 addFr（animYOffset）+ 429/445 专支（本体纹理
// +addFrY=18 辉光行）。dest = x*16, y*16+tileTop（tileDrawYOffsetOf 权威表）。
//
// 登记偏差（本刀明示）：
//  R1 坡面切条叠画未移植——斜坡锤型照画全格矩形（vanilla :1336-1341 八条 2px 切条
//     同本体）；半砖已按 vanilla（下半位 16×8）。
//  R2 633 finalColor ≈ lightAt 采样点=格左上（vanilla GetFinalLight 带色 tint 面
//     未建模,涂漆灰烬草登记）。
//  R3 129 已由 BJ118① 域迁入本扫描（★BJ621 2026-10-10 迁层）：原版 tile 129 全域
//     绘制色固定覆写 GetFinalLight（本体层 finalColor=白100（碎块）/Transparent（凝胶，
//     不画）+glow 段 color2 独立（:1281-1318））=【自发光不吃光照】；BJ118① 曾把
//     α100 基底+白模带画进 drawVanillaCell（世界层）→ 被合成乘光吃暗 = 用户实报
//     「明胶水晶很半透，原版不是半透的」真凶。迁入后走 itemGlowQueue 合成后冲刷
//     （免光照,与 glow mask 全族同槽）;R3 原「跳过防双画」由 drawVanillaCell case 129
//     摘除+drawAnimatedTileLayer skip 129 承担。209 本仓传送门=实体通道,条目休眠。
//  R4 glow tile 暗格剔除豁免面（:980 flag 并入——glow tile 不 DrawBlack）烘焙侧
//     未接（黑底绘制面属 ChunkBake DrawOwnBlacks 域,本刀不动）。
import type { SpriteAtlas } from '../assets/SpriteAtlas';
import type { TileStore } from '../world/TileStore';
import { TILE } from '../core/constants';
import { TILE_DEFS } from '../data/tiles';
import { TILE_GLOWMASK, tileGlowKind, tileGlowColors, lavaLightA, WHITE_A100 } from '../data/vanillaTileGlow';
import type { RGBA } from '../data/vanillaTileGlow';
import { xnaColorToOp } from '../data/vanillaItemGlow';
import { drawAdjust, tileDrawYOffsetOf, shardGlowTint, shardGlowClock, SHARD_BASE_ALPHA } from './VanillaTiler';
import { animYOffset, crystalShardAddFrX } from './TileAnim';
import { visEffectFrames } from '../entities/Enemy';

/** op 计划（与 Renderer.itemGlowQueue 单元结构同形——收集侧纯计划,零跨拍 img 持有） */
export interface TileGlowOp {
  tex: string; sx: number; sy: number; sw: number; sh: number;
  dx: number; dy: number; blend: 'add' | 'over'; tint: [number, number, number]; alpha: number;
}

/** ★BJ621（2026-10-10）tile 129 水晶碎块/明胶水晶 op 生成（TileDrawing.cs 绘制链 1:1 纯函数）。
 *  原版语义钉死（免光照——固定色覆写 GetFinalLight,终案锚）：
 *   · :1101-1118 finalColor 段 case 129：`finalColor = new Color(255,255,255,100)`（碎块域）
 *     /`fx>=324 → Color.Transparent`（凝胶域本体层不画）；**vector 抖动全域生效**：
 *     fy<36 → vector.Y += 2×(fy==0 ? +1 : -1)；else → vector.X += 2×(fy==36 ? +1 : -1)。
 *   · :1196-1341 glow 段（GlowMask 层,在 DrawBasicTile(:1527) 本体主绘【之前】）case 129：
 *     碎块域 flag3=true 跳过；凝胶域 4×白模带
 *     （src=(fx+addFrX, fy+addFrY+72),调制=hslToRgb(0.7+sin(2π·GTW·0.16+x·0.3+y·0.7)×0.16,1,0.5),
 *     A/=2×0.3=38,dest=vector±(2,0)/(0,2) 四向）→ 尾笔 color2=(255,255,255,100) 本体帧
 *     （src=(fx+addFrX, fy+addFrY),dest=vector）——**辉光先/本体后**（红蓝-G② 同序）。
 *   · TileBatch.Begin blend=null=XNA 默认 AlphaBlend（TileBatch.cs:215-223）——4 白模带
 *     =source-over α 混合（非加色）;blend='over' 同构。
 *   · 本体层主绘（DrawBasicTile :1543）用 finalColor：凝胶域 Transparent 不画;碎块域
 *     白100——**不含光照色**（GetFinalLight 结果被覆写）→ 全域自发光免光照。
 *  迁层真凶（BJ621）：BJ118① 曾把等价像素画进 drawVanillaCell（世界层）→ 本仓合成乘光
 *  管线吃暗 → 凝胶格「半透+暗」（用户实报原版不半透）。
 *  @param fx frameX（碎块域 0..306 / 凝胶域 324..414+addFr 动画在函数内消费）
 *  @param fy frameY 方向带 0(站)/18(垂)/36(右锚)/54(左锚)——抖动由此内置
 *  @param tileX tileY 格坐标（dest=格×16+抖动;129 无 tileTop 覆盖=0 锚注） */
export function crystal129Ops(
  fx: number, fy: number, tileX: number, tileY: number, clockSec: number,
): TileGlowOp[] {
  const isGel = fx >= 324;
  // 抖动（:1105-1116 verbatim,全域生效）
  const jx = fy >= 36 ? (fy === 36 ? 2 : -2) : 0;
  const jy = fy < 36 ? (fy === 0 ? 2 : -2) : 0;
  const dx = tileX * 16 + jx;
  const dy = tileY * 16 + jy;                // tileTop=0（case 129 无 tileTop 改动,锚注）
  const ops: TileGlowOp[] = [];
  if (isGel) {
    const addFx = crystalShardAddFrX(fx);
    const tint = shardGlowTint(clockSec, tileX, tileY);   // [r,g,b,38]（A/=2×0.3 verbatim）
    for (const [ox, oy] of [[2, 0], [0, 2], [-2, 0], [0, -2]] as const) {
      ops.push({
        tex: 'vanilla/Tiles_129.png', sx: fx + addFx, sy: fy + 72, sw: 16, sh: 16,
        dx: dx + ox, dy: dy + oy, ...xnaColorToOp(tint),
      });
    }
  }
  // 本体笔：凝胶域=glow 段尾笔（:1313 color2=白100）;碎块域=本体层（:1103 白100+抖动）
  // ——同调制 (255,255,255,100) 免光照;凝胶域本体层 Transparent 不画（无此笔本体层）。
  ops.push({
    tex: 'vanilla/Tiles_129.png', sx: fx + (isGel ? crystalShardAddFrX(fx) : 0), sy: fy, sw: 16, sh: 16,
    dx, dy, blend: 'over', tint: [1, 1, 1], alpha: SHARD_BASE_ALPHA,
  });
  return ops;
}

export interface TileGlowEnv {
  tVis: number;
  gtwh: number;
  discoRGB: readonly [number, number, number] | null;
  lightAt(tx: number, ty: number): [number, number, number] | null;
  noirOpacity: number;
}

/** 视口扫描主口（Renderer tile 层后调用;ops 交 Renderer 打包进 itemGlowQueue）。
 *  emit 每命中格调一次（0..n 个 op）;调用方捕获当帧矩阵一次即可（同一扫描窗）。 */
export function drawTileGlows(
  atlas: SpriteAtlas, st: TileStore,
  tx0: number, ty0: number, tx1: number, ty1: number,
  env: TileGlowEnv,
  emit: (ops: TileGlowOp[]) => void,
): void {
  const tVis = env.tVis;
  const glowImgCache = new Map<number, ImageBitmap | HTMLImageElement | null>();
  const glowImgFor = (gm: number) => {
    let im = glowImgCache.get(gm);
    if (im === undefined) {
      im = atlas.ensureVImage(`vanilla/Glow_${gm}.png`) ?? null;
      glowImgCache.set(gm, im);
    }
    return im;
  };

  for (let x = Math.max(1, tx0); x <= Math.min(st.w - 2, tx1); x++) {
    for (let y = Math.max(1, ty0); y <= Math.min(st.h - 2, ty1); y++) {
      const i = st.idx(x, y);
      if (!st.flags[i]) continue;
      const type = st.type[i];
      const sheet = TILE_DEFS[type]?.vanilla?.sheet ?? -1;
      const gm = sheet >= 0 ? TILE_GLOWMASK[sheet] : undefined;
      if (gm === undefined) continue;
      const kind = tileGlowKind(sheet);
      if (kind === 'invisible') continue;                            // 718 零贡献
      const fx = st.frameX[i];
      const fy = st.frameY[i];
      if (kind === 'crystal129') {
        // ★BJ621 迁层支（:1101-1118/:1276-1318 verbatim,语义见 crystal129Ops 注）：
        // 全域自发光免光照;抖动内置;白模带越界防御（fy=54 时 sy+72+16=142≤144 恰满）。
        const img = atlas.ensureVImage('vanilla/Tiles_129.png') ?? null;
        if (!img || img.width < 432 || img.height < 144) continue;
        if (fy + 72 + 16 > img.height) continue;                     // 白模带越界防御（方向带域外）
        emit(crystal129Ops(fx, fy, x, y, shardGlowClock()));
        continue;
      }

      // ---- 源矩形（本体同矩形：基框+drawAdjust 带门动画;429/445 专支换本体纹理行） ----
      const selfTex = kind === 'selfTexRow18';
      const glowImg = selfTex ? atlas.ensureVImage(`vanilla/Tiles_${sheet}.png`) ?? null : glowImgFor(gm);
      if (!glowImg || glowImg.width <= 0 || glowImg.height <= 0) continue;
      let sx = fx;
      let sy = fy;
      let sw = 16;
      let sh = 16;
      if (selfTex) {
        // :1287-1291 case 429/445：drawTexture=本体纹理,addFrY = 18（平赋值）——
        // 辉光行 = 源 fy+18（Tiles_429/445 双行布局:0..16 本体/18..34 辉光）
        sy = fy + 18;
        if (sy + sh > glowImg.height) continue;
      } else {
        // 基框 = vframeAt 网格校验 + drawAdjust（带门动画同本体侧——410 fy≥56×56 /
        // 480/509/657/720/721/725 fy≥54×54 / 658 ×54+变体基）
        const base = atlas.vframeAt(sheet, fx, fy);
        if (!base) continue;
        sx = base.sx; sy = base.sy; sw = base.sw; sh = base.sh;
        const adj = drawAdjust(sheet, fx, fy, x, y, glowImg.width, glowImg.height, st, st.w);
        if (adj.sx !== undefined) sx = adj.sx;
        if (adj.sy !== undefined) sy = adj.sy;
        if (adj.sw !== undefined) sw = adj.sw;
        if (adj.sh !== undefined) sh = adj.sh;
        // 390/708：无门 addFr（GetTileDrawData case 390=tileFrame×36 / 708=×90,
        // drawAdjust 无 case→手动叠加;sheet 高=glow 表高）
        if (sheet === 390 || sheet === 708) {
          sy = fy + animYOffset(sheet, glowImg.height);
        }
        // 129 横向带（crystalShardAddFrX）——BJ118 已承担,此处不可达（上方 continue）
        if (sx + sw > glowImg.width || sy + sh > glowImg.height) continue;
      }

      // ---- dest（vanilla vector = tilePos − num5 + tileTop;halfBrick 下半位） ----
      const top = tileDrawYOffsetOf(sheet, fx, fy);
      let dx = x * TILE - (sw - TILE) / 2;    // num5 = (tileWidth-16)/2（无 DoNotAdjust 成员）
      let dy = y * TILE + top;
      if (st.half[i] && st.slope[i] === 0) {
        // :1332-1335 halfBrick 支：rectangle 高 −8、vector.Y +8（上半纹理画下半位）
        sh = Math.max(1, sh - 8);
        dy += 8;
      }
      // R1 登记偏差：slope 锤型照画全格矩形（vanilla 八条切条）

      // ---- 色式 ----
      const light = kind === 'ashGrass' ? env.lightAt(x, y) : null;
      const lavaA = kind === 'lavaCloud'
        ? lavaLightA(x, y, tVis, solidAt(st, x, y - 1))
        : null;
      const disco = kind === 'discoMoss' ? env.discoRGB : null;
      let colors: RGBA[] = tileGlowColors(sheet, {
        x, y, frameX: fx, tVis,
        discoRGB: disco,
        light, lavaA,
        noirOpacity: env.noirOpacity,
      });
      if (kind === 'noir') {
        // :1343-1355 Noir 专支：opacity 门 + 眼格判定（fx%36==0 && fy==54）+ 整幅
        // Glow_371 眼位画（flag3=true=无标准尾画）→ 色乘 opacity、几何整替
        if (env.noirOpacity <= 0 || fx % 36 !== 0 || fy !== 54) continue;
        const c = WHITE_A100;
        colors = [[
          Math.trunc(c[0] * env.noirOpacity), Math.trunc(c[1] * env.noirOpacity),
          Math.trunc(c[2] * env.noirOpacity), Math.trunc(c[3] * env.noirOpacity),
        ]];
        const w = glowImg.width;
        const h = glowImg.height;
        const ops: TileGlowOp[] = colors.map((c2) => {
          const o = xnaColorToOp(c2);
          return {
            tex: `vanilla/Glow_${gm}.png`, sx: 0, sy: 0, sw: w, sh: h,
            dx: x * TILE + 16 - w / 2, dy: y * TILE + top + 24 - h / 2,
            ...o,
          };
        });
        emit(ops);
        continue;
      }

      const ops: TileGlowOp[] = colors.map((c) => {
        const o = xnaColorToOp(c);
        return { tex: selfTex ? `vanilla/Tiles_${sheet}.png` : `vanilla/Glow_${gm}.png`, sx, sy, sw, sh, dx, dy, ...o };
      });
      emit(ops);
    }
  }
}

/** WorldGen.SolidTile 近似（LavaLightA :869 消费面）：active+tileSolid+非半砖+非坡。 */
function solidAt(st: TileStore, x: number, y: number): boolean {
  if (!st.inBounds(x, y)) return false;
  const i = st.idx(x, y);
  if (!st.flags[i]) return false;
  const d = TILE_DEFS[st.type[i]];
  return !!d?.solid && !st.half[i] && st.slope[i] === 0;
}

/** env 工厂（Renderer 侧依赖注入省样板;测试直构） */
export function tileGlowEnvFrom(atlas: SpriteAtlas, st: TileStore, over: Partial<TileGlowEnv> = {}): TileGlowEnv {
  void atlas; void st;
  return {
    tVis: over.tVis ?? visEffectFrames(),
    gtwh: over.gtwh ?? 0,
    discoRGB: over.discoRGB ?? null,
    lightAt: over.lightAt ?? (() => null),
    noirOpacity: over.noirOpacity ?? 0,
    ...over,
  };
}
