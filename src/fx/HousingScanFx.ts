// ★BJ654 住房检测扫描视觉（2026-10-12 用户实报「原版住房检测有扫描视觉,每格一个小点」）。
// RichRoomCheckFeedback（Terraria.DataStructures/RichRoomCheckFeedback.cs）发射面 1:1：
//   - 触发链=Main.PerformHousingCheck（Main.cs:45918-45924）→ MoveTownNPC(x,y,-1,
//     RichRoomCheckFeedback.Instance)（StopOnFail=false/DisplayText=false——纯视觉跑,
//     与文案跑 NoRoomCheckFeedback.WithText 并列双跑）。本仓采集面在 Housing.ts
//     （RoomScanTrace 判定链可选出参）,本文件只做发射（判定零耦合）。
//   - EndSpread（:EndSpread,cs 文件内单方法域）：消耗面（同格 good 被非-good 压掉）→
//     波参数 num=3×maxDist(欧氏,格域)+60 → 逐格发射：Delay=(int)(3×dist)（3 格/拍
//     波前）,TTL=(num−Delay)×scaleMul（good=1.5,余 1）,FadeIn=Remap(num−24,Delay,num),
//     FadeOut=Remap(num−6,Delay,num)。
//     分型贴图/色（:EndSpread switch）：
//       good      → Extra[293] 16×16 青点 Color.Cyan*0.7f 后 A/=2 = (0,178,178,89)
//                   （家具四表格 skip→图钉面）;
//       blocked   → Extra[292] 分型赋值后 continue——【永不发射】（反编译逐字：
//                   赋值+continue,实心/门锚边界格净零点）;
//       openAir   → Extra[292] 红 X new Color(255,40,40,255);
//       hazard    → 同 openAir（臭虫 630/631）;
//       unsafeWall→ Extra[298] 红十字 (255,40,40,255)。
//     家具图钉面（第二循环）：CountsAsTable/Chair/Torch/Door 首件各一（旗去重）,
//     桌 Extra[297]/椅 Extra[295]/门 Extra[296]/光源 Extra[294],色 LimeGreen*0.8f
//     后 A/=2 = (40,164,40,102);锚位=TileObjectData.TryGetTileBounds（TileObjectData.
//     cs:5164-5195）盒 ((L+R)/2, min(T/2+B/2,T+1))*16+(0,−texH/2),再 Y−=32 起、
//     Velocity=(0,80)/TTL、Acceleration=−Velocity×1.25/TTL（升 32px 缓动）。
//   - EndScoring（ScoreRoom ReportScore/SetAsHighScore 候选点,WorldGen.cs:5914/:5946）：
//     num3=3×maxDist+90;候选点（score≠0 且非最优）=Extra[293] @(x*16+8,y*16−8)
//     Scale2,正分 LimeGreen×(0.5+0.5×score/best)、负分 Red×(score/−best)（两支分母
//     符号相反,比值恒正）;最优点=OurFavoriteColor(255,231,69)（Main.cs:886）Scale3;
//     best.score==0（无合格站位/占用/整房作废）→ 整段早退零点（:EndScoring 首门）。
//   - 承载=fadingParticles 池（fx/FadingParticles.ts——FadingParticle 1:1;原版
//     RoomCheckParticle :class FadingParticle,入 Main.ParticleSystem_World_OverPlayers
//     =Main.cs:63208 玩家上层,本仓 Renderer.drawFadingParticles 7d'' 层同位直收;
//     fullbright 缺省 true=原版 SetTypeInfo 缺省,免光照恒亮）。
//   已登记微偏差（视觉域,判定面零涉）：①失败检测的泛洪覆盖域——原版 StopOnFail=false
//   全域续扫（红点逐格铺满问题墙),本仓判定 floodRoom 首失败即折返（红点止于首败格+
//   已扫格青点）;②泛洪遍历序——原版栈 LIFO/本仓队列 FIFO（Set 语义同集,仅影响家具
//   去重「首件」取择与同格多旗的采集先后,净点集等价）;③家具图钉锚位 TryGetTileBounds
//   的 subTiles 记录维度漂移（base 记录缺 sty 时回落 /18 步进约定,Game.ts:22221 同构）。
import { fadingParticles } from './FadingParticles';
import { TILE_DEFS } from '../data/tiles';
import { anchorSpecOf } from '../world/TileAnchorValidator';
import { COUNTS_AS_DOOR, COUNTS_AS_TABLE, COUNTS_AS_TORCH, COUNTS_AS_CHAIR,
  type RoomScanTrace } from '../world/Housing';
