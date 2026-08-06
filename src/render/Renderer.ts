// 主渲染器：天空 → chunk → 液体 → 实体 → 粒子/飘字 → 光照合成 → 小地图
import { TILE, CHUNK } from '../core/constants';
import type { Camera } from './Camera';
import { SkyRenderer } from './SkyRenderer';
import { ChunkCache } from './ChunkCache';
import type { World, Clock } from '../world/World';
import type { AssetBundle } from '../assets/AssetGen';
import type { SpriteAtlas } from '../assets/SpriteAtlas';
import { atlasIconForKey } from '../assets/SpriteAtlas';
import { TILE_DEFS } from '../data/tiles';
import { ITEM_DEFS } from '../data/items';
import type { Player } from '../entities/Player';
import { Enemy } from '../entities/Enemy';
import { ItemDrop } from '../entities/ItemDrop';
import { TownNPC } from '../entities/TownNPC';
import { Tombstone, getTombstoneCanvas } from '../entities/Tombstone';
import type { Entity } from '../entities/Entity';

export interface Particle { x: number; y: number; vx: number; vy: number; life: number; maxLife: number; color: string; size: number; damp?: number; grav?: number; }
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
      return w === 1 ? '#3A2A1A' : w === 2 ? '#2E2E2E' : '#3A2812';
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
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  sky = new SkyRenderer();
  lightCanvas: HTMLCanvasElement;
  lightCtx: CanvasRenderingContext2D;
  minimap: Minimap | null = null;

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
  ) {
    this._mouseX = mouseX;
    this._mouseY = mouseY;
    this._mouseDown = mouseDown;
    this.easeFullMap();
    const ctx = this.ctx;
    const viewW = this.canvas.width, viewH = this.canvas.height;
    cam.viewW = viewW; cam.viewH = viewH;
    const z = cam.zoom;

    // 1. 天空
    this.sky.draw(ctx, clock, viewW, viewH, cam.x);

    ctx.save();
    // 世界变换：平移 + 缩放（以屏幕中心为相机中心）
    // 像素风关键：tile/实体用最近邻采样保持锐利（光照层单独用平滑）
    ctx.imageSmoothingEnabled = false;
    ctx.translate(viewW / 2, viewH / 2);
    ctx.scale(z, z);
    ctx.translate(-cam.x, -cam.y);

    // 2. chunks（双层画布：墙层 → 水 → tile 层，水夹在墙与图块之间）
    const ts = TILE;
    const x0 = Math.floor((cam.x - viewW / 2 / z) / (CHUNK * ts)) - 1;
    const x1 = Math.floor((cam.x + viewW / 2 / z) / (CHUNK * ts)) + 1;
    const y0 = Math.floor((cam.y - viewH / 2 / z) / (CHUNK * ts)) - 1;
    const y1 = Math.floor((cam.y + viewH / 2 / z) / (CHUNK * ts)) + 1;
    const chunkVisible = (cx: number, cy: number) =>
      cx >= 0 && cy >= 0 && cx * CHUNK < world.w && cy * CHUNK < world.h;
    // 2a. 背景墙层
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        if (!chunkVisible(cx, cy)) continue;
        ctx.drawImage(chunks.get(cx, cy).wall, cx * CHUNK * ts, cy * CHUNK * ts);
      }
    }

    // 2b. 液体（墙之上、图块之下；向实心邻格浸润外扩一格遮住贴图透明缝隙）
    this.drawLiquids(world, cam, viewW, viewH, z);

    // 2c. 前景 tile/物体层
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        if (!chunkVisible(cx, cy)) continue;
        ctx.drawImage(chunks.get(cx, cy).tile, cx * CHUNK * ts, cy * CHUNK * ts);
      }
    }

    // 4. 实体（按 y 排序）
    const sorted = [...entities].sort((a, b) => a.y - b.y);
    for (const e of sorted) {
      if (e instanceof Enemy) this.drawEnemy(e, world);
      else if (e instanceof ItemDrop) this.drawDrop(e);
      else if (e instanceof TownNPC) this.drawTownNPC(e);
      else if (e instanceof Tombstone) this.drawTombstone(e);
      else (e as Player).draw && null;
    }
    this.drawPlayer(player, world, swing);

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

    // 10. Boss 血条
    if (boss) this.drawBossBar(ctx, viewW, boss);

    // 11. HP 显示
    this.drawHp(ctx, player);
  }

  private drawLiquids(world: World, cam: Camera, viewW: number, viewH: number, z: number) {
    const ctx = this.ctx;
    const ts = TILE;
    const tx0 = Math.max(0, Math.floor((cam.x - viewW / 2 / z) / ts));
    const tx1 = Math.min(world.w - 1, Math.ceil((cam.x + viewW / 2 / z) / ts));
    const ty0 = Math.max(0, Math.floor((cam.y - viewH / 2 / z) / ts));
    const ty1 = Math.min(world.h - 1, Math.ceil((cam.y + viewH / 2 / z) / ts));
    ctx.fillStyle = 'rgba(61,111,209,0.62)';
    // 渲染外扩判定：邻格是否实心（仅向实心方块浸润，不漏进空气）
    const solidAt = (xx: number, yy: number) => {
      if (!world.store.inBounds(xx, yy)) return false;
      const d = TILE_DEFS[world.store.type[world.store.idx(xx, yy)]];
      return !!d && d.solid;
    };
    for (let y = ty0; y <= ty1; y++) {
      for (let x = tx0; x <= tx1; x++) {
        ctx.fillStyle = 'rgba(61,111,209,0.62)'; // 每格重设：波光块会改 fillStyle，不重设会把水体画白
        const i = world.store.idx(x, y);
        const lq = world.store.liquid[i];
        // 渲染阈值：模拟残留（<40）不绘制 —— 水流过后不留"藏在图块里"的浸润残影
        if (lq < 40) continue;
        const hPx = (lq / 255) * ts;
        // 上方有"可见"液体时整格连通（残留 <40 不可见，不触发连通填充）
        const above = y > 0 ? world.store.liquid[world.store.idx(x, y - 1)] : 0;
        // 水顶面判定：上方是空气（无液体且无实心块）——封闭水格不参与波光
        const aboveAir = above < 40 && !solidAt(x, y - 1) && world.store.type[world.store.idx(x, y - 1)] === 0;
        const top = above >= 40 ? y * ts : y * ts + (ts - hPx);
        // 渲染浸润：按水量分 6 档量化（每档 1/6 格），不同水平面用不同浸润占用，
        // 避免水面贴近格顶时连续比例把整个邻格刷满。只改绘制矩形，液体数据不变。
        const level = Math.min(6, Math.max(1, Math.ceil(((lq - 40) / 215) * 6)));
        const bleed = (ts * level) / 6;
        let px0 = x * ts, px1 = (x + 1) * ts;
        if (solidAt(x - 1, y)) px0 -= bleed;
        if (solidAt(x + 1, y)) px1 += bleed;
        let py0 = top, py1 = y * ts + ts;
        // 上方浸润只在满档（6/6 封闭水格）时生效；浅水层只画自己的 hPx，不上渗
        if (solidAt(x, y - 1) && above < 40 && level === 6) py0 = y * ts - bleed;
        if (solidAt(x, y + 1)) py1 += bleed;
        // 十字浸润：横条（左右外扩，本格纵向范围）∪ 竖条（本格横向范围，上下外扩）。
        // 用两个矩形的并集而非一个大矩形 —— 大矩形会在左右+上下同时浸润时
        // 把对角角落也填掉（变成方形/八方向浸润），水不应渗进斜对角块
        ctx.fillRect(px0, top, px1 - px0, y * ts + ts - top); // 横条
        ctx.fillRect(x * ts, py0, ts, py1 - py0);             // 竖条
        // 波光粼粼：水面之上的白色闪光薄膜 —— 水体本身不动，
        // 只在水顶面上缘覆盖一层呼吸明灭的白膜 + 跳动的碎光
        if (aboveAir) {
          const surfY = y * ts + (ts - hPx);
          const t = performance.now() * 0.0016; // 慢速波相
          const ph = ((x * 2654435761) >>> 0) % 628;
          // 薄膜白光：跨在水面线上下 2px 的白膜（盖住水体顶缘），亮度缓慢呼吸
          const a = 0.22 + 0.28 * (0.5 + 0.5 * Math.sin(t * 1.1 + ph * 0.02));
          ctx.fillStyle = `rgba(255,255,255,${a.toFixed(3)})`;
          ctx.fillRect(px0, surfY - 1, px1 - px0, 2);
          // 碎光：贴着水面线滑动的亮斑（不悬空，随微起伏贴面移动）
          for (let k = 0; k < 2; k++) {
            const tw = Math.sin(t * 1.4 + (ph + k * 317) * 0.013 + k * 2);
            if (tw > 0.5) {
              const gx = x * ts + ((ph % 11) + t * 2.5) % Math.max(1, ts - 5);
              const gy = surfY + Math.sin(t * 1.2 + k * 1.4) * 0.6; // ±0.6px 贴面起伏
              ctx.fillStyle = `rgba(255,255,255,${(0.7 * (tw - 0.5) / 0.5).toFixed(3)})`;
              ctx.fillRect(gx, gy, 3 + k * 2, 1);
            }
          }
        }
      }
    }
  }

  /** 墓碑：以底部中心为支点按倾角旋转绘制（翻滚/侧躺/倒扣） */
  private drawTombstone(t: Tombstone) {
    const ctx = this.ctx;
    const img = getTombstoneCanvas();
    ctx.save();
    ctx.translate(t.cx, t.y + t.h);
    ctx.rotate(t.angle);
    ctx.drawImage(img, -8, -22, 16, 22);
    ctx.restore();
  }

  private drawDrop(d: ItemDrop) {
    const bob = Math.sin((d.age + d.bobPhase * 60) * 0.1) * 1.5;
    // 优先 Maples 图标
    const ar = this.atlasIcon(d.itemId);
    if (ar) {
      this.ctx.drawImage(ar.img, ar.sx, ar.sy, ar.sw, ar.sh, d.x, d.y + bob, 14, 14 * ar.sh / ar.sw);
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
    // ---- Maples 精灵优先 ----
    if (this.atlas) {
      let frames: ReturnType<SpriteAtlas['animFrames']> = [];
      let anchor: 'feet' | 'center' = 'feet';
      if (e.key.startsWith('slime')) { frames = this.enemyAnim(e.key); anchor = 'feet'; }
      else if (e.key === 'zombie') { frames = this.enemyAnim(e.key); anchor = 'feet'; }
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
    // Maples NPC 精灵（NPC_1 首帧）
    if (this.atlas) {
      const file = this.atlas.data.files['角色/NPC_1.png'];
      const fr = file ? this.atlas.rect('角色/NPC_1.png', file.sprites[0]?.name ?? '') : null;
      if (fr) {
        const h = n.h;
        const w = (fr.sw / fr.sh) * h;
        ctx.save();
        ctx.translate(n.cx, n.y + n.h);
        ctx.scale(n.facing >= 0 ? 1 : -1, 1);
        ctx.drawImage(fr.img, fr.sx, fr.sy, fr.sw, fr.sh, -w / 2, -h, w, h);
        ctx.restore();
        if (n.bubble) this.drawNpcBubble(n);
        return;
      }
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
    // 无敌帧闪烁：半透明而非消失（主角本体永不全隐）
    ctx.save();
    // 水下滤镜：只作用于主角本体素材（蓝色调：去饱和 + 压暗 + 蓝移）
    if (p.headUnderwater) ctx.filter = 'sepia(0.45) hue-rotate(175deg) saturate(0.9) brightness(0.82)';
    if (p.iframes > 0 && p.iframes % 6 < 2) ctx.globalAlpha = 0.45;
    // 跨台阶时用渲染补偿高度（从旧高度缓升），消除物理瞬移的顿挫感
    ctx.translate(p.cx, p.y + p.h + p.stepRenderY); // 锚点：脚底中心
    ctx.scale(p.facing, 1);

    // ---- Maples 主角帧（40×58，Run 11 帧循环）----
    let drawn = false;
    if (this.atlas) {
      const idle = this.atlas.rect('角色/Player.png', 'Player_0');
      const runFrames = this.runFramesCache ??= this.atlas.animFrames('Player/Run');
      let frame: typeof idle = null;
      if (!p.onGround) {
        frame = runFrames[0] ?? idle; // 起跳/空中：静态走路首帧（不做动画）
      } else if (Math.abs(p.vx) > 0.3) {
        const idx = Math.floor(p.animTime / 6) % runFrames.length;
        frame = runFrames[idx] ?? idle;
      } else {
        frame = idle;
      }
      if (frame) {
        // 视觉身高放大 1.4 倍于碰撞盒（碰撞盒 30px 可进 2 格，形象保持高大）
        const h = p.h * 1.4;
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

    // 手持物 idle（非挥舞）：任何物品都持在手中（#2），
    // 工具/武器倾斜持握、其它物品直立微偏，按原比例缩放到约 1 格
    const held = p.inv.heldItem();
    if (held && !swing) {
      const isTool = !!ITEM_DEFS[held.id].tool;
      const drawTool = (img: CanvasImageSource, sx: number, sy: number, sw: number, sh: number) => {
        const target = 16; // 约 1 格
        const k = target / Math.max(sw, sh);
        const w = sw * k, h = sh * k;
        ctx.save();
        ctx.translate(9, -p.h * 1.4 + 25); // 手部：身前、腰部高度
        if (isTool) ctx.rotate(-Math.PI / 5);    // 工具/武器倾斜持握
        else ctx.rotate(-Math.PI / 10);           // 其它物品直立微偏
        ctx.drawImage(img, sx, sy, sw, sh, -w / 2, -h / 2, w, h);
        ctx.restore();
      };
      const ar = this.atlasIcon(held.id);
      if (ar) drawTool(ar.img, ar.sx, ar.sy, ar.sw, ar.sh);
      else {
        const icon = this.itemIcon(held.id);
        if (icon) drawTool(icon, 0, 0, icon.width, icon.height);
      }
    }
    // 气口气泡：头部浸水时显示，单行放大，随气量消散
    if (p.headUnderwater || p.breath < 6) {
      for (let b = 0; b < 6; b++) {
        const bx = -27 + b * 10.5;
        const by = -p.h * 1.4 - 12;
        ctx.globalAlpha = b < p.breath ? 0.9 : 0.15;
        ctx.fillStyle = '#BFE3FF';
        ctx.beginPath();
        ctx.arc(bx, by, 4.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.beginPath();
        ctx.arc(bx - 1.5, by - 1.5, 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    ctx.restore();

    // 挥舞动画：物品绕肩旋转
    if (swing && swing.item >= 0) {
      const ar = this.atlasIcon(swing.item);
      const icon = ar ? null : this.itemIcon(swing.item);
      const prog = 1 - swing.t / swing.dur; // 0..1
      const arc = -2.2 + prog * 3.4;        // -126° → +69°
      const shX = p.cx + p.facing * 4, shY = p.y + 16;
      ctx.save();
      ctx.translate(shX, shY);
      ctx.rotate(p.facing === 1 ? arc : Math.PI - arc);
      if (ar) {
        const s = 20 / Math.max(ar.sw, ar.sh);
        ctx.scale(s, s);
        ctx.drawImage(ar.img, ar.sx, ar.sy, ar.sw, ar.sh, 2, -ar.sh, ar.sw, ar.sh);
      } else if (icon) {
        ctx.drawImage(icon, 2, -16, 16, 16);
      }
      ctx.restore();
    }
    void world;
  }

  private runFramesCache: ReturnType<SpriteAtlas['animFrames']> | null = null;

  /** 精灵底部透明留白行数（缓存）：用于脚底对齐 */
  private bottomPadCache = new Map<string, number>();
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

  /** 光照 gamma 曲线 LUT（指数 0.78）：提亮中间调，柔化光源边缘的"切黑"硬边 */
  private static lightLUT: Uint8Array = (() => {
    const t = new Uint8Array(256);
    for (let i = 0; i < 256; i++) t[i] = Math.round(255 * Math.pow(i / 255, 0.78));
    return t;
  })();

  private compositeLight(
    cam: Camera, viewW: number, viewH: number,
    lightR: Uint8Array, lightG: Uint8Array, lightB: Uint8Array,
    rx: number, ry: number, rw: number, rh: number,
  ) {
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
    const img = lc.createImageData(w2, h2);
    const lut = Renderer.lightLUT;
    // tile 中心光值采样（区域外 0，由环境光下限兜底）
    const tap = (gx: number, gy: number): [number, number, number] => {
      const tx = tx0 + gx, ty = ty0 + gy;
      if (tx >= rx && ty >= ry && tx < rx + rw && ty < ry + rh) {
        const li = (ty - ry) * rw + (tx - rx);
        return [lightR[li], lightG[li], lightB[li]];
      }
      return [0, 0, 0];
    };
    for (let py = 0; py < h2; py++) {
      const gy = py / SS - 0.5;              // 亚格坐标（tile 中心在整数处）
      const y0 = Math.floor(gy), fy = gy - y0;
      const wy0 = 1 - fy, wy1 = fy;
      for (let px = 0; px < w2; px++) {
        const gx = px / SS - 0.5;
        const x0 = Math.floor(gx), fx = gx - x0;
        const wx0 = 1 - fx, wx1 = fx;
        // 4 tap 双线性
        const a = tap(x0, y0), b = tap(x0 + 1, y0), c = tap(x0, y0 + 1), d = tap(x0 + 1, y0 + 1);
        const w00 = wx0 * wy0, w10 = wx1 * wy0, w01 = wx0 * wy1, w11 = wx1 * wy1;
        let r = a[0] * w00 + b[0] * w10 + c[0] * w01 + d[0] * w11;
        let g = a[1] * w00 + b[1] * w10 + c[1] * w01 + d[1] * w11;
        let b2 = a[2] * w00 + b[2] * w10 + c[2] * w01 + d[2] * w11;
        // gamma 柔化 + 最低可见度
        const amb = 10;
        const i = (py * w2 + px) * 4;
        img.data[i] = Math.max(lut[Math.min(255, Math.round(r))], amb);
        img.data[i + 1] = Math.max(lut[Math.min(255, Math.round(g))], amb);
        img.data[i + 2] = Math.max(lut[Math.min(255, Math.round(b2))], amb);
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

  private drawMinimap(ctx: CanvasRenderingContext2D, cam: Camera, world: World, player: Player, clock: Clock) {
    if (!this.minimap) return;
    this.minimap.flushDirty();
    const size = 240;                 // 放大
    const pad = 12;
    const ox = ctx.canvas.width - size - pad, oy = pad;
    const viewTilesW = 220, viewTilesH = Math.floor(220 * world.h / world.w);
    const px = player.cx / TILE, py = player.cy / TILE;
    const sx = Math.max(0, Math.min(world.w - viewTilesW, Math.floor(px - viewTilesW / 2)));
    const sy = Math.max(0, Math.min(world.h - viewTilesH, Math.floor(py - viewTilesH / 2)));
    const mmH = size * viewTilesH / viewTilesW;
    ctx.save();
    // 边框
    ctx.strokeStyle = '#5A4A7A';
    ctx.lineWidth = 3;
    ctx.strokeRect(ox - 2, oy - 2, size + 4, mmH + 4);
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 1;
    ctx.strokeRect(ox - 4, oy - 4, size + 8, mmH + 8);
    // 底色：天空色（非黑）
    ctx.fillStyle = '#7EB6E8';
    ctx.fillRect(ox, oy, size, mmH);
    ctx.globalAlpha = 0.92;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.minimap.canvas, sx, sy, viewTilesW, viewTilesH, ox, oy, size, mmH);
    ctx.globalAlpha = 1;
    // 迷雾（缩略图 1 tile = size/viewTilesW px；世界→屏幕偏移）
    this.drawFog(ctx, world,
      ox - sx * size / viewTilesW, oy - sy * mmH / viewTilesH,
      size / viewTilesW, 2 * size / viewTilesW,
      { x: ox, y: oy, w: size, h: mmH });
    // 玩家图标
    this.drawPlayerMarker(ctx,
      ox + (px - sx) / viewTilesW * size, oy + (py - sy) / viewTilesH * mmH, 10);
    // 记录小地图区域供点击检测
    this.minimapRect = { x: ox - 4, y: oy - 4, w: size + 8, h: mmH + 8 };
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
    ctx.strokeText(timeText, ox + size / 2, oy + mmH + 18);
    ctx.fillText(timeText, ox + size / 2, oy + mmH + 18);
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
    if (mouseDown) {
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
    // 玩家图标标记
    const p = this._lastPlayer;
    if (p) {
      this.drawPlayerMarker(ctx, cx0 + p.cx / TILE * fm.zoom, cy0 + p.cy / TILE * fm.zoom, Math.max(14, 10 * fm.zoom));
    }
    // 操作提示
    ctx.font = '13px sans-serif';
    ctx.fillStyle = '#C8C0D8';
    ctx.textAlign = 'center';
    ctx.fillText('滚轮缩放 · 拖动平移 · 再次点击右上角小地图或按 M 关闭', viewW / 2, viewH - 16);
  }
  private _mapInit = false;
  private _lastPlayer: Player | null = null;

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

  /** 像素心：5×4 模板放大（s=4）+ 黑色描边；fill 0-1 为填充比例 */
  private drawPixelHeart(ctx: CanvasRenderingContext2D, x: number, y: number, fill: number) {
    const s = 4;
    const inHeart = (r: number, c: number) =>
      (r === 0 && (c === 1 || c === 3)) || r === 1 || (r === 2 && c >= 1 && c <= 3) || (r === 3 && c === 2);
    // 描边：8 方向偏移画黑色底
    ctx.fillStyle = '#000';
    const outline = (ox: number, oy: number) => {
      for (let r = 0; r < 4; r++) for (let c = 0; c < 5; c++) {
        if (inHeart(r, c)) ctx.fillRect(x + c * s + ox, y + r * s + oy, s, s);
      }
    };
    outline(-1, 0); outline(1, 0); outline(0, -1); outline(0, 1);
    outline(-1, -1); outline(1, -1); outline(-1, 1); outline(1, 1);
    // 空心底
    ctx.fillStyle = '#4A2830';
    for (let r = 0; r < 4; r++) for (let c = 0; c < 5; c++) if (inHeart(r, c)) ctx.fillRect(x + c * s, y + r * s, s, s);
    if (fill <= 0) return;
    // 按比例填充（从左往右裁剪）
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, 5 * s * Math.min(1, fill), 4 * s);
    ctx.clip();
    ctx.fillStyle = '#E83048';
    for (let r = 0; r < 4; r++) for (let c = 0; c < 5; c++) if (inHeart(r, c)) ctx.fillRect(x + c * s, y + r * s, s, s);
    ctx.fillStyle = '#FF8090';
    ctx.fillRect(x + s, y + s, s, s);
    ctx.restore();
  }

  private drawHp(ctx: CanvasRenderingContext2D, p: Player) {
    // 左上角 6 颗像素心平分 maxHp，每颗按百分比填充
    const hearts = 6;
    const per = p.maxHp / hearts;
    const s = 4, wHeart = 5 * s, gap = 7;
    // 自然回血中：当前正在恢复的那颗心带呼吸动效（渐显渐隐 + 微放大缩小）
    const regenActive = p.sinceHurt > 300 && p.hp > 0 && p.hp < p.maxHp;
    const activeIdx = regenActive ? Math.min(hearts - 1, Math.floor(p.hp / per)) : -1;
    const t = performance.now() * 0.004;
    for (let i = 0; i < hearts; i++) {
      const fill = Math.max(0, Math.min(1, (p.hp - i * per) / per));
      const hx = 14 + i * (wHeart + gap), hy = 14;
      if (i === activeIdx && fill > 0 && fill < 1) {
        // 呼吸：0→1→0 缓动驱动 alpha 与缩放
        const br = 0.5 + 0.5 * Math.sin(t * 2.4);      // 呼吸相位
        const alpha = 0.72 + 0.28 * br;
        const k = 1 + 0.09 * br;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(hx + wHeart / 2, hy + 2 * s);
        ctx.scale(k, k);
        ctx.translate(-(hx + wHeart / 2), -(hy + 2 * s));
        this.drawPixelHeart(ctx, hx, hy, fill);
        ctx.restore();
      } else {
        this.drawPixelHeart(ctx, hx, hy, fill);
      }
    }
  }
}
