// 液体模拟：Terraria 1.4.5.6（Terarria1456/Terraria/Liquid.cs）一比一移植。
// 核心结构（对照原版行号）：
//  - 活动液体列表 liquids[{x,y,kill,delay}] + checkingLiquid/skipLiquid 位图（Liquid.cs:37-40）
//  - UpdateLiquid() 分片调度 + kill 清扫（Liquid.cs:691-833）
//  - Update() 单格流程：实心格/地狱蒸发/岩浆蜂蜜降速与交互/下灌/侧向均流/kill 维护（Liquid.cs:298-674）
//  - LavaCheck/HoneyCheck：水+岩浆→黑曜石(56)、岩浆+蜂蜜→脆蜂蜜块(230)、水+蜂蜜→蜂蜜块(229)（Liquid.cs:888-1115）
//  - QuickWater/SettleWaterAt 读档沉降搬运（Liquid.cs:85-212）+ WaterCheck 重建列表（WorldGen.cs:48955）
// liquidType 编码沿用本仓库 store 约定：1=水 2=岩浆 3=蜂蜜（原版 0/1/2）。
// 偏离原版处（无法直译的周边系统，均有注释标注）：
//  - shimmer 微光液（liquidType 4/块 659）：世界未生成 Aether 液体，ShimmerCheck 空实现
//  - tilesIgnoreWater 的 boulder/树 tile 动态固态（379/546/10 等）：无对应系统
//  - PlaceTile 的音效/网络广播省略；tileObsidianKill 近似为 decor 清除
//  - DelWater 尾部 CheckAlch/睡莲(518) 帧检查省略
// 1456 对齐修正（相对旧 1.4.0.5 移植）：banker's rounding（C# Math.Round），
// 蜂蜜交互阈值 32→24（LiquidCheck 统一），AddWater/WaterCheck 的水死/岩浆死表
// （Main.cs:7182+ 提取），panic 模式（Liquid.cs:1040-1070），岩浆 3×3 烧草精确 type 映射
import { TILE_DEFS, TILE_BY_KEY } from '../../data/tiles';
import type { World } from '../World';

interface LiquidEntry { x: number; y: number; kill: number; delay: number; }

const OBSIDIAN = TILE_BY_KEY['obsidian'];
const HONEY_BLOCK = TILE_BY_KEY['v_229_honey_block'];
const CRISPY_HONEY = TILE_BY_KEY['v_230_crispy_honey_block'];

/** C# Math.Round = banker's rounding（.5 取偶；JS Math.round 是四舍五入）——1456 均
 *  分全程使用，直接换 Math.round 会在 x.5 时偏离 1 */
function csRound(v: number): number {
  const f = Math.floor(v);
  const d = v - f;
  if (d > 0.5) return f + 1;
  if (d < 0.5) return f;
  return f % 2 === 0 ? f : f + 1;
}

/** Main.tileWaterDeath 表（Main.cs:7182-7240 区段提取，vanilla tile id） */
const WATER_DEATH_SHEETS = new Set([215, 4, 51, 697, 93, 98, 552, 405, 646, 372]);
/** Main.tileLavaDeath 表（Main.cs 同区段，vanilla tile id） */
const LAVA_DEATH_SHEETS = new Set([630, 631, 571, 579, 591, 538, 544, 629, 550, 551, 533, 553, 554, 555, 556, 558, 559, 599, 600, 601, 602, 603, 604, 605, 606, 607, 608, 609, 610, 611, 612, 632, 640, 643, 644, 645, 710, 568, 569, 570, 580, 582, 619, 620, 572, 560, 564, 567, 565, 654, 529, 530, 705, 484, 3, 5, 10, 11, 12, 13, 14, 469, 486, 488, 704, 487, 489, 490, 15, 497, 16, 17, 18, 19, 24, 27, 28, 29, 32, 33, 34, 35, 36, 42, 49, 50, 707, 51, 697, 52, 55, 61, 703, 62, 69, 655, 71, 72, 73, 74, 79, 80, 81, 86, 87, 88, 89, 90, 91, 92, 93, 94, 95, 96, 97, 98, 100, 101, 102, 103, 104, 106, 110, 113, 115, 125, 126, 128, 149, 172, 173, 174, 184, 201, 205, 209, 210, 212, 213, 353, 215, 216, 217, 218, 219, 642, 220, 227, 228, 233, 236, 702, 238, 240, 241, 242, 243, 244, 245, 246, 247, 254, 269, 270, 271, 581, 698, 660, 275, 413, 276, 277, 278, 279, 280, 281, 282, 283, 285, 286, 287, 288, 289, 290, 291, 292, 293, 294, 295, 296, 297, 298, 299, 300, 301, 302, 303, 304, 305, 306, 307, 308, 309, 310, 532, 316, 317, 318, 319, 354, 355, 699, 499, 323, 335, 338, 339, 528, 636, 352, 382, 425, 453, 456, 463, 464, 465, 485, 511, 510, 547, 548, 552, 573, 621, 622, 623, 624, 700, 656, 701, 493, 395, 520, 471, 405, 406, 452, 457, 454, 494, 387, 386, 388, 389, 646, 372, 639, 668, 324, 427, 390]);
/** 岩浆 3×3 烧除（1456 DelWater L1557+）：草族 tile → 空气；蘑菇草族 → 泥土 */
const LAVA_BURN_TO_AIR = new Set([2, 23, 109, 199, 477, 492]);
const LAVA_BURN_TO_DIRT = new Set([60, 70, 661, 662]);

