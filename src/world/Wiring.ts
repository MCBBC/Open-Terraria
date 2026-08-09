// 原版 Wiring.cs(1.4.0.5)一比一移植:四色导线信号传播 + 逻辑门 + 泵 + 传送器 + 致动器。
// 结构与行号对照:
//   updateMech        Wiring.cs:88-161(计时器/引爆器冷却,每 tick 调)
//   hitSwitch         Wiring.cs:163-252(手动/物理触发源)
//   checkMech         Wiring.cs:313-327(陷阱冷却注册,上限 999)
//   xferWater         Wiring.cs:329-377(泵配对液体转移)
//   tripWire          Wiring.cs:379-529(四色 pass 顺序 红→蓝→绿→黄)
//   pixelBoxPass      Wiring.cs:531-553
//   logicGatePass     Wiring.cs:555-591
//   checkLogicGate    Wiring.cs:593-691(六种门 + 故障灯)
//   hitWire           Wiring.cs:693-827(BFS;邻居序 下/上/右/左;分线盒预算)
//   hitWireSingle     Wiring.cs:829-2282(核心 case 在此,其余委托 devices 表)
//   actuate/actuateForced/deActive/reActive  :262-280, :2373-2405
//   massWireOperation :2407-2558(宏伟蓝图 L 形铺线)
// 单机移植:NetMessage/SendData 一律跳过(原版联机同步,无操作)。
import { TileStore } from './TileStore';
import { TILE_DEFS } from '../data/tiles';

/** 器件分发表(P3 devices.ts 提供):返回 true 表示已处理该 case */
export type DeviceHandler = (w: Wiring, sheet: number, x: number, y: number) => boolean;

/** 多色工具模式位(WiresUI.Settings.MultiToolMode) */
export const TOOL_RED = 1;
export const TOOL_GREEN = 2;
export const TOOL_BLUE = 4;
export const TOOL_YELLOW = 8;
export const TOOL_ACTUATOR = 16;
export const TOOL_CUTTER = 32;

const MAX_PUMP = 20;   // Wiring.cs:34(MaxPump=20,填充上限 19)
const MAX_MECH = 1000; // Wiring.cs:41(MaxMech=1000,注册上限 999)

export class Wiring {
  readonly st: TileStore;
  /** 器件表(P3 注入) */
  device: DeviceHandler | null = null;
  /** 传送器对执行(引擎侧搬迁玩家/敌人;P3 注入) */
  teleportPair: ((a: [number, number], b: [number, number]) => void) | null = null;
  /** 世界地表行(蜥蜴砖致动限制 Wiring.cs:2375) */
  worldSurface = 0;
  /** 世世纪杀花已击败(同上) */
  planteraDowned = false;

  running = false;                                  // :23
  blockPlayerTeleportationForOneIteration = false;  // :22(测重板抑制传送)
  private currentWireColor = 0;                     // :46(1红 2蓝 3绿 4黄;彩线灯泡用)

  // BFS 状态(:24-27)。点用 idx(y*w+x) 编码。
  private wireSkip = new Set<number>();
  private wireList: number[] = [];      // FIFO(head 指针)
  private wireDir: number[] = [];       // 与 wireList 平行的进入方向 0下 1上 2右 3左
  private toProcess = new Map<number, number>(); // :27 分线盒再访预算

  // 逻辑门(:28-32)
  private gatesCurrent: number[] = [];
  private gatesNext: number[] = [];
  private gatesDone = new Map<number, boolean>();
  private lampsToCheck: number[] = [];
  private pixelBoxTriggers = new Map<number, number>();

  // 传送器对(:33;px 坐标,-1 = 未捕获)与泵(:34-40)
  private tp: Array<[number, number]> = [[-1, -1], [-1, -1]];
  private inPumpX = new Int16Array(MAX_PUMP); private inPumpY = new Int16Array(MAX_PUMP);
  private outPumpX = new Int16Array(MAX_PUMP); private outPumpY = new Int16Array(MAX_PUMP);
  private numInPump = 0; private numOutPump = 0;

  // 冷却注册(:41-45)
  private mechX = new Int32Array(MAX_MECH + 1);
  private mechY = new Int32Array(MAX_MECH + 1);
  private mechTime = new Int32Array(MAX_MECH + 1);
  private numMechs = 0;

