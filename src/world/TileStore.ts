// SoA 多通道平面数组存储。所有热点代码只碰 TypedArray。
import { TILE_DEFS } from '../data/tiles';
import { TileOpAction } from '../net/protocol';

export class TileStore {
  readonly w: number;
  readonly h: number;
  readonly type: Uint16Array;
  readonly flags: Uint8Array; // bit0 active bit1 framedDecor占位(预留)
  readonly frameX: Uint16Array;
  readonly frameY: Uint16Array;
  readonly wall: Uint16Array; // 原版 wld 墙 id（0-366）
  readonly liquid: Uint8Array;   // 0-255 液量
  readonly liquidType: Uint8Array; // 0无 1水 2岩浆 3蜂蜜 4微光(原版 liquidType 3,本仓库 +1 编码;任意液体遇微光 → Aetherium 块 659)
  readonly half: Uint8Array;      // halfBrick 位（原版 Tile.cs bTileHeader bit1）：下半 8px 实心
  readonly slope: Uint8Array;     // 坡面 0-4（原版编码；渲染暂未支持，生成期少用）
  readonly wire: Uint8Array;      // 电路位（原版 Tile.cs sTileHeader）：bit0红 bit1蓝 bit2绿 bit3黄 bit4致动器 bit5已致动(inActive)
  // wire 位掩码常量（对应原版 Tile.cs:396-459 的 wire/wire2/wire3/wire4/actuator/inActive）
  static readonly WIRE_RED = 1;
  static readonly WIRE_BLUE = 2;
  static readonly WIRE_GREEN = 4;
  static readonly WIRE_YELLOW = 8;
  static readonly WIRE_ACTUATOR = 16;
  static readonly WIRE_ACTUATED = 32;
  static readonly WIRE_COLORS = 15; // 四色掩码

  // tile 变更监听（chunk 缓存 / 光照脏标记 / 液体模拟统一从这里拿事件）
  private listeners: Array<(x: number, y: number) => void> = [];

  // ---- 多人联机上报钩子（ClientNet 注入；单机为 null 零开销） ----
  /** 本地 tile 变更上报（协议层 TileOp 收集器）。liquid 通道不报（客户端本地模拟） */
  netReporter: ((op: import('../net/protocol').TileOp) => void) | null = null;
  /** 应用远端操作期间置位：上报钩子静默（防回环） */
  netSuppress = false;

  constructor(w: number, h: number, bufs?: import('../workers/protocol').TileBuffers) {
    this.w = w; this.h = h;
    // buffers 注入（worker transfer 重建路径）：直接以移交的 ArrayBuffer 包装 TypedArray，
    // 跳过分配与拷贝。缺省 explored 由调用方（World.fromPacket）补齐
    if (bufs) {
      this.type = new Uint16Array(bufs.type);
      this.flags = new Uint8Array(bufs.flags);
      this.frameX = new Uint16Array(bufs.frameX);
      this.frameY = new Uint16Array(bufs.frameY);
      this.wall = new Uint16Array(bufs.wall);
      this.liquid = new Uint8Array(bufs.liquid);
      this.liquidType = new Uint8Array(bufs.liquidType);
      this.half = new Uint8Array(bufs.half);
      this.slope = new Uint8Array(bufs.slope);
      this.wire = new Uint8Array(bufs.wire);
      return;
    }
    const n = w * h;
    this.type = new Uint16Array(n);
    this.flags = new Uint8Array(n);
    this.frameX = new Uint16Array(n);
    this.frameY = new Uint16Array(n);
    this.wall = new Uint16Array(n);
    this.liquid = new Uint8Array(n);
    this.liquidType = new Uint8Array(n);
    this.half = new Uint8Array(n);
    this.slope = new Uint8Array(n);
    this.wire = new Uint8Array(n);
  }