export class LiquidSim {
  world: World;
  /** 活动液体条目（原版 Main.liquid[]，dense 数组 + swap-remove） */
  private liquids: LiquidEntry[] = [];
  numLiquid = 0;
  /** tile.checkingLiquid / tile.skipLiquid 位图 */
  private checking: Uint8Array;
  private skip: Uint8Array;
  /** 调度参数（单机客户端高质量档：cycles = 17-10*1 = 7；Main.cs:12240-12243） */
  private cycles = 7;
  private curMaxLiquid = 25000;
  private wetCounter = 0;
  /** 读档沉降：quickSettle=true 时 cycles=1 全量处理、下灌快速补满（WorldFile.cs:365-389 / Main.cs:12251） */
  quickSettle = false;
  private quickFall = false;
  private stuck = false;
  private stuckCount = 0;
  private stuckAmount = 0; // 原版 ReInit 置 0（Liquid.cs:69）
  private disposed = false;
  /** LiquidBuffer 溢出缓冲（Liquid.cs:840-843 入队 / 799-807 清扫轮回灌，上限 49998） */
  private buffer: Array<{ x: number; y: number }> = [];
  /** 水死/岩浆死内部 tile id 集（Main.tileWaterDeath/tileLavaDeath 经 sheet 反查） */
  private readonly waterDeathIds: Set<number>;
  private readonly lavaDeathIds: Set<number>;
  private readonly lavaBurnAirIds: Set<number>;
  private readonly lavaBurnDirtIds: Set<number>;
  private readonly dirtId: number;
  /** 液体冲毁方块（原版 AddWater 尾 KillTile）：Game 注入 breakTile（掉落+帧刷新） */
  killTile: ((x: number, y: number) => void) | null = null;
  // ---- panic 模式（Liquid.cs:975-1070）：缓冲长期超限 → 逐行 QuickWater 强制收敛 ----
  private panicMode = false;
  private panicCounter = 0;
  private panicY = 0;

