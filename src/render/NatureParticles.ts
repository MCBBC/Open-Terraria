// 自然层粒子 1:1：落叶（Gore SpecialAI 3 / Gore_UpdateLeaf :1104-1215）+ 滴水
//（Gore IsDrip 状态机 :383-530 + 碰撞转溅落 :955-985 + EmitLiquidDrops TileDrawing :7714）。
// 贴图 = Gore_N.png 懒加载（vanilla-atlas MISC 段已拷入 public/sprites/vanilla/）。
// 物理逐分支对源：落叶下落用 vy 兼作相位累加器走圆弧（UnitY.RotatedBy(vy)=(−sin,cos)，
// Y 取 |·|，地表加风力 ×4），碰撞 → vy=-1 转落地滑移/褪色支；滴水 0-6 蓄滴
//（随机等待+上方活性检查）→ 5 帧生成下落子滴(frame9) → 7-9 加速下落 → 碰撞/入水转 10-14 溅落。
import { TILE } from '../core/constants';
import type { SpriteAtlas } from '../assets/SpriteAtlas';
import type { TileStore } from '../world/TileStore';

// GoreID.Sets.IsDrip（GoreID.cs :15）
export const DRIP_GORES = new Set([706, 714, 713, 707, 715, 711, 1147, 709, 710, 708, 712, 716, 717, 943, 1160, 1161, 1162, 1383]);
// GoreID.Sets.SpecialAI==3（:9 落叶族）——SpriteFrame(32,8)：32 列=油漆色 × 8 行=旋转帧
export const LEAF_GORES = new Set([
  ...Array.from({ length: 925 - 910 + 1 }, (_, i) => 910 + i),
  ...Array.from({ length: 1121 - 1113 + 1 }, (_, i) => 1113 + i),
  ...Array.from({ length: 1255 - 1248 + 1 }, (_, i) => 1248 + i),
  1257, 1278,
]);

interface Leaf {
  x: number; y: number;
  vx: number; vy: number;     // vy<0 = 落地支（Gore_UpdateLeaf 分支条件）
  row: number; rowGroup: number; rowCounter: number;
  alpha: number; timeLeft: number;
  scale: number; gore: number;
  dead: boolean;
}

interface Drip {
  x: number; y: number;
  vy: number;
  type: number;
  frame: number; frameCounter: number;
  alpha: number;
  dead: boolean;
}

/** 盒碰撞（Gore 走 Collision.TileCollision 3-14px 盒）：逐轴探测，撞轴归零并回报 */
function boxCollide(st: TileStore, x: number, y: number, vx: number, vy: number, size: number): { nx: number; ny: number; nvx: number; nvy: number; hitX: boolean; hitY: boolean } {
  let nx = x, ny = y, hitX = false, hitY = false;
  if (vx !== 0) {
    const edge = vx > 0 ? x + size + vx : x + vx;
    const tx = Math.floor(edge / TILE);
    let blocked = false;
    for (let ty = Math.floor((y + 1) / TILE); ty <= Math.floor((y + size - 1) / TILE); ty++) {
      if (st.isSolid(tx, ty)) { blocked = true; break; }
    }
    if (blocked) { hitX = true; } else nx = x + vx;
  }
  if (vy !== 0) {
    const edge = vy > 0 ? y + size + vy : y + vy;
    const ty = Math.floor(edge / TILE);
    let blocked = false;
    for (let tx = Math.floor((x + 1) / TILE); tx <= Math.floor((x + size - 1) / TILE); tx++) {
      if (st.isSolid(tx, ty)) { blocked = true; break; }
    }
    if (blocked) { hitY = true; } else ny = y + vy;
  }
  return { nx, ny, nvx: hitX ? 0 : vx, nvy: hitY ? 0 : vy, hitX, hitY };
}

export class NatureParticles {
  leaves: Leaf[] = [];
  drips: Drip[] = [];
  private st: TileStore | null = null;
  maxLeaves = 220;
  maxDrips = 90;
  /** 滴水溅落音钩子（Game 注入 Sfx；Gore.cs :971-984：SoundID 39=Drip，
   *  落地 variant rand(0,1) / 入水 variant 2，位置 +8,+8；flag4 水型本模块内静音） */
  onDripSplash: ((x: number, y: number, wet: boolean) => void) | null = null;

  clear(): void { this.leaves.length = 0; this.drips.length = 0; }
  /** Game 每帧绑定当前世界 store */
  bindStore(st: TileStore): void { this.st = st; }