  idx(x: number, y: number): number { return y * this.w + x; }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.w && y < this.h;
  }

  get(x: number, y: number): number { return this.inBounds(x, y) ? this.type[this.idx(x, y)] : 0; }

  isActive(x: number, y: number): boolean {
    // 原版 nactive() = active && !inActive（Tile.cs:383-394）：已致动格视为不活跃
    return this.inBounds(x, y) && this.type[this.idx(x, y)] !== 0
      && (this.wire[this.idx(x, y)] & TileStore.WIRE_ACTUATED) === 0;
  }

  /** 原版 inActive()：致动器翻转后的"缩入地下"态（有 type 但不碰撞不阻挡） */
  isActuated(x: number, y: number): boolean {
    return this.inBounds(x, y) && (this.wire[this.idx(x, y)] & TileStore.WIRE_ACTUATED) !== 0;
  }

  isSolid(x: number, y: number): boolean {
    if (!this.inBounds(x, y)) return false; // 世界外视为空（边缘自由）
    if (this.wire[this.idx(x, y)] & TileStore.WIRE_ACTUATED) return false; // 已致动不碰撞
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
    if (type === 0) { this.half[i] = 0; this.slope[i] = 0; } // 挖除清半砖/坡面
    if (this.netReporter && !this.netSuppress) this.netReporter({ a: TileOpAction.SetTile, x, y, v: type, fx: frameX, fy: frameY });
    this.listeners.forEach((fn) => fn(x, y));
  }

  /** 运行期改半砖/坡面位（锤子交互用；生成期直接写数组即可） */
  setHalfBrick(x: number, y: number, v: boolean) {
    if (!this.inBounds(x, y)) return;
    const i = this.idx(x, y);
    this.half[i] = v ? 1 : 0;
    if (this.netReporter && !this.netSuppress) this.netReporter({ a: TileOpAction.SetHalfBrick, x, y, v: v ? 1 : 0, fx: 0, fy: 0 });
    this.listeners.forEach((fn) => fn(x, y));
  }

  setSlope(x: number, y: number, s: number) {
    if (!this.inBounds(x, y)) return;
    const i = this.idx(x, y);
    this.slope[i] = s;
    this.half[i] = 0; // 原版 SlopeTile 无条件 halfBrick(false)（WorldGen.cs:49174），slope=0 复位时同样
    if (this.netReporter && !this.netSuppress) this.netReporter({ a: TileOpAction.SetSlope, x, y, v: s, fx: 0, fy: 0 });
    this.listeners.forEach((fn) => fn(x, y));
  }

  setTileSilent(x: number, y: number, type: number, frameX = 0, frameY = 0) {
    if (!this.inBounds(x, y)) return;
    const i = this.idx(x, y);
    this.type[i] = type;
    this.flags[i] = type !== 0 ? 1 : 0;
    this.frameX[i] = frameX;
    this.frameY[i] = frameY;
    if (type === 0) { this.half[i] = 0; this.slope[i] = 0; } // 挖除同步清位（防生成期脏残留）
  }

  setWall(x: number, y: number, wall: number) {
    if (!this.inBounds(x, y)) return;
    const i = this.idx(x, y);
    if (this.wall[i] !== wall) {
      this.wall[i] = wall;
      if (this.netReporter && !this.netSuppress) this.netReporter({ a: TileOpAction.SetWall, x, y, v: wall, fx: 0, fy: 0 });
      this.listeners.forEach((fn) => fn(x, y));
    }
  }

  setWallSilent(x: number, y: number, wall: number) {
    if (!this.inBounds(x, y)) return;
    this.wall[this.idx(x, y)] = wall;
  }

  /** 导线/致动位写入（Wiring 系统）。不发 listeners：导线不进 chunk 烘焙画布，
   *  走 Renderer 动态覆盖层；致动位变化才需要标脏 chunk（调用方负责） */
  setWire(x: number, y: number, bits: number) {
    if (!this.inBounds(x, y)) return;
    this.wire[this.idx(x, y)] = bits & 63;
    if (this.netReporter && !this.netSuppress) this.netReporter({ a: TileOpAction.SetWire, x, y, v: bits & 63, fx: 0, fy: 0 });
  }

  setWireSilent(x: number, y: number, bits: number) {
    this.setWire(x, y, bits);
  }

  /** 致动器翻转 inActive 态（Wiring.DeActive/ReActive 用）：影响碰撞与渲染，须发 listeners */
  setActuated(x: number, y: number, v: boolean) {
    if (!this.inBounds(x, y)) return;
    const i = this.idx(x, y);
    const b = v ? (this.wire[i] | TileStore.WIRE_ACTUATED) : (this.wire[i] & ~TileStore.WIRE_ACTUATED);
    if (this.wire[i] === b) return;
    this.wire[i] = b;
    if (this.netReporter && !this.netSuppress) this.netReporter({ a: TileOpAction.SetActuated, x, y, v: v ? 1 : 0, fx: 0, fy: 0 });
    this.listeners.forEach((fn) => fn(x, y));
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