  constructor(st: TileStore) {
    this.st = st;
  }

  private p2i(x: number, y: number): number { return y * this.st.w + x; }
  private i2x(i: number): number { return i % this.st.w; }
  private i2y(i: number): number { return (i / this.st.w) | 0; }
  private sheetAt(x: number, y: number): number { return this.sheetOf(x, y); }
  /** 该格的原版 tile id(sheet;非 vanilla tile 返回 -1)。器件表按 sheet 分发 */
  sheetOf(x: number, y: number): number {
    if (!this.st.inBounds(x, y)) return -1;
    const d = TILE_DEFS[this.st.type[this.p2i(x, y)]];
    return d?.vanilla?.sheet ?? -1;
  }
  /** 多格器件整体去重(devices.ts 用) */
  skipCell(x: number, y: number): void { this.skipWire(x, y); }

  // ============ UpdateMech(Wiring.cs:88-161)每 tick 调 ============

  updateMech(): void {
    for (let i = this.numMechs - 1; i >= 0; i--) {
      this.mechTime[i]--;
      const mx = this.mechX[i], my = this.mechY[i];
      const sh = this.sheetAt(mx, my);
      const raw = this.st.type[this.p2i(mx, my)] !== 0;
      if (raw && sh === 144) {
        const ti = this.p2i(mx, my);
        if (this.st.frameY[ti] === 0) {
          this.mechTime[i] = 0;
        } else {
          // frameX/18 → 周期帧数(:102-120)
          let period = Math.floor(this.st.frameX[ti] / 18);
          period = period === 0 ? 60 : period === 1 ? 180 : period === 2 ? 300 : period === 3 ? 30 : period === 4 ? 15 : 60;
          // IEEERemainder(t, period) === 0(注意负数:IEEERemainder 结果范围 (-p,p])
          const r = this.mechTime[i] - period * Math.round(this.mechTime[i] / period);
          if (r === 0) {
            this.mechTime[i] = 18000;
            this.tripWire(mx, my, 1, 1);
          }
        }
      }
      if (this.mechTime[i] <= 0) {
        if (raw && sh === 144) {
          const ti = this.p2i(mx, my);
          this.st.setTile(mx, my, this.st.type[ti], this.st.frameX[ti], 0);
        }
        if (raw && sh === 411) {
          // 引爆器 2×2 帧复位(:135-151)
          const ti = this.p2i(mx, my);
          const num1 = Math.floor(this.st.frameX[ti] % 36 / 18);
          const num2 = Math.floor(this.st.frameY[ti] % 36 / 18);
          const tileX = mx - num1, tileY = my - num2;
          let num3 = 36;
          if (this.st.frameX[this.p2i(tileX, tileY)] >= 36) num3 = -36;
          for (let ix = tileX; ix < tileX + 2; ix++) {
            for (let iy = tileY; iy < tileY + 2; iy++) {
              const ii = this.p2i(ix, iy);
              if (this.sheetAt(ix, iy) === 411) this.st.setTile(ix, iy, this.st.type[ii], this.st.frameX[ii] + num3, this.st.frameY[ii]);
            }
          }
        }
        // 数组下移移除(:152-158)
        for (let k = i; k < this.numMechs; k++) {
          this.mechX[k] = this.mechX[k + 1];
          this.mechY[k] = this.mechY[k + 1];
          this.mechTime[k] = this.mechTime[k + 1];
        }
        this.numMechs--;
      }
    }
  }

  // ============ CheckMech(Wiring.cs:313-327)============

  checkMech(i: number, j: number, time: number): boolean {
    for (let k = 0; k < this.numMechs; k++) {
      if (this.mechX[k] === i && this.mechY[k] === j) return false;
    }
    if (this.numMechs >= 999) return false;
    this.mechX[this.numMechs] = i;
    this.mechY[this.numMechs] = j;
    this.mechTime[this.numMechs] = time;
    this.numMechs++;
    return true;
  }

  // ============ HitSwitch(Wiring.cs:163-252)============

