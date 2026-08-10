// 主渲染器：天空 → chunk → 液体 → 实体 → 粒子/飘字 → 光照合成 → 小地图
import { TILE, CHUNK } from '../core/constants';
import type { Camera } from './Camera';
import { SkyRenderer } from './SkyRenderer';
import { ChunkCache } from './ChunkCache';
import type { World, Clock } from '../world/World';
import type { AssetBundle } from '../assets/AssetGen';
import type { SpriteAtlas } from '../assets/SpriteAtlas';
import { atlasIconForKey, VANILLA_ITEM_ICON_MAP } from '../assets/SpriteAtlas';
import { TOOL_CUTTER } from '../world/Wiring';
import { compositePaperDoll, dollFrame } from '../player/PaperDoll';
import type { Inventory } from '../items/Inventory';
import { VanillaResourceBars } from './ResourceBars';
import type { FlickerClock } from '../lighting/SkyColor';

/** 装备 → 纸娃娃渲染参数。贴图索引 = item.head/body/legs 槽位序号（原版语义，
 *  非物品 id——铁甲三件的槽位序号都是 2）；原版物品 id 经 vanilla.json armorIndex 查表 */
function dollEquipFromInv(inv: Inventory, atlas: import('../assets/SpriteAtlas').SpriteAtlas | null): { head: number | null; body: number | null; legs: number | null } {
  const idx = (itemId: number | null | undefined): number | null => {
    if (itemId == null) return null;
    const def = ITEM_DEFS[itemId];
    if (!def?.armor) return null;
    const key = def.key;
    const vid = VANILLA_ITEM_ICON_MAP[key] ?? (key.startsWith('vi_') ? parseInt(key.slice(3), 10) : NaN);
    if (!Number.isFinite(vid)) return null;
    const entry = atlas?.vanilla.armorIndex?.[String(vid)];
    if (!entry) return null;
    const slot = def.armor.slot; // 0头 1胸 2腿
    return slot === 0 ? (entry.head || null) : slot === 1 ? (entry.body || null) : (entry.legs || null);
  };
  const disp = inv.displayArmor();
  return { head: idx(disp[0]), body: idx(disp[1]), legs: idx(disp[2]) };
}
import { drawVanillaLiquids } from './VanillaLiquidRenderer';
import { WaterfallRenderer } from './WaterfallRenderer';
import { BiomeBackground } from './BiomeBackground';
import type { SceneFlags } from '../world/SceneMetrics';
import { TILE_DEFS, WALL_DEFS } from '../data/tiles';
import { ITEM_DEFS } from '../data/items';
import { townExtraFrames } from '../data/vanillaNpcs';
import type { Player } from '../entities/Player';
import { Enemy } from '../entities/Enemy';
import { ItemDrop } from '../entities/ItemDrop';
import { TownNPC } from '../entities/TownNPC';
import { Tombstone, getTombstoneCanvas } from '../entities/Tombstone';
import { Critter } from '../entities/Critter';
import type { Entity } from '../entities/Entity';

export interface Particle { x: number; y: number; vx: number; vy: number; life: number; maxLife: number; color: string; size: number; damp?: number; grav?: number; }

// 光照合成 4-tap 标量缓冲(替代每像素 [r,g,b] 元组,2026-08 审计 G2)
const _lightTap = new Uint8Array(12);

// ============ 原版 FindFrame 分族帧引擎（1.4.5.6 Terarria1456/Terraria/NPC.cs:67295+） ============
// 僵尸族 case 3（L77026）：腾空/逆向→帧2；站定→帧0；行走 counter+=|vx| 按 8/16/24/32 → 0,1,2,1 往复
const ZOMBIE_FRAME_TYPES = new Set([3, 52, 53, 132, 161, 186, 187, 188, 189, 200, 223, 251, 254, 255, 319, 320, 321, 331, 332, 342, 536, 590, 691]);
// 蝙蝠族 case 49（L75523→148 块 L75585）：每 6 tick 推进；49/51/60/634 循环到倒数第 2 帧（末帧=挂机姿势）
const BAT_SKIP_LAST = new Set([49, 51, 60, 634]);
// 旋转族 NPC（原版 npc.rotation 驱动绘制朝向；FindFrame 不做朝向翻转）：
// 35/68=骷髅王头/守卫、125/126=双子、127-131=Prime 头+四部件、134-136=毁灭者链
const ROTATION_NPC = new Set([35, 68, 125, 126, 127, 128, 129, 130, 131, 134, 135, 136]);

/** 按原版 FindFrame 分族规则算当前帧 index */
function vanillaFrameIdx(e: Enemy, frames: number): number {
  const id = e.vanillaId ?? 0;
  const ai = e.vanilla?.aiStyle ?? 0;
  const t = e.animT; // tick 计数（≈原版 frameCounter 驱动源）
  const walking = Math.abs(e.vx) > 0.05;
  // 僵尸族（L77049-77085）：行走 0,1,2,1 按 |vx| 累加；腾空=2；站定=0
  if (ZOMBIE_FRAME_TYPES.has(id)) {
    if (!e.onGround) return Math.min(2, frames - 1);
    if (!walking) return 0;
    const phase = (e.walkCycleT + Math.abs(e.vx) * 8) % 32; // 每 tick +|vx|，32 一循环
    return phase < 8 ? 0 : phase < 16 ? 1 : phase < 24 ? 2 : 1;
  }
  // 蝙蝠族（L75585）：每 6 tick 推进，全循环（部分类型不含末帧）
  if (ai === 14) {
    const cap = BAT_SKIP_LAST.has(id) ? frames - 1 : frames;
    return Math.max(1, Math.min(frames - 1, Math.floor(t / 6) % Math.max(1, cap)));
  }
  // 史莱姆（case 1, L71506）：每 8 tick 推进，全循环
  if (ai === 1) return Math.floor(t / 8) % frames;
  // 城镇 NPC（aiStyle 7，FindFrame 城镇分支 L70172-70262）：腾空=1；站定=0；
  // 行走帧 2..frames-extra-1 循环（frameCounter += |vx|*2+1、>6 推进、越界回卷帧2）
  if (ai === 7) {
    if (!e.onGround) return 1;
    if (!walking) return 0;
    const extra = townExtraFrames(id);
    const len = Math.max(1, frames - extra - 2);
    return 2 + (Math.floor((e.walkCycleT * 2 + t) / 6) % len);
  }
  // 战士族/107（L70155-70252）：站定=0；行走从帧 2 起按 |vx|*2+1 累加、>6 推进、循环回 2
  if (ai === 3 || ai === 26 || ai === 107) {
    if (!e.onGround) return frames - 1; // 腾空取末帧（原版 ai[0]==2 在 0/末帧间交替）
    if (!walking) return 0;
    const cycLen = Math.max(1, frames - 2);
    const step = Math.floor((e.walkCycleT * (Math.abs(e.vx) * 2 + 1)) / 6);
    return 2 + (step % cycLen);
  }
  // 游泳族（case 65 鲨鱼 L75386+）：frame = (counter/4) % 4
  if (ai === 16) return frames > 3 ? Math.floor(t / 4) % Math.min(4, frames) : Math.floor(t / 6) % frames;
  // 水母（case 63 L74621+）：追击脉冲循环 [4..6]，漂移循环 [0..]
  if (ai === 18) {
    const active = t % 90 < 30; // 脉冲周期近似
    if (active && frames > 6) return 4 + (Math.floor(t / 5) % 3);
    return Math.floor(t / 8) % Math.min(4, frames);
  }
  // 克苏鲁之眼(FindFrame case 4, cs:77607-77631):0/1/2 三帧眨眼各 7 tick,
  // ai[0]>1(二阶段)帧偏移 +3(张嘴形态)
  if (id === 4) {
    const blink = Math.floor(t / 7) % 3;
    return Math.min(frames - 1, blink + (e.phase > 1 ? 3 : 0));
  }
  // 其余（眼/蜂群/幽灵/蠕虫段等）：每 6 tick 全循环
  return Math.floor(t / 6) % frames;
}
export interface DamageNumber { x: number; y: number; vy: number; value: number; crit: boolean; color: string; life: number; label?: string; }

