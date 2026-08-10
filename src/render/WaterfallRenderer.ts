// 原版 1.4.0.5 WaterfallManager.cs 移植：液体从半砖唇缘倾泻的长条瀑布贴图。
// 与 LiquidRenderer 的 P3 瀑布拖尾（10 格内液体本体渐隐）互补——这里画的是
// 独立的 Waterfall_N 贴图柱（最长 100 格），触发条件 = 原版 halfBrick 唇缘（L100-130）。
// 照抄原版：
//  - 贴图 Waterfall_N.png：512×40 胶片条，帧宽 32、16 帧；流柱格取 (frameX,0,16,16-liquid/16)
//  - 帧速：水 regularFrame 每 3 tick、岩浆/蜂蜜 slowFrame 每 7 tick（L171-209）
//  - 透明度：岩浆 1.0 / 蜂蜜 0.8 / 水地表 1.0、地下或有墙 0.6；末 10 格线性衰减（L538-551）
//  - 走向决策（L421-507）：唇缘半砖格不满足直落门（!halfBrick）→ 先向空侧平移 1 格再落；
//    偏折计数 num23 仅方向反转时累加、直落清零、≥2 翻转方向而非停止
//  - 断流：完整实心块（blockType==0）停（L427）；溶入液池 liquid>0 && !halfBrick 停（L777）
//  - 撞地格绘制上移 8px：SolidTile(下) && !halfBrick（L531-534）
// 省略（周边系统缺失）：雨/雪云柱、彩虹/荧光砖改写、溅落 2px 斜切片、环境音、Grate 穿透。
import type { SpriteAtlas } from '../assets/SpriteAtlas';
import type { TileStore } from '../world/TileStore';
import { TILE_DEFS } from '../data/tiles';

interface Waterfall { x: number; y: number; type: number; } // type: 0 水 / 1 岩浆 / 2 蜂蜜（本仓库编码）

const MAX_FALLS = 1000;      // 原版 qualityMax = maxWaterfallCount(1000) * gfxQuality(1)
const WATERFALL_DIST = 100;  // 原版 waterfallDist = 75*gfxQuality + 25

const SHEET = ['vanilla/Waterfall_0.png', 'vanilla/Waterfall_1.png', 'vanilla/Waterfall_14.png'];

export class WaterfallRenderer {
  private falls: Waterfall[] = [];
  private lastFind = -1;
  private findFrame = 0;

