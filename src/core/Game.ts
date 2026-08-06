// 游戏主控制器：状态、主循环、挖掘/放置/战斗/生成/存档的总装
import { TILE, SPAWN_CHECK_INTERVAL, ENEMY_CAP, SPAWN_MIN_DIST, SPAWN_MAX_DIST } from './constants';
import { RNG } from './rng';
import { Input } from './Input';
import { buildAssets, AssetBundle } from '../assets/AssetGen';
import { World, ChestData } from '../world/World';
import { generateWorld } from '../world/gen/WorldGen';
import { TILE_DEFS, T, TILE_BY_KEY } from '../data/tiles';
import { ITEM_DEFS, ITEM_BY_KEY } from '../data/items';
import { ENEMY_DEFS } from '../data/enemies';
import { RECIPES } from '../data/recipes';
import { Player } from '../entities/Player';
import { Enemy } from '../entities/Enemy';
import { ItemDrop } from '../entities/ItemDrop';
import { TownNPC } from '../entities/TownNPC';
import { Tombstone } from '../entities/Tombstone';
import { Critter } from '../entities/Critter';
import { CRITTER_DEFS } from '../data/critters';
import { EntityManager, Entity } from '../entities/Entity';
import { Camera } from '../render/Camera';
import { ChunkCache } from '../render/ChunkCache';
import { Renderer, Particle, DamageNumber, Minimap } from '../render/Renderer';
import { LightingEngine } from '../lighting/LightingEngine';
import { Inventory } from '../items/Inventory';
import { LiquidSim } from '../world/liquid/LiquidSim';
import { BuffType } from '../stats/Buffs';
import { SpriteAtlas } from '../assets/SpriteAtlas';
import { AutoTiler } from '../render/AutoTiler';
import { WallTiler } from '../render/WallTiler';
import { Sfx, SfxName } from './Sfx';
import type { GameHooks } from '../entities/types';

const FIXED_DT = 1 / 60;

export interface GameCallbacks {
  onWorldReady: () => void;
  onInventoryChanged: () => void;
  onToast: (msg: string) => void;
  onBuffsChanged?: () => void;
  onDayNight?: (isDay: boolean) => void;
}

export class Game implements GameHooks {
  assets: AssetBundle;
  atlas: SpriteAtlas | null = null;
  autotiler: AutoTiler | null = null;
  world!: World;
  player!: Player;
  camera!: Camera;
  renderer: Renderer;
  chunks!: ChunkCache;
  lighting!: LightingEngine;
  liquid!: LiquidSim;
  entities = new EntityManager();
  input: Input;
  cb: GameCallbacks;
  sfx = new Sfx();

  running = false;
  paused = false;
  private acc = 0;
  private lastTime = 0;
  private tickCount = 0;

  // 挖掘状态
  private mining: { x: number; y: number; progress: number } | null = null;
  /** 当前挖掘目标的硬度缓存（进度归一化用） */
  private hardnessCache = 1;
  swing: { t: number; dur: number; item: number } | null = null;
  private swingHitSet = new Set<number>();

  // 弹药
  particles: Particle[] = [];
  dmgNumbers: DamageNumber[] = [];

  // 敌人生成
  private spawnTimer = 0;
  boss: Enemy | null = null;
  /** tile key → id 反查表（调试句柄/wld 导入映射用） */
  tileByKey = TILE_BY_KEY;

  /** 开发者模式：全部道具入包（溢出的落在展示区上方）+ 出生点右侧摆放所有可放置图块供检验 */
  setupDevMode() {
    const p = this.player;
    const st = this.world.store;
    // ---- 1) 全道具入包 ----
    const overflow: Array<[string, number]> = [];
    for (const def of ITEM_DEFS) {
      const n = def.maxStack === 1 ? 1 : Math.min(def.maxStack, 99);
      const left = p.inv.add(ITEM_BY_KEY[def.key], n);
      if (left > 0) overflow.push([def.key, left]);
    }
    // ---- 2) 展示区：出生点右侧清空并逐行摆放全部可放置图块 ----
    const sx = this.world.spawnX, sy = this.world.spawnY;
    const x0 = sx + 6, x1 = sx + 70, yBot = sy - 2, yTop = sy - 40;
    for (let x = x0; x <= x1; x++) {
      for (let y = yTop; y <= yBot; y++) {
        st.setTile(x, y, 0);
        st.setLiquid(x, y, 0, 0);
      }
      st.setTile(x, yBot, T.STONE);
      st.setTile(x, yBot + 1, T.STONE);
    }
    // 收集可放置 tile（有物品指向，去重）
    const placeable: number[] = [];
    const seen = new Set<number>();
    for (const def of ITEM_DEFS) {
      if (!def.tile) continue;
      const tid = TILE_BY_KEY[def.tile];
      if (tid === undefined || tid === 0 || seen.has(tid)) continue;
      seen.add(tid);
      placeable.push(tid);
    }
    // 逐行摆放：行高 7（最高家具 5 格 + 间隙），每行放满换行并铺新地板
    let cx = x0 + 1, cy = yBot - 1;
    const rowH = 7;
    for (const tid of placeable) {
      const td = TILE_DEFS[tid];
      const w = td.vanilla?.fw ?? td.w ?? 1;
      const h = td.vanilla?.fh ?? td.h ?? 1;
      if (cx + w > x1 - 1) {
        cx = x0 + 1;
        cy -= rowH;
        for (let x = x0; x <= x1; x++) st.setTile(x, cy, T.STONE);
      }
      for (let dx = 0; dx < w; dx++) {
        for (let dy = 0; dy < h; dy++) {
          st.setTile(cx + dx, cy - dy, tid, td.vanilla ? dx * 18 : dx, td.vanilla ? dy * 18 : dy);
        }
      }
      cx += w + 1;
    }
    // ---- 3) 溢出道具以掉落物排在展示区上方（背包 40 格装不下的部分） ----
    let dxDrop = x0;
    let dyDrop = yTop + 3;
    for (const [key, n] of overflow) {
      this.spawnDrop(dxDrop * TILE + 8, dyDrop * TILE, key, n, 0, 0);
      dxDrop += 2;
      if (dxDrop > x1 - 1) { dxDrop = x0; dyDrop += 3; }
    }
    this.cb.onInventoryChanged();
    this.cb.onToast(`开发者模式：${overflow.length} 种道具背包装不下，已排在展示区上方；全部可放置图块在出生点右侧`);
  }

  // NPC 系统
  private housingCheckTimer = 0;
  guideSpawned = false;
  private lastWasDay: boolean | null = null;
  private _mapClickLatch = false;
  private _mapClickLatch2 = false;
  private _tpTarget: { x: number; y: number } | null = null;

  constructor(root: HTMLElement, cb: GameCallbacks, atlas?: SpriteAtlas | null) {
    this.assets = buildAssets();
    if (atlas) {
      this.atlas = atlas;
      this.autotiler = new AutoTiler(atlas);
    }
    this.renderer = new Renderer(this.assets, atlas);
    this.renderer.attach(root);
    this.sfx.load(); // 原版 wav 预解码（挂起态也可解码）
    // 怪物专属声效文件追加载入
    const extra = new Set<string>();
    for (const d of Object.values(ENEMY_DEFS)) for (const f of [...d.hitSound, ...d.killedSound]) extra.add(f);
    this.sfx.addFiles([...extra]);
    this.input = new Input(this.renderer.canvas);
    this.cb = cb;
    // 快捷栏数字键：事件驱动（避免单帧内 down+up 被轮询漏掉）
    this.input.keydownHandlers.push((code) => {
      if (this.player && /^Digit[0-9]$/.test(code)) {
        this.player.inv.selected = code === 'Digit0' ? 9 : Number(code.slice(5)) - 1;
        this.cb.onInventoryChanged();
      }
      // 缩放调节
      if (code === 'Equal' || code === 'NumpadAdd') this.setZoom(this.camera?.zoomTarget + 0.15);
      if (code === 'Minus' || code === 'NumpadSubtract') this.setZoom(this.camera?.zoomTarget - 0.15);
    });
  }

  // ================= 生命周期 =================

  async newWorld(seedText: string, width: number, height: number, onProgress?: (label: string, p: number) => void) {
    this.world = await generateWorld({ width, height, seedText }, (label, p) => onProgress?.(label, p * 0.7));
    // 水体预沉降：创建世界时全图激活+步进至稳定，带进度条
    onProgress?.('水体沉降', 0.72);
    await this.settleLiquids((p) => onProgress?.('水体沉降', 0.72 + p * 0.27));
    onProgress?.('完成', 1);
    this.afterWorldLoad();
    this.cb.onWorldReady();
  }

  /** 全图液体预沉降：只激活有液体的格子及其邻域 + 步进至收敛（活动队列清空）。
   *  注意不能全图激活——世界格数远超 MAX_ACTIVE(2万)，FIFO 会把大量湿格丢出队列，
   *  沉降"假收敛"，进游戏后水才被运行时激活开始流动 */
  private async settleLiquids(onProgress?: (p: number) => void) {
    const w = this.world;
    const sim = new LiquidSim(w);
    const st = w.store;
    // 分带扫描湿格（保持 UI 可喘息），只入队有液体及其四邻
    const bandH = 128;
    const bands = Math.ceil(st.h / bandH);
    for (let b = 0; b < bands; b++) {
      const y0 = b * bandH, y1 = Math.min(st.h - 1, (b + 1) * bandH - 1);
      for (let y = y0; y <= y1; y++) {
        for (let x = 0; x < st.w; x++) {
          if (st.liquid[st.idx(x, y)] > 0) {
            sim.activate(x, y);
            sim.activate(x, y - 1);
            sim.activate(x, y + 1);
            sim.activate(x - 1, y);
            sim.activate(x + 1, y);
          }
        }
      }
      onProgress?.((b / bands) * 0.2);
      await new Promise((r) => setTimeout(r, 0));
    }
    const MAX_STEPS = 30000;
    let step = 0;
    while (step < MAX_STEPS) {
      sim.step();
      step++;
      if (step % 120 === 0) {
        onProgress?.(0.2 + Math.min(0.8, (step / MAX_STEPS) * 0.8));
        await new Promise((r) => setTimeout(r, 0));
        if (!sim.hasActive()) break; // 收敛：队列空（湿格全部入队后此判定才真实）
      }
      if (!sim.hasActive() && step % 10 === 0) break;
    }
    sim.dispose(); // 丢弃临时模拟器（注销监听，避免泄漏到运行期）
    onProgress?.(1);
  }

