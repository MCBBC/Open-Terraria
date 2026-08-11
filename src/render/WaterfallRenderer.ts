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
//  - 雨幕（WaterfallManager :204-260 触发 + :360-517 绘制）：雨云 196/雪云 460/灰烬云 717
//    下方格 !Solid && liquid==0 && slope==0 → 雨丝柱：雨 25 格/雪 50 格，双层贴图
//    （前景 Waterfall_11 alpha 0.6 + 背景 12 alpha 0.3；雪 22 单层；灰烬雨 26+27），
//    18px 窄条 8 帧动画（前景每 tick 正播、偶列 +3 相位；背景每 3 tick 倒播 +2 偏移）、
//    每格 x ±1 交错、末 8 格线性衰减、撞实心停、液面裁剪
//  - 坡面分支（1456 WaterfallManager.cs:576-587 flag2）：下方顶坡（slope 1/2）格 →
//    贴坡斜向下行 + 溅落 2px 斜切片（:739-748，翻转侧 FlipHorizontally 以镜像实现）
// 省略（周边系统缺失）：彩虹/荧光砖改写、浅流细带分层（y=0 行 16px）、环境音、Grate 穿透。
import type { SpriteAtlas } from '../assets/SpriteAtlas';
import type { TileStore } from '../world/TileStore';
import { TILE_DEFS, TILE_BY_KEY } from '../data/tiles';

interface Waterfall { x: number; y: number; type: number; } // type: 0水 1岩浆 2蜂蜜 3雨幕 4雪幕 5灰烬雨幕（本仓库编码）

const MAX_FALLS = 1000;      // 原版 qualityMax = maxWaterfallCount(1000) * gfxQuality(1)
const WATERFALL_DIST = 100;  // 原版 waterfallDist = 75*gfxQuality + 25

