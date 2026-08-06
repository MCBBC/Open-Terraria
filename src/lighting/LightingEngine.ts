// 光照引擎：天空光列缓存 + 区域内 BFS 三通道衰减传播。
// 只维护「可视区 + 边距」的区域光照，脏时或相机跨阈值时重算。
import { TILE_DEFS } from '../data/tiles';
import { LIGHT_AIR_COST, SKY_LIGHT, TILE } from '../core/constants';
import type { World } from '../world/World';

const MARGIN = 26; // 区域外扩（tile），需 ≥ 光源最大传播距离（255/15 ≈ 17）
const MOVE_THRESHOLD = 2; // 相机中心移动多少 tile 触发重算

export class LightingEngine {
  world: World;
  skyFirstSolid: Int32Array; // 每列第一个不透光 tile 的 y（-1 = 全通）
  // 区域
  rx = 0; ry = 0; rw = 0; rh = 0;
  r: Uint8Array = new Uint8Array(0);
  g: Uint8Array = new Uint8Array(0);
  b: Uint8Array = new Uint8Array(0);
  dirty = true;
  private liquidDirty = false; // 仅液体变化（水流频繁触发，重算限频 20Hz）
  private tick = 0;
  private lastCamCX = -9999; private lastCamCY = -9999;

  constructor(world: World) {
    this.world = world;
    this.skyFirstSolid = new Int32Array(world.w).fill(-1);
    this.rebuildSkyColumns();
    world.store.onTileChanged((x, y) => {
      this.rebuildSkyColumn(x);
      this.dirty = true;
    });
    // 液体变化只影响光衰减，不动天空列；频繁水流时避免每 tick 重建列缓存
    world.store.onLiquidChanged(() => {
      this.liquidDirty = true;
    });
  }

  private blocksSky(type: number, wall: number): boolean {
    if (type !== 0) {
      const d = TILE_DEFS[type];
      if (d && d.opacity >= 0.9) return true;
    }
    return wall !== 0; // 有背景墙即视为地下（不透天空光）
  }

  rebuildSkyColumn(x: number) {
    const st = this.world.store;
    let y = 0;
    for (; y < st.h; y++) {
      const i = st.idx(x, y);
      if (this.blocksSky(st.type[i], st.wall[i])) break;
    }
    this.skyFirstSolid[x] = y >= st.h ? -1 : y;
  }

  rebuildSkyColumns() {
    for (let x = 0; x < this.world.w; x++) this.rebuildSkyColumn(x);
  }

  ensureRegion(camCX: number, camCY: number, viewW: number, viewH: number) {
    const x0 = Math.max(0, Math.floor(camCX / TILE - viewW / 2) - MARGIN);
    const y0 = Math.max(0, Math.floor(camCY / TILE - viewH / 2) - MARGIN);
    const x1 = Math.min(this.world.w - 1, Math.ceil(camCX / TILE + viewW / 2) + MARGIN);
    const y1 = Math.min(this.world.h - 1, Math.ceil(camCY / TILE + viewH / 2) + MARGIN);
    const rw = x1 - x0 + 1, rh = y1 - y0 + 1;
    const moved = Math.abs(camCX - this.lastCamCX) > TILE * MOVE_THRESHOLD || Math.abs(camCY - this.lastCamCY) > TILE * MOVE_THRESHOLD;
    const resized = rw !== this.rw || rh !== this.rh;
    if (moved || resized) {
      // 关键：区域原点只和数据重算一起原子移动。
      // 否则原点跟人走、数据不动 → 光影相对世界平移（"黑影跟着飘"）。
      this.lastCamCX = camCX; this.lastCamCY = camCY;
      this.rx = x0; this.ry = y0;
      if (resized) {
        this.rw = rw; this.rh = rh;
        this.r = new Uint8Array(rw * rh);
        this.g = new Uint8Array(rw * rh);
        this.b = new Uint8Array(rw * rh);
      }
      this.dirty = true;
    }
  }

  /** 取某 tile 的光照（区域外返回天空光近似） */
  lightAt(tx: number, ty: number, dayFactor: number): [number, number, number] {
    if (tx < this.rx || ty < this.ry || tx >= this.rx + this.rw || ty >= this.ry + this.rh) {
      const v = Math.round(SKY_LIGHT * dayFactor);
      return [v, v, v];
    }
    const i = (ty - this.ry) * this.rw + (tx - this.rx);
    return [this.r[i], this.g[i], this.b[i]];
  }

  /** 手持光源（如火把），每帧由 Game 更新；值变化时置脏 */
  heldLight: { tx: number; ty: number } | null = null;