  async loadWorld(world: World, onProgress?: (label: string, p: number) => void) {
    this.world = world;
    onProgress?.('水体沉降', 0.5);
    await this.settleLiquids((p) => onProgress?.('水体沉降', p));
    this.afterWorldLoad();
    this.cb.onWorldReady();
  }

  private afterWorldLoad() {
    const w = this.world;
    // 墙体贴合器（按墙类型分 sheet；alpha 轮廓分类，规避 Maples 错误规则表）
    const wallTilers = new Map<number, WallTiler>();
    if (this.atlas) {
      const sheetByWall: Record<number, string> = { 1: '地形/Wall_2.png', 2: '地形/Wall_1.png' };
      for (const [wallId, file] of Object.entries(sheetByWall)) {
        if (!this.atlas.has(file)) continue;
        const tiler = new WallTiler(this.atlas, [file]);
        tiler.analyze();
        tiler.buildPatterns();
        wallTilers.set(Number(wallId), tiler);
      }
    }
    this.chunks = new ChunkCache(w, this.assets.tileSheets, this.autotiler, wallTilers);
    this.lighting = new LightingEngine(w);
    this.liquid = new LiquidSim(w);
    this.camera = new Camera(w.w, w.h);
    this.renderer.minimap = new Minimap(w);
    this.entities.clear();
    this.player = new Player(w.spawnX * TILE + 8, (w.spawnY - 2) * TILE, new Inventory());
    // 初始装备（铁器三件套与 Maples 素材对齐；含药水与配饰便于体验 Buff/配饰系统）
    this.player.inv.add(ITEM_BY_KEY['iron_pickaxe'], 1);
    this.player.inv.add(ITEM_BY_KEY['iron_axe'], 1);
    this.player.inv.add(ITEM_BY_KEY['iron_sword'], 1);
    this.player.inv.add(ITEM_BY_KEY['torch'], 12);
    this.player.inv.add(ITEM_BY_KEY['agility_potion'], 2);
    this.player.inv.add(ITEM_BY_KEY['ironskin_potion'], 2);
    this.player.inv.add(ITEM_BY_KEY['thorns_potion'], 2);
    this.player.inv.add(ITEM_BY_KEY['regen_potion'], 2);
    this.player.inv.add(ITEM_BY_KEY['heal_potion'], 2);
    this.player.inv.add(ITEM_BY_KEY['suspicious_eye'], 3);
    this.player.inv.add(ITEM_BY_KEY['lens'], 6);
    // 配饰直接放入配饰栏（槽 40-44）
    this.player.inv.slots[40] = { id: ITEM_BY_KEY['lucky_horseshoe'], stack: 1 };
    this.player.inv.slots[41] = { id: ITEM_BY_KEY['feral_claws'], stack: 1 };
    this.camera.x = this.player.cx;
    this.camera.y = this.player.cy;
    this.boss = null;
    this.guideSpawned = true; // 向导已移除；保留字段避免存档兼容问题
    this.cb.onInventoryChanged();
  }