  hitSwitch(i: number, j: number): void {
    if (!this.st.inBounds(i, j)) return;
    const sh = this.sheetAt(i, j);
    const ti = this.p2i(i, j);
    // 压板/轨道/感应器/测重板/垫板/高尔夫(:167-171)与宝石锁(:172-176):直接 Trip
    if (sh === 135 || sh === 314 || sh === 423 || sh === 428 || sh === 442 || sh === 476) {
      this.tripWire(i, j, 1, 1);
      return;
    }
    if (sh === 440) { // 宝石锁 3×3
      this.tripWire(i, j, 3, 3);
      return;
    }
    if (sh === 136) { // 开关 frameY 0↔18(:177-182)
      this.st.setTile(i, j, this.st.type[ti], this.st.frameX[ti], this.st.frameY[ti] !== 0 ? 0 : 18);
      this.tripWire(i, j, 1, 1);
      return;
    }
    if (sh === 443) { // 热喷泉(:183-184)
      this.device?.(this, 443, i, j);
      return;
    }
    if (sh === 144) { // 计时器开/关(:185-196)
      if (this.st.frameY[ti] === 0) {
        this.st.setTile(i, j, this.st.type[ti], this.st.frameX[ti], 18);
        this.checkMech(i, j, 18000);
      } else {
        this.st.setTile(i, j, this.st.type[ti], this.st.frameX[ti], 0);
      }
      return;
    }
    if (sh === 441 || sh === 468) { // 陷阱箱 2×2(:197-208)
      const num1 = Math.floor(this.st.frameX[ti] / 18) * -1;
      const num2 = Math.floor(this.st.frameY[ti] / 18) * -1;
      let num3 = num1 % 4;
      if (num3 < -1) num3 += 2;
      this.tripWire(num3 + i, num2 + j, 2, 2);
      return;
    }
    if (sh === 467) { // 水晶陷阱箱(frameX/36==4 才触发,:209-222)
      if (Math.floor(this.st.frameX[ti] / 36) !== 4) return;
      const num1 = Math.floor(this.st.frameX[ti] / 18) * -1;
      const num2 = Math.floor(this.st.frameY[ti] / 18) * -1;
      let num3 = num1 % 4;
      if (num3 < -1) num3 += 2;
      this.tripWire(num3 + i, num2 + j, 2, 2);
      return;
    }
    if (sh === 132 || sh === 411) { // 拉杆/引爆器 2×2 翻帧(:223-251)
      let delta = 36;
      const num2 = Math.floor(this.st.frameX[ti] / 18) * -1;
      const num3 = Math.floor(this.st.frameY[ti] / 18) * -1;
      let num4 = num2 % 4;
      if (num4 < -1) { num4 += 2; delta = -36; }
      const ax = num4 + i, ay = num3 + j;
      if (this.sheetAt(ax, ay) === 411) this.checkMech(ax, ay, 60);
      for (let ix = ax; ix < ax + 2; ix++) {
        for (let iy = ay; iy < ay + 2; iy++) {
          if (!this.st.inBounds(ix, iy)) continue;
          const ii = this.p2i(ix, iy);
          const s2 = this.sheetAt(ix, iy);
          if (s2 === 132 || s2 === 411) {
            this.st.setTile(ix, iy, this.st.type[ii], this.st.frameX[ii] + delta, this.st.frameY[ii]);
          }
        }
      }
      this.tripWire(ax, ay, 2, 2);
      return;
    }
  }

  // ============ TripWire(Wiring.cs:379-529)============

  tripWire(left: number, top: number, width: number, height: number): void {
    this.running = true;
    this.wireList.length = 0;
    this.wireDir.length = 0;
    const st = this.st;
    const pairs: Array<[[number, number], [number, number]]> = [];
    const bits = [TileStore.WIRE_RED, TileStore.WIRE_BLUE, TileStore.WIRE_GREEN, TileStore.WIRE_YELLOW];
    // 四色 pass 顺序固定 红(1)蓝(2)绿(3)黄(4)(:405-508);每色前重置传送器对与泵
    for (let color = 1; color <= 4; color++) {
      this.tp[0] = [-1, -1]; this.tp[1] = [-1, -1];
      this.wireList.length = 0;
      const bit = bits[color - 1];
      for (let x = left; x < left + width; x++) {
        for (let y = top; y < top + height; y++) {
          if (!st.inBounds(x, y)) continue;
          if (st.wire[this.p2i(x, y)] & bit) this.wireList.push(this.p2i(x, y));
        }
      }
      if (this.wireList.length > 0) {
        this.numInPump = 0;
        this.numOutPump = 0;
        this.hitWire(color);
        if (this.numInPump > 0 && this.numOutPump > 0) this.xferWater();
      }
      if (this.tp[0][0] >= 0 && this.tp[1][0] >= 0) pairs.push([[...this.tp[0]], [...this.tp[1]] as [number, number]]);
    }
    this.running = false;
    // 四色收集完的传送器对统一执行(:520-526)
    for (const [a, b] of pairs) this.teleportPair?.(a, b);
    this.pixelBoxPass();
    this.logicGatePass();
  }