  /** 每帧调用：脏则重算。液体引起的重算最多 20Hz（水流时每 tick 触发，全量 BFS 限频防卡顿） */
  compute(dayFactor: number) {
    if (this.dirty) {
      // tile/墙变化：立即重算
    } else if (this.liquidDirty) {
      this.tick++;
      if (this.tick % 3 !== 0) return; // 60fps → 20Hz
    } else {
      return;
    }
    if (this.rw === 0) return;
    this.dirty = false;
    this.liquidDirty = false;
    const { world, rx, ry, rw, rh } = this;
    const st = world.store;
    const r = this.r, g = this.g, b = this.b;
    r.fill(0); g.fill(0); b.fill(0);

    // 种子队列（存区域索引，颜色按位打包在三个平面）
    const queue = new Int32Array(rw * rh * 4);
    let qh = 0, qt = 0;
    const push = (i: number) => { if (qt < queue.length) queue[qt++] = i; };

    const skyV = Math.round(SKY_LIGHT * dayFactor);
    // 夜间月光偏蓝（红/绿压低、蓝抬高，按夜晚程度过渡）——
    // 避免夜间地表是一片死白的灰黑，火把暖光与月光冷色形成自然对比
    const nightK = Math.max(0, Math.min(1, (1 - dayFactor) / 0.68)); // 0 白天 → 1 深夜
    const skyR = Math.round(skyV * (1 - 0.22 * nightK));
    const skyG = Math.round(skyV * (1 - 0.10 * nightK));
    const skyB = Math.min(255, Math.round(skyV * (1 + 0.18 * nightK)));
    for (let ly = 0; ly < rh; ly++) {
      for (let lx = 0; lx < rw; lx++) {
        const tx = rx + lx, ty = ry + ly;
        const wi = st.idx(tx, ty);
        const li = ly * rw + lx;
        // 天空光（不再 continue：露天格子也要继续检查火把/自发光种子，
        // 否则夜晚露天火把被跳过、只有背景墙后的火把才亮）
        const sfs = this.skyFirstSolid[tx];
        if (sfs === -1 || ty < sfs) {
          r[li] = Math.max(r[li], skyR);
          g[li] = Math.max(g[li], skyG);
          b[li] = Math.max(b[li], skyB);
          push(li);
        }
        // 手持光源（火把）：跟随玩家
        if (this.heldLight && this.heldLight.tx === tx && this.heldLight.ty === ty) {
          r[li] = Math.max(r[li], 255);
          g[li] = Math.max(g[li], 185);
          b[li] = Math.max(b[li], 110);
          push(li);
        }
        // 岩浆光源（橙红）
        if (st.liquid[wi] > 80 && st.liquidType[wi] === 2) {
          r[li] = Math.max(r[li], 255);
          g[li] = Math.max(g[li], 110);
          b[li] = Math.max(b[li], 40);
          push(li);
        }
        // 自发光源
        const type = st.type[wi];
        if (type !== 0) {
          const d = TILE_DEFS[type];
          if (d && d.light) {
            const [lr, lg, lb] = d.light;
            r[li] = Math.max(r[li], Math.round(lr));
            g[li] = Math.max(g[li], Math.round(lg));
            b[li] = Math.max(b[li], Math.round(lb));
            push(li);
          }
        }
        // 液体微光（水下的折射感由 cost 体现，这里不加源）
      }
    }

    // BFS 松弛（三通道同步）
    while (qh < qt) {
      const li = queue[qh++];
      const lx = li % rw, ly = (li / rw) | 0;
      const cvr = r[li], cvg = g[li], cvb = b[li];
      const maxC = Math.max(cvr, cvg, cvb);
      if (maxC <= 8) continue;
      const tx = rx + lx, ty = ry + ly;
      for (let dir = 0; dir < 4; dir++) {
        const nx = lx + (dir === 1 ? 1 : dir === 3 ? -1 : 0);
        const ny = ly + (dir === 0 ? -1 : dir === 2 ? 1 : 0);
        if (nx < 0 || ny < 0 || nx >= rw || ny >= rh) continue;
        const nli = ny * rw + nx;
        // 成本由目标格的阻挡度决定
        const wti = st.idx(rx + nx, ry + ny);
        const ntype = st.type[wti];
        let cost = LIGHT_AIR_COST;
        if (ntype !== 0) {
          const d = TILE_DEFS[ntype];
          if (d) cost = LIGHT_AIR_COST + Math.round(d.opacity * 30);
        } else if (st.liquid[wti] > 30) {
          cost = 10;
        }
        let changed = false;
        const nr = cvr - cost;
        if (nr > r[nli]) { r[nli] = nr; changed = true; }
        const ng = cvg - cost;
        if (ng > g[nli]) { g[nli] = ng; changed = true; }
        const nb = cvb - cost;
        if (nb > b[nli]) { b[nli] = nb; changed = true; }
        if (changed && qt < queue.length) queue[qt++] = nli;
      }
    }
  }
}