  /** 销毁：停止循环并移除画布（退出到主菜单时调用） */
  destroy() {
    this.running = false;
    this.renderer.canvas.remove();
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    const loop = (now: number) => {
      if (!this.running) return;
      this.frame(now);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  private frame(now: number) {
    const elapsed = Math.min((now - this.lastTime) / 1000, 0.25);
    this.lastTime = now;
    if (!this.paused) {
      this.acc += elapsed;
      let steps = 0;
      while (this.acc >= FIXED_DT && steps < 5) {
        this.fixedUpdate(FIXED_DT);
        this.acc -= FIXED_DT;
        steps++;
      }
    }
    this.render();
  }

  // ================= 固定步逻辑 =================

  private fixedUpdate(dt: number) {
    this.tickCount++;
    const w = this.world;
    w.clock.tick(dt * 1000);
    // 昼夜切换：提示 + BGM 变奏
    const isDay = w.clock.isDay;
    if (isDay !== this.lastWasDay) {
      if (this.lastWasDay !== null) {
        this.cb.onToast(isDay ? '☀ 太阳升起来了，新的一天开始了' : '🌙 夜幕降临，小心出没的怪物…');
        this.cb.onDayNight?.(isDay);
      }
      this.lastWasDay = isDay;
    }
    const player = this.player;

    // ---- 玩家输入 ----
    const inp = this.input;
    // 点击右上角小地图 → 开关全屏地图
    if (inp.mouseDown && !this._mapClickLatch) {
      const r = this.renderer.minimapRect;
      const fm = this.renderer.fullMap;
      const inMap = inp.mouseX >= r.x && inp.mouseX <= r.x + r.w && inp.mouseY >= r.y && inp.mouseY <= r.y + r.h;
      if (!fm.open && inMap && !inp.uiBlocking) {
        fm.open = true;
        fm.zoom = 0.5; fm.zoomTarget = 0.5;   // 默认最小缩放，留足放大空间
        fm.panX = 0; fm.panY = 0;
        this.renderer['_mapInit'] = false;
        this._mapClickLatch = true;
      }
    }
    if (!inp.mouseDown) this._mapClickLatch = false;
    // 全屏地图：点击传送（两次确认）——第一次预选标记，第二次传送
    if (inp.mouseDown && !this._mapClickLatch2 && this.renderer.fullMap.open && !inp.uiBlocking) {
      this._mapClickLatch2 = true;
      const fm = this.renderer.fullMap;
      // 屏幕坐标 → 地图源坐标（与 zoomFullMapAt 的逆变换一致）
      const viewW = this.renderer.canvas.width, viewH = this.renderer.canvas.height;
      const cx0 = viewW / 2 - (this.world.w * fm.zoom) / 2 + fm.panX;
      const cy0 = viewH / 2 - (this.world.h * fm.zoom) / 2 + fm.panY;
      // 地图绘制：mapW = world.w * zoom（1 tile = zoom 像素）——直接除 zoom 得 tile 坐标
      const tx = Math.floor((inp.mouseX - cx0) / fm.zoom);
      const ty = Math.floor((inp.mouseY - cy0) / fm.zoom);
      if (tx >= 0 && ty >= 0 && tx < this.world.w && ty < this.world.h) {
        if (this._tpTarget && this._tpTarget.x === tx && this._tpTarget.y === ty) {
          // 第二次点击同一点 → 传送；失败不关图、保留标记可重试
          if (this.teleportNear(tx, ty)) {
            this._tpTarget = null;
            this.renderer.tpMark = null;
            this.renderer.fullMap.open = false;
            this.cb.onToast('传送完成');
          }
        } else {
          this._tpTarget = { x: tx, y: ty };
          this.renderer.tpMark = { x: tx, y: ty };
          this.cb.onToast(`已选传送点 (${tx}, ${ty})，再次点击确认`);
        }
      }
    }
    if (!inp.mouseDown) this._mapClickLatch2 = false;
    player.inputX = (inp.down('KeyA') || inp.down('ArrowLeft') ? -1 : 0) + (inp.down('KeyD') || inp.down('ArrowRight') ? 1 : 0);
    player.inputJump = inp.down('Space') || inp.down('KeyW') || inp.down('ArrowUp');
    player.inputDown = inp.down('KeyS') || inp.down('ArrowDown');

    // 滚轮：全屏地图打开时缩放地图，否则缩放游戏画面
    if (inp.wheelDelta !== 0) {
      if (this.renderer.fullMap.open) {
        // 以鼠标为锚点缩放（缩放不乱飞）
        this.renderer.zoomFullMapAt(
          this.renderer.fullMap.zoom * (inp.wheelDelta > 0 ? 0.85 : 1.18),
          inp.mouseX, inp.mouseY,
        );
      } else {
        this.setZoom(this.camera.zoomTarget * (inp.wheelDelta > 0 ? 0.94 : 1.064));
      }
    }

    player.fixedUpdate(dt, this);
    if (player.dead) {
      // 死亡瞬间：红色粉碎粒子 + 原地留墓碑（只处理一次）
      if (!this._deathHandled) {
        this._deathHandled = true;
        this.handlePlayerDeath();
      }
      // 重生计时
      player.respawnTimer++;
      if (player.respawnTimer > 180) this.respawnPlayer();
    } else {
      this._deathHandled = false;
    }

    // ---- 使用物品（鼠标） ----
    this.updateUse(dt);

    // ---- 实体 ----
    this.entities.update(dt, this);

    // ---- 液体（每 tick 步进）----
    this.liquid.step();
    // 每 60 tick 激活可视区外扩 2.5 倍的液体：水在远离画面时就开始流动，
    // 进入视野时已接近稳定，不会"进画面才开始动"
    if (this.tickCount % 60 === 0) {
      const ptx = Math.floor(this.player.cx / TILE), pty = Math.floor(this.player.cy / TILE);
      const halfW = Math.ceil(this.camera.viewW / this.camera.zoom / TILE / 2) * 2.5 + 4;
      const halfH = Math.ceil(this.camera.viewH / this.camera.zoom / TILE / 2) * 2.5 + 4;
      this.liquid.activateRegion(ptx - halfW, pty - halfH, ptx + halfW, pty + halfH);
    }

    // ---- 敌人生成 ----
    this.spawnTimer++;
    if (this.spawnTimer >= SPAWN_CHECK_INTERVAL) {
      this.spawnTimer = 0;
      this.trySpawnEnemy();
    }

    // ---- Boss 逻辑 ----
    if (this.boss) {
      if (this.boss.dead || w.clock.isDay) {
        if (this.boss.dead && !w.flags.downedEyeOfCthulhu) {
          w.flags.downedEyeOfCthulhu = true;
          this.cb.onToast('克苏鲁之眼已被击败！');
        }
        if (w.clock.isDay && !this.boss.dead) {
          this.boss.dead = true;
          this.cb.onToast('克苏鲁之眼在黎明逃走了…');
        }
        this.boss = null;
      }
    }

    // ---- 树苗生长（每 5 秒扫一次） ----
    if (this.tickCount % 300 === 0) this.growSaplings();

    // ---- 战争迷雾：玩家周围探索标记（每 15 tick） ----
    if (this.tickCount % 15 === 0) {
      w.markExplored(Math.floor(player.cx / TILE), Math.floor(player.cy / TILE), 28);
    }

    // ---- Buff 状态栏刷新（每秒） ----
    if (this.tickCount % 60 === 0) this.cb.onBuffsChanged?.();

    // ---- 相机 / 光照 ----
    this.camera.follow(player.cx, player.cy);
    this.camera.easeZoom();
    this.camera.clamp();
    this.chunks.flushDirty();
    const viewTW = Math.ceil(this.camera.viewW / this.camera.zoom / TILE) + 2;
    const viewTH = Math.ceil(this.camera.viewH / this.camera.zoom / TILE) + 2;
    this.lighting.ensureRegion(player.cx, player.cy, viewTW, viewTH);
    // 手持火把照明：选中火把即点亮周围（#11）
    const heldDef = player.inv.heldDef();
    const torchOn = !!heldDef && heldDef.key === 'torch';
    const ptx = Math.floor(player.cx / TILE), pty = Math.floor(player.cy / TILE);
    const prevLight = this.lighting.heldLight;
    this.lighting.heldLight = torchOn ? { tx: ptx, ty: pty } : null;
    if (torchOn !== !!prevLight ||
      (torchOn && prevLight && (prevLight.tx !== ptx || prevLight.ty !== pty))) {
      this.lighting.dirty = true;
    }
    this.lighting.compute(w.clock.dayFactor);

    // ---- 粒子与飘字 ----
    this.flushInvNotify();
    // 小动物环境生成：按昼夜在地表视野外生成，上限 8 只
    if (this.tickCount % 120 === 0 && this.entities.critters.length < 8) {
      this.spawnCritter();
    }
    // 怪物碾压小动物：任意敌人身体接触即杀死（不视为交战）
    if (this.tickCount % 4 === 0 && this.entities.critters.length) {
      for (const cent of this.entities.critters) {
        const c = cent as Critter;
        if (c.dead) continue;
        for (const eent of this.entities.enemies) {
          const e = eent as Enemy;
          if (c.x < e.x + e.w && c.x + c.w > e.x && c.y < e.y + e.h && c.y + c.h > e.y) {
            c.hurt(this);
            break;
          }
        }
      }
    }
    // 僵尸环境呻吟：附近有僵尸时偶发（每 ~4-8 秒）
    if (this.tickCount % 300 === 0) {
      for (const ent of this.entities.enemies) {
        const e = ent as Enemy;
        if (e.key !== 'zombie' && e.key !== 'magma_zombie') continue;
        if (Math.hypot(e.cx - this.player.cx, e.cy - this.player.cy) < TILE * 30) {
          this.sfx.playWav('zombie', 0.6);
          break;
        }
      }
    }
    // 火把火苗：视内点燃火把随机飘出火星（火点在格顶上方 20px 精灵的火焰处）
    this.emitTorchSparks();
    for (const p of this.particles) {
      p.life--;
      p.vy += p.grav ?? 0.12;
      if (p.damp) { p.vx *= p.damp; p.vy *= p.damp; } // 空气阻力：喷溅后缓慢减速飘散
      // 地形碰撞：目标位置实心则反弹（冲击大）或停驻地表（冲击小，重力归零缓慢淡出）
      const st = this.world.store;
      const solidAt = (x: number, y: number) => {
        const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
        return st.inBounds(tx, ty) && st.isSolid(tx, ty);
      };
      let nx = p.x + p.vx;
      if (solidAt(nx, p.y)) { p.vx *= -0.4; nx = p.x; }
      let ny = p.y + p.vy;
      if (solidAt(nx, ny)) {
        if (p.vy > 1.6) {
          p.vy = -p.vy * 0.35; // 溅落反弹
          p.vx *= 0.6;
        } else {
          p.vy = 0; p.vx *= 0.5; p.grav = 0; // 停驻地表
        }
        ny = p.y;
      }
      p.x = nx; p.y = ny;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
    for (const d of this.dmgNumbers) {
      d.life--;
      d.y += d.vy;
      d.vy *= 0.94;
    }
    this.dmgNumbers = this.dmgNumbers.filter((d) => d.life > 0);

    inp.endFrame();

    // 挥剑命中判定（实体更新后）
    this.postUpdate();
  }

  // ================= 物品使用：挖掘 / 放置 / 攻击 / 使用 =================

  private updateUse(dt: number) {
    const inp = this.input;
    if (inp.uiBlocking || this.player.dead) {
      this.mining = null;
      return;
    }
    const held = this.player.inv.heldItem();
    const heldDef = held ? ITEM_DEFS[held.id] : null;
    const [tx, ty] = this.camera.tileUnder(inp.mouseX, inp.mouseY);
    const tool = heldDef?.tool;

    // 右键：附近宝箱（3×3 容差）→ NPC 交谈 → 开门/宝箱/召唤物
    if (inp.rightDown) {
      const nearChest = this.findChestNear(tx, ty);
      if (nearChest) {
        this.openChest?.(nearChest);
        this.input.rightDown = false;
      } else if (this.talkToNearbyNpc()) {
        this.input.rightDown = false;
      } else if (heldDef?.key === 'suspicious_eye') {
        if (!this.world.clock.isDay) {
          this.useSuspiciousEye();
          this.player.inv.removeAt(this.player.inv.selected, 1);
          this.cb.onInventoryChanged();
        } else {
          this.cb.onToast('什么都没有发生...');
        }
        this.input.rightDown = false;
      } else {
        this.interactAt(tx, ty);
      }
    }

    if (!inp.mouseDown) {
      this.mining = null;
      return;
    }

    // 近战挥剑（攻速配饰：猛爪手套 ×2）
    if (tool?.type === 'sword') {
      const spd = Math.max(12, Math.round((tool.speed ?? 42) / this.player.attackSpeedMult));
      if (!this.swing && this.player.useTime === 0) {
        this.swing = { t: spd, dur: spd, item: held!.id };
        this.player.useTime = spd;
        this.swingHitSet.clear();
      }
      this.mining = null;
      return;
    }

    // 镐/斧/锤：挖掘（按住累计）+ 同时作为武器挥击（伤害低于剑）
    if (tool && (tool.type === 'pick' || tool.type === 'axe' || tool.type === 'hammer')) {
      const spd = Math.max(14, Math.round((tool.speed ?? 46) / this.player.attackSpeedMult));
      if (!this.swing && this.player.useTime === 0) {
        this.swing = { t: spd, dur: spd, item: held!.id };
        this.player.useTime = spd;
        this.swingHitSet.clear();
        // 每次挥砍一声：斧砍植物纤维、镐按材质区分土闷/石金（跟随挥砍节奏，不再密集连响）。
        // 没有生效对象（镐没对准可挖方块 / 斧没对准树）则不出声
        const hType = this.world.store.get(tx, ty);
        const hovered = TILE_DEFS[hType];
        const axeOnTarget = hType === T.TREE || (hovered?.decor ?? false);
        const pickOnTarget = hType !== 0 && this.toolCanBreak(hType, tool.power ?? 10, tool.type);
        if (tool.type === 'axe' ? axeOnTarget : pickOnTarget) {
          if (tool.type === 'axe') this.sfx.play('chop');
          else if (hovered && /stone|ore|brick|obsidian|ash|gem_|fossil|silt/i.test(hovered.key)) this.sfx.play('tink');
          else this.sfx.play('dig');
        }
      }
      // 挖掘速率固定基数（tool.speed 已改为纯挥舞时长，两者解耦）；
      // 挖掘快慢仍由镐/斧力(power)体现
      this.tryMine(tx, ty, tool.power ?? 10, tool.type, 22);
      return;
    }

    // 可放置物品：左键放置
    if (heldDef?.tile && !inp.rightDown) {
      this.tryPlace(tx, ty, heldDef);
      return;
    }

    // 其它物品（方块/药水等）：左键使用并带挥砍动画
    if (heldDef && inp.mouseDown && this.player.useTime === 0 && !heldDef.tool) {
      const spd = 30;
      this.swing = { t: spd, dur: spd, item: held!.id };
      this.swingHitSet.clear();
      // 召唤道具（原版左键使用）
      if (heldDef.key === 'suspicious_eye') {
        if (!this.world.clock.isDay) {
          this.useSuspiciousEye();
          this.player.inv.removeAt(this.player.inv.selected, 1);
          this.cb.onInventoryChanged();
        } else {
          this.cb.onToast('什么都没有发生...');
        }
        this.player.useTime = 30;
      }
    }
    // 药水饮用（移植自 Maples：点击饮用，治疗类受耐药性封锁）
    if (heldDef?.potion && inp.mouseDown && this.player.useTime === 0) {
      const p = heldDef.potion;
      const buffTypeMap: Record<string, BuffType> = {
        agility: BuffType.Agility, ironskin: BuffType.Ironskin,
        resistance: BuffType.Resistance, thorns: BuffType.Thorns, regen: BuffType.Regen,
      };
      if (p.isHealType && this.player.buffs.healBlocked) {
        this.cb.onToast('耐药性生效中，无法饮用治疗药水');
        this.player.useTime = 30;
      } else {
        const bt = buffTypeMap[p.buff];
        this.player.buffs.apply(bt, p.duration);
        if (heldDef.heal) {
          this.player.hp = Math.min(this.player.maxHp, this.player.hp + heldDef.heal);
          this.addDamageNumber(this.player.cx, this.player.y, heldDef.heal, false, '#40E080');
        }
        this.player.inv.removeAt(this.player.inv.selected, 1);
        this.player.useTime = 60;
        this.sfx.play('drink');
        this.cb.onInventoryChanged();
        this.cb.onToast(`${heldDef.name}：${p.duration} 秒`);
      }
    }
    this.mining = null;
  }

  private toolCanBreak(type: number, power: number, toolType: string): boolean {
    const d = TILE_DEFS[type];
    if (!d) return false;
    if (toolType === 'pick') return d.pick >= 0 && power >= d.pick;
    if (toolType === 'axe') return d.axe >= 0;
    return false;
  }

  private tryMine(tx: number, ty: number, power: number, toolType: 'pick' | 'axe' | 'hammer', speed: number) {
    // 范围检查
    const dx = tx - Math.floor(this.player.cx / TILE);
    const dy = ty - Math.floor(this.player.cy / TILE);
    if (Math.hypot(dx, dy) > 4.5) { this.mining = null; return; }
    const type = this.world.store.get(tx, ty);
    // 锤：敲除背景墙（无墙则无事发生；也可清装饰）
    if (toolType === 'hammer') {
      const wall = this.world.store.get(tx, ty) === 0 ? this.world.store.wall[this.world.store.idx(tx, ty)] : 0;
      if (type !== 0 && TILE_DEFS[type]?.decor) {
        this.breakTile(tx, ty);
        this.sfx.play('chop');
        this.mining = null;
        return;
      }
      if (!wall) { this.mining = null; return; }
      const key = `${tx},${ty},wall`;
      if (!this.mining || `${this.mining.x},${this.mining.y},wall` !== key) {
        this.mining = { x: tx, y: ty, progress: 0 };
      }
      this.hardnessCache = 150;
      this.mining.progress += speed * (0.6 + power / 50);
      if (this.tickCount % 8 === 0) {
        this.spawnParticles(tx * TILE + 8, ty * TILE + 8, '#5C4436', 2, 1.2); // 粒子保留，声音已移到挥砍
      }
      if (this.mining.progress >= 150) {
        this.world.store.setWall(tx, ty, 0);
        this.spawnParticles(tx * TILE + 8, ty * TILE + 8, '#5C4436', 8, 1.8);
        this.sfx.play('chop');
        this.mining = null;
      }
      return;
    }
    if (type === 0 || !this.toolCanBreak(type, power, toolType)) {
      // 装饰物（杂草等）任意工具/武器一下清掉并掉落
      if (type !== 0 && TILE_DEFS[type]?.decor && (toolType === 'pick' || toolType === 'axe')) {
        this.breakTile(tx, ty);
        this.sfx.play('chop');
        this.mining = null;
        return;
      }
      this.mining = null;
      return;
    }
    const hardness = this.tileHardness(type);
    this.hardnessCache = hardness;
    const key = `${tx},${ty}`;
    if (!this.mining || `${this.mining.x},${this.mining.y}` !== key) {
      this.mining = { x: tx, y: ty, progress: 0 };
    }
    // 工具等级加速（镐：木 1.0x → 金 4.5x；斧对树：木 1.1x → 金 4.1x）
    const factor = toolType === 'axe' ? 0.5 + power / 25 : 0.5 + power / 20;
    this.mining.progress += speed * factor;
    // 粒子反馈（挖掘音已移到挥砍开始，跟随挥砍节奏）
    if (this.tickCount % 6 === 0) {
      this.spawnParticles(tx * TILE + 8, ty * TILE + 8, TILE_DEFS[type].mapColor, 2, 1.2);
    }
    if (this.mining.progress >= hardness) {
      this.breakTile(tx, ty);
      this.mining = null;
      // 破坏完成音：按材质区分（此前普通方块破坏无声——挖掘声只在挥砍开始，
      // 破坏后的空挥被"无目标不出声"挡掉，只剩拾取声可闻）
      const td = TILE_DEFS[type];
      if (toolType === 'axe') this.sfx.play('chop');
      else if (td && /stone|ore|brick|obsidian|ash|gem_|fossil|silt/i.test(td.key)) this.sfx.play('tink');
      else this.sfx.play('dig');
    }
  }

  private tileHardness(type: number): number {
    const d = TILE_DEFS[type];
    // 铜镐基准（52/tick）：泥土 ~0.25s / 石 ~0.6s / 铜矿 ~0.8s / 金矿 ~1.6s
    // 树（斧）：木斧 ~2s / 铜斧 ~1s / 金斧 ~0.4s
    if (type === T.TREE) return 3400;
    if (type === T.LEAVES) return 40;
    if (d.decor) return 60;
    if (d.framed && !d.solid) return 300;               // 工作台/铁砧等
    switch (type) {
      case T.DIRT: case T.GRASS: case T.SAND: case T.SNOW: return 780;
      case T.STONE: return 1870;
      case T.WOOD: case T.PLATFORM: return 1250;
      case T.ORE_COPPER: return 2500;
      case T.ORE_IRON: return 3100;
      case T.ORE_SILVER: return 4100;
      case T.ORE_GOLD: return 5000;
      default: return 1000;
    }
  }

  /** 破坏 tile：处理树整体砍伐与 object 锚点 */
  private breakTile(x: number, y: number) {
    const st = this.world.store;
    const type = st.get(x, y);
    if (type === 0) return;
    const def = TILE_DEFS[type];

    // 树：砍树干 → 整棵树倒下
    if (type === T.TREE) {
      this.fellTree(x, y);
      return;
    }
    // object：找锚点整体移除
    if ((def.w ?? 1) > 1 || (def.h ?? 1) > 1) {
      const fi = st.idx(x, y);
      const fv = st.frameX[fi], fyv = st.frameY[fi];
      // 原版家具帧是 18px 像素偏移，先归一成格偏移再找锚点
      const gx = def.vanilla ? Math.floor(fv / 18) : fv;
      const gy = def.vanilla ? Math.floor(fyv / 18) : fyv;
      const ax = gx === 0 && gy === 0 ? x : x - gx;
      const ay = gx === 0 && gy === 0 ? y : y - gy;
      for (let dx = 0; dx < (def.w ?? 1); dx++) {
        for (let dy = 0; dy < (def.h ?? 1); dy++) {
          st.setTile(ax + dx, ay + dy, 0);
        }
      }
      this.spawnDrop(ax * TILE + 8, ay * TILE, def.drop ?? '', 1);
      // 宝箱内容物掉出
      if (type === T.CHEST) this.dumpChest(ax, ay);
      this.spawnParticles(x * TILE + 8, y * TILE + 8, def.mapColor, 8, 1.8);
      return;
    }
    // 瓦罐：碎裂音 + 随机战利品（火把/炸弹/绳/小血瓶/铜币）
    if (TILE_BY_KEY['pot'] !== undefined && type === TILE_BY_KEY['pot']) {
      st.setTile(x, y, 0);
      this.sfx.play('shatter');
      this.spawnParticles(x * TILE + 8, y * TILE + 8, '#974F50', 10, 2);
      const loot: Array<[string, number, number, number]> = [
        // [itemKey, min, max, 概率]
        ['torch', 3, 8, 0.55],
        ['bomb', 1, 3, 0.22],
        ['rope', 5, 15, 0.20],
        ['lesser_healing_potion', 1, 1, 0.22],
        ['coin_copper', 5, 20, 0.45],
        ['gel', 1, 2, 0.15],
      ];
      for (const [key, mn, mx, ch] of loot) {
        if (Math.random() < ch) {
          this.spawnDrop(x * TILE + 8, y * TILE, key, mn + Math.floor(Math.random() * (mx - mn + 1)),
            (Math.random() - 0.5) * 2.5, -2.5 - Math.random());
        }
      }
      return;
    }
    // 普通
    st.setTile(x, y, 0);
    // 破坏树木正下方的支撑方块 → 整棵树倒下（掉木材）
    const treeOnTop = this.world.trees.find((t) => t.x === x && t.y + t.h === y);
    if (treeOnTop) this.fellTree(x, y - 1);
    if (def.drop) this.spawnDrop(x * TILE + 8, y * TILE + 8, def.drop, 1);
    this.spawnParticles(x * TILE + 8, y * TILE + 8, def.mapColor, 6, 1.5);
  }

  private fellTree(x: number, y: number) {
    // 向上找树顶（同列 TREE tile），向下到 Grass
    const st = this.world.store;
    let top = y;
    while (st.get(x, top - 1) === T.TREE) top--;
    let bottom = y;
    while (st.get(x, bottom + 1) === T.TREE) bottom++;
    const height = bottom - top + 1;
    // 树冠 80×80 以树顶为中心外扩 2-3 格：显式区域标脏，
    // 否则不含树干格的邻 chunk 不会重绘 → 树叶残留
    this.chunks.markDirtyArea(x - 4, top - 4, x + 4, bottom + 1);
    // 清除树干 + 两侧树枝（支干只在紧邻树干处生成，不会误伤邻树），并记录枝干位置
    const branchSpots: Array<{ x: number; y: number }> = [];
    for (let yy = top; yy <= bottom; yy++) {
      st.setTile(x, yy, 0);
      for (const s of [-1, 1]) {
        if (st.get(x + s, yy) === T.TREE) {
          branchSpots.push({ x: x + s, y: yy });
          st.setTile(x + s, yy, 0);
        }
      }
    }
    // 清除树冠（树顶周围半径 3 的 LEAVES）
    for (let dx = -3; dx <= 3; dx++) {
      for (let dy = -4; dy <= 1; dy++) {
        if (st.get(x + dx, top + dy) === T.LEAVES) st.setTile(x + dx, top + dy, 0);
      }
    }
    // 掉木材：树干每段 1 个独立掉落物沿干散落；每根枝干也额外掉 1 份（掉在枝干处）
    const wood = Math.max(1, Math.floor(height * 0.8));
    for (let p = 0; p < wood; p++) {
      const dropY = (top + Math.floor((p + 0.5) * height / wood)) * TILE;
      this.spawnDrop(x * TILE + 8 + (Math.random() - 0.5) * 14, dropY, 'wood', 1, (Math.random() - 0.5) * 2, -2 - Math.random());
    }
    for (const b of branchSpots) {
      this.spawnDrop(b.x * TILE + 8, b.y * TILE + 8, 'wood', 1, (Math.random() - 0.5) * 2, -2 - Math.random());
    }
    // 橡实：较大概率（75%）掉 2-3 颗，沿树冠区域散落供补种
    if (Math.random() < 0.75) {
      const nAcorn = 2 + Math.floor(Math.random() * 2);
      for (let a = 0; a < nAcorn; a++) {
        const ax = x + (Math.random() - 0.5) * 2.5;
        const ay = top + Math.random() * height * 0.4;
        this.spawnDrop(ax * TILE + 8, ay * TILE, 'acorn', 1, (Math.random() - 0.5) * 3, -3 - Math.random());
      }
    }
    this.spawnParticles(x * TILE + 8, top * TILE + 8, '#2E8B3D', 14, 2.2);
    // 从登记表移除
    const t = this.world.trees.findIndex((tr) => tr.x === x && Math.abs(tr.y - top) <= 2);
    if (t >= 0) this.world.trees.splice(t, 1);
  }

  private tryPlace(tx: number, ty: number, itemDef: (typeof ITEM_DEFS)[number]) {
    const st = this.world.store;
    if (!st.inBounds(tx, ty)) return;
    // 距离
    const dx = tx - Math.floor(this.player.cx / TILE);
    const dy = ty - Math.floor(this.player.cy / TILE);
    if (Math.hypot(dx, dy) > 5.5) return;
    const tileId = TILE_BY_KEY[itemDef.tile!];
    const def = TILE_DEFS[tileId];
    // 橡实: 只能种在草块正上方
    if (itemDef.key === 'acorn' && st.get(tx, ty + 1) !== T.GRASS) {
      this.cb.onToast('橡实只能种在草块上');
      return;
    }
    const ow = def.w ?? 1, oh = def.h ?? 1;
    // 放置空间检查
    for (let dx2 = 0; dx2 < ow; dx2++) {
      for (let dy2 = 0; dy2 < oh; dy2++) {
        const px = tx + dx2, py = ty + dy2;
        if (!st.inBounds(px, py)) return;
        if (st.isActive(px, py)) return;
        // 实心物不能与玩家重叠
        if (def.solid && this.overlapsEntity(px, py)) return;
      }
    }
    // 支撑检查：非漂浮（简化：需要任意相邻格有内容或墙）
    const needSupport = def.solid || def.platform || def.framed;
    if (needSupport && !this.hasSupport(tx, ty, ow, oh)) return;
    if (this.player.useTime > 0) return;

    // 放置
    const isVanillaStyle = !!def.vanilla && def.vanilla.frame === 'style';
    for (let dx2 = 0; dx2 < ow; dx2++) {
      for (let dy2 = 0; dy2 < oh; dy2++) {
        const px = tx + dx2, py = ty + dy2;
        // 原版多格家具：帧用 18px 步长偏移（与 .wld 原生一致，渲染端直用）
        if (isVanillaStyle) {
          st.setTile(px, py, tileId, dx2 * 18, dy2 * 18);
        } else {
          st.setTile(px, py, tileId, dx2, dy2);
        }
        // 水被方块挤出：水量转移到相邻可容纳的格子（上/左/右），
        // 而不是被方块吞掉消失。封闭无处可去时才消失
        const pi = st.idx(px, py);
        const liq = st.liquid[pi];
        if (liq > 0) {
          const ltype = st.liquidType[pi];
          st.setLiquid(px, py, 0, 0);
          let remaining = liq;
          for (const [ox, oy] of [[0, -1], [-1, 0], [1, 0]] as const) {
            if (remaining <= 0) break;
            const nx = px + ox, ny = py + oy;
            if (!st.inBounds(nx, ny)) continue;
            const nd = TILE_DEFS[st.type[st.idx(nx, ny)]];
            if (nd && nd.solid) continue;
            const ni = st.idx(nx, ny);
            const cap = 255 - st.liquid[ni];
            if (cap <= 0) continue;
            const t = Math.min(remaining, cap);
            st.setLiquid(nx, ny, st.liquid[ni] + t, ltype || st.liquidType[ni] || 1);
            remaining -= t;
          }
        }
      }
    }
    if (tileId === T.CHEST) {
      this.world.chests.push({ x: tx, y: ty, items: Array(10).fill(null) });
    }
    this.player.inv.removeAt(this.player.inv.selected, 1);
    this.player.useTime = 14;
    this.sfx.play('place');
    this.cb.onInventoryChanged();
  }

  private overlapsEntity(px: number, py: number): boolean {
    const rx = px * TILE, ry = py * TILE;
    if (this.player.x < rx + TILE && this.player.x + this.player.w > rx && this.player.y < ry + TILE && this.player.y + this.player.h > ry) return true;
    for (const e of this.entities.enemies) {
      if (e.x < rx + TILE && e.x + e.w > rx && e.y < ry + TILE && e.y + e.h > ry) return true;
    }
    return false;
  }

  private hasSupport(x: number, y: number, w: number, h: number): boolean {
    const st = this.world.store;
    // 下方
    for (let dx = 0; dx < w; dx++) {
      if (st.isActive(x + dx, y + h) || st.isSolid(x + dx, y + h) || st.wall[st.idx(x + dx, y + h)] !== 0) return true;
    }
    // 上方（火把等贴墙物）
    for (let dx = 0; dx < w; dx++) {
      if (st.isActive(x + dx, y - 1)) return true;
    }
    // 侧邻
    for (let dy = 0; dy < h; dy++) {
      if (st.isActive(x - 1, y + dy) || st.isActive(x + w, y + dy)) return true;
    }
    return false;
  }

  private interactAt(tx: number, ty: number) {
    const st = this.world.store;
    const type = st.get(tx, ty);
    if (type === T.DOOR_CLOSED) {
      // 切换为开门
      const isOpen = st.get(tx + 1, ty) !== 0 || st.get(tx + 1, ty + 1) !== 0 || st.get(tx + 1, ty + 2) !== 0;
      this.toggleDoor(tx, ty, true, isOpen);
      this.input.rightDown = false;
    } else if (type === T.DOOR_OPEN) {
      this.toggleDoor(tx, ty, false, false);
      this.input.rightDown = false;
    } else if (type === T.CHEST) {
      // 打开宝箱：精确命中或 3×3 容差（点击宝箱边缘也算）
      const chest = this.findChest(tx, ty) ?? this.findChestNear(tx, ty);
      if (chest) {
        this.openChest?.(chest);
        this.input.rightDown = false;
      }
    }
  }

  private toggleDoor(x: number, y: number, open: boolean, flipLeft: boolean) {
    const st = this.world.store;
    // 找锚点
    let ax = x, ay = y;
    if (!(st.frameX[st.idx(x, y)] === 0 && st.frameY[st.idx(x, y)] === 0)) {
      ax = x - st.frameX[st.idx(x, y)];
      ay = y - st.frameY[st.idx(x, y)];
    }
    // 开门状态占 2 列，全部清掉再放新状态
    for (let dx = 0; dx < 2; dx++) {
      for (let dy = 0; dy < 3; dy++) {
        if (st.inBounds(ax + dx, ay + dy)) st.setTile(ax + dx, ay + dy, 0);
      }
    }
    if (open) {
      for (let dx = 0; dx < 2; dx++) {
        for (let dy = 0; dy < 3; dy++) {
          if (st.inBounds(ax + dx, ay + dy)) st.setTile(ax + dx, ay + dy, T.DOOR_OPEN, dx, dy);
        }
      }
      this.sfx.play('door_open');
    } else {
      for (let dy = 0; dy < 3; dy++) st.setTile(ax, ay + dy, T.DOOR_CLOSED, 0, dy);
      this.sfx.play('door_close');
    }
  }

  openChest: ((c: ChestData) => void) | null = null;

  private findChest(tx: number, ty: number): ChestData | null {
    for (const c of this.world.chests) {
      if ((c.x === tx || c.x + 1 === tx) && (c.y === ty || c.y + 1 === ty)) return c;
    }
    return null;
  }

  /** 3×3 邻域内找宝箱（点击容差） */
  private findChestNear(tx: number, ty: number): ChestData | null {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const c = this.findChest(tx + dx, ty + dy);
        if (c) return c;
      }
    }
    return null;
  }

  private dumpChest(x: number, y: number) {
    const c = this.findChest(x, y);
    if (!c) return;
    for (const item of c.items) {
      if (item) this.spawnDrop(x * TILE + 16, y * TILE, ITEM_DEFS[item.id].key, item.stack);
    }
    this.world.chests = this.world.chests.filter((cc) => cc !== c);
  }

  // ================= 战斗 =================

  private updateSwingHits() {
    if (!this.swing) return;
    this.swing.t--;
    if (this.swing.t <= 0) { this.swing = null; return; }
    const held = this.player.inv.heldItem();
    if (!held) return;
    const tool = ITEM_DEFS[held.id].tool;
    const reach = tool?.reach ?? TILE * 3;
    // 剑/工具挥舞顺带清除鼠标处的杂草
    {
      const [htx, hty] = this.camera.tileUnder(this.input.mouseX, this.input.mouseY);
      if (this.world.store.get(htx, hty) === T.TALLGRASS) this.breakTile(htx, hty);
    }
    // 弧线判定：玩家前方扇形
    const prog = 1 - this.swing.t / this.swing.dur;
    // 小动物：任何挥击一击致死
    for (const cent of this.entities.critters) {
      const c = cent as Critter;
      if (this.swingHitSet.has(c.id)) continue;
      const cdx = c.cx - this.player.cx, cdy = c.cy - this.player.cy;
      if (Math.hypot(cdx, cdy) <= reach + c.w / 2) {
        this.swingHitSet.add(c.id);
        c.hurt(this);
      }
    }
    for (const ent of this.entities.enemies) {
      const e = ent as Enemy;
      if (this.swingHitSet.has(e.id)) continue;
      const dx = e.cx - this.player.cx;
      const dy = e.cy - this.player.cy;
      const dist = Math.hypot(dx, dy);
      if (dist > reach + e.w / 2) continue;
      // 朝向检查（挥舞半程后命中判定放宽）
      if (Math.sign(dx) !== this.player.facing && Math.abs(dx) > e.w / 2) continue;
      this.swingHitSet.add(e.id);
      // 怪物专属受击声（各家族不同）；播放失败回退通用 hit
      if (!this.sfx.playFiles(e.def.hitSound)) this.sfx.play('hit');
      const crit = Math.random() < 0.08;
      // 工具（镐/斧）也有攻击力但远弱于剑：功率/16（铁镐 3 / 铁斧 4，铁剑 16）—— 仅应急
      const baseDmg = tool?.damage ?? Math.max(1, Math.ceil((tool?.power ?? 10) / 16));
      const dmg = Math.max(1, Math.round((baseDmg + this.player.meleeDamageBonus) * (crit ? 2 : 1) * (0.9 + Math.random() * 0.2)));
      const kdir = Math.sign(dx) || this.player.facing;
      const killed = e.hurt(dmg, kdir * 3.2, -2.5, this);
      this.addDamageNumber(e.cx, e.y, dmg, crit, crit ? '#FFD040' : '#FF7060');
      if (killed && e.def.boss) { /* boss 死亡处理在 fixedUpdate */ }
    }
    void prog;
  }

  // ================= 生成 =================

  private trySpawnEnemy() {
    const w = this.world;
    const p = this.player;
    if (p.dead) return;
    const isDay = w.clock.isDay;
    const count = this.entities.enemies.filter((e) => !(e as Enemy).def.boss).length;
    if (count >= ENEMY_CAP) return;
    if (this.boss) return;

    const rng = new RNG((Math.random() * 1e9) | 0);
    // 生成点：玩家周围环带
    const ang = rng.range(0, Math.PI * 2);
    const dist = rng.range(SPAWN_MIN_DIST, SPAWN_MAX_DIST);
    const ex = p.cx + Math.cos(ang) * dist;
    const ey = p.cy + Math.sin(ang) * dist;
    const tx = Math.floor(ex / TILE), ty = Math.floor(ey / TILE);
    const st = w.store;
    if (!st.inBounds(tx, ty) || tx < 2 || tx > st.w - 3) return;

    const isUnderground = st.wall[st.idx(tx, ty)] !== 0 || ty > w.rockLevel;
    // 海洋/水域排除：该列从天空到 rockLevel 全是液体 = 海里——除鱼类外不生成
    // （蝙蝠等飞行怪在海面上盘旋也不合理，一并排除）
    {
      let liquidTop = -1;
      for (let y = 2; y < Math.min(w.rockLevel, st.h); y++) {
        if (st.liquid[st.idx(tx, y)] > 40) { liquidTop = y; break; }
      }
      if (liquidTop >= 0) {
        // 水面之下 10 格仍是液体 → 判定为海/深水区
        let deep = true;
        for (let y = liquidTop; y < Math.min(liquidTop + 10, st.h); y++) {
          if (st.liquid[st.idx(tx, y)] <= 40) { deep = false; break; }
        }
        if (deep) return;
      }
    }
    // 地狱区：熔岩史莱姆 / 熔岩僵尸（不怕岩浆）
    const hellTop = Math.floor(st.h * 0.86);
    let key: string | null = null;
    if (ty > hellTop) {
      key = rng.chance(0.55) ? 'lava_slime' : 'magma_zombie';
    } else if (isUnderground) {
      key = rng.chance(0.6) ? 'cave_bat' : (rng.chance(0.5) ? 'slime_blue' : 'slime_green');
    } else if (isDay) {
      key = 'slime_green';
    } else {
      const r = rng.next();
      key = r < 0.4 ? 'zombie' : r < 0.75 ? 'demon_eye' : 'slime_blue';
    }
    const def = ENEMY_DEFS[key];
    if (def.nightOnly && isDay) return;
    if (def.dayOnly && !isDay && !isUnderground) { /* 史莱姆夜间也可少量 */ }
    // 找落脚点：从 ty 向下找空中有地面的位置
    let spawnY = -1;
    for (let dy = -8; dy <= 12; dy++) {
      const yy = ty + dy;
      if (yy < 2 || yy > st.h - 3) continue;
      // 落脚点必须无液体（方块之上有水 = 水下/水面，非鱼类不生成——
      // 否则史莱姆会从湖/海底生成然后浮上来）
      const dry = st.liquid[st.idx(tx, yy)] <= 40 && st.liquid[st.idx(tx, yy - 1)] <= 40;
      const clear = !st.isSolid(tx, yy) && !st.isSolid(tx, yy - 1) && dry;
      const ground = st.isSolid(tx, yy + 1) || st.isSolid(tx, yy + 2);
      if (def.flying) {
        if (!st.isSolid(tx, yy) && dry) { spawnY = yy; break; }
      } else if (clear && ground) {
        spawnY = yy;
        break;
      }
    }
    if (spawnY < 0) return;
    // 地表暗处不生成（夜间地表有天空光 0.12，算可见）
    this.spawnEnemy(key, tx * TILE + 8, spawnY * TILE);
  }

  // ================= NPC =================

  private checkHousing() {
    // 向导已随世界出生；此处仅在有合格房屋时为其安家
    const guide = this.entities.npcs.find((n) => (n as TownNPC).npcKey === 'guide') as TownNPC | undefined;
    if (!guide || guide.home) return;
    const st = this.world.store;
    outer:
    for (let x = 3; x < st.w - 3; x++) {
      for (let y = 3; y < st.h - 4; y++) {
        if (st.get(x, y) !== T.DOOR_CLOSED) continue;
        if (this.isValidHouse(x, y)) {
          guide.home = { x: x + 2, y: y - 2 };
          break outer;
        }
      }
    }
  }

  /** 右键与附近 NPC 交谈（#13） */
  private talkToNearbyNpc(): boolean {
    const p = this.player;
    for (const n of this.entities.npcs) {
      const npc = n as TownNPC;
      if (Math.hypot(npc.cx - p.cx, npc.cy - p.cy) > TILE * 3.5) continue;
      const tips = [
        '你好！我是向导。按 E 打开背包，那里可以合成物品。',
        '用镐挖矿、斧砍树。木头+凝胶可以做火把！',
        '夜里会有僵尸和恶魔眼出现，小心行事。',
        '挖到矿石后，用熔炉炼锭、铁砧做更好的装备。',
        '手持火把也能照亮周围，不用非得放置。',
        '想知道更多？去地下找找宝箱吧！',
      ];
      npc.bubble = tips[Math.floor(Math.random() * tips.length)];
      npc.bubbleT = 360;
      npc.talkCooldown = 600;
      return true;
    }
    return false;
  }

  private isValidHouse(doorX: number, doorY: number): boolean {
    // 门占 3 格（doorY 为门顶），检查门内空间：有光源 + 有实心地板 + 有背景墙
    // doorY+3 为地板行
    const st = this.world.store;
    let light = false, solidFloor = 0, walls = 0;
    for (let dx = 1; dx <= 12; dx++) {
      for (let dy = -6; dy <= 4; dy++) {
        const x = doorX + dx, y = doorY + dy;
        if (!st.inBounds(x, y)) continue;
        if (st.get(x, y) === T.TORCH) light = true;
        if (dy === 3 && st.isSolid(x, y)) solidFloor++;
        if (dy >= -2 && dy <= 2 && st.wall[st.idx(x, y)] !== 0) walls++;
      }
    }
    return light && solidFloor >= 6 && walls >= 20;
  }

  // ================= GameHooks 实现 =================

  spawnDrop(x: number, y: number, itemKey: string, count = 1, vx = 0, vy = -2) {
    const id = ITEM_BY_KEY[itemKey];
    if (id === undefined) return;
    const drop = new ItemDrop(x - 6, y - 6, id, count, vx, vy);
    this.entities.add(drop, 'drops');
  }

  damagePlayer(dmg: number, srcX: number, srcY: number, attacker?: Enemy) {
    const p = this.player;
    if (p.dead) return;
    const ok = p.damage(dmg, srcX, srcY);
    if (ok) {
      // 致死一击：不播受击声，只播死亡声（保证最后听到的音效是死亡）
      if (p.hp <= 0) this.sfx.play('pkilled');
      else this.sfx.play('hurt');
      // 实际扣血 = max(1, dmg - defense*0.5)（在 Player.damage 内）
      const dealt = Math.max(1, dmg - p.defense * 0.5);
      this.addDamageNumber(p.cx, p.y, Math.round(dealt), false, '#FF5050');
      // 荆棘 Buff：受击反弹 2 伤害（移植自 Maples Player.Thorn）
      if (p.thornsActive && attacker && !attacker.dead) {
        attacker.hurt(2, Math.sign(attacker.cx - p.cx) || 1, -1.5, this);
        this.addDamageNumber(attacker.cx, attacker.y, 2, false, '#80FF80');
      }
      if (p.hp <= 0) {
        p.dead = true;
        p.respawnTimer = 0;
        // 死亡音由 Player 中央逻辑统一发声（覆盖所有死法），此处不重复
        this.cb.onToast('你死了…');
        // 掉一半铜币
        const coins = p.inv.countOf(ITEM_BY_KEY['coin_copper']);
        if (coins > 0) {
          p.inv.remove(ITEM_BY_KEY['coin_copper'], Math.floor(coins / 2));
        }
      }
    }
  }

  addDamageNumber(x: number, y: number, amount: number, crit: boolean, color = '#FFF') {
    this.dmgNumbers.push({ x, y, vy: -1.6, value: amount, crit, color, life: 50 });
  }

  onEnemyKilled(key: string) {
    if (key === 'eye_of_cthulhu') {
      this.world.flags.downedEyeOfCthulhu = true;
    }
  }

  /** 小动物生成：视野外地表，按昼夜 + 栖息生态筛选，权重抽取。
   *  地面种：脚底精确贴地表格顶（此前高度>1格的实体被埋进地里卡死）；
   *  飞行种：仅开阔天空（向上 30 格无实心）且地表无水（鸭子除外）；
   *  蝴蝶：低空（地表上 1-4 格），优先附近有花的列 */
  private spawnCritter() {
    const st = this.world.store;
    const isDay = this.world.clock.isDay;
    const halfView = Math.ceil((this.camera.viewW / (this.camera.zoom || 1)) / 2 / TILE) + 8;
    const side = Math.random() < 0.5 ? -1 : 1;
    // 找列：蝴蝶优先附近 8 格内有 FLOWER 的列
    let tx = Math.floor(this.player.cx / TILE) + side * (halfView + Math.floor(Math.random() * 18));
    const isButterflyTentative = isDay && Math.random() < 0.35;
    if (isButterflyTentative) {
      for (let attempt = 0; attempt < 6; attempt++) {
        const fx = tx + Math.floor((Math.random() - 0.5) * 16);
        if (fx < 4 || fx >= st.w - 4) continue;
        let found = false;
        for (let dx = -4; dx <= 4 && !found; dx++) {
          for (let y = Math.max(4, Math.floor(this.player.cy / TILE) - 24); y < Math.min(st.h - 4, Math.floor(this.player.cy / TILE) + 30); y++) {
            if (st.type[st.idx(fx + dx, y)] === T.FLOWER) { found = true; break; }
          }
        }
        if (found) { tx = fx; break; }
      }
    }
    if (tx < 4 || tx >= st.w - 4) return;
    // 找地表
    const startY = Math.max(4, Math.floor(this.player.cy / TILE) - 24);
    let groundY = -1;
    for (let y = startY; y < Math.min(st.h - 4, startY + 70); y++) {
      if (st.isSolid(tx, y)) { groundY = y; break; }
    }
    if (groundY < 0) return;
    const surfaceWater = st.liquid[st.idx(tx, groundY - 1)] > 80;
    // 生态判定
    const gTile = st.type[st.idx(tx, groundY)];
    let biome: 'forest' | 'snow' | 'sand' = 'forest';
    if (gTile === T.SNOW) biome = 'snow';
    else if (gTile === T.SAND || gTile === TILE_BY_KEY['sandstone'] || gTile === TILE_BY_KEY['hardened_sand']) biome = 'sand';
    const nearWater = surfaceWater || (() => {
      for (let dx = -2; dx <= 2; dx++) {
        for (let dy = 0; dy <= 2; dy++) {
          if (st.liquid[st.idx(tx + dx, groundY + dy)] > 80) return true;
        }
      }
      return false;
    })();
    // 按昼夜 + 栖息生态过滤（水面列只出 water 生态或飞行种）
    const pool = CRITTER_DEFS.filter((c) => {
      if (c.dayOnly && !isDay) return false;
      if (c.nightOnly && isDay) return false;
      // 鸭子是两栖：水面列可生成（落在岸边浅水/滩涂），其余地面种不能在水列
      if (surfaceWater && !c.water && c.kind !== 'fly' && c.key !== 'duck') return false;
      if (!c.biomes.includes(biome) && !(nearWater && c.biomes.includes('water'))) return false;
      return true;
    });
    if (!pool.length) return;
    const total = pool.reduce((s2, c) => s2 + c.weight, 0);
    let r = Math.random() * total;
    let pick = pool[0];
    for (const c of pool) { r -= c.weight; if (r <= 0) { pick = c; break; } }

    if (pick.kind === 'fly') {
      // 飞行种：地表不能是水（水面飞鸟/蝴蝶不合理，鸭子除外但鸭子不是 fly）
      if (surfaceWater) return;
      // 开阔天空检查（洞穴/地底不生成）
      for (let k = 2; k <= 30; k++) {
        if (groundY - k < 4) return;
        if (st.isSolid(tx, groundY - k)) return;
      }
      // 蝴蝶低空（1-4 格）、鸟/萤火虫中高空
      const lowFly = pick.key === 'butterfly' || pick.key === 'gold_butterfly';
      const flyY = lowFly ? (groundY - 1 - Math.random() * 3) * TILE : (groundY - 8 - Math.random() * 12) * TILE;
      this.entities.add(new Critter(pick.key, tx * TILE + 8, flyY), 'critters');
    } else if (pick.water && surfaceWater) {
      // 水生种（鸭子）：落在水面上（自上而下第一个液体格），不是湖底
      let surfY = 4;
      while (surfY < st.h - 4 && st.liquid[st.idx(tx, surfY)] <= 80) surfY++;
      if (surfY >= st.h - 4) return;
      this.entities.add(new Critter(pick.key, tx * TILE + 8, surfY * TILE), 'critters');
    } else {
      // 地面种：参数即脚底 y（构造器内减 h），精确站上地表格顶
      const c = new Critter(pick.key, tx * TILE + 8, groundY * TILE);
      // 安全兜底：身体中心在实心块内则放弃（防卡死）
      const ci = st.idx(Math.floor(c.cx / TILE), Math.floor(c.cy / TILE));
      if (st.type[ci] !== 0 && st.isSolid(Math.floor(c.cx / TILE), Math.floor(c.cy / TILE))) return;
      this.entities.add(c, 'critters');
    }
  }

  spawnEnemy(key: string, x: number, y: number) {
    const e = new Enemy(key, x, y);
    this.entities.add(e, 'enemies');
    if (e.def.boss) this.boss = e;
    return e;
  }

  /** 树苗生长成树 */
  private growSaplings() {
    const st = this.world.store;
    const grown: Array<[number, number]> = [];
    // 只扫玩家附近 60×40 区域
    const ptx = Math.floor(this.player.cx / TILE), pty = Math.floor(this.player.cy / TILE);
    for (let dy = -20; dy <= 20; dy++) {
      for (let dx = -30; dx <= 30; dx++) {
        const x = ptx + dx, y = pty + dy;
        if (!st.inBounds(x, y) || st.get(x, y) !== T.SAPLING) continue;
        // 上方 2-3 格净空才长
        if (st.isActive(x, y - 1) || st.isActive(x, y - 2) || st.isActive(x, y - 3)) continue;
        if (Math.random() < 0.5) { // 每次一半概率，模拟时间流逝
          grown.push([x, y]);
        }
      }
    }
    for (const [x, y] of grown) {
      const groundY = y + 1;
      const th = 5 + Math.floor(Math.random() * 4);
      st.setTile(x, y, 0);
      for (let dy2 = 1; dy2 <= th; dy2++) {
        if (!st.inBounds(x, groundY - dy2)) break;
        if (st.isActive(x, groundY - dy2)) break;
        st.setTile(x, groundY - dy2, T.TREE, 0, dy2 === th ? 16 : 0);
      }
      this.world.registerTree(x, groundY - th, th);
      this.chunks.markDirtyArea(x - 4, groundY - th - 4, x + 4, groundY);
    }
  }

  /** 拾取物品飘名（主角旁浅白文本）。同一时间只保留一个，
   * 新拾取直接替换旧的 —— 不产生拖影，不会误读为多个物品 */
  showPickupLabel(itemKey: string) {
    const def = ITEM_DEFS[ITEM_BY_KEY[itemKey]];
    if (!def) return;
    this.dmgNumbers = this.dmgNumbers.filter((d) => !d.label);
    this.dmgNumbers.push({
      x: this.player.cx, y: this.player.y - 8, vy: -0.7,
      value: 0, crit: false, color: '#F0F0F0', life: 55, label: def.name,
    });
  }

  playSfx(name: string, vol?: number) {
    this.sfx.play(name as SfxName, vol ?? 1);
  }

  playSfxFiles(files: string[], vol?: number) {
    if (!this.sfx.playFiles(files, vol ?? 1)) this.sfx.play('hit', vol ?? 1);
  }

  /** 拾取物品后刷新 UI（带轻量节流 + 尾包补发，最多延迟 ~166ms） */
  private invNotifyAt = -100;
  private invNotifyPending = false;
  /** 新物品入手飘名（主角旁浅白文本） */

  notifyInventoryChanged() {
    // 检测新物品：与上次快照比较，新增的种类在主角旁飘名
    const inv = this.player.inv;
    if (!this._invSnapshot) {
      this._invSnapshot = new Map<number, number>();
      for (const s2 of inv.slots) {
        if (s2) this._invSnapshot.set(s2.id, (this._invSnapshot.get(s2.id) ?? 0) + s2.stack);
      }
      return;
    }
    const now = new Map<number, number>();
    for (const s2 of inv.slots) {
      if (s2) now.set(s2.id, (now.get(s2.id) ?? 0) + s2.stack);
    }
    for (const [id, n] of now) {
      const before = this._invSnapshot.get(id) ?? 0;
      if (n > before && this.tickCount - this.lastNotifiedAt > 30) {
        this.lastNotifiedAt = this.tickCount;
        const def = ITEM_DEFS[id];
        if (def) {
          this.dmgNumbers.push({
            x: this.player.cx, y: this.player.y - 6, vy: -0.9,
            value: 0, crit: false, color: '#FFFFFF', life: 60, label: def.name,
          } as DamageNumber & { label: string });
        }
        break; // 每次 refresh 只飘一个
      }
    }
    this._invSnapshot = now;
    if (this.tickCount - this.invNotifyAt >= 10) {
      this.invNotifyAt = this.tickCount;
      this.invNotifyPending = false;
      this.cb.onInventoryChanged();
    } else {
      this.invNotifyPending = true;
    }
  }
  private _invSnapshot: Map<number, number> | null = null;
  private lastNotifiedAt = 0;

  private flushInvNotify() {
    if (this.invNotifyPending && this.tickCount - this.invNotifyAt >= 10) {
      this.invNotifyAt = this.tickCount;
      this.invNotifyPending = false;
      this.cb.onInventoryChanged();
    }
  }

  /** 火把火星：视区内点燃的火把按概率在火点处飘出上浮火粒 */
  private emitTorchSparks() {
    if (this.tickCount % 3 !== 0) return; // 20Hz 足够，省扫描
    const st = this.world.store;
    const cam = this.camera;
    const z = cam.zoom || 1;
    const tx0 = Math.max(0, Math.floor((cam.x - cam.viewW / 2 / z) / TILE));
    const tx1 = Math.min(this.world.w - 1, Math.ceil((cam.x + cam.viewW / 2 / z) / TILE));
    const ty0 = Math.max(0, Math.floor((cam.y - cam.viewH / 2 / z) / TILE));
    const ty1 = Math.min(this.world.h - 1, Math.ceil((cam.y + cam.viewH / 2 / z) / TILE));
    for (let y = ty0; y <= ty1; y++) {
      for (let x = tx0; x <= tx1; x++) {
        const i = st.idx(x, y);
        if (st.type[i] !== T.TORCH) continue;
        if (Math.random() >= 0.14) continue;
        // 帧为 0(地面) 时火点在格顶上方；墙面变体也近似取格顶
        this.particles.push({
          x: x * TILE + 5 + Math.random() * 6,
          y: y * TILE - 2 + Math.random() * 4,
          vx: (Math.random() - 0.5) * 0.25,
          vy: -0.35 - Math.random() * 0.4,
          life: 16 + Math.random() * 12, maxLife: 28,
          color: Math.random() < 0.55 ? '#FFB642' : Math.random() < 0.5 ? '#FF8A2A' : '#FFD97A',
          size: 1 + Math.random() * 1.2,
          grav: -0.015,  // 微浮力：火星徐徐上飘
          damp: 0.985,
        });
      }
    }
  }

  spawnParticles(
    x: number, y: number, color: string, count: number, speed = 2,
    opts: { life?: number; damp?: number; grav?: number } = {},
  ) {
    const base = opts.life ?? 40;
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const life = Math.round(base * (0.6 + Math.random() * 0.4));
      this.particles.push({
        x, y, vx: Math.cos(a) * speed * Math.random(), vy: Math.sin(a) * speed * Math.random() - 1,
        life, maxLife: life, color, size: 2 + Math.random() * 2,
        damp: opts.damp, grav: opts.grav,
      });
    }
    if (this.particles.length > 600) this.particles.splice(0, this.particles.length - 600);
  }

