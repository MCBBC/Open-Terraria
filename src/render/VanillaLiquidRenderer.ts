// 原版 1.4.0.5 液体渲染器：Terraria1405/GameContent/Liquid/LiquidRenderer.cs 逐行移植。
// 多 pass 网格算法（无任何矩形"浸润"hack）：
//  P1 缓存原始液位/实心/墙/类型（±2 padding）
//  P2 可见液位：干燥格被左右（或上下）同类型液体夹住 → 两侧液位之和×0.5（原版"透出"效果的本源）
//  P3 瀑布拖尾：向下传播 WATERFALL_LENGTH 格，透明度递减（水 10 / 岩浆 3 / 蜂蜜 2）
//  P4 四壁插值（Left/Right/Top/BottomWall 0-1）+ 边存在性 + 变体图集 FrameOffset
//  P5 壁值平滑（与上下/左右邻取加权均值）
//  P6/P7 角落修正（瀑布侧/内角填充）
//  绘制：water_N 表（48×1360：3 列变体 × 80px 动画带）按四壁裁源矩形 + 偏移贴图
import type { SpriteAtlas } from '../assets/SpriteAtlas';
import type { TileStore } from '../world/TileStore';
import { TILE_DEFS } from '../data/tiles';

const WATERFALL_LENGTH = [10, 3, 2];        // 水岩蜜
const DEFAULT_OPACITY = [0.5, 0.9, 0.8];  // 水 / 岩浆 / 蜂蜜——原版 oldDrawWater num17:
                                          // 前景水基 0.5(cs:57029),岩浆 ×1.8、蜂蜜 ×1.6 钳 1(cs:57138-57150)

// 我们的 liquidType（1 水 / 2 岩浆 / 3 蜂蜜）→ 原版 LiquidType（0/1/2）
function toVanillaType(t: number): number {
  return t === 2 ? 1 : t === 3 ? 2 : 0;
}
function waterSheet(vt: number): string {
  return vt === 1 ? 'vanilla/Misc_water_1.png' : vt === 2 ? 'vanilla/Misc_water_11.png' : 'vanilla/Misc_water_0.png';
}

// ---- 类型数组池(2026-08 审计 G1):此前每 pass 分配 24 个数组 ×2 pass/帧
// ≈ 744KB/帧 ≈ 45MB/s 的 GC 压力。容量只增不减;每调用前 fill(0) 保持与
// "新分配数组"完全相同的语义(未写格一律 0) ----
let _liqCap = 0;
let _level: Float32Array, _visLevel: Float32Array, _opacity: Float32Array;
let _isSolidA: Uint8Array, _hasLiquidA: Uint8Array, _hasWallA: Uint8Array;
let _hasVisA: Uint8Array, _typeA: Uint8Array, _visTypeA: Uint8Array;
let _lW: Float32Array, _rW: Float32Array, _bW: Float32Array, _tW: Float32Array;
let _vlW: Float32Array, _vrW: Float32Array, _vbW: Float32Array, _vtW: Float32Array;
let _hasLE: Uint8Array, _hasRE: Uint8Array, _hasTE: Uint8Array, _hasBE: Uint8Array;
let _isHalfA: Uint8Array;
let _fx: Int16Array, _fy: Int16Array;