  // ============ HitWire BFS(Wiring.cs:693-827)============

  private hitWire(wireType: number): void {
    const st = this.st;
    // 种子:SkipWire + 预算 4 + 方向 0(:695-703)
    this.wireDir.length = 0;
    const n = this.wireList.length;
    for (let k = 0; k < n; k++) {
      const p = this.wireList[k];
      this.skipWireI(p);
      this.toProcess.set(p, 4);
      this.wireDir.push(0);
    }
    this.currentWireColor = wireType;
    let head = 0;
    while (head < this.wireList.length) {
      const key = this.wireList[head];
      const num1 = this.wireDir[head];
      head++;
      const x = this.i2x(key), y = this.i2y(key);
      if (!this.wireSkip.has(key)) this.hitWireSingle(x, y);
      // 邻居顺序:0下 1上 2右 3左(:713-739)
      for (let index1 = 0; index1 < 4; index1++) {
        const X = index1 === 0 ? x : index1 === 1 ? x : index1 === 2 ? x + 1 : x - 1;
        const Y = index1 === 0 ? y + 1 : index1 === 1 ? y - 1 : y;
        if (X < 2 || X >= st.w - 2 || Y < 2 || Y >= st.h - 2) continue; // :740
        const curSheet = this.sheetAt(x, y);
        const nbSheet = this.sheetAt(X, Y);
        // :748-750 邻居是分线盒/像素盒 → 不给预算
        let num2 = 3;
        if (nbSheet === 424 || nbSheet === 445) num2 = 0;
        // :751-768 分线盒方向门控(frameX/18 三态)
        if (curSheet === 424) {
          const mode = Math.floor(st.frameX[this.p2i(x, y)] / 18);
          if (mode === 0) { if (index1 === num1) continue; }
          else if (mode === 1) {
            if (!((num1 === 0 && index1 === 3) || (num1 === 3 && index1 === 0) || (num1 === 1 && index1 === 2) || (num1 === 2 && index1 === 1))) continue;
          } else if (mode === 2) {
            if (!((num1 === 0 && index1 === 2) || (num1 === 2 && index1 === 0) || (num1 === 1 && index1 === 3) || (num1 === 3 && index1 === 1))) continue;
          }
        }
        // :769-780 像素盒仅同向直通,并记录触发值(垂直 2 / 水平 1)
        if (curSheet === 445) {
          if (index1 === num1) {
            const v = (index1 === 0 || index1 === 1) ? 2 : 1;
            this.pixelBoxTriggers.set(key, (this.pixelBoxTriggers.get(key) ?? 0) | v);
          } else continue;
        }
        // :781-799 邻居须带当前色
        const bit = wireType === 1 ? TileStore.WIRE_RED : wireType === 2 ? TileStore.WIRE_BLUE : wireType === 3 ? TileStore.WIRE_GREEN : TileStore.WIRE_YELLOW;
        if (!(st.wire[this.p2i(X, Y)] & bit)) continue;
        // :800-819 预算消耗或入队
        const nb = this.p2i(X, Y);
        const budget = this.toProcess.get(nb);
        if (budget !== undefined) {
          const left2 = budget - 1;
          if (left2 === 0) this.toProcess.delete(nb);
          else this.toProcess.set(nb, left2);
        } else {
          this.wireList.push(nb);
          this.wireDir.push(index1);
          if (num2 > 0) this.toProcess.set(nb, num2);
        }
      }
    }
    this.wireSkip.clear();
    this.toProcess.clear();
  }

  // ============ HitWireSingle 核心 case(Wiring.cs:829+)============