  constructor(world: World) {
    this.world = world;
    const st = world.store;
    this.checking = new Uint8Array(st.w * st.h);
    this.skip = new Uint8Array(st.w * st.h);
    // sheet → 内部 id 反查（死亡表/烧除表用）
    const bySheet = (sheets: Set<number>): Set<number> => new Set(
      TILE_DEFS.reduce<number[]>((acc, d, id) => { if (d.vanilla && sheets.has(d.vanilla.sheet)) acc.push(id); return acc; }, []),
    );
    this.waterDeathIds = bySheet(WATER_DEATH_SHEETS);
    this.lavaDeathIds = bySheet(LAVA_DEATH_SHEETS);
    this.lavaBurnAirIds = bySheet(LAVA_BURN_TO_AIR);
    this.lavaBurnDirtIds = bySheet(LAVA_BURN_TO_DIRT);
    this.dirtId = TILE_BY_KEY['dirt'];
    // 挖掘/放置唤醒：原版 SquareTileFrame 会对 3×3 内每格 TileFrame→AddWater（WorldGen.cs:49664）
    st.onTileChanged((x, y) => {
      if (this.disposed) return;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) this.addWater(x + dx, y + dy);
    });
    // 液体直接写入（水桶等）：唤醒目标及四邻
    st.onLiquidChanged((x, y) => {
      if (this.disposed) return;
      this.addWater(x, y);
      this.addWater(x, y - 1); this.addWater(x, y + 1);
      this.addWater(x - 1, y); this.addWater(x + 1, y);
    });
  }

  /** 溢出缓冲长度（Game 的生成期轮上限计算用，原版 LiquidBuffer.numLiquidBuffer） */
  get bufferLen(): number { return this.buffer.length; }

  /** 丢弃模拟器：预沉降临时实例调用，停止响应唤醒 */
  dispose() {
    this.disposed = true;
    this.liquids.length = 0;
    this.numLiquid = 0;
  }

  private idx(x: number, y: number): number { return y * this.world.store.w + x; }

  /** 格子是否阻挡液体（原版 nactive() && tileSolid && !tileSolidTop） */
  private blocksLiquid(x: number, y: number): boolean {
    const st = this.world.store;
    if (x < 0 || y < 0 || x >= st.w || y >= st.h) return true;
    const t = st.type[this.idx(x, y)];
    if (t === 0) return false;
    const d = TILE_DEFS[t];
    return !!d && d.solid && !d.platform;
  }

  /** WorldGen.SolidTile 语义（WorldGen.cs:42370）：实心 && !平台 && !半砖 && !坡面。
   *  仅 LavaCheck/HoneyCheck 入口使用——半砖格允许发生交互（Liquid.cs:898/1020） */
  private solidTileFull(x: number, y: number): boolean {
    const st = this.world.store;
    if (x < 0 || y < 0 || x >= st.w || y >= st.h) return true;
    const i = this.idx(x, y);
    const t = st.type[i];
    if (t === 0) return false;
    const d = TILE_DEFS[t];
    return !!d && d.solid && !d.platform && !st.half[i] && st.slope[i] === 0;
  }

  // ================= AddWater（Liquid.cs:835-872） =================

  addWater(x: number, y: number) {
    const st = this.world.store;
    if (x >= st.w - 5 || y >= st.h - 5 || x < 5 || y < 5) return;
    const i = this.idx(x, y);
    if (this.checking[i] || st.liquid[i] === 0) return;
    const t = st.type[i];
    if (t !== 0) {
      const d = TILE_DEFS[t];
      if (d && d.solid && !d.platform) return;
    }
    if (this.numLiquid >= this.curMaxLiquid - 1) {
      // 原版走 LiquidBuffer 缓冲、清扫轮回灌（Liquid.cs:840-843），超缓冲上限才丢
      if (this.buffer.length < 49998) this.buffer.push({ x, y });
      return;
    }
    this.checking[i] = 1;
    this.skip[i] = 0;
    this.liquids[this.numLiquid] = { x, y, kill: 0, delay: 0 };
    this.numLiquid++;
    // 1456 AddWater 尾部（L1196-1211）：岩浆/水冲毁可死亡方块（火把/植物等 KillTile）
    if (t !== 0) {
      const isLava = st.liquidType[i] === 2;
      const dies = isLava ? this.lavaDeathIds.has(t) : this.waterDeathIds.has(t);
      if (dies) this.killTile?.(x, y);
    }
  }

  // ================= UpdateLiquid 调度（Liquid.cs:691-833） =================

  /** 每 2 个逻辑 tick 调一次（原版 WorldGen.UpdateWorld 内 skipCount 节流） */
  step() { this.updateLiquid(); }

  updateLiquid() {
    const st = this.world.store;
    const killThreshold = 8; // 单机 num（1456 Liquid.cs:995）
    // panic 模式（1456 Liquid.cs:1019-1070）：缓冲 ≥45000 持续 3600 次未解 →
    // 自底向上逐行 QuickWater 强制沉降，每次调用处理 5 行，到顶后 WaterCheck 退出
    if (!this.quickSettle) {
      if (!this.panicMode) {
        if (this.buffer.length >= 45000) {
          this.panicCounter++;
          if (this.panicCounter > 3600) {
            this.panicMode = true;
            this.panicCounter = 0;
            this.panicY = st.h - 3;
            this.liquids.length = 0;
            this.numLiquid = 0;
            this.buffer.length = 0;
          }
        } else {
          this.panicCounter = 0;
        }
      }
      if (this.panicMode) {
        let n = 0;
        while (this.panicY >= 3 && n < 5) {
          n++;
          this.quickWater(this.panicY, this.panicY);
          this.panicY--;
        }
        if (this.panicY < 3) {
          this.panicMode = false;
          this.panicCounter = 0;
          this.waterCheck();
        }
        return;
      }
    }
    const quickSettle = this.quickSettle;
    // quickFall 跟随 quickSettle（Liquid.cs:752-755，未受 gen 门限）；但 cycles=1 的
    // Main.cs:12251 分支被 !WorldGen.gen 限定——读档沉降期 gen=true 不生效，保持分片
    this.quickFall = quickSettle;
    const cycles = this.cycles;
    this.wetCounter++;
    const slice = Math.floor(this.curMaxLiquid / cycles);
    const start = slice * (this.wetCounter - 1);
    let end = slice * this.wetCounter;
    if (this.wetCounter === cycles) end = this.numLiquid;
    if (end > this.numLiquid) { end = this.numLiquid; this.wetCounter = cycles; }
    if (this.quickFall) {
      for (let l = start; l < end; l++) {
        const e = this.liquids[l];
        e.delay = 10;
        this.update(e);
        this.skip[this.idx(e.x, e.y)] = 0;
      }
    } else {
      for (let l = start; l < end; l++) {
        const e = this.liquids[l];
        const i = this.idx(e.x, e.y);
        if (!this.skip[i]) this.update(e);
        else this.skip[i] = 0;
      }
    }
    if (this.wetCounter >= cycles) {
      this.wetCounter = 0;
      // 清扫：kill 累积达标 → 254 补满 255 后出列（Liquid.cs:790-798）
      for (let l = this.numLiquid - 1; l >= 0; l--) {
        const e = this.liquids[l];
        if (e.kill >= killThreshold) {
          const i = this.idx(e.x, e.y);
          if (st.liquid[i] === 254) st.liquid[i] = 255;
          this.delWater(l);
        }
      }
      // LiquidBuffer 回灌：按剩余空位逐个重新入列（Liquid.cs:799-807）
      if (this.buffer.length > 0) {
        const free = Math.min(this.curMaxLiquid - this.numLiquid, this.buffer.length);
        for (let n = 0; n < free; n++) {
          const b = this.buffer.shift()!;
          this.checking[this.idx(b.x, b.y)] = 0;
          this.addWater(b.x, b.y);
        }
      }
      // 卡死检测：活动量长期不变 → 清空列表靠唤醒自愈（Liquid.cs:808-824）
      if (this.numLiquid > 0 && this.numLiquid > this.stuckAmount - 50 && this.numLiquid < this.stuckAmount + 50) {
        this.stuckCount++;
        if (this.stuckCount >= 10000) {
          this.stuck = true;
          for (let l = this.numLiquid - 1; l >= 0; l--) this.delWater(l);
          this.stuck = false;
          this.stuckCount = 0;
        }
      } else {
        this.stuckCount = 0;
        this.stuckAmount = this.numLiquid;
      }
    }
  }

  // ================= 单格流程 Update（Liquid.cs:298-674） =================

  private update(e: LiquidEntry) {
    const st = this.world.store;
    const w = st.w, h = st.h;
    const x = e.x, y = e.y;
    const i5 = this.idx(x, y);
    // 1) 本格被实心方块占据 → 下轮必删（Liquid.cs:306-310）
    if (this.blocksLiquid(x, y)) { e.kill = 999; return; }
    const startAmt = st.liquid[i5];
    // 2) 地狱蒸发：水每 tick -2（Liquid.cs:314-320；UnderworldLayer ≈ h-200）
    if (y > h - 200 && st.liquidType[i5] === 1 && st.liquid[i5] > 0) {
      st.liquid[i5] = Math.max(0, st.liquid[i5] - 2);
    }
    if (st.liquid[i5] === 0) { e.kill = 999; return; }
    const myType = st.liquidType[i5];
    // 3) 岩浆/蜂蜜：先交互检查，再降速（Liquid.cs:327-373）
    if (myType === 2) {
      this.lavaCheck(x, y);
      if (!this.quickFall) {
        if (e.delay < 5) { e.delay++; return; }
        e.delay = 0;
      }
    } else {
      // 水格：唤醒岩浆邻居，让对方自己的 Update 处理交互（Liquid.cs:342-349）。
      // 标量展开(2026-08 审计 G4):元组数组+迭代器在此热路径 ≈2.5M 对象/s
      for (let t = 0; t < 4; t++) {
        const nx = x + (t === 0 ? -1 : t === 1 ? 1 : 0);
        const ny = y + (t === 2 ? -1 : t === 3 ? 1 : 0);
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const ni = this.idx(nx, ny);
        if (st.liquid[ni] > 0 && st.liquidType[ni] === 2) this.addWater(nx, ny);
      }
      if (myType === 3) {
        this.honeyCheck(x, y);
        if (!this.quickFall) {
          if (e.delay < 10) { e.delay++; return; }
          e.delay = 0;
        }
      } else {
        // 唤醒蜂蜜邻居（Liquid.cs:365-372）——标量展开,同上
        for (let t = 0; t < 4; t++) {
          const nx = x + (t === 0 ? -1 : t === 1 ? 1 : 0);
          const ny = y + (t === 2 ? -1 : t === 3 ? 1 : 0);
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const ni = this.idx(nx, ny);
          if (st.liquid[ni] > 0 && st.liquidType[ni] === 3) this.addWater(nx, ny);
        }
      }
    }
    // 4) 向下全量下灌（Liquid.cs:375-397）
    {
      const bi = this.idx(x, y + 1);
      const belowAmt = st.liquid[bi];
      const belowType = st.liquidType[bi];
      const belowBlocks = y + 1 >= h ? true : this.blocksLiquid(x, y + 1);
      if (!belowBlocks && (belowAmt <= 0 || belowType === myType) && belowAmt < 255) {
        let t = 255 - belowAmt;
        if (t > st.liquid[i5]) t = st.liquid[i5];
        // 原版边界特性：缺口 1 且本格满格时不扣源（Liquid.cs:381-384）
        const flag = t === 1 && st.liquid[i5] === 255;
        if (!flag) st.liquid[i5] -= t;
        st.liquid[bi] += t;
        st.liquidType[bi] = myType;
        this.addWater(x, y + 1);
        this.skip[bi] = 1;
        this.skip[i5] = 1;
        if (this.quickSettle && st.liquid[i5] > 250) st.liquid[i5] = 255;
        else if (!flag) { this.addWater(x - 1, y); this.addWater(x + 1, y); }
      }
    }
    // 5) 侧向均流（Liquid.cs:398-651）
    if (st.liquid[i5] > 0) this.sideFlow(x, y, i5);
    // 6) kill 维护（Liquid.cs:652-671）
    if (st.liquid[i5] !== startAmt) {
      if (st.liquid[i5] === 254 && startAmt === 255) {
        if (this.quickSettle) st.liquid[i5] = 255;
        e.kill++;
      } else {
        this.addWater(x, y - 1);
        e.kill = 0;
      }
    } else {
      e.kill++;
    }
  }

  /** 侧向均流：参与格全体写平均值（Liquid.cs:398-651，逐分支照抄） */
  private sideFlow(x: number, y: number, i5: number) {
    const st = this.world.store;
    const myType = st.liquidType[i5];
    const il = i5 - 1, ir = i5 + 1, iu = i5 - st.w, im2 = i5 - 2, ip2 = i5 + 2, im3 = i5 - 3, ip3 = i5 + 3;
    const lq = st.liquid[il], rq = st.liquid[ir];
    // flag1 左可流 / flag2 右可流 / flag3 左 2 格延伸 / flag4 右 2 格延伸
    let f1 = true, f2 = true, f3 = true, f4 = true;
    if (this.blocksLiquid(x - 1, y)) f1 = false;
    else if (lq > 0 && st.liquidType[il] !== myType) f1 = false;
    else if (this.blocksLiquid(x - 2, y)) f3 = false;
    else if (st.liquid[im2] === 0) f3 = false;
    else if (st.liquidType[im2] !== myType) f3 = false;
    if (this.blocksLiquid(x + 1, y)) f2 = false;
    else if (rq > 0 && st.liquidType[ir] !== myType) f2 = false;
    else if (this.blocksLiquid(x + 2, y)) f4 = false;
    else if (st.liquid[ip2] === 0) f4 = false;
    else if (st.liquidType[ip2] !== myType) f4 = false;
    let num1 = 0;
    if (st.liquid[i5] < 3) num1 = -1;         // 薄层蒸发偏置（Liquid.cs:424-426）
    if (st.liquid[i5] > 250) { f3 = false; f4 = false; }
    if (f1 && f2) {
      if (f3 && f4) {
        // ±3 延伸判定（Liquid.cs:436-449）
        let f5 = true, f6 = true;
        if (this.blocksLiquid(x - 3, y)) f5 = false;
        else if (st.liquid[im3] === 0) f5 = false;
        else if (st.liquidType[im3] !== myType) f5 = false;
        if (this.blocksLiquid(x + 3, y)) f6 = false;
        else if (st.liquid[ip3] === 0) f6 = false;
        else if (st.liquidType[ip3] !== myType) f6 = false;
        if (f5 && f6) {
          // 7 格均分（Liquid.cs:452-515）
          const m = csRound((lq + rq + st.liquid[im2] + st.liquid[ip2] + st.liquid[im3] + st.liquid[ip3] + st.liquid[i5] + num1) / 7); // 1456 Math.Round=取偶
          let same = 0;
          if (lq !== m) { st.liquidType[il] = myType; st.liquid[il] = m; this.addWater(x - 1, y); } else { st.liquidType[il] = myType; same++; }
          if (rq !== m) { st.liquidType[ir] = myType; st.liquid[ir] = m; this.addWater(x + 1, y); } else { st.liquidType[ir] = myType; same++; }
          if (st.liquid[im2] !== m) { st.liquidType[im2] = myType; st.liquid[im2] = m; this.addWater(x - 2, y); } else { st.liquidType[im2] = myType; same++; }
          if (st.liquid[ip2] !== m) { st.liquidType[ip2] = myType; st.liquid[ip2] = m; this.addWater(x + 2, y); } else { st.liquidType[ip2] = myType; same++; }
          if (st.liquid[im3] !== m) { st.liquidType[im3] = myType; st.liquid[im3] = m; this.addWater(x - 3, y); } else { st.liquidType[im3] = myType; same++; }
          if (st.liquid[ip3] !== m) { st.liquidType[ip3] = myType; st.liquid[ip3] = m; this.addWater(x + 3, y); } else { st.liquidType[ip3] = myType; same++; }
          // 补偿唤醒：中心可能保持原值，邻居需按"邻居≠均值或中心≠均值"重唤醒（Liquid.cs:502-513）
          if (st.liquid[il] !== m || st.liquid[i5] !== m) this.addWater(x - 1, y);
          if (st.liquid[ir] !== m || st.liquid[i5] !== m) this.addWater(x + 1, y);
          if (st.liquid[im2] !== m || st.liquid[i5] !== m) this.addWater(x - 2, y);
          if (st.liquid[ip2] !== m || st.liquid[i5] !== m) this.addWater(x + 2, y);
          if (st.liquid[im3] !== m || st.liquid[i5] !== m) this.addWater(x - 3, y);
          if (st.liquid[ip3] !== m || st.liquid[i5] !== m) this.addWater(x + 3, y);
          // 中心例外：六邻全等于均值且上方有液 → 保持原值（Liquid.cs:514）
          if (same !== 6 || st.liquid[iu] <= 0) st.liquid[i5] = m;
        } else {
          // 5 格均分（Liquid.cs:519-562）
          const m = csRound((lq + rq + st.liquid[im2] + st.liquid[ip2] + st.liquid[i5] + num1) / 5); // 1456 Math.Round=取偶
          let same = 0;
          if (lq !== m) { st.liquidType[il] = myType; st.liquid[il] = m; this.addWater(x - 1, y); } else { st.liquidType[il] = myType; same++; }
          if (rq !== m) { st.liquidType[ir] = myType; st.liquid[ir] = m; this.addWater(x + 1, y); } else { st.liquidType[ir] = myType; same++; }
          if (st.liquid[im2] !== m) { st.liquidType[im2] = myType; st.liquid[im2] = m; this.addWater(x - 2, y); } else { st.liquidType[im2] = myType; same++; }
          if (st.liquid[ip2] !== m) { st.liquidType[ip2] = myType; st.liquid[ip2] = m; this.addWater(x + 2, y); } else { st.liquidType[ip2] = myType; same++; }
          // 补偿唤醒（Liquid.cs:553-560）
          if (st.liquid[il] !== m || st.liquid[i5] !== m) this.addWater(x - 1, y);
          if (st.liquid[ir] !== m || st.liquid[i5] !== m) this.addWater(x + 1, y);
          if (st.liquid[im2] !== m || st.liquid[i5] !== m) this.addWater(x - 2, y);
          if (st.liquid[ip2] !== m || st.liquid[i5] !== m) this.addWater(x + 2, y);
          if (same !== 4 || st.liquid[iu] <= 0) st.liquid[i5] = m;
        }
      } else if (f3) {
        // 4 格：左延伸（Liquid.cs:567-587）。类型写在条件判断之前（原版 L568 无条件写）
        const m = csRound((lq + rq + st.liquid[im2] + st.liquid[i5] + num1) / 4); // 1456 Math.Round=取偶
        st.liquidType[il] = myType;
        if (lq !== m || st.liquid[i5] !== m) { st.liquid[il] = m; this.addWater(x - 1, y); }
        st.liquidType[ir] = myType;
        if (rq !== m || st.liquid[i5] !== m) { st.liquid[ir] = m; this.addWater(x + 1, y); }
        st.liquidType[im2] = myType;
        if (st.liquid[im2] !== m || st.liquid[i5] !== m) { st.liquid[im2] = m; this.addWater(x - 2, y); }
        st.liquid[i5] = m;
      } else if (f4) {
        // 4 格：右延伸（Liquid.cs:590-609）。类型写在条件判断之前（原版 L591 无条件写）
        const m = csRound((lq + rq + st.liquid[ip2] + st.liquid[i5] + num1) / 4); // 1456 Math.Round=取偶
        st.liquidType[il] = myType;
        if (lq !== m || st.liquid[i5] !== m) { st.liquid[il] = m; this.addWater(x - 1, y); }
        st.liquidType[ir] = myType;
        if (rq !== m || st.liquid[i5] !== m) { st.liquid[ir] = m; this.addWater(x + 1, y); }
        st.liquidType[ip2] = myType;
        if (st.liquid[ip2] !== m || st.liquid[i5] !== m) { st.liquid[ip2] = m; this.addWater(x + 2, y); }
        st.liquid[i5] = m;
      } else {
        // 3 格均分（Liquid.cs:613-628）：随机 254→255 补满
        let m = csRound((lq + rq + st.liquid[i5] + num1) / 3); // 1456 Math.Round=取偶
        if (m === 254 && Math.random() * 30 < 1) m = 255;
        if (lq !== m) { st.liquidType[il] = myType; st.liquid[il] = m; this.addWater(x - 1, y); } else st.liquidType[il] = myType;
        if (rq !== m) { st.liquidType[ir] = myType; st.liquid[ir] = m; this.addWater(x + 1, y); } else st.liquidType[ir] = myType;
        st.liquid[i5] = m;
      }
    } else if (f1) {
      // 2 格：向左（Liquid.cs:633-639）
      const m = csRound((lq + st.liquid[i5] + num1) / 2); // 1456 Math.Round=取偶
      if (lq !== m) st.liquid[il] = m;
      st.liquidType[il] = myType;
      if (st.liquid[i5] !== m || st.liquid[il] !== m) this.addWater(x - 1, y);
      st.liquid[i5] = m;
    } else if (f2) {
      // 2 格：向右（Liquid.cs:643-649）
      const m = csRound((rq + st.liquid[i5] + num1) / 2); // 1456 Math.Round=取偶
      if (rq !== m) st.liquid[ir] = m;
      st.liquidType[ir] = myType;
      if (st.liquid[i5] !== m || st.liquid[ir] !== m) this.addWater(x + 1, y);
      st.liquid[i5] = m;
    }
  }

  // ================= 液体交互（Liquid.cs:888-1115） =================

  /** 岩浆格与水/蜂蜜接触 → 黑曜石 56 / 脆蜂蜜块 230（阈值 24） */
  private lavaCheck(x: number, y: number) {
    const st = this.world.store;
    if (this.solidTileFull(x, y)) return; // WorldGen.SolidTile：半砖/坡面放行（Liquid.cs:898）
    const i5 = this.idx(x, y);
    const il = i5 - 1, ir = i5 + 1, iu = i5 - st.w, id = i5 + st.w;
    const lq = st.liquid[il], rq = st.liquid[ir], uq = st.liquid[iu], dq = st.liquid[id];
    const lt = st.liquidType[il], rt = st.liquidType[ir], ut = st.liquidType[iu], dt = st.liquidType[id];
    if ((lq > 0 && lt !== 2) || (rq > 0 && rt !== 2) || (uq > 0 && ut !== 2)) {
      // 情形 A：左右/上方有非岩浆液体 → 生成在岩浆格（Liquid.cs:905-959）
      let sum = 0;
      let type = OBSIDIAN;
      if (lt !== 2) { sum += lq; st.liquid[il] = 0; }
      if (rt !== 2) { sum += rq; st.liquid[ir] = 0; }
      if (ut !== 2) { sum += uq; st.liquid[iu] = 0; }
      if (lt === 3 || rt === 3 || ut === 3) type = CRISPY_HONEY;
      if (sum < 24) return;
      const t = st.type[i5];
      if (t !== 0) {
        const d = TILE_DEFS[t];
        if (d && d.decor) st.setTile(x, y, 0);  // 近似 tileObsidianKill
        else return;                             // 平台等保留方块 → 不生成
      }
      st.liquid[i5] = 0;
      st.liquidType[i5] = 0;
      st.setTile(x, y, type);
    } else {
      if (dq <= 0 || dt === 2) return;
      // 情形 B：仅下方有水/蜂蜜 → 生成在下方格（Liquid.cs:961-1014）
      const belowT = st.type[id];
      if (belowT !== 0) {
        const d = TILE_DEFS[belowT];
        if (d && d.decor) st.setTile(x, y + 1, 0); // tileCut / obsidianKill 近似
        else return;
      }
      if (st.liquid[i5] < 24) { st.liquid[i5] = 0; st.liquidType[i5] = 0; return; }
      const type = dt === 3 ? CRISPY_HONEY : OBSIDIAN;
      st.liquid[i5] = 0; st.liquidType[i5] = 0;
      st.liquid[id] = 0; st.liquidType[id] = 0;
      st.setTile(x, y + 1, type);
    }
  }

  /** 蜂蜜格与水接触 → 蜂蜜块 229（阈值 32） */
  private honeyCheck(x: number, y: number) {
    const st = this.world.store;
    if (this.solidTileFull(x, y)) return; // WorldGen.SolidTile：半砖/坡面放行（Liquid.cs:1020）
    const i5 = this.idx(x, y);
    const il = i5 - 1, ir = i5 + 1, iu = i5 - st.w, id = i5 + st.w;
    const lq = st.liquid[il], rq = st.liquid[ir], uq = st.liquid[iu], dq = st.liquid[id];
    const lt = st.liquidType[il], rt = st.liquidType[ir], ut = st.liquidType[iu], dt = st.liquidType[id];
    if ((lq > 0 && lt === 1) || (rq > 0 && rt === 1) || (uq > 0 && ut === 1)) {
      let sum = 0;
      if (lt === 1) { sum += lq; st.liquid[il] = 0; }
      if (rt === 1) { sum += rq; st.liquid[ir] = 0; }
      if (ut === 1) { sum += uq; st.liquid[iu] = 0; }
      if (sum < 24) return; // 1456 LiquidCheck 统一阈值 24
      const t = st.type[i5];
      if (t !== 0) {
        const d = TILE_DEFS[t];
        if (d && d.decor) st.setTile(x, y, 0);
        else return;
      }
      st.liquid[i5] = 0;
      st.liquidType[i5] = 0;
      st.setTile(x, y, HONEY_BLOCK);
    } else {
      if (dq <= 0 || dt !== 1) return;
      const belowT = st.type[id];
      if (belowT !== 0) {
        const d = TILE_DEFS[belowT];
        if (d && d.decor) st.setTile(x, y + 1, 0);
        else return;
      }
      if (st.liquid[i5] < 24) { st.liquid[i5] = 0; st.liquidType[i5] = 0; return; } // 1456 统一 24
      st.liquid[i5] = 0; st.liquidType[i5] = 0;
      st.liquid[id] = 0; st.liquidType[id] = 0;
      st.setTile(x, y + 1, HONEY_BLOCK);
    }
  }

  // ================= DelWater（Liquid.cs:1117-1213） =================

  private delWater(l: number) {
    const st = this.world.store;
    const e = this.liquids[l];
    const x = e.x, y = e.y;
    const i5 = this.idx(x, y);
    const il = i5 - 1, ir = i5 + 1, id = i5 + st.w;
    const amt = st.liquid[i5];
    if (amt < 2) {
      // 残量清零 + 邻居唤醒（Liquid.cs:1125-1137）
      st.liquid[i5] = 0;
      if (st.liquid[il] < 2) st.liquid[il] = 0; else this.addWater(x - 1, y);
      if (st.liquid[ir] < 2) st.liquid[ir] = 0; else this.addWater(x + 1, y);
    } else if (amt < 20) {
      // 水膜抹除：邻格更低或下方不满（Liquid.cs:1138-1142）
      const lq = st.liquid[il], rq = st.liquid[ir], dq = st.liquid[id];
      if ((lq < amt && !this.blocksLiquid(x - 1, y)) ||
          (rq < amt && !this.blocksLiquid(x + 1, y)) ||
          (dq < 255 && !this.blocksLiquid(x, y + 1))) {
        st.liquid[i5] = 0;
      }
    } else if (st.liquid[id] < 255 && !this.blocksLiquid(x, y + 1) && !this.stuck && !this.blocksLiquid(x, y)) {
      e.kill = 0; // 下方未满：留在列表继续流（Liquid.cs:1143-1147）
      return;
    }
    if (st.liquid[i5] < 250 && st.liquid[i5 - st.w] > 0) this.addWater(x, y - 1);
    if (st.liquid[i5] === 0) {
      st.liquidType[i5] = 0;
    } else {
      const rq = st.liquid[ir], lq = st.liquid[il];
      if (rq > 0 && rq < 250 && !this.blocksLiquid(x + 1, y) && st.liquid[i5] !== rq) this.addWater(x + 1, y);
      if (lq > 0 && lq < 250 && !this.blocksLiquid(x - 1, y) && st.liquid[i5] !== lq) this.addWater(x - 1, y);
      if (st.liquidType[i5] === 2) {
        this.lavaCheck(x, y);
        // 岩浆 3×3 烧除（1456 DelWater L1557-1587）：草族(2/23/109/199/477/492)→空气；
        // 蘑菇草族(60/70/661/662)→泥土 59——经 sheet 反查内部 id 精确映射
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx, ny = y + dy;
            if (nx < 1 || ny < 1 || nx >= st.w - 1 || ny >= st.h - 1) continue;
            const ni = this.idx(nx, ny);
            const t = st.type[ni];
            if (t === 0) continue;
            if (this.lavaBurnAirIds.has(t)) st.setTile(nx, ny, 0);
            else if (this.lavaBurnDirtIds.has(t)) st.setTile(nx, ny, this.dirtId);
          }
        }
      } else if (st.liquidType[i5] === 3) {
        this.honeyCheck(x, y);
      }
    }
    // swap-remove（Liquid.cs:1193-1197）：只搬 x/y/kill，delay 保留本槽旧值（原版语义）
    this.numLiquid--;
    this.checking[i5] = 0;
    const tail = this.liquids[this.numLiquid];
    e.x = tail.x; e.y = tail.y; e.kill = tail.kill;
    this.liquids.length = this.numLiquid;
  }

  // ================= 读档沉降：QuickWater（Liquid.cs:85-103 / 105-212） =================

  /** 自底向上逐湿格直接搬运沉降（原版 QuickWater(verbose, -1, -1)：y 从 h-3 到 3） */
  quickWater(minY = 3, maxY = -1) {
    const st = this.world.store;
    const yMax = maxY < 0 ? st.h - 3 : maxY;
    for (let y = yMax; y >= minY; y--) {
      for (let x = 4; x < st.w - 4; x++) {
        if (st.liquid[this.idx(x, y)] !== 0) this.settleWaterAt(x, y);
      }
    }
  }

  /** 单格液体直接搬到最终落点（Liquid.cs:105-212 逐行对照） */
  private settleWaterAt(originX: number, originY: number) {
    const st = this.world.store;
    const oi = this.idx(originX, originY);
    if (st.liquid[oi] === 0) return;
    let X = originX, Y = originY;
    const srcType = st.liquidType[oi];
    let liquid = st.liquid[oi];
    st.liquid[oi] = 0;
    let flag1 = true;
    for (;;) {
      // 1) 垂直下落：下方空且可通行就一直落（Liquid.cs:121-130）
      let flag2 = false;
      while (Y < st.h - 5 && st.liquid[this.idx(X, Y + 1)] === 0 && !this.blocksLiquid(X, Y + 1)) {
        Y++;
        flag2 = true;
        flag1 = false;
      }
      // （Liquid.cs:129-130 的 waterLine 岩浆转换仅世界生成期生效，读档跳过）
      // 2) 蛇形横向铺开（Liquid.cs:131-195）
      let dir = -1;          // num2：当前行走方向
      let step = 0;          // num3：当前行步数
      let lastDir = -1;      // num4：最后空位方向
      let lastStep = 0;      // num5：最后空位步数
      let hitL = false;      // flag4：左边界
      let hitR = false;      // flag3：右边界
      let dropped = false;   // flag5：本轮发生下落
      for (;;) {
        const probeX = X + step * dir;
        // 越界防护：原版 C# 越界会抛异常，JS 的 idx 会静默回绕到上一行——
        // 超出 [0, w-1] 的探测一律视为边界命中，不再读取
        if (probeX < 0 || probeX >= st.w) {
          if (dir === -1) hitL = true; else hitR = true;
          if (hitL && hitR) break;
          if (hitR) { dir = -1; step++; }
          else if (hitL) { if (dir === 1) step++; dir = 1; }
          else { if (dir === 1) step++; dir = -dir; }
          continue;
        }
        const ci = this.idx(probeX, Y);
        if (st.liquid[ci] === 0) { lastDir = dir; lastStep = step; }
        if (dir === -1 && probeX < 5) hitL = true;
        else if (dir === 1 && probeX > st.w - 5) hitR = true;
        const bi = this.idx(probeX, Y + 1);
        // 侧下方同类型未满 → 直接灌入（Liquid.cs:149-159）
        if (st.liquid[bi] !== 0 && st.liquid[bi] !== 255 && st.liquidType[bi] === srcType) {
          let t = 255 - st.liquid[bi];
          if (t > liquid) t = liquid;
          st.liquid[bi] += t;
          liquid -= t;
          if (liquid === 0) break;
        }
        if (Y >= st.h - 5 || st.liquid[bi] !== 0 || this.blocksLiquid(probeX, Y + 1)) {
          // 下方堵住 → 沿行继续 / 折返（Liquid.cs:162-191）
          const aheadX = X + (step + 1) * dir;
          const inRange = aheadX >= 0 && aheadX < st.w;
          const ni = inRange ? this.idx(aheadX, Y) : -1;
          const nAmt = ni >= 0 ? st.liquid[ni] : 0;
          const nSolid = inRange ? this.blocksLiquid(aheadX, Y) : true;
          if ((nAmt !== 0 && (!flag1 || dir !== 1)) || nSolid) {
            if (dir === 1) hitR = true; else hitL = true;
          }
          if (hitL && hitR) break;
          if (hitR) { dir = -1; step++; }
          else if (hitL) { if (dir === 1) step++; dir = 1; }
          else { if (dir === 1) step++; dir = -dir; }
        } else {
          dropped = true;
          break;
        }
      }
      // 落点写回钳制到有效列（防 lastDir/lastStep 记录异常时把液体写出世界）
      X = Math.max(2, Math.min(st.w - 3, X + lastStep * lastDir));
      if (liquid !== 0 && dropped) Y++;
      else break;
    }
    // 3) 写回落点（Liquid.cs:204-205）
    const fi = this.idx(X, Y);
    st.liquid[fi] = liquid;
    st.liquidType[fi] = srcType;
    if (st.liquid[fi] > 0) {
      // 落地即交互（Liquid.cs:206-210 / AttemptToMoveLava/Honey 248-280）
      this.attemptToMoveLiquid(X, Y, srcType, 2);
      this.attemptToMoveLiquid(X, Y, srcType, 3);
    }
  }

  /** 落点与异种液体相邻时触发交互检查（Liquid.cs:248-280 AttemptToMoveLava 同构）。
   *  原版语义：邻居的 target 性 != 落点格的 target 性 才算"异种相遇"——
   *  水落水旁不算，水落岩浆旁才算（否则整片海洋互相当岩浆转黑曜石） */
  private attemptToMoveLiquid(X: number, Y: number, srcType: number, targetType: number) {
    const st = this.world.store;
    const srcIs = srcType === targetType;
    const check = targetType === 2 ? (x: number, y: number) => this.lavaCheck(x, y)
      : (x: number, y: number) => this.honeyCheck(x, y);
    const diff = (x: number, y: number) => {
      const i = this.idx(x, y);
      return st.liquid[i] > 0 && (st.liquidType[i] === targetType) !== srcIs;
    };
    if (diff(X - 1, Y)) { if (srcIs) check(X, Y); else check(X - 1, Y); }
    else if (diff(X + 1, Y)) { if (srcIs) check(X, Y); else check(X + 1, Y); }
    else if (diff(X, Y - 1)) { if (srcIs) check(X, Y); else check(X, Y - 1); }
    else if (diff(X, Y + 1)) { if (srcIs) check(X, Y); else check(X, Y + 1); }
  }

  // ================= WaterCheck（WorldGen.cs:48955-49009） =================

  /** 全图自底向上重建活动列表：能流的/液面不齐的/岩浆旁有异种的都入列 */
  waterCheck() {
    const st = this.world.store;
    this.liquids.length = 0;
    this.numLiquid = 0;
    this.buffer.length = 0; // 原版 WaterCheck 首行清 LiquidBuffer（WorldGen.cs:48959）
    this.checking.fill(0);
    for (let x = 1; x < st.w - 1; x++) {
      for (let y = st.h - 2; y > 0; y--) {
        const i = this.idx(x, y);
        if (st.liquid[i] === 0) continue;
        const t = st.type[i];
        if (t !== 0) {
          const d = TILE_DEFS[t];
          if (d && d.solid && !d.platform) { st.liquid[i] = 0; continue; } // 实心格内液体清零（1456 无 379 系统特例）
          // 1456 WaterCheck L81172-81187：液体冲毁可死亡方块（走 KillTile）
          if (st.liquidType[i] === 2) { if (this.lavaDeathIds.has(t)) this.killTile?.(x, y); }
          else if (this.waterDeathIds.has(t)) this.killTile?.(x, y);
        }
        const id = i + st.w;
        const dq = st.liquid[id];
        if (!this.blocksLiquid(x, y + 1) && dq < 255) {
          if (dq > 250) st.liquid[id] = 255;
          else this.addWater(x, y);
        }
        const il = i - 1, ir = i + 1;
        if (!this.blocksLiquid(x - 1, y) && st.liquid[il] !== st.liquid[i]) this.addWater(x, y);
        else if (!this.blocksLiquid(x + 1, y) && st.liquid[ir] !== st.liquid[i]) this.addWater(x, y);
        if (st.liquidType[i] === 2) {
          const iu = i - st.w;
          if ((st.liquid[il] > 0 && st.liquidType[il] !== 2) ||
              (st.liquid[ir] > 0 && st.liquidType[ir] !== 2) ||
              (st.liquid[iu] > 0 && st.liquidType[iu] !== 2) ||
              (dq > 0 && st.liquidType[id] !== 2)) this.addWater(x, y);
        }
      }
    }
  }
}
