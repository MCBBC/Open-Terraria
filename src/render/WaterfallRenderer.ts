// 原版 1.4.0.5 WaterfallManager.cs 移植：液体从半砖唇缘倾泻的长条瀑布贴图。
// 与 LiquidRenderer 的 P3 瀑布拖尾（10 格内液体本体渐隐）互补——这里画的是
// 独立的 Waterfall_N 贴图柱（最长 100 格），触发条件 = 原版 halfBrick 唇缘（L100-130）。
// 照抄原版：
//  - 贴图 Waterfall_N.png：512×40 胶片条，帧宽 32、16 帧。每帧左右半幅分工：
//    左半 (fx,0,16,*) = 竖直下落条；右半 (16+fx,0,16,*) = 水平横流条；
//    y=24 行 32px = 坡面/持续竖直柱的宽带（见 draw 内滞后状态机注释）
//  - 帧速：水 regularFrame 每 3 tick、岩浆/蜂蜜 slowFrame 每 7 tick（L171-209）
//  - 透明度：岩浆 1.0 / 蜂蜜 0.8 / 水地表 1.0、地下或有墙 0.6；末 10 格线性衰减（L538-551）
//  - 走向决策（L421-507）：唇缘半砖格不满足直落门（!halfBrick）→ 先向空侧平移 1 格再落；
//    偏折计数 num23 仅方向反转时累加、直落清零、≥2 翻转方向（次格循环头即断）
//  - 断流：完整实心块（blockType==0）停（L427）；溶入液池 liquid>0 && !halfBrick 停（L777）
//  - 撞地（num11=8）：y=0 行竖条/横流条下沉 8px 入地；另补 8px 溅片于本格顶部（:779-798）
//  - 雨幕（WaterfallManager :204-260 触发 + :360-517 绘制）：雨云 196/雪云 460/灰烬云 717
//    下方格 !Solid && liquid==0 && slope==0 → 雨丝柱：雨 25 格/雪 50 格，双层贴图
//    （前景 Waterfall_11 alpha 0.6 + 背景 12 alpha 0.3；雪 22 单层；灰烬雨 26+27），
//    18px 窄条 8 帧动画（前景每 tick 正播、偶列 +3 相位；背景每 3 tick 倒播 +2 偏移）、
//    每格 x ±1 交错、末 8 格线性衰减、撞实心停、液面裁剪
//  - 坡面分支（1456 WaterfallManager.cs:576-587 flag2）：下方顶坡（slope 1/2）格 →
//    贴坡斜向下行 + 溅落 2px 斜切片（:739-748，翻转侧 FlipHorizontally 以镜像实现）
// 省略（周边系统缺失）：彩虹/荧光砖改写（num34 switch :657-672）、BlocksWaterDrawingBehindSelf
//   横流条半高、雨云邻接缩短 num22（:947-950）、环境音、Grate 穿透。
import type { SpriteAtlas } from '../assets/SpriteAtlas';
import type { TileStore } from '../world/TileStore';
import { TILE_DEFS, TILE_BY_KEY } from '../data/tiles';
import { gfxQuality } from '../core/GfxQuality';

interface Waterfall { x: number; y: number; type: number; } // type: 0水 1岩浆 2蜂蜜 3雨幕 4雪幕 5灰烬雨幕（本仓库编码）

const BASE_MAX_FALLS = 1000;   // 原版 maxWaterfallCount
/** 原版 qualityMax = maxWaterfallCount(1000) × gfxQuality(WaterfallManager.cs:117)
 *  ——自动画质系统接入(2026-08-18):q 降则瀑布数量上限同缩 */
