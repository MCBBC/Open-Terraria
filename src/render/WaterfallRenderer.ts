// 原版 1.4.0.5 WaterfallManager.cs 移植：液体从边缘倾泻时的长条瀑布贴图。
// 与 LiquidRenderer 的 P3 瀑布拖尾（10 格内液体本体渐隐）互补——这里画的是
// 独立的 Waterfall_N 贴图柱（最长 100 格），原版在半砖唇缘触发。
// 本仓库无半砖/坡面系统，触发条件按原版语义适配为"倾泻点"：
//   液量 ≥160 的格子、正下方为空且可通行（液体正在从边缘落下），每列连续段只取最高一格。
// 其它规则照抄原版：
//  - 贴图 Waterfall_N.png：512×56 胶片条，帧宽 32、16 帧；流柱格取 (frameX,0,16,16-liquid/16)
//  - 帧速：水 regularFrame 每 3 tick、岩浆/蜂蜜 slowFrame 每 7 tick（WaterfallManager.cs:171-209）
//  - 透明度：岩浆 1.0 / 蜂蜜 0.8 / 水地表 1.0、地下或有墙 0.6；末 10 格线性衰减（行 538-551）
//  - 走向：下方空→直落；撞地→向空侧平移一格再落（偏折 ≥2 次停）；流入液池停（行 421-507/777）
//  - 撞地格绘制上移 8px 贴住地面（num11，行 531-532）
// 省略（周边系统缺失）：雨/雪云柱、彩虹/荧光砖改写、溅落 2px 斜切片、环境音、Grate 穿透。
import type { SpriteAtlas } from '../assets/SpriteAtlas';
import type { TileStore } from '../world/TileStore';

interface Waterfall { x: number; y: number; type: number; } // type: 0 水 / 1 岩浆 / 2 蜂蜜（本仓库编码）

const MAX_FALLS = 1000;      // 原版 qualityMax = maxWaterfallCount(1000) * gfxQuality(1)
const WATERFALL_DIST = 100;  // 原版 waterfallDist = 75*gfxQuality + 25

const SHEET = ['vanilla/Waterfall_0.png', 'vanilla/Waterfall_1.png', 'vanilla/Waterfall_14.png'];

export class WaterfallRenderer {
  private falls: Waterfall[] = [];
  private lastFind = -1;
  private findFrame = 0;

  /** 扫描触发（原版每 30 帧一次，WaterfallManager.cs:67-70）。view 为可见 tile 窗口 */
  findWaterfalls(st: TileStore, tx0: number, ty0: number, tx1: number, ty1: number, frame: number) {
    if (frame === this.lastFind) return;
    this.lastFind = frame;
    this.findFrame++;
    if (this.findFrame % 30 !== 1) return; // 与原版同节流：约 0.5s 一扫
    this.falls.length = 0;
    const x0 = Math.max(2, tx0 - 2), x1 = Math.min(st.w - 3, tx1 + 2);
    const y0 = Math.max(2, ty0 - 2), y1 = Math.min(st.h - 3, ty1 + 2);
    for (let x = x0; x <= x1; x++) {
      let lastSpawnY = -999;
      for (let y = y0; y <= y1; y++) {
        if (y <= lastSpawnY + 1) continue; // 同列连续倾泻段只取最高格
        const i = st.idx(x, y);
        if (st.liquid[i] < 160) continue;
        const bi = i + st.w;
        // 正下方空且可通行 → 倾泻点
        const t = st.type[bi];
        if (st.liquid[bi] !== 0 || (t !== 0 && st.isSolid(x, y + 1))) continue;
        // 类型：检查自身与左右/上（原版查唇缘三邻，WaterfallManager.cs:126-127）
        let type = 0;
        const probe = [i, i - 1, i + 1, i - st.w];
        for (const pi of probe) {
          if (st.liquid[pi] > 0) {
            const lt = st.liquidType[pi];
            if (lt === 2) { type = 1; break; }
            if (lt === 3) type = 2;
          }
        }
        this.falls.push({ x, y, type });
        lastSpawnY = y;
        if (this.falls.length >= MAX_FALLS) return;
      }
    }
  }

  /** 绘制（DrawWaterfall 行 211-803 的主体路径；style 固定 0=水） */
  draw(ctx: CanvasRenderingContext2D, atlas: SpriteAtlas | null, st: TileStore, groundLevel: number, nowMs: number) {
    if (!atlas || this.falls.length === 0) return;
    const tex = SHEET.map((s) => atlas.vimages.get(s) ?? null);
    if (!tex[0] && !tex[1] && !tex[2]) return;
    // 帧动画：水 3 tick/帧、岩浆蜂蜜 7 tick/帧（1 tick ≈ 16.67ms）
    const regular = Math.floor(nowMs / 50) % 16;
    const slow = Math.floor(nowMs / 117) % 16;
    ctx.imageSmoothingEnabled = false;
    for (const wf of this.falls) {
      const t = tex[wf.type] ?? tex[0];
      if (!t) continue;
      const frameX = 32 * (wf.type === 0 ? regular : slow);
      let cx = wf.x, cy = wf.y + 1; // 从倾泻格下一格开始画（本体已由液体渲染器画）
      let turns = 0;
      for (let step = 0; step < WATERFALL_DIST; step++) {
        if (cx < 1 || cy < 1 || cx >= st.w - 1 || cy >= st.h - 1) break;
        const ci = st.idx(cx, cy);
        if (st.isSolid(cx, cy)) break;
        const liq = st.liquid[ci];
        // 透明度（WaterfallManager.cs:538-551）
        let alpha = wf.type === 1 ? 1.0 : wf.type === 2 ? 0.8
          : (st.wall[ci] !== 0 || cy >= groundLevel ? 0.6 : 1.0);
        if (step > WATERFALL_DIST - 10) alpha *= (WATERFALL_DIST - step) / 10;
        const crop = Math.floor(liq / 16);           // num21：按格内液量裁掉底部
        const sh = 16 - crop;
        const yOff = st.isSolid(cx, cy + 1) ? 8 : 0; // 撞地格上移 8px（行 531-532）
        if (sh > 0) {
          ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
          ctx.drawImage(t, frameX, 0, 16, sh, cx * 16, cy * 16 + yOff, 16, sh);
        }
        if (liq > 0) break;                          // 溶入液池（行 777-778）
        // 走向决策（行 421-507 简化）：下方空→直落；撞地→向空侧平移
        if (!st.isSolid(cx, cy + 1)) { cy++; continue; }
        const rightOpen = !st.isSolid(cx + 1, cy) && !st.isSolid(cx + 1, cy + 1);
        const leftOpen = !st.isSolid(cx - 1, cy) && !st.isSolid(cx - 1, cy + 1);
        if (rightOpen) cx++;
        else if (leftOpen) cx--;
        else break;
        if (++turns >= 2) break;                     // 偏折 ≥2 次停（行 503-507）
      }
    }
    ctx.globalAlpha = 1;
  }

  get count() { return this.falls.length; }
}