export class Minimap {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  dirtyChunks = new Set<number>();
  constructor(public world: World) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = world.w;
    this.canvas.height = world.h;
    this.ctx = this.canvas.getContext('2d')!;
    this.redrawAll();
    world.store.onTileChanged((x, y) => {
      this.dirtyChunks.add(ChunkCache.key(Math.floor(x / CHUNK), Math.floor(y / CHUNK)));
    });
  }

  colorFor(x: number, y: number): string | null {
    const st = this.world.store;
    const i = st.idx(x, y);
    if (st.type[i] !== 0) {
      const d = TILE_DEFS[st.type[i]];
      return d ? d.mapColor : '#808080';
    }
    // 液体：水蓝 / 岩浆橙
    if (st.liquid[i] > 40) return st.liquidType[i] === 2 ? '#E8622C' : '#3D6FD1';
    if (st.wall[i] !== 0) {
      // 墙色 = 深化（地下洞穴空气）
      const w = st.wall[i];
      return WALL_DEFS[w]?.mapColor ?? '#2E2E2E'; // 全量权威墙色（TEdit walls.json）
    }
    // 探索过的天空 = 亮蓝（未探索区域由迷雾层另盖黑）
    return '#7EB6E8';
  }

  redrawAll() {
    const { world, ctx } = this;
    const img = ctx.createImageData(world.w, world.h);
    for (let y = 0; y < world.h; y++) {
      for (let x = 0; x < world.w; x++) {
        const c = this.colorFor(x, y);
        const i = (y * world.w + x) * 4;
        if (c) {
          const v = parseInt(c.slice(1), 16);
          img.data[i] = (v >> 16) & 255; img.data[i + 1] = (v >> 8) & 255; img.data[i + 2] = v & 255;
        }
        img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    this.dirtyChunks.clear();
  }

  flushDirty() {
    if (this.dirtyChunks.size === 0) return;
    const st = this.world.store;
    let n = 0;
    for (const k of this.dirtyChunks) {
      if (n++ > 24) break;
      this.dirtyChunks.delete(k);
      const cx = (k & 0xffff) << 16 >> 16, cy = (k >> 16) << 16 >> 16;
      const x0 = cx * CHUNK, y0 = cy * CHUNK;
      for (let y = y0; y < y0 + CHUNK; y++) {
        for (let x = x0; x < x0 + CHUNK; x++) {
          if (!st.inBounds(x, y)) continue;
          const c = this.colorFor(x, y);
          this.ctx.fillStyle = c ?? '#000';
          this.ctx.fillRect(x, y, 1, 1);
        }
      }
    }
  }
}

export class Renderer {
  /** 调试面板开关（F3 切换）：碰撞盒高亮等 */
  debugMode = false;
  /** 方块标注（F5 标注模式）：标记的问题方块，非空时叠加绘制 */
  annotateMarks: Array<{ x: number; y: number }> | null = null;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  sky = new SkyRenderer();
  lightCanvas: HTMLCanvasElement;
  lightCtx: CanvasRenderingContext2D;
  minimap: Minimap | null = null;
  /** 原版瀑布贴图系统（WaterfallManager 移植）：液体倾泻的长条水流柱 */
  waterfalls = new WaterfallRenderer();
  /** 原版群系/地下背景（DrawBG/DrawBackground 移植）；场景数据由 Game 每帧注入 */
  biomeBg = new BiomeBackground();
  /** 原版生命/魔力资源条（ClassicPlayerResourcesDisplaySet 移植） */
  resourceBars = new VanillaResourceBars();
  scene: SceneFlags | null = null;

  // 全屏地图查看器状态（zoom 向 zoomTarget 缓动；缓动期间按锚点补偿 pan）
  fullMap = {
    open: false, zoom: 0.5, zoomTarget: 0.5, panX: 0, panY: 0,
    anchorU: 0, anchorV: 0, anchorMX: 0, anchorMY: 0,
  };

  /** 全屏地图缩放：以鼠标位置为锚点（鼠标下的地图点不动，不乱飞） */
  zoomFullMapAt(newZoom: number, mouseX: number, mouseY: number) {
    const fm = this.fullMap;
    const viewW = this.canvas.width, viewH = this.canvas.height;
    const clamped = Math.max(0.5, Math.min(6, newZoom));
    // 记录锚点：鼠标下的地图源坐标 + 鼠标屏幕位置。
    // 缓动期间每帧按公式 pan = anchorMX - viewW/2 + W*zoom/2 - u*zoom 重解，
    // 保证缓动全程锚点不动（否则缓动中 pan 固定会让地图"自己跑"）
    const cx0 = viewW / 2 - (this._fmWorldW * fm.zoom) / 2 + fm.panX;
    const cy0 = viewH / 2 - (this._fmWorldH * fm.zoom) / 2 + fm.panY;
    fm.anchorU = (mouseX - cx0) / fm.zoom;
    fm.anchorV = (mouseY - cy0) / fm.zoom;
    fm.anchorMX = mouseX;
    fm.anchorMY = mouseY;
    fm.zoomTarget = clamped;
    this.applyMapAnchor();
  }

  /** 按锚点反解 pan（当前 zoom 下鼠标处的地图点固定在鼠标下） */
  private applyMapAnchor() {
    const fm = this.fullMap;
    const viewW = this.canvas.width, viewH = this.canvas.height;
    fm.panX = fm.anchorMX - viewW / 2 + (this._fmWorldW * fm.zoom) / 2 - fm.anchorU * fm.zoom;
    fm.panY = fm.anchorMY - viewH / 2 + (this._fmWorldH * fm.zoom) / 2 - fm.anchorV * fm.zoom;
  }

  /** 每帧缓动 fullMap.zoom → zoomTarget；缓动期间同步按锚点补偿 pan */
  easeFullMap() {
    const fm = this.fullMap;
    const diff = fm.zoomTarget - fm.zoom;
    if (Math.abs(diff) < 0.002) { fm.zoom = fm.zoomTarget; return; }
    fm.zoom += diff * 0.16;
    this.applyMapAnchor();
  }
  private _fmWorldW = 0;
  private _fmWorldH = 0;
  minimapRect = { x: 0, y: 0, w: 0, h: 0 };
  private mapDragging = false;
  private lastMouse = { x: 0, y: 0 };

  constructor(public assets: AssetBundle, public atlas: SpriteAtlas | null = null) {
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d')!;
    this.lightCanvas = document.createElement('canvas');
    this.lightCtx = this.lightCanvas.getContext('2d')!;
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  /** 物品图标：优先 Maples 素材，缺省回退程序化 */
  itemIcon(id: number): HTMLCanvasElement | null {
    return this.assets.itemIcons.get(id) ?? null;
  }

  /** Maples 图标绘制矩形（找不到返回 null） */
  atlasIcon(id: number) {
    if (!this.atlas) return null;
    const def = ITEM_DEFS[id];
    if (!def) return null;
    return atlasIconForKey(this.atlas, def.key);
  }

  resize() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  attach(parent: HTMLElement) {
    parent.appendChild(this.canvas);
  }

  private _mouseX = 0;
  private _mouseY = 0;
  private _mouseDown = false;

  render(
    cam: Camera, world: World, clock: Clock,
    chunks: ChunkCache,
    lightR: Uint8Array, lightG: Uint8Array, lightB: Uint8Array,
    lightRX: number, lightRY: number, lightRW: number, lightRH: number,
    player: Player, entities: Entity[],
    particles: Particle[], dmgNumbers: DamageNumber[],
    swing: { t: number; dur: number; item: number } | null,
    hover: { x: number; y: number } | null,
    boss: { name: string; hp: number; maxHp: number } | null,
    mouseX = 0, mouseY = 0, mouseDown = false,
    mineProgress = 0,
    flicker: FlickerClock | null = null,
  ) {
    this._mouseX = mouseX;
    this._mouseY = mouseY;
    this._mouseDown = mouseDown;
    this._liquidNow = performance.now(); // 帧 first thing 采样：背景水/瀑布/前景水共用同一时刻
    this.easeFullMap();
    const ctx = this.ctx;
    const viewW = this.canvas.width, viewH = this.canvas.height;
    cam.viewW = viewW; cam.viewH = viewH;
    const z = cam.zoom;

    // 1. 天空
    this.sky.draw(ctx, clock, viewW, viewH, cam.x);

    // 1.5 世界背景图（原版 DrawBG：地表群系视差层 + 地下分层；天空之后、tile 之前）
    if (this.scene) {
      // 昼夜色调（≈ColorOfTheSkies：白天白、夜晚压暗偏蓝、晨昏暖色）
      const df = clock.dayFactor;
      const t = clock.timeOfDay;
      let tr = 1, tg = 1, tb = 1;
      if (df < 1) {
        const dusk = t > 0.68 && t < 0.82 ? 1 - Math.abs(t - 0.75) / 0.07 : t > 0.18 && t < 0.32 ? 1 - Math.abs(t - 0.25) / 0.07 : 0;
        const night = 1 - df;
        tr = 1 - 0.70 * night + 0.10 * dusk;
        tg = 1 - 0.66 * night - 0.22 * dusk;
        tb = 1 - 0.50 * night - 0.40 * dusk;
      }
      this.biomeBg.draw(ctx, world, this.scene, cam, viewW, viewH, [tr, tg, tb], 16.7);
    }

    ctx.save();
    // 世界变换：平移 + 缩放（以屏幕中心为相机中心）
    // 像素风关键：tile/实体用最近邻采样保持锐利（光照层单独用平滑）
    ctx.imageSmoothingEnabled = false;
    ctx.translate(viewW / 2, viewH / 2);
    ctx.scale(z, z);
    ctx.translate(-cam.x, -cam.y);

    // 2. chunks 绘制序列（对照原版 Main.cs 帧序：背景水 → 墙 → 方块 → 瀑布 → 实体 → 前景水）
    const ts = TILE;
    const x0 = Math.floor((cam.x - viewW / 2 / z) / (CHUNK * ts)) - 1;
    const x1 = Math.floor((cam.x + viewW / 2 / z) / (CHUNK * ts)) + 1;
    const y0 = Math.floor((cam.y - viewH / 2 / z) / (CHUNK * ts)) - 1;
    const y1 = Math.floor((cam.y + viewH / 2 / z) / (CHUNK * ts)) + 1;
    const chunkVisible = (cx: number, cy: number) =>
      cx >= 0 && cy >= 0 && cx * CHUNK < world.w && cy * CHUNK < world.h;
    // 2a. 液体背景 pass（原版 backWaterTarget 先于墙合成，Main.cs:46619）：
    //     不透明水画在墙/方块之前——方块贴图透明像素处露出这层水 = 浸润，
    //     有墙的水格由墙盖住、只留前景 0.6 层 → 墙在水中可见
    this.drawLiquids(world, cam, viewW, viewH, z, true);

    // 2b. 背景墙层
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        if (!chunkVisible(cx, cy)) continue;
        ctx.drawImage(chunks.get(cx, cy).wall, cx * CHUNK * ts, cy * CHUNK * ts);
      }
    }

    // 2c. 前景 tile/物体层
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        if (!chunkVisible(cx, cy)) continue;
        ctx.drawImage(chunks.get(cx, cy).tile, cx * CHUNK * ts, cy * CHUNK * ts);
      }
    }

    // 2c'. 导线覆盖层(原版画在水之上实体之下,Main.cs:46721;手持电路工具或 F7 时可见)
    this.drawWires(world, cam, viewW, viewH, z);
    // 2c''. 宏伟蓝图拖拽预览(锚点→悬停格的 L 路径,与 massWireOperation 同构:先纵后横+端点)
    this.drawGrandPreview();

    // 2d. 瀑布贴图（原版画在 tile 层后、实体前，Main.cs:47460，被地形遮挡）
    this.drawWaterfalls(world, cam, viewW, viewH, z);

    // 4. 实体（按 y 排序）
    const sorted = [...entities].sort((a, b) => a.y - b.y);
    for (const e of sorted) {
      if (e instanceof Enemy) this.drawEnemy(e, world);
      else if (e instanceof ItemDrop) this.drawDrop(e);
      else if (e instanceof TownNPC) this.drawTownNPC(e);
      else if (e instanceof Tombstone) this.drawTombstone(e);
      else if (e instanceof Critter) this.drawCritter(e);
      else if (typeof (e as { draw?: unknown }).draw === 'function') {
        // 投射物等自带 draw 的实体(飞镖/陷阱弹/箭/法弹):世界变换内绘制
        (e as unknown as { draw(r: Renderer, cam: Camera): void }).draw(this, cam);
      }
    }
    this.drawPlayer(player, world, swing);

    // 4.5 液体前景 pass（原版 waterTarget 在玩家/掉落物之后合成，Main.cs:46720）：
    //     水 0.6 半透明盖在实体上——水中角色带水色
    this.drawLiquids(world, cam, viewW, viewH, z, false);

    // 5. 粒子
    for (const p of particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;

    // 6. 挖掘/放置光标：挖掘中黄色填充随进度加深（半透明黄 → 破坏完成时最深）
    if (hover) {
      ctx.strokeStyle = 'rgba(255,255,255,0.7)';
      ctx.lineWidth = 1 / z;
      ctx.strokeRect(hover.x * ts + 0.5, hover.y * ts + 0.5, ts - 1, ts - 1);
      if (mineProgress > 0) {
        // 进度 0→1，黄色 alpha 0.15→0.8 加深渐变（接近破坏时深黄）
        ctx.globalAlpha = 0.15 + Math.min(1, mineProgress) * 0.65;
        ctx.fillStyle = '#FFC419';
        ctx.fillRect(hover.x * ts + 1, hover.y * ts + 1, ts - 2, ts - 2);
        ctx.globalAlpha = 1;
      }
    }

    ctx.restore();

    // 7. 光照合成
    this.compositeLight(cam, viewW, viewH, lightR, lightG, lightB, lightRX, lightRY, lightRW, lightRH);

    // 8. 飘字（受光照影响后画）
    ctx.save();
    ctx.font = 'bold 14px monospace';
    ctx.textAlign = 'center';
    for (const d of dmgNumbers) {
      ctx.globalAlpha = Math.min(1, d.life / 30);
      const [sx, sy] = cam.worldToScreen(d.x, d.y);
      // 物品名飘字：带阴影浅白文本
      if (d.label) {
        ctx.font = '13px sans-serif';
        ctx.strokeStyle = 'rgba(0,0,0,0.75)';
        ctx.lineWidth = 3;
        ctx.strokeText(d.label, sx, sy);
        ctx.fillStyle = '#F0F0F0';
        ctx.fillText(d.label, sx, sy);
        continue;
      }
      ctx.fillStyle = d.color;
      ctx.font = d.crit ? 'bold 18px monospace' : 'bold 14px monospace';
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 3;
      ctx.strokeText(String(d.value), sx, sy);
      ctx.fillText(String(d.value), sx, sy);
    }
    ctx.restore();

    this._lastPlayer = player;
    // 9. 小地图
    this.drawMinimap(ctx, cam, world, player, clock);
    // 9.5 全屏地图
    if (this.fullMap.open && this.minimap) {
      this.drawFullMap(ctx, world, this._mouseX, this._mouseY, this._mouseDown);
      return; // 全屏地图时跳过其余 HUD
    }

    // 9.8 调试面板：碰撞盒高亮（F3 切换）
    // 方块标注叠加（F5 标注模式）：红圈 + 序号
    if (this.annotateMarks && this.annotateMarks.length && !this.fullMap.open) {
      const z = cam.zoom;
      ctx.save();
      ctx.font = `bold ${Math.max(10, 12 * z)}px monospace`;
      ctx.textAlign = 'center';
      this.annotateMarks.forEach((m, idx) => {
        const [sx, sy] = cam.worldToScreen(m.x * TILE + TILE / 2, m.y * TILE + TILE / 2);
        ctx.strokeStyle = '#FF3355';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(sx, sy, 10 * z + 4, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = '#FF3355';
        ctx.fillText(String(idx + 1), sx, sy - 12 * z - 6);
      });
      ctx.restore();
    }
    if (this.debugMode) this.drawDebugOverlay(ctx, cam, viewW, viewH, player, entities, mouseX, mouseY, hover);

    // 10. Boss 血条
    if (boss) this.drawBossBar(ctx, viewW, boss);

    // 11. 生命/魔力资源条（原版 ClassicPlayerResourcesDisplaySet：右上红心排 + 右缘魔力星）
    this.resourceBars.draw(ctx, player, viewW, flicker);
  }

  private drawLiquids(world: World, cam: Camera, viewW: number, viewH: number, z: number, isBackground: boolean) {
    // 原版 1.4.0.5 LiquidRenderer 移植（多 pass 网格算法，见 VanillaLiquidRenderer）。
    // isBackground：背景 pass（墙层之前，不透明）或前景 pass（实体之后，0.6）
    const ts = TILE;
    const tx0 = Math.max(2, Math.floor((cam.x - viewW / 2 / z) / ts));
    const tx1 = Math.min(world.w - 3, Math.ceil((cam.x + viewW / 2 / z) / ts));
    const ty0 = Math.max(2, Math.floor((cam.y - viewH / 2 / z) / ts));
    // 底边 +5 行（原版 Main.cs:42900-42908 屏下 +5/+4 边距）：P3 不处理窗口底部 10 行，
    // 外扩后未构建带落在屏幕外，防止视口底缘液体类型错画
    const ty1 = Math.min(world.h - 3, Math.ceil((cam.y + viewH / 2 / z) / ts) + 5);
    // 双 pass 共用同一时刻，避免动画帧错位（原版 PrepareDraw 每帧一次、两 pass 共享缓存）
    drawVanillaLiquids(this.ctx, this.atlas, world.store, world.groundLevel, tx0, ty0, tx1, ty1, this._liquidNow, isBackground);
  }

  /** 导线覆盖层(Main.cs:43543-43954 DrawWires 移植:四色行/连接掩码/多色淡化/致动器覆盖) */
  showWires = false;
  /** 宏伟蓝图拖拽预览(Game.render 注入;世界坐标 tile) */
  grandPreview: { from: [number, number]; to: [number, number]; mode: number } | null = null;
  private drawWires(world: World, cam: Camera, viewW: number, viewH: number, z: number) {
    if (!this.showWires || !this.atlas) return;
    const wires = this.atlas.ensureVImage('vanilla/WiresNew.png');
    const actuatorImg = this.atlas.ensureVImage('vanilla/Actuator.png');
    if (!wires) return;
    const st = world.store;
    const ts = TILE;
    const tx0 = Math.max(2, Math.floor((cam.x - viewW / 2 / z) / ts));
    const tx1 = Math.min(world.w - 3, Math.ceil((cam.x + viewW / 2 / z) / ts));
    const ty0 = Math.max(2, Math.floor((cam.y - viewH / 2 / z) / ts));
    const ty1 = Math.min(world.h - 3, Math.ceil((cam.y + viewH / 2 / z) / ts));
    const ctx = this.ctx;
    const has = (x: number, y: number, bit: number) => st.inBounds(x, y) && (st.wire[st.idx(x, y)] & bit) !== 0;
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        const i = st.idx(tx, ty);
        const b = st.wire[i];
        const colors = b & 15;
        if (!colors && !(b & 16)) continue;
        let n = 0;
        for (let c = 0; c < 4; c++) if (colors & (1 << c)) n++;
        let drawn = 0;
        for (let c = 0; c < 4; c++) {
          const bit = 1 << c; // 红0 蓝1 绿2 黄3(图集行序,Main.cs:43641 等)
          if (!(colors & bit)) continue;
          drawn++;
          // 行 Y = 色行*18;分线盒/像素盒额外行偏移(Main.cs:43596-43616)
          let rowY = c * 18;
          const sh = TILE_DEFS[st.type[i]]?.vanilla?.sheet ?? -1;
          if (sh === 424) rowY += 72 + Math.floor(st.frameX[i] / 18) * 72;
          else if (sh === 445) rowY += 72;
          // 连接掩码(Main.cs:43621-43640):上+18 右+36 下+72 左+144
          let mask = 0;
          if (has(tx, ty - 1, bit)) mask += 18;
          if (has(tx + 1, ty, bit)) mask += 36;
          if (has(tx, ty + 1, bit)) mask += 72;
          if (has(tx - 1, ty, bit)) mask += 144;
          if (n > 1) ctx.globalAlpha = 1 / n; // 多色同格淡化(桥带略)
          ctx.drawImage(wires, mask, rowY, 16, 16, tx * ts, ty * ts, ts, ts);
          ctx.globalAlpha = 1;
        }
        if ((b & 16) && actuatorImg) {
          ctx.drawImage(actuatorImg, 0, 0, 16, 16, tx * ts, ty * ts, ts, ts);
        }
      }
    }
  }

  /** 宏伟蓝图 L 路径预览:先纵后横 + 端点(massWireOperation dir=true 同构);
   *  剪线=蓝、致动器=绿、四色铺线=红,半透明格覆盖 */
  private drawGrandPreview() {
    const gp = this.grandPreview;
    if (!gp) return;
    const ctx = this.ctx;
    const ts = TILE;
    const cells: Array<[number, number]> = [];
    const [fx, fy] = gp.from;
    const [tx, ty] = gp.to;
    const sy = Math.sign(ty - fy), sx = Math.sign(tx - fx);
    for (let y = fy; y !== ty; y += sy) cells.push([fx, y]);
    for (let x = fx; x !== tx; x += sx) cells.push([x, ty]);
    cells.push([tx, ty]);
    const color = gp.mode & TOOL_CUTTER
      ? 'rgba(140,160,255,0.30)'
      : (gp.mode & 15) === 0 ? 'rgba(80,220,120,0.30)' // 仅致动器
        : 'rgba(255,70,70,0.30)';
    ctx.fillStyle = color;
    for (const [x, y] of cells) ctx.fillRect(x * ts, y * ts, ts, ts);
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.lineWidth = 1;
    ctx.strokeRect(tx * ts + 0.5, ty * ts + 0.5, ts - 1, ts - 1);
  }

  /** 瀑布贴图（tile 层后、实体前；扫描窗口外扩 100 格在内部，30 帧节流） */
  private drawWaterfalls(world: World, cam: Camera, viewW: number, viewH: number, z: number) {
    if (!this.atlas) return;
    const ts = TILE;
    const tx0 = Math.max(2, Math.floor((cam.x - viewW / 2 / z) / ts));
    const tx1 = Math.min(world.w - 3, Math.ceil((cam.x + viewW / 2 / z) / ts));
    const ty0 = Math.max(2, Math.floor((cam.y - viewH / 2 / z) / ts));
    const ty1 = Math.min(world.h - 3, Math.ceil((cam.y + viewH / 2 / z) / ts));
    const now = this._liquidNow; // 与液体双 pass 同帧同时刻
    this.waterfalls.findWaterfalls(world.store, tx0, ty0, tx1, ty1, Math.floor(now / 16.67));
    this.waterfalls.draw(this.ctx, this.atlas, world.store, world.groundLevel, now);
  }
  /** 本帧液体动画时刻（双 pass 共享） */
  private _liquidNow = 0;
  /** 光照合成 ImageData 复用(尺寸变化才重建) */
  private _lightImg: ImageData | null = null;

  /** 墓碑：以底部中心为支点按倾角旋转绘制（翻滚/侧躺/倒扣）。
   *  优先原版 Tiles_85 样式块——四格 16×16 无缝拼到离屏画布再绘制
   *  （直接取 34×34 矩形会把表内 2px 间隙画成十字缝），程序化仅兜底 */
  private tombstoneCache = new Map<number, HTMLCanvasElement>();
  private drawTombstone(t: Tombstone) {
    const ctx = this.ctx;
    ctx.save();
    // 投射物旋转原点 = 中心（Projectile.Draw 语义）
    ctx.translate(t.cx, t.cy);
    ctx.rotate(t.angle);
    const styleCol = t.style * 2; // Tiles_85 样式块起点列（style 0-10 → 偶数列 0-20）
    let img: CanvasImageSource | null = this.tombstoneCache.get(styleCol) ?? null;
    if (!img && this.atlas) {
      // 无缝拼接四格（表内 stride 18：格间有 2px 间隙需跳过）
      const c = document.createElement('canvas');
      c.width = 32; c.height = 32;
      const cx = c.getContext('2d')!;
      let ok = true;
      for (let dy = 0; dy < 2; dy++) {
        for (let dx = 0; dx < 2; dx++) {
          const fr = this.atlas.vframeAt(85, (styleCol + dx) * 18, dy * 18);
          if (!fr) { ok = false; break; }
          cx.drawImage(fr.img, fr.sx, fr.sy, fr.sw, fr.sh, dx * 16, dy * 16, 16, 16);
        }
      }
      if (ok) { this.tombstoneCache.set(styleCol, c); img = c; }
    }
    if (img) {
      ctx.drawImage(img, -16, -16, 32, 32);
    } else {
      const pc = getTombstoneCanvas();
      ctx.drawImage(pc, -8, -11, 16, 22);
    }
    ctx.restore();
  }

  /** 小动物：原版 NPC 纵向帧条动画（移动时循环全帧，静止首帧；贴图默认朝左镜像） */
  private drawCritter(c: Critter) {
    if (!this.atlas) return;
    const meta = this.atlas.vnpcMeta(c.def.npc);
    if (!meta) return;
    // 帧选择优先级：分段动画（鸭子） > 鸟类栖息末帧 > 蝴蝶物种窗口 > 全表循环
    let frame: number;
    const anim = c.def.anim;
    if (anim) {
      // 状态选段（游水只认滞回锁：flying 后 inWater 冻结的历史 bug 不会再影响显示）
      const seg = c.swimLatch > 0 ? (anim.swim ?? anim.walk)
        : !c.onGround ? (anim.fly ?? anim.walk)
        : Math.abs(c.vx) > 0.15 ? (anim.walk ?? anim.idle) : (anim.idle ?? anim.walk);
      if (seg) {
        const active = Math.abs(c.vx) > 0.15 || !c.onGround || c.swimLatch > 0;
        frame = seg[0] + (active ? Math.floor(c.animT / 8) % seg[1] : 0);
      } else frame = 0;
    } else if (c.perchState === 1 && meta.count > 1) frame = meta.count - 1;
    else {
      const moving = Math.abs(c.vx) > 0.15 || !c.onGround;
      if (c.animLen > 0) frame = c.animBase + (moving ? Math.floor(c.animT / 8) % c.animLen : 0);
      else frame = moving ? Math.floor(c.animT / 8) % meta.count : 0;
    }
    const fr = this.atlas.vnpc(c.def.npc, frame);
    if (!fr) return;
    const ctx = this.ctx;
    // 缩放贴合碰撞盒；按帧最低不透明行对齐脚底（帧底透明内边距会导致悬浮）
    const h = c.h * 1.25;
    const w = (fr.sw / fr.sh) * h;
    const pad = this.spriteBottomPad(fr); // 帧内底部透明行数
    ctx.save();
    ctx.translate(c.cx, c.y + c.h); // 脚底中心
    ctx.scale(c.facing >= 0 ? -1 : 1, 1); // 贴图默认朝左
    if (c.def.glow) {
      ctx.shadowColor = 'rgba(220,255,140,0.9)';
      ctx.shadowBlur = 6; // 萤火虫发光
    }
    ctx.drawImage(fr.img, fr.sx, fr.sy, fr.sw, fr.sh, -w / 2, -h + pad * (h / fr.sh), w, h);
    ctx.restore();
  }

  private drawDrop(d: ItemDrop) {
    const bob = Math.sin((d.age + d.bobPhase * 60) * 0.1) * 1.5;
    // 优先 Maples 图标
    const ar = this.atlasIcon(d.itemId);
    if (ar) {
      const ctx = this.ctx;
      const drawH = 14 * ar.sh / ar.sw;
      ctx.drawImage(ar.img, ar.sx, ar.sy, ar.sw, ar.sh, d.x, d.y + bob, 14, drawH);
      // 原版 Item.color（彩色凝胶）：同贴图逐像素乘 color，XNA 预乘两步（同 NPC color pass）
      if (d.color && d.color[3] > 0) {
        const tinted = this.tintedSprite(`item${d.itemId}`, ar, d.color);
        ctx.globalCompositeOperation = 'destination-out';
        ctx.globalAlpha = d.color[3] / 255;
        ctx.drawImage(ar.img, ar.sx, ar.sy, ar.sw, ar.sh, d.x, d.y + bob, 14, drawH);
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 1;
        ctx.drawImage(tinted, d.x, d.y + bob, 14, drawH);
        ctx.globalCompositeOperation = 'source-over';
      }
      return;
    }
    const icon = this.itemIcon(d.itemId);
    if (!icon) return;
    this.ctx.drawImage(icon, d.x, d.y + bob, 12, 12);
  }

  // 敌人 → Maples 动画映射
  private enemyAnimCache = new Map<string, ReturnType<SpriteAtlas['animFrames']>>();
  private enemyAnim(key: string): ReturnType<SpriteAtlas['animFrames']> {
    let f = this.enemyAnimCache.get(key);
    if (!f) {
      const map: Record<string, string> = {
        slime_green: 'Slime/Jump', slime_blue: 'Slime/Jump',
        zombie: 'Zombie/Walk',
      };
      f = this.atlas && map[key] ? this.atlas.animFrames(map[key]) : [];
      this.enemyAnimCache.set(key, f);
    }
    return f;
  }

  private drawEnemy(e: Enemy, world: World) {
    const ctx = this.ctx;
    const spr = this.assets.enemySprites.get(e.key);
    // 受击闪白
    const flash = e.iframes > 0 && e.iframes % 4 < 2;
    // 水下滤镜：与主角一致的蓝色调（检查怪物头部位置是否浸水）
    const headI = world.store.idx(Math.floor(e.cx / TILE), Math.floor((e.y + 2) / TILE));
    const underwater = world.store.liquid[headI] > 100;
    // ---- 原版 NPC 表精灵（数据驱动路径：纵向帧条 + 朝向翻转，原版贴图默认朝左） ----
    if (e.vanillaId != null && this.atlas) {
      const frames = Math.max(1, e.vanilla?.frames ?? 1);
      const frameIdx = vanillaFrameIdx(e, frames);
      const r = this.atlas.vnpc(e.vanillaId, frameIdx);
      if (r) {
        const flying = !!e.vanilla?.noGravity;
        // 原版 NPC.scale（SetDefaults base × netID scale）——作用于碰撞盒与渲染
        const scale = (e.vanilla?.scale ?? 1) * e.vanillaScale;
        ctx.save();
        ctx.translate(e.cx, e.cy + (flying ? 0 : e.h / 2));
        // 旋转族:整体随自转角旋转(原版 npc.rotation;朝向翻转不适用)。
        // 4=克眼 visAngle;35/68=骷髅王头 spin;125/126=双子;127-131=Prime 头+部件;134-136=毁灭者链
        const rotId = ROTATION_NPC.has(e.vanillaId);
        if (e.vanillaId === 4) ctx.rotate(e.visAngle);
        else if (rotId) ctx.rotate(e.spin);
        ctx.scale(scale, scale);
        if (!rotId && e.vanillaId !== 4 && e.facing > 0) ctx.scale(-1, 1); // 原版默认朝左
        // 原版 alpha 语义（NPC.Opacity/GetAlpha）：不透明度 = 1 - alpha/255。
        // alpha 是 SetDefaults 每类型静态值（0=实体；史莱姆 175=半透明凝胶），无通用渐隐
        ctx.globalAlpha = 1 - Math.min(255, Math.max(e.spawnAlpha, 0)) / 255;
        ctx.drawImage(r.img, r.sx, r.sy, r.sw, r.sh, -r.sw / 2, flying ? -r.sh / 2 : -r.sh, r.sw, r.sh);
        // 原版 color 二次绘制（Main.cs:24527 + NPC.GetColor L94903）：color≠default 时用
        // 同贴图再画一遍、逐像素乘 color（XNA SpriteBatch 天生贴轮廓）；
        // color.A 决定该 pass 强度（史莱姆贴图是白剪影，颜色全靠这层）
        if (e.colorRGBA && e.colorRGBA[3] > 0) {
          // XNA 预乘混合等价（BlendState.AlphaBlend：out = texel×colorRGB + D×(1-colorA/255)）。
          // 普通 drawImage 会把染色 RGB 再乘 alpha（蓝色糊成灰绿）——改为两步：
          // ① 原始精灵 destination-out 按 colorA 削弱底下内容 ② lighter 全量加染色精灵
          const tinted = this.tintedSprite(`npc${e.vanillaId}`, r, e.colorRGBA);
          const anchorY = flying ? -r.sh / 2 : -r.sh;
          ctx.globalCompositeOperation = 'destination-out';
          ctx.globalAlpha = e.colorRGBA[3] / 255;
          ctx.drawImage(r.img, r.sx, r.sy, r.sw, r.sh, -r.sw / 2, anchorY, r.sw, r.sh);
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = 1;
          ctx.drawImage(tinted, -r.sw / 2, anchorY, r.sw, r.sh);
          ctx.globalCompositeOperation = 'source-over';
        }
        ctx.restore();
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
        return;
      }
      return; // 表未加载完成：本帧不画（下帧懒加载完成）
    }
    // ---- Maples 精灵优先 ----
    if (this.atlas) {
      let frames: ReturnType<SpriteAtlas['animFrames']> = [];
      let anchor: 'feet' | 'center' = 'feet';
      if (e.key.startsWith('slime')) { frames = this.enemyAnim(e.key); anchor = 'feet'; }
      else if (e.key === 'zombie') { frames = this.enemyAnim(e.key); anchor = 'feet'; }
      else if (e.key === 'cave_bat') {
        // 洞穴蝙蝠：原版 NPC_49（44x32×5 帧扑翼），逐帧动画
        if (!this.enemyAnimCache.has('bat49')) {
          const list: ReturnType<SpriteAtlas['animFrames']> = [];
          for (let k = 0; k < 5; k++) {
            const r = this.atlas!.vnpc(49, k);
            if (r) list.push(r);
          }
          this.enemyAnimCache.set('bat49', list);
        }
        frames = this.enemyAnimCache.get('bat49') ?? [];
        anchor = 'center';
      }
      else if (e.key === 'demon_eye') {
        // 恶魔之眼：NPC_2 双帧
        frames = this.enemyAnimCache.get('deye') ?? [];
        if (!frames.length) {
          const file = this.atlas.data.files['角色/NPC_2.png'];
          if (file) {
            frames = file.sprites.map((sp) => this.atlas!.rect('角色/NPC_2.png', sp.name)).filter(Boolean) as typeof frames;
          }
          this.enemyAnimCache.set('deye', frames);
        }
        anchor = 'center';
      }
      else if (e.key === 'eye_of_cthulhu') {
        // Boss 用 NPC_4：底部 3 帧 = 一阶段动画，顶部 3 帧 = 二阶段（实测对调）
        if (!this.enemyAnimCache.has('eoc_p1')) {
          const file = this.atlas.data.files['角色/NPC_4.png'];
          const toFrames = (arr: typeof file.sprites) =>
            arr.map((s) => this.atlas!.rect('角色/NPC_4.png', s.name)).filter(Boolean) as ReturnType<SpriteAtlas['animFrames']>;
          if (file) {
            const sorted = [...file.sprites].sort((a, b) => a.y - b.y); // 顶部在前
            this.enemyAnimCache.set('eoc_p1', toFrames(sorted.slice(3, 6)));
            this.enemyAnimCache.set('eoc_p2', toFrames(sorted.slice(0, 3)));
          } else {
            this.enemyAnimCache.set('eoc_p1', []);
            this.enemyAnimCache.set('eoc_p2', []);
          }
        }
        frames = e.phase === 2
          ? (this.enemyAnimCache.get('eoc_p2') ?? [])
          : (this.enemyAnimCache.get('eoc_p1') ?? []);
        anchor = 'center';
      }
      if (frames.length) {
        const rate = e.key === 'eye_of_cthulhu' ? (e.phase === 2 ? 6 : 10) : 12;
        const idx = Math.floor(e.animT / rate) % frames.length;
        const fr = frames[idx];
        ctx.save();
        if (flash) ctx.filter = 'brightness(2.5)';
        else if (underwater) ctx.filter = 'sepia(0.45) hue-rotate(175deg) saturate(0.9) brightness(0.82)';
        // 缩放贴合碰撞盒
        const h = anchor === 'feet' ? e.h * 1.25 : e.h;
        const w = (fr.sw / fr.sh) * h;
        if (anchor === 'feet') {
          ctx.translate(e.cx, e.y + e.h);
          // 素材默认朝左：向右移动时镜像（僵尸实测需要与其它怪一致的翻转）
          const flip = -e.facing;
          ctx.scale(flip, 1);
          // 贴底：按精灵最低不透明行对齐脚底（史莱姆贴图底部有透明留白会浮空）
          const pad = this.spriteBottomPad(fr);
          ctx.drawImage(fr.img, fr.sx, fr.sy, fr.sw, fr.sh, -w / 2, -h + pad * (h / fr.sh), w, h);
        } else if (e.key === 'demon_eye') {
          // 恶魔之眼：以眼球为原点按移动方向自由旋转（贴图默认朝左，与 NPC 系素材一致）
          const ang = Math.atan2(e.vy, e.vx) + Math.PI;
          ctx.translate(e.cx, e.cy);
          ctx.rotate(ang);
          ctx.drawImage(fr.img, fr.sx, fr.sy, fr.sw, fr.sh, -w / 2, -h / 2, w, h);
        } else if (e.key === 'eye_of_cthulhu') {
          // 朝向移动方向自由旋转（AI 端平滑追踪目标角度，变身时三圈自转叠加）
          ctx.translate(e.cx, e.cy);
          ctx.rotate(e.visAngle);
          ctx.drawImage(fr.img, fr.sx, fr.sy, fr.sw, fr.sh, -w / 2, -h / 2, w, h);
        } else {
          ctx.translate(e.cx, e.cy);
          ctx.drawImage(fr.img, fr.sx, fr.sy, fr.sw, fr.sh, -w / 2, -h / 2, w, h);
        }
        ctx.restore();
        ctx.filter = 'none';
        this.drawEnemyHpBar(e);
        return;
      }
    }
    // ---- 程序化兜底 ----
    if (e.key.startsWith('slime') && spr) {
      const sq = 1 + e.squash * 0.25;
      const w = e.w * 1.3 * sq, h = e.h * 1.25 / sq;
      ctx.save();
      if (flash) ctx.filter = 'brightness(2.5)';
      else if (underwater) ctx.filter = 'sepia(0.45) hue-rotate(175deg) saturate(0.9) brightness(0.82)';
      ctx.translate(e.cx, e.y + e.h);
      ctx.scale(e.facing, 1);
      ctx.drawImage(spr.canvas, -w / 2, -h, w, h);
      ctx.restore();
      ctx.filter = 'none';
    } else if (spr) {
      const fw = spr.fw;
      const frame = spr.canvas.width > fw ? Math.floor(e.animT / 12) % (spr.canvas.width / fw) : 0;
      ctx.save();
      if (flash) ctx.filter = 'brightness(2.5)';
      if (e.key === 'eye_of_cthulhu') {
        ctx.translate(e.cx, e.cy);
        if (e.phase === 2) {
          const f = Math.floor(e.animT / 10) % 2;
          ctx.drawImage(spr.canvas, f * fw, 0, fw, spr.fh, -e.w / 2, -e.h / 2, e.w, e.h);
        } else {
          ctx.scale(e.facing, 1);
          ctx.drawImage(spr.canvas, frame * fw, 0, fw, spr.fh, -e.w / 2, -e.h / 2, e.w, e.h);
        }
      } else {
        ctx.translate(e.cx, e.cy);
        ctx.scale(e.facing, 1);
        ctx.drawImage(spr.canvas, frame * fw, 0, fw, spr.fh, -spr.fw / 2, -spr.fh / 2, spr.fw, spr.fh);
      }
      ctx.restore();
      ctx.filter = 'none';
    }
    this.drawEnemyHpBar(e);
    void world;
  }

  private drawEnemyHpBar(e: Enemy) {
    // 受击后 4 秒内显示（hpBarT），临近消失淡出；满血不显示
    if (e.hpBarT > 0 && e.hp < e.maxHp) {
      const ctx = this.ctx;
      const wBar = Math.max(18, e.w);
      const fade = e.hpBarT < 40 ? e.hpBarT / 40 : 1;
      ctx.globalAlpha = fade;
      ctx.fillStyle = '#400';
      ctx.fillRect(e.cx - wBar / 2, e.y - 8, wBar, 4);
      ctx.fillStyle = '#E33';
      ctx.fillRect(e.cx - wBar / 2, e.y - 8, wBar * (e.hp / e.maxHp), 4);
      // 剩余血量的亮色前缘
      ctx.fillStyle = '#FF7A7A';
      const fw = wBar * (e.hp / e.maxHp);
      if (fw > 1) ctx.fillRect(e.cx - wBar / 2, e.y - 8, Math.min(2, fw), 4);
      ctx.globalAlpha = 1;
    }
  }

  private drawTownNPC(n: TownNPC) {
    const ctx = this.ctx;
    // ---- 原版贴图条（Images/NPC_{id}，40×56 帧、默认朝左）：帧语义见 TownNPC.fixedUpdate ----
    // 注意：不再回退 Maples 角色/NPC_1.png——那是原版绿史莱姆贴图（Maples 沿用原版命名），
    // 曾导致全部城镇 NPC 显示为史莱姆
    if (this.atlas) {
      const r = this.atlas.vnpc(n.vanillaId, n.frame);
      if (r) {
        ctx.save();
        ctx.translate(n.cx, n.y + n.h); // 脚底中心
        if (n.facing > 0) ctx.scale(-1, 1); // 原版贴图默认朝左，向右镜像
        if (n.iframes > 0 && n.iframes % 4 < 2) ctx.filter = 'brightness(2.5)'; // 受击闪白
        ctx.drawImage(r.img, r.sx, r.sy, r.sw, r.sh, -r.sw / 2, -r.sh, r.sw, r.sh);
        ctx.filter = 'none';
        ctx.restore();
        this.drawNpcBubble(n);
        return;
      }
      // 贴图条懒加载首帧未就绪：落入下方程序化兜底，本帧后懒加载完成
    }
    const spr = this.assets.enemySprites.get(n.npcKey);
    if (!spr) return;
    ctx.save();
    ctx.translate(n.cx, n.cy);
    ctx.scale(n.facing >= 0 ? 1 : -1, 1);
    ctx.drawImage(spr.canvas, -spr.fw / 2, -spr.fh / 2, spr.fw, spr.fh);
    ctx.restore();
    this.drawNpcBubble(n);
  }

  private drawNpcBubble(n: TownNPC) {
    const ctx = this.ctx;
    if (n.bubble) {
      ctx.font = '12px sans-serif';
      const wText = ctx.measureText(n.bubble).width + 10;
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      ctx.fillRect(n.cx - wText / 2, n.y - 26, wText, 18);
      ctx.fillStyle = '#222';
      ctx.textAlign = 'center';
      ctx.fillText(n.bubble, n.cx, n.y - 13);
    }
  }

  private drawPlayer(p: Player, world: World, swing: { t: number; dur: number; item: number } | null) {
    const ctx = this.ctx;
    if (p.dead) return;
    // ---- 持有物/挥舞物：先画（人物身后图层） ----
    // 持有物显示：当前快捷栏选中物品静态握在手中（挥舞时由下方动画覆盖）
    // 尺寸按物品图标原始像素比例（×0.9）：镐/剑等大件大、凝胶等小件小，不再统一归一化
    {
      const held = p.inv.heldItem();
      if (!swing && held) {
        const ar = this.atlasIcon(held.id);
        const icon = ar ? null : this.itemIcon(held.id);
        // 静持锚点比挥砍更低更贴身（火把类小件已验证合适的位置基准）
        const shX = p.cx + p.facing * p.w * 0.48, shY = p.y + p.h * 0.8;
        ctx.save();
        ctx.translate(shX, shY);
        if (p.facing === -1) ctx.scale(-1, 1); // 整体镜像（贴图+姿态），左右完全对称
        ctx.rotate(0.45);
        if (ar) {
          const s = 0.9;
          const w = ar.sw * s, h = ar.sh * s;
          // 握把在左下角，并向手内侧收回 35%：避免整件往外杵
          ctx.drawImage(ar.img, ar.sx, ar.sy, ar.sw, ar.sh, -w * 0.35, -h, w, h);
        } else if (icon) {
          ctx.drawImage(icon, -3.5, -9, 9, 9);
        }
        ctx.restore();
      }
    }

    // 挥舞动画（工具/武器）：人物身后图层——挥砍弧大部分在身体轮廓外，身后不遮挡
    // 静持物品 + 工具/武器挥砍：人物身后图层（挥砍在前太露馅，收回身后）
    if (swing && swing.item >= 0 && ITEM_DEFS[swing.item]?.tool) {
      this.drawUseItem(ctx, p, swing);
    }

    // 无敌帧闪烁：半透明而非消失（主角本体永不全隐）
    ctx.save();
    // 水下滤镜：只作用于主角本体素材（蓝色调：去饱和 + 压暗 + 蓝移）
    if (p.headUnderwater) ctx.filter = 'sepia(0.45) hue-rotate(175deg) saturate(0.9) brightness(0.82)';
    if (p.iframes > 0 && p.iframes % 6 < 2) ctx.globalAlpha = 0.45;
    // 跨台阶时用渲染补偿高度（从旧高度缓升），消除物理瞬移的顿挫感
    ctx.translate(p.cx - p.facing * 2.5, p.y + p.h + p.stepRenderY); // 脚底中心（精灵后移2.5px = 碰撞盒微前移）
    ctx.scale(p.facing, 1);

    // ---- 纸娃娃帧（捏人外观优先，M7；20 帧表默认朝右，与 NPC 相反不做内层翻转） ----
    let drawn = false;
    if (p.appearance) {
      const doll = compositePaperDoll(p.appearance, dollEquipFromInv(p.inv, this.atlas));
      if (doll) {
        let row = 0; // 0 站立
        if (swing) row = 3;
        else if (!p.onGround) row = p.vy < 0 ? 1 : 4;
        else if (Math.abs(p.vx) > 0.3) row = 6 + Math.floor(p.animTime / 6) % 14; // 行走循环 6-19
        const f = dollFrame(doll, row);
        ctx.drawImage(f.img, f.sx, f.sy, f.sw, f.sh, -f.sw / 2, -f.sh, f.sw, f.sh);
        drawn = true;
      }
    }
    if (!drawn && this.atlas) {
      const idle = this.atlas.rect('角色/Player.png', 'Player_0');
      const runFrames = this.runFramesCache ??= this.atlas.animFrames('Player/Run');
      // 动作帧池（Player.png 12-22 号帧）
      if (!this.actionFramesCache) {
        const pool: Record<string, ReturnType<SpriteAtlas['rect']>> = {};
        for (let k = 12; k <= 22; k++) {
          const fr = this.atlas!.rect('角色/Player.png', 'Player_' + k);
          if (fr) pool['Player_' + k] = fr;
        }
        this.actionFramesCache = pool;
      }
      const af = this.actionFramesCache;
      let frame: typeof idle = null;
      // 挥砍/使用中：身体切换到动作姿态（Player.png 倒数 4 帧 = Player_19-22）
      if (swing) {
        // 手部动作帧比道具旋转慢约 16%（跟手），并钳在末帧——
        // 原来的 %4 会让手在 prog=1 时跳回第一帧，比工具"快半拍"
        const swingIdx = 19 + Math.min(3, Math.floor((1 - swing.t / swing.dur) * 0.84 * 4));
        frame = af['Player_' + swingIdx] ?? idle;
      } else if (!p.onGround) {
        // 空中：上升用 12（收腿）、下落用 14（张腿）
        frame = (p.vy < 0 ? af['Player_12'] : af['Player_14']) ?? runFrames[0] ?? idle;
      } else if (Math.abs(p.vx) > 0.3) {
        const idx = Math.floor(p.animTime / 6) % runFrames.length;
        frame = runFrames[idx] ?? idle;
      } else {
        frame = idle;
      }
      if (frame) {
        // 精灵视觉高度固定 56px（≈3.5 格）——与碰撞盒解耦，
        // 碰撞盒缩小只影响物理，贴图保持高大观感不变
        const h = 56;
        const w = (frame.sw / frame.sh) * h;
        // 脚踏实地：按精灵最低不透明行对齐脚底（消除底部透明留白导致的浮空）
        const pad = this.spriteBottomPad(frame);
        // Maples 精灵默认朝左 → 内层翻转，画完还原（否则手持物会被一起翻到背后）
        ctx.save();
        ctx.scale(-1, 1);
        ctx.drawImage(frame.img, frame.sx, frame.sy, frame.sw, frame.sh, -w / 2, -h + pad * (h / frame.sh), w, h);
        ctx.restore();
        drawn = true;
      }
    }
    if (!drawn) {
      // 程序化兜底（锚点同样为脚底中心）
      const sheet = this.assets.playerSheet;
      const fw = this.assets.playerFrameW, fh = this.assets.playerFrameH;
      const frame = p.frame;
      ctx.drawImage(sheet, frame * fw, 0, fw, fh, -fw / 2, -fh, fw, fh);
    }

    ctx.restore();
    // 使用类物品（托举：药水/方块等非工具）：身体前方图层，避免被身体挡住
    if (swing && swing.item >= 0 && !ITEM_DEFS[swing.item]?.tool) {
      this.drawUseItem(ctx, p, swing);
    }

    // 气口气泡：头部浸水时显示（在朝向变换外绘制——左右移动不镜像），
    // 随气量消散；整体更透明
    if (p.headUnderwater || p.breath < 5 || p.refillT >= 0) {
      const gap = 12.5; // 间距 12.5px，气泡直径 11px，留 ~1.5px 视觉分隔
      const baseX = p.cx - (5 * gap) / 2 + gap / 2, baseY = p.y - p.h * 0.4 - 14;
      // 优先原版 Bubble.png（22×22，不透明），程序化圆仅兜底
      const bub = this.atlas ? this.atlas.vmisc('vanilla/Bubble.png') : null;
      // 平滑气量 = (气口-1) + 当前正在消耗那颗的剩余比例 → 逐个渐隐（不画已耗尽的）。
      // 直接 breath+drain 会在扣气瞬间把气泡重新顶满一格
      // 水下：平滑消耗（当前颗渐隐）；出水：0.8s 快速补满动画
      let display: number;
      if (p.refillT >= 0) {
        // 从余量处起填：refillFrom + 缺口 × 进度（不从第一颗重新冒）
        display = p.refillFrom + (5 - p.refillFrom) * p.refill01;
      } else {
        const drain = p.headUnderwater && p.breath > 0 ? p.breathDrain01 : 1;
        display = p.breath - 1 + drain;
      }
      // 5 个槽位固定占位（消耗时槽位不挪动，只是该槽的气泡渐隐消失）
      for (let b = 0; b < 5; b++) {
        const v = display - b; // 该颗的可见度：≥1 满，0..1 渐隐，≤0 跳过
        if (v <= 0) continue;
        const bx = baseX + b * gap;
        const by = baseY;
        ctx.globalAlpha = Math.min(1, v);
        if (bub) {
          ctx.drawImage(bub.img, bub.sx, bub.sy, bub.sw, bub.sh, bx - 5.5, by - 5.5, 11, 11);
        } else {
          ctx.fillStyle = '#BFE3FF';
          ctx.beginPath();
          ctx.arc(bx, by, 4.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,0.5)';
          ctx.beginPath();
          ctx.arc(bx - 1.5, by - 1.5, 1.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
    }

    void world;
  }

  /** 使用/挥舞动画（与静持同尺寸：原始像素比例 ×0.9，不放大）。
   *  工具/武器：绕持握点旋转挥砍（-63° → +57° 完整弧，身后图层）。
   *  使用类物品（托举）：前半程旋转举起（与已验证效果一致），
   *  后半程沿同一路径转回（三角波往返），收尾回到起始位——
   *  不会继续向前转导致"放下时飘到身前一格"。
   *  图层：工具/武器挥砍在身体之前调用（身后），使用类托举在身体之后调用（身前） */
  private drawUseItem(ctx: CanvasRenderingContext2D, p: Player, swing: { t: number; dur: number; item: number }) {
    const ar = this.atlasIcon(swing.item);
    const icon = ar ? null : this.itemIcon(swing.item);
    const prog = 1 - swing.t / swing.dur; // 0..1
    const isTool = !!ITEM_DEFS[swing.item]?.tool;
    // 旋转：前载 ease-out（快速举起）；X 回拉：两端快、中间慢的正弦调制曲线
    // （导数 1+0.6cos(2πp)：起止 1.6 倍速、中段 0.4 倍速，全程单调、终点归一）
    const pa = 1 - (1 - prog) ** 3;
    const pb = prog + (0.6 * Math.sin(2 * Math.PI * prog)) / (2 * Math.PI);
    // 使用类：锚点随进程从挥砍位过渡到静持位（收尾与静持姿势逐像素衔接，无顿挫）
    // 工具/武器挥砍锚点：更高更外（Y 0.62 / X 0.75）
    const idleAX = 0.48, idleAY = 0.80; // 静持锚点（与上方持有物显示一致）
    const ax = isTool ? 0.75 : 0.62 + (idleAX - 0.62) * pb;
    const ay = isTool ? 0.62 : 0.74 + (idleAY - 0.74) * pb;
    const shX = p.cx + p.facing * p.w * ax, shY = p.y + p.h * ay; // 持握点右移下移
    ctx.save();
    ctx.translate(shX, shY);
    if (p.facing === -1) ctx.scale(-1, 1); // 整体镜像（贴图+姿态），左右完全对称
    // 工具：完整挥砍弧，尾段轻微加速（斜率 ≈1.2 倍线性）与手部动作收尾对齐；
    // 使用类：从 -47° 举到静持角 +26°（终点与静持完全一致）
    const pt = (prog + 0.3 * prog * prog) / 1.3;
    const arc = isTool ? -1.1 + pt * 2.0 : -0.825 + (0.45 + 0.825) * pa;
    ctx.rotate(arc);
    if (ar) {
      const s = 0.9;
      const w = ar.sw * s, h = ar.sh * s;
      // 工具/武器：沿挥砍方向从手中伸出；
      // 使用类：起始向外举起（0.62w），X 回拉用平方曲线，收尾落到静持位（-0.35w）
      const ox = isTool ? 0 : w * (0.62 - 0.97 * pb);
      ctx.drawImage(ar.img, ar.sx, ar.sy, ar.sw, ar.sh, ox, -h, w, h);
    } else if (icon) {
      ctx.drawImage(icon, isTool ? 0 : 14 * (1 - 0.97 * pb), -14, 14, 14);
    }
    ctx.restore();
  }

  private runFramesCache: ReturnType<SpriteAtlas['animFrames']> | null = null;
  private actionFramesCache: Record<string, ReturnType<SpriteAtlas['rect']>> | null = null;

  /** 精灵底部透明留白行数（缓存）：用于脚底对齐 */
  private bottomPadCache = new Map<string, number>();

  /** 逐像素染色缓存（原版 XNA SpriteBatch 的 color 乘法等价实现）：
   *  ① multiply 把 RGB 乘上 color —— canvas multiply 会把精灵透明区也铺色（方形伪影）
   *  ② destination-in 重画精灵本体 → alpha 恢复为精灵轮廓，裁掉①的方形
   *  alpha 保持精灵原样（XNA 预乘混合的 RGB 贡献不随 color.A 缩减，见 drawEnemy color pass）
   *  （GetColor 二次绘制语义，Main.cs:24986 / NPC.cs:94903） */
  private tintCache = new Map<string, HTMLCanvasElement>();
  private tintedSprite(
    key: string, frame: { img: CanvasImageSource; sx: number; sy: number; sw: number; sh: number }, color: number[],
  ): HTMLCanvasElement {
    const k = `${key}|${frame.sx},${frame.sy},${frame.sw},${frame.sh}|${color.join(',')}`;
    let c = this.tintCache.get(k);
    if (c) return c;
    c = document.createElement('canvas');
    c.width = Math.max(1, frame.sw);
    c.height = Math.max(1, frame.sh);
    const cx = c.getContext('2d')!;
    cx.drawImage(frame.img, frame.sx, frame.sy, frame.sw, frame.sh, 0, 0, c.width, c.height);
    // ① RGB 乘 color（multiply 的 alpha 取并集 → 透明区被铺色，下一步裁掉）
    cx.globalCompositeOperation = 'multiply';
    cx.fillStyle = `rgb(${color[0]},${color[1]},${color[2]})`;
    cx.fillRect(0, 0, c.width, c.height);
    // ② 用精灵本体当 destination-in 的源：alpha 恢复为轮廓形状
    cx.globalCompositeOperation = 'destination-in';
    cx.drawImage(frame.img, frame.sx, frame.sy, frame.sw, frame.sh, 0, 0, c.width, c.height);
    cx.globalCompositeOperation = 'source-over';
    if (this.tintCache.size > 1024) this.tintCache.clear();
    this.tintCache.set(k, c);
    return c;
  }
  private spriteBottomPad(frame: { img: CanvasImageSource; sx: number; sy: number; sw: number; sh: number }): number {
    const key = `${frame.img instanceof HTMLCanvasElement ? 'c' : 'i'}:${frame.sx},${frame.sy},${frame.sw},${frame.sh}`;
    let pad = this.bottomPadCache.get(key);
    if (pad === undefined) {
      pad = 0;
      const c = document.createElement('canvas');
      c.width = frame.sw; c.height = frame.sh;
      const cx = c.getContext('2d')!;
      cx.drawImage(frame.img, frame.sx, frame.sy, frame.sw, frame.sh, 0, 0, frame.sw, frame.sh);
      const d = cx.getImageData(0, 0, frame.sw, frame.sh).data;
      outer: for (let y = frame.sh - 1; y >= 0; y--) {
        for (let x = 0; x < frame.sw; x++) {
          if (d[(y * frame.sw + x) * 4 + 3] > 40) { pad = frame.sh - 1 - y; break outer; }
        }
      }
      this.bottomPadCache.set(key, pad);
    }
    return pad;
  }

  /** 全亮模式（F9）：跳过光照合成，画面无暗影 */
  fullbright = false;

  private compositeLight(
    cam: Camera, viewW: number, viewH: number,
    lightR: Uint8Array, lightG: Uint8Array, lightB: Uint8Array,
    rx: number, ry: number, rw: number, rh: number,
  ) {
    if (this.fullbright) return; // 开灯：不做 multiply，全部原色
    const z = cam.zoom;
    const ts = TILE;
    const tilesX = Math.ceil(viewW / z / ts) + 2;
    const tilesY = Math.ceil(viewH / z / ts) + 2;
    const tx0 = Math.floor((cam.x - viewW / 2 / z) / ts);
    const ty0 = Math.floor((cam.y - viewH / 2 / z) / ts);
    // 2× 超采样：光照图每半格一个采样点，tile 中心间双线性插值，
    // 光斑梯度曲率更细腻（每格一采样时火把光斑有明显的马赛克棱面感）
    const SS = 2;
    const w2 = tilesX * SS, h2 = tilesY * SS;
    if (this.lightCanvas.width !== w2 || this.lightCanvas.height !== h2) {
      this.lightCanvas.width = w2;
      this.lightCanvas.height = h2;
    }
    const lc = this.lightCtx;
    // ImageData 复用(尺寸不变时)——此前每帧 createImageData ≈87KB 分配
    if (!this._lightImg || this._lightImg.width !== w2 || this._lightImg.height !== h2) {
      this._lightImg = lc.createImageData(w2, h2);
    }
    const img = this._lightImg;
    // 4 tap 双线性。此前 tap 每像素返回 4 个 [r,g,b] 元组 ≈ 5.3M 小对象/s
    // (2026-08 审计 G2);现采样写入模块级标量缓冲,运算顺序不变、结果逐位一致
    const tapBuf = _lightTap;
    for (let py = 0; py < h2; py++) {
      const gy = py / SS - 0.5;              // 亚格坐标（tile 中心在整数处）
      const y0 = Math.floor(gy), fy = gy - y0;
      const wy0 = 1 - fy, wy1 = fy;
      for (let px = 0; px < w2; px++) {
        const gx = px / SS - 0.5;
        const x0 = Math.floor(gx), fx = gx - x0;
        const wx0 = 1 - fx, wx1 = fx;
        const w00 = wx0 * wy0, w10 = wx1 * wy0, w01 = wx0 * wy1, w11 = wx1 * wy1;
        // 4 tap:每 tap 3 通道写 tapBuf[k..k+2],区域外 0(由环境光下限兜底)
        for (let t = 0; t < 4; t++) {
          const sx = x0 + (t & 1), sy = y0 + (t >> 1);
          const tx = tx0 + sx, ty = ty0 + sy;
          const k = t * 3;
          if (tx >= rx && ty >= ry && tx < rx + rw && ty < ry + rh) {
            const li = (ty - ry) * rw + (tx - rx);
            tapBuf[k] = lightR[li]; tapBuf[k + 1] = lightG[li]; tapBuf[k + 2] = lightB[li];
          } else {
            tapBuf[k] = 0; tapBuf[k + 1] = 0; tapBuf[k + 2] = 0;
          }
        }
        let r = tapBuf[0] * w00 + tapBuf[3] * w10 + tapBuf[6] * w01 + tapBuf[9] * w11;
        let g = tapBuf[1] * w00 + tapBuf[4] * w10 + tapBuf[7] * w01 + tapBuf[10] * w11;
        let b2 = tapBuf[2] * w00 + tapBuf[5] * w10 + tapBuf[8] * w01 + tapBuf[11] * w11;
        // 原版语义:无 gamma LUT、无环境光下限(原版光照输出直乘;
        // 夜晚亮度由天空种子+月相地板决定,洞穴真黑)
        const i = (py * w2 + px) * 4;
        img.data[i] = Math.min(255, Math.round(r));
        img.data[i + 1] = Math.min(255, Math.round(g));
        img.data[i + 2] = Math.min(255, Math.round(b2));
        img.data[i + 3] = 255;
      }
    }
    lc.putImageData(img, 0, 0);
    const ctx = this.ctx;
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.globalCompositeOperation = 'multiply';
    const [sx, sy] = cam.worldToScreen(tx0 * ts, ty0 * ts);
    ctx.drawImage(this.lightCanvas, sx, sy, tilesX * ts * z, tilesY * ts * z);
    ctx.restore();
    ctx.globalCompositeOperation = 'source-over';
  }

  // ---- 原版小地图框（MinimapFrame/MinimapFrameManager 1:1，Default 皮肤） ----
  // DrawBackground: MinimapPosition-6 处 244×244 黑底；DrawForeground: 框贴图(256×264)
  // 画在 MinimapPosition+frameOffset(-8,-15)；按钮(18×18)仅悬停时显示（IsHighlighted）
  private minimapFrameTex = this.loadUiTex('UI_Minimap_Default_MinimapFrame');
  private minimapBtnReset = this.loadUiTex('UI_Minimap_Default_MinimapButton_Reset');
  private minimapBtnZoomIn = this.loadUiTex('UI_Minimap_Default_MinimapButton_ZoomIn');
  private minimapBtnZoomOut = this.loadUiTex('UI_Minimap_Default_MinimapButton_ZoomOut');
  /** 小地图缩放（原版 mapMinimapScale，默认 1.05；钳 0.2..3，Main.cs:54953-54959） */
  minimapZoom = 1.05;
  /** 本帧鼠标悬停在小地图框按钮上（Game 据此拦下"点地图开全屏"）——原版 mouseInterface 语义 */
  minimapUiHover = false;
  /** 时间调整面板开关（时间文本旁 ± 按钮切换） */
  timePanelOpen = false;
  /** 本帧指针位于时间按钮/面板上（渲染期写入、下帧 Game 消费：吞掉挖掘/放置/攻击点击） */
  timeUiHover = false;
  /** UI 点击边沿检测（render 存 _mouseDown，drawMinimap 末尾更新） */
  private _uiPrevMouseDown = false;

  private loadUiTex(name: string): HTMLImageElement {
    const img = new Image();
    img.src = `sprites/vanilla-ui/${name}.png`;
    return img;
  }

  /** Default 皮肤按钮位（MinimapFrameManager.CreateAndAdd "Default"：+num 2/6 修正） */
  private static readonly MINIMAP_BTN_POS = {
    reset: [150, 240], zoomIn: [202, 240], zoomOut: [176, 240],
  } as const;

  private drawMinimap(ctx: CanvasRenderingContext2D, cam: Camera, world: World, player: Player, clock: Clock) {
    if (!this.minimap) return;
    this.minimap.flushDirty();
    const size = 240;                 // 放大
    // 原版锚点（Main.cs:54696-54706 UpdateMinimapAnchors + 54944-54949，MapScale=1）：
    // miniMapX = screenWidth - (52+240) = 屏宽-292，miniMapY = 90
    // —— 让位右上角生命/魔力资源条（心行 y≤80、星列 x≈屏宽-25）
    const ox = ctx.canvas.width - size - 52, oy = 90;
    // 原版取景：num14/15 = miniMapWidth/scale —— 正方形窗口（此前按世界纵横比压扁，非原版）
    const viewTiles = Math.max(40, Math.round(size / this.minimapZoom));
    const px = player.cx / TILE, py = player.cy / TILE;
    const sx = Math.max(0, Math.min(world.w - viewTiles, Math.floor(px - viewTiles / 2)));
    const sy = Math.max(0, Math.min(world.h - viewTiles, Math.floor(py - viewTiles / 2)));
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    // 框底黑垫（MinimapFrame.DrawBackground：MinimapPosition=(ox+4,oy+4)，-6 → 244×244 黑 * mapMinimapAlpha）
    ctx.fillStyle = '#000';
    ctx.fillRect(ox - 2, oy - 2, size + 4, size + 4);
    // 地图内容（alpha=mapMinimapAlpha=1）
    ctx.drawImage(this.minimap.canvas, sx, sy, viewTiles, viewTiles, ox, oy, size, size);
    // 迷雾（缩略图 1 tile = size/viewTiles px；世界→屏幕偏移）
    this.drawFog(ctx, world,
      ox - sx * size / viewTiles, oy - sy * size / viewTiles,
      size / viewTiles, 2 * size / viewTiles,
      { x: ox, y: oy, w: size, h: size });
    // 玩家图标
    this.drawPlayerMarker(ctx,
      ox + (px - sx) / viewTiles * size, oy + (py - sy) / viewTiles * size, 10);
    // 框前景（MinimapFrame.DrawForeground：FramePosition = MinimapPosition + frameOffset(-8,-15)）
    const fx = ox + 4 - 8, fy = oy + 4 - 15;
    if (this.minimapFrameTex.complete) ctx.drawImage(this.minimapFrameTex, fx, fy);
    // 按钮：悬停高亮 + 按住生效（MinimapFrame.Update/Click：mouseLeft 持续，×1.025/0.975 步进）
    this.minimapUiHover = false;
    const btns: Array<[HTMLImageElement, readonly [number, number], 'in' | 'out' | 'reset']> = [
      [this.minimapBtnZoomIn, Renderer.MINIMAP_BTN_POS.zoomIn, 'in'],
      [this.minimapBtnZoomOut, Renderer.MINIMAP_BTN_POS.zoomOut, 'out'],
      [this.minimapBtnReset, Renderer.MINIMAP_BTN_POS.reset, 'reset'],
    ];
    for (const [tex, [bx, by], kind] of btns) {
      const cx = fx + bx + 9, cy = fy + by + 9; // 中心；命中盒 22×22（IsTouchingPoint 取 max(size,22)）
      const hovering = Math.abs(this._mouseX - cx) < 11 && Math.abs(this._mouseY - cy) < 11;
      if (!hovering || !tex.complete) continue;
      this.minimapUiHover = true;
      ctx.drawImage(tex, fx + bx, fy + by);
      if (this._mouseDown) {
        if (kind === 'in') this.minimapZoom = Math.min(3, this.minimapZoom * 1.025);
        else if (kind === 'out') this.minimapZoom = Math.max(0.2, this.minimapZoom * 0.975);
        else this.minimapZoom = 1.05;
      }
    }
    // 记录小地图区域供点击检测（黑垫外沿）
    this.minimapRect = { x: ox - 2, y: oy - 2, w: size + 4, h: size + 4 };
    // 时间显示
    const hFloat = clock.hourFloat;
    const hh = String(Math.floor(hFloat)).padStart(2, '0');
    const mm2 = String(Math.floor((hFloat % 1) * 60)).padStart(2, '0');
    ctx.font = 'bold 14px monospace';
    ctx.fillStyle = '#FFF';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 3;
    ctx.textAlign = 'center';
    const timeText = `\u65f6\u95f4 ${hh}:${mm2}`;
    ctx.strokeText(timeText, ox + size / 2, oy + 253 + 14);
    ctx.fillText(timeText, ox + size / 2, oy + 253 + 14);

    // ---- \u65f6\u95f4\u8c03\u6574\u6309\u94ae + \u9762\u677f\uff08\u00b1 \u5207\u6362\uff1b\u547d\u4e2d\u533a\u6574\u4f53\u4e0a\u62a5 timeUiHover \u4f9b Game \u541e\u70b9\u51fb\uff09 ----
    const mx = this._mouseX, my = this._mouseY;
    const clicked = this._mouseDown && !this._uiPrevMouseDown; // \u6309\u4e0b\u8fb9\u6cbf\uff08\u4e0e\u7f29\u653e\u6309\u94ae\u7684\u6301\u7eed\u6309\u4f4f\u533a\u5206\uff09
    const hit = (x: number, y: number, w: number, h: number) =>
      mx >= x && mx <= x + w && my >= y && my <= y + h;
    const btnX = ox + size - 22, btnY = oy + 252, btnS = 20;
    const btnHover = hit(btnX, btnY, btnS, btnS);
    this.timeUiHover = btnHover || (this.timePanelOpen && hit(ox, oy + 276, size, 64));
    ctx.fillStyle = btnHover ? 'rgba(90,110,180,0.95)' : 'rgba(20,26,60,0.85)';
    ctx.fillRect(btnX, btnY, btnS, btnS);
    ctx.strokeStyle = btnHover ? '#ffd76e' : '#4a5aa0';
    ctx.strokeRect(btnX + 0.5, btnY + 0.5, btnS - 1, btnS - 1);
    ctx.fillStyle = '#e8e8f4';
    ctx.font = 'bold 13px monospace';
    ctx.fillText('\u00b1', btnX + btnS / 2, btnY + 15);
    if (clicked && btnHover) this.timePanelOpen = !this.timePanelOpen;
    if (this.timePanelOpen) {
      const px = ox, py = oy + 276, pw = size, ph = 64;
      ctx.fillStyle = 'rgba(8,10,26,0.92)';
      ctx.fillRect(px, py, pw, ph);
      ctx.strokeStyle = '#4a5aa0';
      ctx.strokeRect(px + 0.5, py + 0.5, pw - 1, ph - 1);
      // \u5c0f\u6309\u94ae\u76d2\uff1a\u60ac\u505c\u9ad8\u4eae + \u70b9\u51fb\u52a8\u4f5c
      const box = (x: number, y: number, w: number, h: number, label: string, act: () => void) => {
        const hov = hit(x, y, w, h);
        ctx.fillStyle = hov ? '#3a4680' : '#232c52';
        ctx.fillRect(x, y, w, h);
        ctx.strokeStyle = hov ? '#ffd76e' : '#3a4680';
        ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
        ctx.fillStyle = '#e8e8f4';
        ctx.font = '12px sans-serif';
        ctx.fillText(label, x + w / 2, y + h / 2 + 4);
        if (clicked && hov) act();
      };
      const setT = (t: number) => { clock.timeOfDay = ((t % 1) + 1) % 1; };
      box(px + 8, py + 8, 76, 22, '\u2212 1 \u5c0f\u65f6', () => setT(clock.timeOfDay - 1 / 24));
      ctx.fillStyle = '#9aa2cc';
      ctx.font = '12px sans-serif';
      ctx.fillText(`\u7b2c ${clock.dayCount} \u5929`, px + pw / 2, py + 23);
      box(px + pw - 84, py + 8, 76, 22, '+ 1 \u5c0f\u65f6', () => setT(clock.timeOfDay + 1 / 24));
      // \u5feb\u6377\u9884\u8bbe\uff08clock \u8bed\u4e49\uff1a0=\u5348\u591c 0.25=06:00 0.5=\u6b63\u5348 0.75=18:00\uff09
      const presets: Array<[string, number]> = [['\u6e05\u6668', 0.27], ['\u6b63\u5348', 0.5], ['\u9ec4\u660f', 0.73], ['\u5348\u591c', 0.0]];
      presets.forEach(([label, t], i) => {
        box(px + 10 + i * 56, py + 38, 52, 20, label, () => setT(t));
      });
    }
    this._uiPrevMouseDown = this._mouseDown;
    ctx.restore();
  }

  /** 迷雾遮罩：未探索区域黑色覆盖（世界坐标 → 目标矩形） */
  // 迷雾缓存：探索版本号变化时才重绘半分辨率画布（避免每帧百万格循环卡顿）
  private fogCanvas: HTMLCanvasElement | null = null;
  private fogVersion = -1;

  private getFogCanvas(world: World): HTMLCanvasElement | null {
    const ex = world.explored;
    if (!ex) return null;
    if (this.fogCanvas && this.fogVersion === world.exploredVersion) return this.fogCanvas;
    const st = world.store;
    const w = Math.ceil(st.w / 2), h = Math.ceil(st.h / 2);
    if (!this.fogCanvas) this.fogCanvas = document.createElement('canvas');
    this.fogCanvas.width = w; this.fogCanvas.height = h;
    const fc = this.fogCanvas.getContext('2d')!;
    fc.clearRect(0, 0, w, h);
    fc.fillStyle = '#050508';
    const img = fc.createImageData(w, h);
    for (let by = 0; by < h; by++) {
      for (let bx = 0; bx < w; bx++) {
        const x0 = bx * 2, y0 = by * 2;
        let seen = false;
        for (let dy = 0; dy < 2 && !seen; dy++) for (let dx = 0; dx < 2; dx++) {
          const xx = x0 + dx, yy = y0 + dy;
          if (xx < st.w && yy < st.h && ex[yy * st.w + xx]) { seen = true; break; }
        }
        if (!seen) {
          const i = (by * w + bx) * 4;
          img.data[i] = 5; img.data[i + 1] = 5; img.data[i + 2] = 8; img.data[i + 3] = 255;
        }
      }
    }
    fc.putImageData(img, 0, 0);
    this.fogVersion = world.exploredVersion;
    return this.fogCanvas;
  }

  private drawFog(ctx: CanvasRenderingContext2D, world: World, ox: number, oy: number, scale: number, blockPx: number, clip?: { x: number; y: number; w: number; h: number }) {
    const fc = this.getFogCanvas(world);
    if (!fc) return;
    ctx.save();
    if (clip) {
      ctx.beginPath();
      ctx.rect(clip.x, clip.y, clip.w, clip.h);
      ctx.clip();
    }
    void blockPx;
    // 缓存画布 1 像素 = 2 tile；目标绘制按 scale×2 缩放
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(fc, 0, 0, fc.width, fc.height, ox, oy, fc.width * 2 * scale, fc.height * 2 * scale);
    ctx.restore();
  }

  /** 地图玩家标记：优先 Maples 主角帧（与游戏内形象一致），程序化仅兜底 */
  private drawPlayerMarker(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
    let fw: number, fh: number, img: CanvasImageSource;
    const atlasFrame = this.atlas ? this.atlas.rect('角色/Player.png', 'Player_0') : null;
    if (atlasFrame) {
      img = atlasFrame.img; fw = atlasFrame.sw; fh = atlasFrame.sh;
    } else {
      const sheet = this.assets.playerSheet;
      img = sheet; fw = this.assets.playerFrameW; fh = this.assets.playerFrameH;
    }
    const aspect = fw / fh;
    const h = size, w = size * aspect;
    ctx.drawImage(img, 0, 0, fw, fh, x - w / 2, y - h / 2, w, h);
  }

  /** 全屏地图：半透明背景 + 完整世界图 + 边框 + 操作提示；支持拖动/缩放 */
  drawFullMap(ctx: CanvasRenderingContext2D, world: World, mouseX: number, mouseY: number, mouseDown: boolean) {
    const fm = this.fullMap;
    const viewW = ctx.canvas.width, viewH = ctx.canvas.height;
    this._fmWorldW = world.w;
    this._fmWorldH = world.h;
    // 拖动平移：按下首帧只同步基准点不位移（防地图瞬移）
    // _mapOpenClick：打开地图的那次点击（Game 置位）不参与拖拽，松开后才允许拖
    if (mouseDown && !this._mapOpenClick) {
      if (!this.mapDragging) {
        this.mapDragging = true;
      } else {
        fm.panX += mouseX - this.lastMouse.x;
        fm.panY += mouseY - this.lastMouse.y;
        // 拖动改变 pan 后按当前鼠标重设锚点（缓动中的缩放继续稳定）
        const viewW = ctx.canvas.width, viewH = ctx.canvas.height;
        fm.anchorU = (mouseX - (viewW / 2 - (this._fmWorldW * fm.zoom) / 2 + fm.panX)) / fm.zoom;
        fm.anchorV = (mouseY - (viewH / 2 - (this._fmWorldH * fm.zoom) / 2 + fm.panY)) / fm.zoom;
        fm.anchorMX = mouseX;
        fm.anchorMY = mouseY;
      }
    } else {
      if (!mouseDown) this._mapOpenClick = false; // 松开后恢复正常拖拽
      this.mapDragging = false;
    }
    this.lastMouse = { x: mouseX, y: mouseY };
    // 画布尺寸按世界比例
    const mapW = world.w * fm.zoom;
    const mapH = world.h * fm.zoom;
    // 初始居中玩家（首次打开）
    if (fm.panX === 0 && fm.panY === 0 && !this._mapInit) {
      this._mapInit = true;
      fm.panX = 0;
      fm.panY = 0;
    }
    const cx0 = viewW / 2 - mapW / 2 + fm.panX;
    const cy0 = viewH / 2 - mapH / 2 + fm.panY;
    // 背景遮罩
    ctx.fillStyle = 'rgba(8,6,16,0.88)';
    ctx.fillRect(0, 0, viewW, viewH);
    // 地图边框
    ctx.strokeStyle = '#5A4A7A';
    ctx.lineWidth = 4;
    ctx.strokeRect(cx0 - 3, cy0 - 3, mapW + 6, mapH + 6);
    // 地图本体
    ctx.fillStyle = '#7EB6E8';
    ctx.fillRect(cx0, cy0, mapW, mapH);
    ctx.imageSmoothingEnabled = fm.zoom >= 1;
    ctx.drawImage(this.minimap!.canvas, cx0, cy0, mapW, mapH);
    ctx.imageSmoothingEnabled = false;
    // 迷雾
    this.drawFog(ctx, world, cx0, cy0, fm.zoom, 2 * fm.zoom);
    // 玩家位置标记（醒目：脉冲圆环 + 白箭头 + 文字）
    const p = this._lastPlayer;
    if (p) {
      this.drawFullMapPlayerMarker(ctx, cx0 + p.cx / TILE * fm.zoom, cy0 + p.cy / TILE * fm.zoom);
    }
    // 传送预选标记（第一次点击的点，闪烁提示再次点击确认）
    const tp = this.tpMark;
    if (tp) {
      const blink = 0.55 + 0.45 * Math.sin(performance.now() * 0.008);
      ctx.globalAlpha = blink;
      ctx.strokeStyle = '#FF5050';
      ctx.lineWidth = 3;
      const mx = cx0 + (tp.x + 0.5) * fm.zoom, my = cy0 + (tp.y + 0.5) * fm.zoom;
      ctx.beginPath();
      ctx.arc(mx, my, Math.max(8, 10 * fm.zoom), 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(mx - 14, my); ctx.lineTo(mx + 14, my);
      ctx.moveTo(mx, my - 14); ctx.lineTo(mx, my + 14);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    // 操作提示
    ctx.font = '13px sans-serif';
    ctx.fillStyle = '#C8C0D8';
    ctx.textAlign = 'center';
    ctx.fillText('滚轮缩放 · 拖动平移 · 点击两点传送（首次预选/再点确认）· M 关闭', viewW / 2, viewH - 16);
  }
  private _mapInit = false;

  /** 全屏地图主角标记：脉冲圆环 + 原版风格白箭头（黑描边）+ 坐标文字 */
  private drawFullMapPlayerMarker(ctx: CanvasRenderingContext2D, x: number, y: number) {
    const t = performance.now() * 0.004;
    const pulse = 0.5 + 0.5 * Math.sin(t);
    // 外圈脉冲环（由内向外扩散渐隐）
    ctx.strokeStyle = `rgba(255,255,255,${0.7 * (1 - pulse)})`;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(x, y, 16 + 14 * pulse, 0, Math.PI * 2);
    ctx.stroke();
    // 常驻细环
    ctx.strokeStyle = 'rgba(0,0,0,0.65)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(x, y, 13, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, 13, 0, Math.PI * 2);
    ctx.stroke();
    // 原版风格向下箭头（黑描边白填充，指示"我在这里"）
    const s = 9;
    ctx.beginPath();
    ctx.moveTo(x, y + s * 1.6);
    ctx.lineTo(x - s * 0.85, y - s * 0.5);
    ctx.lineTo(x + s * 0.85, y - s * 0.5);
    ctx.closePath();
    ctx.fillStyle = '#000';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    ctx.stroke();
    ctx.fillStyle = '#FFF';
    ctx.fill();
    // 文字标注（黑描边保证任何底色上可读）
    const label = '主角';
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'center';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(0,0,0,0.85)';
    ctx.strokeText(label, x, y - 22);
    ctx.fillStyle = '#FFF';
    ctx.fillText(label, x, y - 22);
  }
  /** 打开地图的那次点击不参与拖拽（Game 打开时置位，松开后清除） */
  _mapOpenClick = false;
  private _lastPlayer: Player | null = null;
  /** 传送预选标记（Game 写入） */
  tpMark: { x: number; y: number } | null = null;

  /** 调试叠加层：碰撞盒高亮 + 状态信息 */
  private drawDebugOverlay(
    ctx: CanvasRenderingContext2D, cam: Camera, viewW: number, viewH: number,
    player: Player, entities: Entity[], mouseX: number, mouseY: number,
    hover: { x: number; y: number } | null,
  ) {
    const z = cam.zoom;
    const [mx, my] = cam.worldToScreen(mouseX, mouseY);
    const box = (e: { x: number; y: number; w: number; h: number; cx: number }, color: string, label?: string) => {
      const [sx, sy] = cam.worldToScreen(e.x, e.y);
      const sw = e.w * z, sh = e.h * z;
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 3]);
      ctx.strokeRect(sx, sy, sw, sh);
      ctx.setLineDash([]);
      if (label) {
        ctx.font = '10px monospace';
        ctx.fillStyle = color;
        ctx.fillText(label, sx + 2, sy - 3);
      }
    };
    // 主角碰撞盒（亮绿）
    box(player, '#00FF66', `player ${player.w}x${player.h} og:${player.onGround} vy:${player.vy.toFixed(1)}`);
    // 主角中心点
    const [pcx, pcy] = cam.worldToScreen(player.cx, player.cy);
    ctx.fillStyle = '#FF6600';
    ctx.fillRect(pcx - 2, pcy - 2, 4, 4);
    // 手持工具/武器的范围显示（与 Game 判定一致）：
    // 1) 近战判定圆：剑 = 完整 reach，镐/斧/锤 ×0.8，空手 3 格；圆心向朝向平移 reach×0.35
    // 2) 挖掘圆（镐/锤）：4.5 格（tryMine 范围）
    // 3) 砍树圆（斧）：4.5 格（同一 tryMine 通路，斧作用对象为树）
    {
      const held = player.inv.heldItem();
      const tool = held ? ITEM_DEFS[held.id]?.tool : undefined;
      const reach = (tool?.reach ?? TILE * 3) * (tool?.type === 'sword' ? 1 : tool ? 0.8 : 1);
      const circle = (cx: number, r: number, color: string, label: string) => {
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        ctx.arc(cx, pcy, r * z, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.font = '10px monospace';
        ctx.fillStyle = color;
        ctx.fillText(label, cx + 6, pcy - 6);
      };
      // 近战判定圆（朝向前移）
      const acx = pcx + player.facing * reach * 0.35 * z;
      circle(acx, reach, tool ? 'rgba(0,255,200,0.55)' : 'rgba(120,120,160,0.4)',
        `attack ${(reach / TILE).toFixed(1)} tiles${tool ? '' : ' (no tool)'}`);
      // 挖掘范围（镐/锤）
      if (tool && (tool.type === 'pick' || tool.type === 'hammer')) {
        circle(pcx, TILE * 4.5, 'rgba(255,170,60,0.5)', 'mine 4.5 tiles');
      }
      // 砍树范围（斧）
      if (tool && tool.type === 'axe') {
        circle(pcx, TILE * 4.5, 'rgba(120,230,90,0.5)', 'chop 4.5 tiles');
      }
    }
    // 实体碰撞盒
    for (const e of entities) {
      const ent = e as Entity;
      if (ent instanceof Enemy) box(ent, '#FF4444', (ent as Enemy).key);
      else if (ent instanceof Critter) box(ent, '#44AAFF', ent.key);
      else if (ent instanceof ItemDrop) box(ent, '#FFAA00');
      else if (ent instanceof Tombstone) box(ent, '#AA88FF', 'tomb');
    }
    // 鼠标指向 tile
    const [htx, hty] = cam.tileUnder(mouseX, mouseY);
    const [hsx, hsy] = cam.worldToScreen(htx * TILE, hty * TILE);
    ctx.strokeStyle = '#FFFF00';
    ctx.lineWidth = 1;
    ctx.strokeRect(hsx, hsy, TILE * z, TILE * z);
    // 信息面板
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    ctx.fillRect(8, 8, 260, 130);
    ctx.font = '12px monospace';
    ctx.fillStyle = '#00FF66';
    ctx.fillText(`pos: ${player.cx.toFixed(0)}, ${player.cy.toFixed(0)}  tile: ${Math.floor(player.cx / TILE)}, ${Math.floor(player.cy / TILE)}`, 14, 26);
    ctx.fillStyle = '#88FF88';
    ctx.fillText(`box: ${player.w}x${player.h}  onGround: ${player.onGround}  vy: ${player.vy.toFixed(2)}`, 14, 44);
    ctx.fillText(`mouse: ${mouseX}, ${mouseY}  tile: ${htx}, ${hty}`, 14, 62);
    ctx.fillStyle = '#AAA';
    ctx.fillText(`zoom: ${z.toFixed(2)}  entities: ${entities.length}`, 14, 80);
    ctx.fillText(`inWater: ${player.inWater}  headUnder: ${player.headUnderwater}`, 14, 98);
    ctx.fillStyle = '#FF6600';
    ctx.fillText('F3 关闭调试面板', 14, 118);
    // 图例
    ctx.fillStyle = '#666';
    ctx.fillText('绿=主角 橙=中心 红=怪物 蓝=动物 黄=鼠标', 14, 136);
  }

  private drawBossBar(ctx: CanvasRenderingContext2D, viewW: number, boss: { name: string; hp: number; maxHp: number }) {
    const w = Math.min(560, viewW - 200);
    const x = (viewW - w) / 2, y = 28;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(x - 3, y - 3, w + 6, 26);
    ctx.fillStyle = '#5A1010';
    ctx.fillRect(x, y, w, 20);
    ctx.fillStyle = '#D02020';
    ctx.fillRect(x, y, w * Math.max(0, boss.hp / boss.maxHp), 20);
    ctx.font = 'bold 13px sans-serif';
    ctx.fillStyle = '#FFF';
    ctx.textAlign = 'center';
    ctx.fillText(`${boss.name}  ${Math.ceil(boss.hp)} / ${boss.maxHp}`, viewW / 2, y + 15);
  }

}