  private liquidAt(px: number, py: number): number {
    const st = this.st;
    if (!st) return 0;
    const tx = Math.floor(px / TILE), ty = Math.floor(py / TILE);
    if (!st.inBounds(tx, ty)) return 0;
    const i = st.idx(tx, ty);
    return st.liquid[i] > 0 ? st.liquidType[i] : 0; // 1水 2岩浆 3蜂蜜 4微光
  }

  // ================= 落叶（Gore_UpdateLeaf :1104） =================

  spawnLeaf(x: number, y: number, gore: number): void {
    if (this.leaves.length >= this.maxLeaves || !LEAF_GORES.has(gore)) return;
    const row = Math.floor(Math.random() * 8);
    this.leaves.push({
      x, y,
      vx: (Math.random() - 0.5) * 4, vy: Math.random() * Math.PI * 2, // NewGore 初速 :1423
      row, rowGroup: Math.floor(row / 4), rowCounter: Math.floor(Math.random() * 8), // :1425-1428
      alpha: 0, timeLeft: 900,
      scale: 0.7 + Math.random() * 0.6, // :8012
      gore, dead: false,
    });
  }

  /** 每固定 tick（Game.fixedUpdate）。wind = Main.WindForVisuals；worldSurfacePx=地表线像素 */
  updateLeaves(wind: number, worldSurfacePx: number): void {
    const st = this.st;
    if (!st) return;
    for (const l of this.leaves) {
      if (l.dead) continue;
      if (l.vy < 0) {
        // ---- 落地/滑移支（:1109-1150）----
        let moveX = l.vx;
        const liq = this.liquidAt(l.x + 4, l.y + 2);
        if (liq > 0) {
          // 蜂蜜 X=0 / 岩浆消亡 / 水 X=风力；地下 X=0（:1128-1140）
          moveX = liq === 3 ? 0 : wind;
          if (l.y > worldSurfacePx) moveX = 0;
        } else {
          const tx = Math.floor((l.x + 4) / TILE), ty = Math.floor((l.y + 4) / TILE);
          if (!st.isSolid(tx, ty + 1)) {
            l.vy = 0.1; l.timeLeft = 0; l.alpha = Math.min(255, l.alpha + 20); // :1136-1140
          }
        }
        const r = boxCollide(st, l.x, l.y, moveX, -0.2, 3); // vector3=(vx,-0.2) 盒 3px（:1115-1118）
        l.x = r.nx; l.y = r.ny;
        l.vx = r.nvx * 0.94; // :1145
        if (Math.abs(l.vx) < 0.01) l.vx = 0; // |Δ|<0.01 → 0（:1146）
        if (l.timeLeft > 0) l.timeLeft -= 1; // DisappearSpeed=1
        else l.alpha = Math.min(255, l.alpha + 1); // DisappearSpeedAlpha=1
        if (l.alpha >= 255) l.dead = true;
        continue;
      }
      // ---- 下落支（:1151-1215）----
      l.vy += Math.PI / 180; // :1151
      let mx = -Math.sin(l.vy);
      let my = Math.abs(Math.cos(l.vy)); // UnitY.RotatedBy(vy)，Y 取 |·|（:1152）
      if (l.y < worldSurfacePx) mx += wind * 4; // :1155-1157
      const r = boxCollide(st, l.x + 4, l.y, mx, my, 4);
      l.x = r.nx - 4; l.y = r.ny;
      if (r.hitX || r.hitY) l.vy = -1; // 碰撞 → 落地支（:1187）
      else {
        // 液面浮叶（:1207+ 与落地支同语义）：水面受风/地下静止
        const liq = this.liquidAt(l.x + 6, l.y + 6);
        if (liq > 0 && liq !== 2) {
          l.vy = -1;
          l.vx = l.y > worldSurfacePx ? 0 : wind;
        } else if (liq === 2) {
          l.dead = true; // 岩浆烧叶（:1130-1134）
        }
      }
      // 帧推进（Gore.Update :687-697：8 tick 一换，行在 4 帧组内循环）
      if (++l.rowCounter >= 8 && l.vy > 0.2) {
        l.rowCounter = 0;
        l.row++;
        if (l.row >= 4 + l.rowGroup * 4) l.row = l.rowGroup * 4;
      }
    }
    this.leaves = this.leaves.filter((l) => !l.dead);
  }

  // ================= 滴水（Gore.cs :383-530 + 碰撞 :955-985） =================