/** 雨幕用的实心判定（WorldGen.SolidTile 等价，非半砖非坡） */
function solidSimple(st: TileStore, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= st.w || y >= st.h) return false;
  const i = st.idx(x, y);
  const t = st.type[i];
  if (t === 0) return false;
  const d = TILE_DEFS[t];
  return !!d && d.solid && !d.platform && !st.half[i] && st.slope[i] === 0;
}

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
    // ---- 雨幕（WaterfallManager :204-260）：雨云 196 / 雪云 460 / 灰烬云 717，
    //  下方格 !Solid && liquid==0 && slope==0 → type 11/22/26（本仓库编码 3/4/5） ----
    const CLOUD_RAIN = TILE_BY_KEY['v_196_rain_cloud_block'] ?? 0;
    const CLOUD_SNOW = TILE_BY_KEY['v_460_snow_cloud_block'] ?? 0;
    const CLOUD_LAVA = TILE_BY_KEY['v_717_lava_cloud'] ?? 0;
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) {
        const i = st.idx(x, y);
        const t = st.type[i];
        let type = -1;
        if (t === CLOUD_RAIN) type = 3;
        else if (t === CLOUD_SNOW) type = 4;
        else if (t === CLOUD_LAVA) type = 5;
        if (type < 0 || !st.flags[i]) continue;
        const bi = i + st.w;
        if (y + 1 >= st.h) continue;
        if (solid(x, y + 1) || st.liquid[bi] !== 0 || st.slope[bi] !== 0) continue;
        this.falls.push({ x, y: y + 1, type });
        if (this.falls.length >= MAX_FALLS) return;
      }
    }
  }

  /** 绘制（DrawWaterfall 行 211-803 的主体路径；style 固定 0=水） */
  draw(ctx: CanvasRenderingContext2D, atlas: SpriteAtlas | null, st: TileStore, groundLevel: number, nowMs: number, waterStyle = 0) {
    if (!atlas || this.falls.length === 0) return;
    this.litCells.length = 0; // 岩浆光照格每帧重建(防无岩浆帧残留旧光)
    const tex = SHEET.map((s) => atlas.ensureVImage(s) ?? null);
    // 水类型走群系贴图（WaterfallManager :528 case 0 → num12 = Style = waterStyle）
    const waterTex = atlas.ensureVImage(`vanilla/Waterfall_${Math.max(0, Math.min(13, waterStyle))}.png`);
    if (waterTex) tex[0] = waterTex;
    if (!tex[0] && !tex[1] && !tex[2]) return;
    // 帧动画：水 3 tick/帧、岩浆蜂蜜 7 tick/帧（1 tick ≈ 16.67ms）
    const regular = Math.floor(nowMs / 50) % 16;
    const slow = Math.floor(nowMs / 117) % 16;
    ctx.imageSmoothingEnabled = false;
    for (const wf of this.falls) {
      // ---- 雨幕分支（WaterfallManager :360-517）：双层 18px 窄条、逐格下落 ----
      if (wf.type >= 3) {
        const fgTex = atlas.ensureVImage(`vanilla/Waterfall_${wf.type === 3 ? 11 : wf.type === 4 ? 22 : 26}.png`);
        const bgTex = wf.type === 4 ? null : atlas.ensureVImage(`vanilla/Waterfall_${wf.type === 3 ? 12 : 27}.png`);
        if (!fgTex) continue;
        const len = wf.type === 4 ? 50 : 25;   // waterfallDist/4（雪 /2 :369-372）
        // 帧：前景每 tick 正播（偶列 +3 相位）、背景每 3 tick 倒播（+2 偏移）（:390-427）
        const tick = Math.floor(nowMs / 16.7);
        let frameFg = tick % 8;
        if (wf.x % 2 === 0) frameFg = (frameFg + 3) % 8;
        const frameBg = (8 + 2 - Math.floor(nowMs / 50) % 8) % 8;
        // 起始位置（:436）：偶列 +9/奇列 +8（格中心 ±1 错位）；每格 x ±1 交错（:513-516）
        let px = wf.x * 16 + (wf.x % 2 === 0 ? 9 : 8);
        let py = wf.y * 16 + 8;
        for (let j = 0; j < len; j++) {
          const ty = wf.y + j;
          if (j > 0 && solidSimple(st, wf.x, ty)) break;      // 撞实心停（:508-511）
          if (ty >= st.h - 1) break;
          const ci = st.idx(wf.x, ty);
          let hF = 16, hB = 16;
          if (st.liquid[ci] > 0) {                            // 液面裁剪（:494-502）
            const cut = Math.floor(16 * (st.liquid[ci] / 255)) & 0xFE;
            if (cut >= 15) break;
            hF -= cut; hB -= cut;
          }
          let aF = 0.6, aB = 0.3;                             // :473-474（灰烬雨 0.9/0.4）
          if (wf.type === 5) { aF = 0.9; aB = 0.4; }
          if (j > len - 8) {                                  // 末 8 格衰减（:480-484）
            const k = (len - j) / 8;
            aF *= k; aB *= k;
          }
          if (bgTex) {
            ctx.globalAlpha = Math.max(0, Math.min(1, aB));
            ctx.drawImage(bgTex, frameBg * 18, 0, 16, hB, px - 8, py - 8, 16, hB);
          }
          ctx.globalAlpha = Math.max(0, Math.min(1, aF));
          ctx.drawImage(fgTex, frameFg * 18, 0, 16, hF, px - 8, py - 8, 16, hF);
          px += j % 2 === 0 ? 1 : -1;
          py += 16;
        }
        ctx.globalAlpha = 1;
        continue;
      }
      const texImg = tex[wf.type] ?? tex[0];
      if (!texImg) continue;
      // 岩浆瀑布收集光照格(AddLight :1075-1080:整条橙光,夜晚可见)——
      // 由 Renderer 消费注入 LightingEngine(canvas 无 StylizeColor 通道调制,略)
      // 帧槽 32px×40px 胶片条:【主水流带在 y=24 行、32px 整槽宽】(WaterfallManager :740/:744/
      //  :754-758 全部 Rectangle(num21, 24, 32, 16-…));y=0 行 16px 是浅流细带(:767-776,
      //  液量小的辅助层)。曾错取 (帧+16, 0, 16) —— 一直画浅流带,瀑布呈细白线"贴图不对"
      const slot = 32 * (wf.type === 0 ? regular : slow);
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
        // ---- 坡面分支（WaterfallManager.cs:576-587 flag2）----
        // 下方格是顶坡（slope 1/2）且本格非半砖且非雪（type!=19）：水流贴坡斜向
        // 下行——方向 = 坡朝向（slope 1 → 右 / 2 → 左），垂直步进照常
        const belowSlope = st.slope[bi] === 1 || st.slope[bi] === 2;
        let slopeSlant = 0;
        if (belowSlope && !st.half[ci] && st.type[bi] !== 19) {
          const dir = st.slope[bi] === 1 ? 1 : -1;
          slopeSlant = dir;
          if (lastH === -dir) {
            // 溅落 2px 斜切片（:739-748 flag2 && num17!=num31）：格底上移 2px、
            // 高度收 2px 的斜切带，方向翻转侧用 FlipHorizontally（canvas 镜像实现）
            const depthS = 16 - Math.floor(st.liquid[ci] / 16) - 2;
            if (depthS > 0) {
              ctx.save();
              if (dir === 1) {
                ctx.translate(cx * 16 + 16, cy * 16 + 16 - 2);
                ctx.scale(-1, 1);
                ctx.drawImage(texImg, slot, 24, 32, depthS, -32, -depthS, 32, depthS);
              } else {
                ctx.drawImage(texImg, slot, 24, 32, depthS, cx * 16, cy * 16 + 14, 32, depthS);
              }
              ctx.restore();
            }
          }
          dx = dir; dy = 1; lastH = dir;
        }
        // ---- 走向决策（L452-507）----
        if (slopeSlant === 0 && (!solidT(cx, cy + 1) || st.type[bi] === 0) && !st.half[ci]) {
          // 直落门（L470）：下方非实心 且 本格非半砖——唇缘半砖格不直落
          turns = 0; dy = 1; dx = 0;
        } else if (slopeSlant === 0 && (solidT(cx - 1, cy) || st.liquid[li] > 0) && (!solidT(cx + 1, cy) && st.liquid[ri] === 0)) {
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
        if (wf.type === 1) this.litCells.push(cx, cy);
        let alpha = wf.type === 1 ? 1.0 : wf.type === 2 ? 0.8
          : (st.wall[ci] !== 0 || cy >= groundLevel ? 0.6 : 1.0);
        if (step > WATERFALL_DIST - 10) alpha *= (WATERFALL_DIST - step) / 10;
        const depth = 16 - Math.floor(liq / 16);     // num43:按格内液量裁掉底部
        const hitGround = solidT(cx, cy + 1) && !st.half[ci];
        const yOff = hitGround ? 8 : 0;              // 撞地格上移 8px（L531-534）
        ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
        if (depth > 0) {
          // 主带 32px 整槽(:740/:744):以瀑布格为中心向左右各伸半格
          // (原版 FlipHorizontally 分支为水平流段纹理方向,canvas 不镜像近似)
          ctx.drawImage(texImg, slot, 24, 32, depth, cx * 16 - 16, cy * 16 + yOff, 32, depth);
        }
        // 转向浅流过渡带(:762-776):上一格水平流、本格转直落 → 在本格补 y=0 行的
        // 16px 浅流片(顶部细流衔接,画于格内偏下 8px 区)
        if (dx === 0 && dy === 1 && lastH !== 0 && depth > 8) {
          const shSh = depth - 8;
          if (shSh > 0) {
            ctx.drawImage(texImg, slot, 0, 16, shSh, cx * 16, cy * 16 + 8, 16, shSh);
          }
        }
        // 撞地溅落片(:785-798):下方实心 → 地面行顶画 8px 外溢水花(32px 宽向两侧铺开)
        if (hitGround) {
          ctx.drawImage(texImg, slot, 24, 32, 8, cx * 16 - 16, (cy + 1) * 16, 32, 8);
        }
        if (liq > 0 && !st.half[ci]) break;         // 溶入液池（L777-778）
        cx += dx; cy += dy;
      }
    }
    ctx.globalAlpha = 1;
  }

  get count() { return this.falls.length; }
  /** 最近一帧岩浆瀑布的绘制格(x,y 扁平对;AddLight 消费用) */
  litCells: number[] = [];
}