  /** 扫描触发（WaterfallManager.cs FindWaterfalls 90-168，每 30 帧一次）。view 为可见 tile 窗口。
   *  原版条件：halfBrick 唇缘格 + 上方近干/实心 + 一侧液量>160 且对侧空 */
  findWaterfalls(st: TileStore, tx0: number, ty0: number, tx1: number, ty1: number, frame: number) {
    if (frame === this.lastFind) return;
    this.lastFind = frame;
    this.findFrame++;
    if (this.findFrame % 30 !== 1) return; // 与原版同节流：约 0.5s 一扫
    this.falls.length = 0;
    // 扫描窗口：原版 FindWaterfalls 屏幕四周外扩 waterfallDist(100)/下 +20（L74-81），
    // 视口外起点的长瀑也要登记（水柱会流进画面）
    const x0 = Math.max(2, tx0 - WATERFALL_DIST), x1 = Math.min(st.w - 3, tx1 + WATERFALL_DIST);
    const y0 = Math.max(2, ty0 - WATERFALL_DIST), y1 = Math.min(st.h - 3, ty1 + 20);
    const solid = (x: number, y: number) => {
      if (x < 0 || y < 0 || x >= st.w || y >= st.h) return false;
      const t = st.type[st.idx(x, y)];
      if (t === 0) return false;
      const d = TILE_DEFS[t];
      return !!d && d.solid && !d.platform;
    };
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) {
        const i = st.idx(x, y);
        if (!st.flags[i] || !st.half[i]) continue;          // active && halfBrick（L102）
        const ui = i - st.w;
        const uq = y > 0 ? st.liquid[ui] : 0;
        if (!(uq < 16 || solid(x, y - 1))) continue;          // 上方近干或实心（L110）
        const li = i - 1, ri = i + 1;
        const lq = st.liquid[li], rq = st.liquid[ri];
        const lOpen = lq === 0 && !solid(x - 1, y) && st.slope[li] === 0;
        const rOpen = rq === 0 && !solid(x + 1, y) && st.slope[ri] === 0;
        if (!((lq > 160 || rq > 160) && (lOpen || rOpen))) continue; // L124
        // 类型：上/右/左三格任一岩浆→1 蜂蜜→14，否则水（L126-127）
        let type = 0;
        const isLava = (ii: number) => st.liquid[ii] > 0 && st.liquidType[ii] === 2;
        const isHoney = (ii: number) => st.liquid[ii] > 0 && st.liquidType[ii] === 3;
        if (isLava(ui) || isLava(ri) || isLava(li)) type = 1;
        else if (isHoney(ui) || isHoney(ri) || isHoney(li)) type = 2;
        this.falls.push({ x, y, type });
        if (this.falls.length >= MAX_FALLS) return;
      }
    }
  }

  /** 绘制（DrawWaterfall 行 211-803 的主体路径；style 固定 0=水） */
  draw(ctx: CanvasRenderingContext2D, atlas: SpriteAtlas | null, st: TileStore, groundLevel: number, nowMs: number) {
    if (!atlas || this.falls.length === 0) return;
    const tex = SHEET.map((s) => atlas.ensureVImage(s) ?? null);
    if (!tex[0] && !tex[1] && !tex[2]) return;
    // 帧动画：水 3 tick/帧、岩浆蜂蜜 7 tick/帧（1 tick ≈ 16.67ms）
    const regular = Math.floor(nowMs / 50) % 16;
    const slow = Math.floor(nowMs / 117) % 16;
    ctx.imageSmoothingEnabled = false;
    for (const wf of this.falls) {
      const texImg = tex[wf.type] ?? tex[0];
      if (!texImg) continue;
      const frameX = 32 * (wf.type === 0 ? regular : slow);
      let cx = wf.x, cy = wf.y; // 原版从唇缘格本体开始画（半砖 blockType=1 不断流，L427）
      let dx = 0, dy = 0;       // num26/num27：本步位移
      let lastH = 0;            // num14：上一次水平方向
      let turns = 0;            // num23：方向反转计数
      // SolidTile 语义（WorldGen.SolidTile：实心 && !platform && !half && !slope）
      const solidT = (x: number, y: number) => {
        if (x < 0 || y < 0 || x >= st.w || y >= st.h) return false;
        const i = st.idx(x, y);
        const t = st.type[i];
        if (t === 0) return false;
        const d = TILE_DEFS[t];
        return !!d && d.solid && !d.platform && !st.half[i] && st.slope[i] === 0;
      };
      for (let step = 0; step < WATERFALL_DIST; step++) {
        if (cx < 1 || cy < 1 || cx >= st.w - 1 || cy >= st.h - 1) break;
        const ci = st.idx(cx, cy);
        // 完整实心块（blockType==0）断流；半砖/坡面豁免（L427）
        if (solidT(cx, cy) && !st.half[ci] && st.slope[ci] === 0) break;
        const li = ci - 1, ri = ci + 1, bi = ci + st.w;
        // ---- 走向决策（L452-507，坡面分支省略）----
        if ((!solidT(cx, cy + 1) || st.type[bi] === 0) && !st.half[ci]) {
          // 直落门（L470）：下方非实心 且 本格非半砖——唇缘半砖格不直落
          turns = 0; dy = 1; dx = 0;
        } else if ((solidT(cx - 1, cy) || st.liquid[li] > 0) && (!solidT(cx + 1, cy) && st.liquid[ri] === 0)) {
          // 左堵/左液 → 向右平移（L476-483）
          if (lastH === -1) turns++;
          dx = 1; dy = 0; lastH = 1;
        } else if ((solidT(cx + 1, cy) || st.liquid[ri] > 0) && (!solidT(cx - 1, cy) && st.liquid[li] === 0)) {
          // 右堵/右液 → 向左平移（L484-491）
          if (lastH === 1) turns++;
          dx = -1; dy = 0; lastH = -1;
        } else if (!solidT(cx + 1, cy) && st.liquid[ri] === 0 && !solidT(cx - 1, cy) && st.liquid[li] === 0) {
          dy = 0; dx = lastH;   // 两侧皆空：保持上次水平方向（L492-496）
        } else {
          turns++; dy = 0; dx = 0; // 四面皆堵：滞留计数（L497-501）
        }
        if (turns >= 2) { lastH *= -1; dx *= -1; } // 翻转方向而非停止（L503-507）
        // ---- 绘制本格 ----
        const liq = st.liquid[ci];
        let alpha = wf.type === 1 ? 1.0 : wf.type === 2 ? 0.8
          : (st.wall[ci] !== 0 || cy >= groundLevel ? 0.6 : 1.0);
        if (step > WATERFALL_DIST - 10) alpha *= (WATERFALL_DIST - step) / 10;
        const sh = 16 - Math.floor(liq / 16);       // num21：按格内液量裁掉底部
        const yOff = solidT(cx, cy + 1) && !st.half[ci] ? 8 : 0; // 撞地格上移 8px（L531-534）
        if (sh > 0) {
          ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
          ctx.drawImage(texImg, frameX, 0, 16, sh, cx * 16, cy * 16 + yOff, 16, sh);
        }
        if (liq > 0 && !st.half[ci]) break;         // 溶入液池（L777-778）
        cx += dx; cy += dy;
      }
    }
    ctx.globalAlpha = 1;
  }

  get count() { return this.falls.length; }
}