  setZoom(z: number) {
    if (!this.camera) return;
    this.camera.setZoomTarget(z);
  }

  // ================= 合成 =================

  itemId(key: string): number {
    return ITEM_BY_KEY[key];
  }

  stationsNearby(): Set<string> {
    const st = this.world.store;
    const px = Math.floor(this.player.cx / TILE), py = Math.floor(this.player.cy / TILE);
    const found = new Set<string>(['hand']);
    for (let dx = -4; dx <= 4; dx++) {
      for (let dy = -3; dy <= 3; dy++) {
        const t = st.get(px + dx, py + dy);
        if (t === T.WORKBENCH) found.add('workbench');
        if (t === T.FURNACE) found.add('furnace');
        if (t === T.ANVIL) found.add('anvil');
      }
    }
    return found;
  }

  canCraft(r: (typeof RECIPES)[number]): boolean {
    if (!this.stationsNearby().has(r.station)) return false;
    return r.inputs.every(([key, n]) => this.player.inv.countOf(ITEM_BY_KEY[key]) >= n);
  }

  craft(r: (typeof RECIPES)[number]) {
    if (!this.canCraft(r)) return;
    for (const [key, n] of r.inputs) this.player.inv.remove(ITEM_BY_KEY[key], n);
    this.player.inv.add(ITEM_BY_KEY[r.out], r.count);
    this.cb.onInventoryChanged();
  }

