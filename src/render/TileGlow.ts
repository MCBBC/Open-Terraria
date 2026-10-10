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
//  R3 129 由 BJ118① 独立域承担（本扫描跳过防双画）;209 本仓传送门=实体通道,条目
//     休眠（若格被炮台世界生成命中则按 netMode0 支上色——与原版单机同相）。
//  R4 glow tile 暗格剔除豁免面（:980 flag 并入——glow tile 不 DrawBlack）烘焙侧
//     未接（黑底绘制面属 ChunkBake DrawOwnBlacks 域,本刀不动）。
import type { SpriteAtlas } from '../assets/SpriteAtlas';
import type { TileStore } from '../world/TileStore';
import { TILE } from '../core/constants';
import { TILE_DEFS } from '../data/tiles';
import { TILE_GLOWMASK, tileGlowKind, tileGlowColors, lavaLightA, WHITE_A100 } from '../data/vanillaTileGlow';
import type { RGBA } from '../data/vanillaTileGlow';
import { xnaColorToOp } from '../data/vanillaItemGlow';
import { drawAdjust, tileDrawYOffsetOf } from './VanillaTiler';
import { animYOffset } from './TileAnim';
import { visEffectFrames } from '../entities/Enemy';

/** op 计划（与 Renderer.itemGlowQueue 单元结构同形——收集侧纯计划,零跨拍 img 持有） */
export interface TileGlowOp {
  tex: string; sx: number; sy: number; sw: number; sh: number;
  dx: number; dy: number; blend: 'add' | 'over'; tint: [number, number, number]; alpha: number;
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
      if (kind === 'invisible' || kind === 'crystal129') continue;   // 718 零贡献 / 129 BJ118 已承担
      const fx = st.frameX[i];
      const fy = st.frameY[i];

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