  spawnDrip(x: number, y: number, type: number): void {
    if (this.drips.length >= this.maxDrips || !DRIP_GORES.has(type)) return;
    this.drips.push({ x, y, vy: 0, type, frame: 0, frameCounter: 0, alpha: 0, dead: false });
  }

  private spawnChildFall(d: Drip): void {
    // frame==5 时生成下落子滴（:446-448：NewGore frame=9、速度清零）
    if (this.drips.length >= this.maxDrips) return;
    this.drips.push({ x: d.x, y: d.y, vy: 0, type: d.type, frame: 9, frameCounter: 0, alpha: 0, dead: false });
  }

  updateDrips(worldSurfacePx: number): void {
    const st = this.st;
    if (!st) return;
    for (const d of this.drips) {
      if (d.dead) continue;
      // alpha（:385-398）：943/1160-62 恒 0；地表以下 100；地表 0
      if (d.type === 943 || (d.type >= 1160 && d.type <= 1162)) d.alpha = 0;
      else if (d.y < worldSurfacePx + 8) d.alpha = 0;
      else d.alpha = 100;
      d.frameCounter++;
      let wait = 4;
      if (d.frame <= 4) {
        // 蓄滴（:399-449）：上方非活性格消亡；各帧随机等待
        const tx = Math.floor(d.x / TILE), ty = Math.floor(d.y / TILE) - 1;
        if (st.inBounds(tx, ty) && !st.flags[st.idx(tx, ty)]) { d.dead = true; continue; }
        if (d.frame <= 2) wait = 24 + Math.floor(Math.random() * 256);
        else if (d.frame === 3) wait = 24 + Math.floor(Math.random() * 96);
        // 原版另有 frame==5 特例(16+Next(64))——在 frame<=4 块内不可达=死代码，不移植
        if (d.type === 716) wait *= 2;
        if (d.type === 717) wait *= 4;
        if ((d.type === 943 || (d.type >= 1160 && d.type <= 1162)) && d.frame < 6) wait = 4;
        if (d.frameCounter >= wait) {
          d.frameCounter = 0; d.frame++;
          if (d.frame === 5) this.spawnChildFall(d);
        }
      } else if (d.frame <= 6) {
        wait = 8;
        if (d.type === 716) wait *= 2;
        if (d.type === 717) wait *= 3;
        if (d.frameCounter >= wait) {
          d.frameCounter = 0; d.frame++;
          if (d.frame === 7) { d.dead = true; continue; }
        }
      } else if (d.frame <= 9) {
        // 下落（:472-508）：6 tick 一帧，重力按水型；clamp [0.5,12]
        wait = 6;
        if (d.type === 716) { wait = Math.floor(wait * 1.5); d.vy += 0.175; }
        else if (d.type === 717) { wait *= 2; d.vy += 0.15; }
        else if (d.type === 943) { wait = Math.floor(wait * 1.5); d.vy += 0.2; }
        else d.vy += 0.2;
        if (d.vy < 0.5) d.vy = 0.5;
        if (d.vy > 12) d.vy = 12;
        if (d.frameCounter >= wait) { d.frameCounter = 0; d.frame++; if (d.frame > 9) d.frame = 7; }
        const preVy = d.vy;
        const r = boxCollide(st, d.x, d.y, 0, d.vy, 14); // TileCollision(position, velocity, 16, 14)
        d.x = r.nx; d.y = r.ny; d.vy = r.nvy;
        if (r.nvy !== preVy) {
          if (d.frame < 10) { d.frame = 10; d.frameCounter = 0; this.dripSound(d, false); } // :968
          continue;
        }
        const liq = this.liquidAt(d.x + 8, d.y + 8);
        if (liq > 0 && d.frame < 10) { d.frame = 10; d.frameCounter = 0; this.dripSound(d, true); } // WetCollision :980
      } else {
        // 溅落 10-14（:510-529）：速度清零、逐帧消散
        wait = 4;
        if (d.type === 716) wait *= 2;
        else if (d.type === 717) wait *= 6;
        d.vy += 0.1;
        if (d.frameCounter >= wait) { d.frameCounter = 0; d.frame++; }
        d.vy = 0;
        if (d.frame > 14) d.dead = true;
      }
    }
    this.drips = this.drips.filter((d) => !d.dead);
  }

  /** 溅落音（Gore.cs :967-984）：flag4 水型（716 蜂蜜/717/943/1160-62）不发声 */
  private dripSound(d: Drip, wet: boolean): void {
    if (d.type === 716 || d.type === 717 || d.type === 943 || (d.type >= 1160 && d.type <= 1162)) return;
    this.onDripSplash?.(d.x + 8, d.y + 8, wet);
  }