  // ================= 召唤 Boss =================

  useSuspiciousEye() {
    if (this.world.clock.isDay) {
      this.cb.onToast('夜晚才能使用…');
      return;
    }
    if (this.boss) return;
    // 从远处地表生成（离玩家 ~55 格），Boss 会自己飞过来
    const side = Math.random() < 0.5 ? -1 : 1;
    const tx = Math.floor((this.player.cx + side * 55 * TILE) / TILE);
    let ty = 10;
    for (; ty < this.world.h; ty++) {
      if (this.world.store.type[this.world.store.idx(tx, ty)] !== 0) break;
    }
    const spawnY = Math.max(4, ty - 12) * TILE;
    const e = this.spawnEnemy('eye_of_cthulhu', tx * TILE + 8, spawnY);
    void e;
    this.sfx.playWav('roar');
    this.cb.onToast('你感到有个邪恶的东西在看着你……');
  }

  /** 地图传送：在目标点附近找可容纳主角的空间（2 格高净空 + 站立地面）。
   *  优先目标点自身，然后螺旋外扩到 24 格内就近安置 */
  private teleportNear(tx: number, ty: number): boolean {
    const st = this.world.store;
    const p = this.player;
    // 空中落点：2 格净空即可（无地面要求）
    const fitsAir = (x: number, y: number) => {
      for (let dy = 0; dy <= 1; dy++) {
        if (!st.inBounds(x, y - dy) || st.isSolid(x, y - dy)) return false;
      }
      return true;
    };
    const fits = (x: number, y: number) => {
      // (x, y-1..y) 两格净空（无实心/无液体），y+1 格实心站立
      for (let dy = 0; dy <= 1; dy++) {
        if (!st.inBounds(x, y - dy) || st.isSolid(x, y - dy)) return false;
        if (st.liquid[st.idx(x, y - dy)] > 100) return false;
      }
      return st.inBounds(x, y + 1) && st.isSolid(x, y + 1);
    };
    if (fits(tx, ty)) {
      p.x = tx * TILE + 1; p.y = (ty - 1) * TILE;
    } else {
      // 螺旋外扩找最近可站位置
      let found = false;
      for (let r = 1; r <= 24 && !found; r++) {
        for (let dx = -r; dx <= r && !found; dx++) {
          for (let dy = -r; dy <= r && !found; dy++) {
            if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
            if (fits(tx + dx, ty + dy)) {
              p.x = (tx + dx) * TILE + 1;
              p.y = (ty + dy - 1) * TILE;
              found = true;
            }
          }
        }
      }
      if (!found) {
        // 高空/无地面：允许落在空中（目标列上下找 2 格净空，重力会带下来）
        for (let dy = 0; dy <= 6; dy++) {
          for (const sy of [ty - dy, ty + dy]) {
            if (fitsAir(tx, sy)) {
              p.x = tx * TILE + 1; p.y = (sy - 1) * TILE;
              p.vx = 0; p.vy = 0;
              this.camera.x = p.cx; this.camera.y = p.cy;
              return true;
            }
          }
        }
        this.cb.onToast('传送失败：目标区域完全实心');
        return false;
      }
    }
    p.vx = 0; p.vy = 0;
    this.camera.x = p.cx; this.camera.y = p.cy;
    return true;
  }