  private hitWireSingle(x: number, y: number): void {
    const st = this.st;
    const i = this.p2i(x, y);
    const type = st.type[i];
    const sheet = this.sheetAt(x, y);
    // :833-834 先致动(active 检查之前,空格上的致动线也会翻)
    if (st.wire[i] & TileStore.WIRE_ACTUATOR) this.actuateForced(x, y);
    // :835 raw active = type≠0(致动态也继续)
    if (type === 0) return;
    // 核心 case(牵扯 Wiring 内部状态),其余全表委托 devices.ts
    switch (sheet) {
      case 144: // 计时器:信号 = 打开并重置计时(:839-843)
        this.hitSwitch(x, y);
        return;
      case 419: { // 逻辑门灯:翻转 + SkipWire + 入队(:1075-1086)
        let d = 18;
        if (st.frameX[i] >= 18) d = -18;
        if (st.frameX[i] === 36) d = 0;
        this.skipWire(x, y);
        st.setTile(x, y, type, st.frameX[i] + d, st.frameY[i]);
        this.lampsToCheck.push(i);
        return;
      }
      case 235: { // 传送器成对捕获(:1251-1271)
        const tx = x - Math.floor(st.frameX[i] / 18);
        if (st.wall[i] === 87 && y > this.worldSurface && !this.planteraDowned) return;
        const halfOff = st.half[i] ? 0.5 : 0;
        if (this.tp[0][0] === -1) { this.tp[0] = [tx, y + halfOff]; return; }
        if (this.tp[0][0] === tx && this.tp[0][1] === y + halfOff) return;
        this.tp[1] = [tx, y + halfOff];
        return;
      }
      case 142: case 143: { // 入水/出水泵 2×2 四格收集(:1793-1863)
        const py = y - Math.floor(st.frameY[i] / 18);
        let px = Math.floor(st.frameX[i] / 18);
        if (px > 1) px -= 2;
        const ox = x - px;
        this.skipWire(ox, py); this.skipWire(ox, py + 1);
        this.skipWire(ox + 1, py); this.skipWire(ox + 1, py + 1);
        const cells: Array<[number, number]> = [[ox, py + 1], [ox + 1, py + 1], [ox, py], [ox + 1, py]];
        if (sheet === 142) {
          for (let k = 0; k < 4 && this.numInPump < 19; k++) {
            this.inPumpX[this.numInPump] = cells[k][0];
            this.inPumpY[this.numInPump] = cells[k][1];
            this.numInPump++;
          }
        } else {
          for (let k = 0; k < 4 && this.numOutPump < 19; k++) {
            this.outPumpX[this.numOutPump] = cells[k][0];
            this.outPumpY[this.numOutPump] = cells[k][1];
            this.numOutPump++;
          }
        }
        return;
      }
      case 429: { // 彩线灯泡:按当前色翻对应位(:1325-1357)
        const q = Math.floor(st.frameX[i] / 18);
        let num53 = 0, on = false;
        switch (this.currentWireColor) {
          case 1: num53 = 18; on = !(q % 2 >= 1); break;
          case 2: num53 = 72; on = !(q % 8 >= 4); break;
          case 3: num53 = 36; on = !(q % 4 >= 2); break;
          case 4: num53 = 144; on = !(q % 16 >= 8); break;
        }
        st.setTile(x, y, type, st.frameX[i] + (on ? num53 : -num53), st.frameY[i]);
        return;
      }
    }
    // 致动后不再吃器件信号(原版各 case 里 actuator 时早退的近似统一处理;
    // 门/传送带/宝石块在原版各自判断,其余器件致动时信号照常——按原版逐 case 已在 devices 内)
    this.device?.(this, sheet, x, y);
  }

  // ============ XferWater(Wiring.cs:329-377)============