import type { TileStore } from '../world/TileStore';

/** XNA Color*float 截断（FNA op_Multiply:(byte)(v*f) 直断零——家具/评分动态色域） */
const xnaB = (v: number): number => Math.max(0, Math.min(255, Math.trunc(v)));

/** Utils.Remap(v,lo,hi,0,1) 钳位版（Utils.cs:1393-1397） */
const remapNorm = (v: number, lo: number, hi: number): number => {
  if (hi === lo) return v >= hi ? 1 : 0;
  return Math.min(1, Math.max(0, (v - lo) / (hi - lo)));
};

/** 发射规格（fadingParticles.spawn 直灌面;纯数据供测试锁定） */
export interface RoomScanSpec {
  texKey: string;
  x: number; y: number;
  vx: number; vy: number; ax: number; ay: number;
  delay: number;
  timeToLive: number;
  fadeIn: number; fadeOut: number;
  tint: readonly [number, number, number, number];
  scale: number;
}

/** 家具图钉贴图高（Extra[294..297] 全 22×36——val.Height() 消费位;PNG 尺寸已核） */
const FURN_TEX_H = 36;

/** TryGetTileBounds 等价（TileObjectData.cs:5164-5195）：sty 记录走精确步进
 *  （CoordinateWidth 逐格回退/CoordinateHeights 逐行回退）;base 缺 sty 回落 /18
 *  步进约定（本仓多格原点反解既定惯例,Game.ts:22221/:24509 同构）。 */
function furnitureTileBounds(st: TileStore, x: number, y: number):
{ x: number; y: number; w: number; h: number } {
  const i = st.idx(x, y);
  const t = st.type[i];
  const def = t ? TILE_DEFS[t] : undefined;
  const sheet = def?.vanilla?.sheet ?? -1;
  const w = Math.max(1, def?.w ?? 1);
  const h = Math.max(1, def?.h ?? 1);
  const fx = st.frameX[i], fy = st.frameY[i];
  const rec = sheet >= 0 ? anchorSpecOf(sheet) : null;
  if (rec?.sty) {
    const { cw, cp, hts } = rec.sty;
    let bx = x;
    const fullW = (cw + cp) * rec.w;
    let rem = fx - Math.floor(fx / fullW) * fullW;
    while (rem >= cw) { rem -= cw; bx--; }
    let by = y;
    const fullH = hts.reduce((a, v) => a + v + cp, 0);
    let remY = fy - Math.floor(fy / fullH) * fullH;
    for (const hh of hts) {
      if (remY >= hh) { remY -= hh; by--; }
    }
    return { x: bx, y: by, w: rec.w, h: rec.h };
  }
  // /18 回落（帧编码=style带×(18×footprint)+格内 dx/dy×18;mod 脚印取格内偏移）
  return {
    x: x - (Math.floor(fx / 18) % w),
    y: y - (Math.floor(fy / 18) % h),
    w, h,
  };
}

/** 格 vanilla sheet（EndSpread 逐格 `Main.tile[x,y].type` 消费位;幽灵格/出界=-1——
 *  家具四表全不含 -1,good 青点不受影响） */
function sheetAt(st: TileStore, x: number, y: number): number {
  if (x < 0 || y < 0 || x >= st.w || y >= st.h) return -1;
  const i = st.idx(x, y);
  const t = st.type[i];
  return t ? (TILE_DEFS[t]?.vanilla?.sheet ?? -1) : -1;
}

