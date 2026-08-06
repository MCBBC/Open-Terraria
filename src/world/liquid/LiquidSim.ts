// 液体模拟：增量元胞自动机。只处理"活跃格"（最近有变动的液体及其邻域），
// 静止水体零开销。活跃格超上限时按 FIFO 丢弃最旧的（避免爆炸）。
import { TILE_DEFS } from '../../data/tiles';
import type { World } from '../World';

const MAX_ACTIVE = 20000;

export class LiquidSim {
  world: World;
  private active = new Set<number>();
  private queue: number[] = [];
  private counter = 0;
  private disposed = false;

  constructor(world: World) {
    this.world = world;
    world.store.onTileChanged((x, y) => {
      if (this.disposed) return;
      // tile 变化影响相邻液体的支撑
      this.activate(x, y);
      this.activate(x, y - 1);
      this.activate(x - 1, y);
      this.activate(x + 1, y);
      this.activate(x, y + 1);
    });
    // 液体直接写入（生成/测试注水）也唤醒流动 —— 订阅液体通道而非 tile 通道，
    // 避免水流把 chunk 重建队列冲爆（setLiquid 不应触发 chunk 标脏）
    world.store.onLiquidChanged((x, y) => {
      if (this.disposed) return;
      this.activate(x, y);
      this.activate(x, y - 1);
      this.activate(x - 1, y);
      this.activate(x + 1, y);
      this.activate(x, y + 1);
    });
  }

  /** 丢弃模拟器：预沉降用的临时实例调用，停止响应后续唤醒 */
  dispose() {
    this.disposed = true;
    this.active.clear();
    this.queue.length = 0;
  }

  activate(x: number, y: number) {
    const st = this.world.store;
    if (!st.inBounds(x, y)) return;
    const i = st.idx(x, y);
    if (this.active.has(i)) return;
    this.active.add(i);
    this.queue.push(i);
    if (this.queue.length > MAX_ACTIVE) {
      const old = this.queue.shift()!;
      this.active.delete(old);
    }
  }

  private blocksFlow(x: number, y: number): boolean {
    const st = this.world.store;
    if (!st.inBounds(x, y)) return true;
    const t = st.type[st.idx(x, y)];
    if (t === 0) return false;
    const d = TILE_DEFS[t];
    if (!d) return true; // 未知类型按实心处理（防御旧存档/异常数据）
    // 平台/门等带大面积透明的方块不挡水：水可占满其格子，
    // 渲染层会把水画在贴图之上 → 透明区域呈浸润效果
    return d.solid;
  }

  /** 每 2 个逻辑 tick 调一次 */
  step() {
    this.counter++;
    const st = this.world.store;
    const w = st.w, h = st.h;
    const batch = this.queue.splice(0, this.queue.length);
    const stillActive: number[] = [];

    for (const i of batch) {
      this.active.delete(i);
      const x = i % w, y = (i / w) | 0;
      const a = st.liquid[i];
      if (a === 0) continue;
      let moved = false;

      // 1) 向下：链式穿格 —— 同一步内继续落入更下方的空格，
      //    瀑布/破坏方块后的下落瞬时到达，不再一格一格挪（慢一拍的根源）
      {
        let cur = i, curY = y;
        while (curY + 1 < h) {
          if (this.blocksFlow(x, curY + 1)) break;
          const bi = cur + w;
          const below = st.liquid[bi];
          if (below >= 255) break;
          const t = Math.min(st.liquid[cur], 255 - below);
          if (t <= 0) break;
          st.liquid[cur] -= t;
          st.liquid[bi] += t;
          if (st.liquidType[bi] === 0) st.liquidType[bi] = st.liquidType[cur] || 1;
          if (st.liquid[cur] === 0) st.liquidType[cur] = 0;
          stillActive.push(bi);
          moved = true;
          if (below > 0) break;   // 落入未满格：合并停留，下一步再继续
          cur = bi; curY++;       // 目的地原本全空：整份继续下落
        }
      }

      // 2) 侧向扩散（存留部分）—— 差值一半即时流动。
      //    每次读取当前余量并钳制发放量：liquid 是 Uint8Array，
      //    超发减成负数会回绕成 255-x —— 凭空复制水（守恒破坏的根源）
      for (const dx of [-1, 1]) {
        const nx = x + dx;
        if (nx < 0 || nx >= w || this.blocksFlow(nx, y)) continue;
        const ni = i + dx;
        const curAmt = st.liquid[i];
        if (curAmt <= 0) break;
        const side = st.liquid[ni];
        if (side < curAmt - 1) {
          const maxGive = Math.min(curAmt, Math.ceil((curAmt - side) / 2));
          if (maxGive > 0) {
            st.liquid[i] -= maxGive;
            st.liquid[ni] += maxGive;
            if (st.liquidType[ni] === 0) st.liquidType[ni] = st.liquidType[i] || 1;
            moved = true;
            stillActive.push(ni);
            if (st.liquid[i] === 0) { st.liquidType[i] = 0; break; }
          }
        }
      }

      if (moved) {
        stillActive.push(i);
        // 四邻全部唤醒：某格排水后，旁边的静态水（如湖面）要立刻补位流动，
        // 否则会出现"一批流完另一批才动"的冻结感
        stillActive.push(i - w, i + w, i - 1, i + 1);
      }
    }

    // 重新入队
    for (const i of stillActive) {
      if (i < 0 || i >= w * h) continue;
      if (!this.active.has(i)) {
        this.active.add(i);
        this.queue.push(i);
      }
      if (this.queue.length > MAX_ACTIVE) {
        const old = this.queue.shift()!;
        this.active.delete(old);
      }
    }
  }

  /** 扰动一片区域（如世界生成后激活可视区液体） */
  activateRegion(x0: number, y0: number, x1: number, y1: number) {
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) this.activate(x, y);
    }
  }

  /** 是否仍有待处理的活动水格（预沉降收敛判定） */
  hasActive(): boolean {
    return this.queue.length > 0;
  }
}