  // ================= 重生 =================

  /** 玩家死亡瞬间：红色粉碎粒子散落 + 脚下留一块墓碑 */
  private _deathHandled = false;
  private handlePlayerDeath() {
    const p = this.player;
    // 红色粉碎粒子：身体范围多层爆散，喷溅落地反弹/停驻后缓慢淡出（约 5 秒）
    this.spawnParticles(p.cx, p.y + 8, '#C02020', 22, 3.2, { life: 300, damp: 0.988, grav: 0.09 });
    this.spawnParticles(p.cx, p.cy, '#8A1010', 16, 2.4, { life: 280, damp: 0.985, grav: 0.09 });
    this.spawnParticles(p.cx, p.cy - 6, '#E85050', 10, 2.8, { life: 260, damp: 0.988, grav: 0.09 });
    // 墓碑：作为物理实体从死亡点掉落（空中死亡则从空中坠落，落地弹跳翻滚后安放）
    this.entities.add(new Tombstone(p.cx, p.cy), 'props');
  }


  respawnPlayer() {
    const p = this.player;
    p.hp = p.maxHp;
    p.dead = false;
    p.iframes = 90;
    p.respawnTimer = 0;
    p.x = this.world.spawnX * TILE + 8;
    p.y = (this.world.spawnY - 2) * TILE;
    p.vx = 0; p.vy = 0;
  }

  // ================= 渲染 =================

  render() {
    const cam = this.camera;
    const L = this.lighting;
    const hover = this.input.uiBlocking ? null : (() => {
      const [tx, ty] = cam.tileUnder(this.input.mouseX, this.input.mouseY);
      return this.world.store.inBounds(tx, ty) ? { x: tx, y: ty } : null;
    })();
    this.renderer.render(
      cam, this.world, this.world.clock, this.chunks,
      L.r, L.g, L.b, L.rx, L.ry, L.rw, L.rh,
      this.player,
      this.entities.all(),
      this.particles, this.dmgNumbers,
      this.swing, hover,
      this.boss ? { name: this.boss.def.name, hp: this.boss.hp, maxHp: this.boss.maxHp } : null,
      this.input.mouseX, this.input.mouseY, this.input.mouseDown,
      this.mining ? Math.min(1, this.mining.progress / this.hardnessCache) : 0,
    );
  }

  /** 每逻辑帧后处理挥舞命中（在 fixedUpdate 实体更新后调用） */
  postUpdate() {
    this.updateSwingHits();
  }
}