/** RichRoomCheckFeedback.EndSpread+EndScoring 1:1——发射规格构建（纯函数,测试锁定面）。
 *  与原版同构：采集序=scan.entries（floodRoom 处理序）;贴图/色/波参数逐值见头注。 */
export function buildRoomCheckScanParticles(st: TileStore, scan: RoomScanTrace): RoomScanSpec[] {
  const specs: RoomScanSpec[] = [];
  const entries = scan.entries;
  if (entries.length === 0) return specs;
  const ox = scan.originX, oy = scan.originY;
  const dist = (ex: number, ey: number): number => Math.hypot(ex - ox, ey - oy);
  // ---- 消耗面（EndSpread 首循环）：同格 good vs 非-good → good 消耗 ----
  const consumed = new Array<boolean>(entries.length).fill(false);
  for (let i = 0; i < entries.length; i++) {
    const a = entries[i];
    if (a.kind !== 'good') continue;
    for (let j = 0; j < entries.length; j++) {
      const b = entries[j];
      if (a.x === b.x && a.y === b.y && b.kind !== 'good') { consumed[i] = true; break; }
    }
  }
  // ---- 波参数：maxDist（GetHighestDistanceFromOrigin,格域欧氏）→ num=3d+60 ----
  let maxDist = 0;
  for (const e of entries) {
    const d = dist(e.x, e.y);
    if (d > maxDist) maxDist = d;
  }
  const num = 3 * maxDist + 60;
  // ---- 发射面 1（EndSpread 主循环）----
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    if (consumed[i]) continue;
    const sheet = sheetAt(st, e.x, e.y);
    let texKey = 'vanilla/Extra_293.png';
    let tint: readonly [number, number, number, number] = [0, 178, 178, 89];   // Cyan*0.7f, A/=2
    let scaleMul = 1;
    switch (e.kind) {
      case 'blocked':
        continue;                       // BlockedWall 支：赋值后 continue=永不发射（反编译逐字）
      case 'openAir':
      case 'hazard':
        texKey = 'vanilla/Extra_292.png';
        tint = [255, 40, 40, 255];
        break;
      case 'unsafeWall':
        texKey = 'vanilla/Extra_298.png';
        tint = [255, 40, 40, 255];
        break;
      default:                          // good
        scaleMul = 1.5;
        if (COUNTS_AS_TABLE.has(sheet) || COUNTS_AS_CHAIR.has(sheet)
          || COUNTS_AS_TORCH.has(sheet) || COUNTS_AS_DOOR.has(sheet)) {
          continue;                     // 家具格 skip → 图钉面
        }
        break;
    }
    const delay = Math.trunc(3 * dist(e.x, e.y));
    const ttl = (num - delay) * scaleMul;
    if (ttl <= 0) continue;
    specs.push({
      texKey, x: e.x * 16 + 8, y: e.y * 16 + 8, vx: 0, vy: 0, ax: 0, ay: 0,
      delay, timeToLive: ttl,
      fadeIn: remapNorm(num - 24, delay, num),
      fadeOut: remapNorm(num - 6, delay, num),
      tint, scale: 1,
    });
  }
  // ---- 发射面 2（家具图钉,EndSpread 第二循环）：四类首件旗去重（序=采集序;
  //  多类同格逐 if 覆写=后类胜,与原版一致）----
  const seen = { table: false, chair: false, door: false, torch: false };
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    if (consumed[i]) continue;
    const sheet = sheetAt(st, e.x, e.y);
    let texKey: string | null = null;
    if (COUNTS_AS_TABLE.has(sheet)) { if (seen.table) continue; seen.table = true; texKey = 'vanilla/Extra_297.png'; }
    if (COUNTS_AS_CHAIR.has(sheet)) { if (seen.chair) continue; seen.chair = true; texKey = 'vanilla/Extra_295.png'; }
    if (COUNTS_AS_DOOR.has(sheet)) { if (seen.door) continue; seen.door = true; texKey = 'vanilla/Extra_296.png'; }
    if (COUNTS_AS_TORCH.has(sheet)) { if (seen.torch) continue; seen.torch = true; texKey = 'vanilla/Extra_294.png'; }
    if (!texKey) continue;
    const b = furnitureTileBounds(st, e.x, e.y);
    const delay = Math.trunc(3 * dist(e.x, e.y));
    const ttl = num - delay;
    if (ttl <= 0) continue;
    // 锚位：((L+R)/2, min(T/2+B/2, T+1))*16 + (0,−texH/2),再 Y−=32;
    // Velocity=(0,80)/TTL、AccelerationPerFrame=−Velocity×1.25/TTL（升程缓动）
    const px = ((b.x + b.x + b.w) / 2) * 16;
    const py = Math.min(b.y / 2 + (b.y + b.h) / 2, b.y + 1) * 16;
    const vy = 80 / ttl;
    const ay = (-vy * 1.25) / ttl;
    specs.push({
      texKey, x: px, y: py - FURN_TEX_H / 2 - 32, vx: 0, vy, ax: 0, ay,
      delay, timeToLive: ttl,
      fadeIn: remapNorm(num - 24, delay, num),
      fadeOut: remapNorm(num - 6, delay, num),
      tint: [40, 164, 40, 102],   // LimeGreen*0.8f, A/=2
      scale: 1,
    });
  }
  // ---- 发射面 3（EndScoring）：best.score==0 整段早退（占用/无站位/整房作废）----
  const best = scan.best;
  if (!best || best.score === 0) return specs;
  const num3 = 3 * maxDist + 90;
  for (const s of scan.scores) {
    if (s.score === 0) continue;
    if (s.x === best.x && s.y === best.y) continue;
    const delay = Math.trunc(3 * dist(s.x, s.y));
    const ttl = num3 - delay;
    if (ttl <= 0) continue;
    const f = s.score > 0
      ? 0.5 + (0.5 * s.score) / best.score
      : s.score / -best.score;
    const tint: readonly [number, number, number, number] = s.score > 0
      ? [xnaB(50 * f), xnaB(205 * f), xnaB(50 * f), xnaB(255 * f)]
      : [xnaB(255 * f), 0, 0, xnaB(255 * f)];
    specs.push({
      texKey: 'vanilla/Extra_293.png', x: s.x * 16 + 8, y: s.y * 16 + 8 - 16,
      vx: 0, vy: 0, ax: 0, ay: 0, delay, timeToLive: ttl,
      fadeIn: remapNorm(num3 - 24, delay, num3),
      fadeOut: remapNorm(num3 - 6, delay, num3),
      tint, scale: 2,
    });
  }
  { // 最优点（OurFavoriteColor 金黄,Scale 3;vanilla for(k<1) 单发）
    const delay = Math.trunc(3 * dist(best.x, best.y));
    const ttl = num3 - delay;
    if (ttl > 0) {
      specs.push({
        texKey: 'vanilla/Extra_293.png', x: best.x * 16 + 8, y: best.y * 16 + 8 - 16,
        vx: 0, vy: 0, ax: 0, ay: 0, delay, timeToLive: ttl,
        fadeIn: remapNorm(num3 - 24, delay, num3),
        fadeOut: remapNorm(num3 - 6, delay, num3),
        tint: [255, 231, 69, 255], scale: 3,
      });
    }
  }
  return specs;
}

/** 入池（fadingParticles=ParticleSystem_World_OverPlayers 本仓等位;Game.fixedUpdate
 *  步进/Renderer.drawFadingParticles 7d'' 绘制均已就位,零新基建） */
export function spawnRoomCheckScan(st: TileStore, scan: RoomScanTrace): void {
  for (const s of buildRoomCheckScanParticles(st, scan)) {
    fadingParticles.spawn({
      x: s.x, y: s.y, vx: s.vx, vy: s.vy, ax: s.ax, ay: s.ay,
      delay: s.delay, timeToLive: s.timeToLive,
      fadeIn: s.fadeIn, fadeOut: s.fadeOut,
      tint: s.tint, texKey: s.texKey, scale: s.scale,
      fullbright: true,   // SetTypeInfo 缺省（RoomCheckParticle 恒亮）
    });
  }
}
