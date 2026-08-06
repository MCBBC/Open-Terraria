// SoA 多通道平面数组存储。所有热点代码只碰 TypedArray。
import { TILE_DEFS } from '../data/tiles';

export class TileStore {
  readonly w: number;
  readonly h: number;
  readonly type: Uint16Array;
  readonly flags: Uint8Array; // bit0 active bit1 framedDecor占位(预留)
  readonly frameX: Uint16Array;
  readonly frameY: Uint16Array;
  readonly wall: Uint8Array;
  readonly liquid: Uint8Array;   // 0-255 液量
  readonly liquidType: Uint8Array; // 0无 1水

  // tile 变更监听（chunk 缓存 / 光照脏标记 / 液体模拟统一从这里拿事件）
  private listeners: Array<(x: number, y: number) => void> = [];

  constructor(w: number, h: number) {
    this.w = w; this.h = h;
    const n = w * h;
    this.type = new Uint16Array(n);
    this.flags = new Uint8Array(n);
    this.frameX = new Uint16Array(n);
    this.frameY = new Uint16Array(n);
    this.wall = new Uint8Array(n);
    this.liquid = new Uint8Array(n);
    this.liquidType = new Uint8Array(n);
  }

  idx(x: number, y: number): number { return y * this.w + x; }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.w && y < this.h;
  }

  get(x: number, y: number): number { return this.inBounds(x, y) ? this.type[this.idx(x, y)] : 0; }

  isActive(x: number, y: number): boolean {
    return this.inBounds(x, y) && this.type[this.idx(x, y)] !== 0;
  }

  isSolid(x: number, y: number): boolean {
    if (!this.inBounds(x, y)) return false; // 世界外视为空（边缘自由）
    const d = TILE_DEFS[this.type[this.idx(x, y)]];
    return !!d && d.solid;
  }

  isPlatform(x: number, y: number): boolean {
    if (!this.inBounds(x, y)) return false;
    const d = TILE_DEFS[this.type[this.idx(x, y)]];
    return !!d && d.platform;
  }

  onTileChanged(fn: (x: number, y: number) => void) {
    this.listeners.push(fn);
  }

  /** 液体变化独立通道：chunk 缓存不订阅（水不入烘焙画布，无需重建），
   *  只有光照订阅（水的光衰减）——避免水流时每帧冲爆 chunk 重建队列造成卡顿 */
  private liquidListeners: Array<(x: number, y: number) => void> = [];
  onLiquidChanged(fn: (x: number, y: number) => void) {
    this.liquidListeners.push(fn);
  }

  /** 唯一的写入入口（生成/导入期可绕过用 setTileSilent） */
  setTile(x: number, y: number, type: number, frameX = 0, frameY = 0) {
    if (!this.inBounds(x, y)) return;
    const i = this.idx(x, y);
    this.type[i] = type;
    this.flags[i] = type !== 0 ? 1 : 0;
    this.frameX[i] = frameX;
    this.frameY[i] = frameY;
    this.listeners.forEach((fn) => fn(x, y));
  }

  setTileSilent(x: number, y: number, type: number, frameX = 0, frameY = 0) {
    if (!this.inBounds(x, y)) return;
    const i = this.idx(x, y);
    this.type[i] = type;
    this.flags[i] = type !== 0 ? 1 : 0;
    this.frameX[i] = frameX;
    this.frameY[i] = frameY;
  }

  setWall(x: number, y: number, wall: number) {
    if (!this.inBounds(x, y)) return;
    const i = this.idx(x, y);
    if (this.wall[i] !== wall) {
      this.wall[i] = wall;
      this.listeners.forEach((fn) => fn(x, y));
    }
  }

  setWallSilent(x: number, y: number, wall: number) {
    if (!this.inBounds(x, y)) return;
    this.wall[this.idx(x, y)] = wall;
  }

  setLiquid(x: number, y: number, amount: number, type: number) {
    if (!this.inBounds(x, y)) return;
    const i = this.idx(x, y);
    const a = Math.max(0, Math.min(255, amount | 0));
    if (this.liquid[i] === a && this.liquidType[i] === type) return;
    this.liquid[i] = a;
    this.liquidType[i] = type;
    this.liquidListeners.forEach((fn) => fn(x, y));
  }
}