export function drawVanillaLiquids(
  ctx: CanvasRenderingContext2D, atlas: SpriteAtlas | null,
  st: TileStore, groundLevel: number,
  tx0: number, ty0: number, tx1: number, ty1: number,
  nowMs: number, isBackground = false,
): void {
  if (!atlas) return;
  const PAD = 2;
  const px0 = tx0 - PAD, py0 = ty0 - PAD;
  const pw = tx1 - tx0 + 1 + PAD * 2, ph = ty1 - ty0 + 1 + PAD * 2;
  const n = pw * ph;
  if (n > _liqCap) {
    // 只增不减(缩放变化按最大视图分配一次)
    _liqCap = n;
    _level = new Float32Array(n); _visLevel = new Float32Array(n); _opacity = new Float32Array(n);
    _isSolidA = new Uint8Array(n); _hasLiquidA = new Uint8Array(n); _hasWallA = new Uint8Array(n);
    _hasVisA = new Uint8Array(n); _typeA = new Uint8Array(n); _visTypeA = new Uint8Array(n);
    _lW = new Float32Array(n); _rW = new Float32Array(n); _bW = new Float32Array(n); _tW = new Float32Array(n);
    _vlW = new Float32Array(n); _vrW = new Float32Array(n); _vbW = new Float32Array(n); _vtW = new Float32Array(n);
    _hasLE = new Uint8Array(n); _hasRE = new Uint8Array(n); _hasTE = new Uint8Array(n); _hasBE = new Uint8Array(n);
    _isHalfA = new Uint8Array(n);
    _fx = new Int16Array(n); _fy = new Int16Array(n);
  }
  // 归零(等价新分配数组;未写格语义为 0)。
  // 例外:opacity 原为 .fill(1)——P3 只写到 ph-10 行,底缘 8 行依赖初始 1,
  // 必须保持 fill(1) 否则视口底缘水体透明度归零(渲染结果变化)
  _level.fill(0); _visLevel.fill(0); _opacity.fill(1);
  _isSolidA.fill(0); _hasLiquidA.fill(0); _hasWallA.fill(0);
  _hasVisA.fill(0); _typeA.fill(0); _visTypeA.fill(0);
  _lW.fill(0); _rW.fill(0); _bW.fill(0); _tW.fill(0);
  _vlW.fill(0); _vrW.fill(0); _vbW.fill(0); _vtW.fill(0);
  _hasLE.fill(0); _hasRE.fill(0); _hasTE.fill(0); _hasBE.fill(0);
  _isHalfA.fill(0);
  _fx.fill(0); _fy.fill(0);
  const level = _level, visLevel = _visLevel, opacity = _opacity;
  const isSolidA = _isSolidA, hasLiquidA = _hasLiquidA, hasWallA = _hasWallA;
  const hasVisA = _hasVisA, typeA = _typeA, visTypeA = _visTypeA;
  const lW = _lW, rW = _rW, bW = _bW, tW = _tW;
  const vlW = _vlW, vrW = _vrW, vbW = _vbW, vtW = _vtW;
  const hasLE = _hasLE, hasRE = _hasRE, hasTE = _hasTE, hasBE = _hasBE;
  const isHalfA = _isHalfA;
  const fx = _fx, fy = _fy;

  // ---- P1：原始缓存 ----
  for (let lx = 0; lx < pw; lx++) {
    const x = px0 + lx;
    for (let ly = 0; ly < ph; ly++) {
      const y = py0 + ly;
      const i = lx * ph + ly;
      if (!st.inBounds(x, y)) { isSolidA[i] = 1; continue; }
      const si = st.idx(x, y);
      const lq = st.liquid[si];
      level[i] = lq / 255;
      hasLiquidA[i] = lq > 0 ? 1 : 0;
      hasWallA[i] = st.wall[si] > 0 ? 1 : 0;
      typeA[i] = toVanillaType(st.liquidType[si]);
      visTypeA[i] = typeA[i]; // P3 只跑到底部 10 行外（同原版 L152）——预填本格类型兜底，
                              // 否则底带格子 visTypeA=0 被当水画（原版靠跨帧残留缓存掩蔽）
      const d = TILE_DEFS[st.type[si]];
      isSolidA[i] = d && d.solid ? 1 : 0;
    }
  }
  const at = (lx: number, ly: number) => lx * ph + ly; // padding 内坐标
  // 半砖缓存（LiquidRenderer.cs:103-110）：halfBrick && 上格有液体 && 非平台；
  // 无液体时类型继承上格（109-110）。注意 ptr[-1] = y-1 = 上格
  for (let lx = 0; lx < pw; lx++) {
    for (let ly = 1; ly < ph; ly++) {
      const i = at(lx, ly);
      if (!st.inBounds(px0 + lx, py0 + ly)) continue;
      const si = st.idx(px0 + lx, py0 + ly);
      const d = TILE_DEFS[st.type[si]];
      if (st.half[si] && hasLiquidA[at(lx, ly - 1)] && !(d && d.platform)) {
        isHalfA[i] = 1;
        if (!hasLiquidA[i]) typeA[i] = typeA[at(lx, ly - 1)];
      }
    }
  }

  // ---- P2：可见液位（内区 = 真实视图区） ----
  for (let lx = PAD; lx < pw - PAD; lx++) {
    for (let ly = PAD; ly < ph - PAD; ly++) {
      const i = at(lx, ly);
      let v: number;
      if (isHalfA[i] && hasLiquidA[at(lx, ly - 1)]) {
        v = 1; // 半砖 + 上格有液体：可视液面拉满（LiquidRenderer.cs:121-122）
      } else if (!hasLiquidA[i]) {
        const li = at(lx - 1, ly), ri = at(lx + 1, ly), ui = at(lx, ly - 1), di = at(lx, ly + 1);
        let val = 0;
        // 原版先判 ptr[-1]/[+1]（上下），后判 ptr[-H]/[+H]（左右）→ 左右命中时 Type 覆盖（L129-138）
        if (hasLiquidA[ui] && hasLiquidA[di] && typeA[ui] === typeA[di] && !isSolidA[ui] && !isSolidA[di]) {
          val = level[ui] + level[di];
          typeA[i] = typeA[ui];
        }
        if (hasLiquidA[li] && hasLiquidA[ri] && typeA[li] === typeA[ri] && !isSolidA[li] && !isSolidA[ri]) {
          val = Math.max(val, level[li] + level[ri]);
          typeA[i] = typeA[li];
        }
        v = val * 0.5;
      } else {
        v = level[i];
      }
      visLevel[i] = v;
      hasVisA[i] = v !== 0 ? 1 : 0;
    }
  }

  // ---- P3：瀑布拖尾（向下传播） + 实心格处理 ----
  for (let lx = 0; lx < pw; lx++) {
    for (let ly = 0; ly < ph - 10; ly++) {
      const i = at(lx, ly);
      if (hasVisA[i] && (!isSolidA[i] || isHalfA[i])) {
        opacity[i] = 1;
        visTypeA[i] = typeA[i];
        const len = WATERFALL_LENGTH[typeA[i]] ?? 3;
        const step = 1 / (len + 1);
        let k = 1;
        for (let s = 1; s <= len; s++) {
          k -= step;
          const bi = at(lx, ly + s);
          if (ly + s >= ph) break;
          if (!isSolidA[bi]) {
            visLevel[bi] = Math.max(visLevel[bi], visLevel[i] * k);
            opacity[bi] = k;
            visTypeA[bi] = typeA[i];
          } else break;
        }
      }
      if (isSolidA[i] && !isHalfA[i]) {
        visLevel[i] = 1;
        hasVisA[i] = 0;
      } else {
        // 原版 L178-179：非实心格在此重算可见性——P3 拖尾写入的干格因此变为可见
        hasVisA[i] = visLevel[i] !== 0 ? 1 : 0;
      }
    }
  }

  // ---- P4：四壁插值 + 边存在 + 变体 FrameOffset ----
  for (let lx = PAD; lx < pw - PAD; lx++) {
    for (let ly = PAD; ly < ph - PAD; ly++) {
      const i = at(lx, ly);
      if (!hasVisA[i]) { hasLE[i] = hasRE[i] = hasTE[i] = hasBE[i] = 0; continue; }
      const ui = at(lx, ly - 1), di = at(lx, ly + 1), li = at(lx - 1, ly), ri = at(lx + 1, ly);
      let nT = 0, nB = 1, nL = 0, nR = 1;
      const my = visLevel[i];
      if (!hasVisA[ui]) nT += visLevel[di] * (1 - my);
      if (!hasVisA[di] && !isSolidA[di] && !isHalfA[di]) nB -= visLevel[ui] * (1 - my);
      if (!hasVisA[li] && !isSolidA[li] && !isHalfA[li]) nL += visLevel[ri] * (1 - my);
      if (!hasVisA[ri] && !isSolidA[ri] && !isHalfA[ri]) nR -= visLevel[li] * (1 - my);
      tW[i] = nT; bW[i] = nB; lW[i] = nL; rW[i] = nR;
      hasTE[i] = (!hasVisA[ui] && !isSolidA[ui]) || nT !== 0 ? 1 : 0;
      hasBE[i] = (!hasVisA[di] && !isSolidA[di]) || nB !== 1 ? 1 : 0;
      hasLE[i] = (!hasVisA[li] && !isSolidA[li]) || nL !== 0 ? 1 : 0;
      hasRE[i] = (!hasVisA[ri] && !isSolidA[ri]) || nR !== 1 ? 1 : 0;
      let ox = 0, oy = 0;
      if (!hasLE[i]) { ox += hasRE[i] ? 32 : 16; }
      if (hasLE[i] && hasRE[i]) {
        ox = 16; oy += 32;
        if (hasTE[i]) oy = 16;
      } else if (!hasTE[i]) {
        if (!hasLE[i] && !hasRE[i]) oy += 48;
        else oy += 16;
      }
      if (oy === 16 && !!(hasLE[i] ^ hasRE[i]) && (py0 + ly) % 2 === 0) oy += 16;
      fx[i] = ox; fy[i] = oy;
    }
  }

  // ---- P5：壁值平滑 ----
  for (let lx = PAD; lx < pw - PAD; lx++) {
    for (let ly = PAD; ly < ph - PAD; ly++) {
      const i = at(lx, ly);
      if (!hasVisA[i]) continue;
      const ui = at(lx, ly - 1), di = at(lx, ly + 1), li = at(lx - 1, ly), ri = at(lx + 1, ly);
      vlW[i] = lW[i]; vrW[i] = rW[i]; vtW[i] = tW[i]; vbW[i] = bW[i];
      if (hasVisA[ui] && hasVisA[di]) {
        if (hasLE[i]) vlW[i] = (lW[i] * 2 + lW[ui] + lW[di]) * 0.25;
        if (hasRE[i]) vrW[i] = (rW[i] * 2 + rW[ui] + rW[di]) * 0.25;
      }
      if (hasVisA[li] && hasVisA[ri]) {
        if (hasTE[i]) vtW[i] = (tW[i] * 2 + tW[li] + tW[ri]) * 0.25;
        if (hasBE[i]) vbW[i] = (bW[i] * 2 + bW[li] + bW[ri]) * 0.25;
      }
    }
  }

  // ---- P6：瀑布侧/邻接修正 ----
  for (let lx = PAD; lx < pw - PAD; lx++) {
    for (let ly = PAD; ly < ph - PAD; ly++) {
      const i = at(lx, ly);
      if (!hasLiquidA[i]) continue;
      const ui = at(lx, ly - 1), di = at(lx, ly + 1), li = at(lx - 1, ly), ri = at(lx + 1, ly);
      if (hasTE[i] && !hasBE[i] && !!(hasLE[i] ^ hasRE[i])) {
        if (hasRE[i]) { vrW[i] = vrW[di]; vtW[i] = vtW[li]; }
        else { vlW[i] = vlW[di]; vtW[i] = vtW[ri]; }
      } else if (fx[di] === 16 && fy[di] === 32) {
        if (vlW[i] > 0.5) { vlW[i] = 0; fx[i] = 0; fy[i] = 0; }
        else if (vrW[i] < 0.5) { vrW[i] = 1; fx[i] = 32; fy[i] = 0; }
      }
    }
  }

  // ---- P7：内角填充 ----
  for (let lx = PAD; lx < pw - PAD; lx++) {
    for (let ly = PAD; ly < ph - PAD; ly++) {
      const i = at(lx, ly);
      if (!hasLiquidA[i]) continue;
      const ui = at(lx, ly - 1), di = at(lx, ly + 1), li = at(lx - 1, ly), ri = at(lx + 1, ly);
      if (!hasBE[i] && !hasLE[i] && !hasTE[i] && !hasRE[i]) {
        // 原版 LiquidRenderer.cs:342-346：left.HasTopEdge && up.HasLeftEdge，墙面取 up.vlW / left.vtW
        if (hasTE[li] && hasLE[ui]) {
          fx[i] = Math.max(4, Math.floor(16 - vlW[ui] * 16)) - 4;
          fy[i] = 48 + Math.max(4, Math.floor(16 - vtW[li] * 16)) - 4;
          vlW[i] = 0; vtW[i] = 0; vrW[i] = 1; vbW[i] = 1;
        } else if (hasTE[ri] && hasRE[ui]) {
          fx[i] = 32 - Math.min(16, Math.floor(vrW[ui] * 16) - 4);
          fy[i] = 48 + Math.max(4, Math.floor(16 - vtW[ri] * 16)) - 4;
          vlW[i] = 0; vtW[i] = 0; vrW[i] = 1; vbW[i] = 1;
        }
      }
    }
  }

  // ---- 绘制 ----
  const texCache = new Map<number, HTMLImageElement | null>();
  const texFor = (vt: number) => {
    let t = texCache.get(vt);
    if (t === undefined) {
      t = atlas.ensureVImage(waterSheet(vt)) ?? null;
      if (t) texCache.set(vt, t);  // 只缓存命中(缓存 null 会把未就绪永久化)
    }
    return t;
  };
  const animFrame = Math.floor((nowMs / 1000) * 6) % 16; // 原版 _frameState（风+6 基速）
  ctx.imageSmoothingEnabled = false;

  // 主循环（双 pass 共用：背景 pass 画在方块层前、透明度 1.0；前景 pass 画在方块后、乘 DEFAULT_OPACITY）
  for (let lx = PAD; lx < pw - PAD; lx++) {
    const x = px0 + lx;
    for (let ly = PAD; ly < ph - PAD; ly++) {
      const y = py0 + ly;
      const i = at(lx, ly);
      if (!hasVisA[i]) continue;
      const vt = visTypeA[i];
      const tex = texFor(vt);
      if (!tex) continue;
      const n2 = Math.min(0.75, vlW[i]), n3 = Math.max(0.25, vrW[i]);
      const n4 = Math.min(0.75, vtW[i]);
      let n5 = Math.max(0.25, vbW[i]);
      // 半砖可视底边截到半格（LiquidRenderer.cs:382-383）
      if (isHalfA[i] && isSolidA[i] && n5 > 0.5) n5 = 0.5;
      // IsVisible（LiquidRenderer.cs:384）：半砖格自身有半液且无墙 → 不画（交给上格溢流）
      if (isHalfA[i] && hasLiquidA[i] && level[i] < 1 && !hasWallA[i]) continue;
      const sx = Math.floor(16 - n3 * 16) + fx[i];
      const sy = Math.floor(16 - n5 * 16) + fy[i];
      const sw = Math.ceil((n3 - n2) * 16), sh = Math.ceil((n5 - n4) * 16);
      const isSurface = fx[i] === 16 && fy[i] === 0 && y > groundLevel - 40;
      const srcY = isSurface ? 1280 : sy + animFrame * 80;
      if (sw <= 0 || sh <= 0 || sx + sw > tex.width || srcY + sh > tex.height) continue;
      // 双 pass（Main.cs DrawWaters(true/false) + LiquidRenderer.InternalDraw）：
      // 背景 pass 不透明（露出方块透明像素 = 浸润）；前景 pass 水 0.6 半透明质感
      ctx.globalAlpha = Math.min(1, opacity[i] * (isBackground ? 1 : (DEFAULT_OPACITY[vt] ?? 0.6)));
      ctx.drawImage(tex, sx, srcY, sw, sh,
        x * 16 + Math.floor(n2 * 16), y * 16 + Math.floor(n4 * 16), sw, sh);
    }
  }

  // ---- 浸润 pass：DrawTile_LiquidBehindTile(TileDrawing.cs:3859-4193) ----
  // 对每个【实心方块格】，检查四邻是否有液体 → 在方块格内画一条液体带
  // （背景 pass，不透明）。方块贴图画在其上——透明圆角像素透出液体色而不是墙色/背景色。
  // 这是原版"水体包裹方块"的全部秘密；条带宽度由邻接方向决定：
  //   仅上方有水 → 格顶 16×4 横条(:4081-4087)
  //   仅下方有水 → 格底 16×4 横条(:4089-4093)
  //   仅左侧有水 → 格左 4px 竖条(:4113-4116);仅右侧 → 格右 4px(:4118-4121)
  //   左右都有   → 整格 16 宽(:4108-4111);深度按液体量 num6=(256-max)/32*2 从底收
  if (isBackground) drawLiquidBehindTiles(ctx, atlas, st, groundLevel, tx0, ty0, tx1, ty1);

  ctx.globalAlpha = 1;
}