  private xferWater(): void {
    const st = this.st;
    for (let a = 0; a < this.numInPump; a++) {
      const i1 = this.inPumpX[a], j1 = this.inPumpY[a];
      if (!st.inBounds(i1, j1)) continue;
      const ii = st.idx(i1, j1);
      let liquid1 = st.liquid[ii];
      if (liquid1 > 0) {
        const lava = st.liquidType[ii] === 2, honey = st.liquidType[ii] === 3;
        for (let b = 0; b < this.numOutPump; b++) {
          const i2 = this.outPumpX[b], j2 = this.outPumpY[b];
          if (!st.inBounds(i2, j2)) continue;
          const oi = st.idx(i2, j2);
          let liquid2 = st.liquid[oi];
          if (liquid2 < 255) {
            let flag1 = st.liquidType[oi] === 2, flag2 = st.liquidType[oi] === 3;
            if (liquid2 === 0) { flag1 = lava; flag2 = honey; }
            if (lava === flag1 && honey === flag2) {
              let move = liquid1;
              if (move + liquid2 > 255) move = 255 - liquid2;
              st.setLiquid(i2, j2, liquid2 + move, lava ? 2 : honey ? 3 : 1);
              st.setLiquid(i1, j1, liquid1 - move, st.liquidType[ii] || 1);
              liquid1 = st.liquid[ii];
              if (st.liquid[ii] === 0) break;
            }
          }
        }
      }
    }
  }

  // ============ PixelBoxPass(Wiring.cs:531-553)============

  private pixelBoxPass(): void {
    const st = this.st;
    for (const [key, v] of this.pixelBoxTriggers) {
      const x = this.i2x(key), y = this.i2y(key);
      if (!st.inBounds(x, y)) continue;
      const i = this.p2i(x, y);
      if (v === 1) {
        if (st.frameX[i] !== 0) st.setTile(x, y, st.type[i], 0, st.frameY[i]);
      } else if (v === 3) {
        if (st.frameX[i] !== 18) st.setTile(x, y, st.type[i], 18, st.frameY[i]);
      }
    }
    this.pixelBoxTriggers.clear();
  }

  // ============ LogicGatePass / CheckLogicGate(Wiring.cs:555-691)============

  private logicGatePass(): void {
    if (this.gatesCurrent.length !== 0) return; // 已在级联中
    this.gatesDone.clear();
    let lampHead = 0, gateHead = 0;
    while (this.lampsToCheck.length > lampHead) {
      while (this.lampsToCheck.length > lampHead) {
        const lamp = this.lampsToCheck[lampHead++];
        this.checkLogicGate(this.i2x(lamp), this.i2y(lamp));
      }
      // _GatesNext → _GatesCurrent,逐个 TripWire(递归;_GatesDone 防环)(:567-585)
      const next = this.gatesNext;
      this.gatesNext = [];
      this.gatesCurrent = next;
      gateHead = 0;
      while (this.gatesCurrent.length > gateHead) {
        const key = this.gatesCurrent[gateHead];
        gateHead++;
        if (this.gatesDone.get(key)) continue;
        this.gatesDone.set(key, true);
        this.tripWire(this.i2x(key), this.i2y(key), 1, 1);
      }
      this.gatesCurrent.length = 0; // 原版 Queue Dequeue 排空;残留会让下次级联被早退守卫吞掉
    }
    this.lampsToCheck.length = 0;
    this.gatesDone.clear();
    if (this.blockPlayerTeleportationForOneIteration) {
      this.blockPlayerTeleportationForOneIteration = false;
    }
  }

  /** 触发逻辑门(压板等直接 Poke,P4/P6 用;Wiring.cs:254-260 的单机语义) */
  pokeLogicGate(lampX: number, lampY: number): void {
    this.lampsToCheck.push(this.p2i(lampX, lampY));
    this.logicGatePass();
  }