  // ================= 绘制 =================

  draw(ctx: CanvasRenderingContext2D, atlas: SpriteAtlas): void {
    ctx.imageSmoothingEnabled = false;
    // 落叶：32 列(油漆) × 8 行(旋转)，帧 12×14（SpriteFrame(32,8)）
    for (const l of this.leaves) {
      const img = atlas.ensureVImage(`vanilla/Gore_${l.gore}.png`);
      if (!img || !img.complete || img.naturalWidth === 0) continue;
      const fw = img.naturalWidth / 32, fh = img.naturalHeight / 8;
      ctx.globalAlpha = 1 - l.alpha / 255;
      ctx.drawImage(img, 0, l.row * fh, fw, fh, l.x, l.y, fw * l.scale, fh * l.scale);
    }
    // 滴水：18×300 竖条 15 帧（帧高 20）
    for (const d of this.drips) {
      const img = atlas.ensureVImage(`vanilla/Gore_${d.type}.png`);
      if (!img || !img.complete || img.naturalWidth === 0) continue;
      const fh = img.naturalHeight / 15;
      ctx.globalAlpha = 1 - d.alpha / 255;
      ctx.drawImage(img, 0, d.frame * fh, img.naturalWidth, fh, d.x, d.y, img.naturalWidth, fh);
    }
    ctx.globalAlpha = 1;
  }
}

export const natureParticles = new NatureParticles();

/** EmitLiquidDrops 的水型映射（TileDrawing :7749-7785）。
 *  waterStyle：12→1147、13/14→706、>1→706+style-1、其余 706；
 *  374→716、375→717、461→943(腐化 1160/猩红 1161/神圣 1162)、709→1383 */
export function dripGoreFor(sheet: number, waterStyle: number, zone: { corrupt?: boolean; crimson?: boolean; hallow?: boolean }): number {
  if (sheet === 374) return 716;
  if (sheet === 375) return 717;
  if (sheet === 461) {
    if (zone.crimson) return 1161;
    if (zone.hallow) return 1162;
    if (zone.corrupt) return 1160;
    return 943;
  }
  if (sheet === 709) return 1383;
  if (waterStyle === 12) return 1147;
  if (waterStyle === 13 || waterStyle === 14) return 706;
  if (waterStyle > 1) return 706 + waterStyle - 1;
  return 706;
}

/** EmitTreeLeaves 的喷出排除表（:7919-7940：-1/912/913/1278 不出叶） */
export function leafEmits(gore: number): boolean {
  return gore !== -1 && gore !== 912 && gore !== 913 && gore !== 1278;
}

/** GetTreeLeaf（WorldGen.cs:29540-29756 1:1）：树型/草型 → 落叶 gore id。
 *  markerX = 冠/枝标记格 X；grassSheet = 树下草地格的原版 sheet */
export function getTreeLeaf(markerX: number, frameX: number, frameY: number, treeSheet: number, grassSheet: number): number {
  let treeFrame = 0;
  if (frameX === 22 || frameX === 44 || frameX === 66) {
    if (frameY === 220) treeFrame = 1;
    else if (frameY === 242) treeFrame = 2;
  }
  switch (treeSheet) {
    case 596: return 1248;
    case 616: return 1257;
    case 634: return 1278;
    case 583: case 584: case 585: case 586: case 587: case 588: case 589:
      return 1249 + (treeSheet - 583);
  }
  switch (grassSheet) {
    case 2: case 477: return 910;
    case 60: return 914;
    case 70: return 912;
    case 23: case 112: return 915;
    case 199: case 234: return 916;
    case 53: return 911;
    case 116: return 919;
    case 147: return 913;
    case 633: return 1278;
    case 109: case 492: {
      // 中空树：x%3 错帧 + treeFrame 0-8 映射（:29632-29663）→ +917 = 917-925
      if (markerX % 3 === 1) treeFrame += 3;
      if (markerX % 3 === 2) treeFrame += 6;
      const MAP = [2, 1, 7, 4, 5, 6, 3, 8, 0];
      return 917 + (MAP[treeFrame] ?? 2);
    }
    default:
      return -1; // 原版 switch 无 default 分支——未知草型 passStyle=-1，不出叶。
      // 注：109/492 的 style20 子支（→1113-1121 彩叶）依赖 GetHollowTreeFoliageStyle
      // 种子派生值，取 style!=20 支（917-925）为准——中空树为稀有种子景观。
  }
}