/**
 * 浸润 pass:原版 TilesRenderer.DrawLiquidBehindTiles → DrawTile_LiquidBehindTile
 * (TileDrawing.cs:3859-4193)。对视区内每个实心方块格检查四邻液体,在方块格内画液体带。
 * 背景 pass 调用(画在方块贴图之下)——透明圆角像素透出液体色。
 */
function drawLiquidBehindTiles(
  ctx: CanvasRenderingContext2D, atlas: SpriteAtlas,
  st: TileStore, groundLevel: number,
  tx0: number, ty0: number, tx1: number, ty1: number,
): void {
  // Liquid_N 贴图(16×16 纯液体块;水 Liquid_0 多 style 但取首 16px)
  const texCache = new Map<number, HTMLImageElement | null>();
  const texFor = (vt: number) => {
    let t = texCache.get(vt);
    if (t === undefined) {
      const file = vt === 1 ? 'vanilla/Liquid_1.png' : vt === 2 ? 'vanilla/Liquid_11.png' : 'vanilla/Liquid_0.png';
      t = atlas.ensureVImage(file) ?? null;
      if (t) texCache.set(vt, t); // 只缓存命中(缓存 null 会把未就绪永久化——首帧丢条带)
    }
    return t;
  };

  let _dbgCount = 0;
  for (let x = Math.max(1, tx0); x <= Math.min(st.w - 2, tx1); x++) {
    for (let y = Math.max(1, ty0); y <= Math.min(st.h - 2, ty1); y++) {
      const i = st.idx(x, y);
      if (!st.flags[i]) continue; // 空格没有"方块后面"
      const def = TILE_DEFS[st.type[i]];
      if (!def || !def.solid || def.platform) continue; // 仅实心方块(:4075 tileSolid 排除)

      // 四邻液体(TileDrawing.cs:3861-3900;379=conveyor 按 vanilla 视为无液体)
      const lq = (dx: number, dy: number) => {
        const nx = x + dx, ny = y + dy;
        if (!st.inBounds(nx, ny)) return { lq: 0, lt: 0 };
        const ni = st.idx(nx, ny);
        return { lq: st.liquid[ni], lt: st.liquidType[ni] || 1 };
      };
      const L = lq(-1, 0), R = lq(1, 0), U = lq(0, -1), D = lq(0, 1);
      // flag 语义(:3967-4053):flag=左 / flag2=右 / flag3=上 / flag4=下(>240)
      let fL = L.lq > 0; const fR = R.lq > 0, fU = U.lq > 0, fD = D.lq > 240;
      if (!fL && !fR && !fU && !fD) continue; // :4055-4057 四邻无液体跳过
      _dbgCount++;
      (typeof window !== 'undefined' ? window as unknown as Record<string, number> : {} as Record<string, number>).__infilCount = _dbgCount;

      // 液体类型与最大液位(:3940-3965 取最高液位邻居)
      let maxLq = 0, lt = 0;
      const consider = (n: { lq: number; lt: number }) => {
        if (n.lq > maxLq) { maxLq = n.lq; lt = toVanillaType(n.lt); }
      };
      if (fL) consider(L); if (fR) consider(R); if (fU) consider(U); if (fD) consider(D);
      if (lt === 3) continue; // 微光暂不支持
      const tex = texFor(lt);
      if (!tex) continue;

      // ---- 液体矩形计算(:4069-4123) ----
      // 原版默认 rect = (0, 4, 16, 16);pos = (tileX*16, tileY*16)
      let rx = 0, ry = 4, rw = 16, rh = 16;   // liquidSize(源矩形)
      let px = x * 16, py = y * 16;            // 目标位置

      if (fD && (fL || fR)) { fL = true; /* :4070-4074 下+任一侧 → 视为双侧 */ }
      if (!(fU && (fL || fR)) && !(fD && fU)) {
        if (fU) {
          // 仅上方有水:格顶 16×4 条(:4081-4087;坡面/半砖加深到 12)
          rh = 4;
          const isHalf = st.half[i];
          if (isHalf) rh = 12;
        } else if (fD && !fL && !fR) {
          // 仅下方:格底 16×4(:4089-4093)
          py = y * 16 + 12; rh = 4;
        } else {
          // 侧向有水(:4095-4123)
          let y0 = 4;
          const upNi = st.idx(x, y - 1);
          if (st.liquid[upNi] === 0 && !st.isSolid(x, y - 1)) y0 = 0; // 上方无液无实心→从格顶画(:4098-4101)
          const num6 = Math.floor((256 - maxLq) / 32) * 2; // 深度=液位不足时从底收(:4096,4102)
          const isHalf = st.half[i];
          if (fL && fR || isHalf) {
            // 左右都有 或 半砖:整格宽(:4108-4111)
            py = y * 16 + num6; ry = y0; rh = 16 - num6;
          } else if (fL) {
            // 仅左:格左 4px 竖条(:4113-4116)
            py = y * 16 + num6; ry = y0; rw = 4; rh = 16 - num6;
          } else {
            // 仅右:格右 4px 竖条(:4118-4121)
            px = x * 16 + 12; py = y * 16 + num6; ry = y0; rw = 4; rh = 16 - num6;
          }
        }
      }
      if (rw <= 0 || rh <= 0) continue;

      // ---- 源矩形钳制到贴图边界(原版 XNA PointClamp 自动钳;Canvas 2D 需显式) ----
      // Liquid_N 是 16×16 纯块;ry=4 起 + rh=16 会到 y=20 越界——XNA 读边缘像素,
      // 我们钳 rh = tex.height - ry 保持等比(不画满时目标也同步缩)
      const srcH = Math.min(rh, tex.height - ry);
      const srcW = Math.min(rw, tex.width - rx);
      if (srcW <= 0 || srcH <= 0) continue;
      const dstH = srcH; // 源=目标尺寸(原版 DrawPartialLiquid 同源同目标)
      const dstW = srcW;

      // ---- 不透明度(:4126-4146) ----
      // 地上=1.0(有墙压 0.6,墙 21→0.9);地下=0.5 基线
      let alpha = 0.5;
      if (y <= Math.floor(groundLevel)) {
        alpha = 1.0;
        const wi = st.wall[i];
        if (wi === 21) alpha = 0.9;
        else if (wi > 0) alpha = 0.6;
      }
      ctx.globalAlpha = alpha;
      ctx.drawImage(tex, rx, ry, srcW, srcH, px, py, dstW, dstH);
    }
  }
  ctx.globalAlpha = 1;
}