  private checkLogicGate(lampX: number, lampY: number): void {
    const st = this.st;
    if (!st.inBounds(lampX, lampY)) return;
    for (let y = lampY; y < st.h; y++) {
      if (!st.inBounds(lampX, y)) break;
      const i = this.p2i(lampX, y);
      if (st.type[i] === 0) break;
      const sh = this.sheetAt(lampX, y);
      if (sh === 420) {
        const wasDone = this.gatesDone.get(i) ?? false;
        const num1 = Math.floor(st.frameY[i] / 18); // 门种类 0-5
        const flag2 = st.frameX[i] === 18;  // 当前输出 ON
        const flag3 = st.frameX[i] === 36;  // 故障输出态
        if (num1 < 0) break;
        // 向上数灯(:614-629)
        let num2 = 0, num3 = 0;
        let faulty = false;
        for (let y2 = y - 1; y2 > 0; y2--) {
          const j = this.p2i(lampX, y2);
          if (st.type[j] !== 0 && this.sheetAt(lampX, y2) === 419) {
            if (st.frameX[j] === 36) { faulty = true; break; }
            num2++;
            if (st.frameX[j] === 18) num3++;
          } else break;
        }
        let out: boolean;
        switch (num1) { // :631-653
          case 0: out = num2 === num3; break;   // AND
          case 1: out = num3 > 0; break;        // OR
          case 2: out = num2 !== num3; break;   // XOR
          case 3: out = num3 === 0; break;      // NOR
          case 4: out = num3 === 1; break;      // NAND
          case 5: out = num3 !== 1; break;      // XNOR
          default: return;
        }
        const flag6 = !faulty && flag3;                 // 故障存在且门当前 off → 强制不发
        let flag7 = false;                              // 故障灯本轮被翻 → 概率通过
        if (faulty && st.frameX[this.p2i(lampX, lampY)] === 36) flag7 = true;
        // :658 无变化则不动作
        if (!((out !== flag2) || flag6 || flag7)) break;
        st.setTile(lampX, y, st.type[i], out ? 18 : 0, st.frameY[i]);
        if (faulty) st.setTile(lampX, y, st.type[i], 36, st.frameY[i]);
        this.skipWire(lampX, y);
        let fire: boolean = !faulty || flag7;
        if (flag7 && num2 > 0) fire = Math.random() < num3 / num2;
        if (flag6) fire = false;
        if (!fire) break;
        if (!wasDone) {
          this.gatesNext.push(i);
          break;
        }
        // 重复输出 = 冒烟反馈(Wiring.cs:683-685;烟雾粒子由 devices 侧近似,此处仅返回)
        break;
      }
      if (sh !== 419) break;
    }
  }

  // ============ 致动器(Wiring.cs:262-280, 2373-2405)============

  actuate(i: number, j: number): boolean {
    const st = this.st;
    if (!st.inBounds(i, j)) return false;
    if (!(st.wire[this.p2i(i, j)] & TileStore.WIRE_ACTUATOR)) return false;
    if (st.isActuated(i, j)) this.reActive(i, j);
    else this.deActive(i, j);
    return true;
  }

  actuateForced(i: number, j: number): void {
    if (this.st.isActuated(i, j)) this.reActive(i, j);
    else this.deActive(i, j);
  }

  /** 缩入(:2373-2396):蜥蜴砖(地表下未杀花)/宝箱顶限制 */
  private deActive(i: number, j: number): void {
    const st = this.st;
    if (!st.inBounds(i, j)) return;
    const t = this.p2i(i, j);
    if (st.type[t] === 0) return;
    if (this.sheetAt(i, j) === 226 && j > this.worldSurface && !this.planteraDowned) return;
    const def = TILE_DEFS[st.type[t]];
    let solid = !!def?.solid;
    const sh = this.sheetAt(i, j);
    if (sh === 314 || sh === 386 || sh === 387 || sh === 388 || sh === 389 || sh === 476) solid = false;
    // 上方是宝箱/祭坛则拒绝(:2389,CanKillTile 近似:实心即可杀)
    if (!solid) return;
    if (st.inBounds(i, j - 1) && st.type[this.p2i(i, j - 1)] !== 0) {
      const above = this.sheetAt(i, j - 1);
      if (above === 21 || above === 88 || above === 467 || above === 237) return; // 宝箱族/祭坛
    }
    st.setActuated(i, j, true);
  }

  private reActive(i: number, j: number): void {
    this.st.setActuated(i, j, false);
  }

  // ============ SkipWire(Wiring.cs:78-86)============

  private skipWire(x: number, y: number): void { this.wireSkip.add(this.p2i(x, y)); }
  private skipWireI(i: number): void { this.wireSkip.add(i); }

  // ============ 导线放置/移除(WorldGen.cs:34219-34327 语义)============

  /** 放置某色线;已存在返回 false */
  placeWire(x: number, y: number, colorBit: number): boolean {
    const st = this.st;
    if (!st.inBounds(x, y)) return false;
    const i = st.idx(x, y);
    if (st.wire[i] & colorBit) return false;
    st.setWire(x, y, st.wire[i] | colorBit);
    return true;
  }

  /** 移除某色线;不存在返回 false */
  killWire(x: number, y: number, colorBit: number): boolean {
    const st = this.st;
    if (!st.inBounds(x, y)) return false;
    const i = st.idx(x, y);
    if (!(st.wire[i] & colorBit)) return false;
    st.setWire(x, y, st.wire[i] & ~colorBit);
    return true;
  }