const MAX_FALLS = () => Math.floor(BASE_MAX_FALLS * gfxQuality.value);
/** 原版 waterfallDist = 75×gfxQuality + 25(WaterfallManager.cs:116) */
const WATERFALL_DIST = () => Math.floor(75 * gfxQuality.value) + 25;

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

  /** 环境音累积（Main.cs:2285-2289 ambientWaterfall* + WaterfallManager.cs:962-964）：
   *  绘制期逐瀑布格按屏心距离衰减累积强度（:713-719 num42=1−dist/(screenWidth×0.75)），
   *  Main.Ambience(:13636) 每 15t 消费 → SoundID 34/35 循环音（强度=音量档） */
  ambWf = { x: -1, y: -1, strength: 0 };
  ambLava = { x: -1, y: -1, strength: 0 };

  /** 环境音状态消费口（Game 每 15t 读） */
  ambienceState(): { wf: { x: number; y: number; strength: number }; lava: { x: number; y: number; strength: number } } {
    return { wf: this.ambWf, lava: this.ambLava };
  }

  /** CheckForWaterfall(WaterfallManager.cs:95):活动瀑布格线性查——
   *  浸润带的"半砖+侧液>160+瀑布→让位"门消费(:3906) */
  checkForWaterfall(x: number, y: number): boolean {
    for (const f of this.falls) if (f.x === x && f.y === y) return true;
    return false;
  }

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
    const WD = WATERFALL_DIST();
    const x0 = Math.max(2, tx0 - WD), x1 = Math.min(st.w - 3, tx1 + WD);
    const y0 = Math.max(2, ty0 - WD), y1 = Math.min(st.h - 3, ty1 + 20);
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
        if (this.falls.length >= MAX_FALLS()) return;
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
        if (this.falls.length >= MAX_FALLS()) return;
      }
    }
  }

  /** 水样式 → 瀑布贴图偏移表（WaterfallManager.Draw :1173-1227 通道表逐对提取:
   *  DrawWaterfall(贴图号, liquidAlpha[水样式号])——贴图 1/2 被岩浆/迪斯科喷泉占用,
   *  水样式从 2 起错位;猩红 10→13、地下沙漠 12→23、地狱 13→24;样式 11 蜂蜜走
   *  液体类型 14 通道、14 微光走 25,均无水通道。★曾两连错:恒等映射(样式 2 套到
   *  灰色迪斯科贴图 Waterfall_2)与"恒 Waterfall_0"——后者只看了第一条通道) */
  draw(ctx: CanvasRenderingContext2D, atlas: SpriteAtlas | null, st: TileStore, groundLevel: number, nowMs: number, waterStyle = 0) {
    if (!atlas) {
      // atlas 缺失也留痕（debugState 消费）；条目空则由 debugState 的 count:0 表达
      this.lastDraw = { ms: nowMs, regular: Math.floor(nowMs / 50) % 16, slow: Math.floor(nowMs / 117) % 16,
        atlasReady: false, sheetsOk: [false, false, false], waterStyle, waterfallSheet: null };
      return;
    }
    if (this.falls.length === 0) return;
    this.litCells.length = 0; // 岩浆光照格每帧重建(防无岩浆帧残留旧光)
    this.ambWf.strength = 0;  // 环境音强度逐帧重建（Main.Ambience 消费,同 litCells 语义）
    this.ambLava.strength = 0;
    const tex = SHEET.map((s) => atlas.ensureVImage(s) ?? null);
    // 水体瀑布按群系水色换贴图(通道表偏移;未知样式回退 0)
    const STYLE_TEX: Record<number, number> = {
      0: 0, 2: 3, 3: 4, 4: 5, 5: 6, 6: 7, 7: 8, 8: 9, 9: 10, 10: 13, 12: 23, 13: 24,
    };
    const waterTex = atlas.ensureVImage(`vanilla/Waterfall_${STYLE_TEX[waterStyle] ?? 0}.png`);
    if (waterTex) tex[0] = waterTex;
    // 最近一次 draw 参数（debugState 消费；atlas 缺失/条目空也记录——这本身是
    // "瀑布没画出来/水瀑布颜色错误"类报告的关键证据）
    this.lastDraw = { ms: nowMs, regular: Math.floor(nowMs / 50) % 16, slow: Math.floor(nowMs / 117) % 16,
      atlasReady: true, sheetsOk: [!!tex[0], !!tex[1], !!tex[2]],
      waterStyle, waterfallSheet: `vanilla/Waterfall_${STYLE_TEX[waterStyle] ?? 0}.png` };
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
          // 环境音累积（★type 3 雨幕计入=刻意偏离,原版排除 Rain 11/12——放置雨云的
          // 可见水幕无声=用户实报预期落差;衰减公式同 WaterfallManager.cs:713-719）
          if (wf.type === 3) {
            const sw2 = ctx.canvas.width, sh2 = ctx.canvas.height;
            const d39 = Math.abs(wf.x * 16 + 8 - sw2 / 2), d40 = Math.abs((wf.y + j) * 16 + 8 - sh2 / 2);
            if (d39 < sw2 * 2 && d40 < sh2 * 2) {
              const falloff = 1 - Math.hypot(d39, d40) / (sw2 * 0.75);
              if (falloff > 0) { this.ambWf.strength += falloff * aF; this.ambWf.x = wf.x * 16 + 8; this.ambWf.y = (wf.y + j) * 16 + 8; }
            }
          }
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
      // 【2026-08-12 五返重对齐】1456 DrawWaterfall(:314-960)逐格绘制是"滞后状态机":
      // 循环尾 :940-945 回填 num15=上格水平步 / num16=上格竖直步 / num18=上格水平向 /
      // num19=上格坡向,各绘制分支按这些滞后量分派(此前误读为死变量):
      //  · 竖直格(:823):上格也竖直(num16≠0) → y=24 行 32px 宽带(:831-840,x-1 起 Flip);
      //    上格非竖直(水平/坡后首格) → y=0 行左半幅 16px 竖条(:827/:843,带 num11 下沉)
      //  · 水平格(:852 switch num32):非坡 → (16+slot,0,16,16) 右半幅横流条,向右 Flip/
      //    向左 None(:885/:908);坡上横移(num30=±1) → 8×2px 扇形切片(:858-901)
      //  · 坡面格 32px 主带(:801)仅当上格非水平(num15==0);flag2 溅落切片(:739)门 =
      //    坡向≠上格水平向(num17!=num31);坡转竖浅流(:761) / 撞地 8px 溅片(:779) /
      //    竖转坡白带(:747) 同为滞后门
      // 旧实现所有格子一律画 32px y=24 宽带且左移半格:唇缘格宽带压到西邻池面格
      //  (用户标注 1484,587),坡面切片条件也错(lastH===-dir 应为 num17!=num31)。
      const slot = 32 * (wf.type === 0 ? regular : slow);
      let cx = wf.x, cy = wf.y; // 原版从唇缘格本体开始画（半砖 blockType=1 不断流，L427）
      let dx = 0, dy = 0;       // num32/num33：本步位移
      let slopeDir = 0;         // num30：本步坡向（flag2 分支）
      let hDir = 0;             // num17：水平向记忆
      let n18 = 0;              // num18：水平向滞后（坡面分支即时同步，尾部 = num17）
      let pHoriz = 0;           // num15：上格水平步
      let pVert = false;        // num16：上格竖直步
      let pSlope = 0;           // num19：上格坡向
      let yOff = 0;             // num11：撞地下沉（:536 下方实心且非半砖 → 8）
      let turns = 0;            // num29：滞留/反转计数
      // SolidTile 语义（WorldGen.SolidTile：实心 && !platform && !half && !slope）
      const solidT = (x: number, y: number) => {
        if (x < 0 || y < 0 || x >= st.w || y >= st.h) return false;
        const i = st.idx(x, y);
        const t = st.type[i];
        if (t === 0) return false;
        const d = TILE_DEFS[t];
        return !!d && d.solid && !d.platform && !st.half[i] && st.slope[i] === 0;
      };
      const topSlopeAt = (x: number, y: number) => {
        if (x < 0 || y < 0 || x >= st.w || y >= st.h) return false;
        const s = st.slope[st.idx(x, y)];
        return s === 1 || s === 2;
      };
      const botSlopeAt = (x: number, y: number) => {
        if (x < 0 || y < 0 || x >= st.w || y >= st.h) return false;
        const s = st.slope[st.idx(x, y)];
        return s === 3 || s === 4;
      };
      // 水平镜像绘制（SpriteEffects.FlipHorizontally 的 canvas 等价）
      const drawFlipped = (
        flip: boolean, sx: number, sy: number, sw: number, sh: number,
        px: number, py: number, dw: number, dh: number,
      ) => {
        if (sh <= 0 || dh <= 0) return;
        if (!flip) { ctx.drawImage(texImg, sx, sy, sw, sh, px, py, dw, dh); return; }
        ctx.save();
        ctx.translate(px + dw, py);
        ctx.scale(-1, 1);
        ctx.drawImage(texImg, sx, sy, sw, sh, 0, 0, dw, dh);
        ctx.restore();
      };
      for (let step = 0, WD2 = WATERFALL_DIST(); step < WD2; step++) {
        if (turns >= 2) break;                          // 循环头 :533-536
        if (cx < 1 || cy < 1 || cx >= st.w - 1 || cy >= st.h - 1) break;
        const ci = st.idx(cx, cy);
        // 完整实心块（blockType==0）断流；半砖/坡面豁免（L427）
        if (solidT(cx, cy) && !st.half[ci] && st.slope[ci] === 0) break;
        const li = ci - 1, ri = ci + 1, bi = ci + st.w;
        // num11（:536）：下方实心且本格非半砖 → 8（撞地下沉）；否则上格竖直时归零
        if (solidT(cx, cy + 1) && !st.half[ci]) yOff = 8;
        else if (pVert) yOff = 0;
        const lag31 = n18;                              // num31 = 本格决策前的 num18
        // ---- 走向决策（:579-647）----
        slopeDir = 0;
        if (topSlopeAt(cx, cy + 1) && !st.half[ci] && TILE_DEFS[st.type[bi]]?.vanilla?.sheet !== 19) {
          // cs:590 原文 tile5.type != 19 = 平台豁免——曾直传原版 id 19 进内部空间
          // (内部 19=蘑菇,平台豁免失效)
          // flag2 坡面分支：下方顶坡 → 贴坡斜行（num30=num32=±1, num33=1）
          slopeDir = st.slope[bi] === 1 ? 1 : -1;
          dx = slopeDir; dy = 1; hDir = slopeDir; n18 = slopeDir;
        } else if ((!solidT(cx, cy + 1) && !botSlopeAt(cx, cy + 1) && !st.half[ci]) || (st.type[bi] === 0 && !st.half[ci])) {
          turns = 0; dy = 1; dx = 0;                    // 直落（:610-613）
        } else if ((solidT(cx - 1, cy) || topSlopeAt(cx - 1, cy) || st.liquid[li] > 0) && !solidT(cx + 1, cy) && st.liquid[ri] === 0) {
          if (hDir === -1) turns++;
          dx = 1; dy = 0; hDir = 1;                     // 左堵/左液 → 右移（:615-623）
        } else if ((solidT(cx + 1, cy) || topSlopeAt(cx + 1, cy) || st.liquid[ri] > 0) && !solidT(cx - 1, cy) && st.liquid[li] === 0) {
          if (hDir === 1) turns++;
          dx = -1; dy = 0; hDir = -1;                   // 右堵/右液 → 左移（:625-633）
        } else if (((!solidT(cx + 1, cy) && !topSlopeAt(cx, cy)) || st.liquid[ri] === 0) && !solidT(cx - 1, cy) && !topSlopeAt(cx, cy) && st.liquid[li] === 0) {
          dy = 0; dx = hDir;                            // 两侧皆空：保持水平向（:635-639）
        } else {
          turns++; dy = 0; dx = 0;                      // 四面皆堵：滞留（:641-644）
        }
        if (turns >= 2) { hDir *= -1; dx *= -1; }       // 翻转而非停止（:649-652）
        // ---- 绘制本格（按原版分支顺序）----
        const liq = st.liquid[ci];
        if (wf.type === 1) this.litCells.push(cx, cy);
        let alpha = wf.type === 1 ? 1.0 : wf.type === 2 ? 0.8
          : (st.wall[ci] !== 0 || cy >= groundLevel ? 0.6 : 1.0);
        if (step > WD2 - 10) alpha *= (WD2 - step) / 10;
        ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
        const num43 = Math.floor(liq / 16);             // 格内液量裁剪（:709）
        const x0 = cx * 16, y0 = cy * 16;
        if (slopeDir !== 0 && hDir !== lag31) {
          // flag2 溅落切片（:739-748）：格底上移 2px 的 32px 斜切带
          drawFlipped(lag31 === 1, slot, 24, 32, 16 - num43 - 2,
            lag31 === 1 ? x0 - 16 : x0, y0 + 14, 32, 16 - num43 - 2);
        }
        // （:747-758 竖转坡白过渡带：条件 num17!=num18 在坡面分支同步两者后恒假，
        //  原版死代码——不移植）
        if (pSlope !== 0 && dx === 0 && dy === 1) {
          // 坡转竖浅流片（:761-776）：y=0 行 16px，格内偏下 8px 区
          drawFlipped(hDir === 1, slot, 0, 16, 16 - num43 - 8, x0, y0 + yOff + 8, 16, 16 - num43 - 8);
        }
        if (yOff === 8 && pVert && pSlope === 0) {
          // 撞地 8px 溅片（:779-798）：画在本格顶部（非下一格行）
          drawFlipped(n18 !== -1, slot, 24, 32, 8, n18 === -1 ? x0 : x0 - 16, y0, 32, 8);
        }
        if (slopeDir !== 0 && pHoriz === 0) {
          // 坡面格主带（:801-821）：仅上格非水平时
          drawFlipped(lag31 === 1, slot, 24, 32, 16 - num43,
            lag31 === 1 ? x0 - 16 : x0, y0, 32, 16 - num43);
        } else if (dy === 1 && slopeDir === 0 && pSlope === 0) {
          // 竖直格主绘（:823-853）
          if (hDir === -1) {
            if (pVert) drawFlipped(false, slot, 24, 32, 16 - num43, x0, y0, 32, 16 - num43);
            else drawFlipped(false, slot, 0, 16, 16 - num43, x0, y0 + yOff, 16, 16 - num43);
          } else {
            if (pVert) drawFlipped(true, slot, 24, 32, 16 - num43, x0 - 16, y0, 32, 16 - num43);
            else drawFlipped(true, slot, 0, 16, 16 - num43, x0, y0 + yOff, 16, 16 - num43);
          }
        } else if (dx !== 0) {
          // 水平格（:852 switch num32）：格内有液且非半砖 → 不画（仅溶入）
          if (!(liq > 0 && !st.half[ci])) {
            if (slopeDir === dx) {
              // 坡上横移扇形切片（:858-869 向右 / :889-901 向左）：8×2px 交错下探
              for (let m = 0; m < 8; m++) {
                const xo = m * 2;
                const yo = dx === 1 ? xo : 14 - m * 2;
                const sxo = dx === 1 ? 14 - m * 2 : xo;
                const yTop = dx === 1 ? (pHoriz === 0 && m < 2 ? 4 : yo) : (pHoriz === 0 && m > 5 ? 4 : yo);
                drawFlipped(true, 16 + slot + sxo, 0, 2, 8, x0 + xo, y0 + 8 + yTop, 2, 8);
              }
            } else {
              // 普通横流条：右半幅 16px（:885 向右 Flip / :908 向左 None）
              drawFlipped(dx === 1, 16 + slot, 0, 16, 16, x0, y0 + yOff, 16, 16);
            }
          }
        } else if (dy === 0) {
          // 滞留格（:921-928 case 0）：画右半幅整条后终止
          if (liq <= 0 || st.half[ci]) {
            drawFlipped(false, 16 + slot, 0, 16, 16, x0, y0 + yOff, 16, 16);
          }
          break;                                        // k = 1000（:926）
        }
        if (liq > 0 && !st.half[ci]) break;             // 溶入液池（:931-934）
        // 尾部滞后回填（:940-945）+ 步进
        pVert = dy === 1;
        n18 = hDir;
        pHoriz = dx;
        cx += dx; cy += dy;
        pSlope = slopeDir;
        // 环境音累积（WaterfallManager.cs:709-719 num42=1−dist/(screenWidth×0.75)）：
        // 每瀑布格按到屏心距离衰减累加,最近格记位——Main.Ambience 每 15t 消费
        {
          const sw = ctx.canvas.width, sh = ctx.canvas.height;
          const d39 = Math.abs(cx * 16 + 8 - sw / 2), d40 = Math.abs(cy * 16 + 8 - sh / 2);
          if (d39 < sw * 2 && d40 < sh * 2) {
            const falloff = 1 - Math.hypot(d39, d40) / (sw * 0.75);
            if (falloff > 0) {
              if (wf.type === 0 || wf.type === 3) {
                // ★type 3 雨幕计入=刻意偏离（原版排除 Rain 11/12,Main.cs:709 排除表——
                // 但放置雨云的可见水幕无声=用户实报预期落差;天降雨幕不走本渲染器不受影响）
                this.ambWf.strength += falloff; this.ambWf.x = cx * 16 + 8; this.ambWf.y = cy * 16 + 8;
              } else if (wf.type === 1) {
                this.ambLava.strength += falloff; this.ambLava.x = cx * 16 + 8; this.ambLava.y = cy * 16 + 8;
              }
            }
          }
        }
      }
    }
    ctx.globalAlpha = 1;
  }

  get count() { return this.falls.length; }
  /** 最近一帧岩浆瀑布的绘制格(x,y 扁平对;AddLight 消费用) */
  litCells: number[] = [];
  /** 最近一次 draw 的关键参数（F5 调试报告消费；null = 尚未绘制过） */
  private lastDraw: { ms: number; regular: number; slow: number; atlasReady: boolean; sheetsOk: [boolean, boolean, boolean]; waterStyle?: number; waterfallSheet?: string | null } | null = null;

  /** 调试快照（DebugReport render.subsystems.waterfall）：条目数/类型分布/最近 draw 参数 */
  debugState(): object {
    const byType: Record<string, number> = { water: 0, lava: 0, honey: 0, rain: 0, snow: 0, ashRain: 0 };
    const names = ['water', 'lava', 'honey', 'rain', 'snow', 'ashRain'] as const;
    for (const wf of this.falls) {
      if (wf.type >= 0 && wf.type < names.length) byType[names[wf.type]]++;
    }
    return {
      count: this.falls.length,
      byType,
      findFrame: this.findFrame,
      lastFindFrame: this.lastFind,
      litCells: this.litCells.length >> 1,
      lastDraw: this.lastDraw,
    };
  }
}