  placeActuator(x: number, y: number): boolean {
    const st = this.st;
    if (!st.inBounds(x, y)) return false;
    const i = st.idx(x, y);
    if (st.wire[i] & TileStore.WIRE_ACTUATOR) return false;
    st.setWire(x, y, st.wire[i] | TileStore.WIRE_ACTUATOR);
    return true;
  }

  killActuator(x: number, y: number): boolean {
    const st = this.st;
    if (!st.inBounds(x, y)) return false;
    const i = st.idx(x, y);
    if (!(st.wire[i] & TileStore.WIRE_ACTUATOR)) return false;
    st.setWire(x, y, st.wire[i] & ~TileStore.WIRE_ACTUATOR);
    return true;
  }

  // ============ MassWireOperation(Wiring.cs:2407-2558)============

  /**
   * 宏伟蓝图/五彩扳手 L 形批量操作。
   * mode: TOOL_* 位组合;consume 回调返回剩余可用数(false=耗尽),
   * 返回实际消耗 {wire, actuator}。
   */
  massWireOperation(
    ps: [number, number], pe: [number, number], mode: number,
    wires: number, actuators: number,
  ): { wire: number; actuator: number; aborted: boolean } {
    const dir = true; // 原版 dir = player.direction==1;先垂直段。false 时先水平
    let wireLeft = wires, actuatorLeft = actuators;
    let aborted = false;
    const step = (x: number, y: number): boolean => {
      // 返回 false = 材料耗尽中止
      if (!this.st.inBounds(x, y)) return true;
      const i = this.st.idx(x, y);
      if (!(mode & TOOL_CUTTER)) {
        const order: Array<[number, number]> = [
          [TOOL_RED, TileStore.WIRE_RED], [TOOL_GREEN, TileStore.WIRE_GREEN],
          [TOOL_BLUE, TileStore.WIRE_BLUE], [TOOL_YELLOW, TileStore.WIRE_YELLOW],
        ];
        for (const [m, bit] of order) {
          if (mode & m && !(this.st.wire[i] & bit)) {
            if (wireLeft <= 0) return false;
            wireLeft--;
            this.placeWire(x, y, bit);
          }
        }
        if (mode & TOOL_ACTUATOR && !(this.st.wire[i] & TileStore.WIRE_ACTUATOR)) {
          if (actuatorLeft <= 0) return false;
          actuatorLeft--;
          this.placeActuator(x, y);
        }
      } else {
        if (mode & TOOL_RED) this.killWire(x, y, TileStore.WIRE_RED);
        if (mode & TOOL_GREEN) this.killWire(x, y, TileStore.WIRE_GREEN);
        if (mode & TOOL_BLUE) this.killWire(x, y, TileStore.WIRE_BLUE);
        if (mode & TOOL_YELLOW) this.killWire(x, y, TileStore.WIRE_YELLOW);
        if (mode & TOOL_ACTUATOR) this.killActuator(x, y);
      }
      return true;
    };
    // 第一段:主轴(dir=true → 垂直)(:2428-2454)
    const sx = Math.sign(pe[0] - ps[0]), sy = Math.sign(pe[1] - ps[1]);
    let px = ps[0], py = ps[1];
    const first = dir ? sy : sx;
    {
      const from = dir ? ps[1] : ps[0];
      const to = dir ? pe[1] : pe[0];
      for (let v = from; v !== to && !aborted; v += first) {
        if (dir) py = v; else px = v;
        if (!step(px, py)) { aborted = true; break; }
      }
    }
    // 第二段:副轴(:2455-2484)
    {
      if (dir) py = pe[1]; else px = pe[0];
      const from = dir ? ps[0] : ps[1];
      const to = dir ? pe[0] : pe[1];
      const stepDir = dir ? sx : sy;
      for (let v = from; v !== to && !aborted; v += stepDir) {
        if (dir) px = v; else py = v;
        if (!step(px, py)) { aborted = true; break; }
      }
    }
    // 端点(:2485-2486)
    if (!aborted) step(pe[0], pe[1]);
    return { wire: wires - wireLeft, actuator: actuators - actuatorLeft, aborted };
  }
}
