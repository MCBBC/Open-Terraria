// ★RD 演化域幽灵格批（2026-09-04 蓝队）回归钉：原版演化链大量**故意裸读幽灵残型**
// （active=false 但 type 保留——世界生成 active(false)/KillTile 留型产物），JS 侧曾
// 过度加 active 门。本文件钉十条修复中可纯驱动面的行为：
//   F1 hardUpdateWorld 头门=原版字面 inActive（幽灵源放行、已致动挡）
//      —— WorldGen.cs:70130-70133 `!hardModeWorldUpdates || Main.tile[i,j].inActive()`
//   F2 蔓延目标格裸读（幽灵目标掷骰续走、写面落空）—— cs:70319-70431 三臂 + 写门
//      Convert_ActuallyConvertTile cs:56788
//   F4 地下采样非活性格走 GrowWeb（墙62+无液）—— cs:74422-74429 / GrowWeb cs:74682-74694
//   F5 幽灵树苗不长树不清格 —— AttemptToGrowTreeFromSapling 头 active() cs:73395-73397
//   F6 矿车轨道探针/取景/连帧 type==314 裸读 —— Minecart.cs:1250/:1204/:1174
//      （行车带门 isTrackCell=nactive 不动）
//   F8 PlaceTight 门=!anyShimmer && (!active || type!=231) —— cs:38696-38708
//   F10 kill() 头门=!active() 即返（KillTile cs:64043）——幽灵残型不可被 kill
import { describe, it, expect, afterEach, vi } from 'vitest';
import { WorldEvolution, type EvolutionHost } from '../src/world/evolution/WorldEvolution';
import { RNG } from '../src/core/rng';
import { TileStore } from '../src/world/TileStore';
import { TILE_BY_KEY, TILE_DEFS, T } from '../src/data/tiles';
import { Game } from '../src/core/Game';
import { World } from '../src/world/World';
import {
  onTrack, getOnTrack, nearbyMask, isTrackCell, TRACK_TILE,
} from '../src/world/MinecartTrack';

// ---- sheet id → 内部 tile id（同 evolution-rng-seed-stream.test.ts 约定） ----
const SID = new Map<number, number>();
for (let id = 0; id < TILE_DEFS.length; id++) {
  const sh = TILE_DEFS[id]?.vanilla?.sheet;
  if (sh != null && !SID.has(sh)) SID.set(sh, id);
}
const S = (sheet: number): number => SID.get(sheet) ?? 0;

/** 幽灵残型格：flags=0、type 保留（TileStore.deactivateTile 语义的手写等价） */
function ghost(st: TileStore, x: number, y: number, sheet: number): void {
  st.type[st.idx(x, y)] = S(sheet);
  st.flags[st.idx(x, y)] = 0;
  st.frameX[st.idx(x, y)] = 0;
  st.frameY[st.idx(x, y)] = 0;
}
function setActuated(st: TileStore, x: number, y: number): void {
  st.wire[st.idx(x, y)] |= TileStore.WIRE_ACTUATED;    // 原版 inActive()=wire bit5
}

function makeEvo(st: TileStore, seed = 20260904, hardMode = true): WorldEvolution {
  const host: EvolutionHost = {
    store: st,
    seed,
    worldSurface: 0,        // 抬高叶绿/水晶深度带门槛 → 直调面只跑蔓延臂（见各用例）
    rockLevel: 500,
    dungeonX: 600, difficulty: 0,
    flags: hardMode ? { hardMode: true } : {},
    crimson: false, isDay: true, raining: false,
    maxRaining: 0, windSpeedCurrent: 0, playerTile: () => null,
  };
  return new WorldEvolution(host);
}
/** hardUpdateWorld/undergroundTile/placeTight/kill 为 TS private——直调（测试桥） */
type Privates = {
  hardMode: boolean;
  hardUpdateWorld(i: number, j: number): void;
  undergroundTile(i: number, j: number, wallDist: number): void;
  placeTight(x: number, y: number): void;
  kill(x: number, y: number): void;
};
const priv = (evo: WorldEvolution, hardMode = true): Privates => {
  const p = evo as unknown as Privates;
  p.hardMode = hardMode;                                // update() 才置位;直调前手动打开
  return p;
};

/** 蔓延流观察（core/rng.ts __swOnRoll 观察钩：观测不消费）——同 W1 测试 */
function captureRolls(evo: WorldEvolution, fn: () => void): number[] {
  const stream = (evo as unknown as { spreadRng: RNG }).spreadRng.vanilla;
  const out: number[] = [];
  const g = globalThis as { __swOnRoll?: (v: number, inst: object) => void };
  const prev = g.__swOnRoll;
  g.__swOnRoll = (v, inst) => { if (inst === stream) out.push(v); };
  try { fn(); } finally { g.__swOnRoll = prev; }
  return out;
}

afterEach(() => {
  const g = globalThis as { __swOnRoll?: unknown };
  delete g.__swOnRoll;
  vi.restoreAllMocks();
});

describe('RD-F1：hardUpdateWorld 头门=inActive 字面（幽灵源放行/已致动挡）', () => {
  it('幽灵黑檀石残型仍是蔓延源：±3 内活性石块被腐化转 25', () => {
    const st = new TileStore(80, 80);
    st.setTileSilent(41, 40, S(1));                     // 活性石（ALLOW[1] 目标）
    ghost(st, 40, 40, 25);                              // 幽灵黑檀石源
    const evo = priv(makeEvo(st));
    let converted = false;
    for (let n = 0; n < 600 && !converted; n++) {
      evo.hardUpdateWorld(40, 40);
      converted = st.flags[st.idx(41, 40)] === 1 && st.type[st.idx(41, 40)] === S(25);
    }
    expect(converted).toBe(true);                       // 幽灵源驱动蔓延（旧 active 门整吞）
    expect(st.flags[st.idx(40, 40)]).toBe(0);           // 幽灵源本身不被写（残型保域）
    expect(st.type[st.idx(40, 40)]).toBe(S(25));
  });

  it('已致动黑檀石不蔓延（头门只挡致动=inActive 语义）', () => {
    const st = new TileStore(80, 80);
    st.setTileSilent(41, 40, S(1));
    st.setTileSilent(40, 40, S(25));
    setActuated(st, 40, 40);                            // inActive()=true → 头门即返
    const evo = priv(makeEvo(st));
    for (let n = 0; n < 600; n++) evo.hardUpdateWorld(40, 40);
    expect(st.type[st.idx(41, 40)]).toBe(S(1));         // 石块原样（致动源不蔓延）
  });
});

describe('RD-F2：蔓延目标格裸读——幽灵目标掷骰续走、写面落空', () => {
  it('全窗口幽灵石目标：Next(2) 链骰照掷（流面），Convert 写面零落', () => {
    const st = new TileStore(80, 80);
    st.setTileSilent(40, 40, S(25));                    // 活性腐化源
    for (let dx = -3; dx <= 3; dx++) {
      for (let dy = -3; dy <= 3; dy++) {
        if (dx === 0 && dy === 0) continue;
        ghost(st, 40 + dx, 40 + dy, 1);                 // 全窗幽灵石（ALLOW[1] 目标）
      }
    }
    const raw = makeEvo(st);
    const evo = priv(raw);
    const rolls = captureRolls(raw, () => evo.hardUpdateWorld(40, 40));
    // 每轮命中可转目标消费 3 掷（±3 x/y + Next(2) 链骰）——幽灵目标若被 active 门
    // 吞掉则 rolls.length === 0（旧相）
    expect(rolls.length).toBeGreaterThanOrEqual(3);
    // 写面落空：所有幽灵目标残型原样（Convert_ActuallyConvertTile active 门）
    for (let dx = -3; dx <= 3; dx++) {
      for (let dy = -3; dy <= 3; dy++) {
        if (dx === 0 && dy === 0) continue;
        expect(st.flags[st.idx(40 + dx, 40 + dy)]).toBe(0);
        expect(st.type[st.idx(40 + dx, 40 + dy)]).toBe(S(1));
      }
    }
  });
});

describe('RD-F4：地下采样非活性格（含幽灵）走 GrowWeb', () => {
  it('幽灵残型+蛛墙62+无液 → 1/10 掷后长出蛛网（原版 else 支）', () => {
    const st = new TileStore(80, 80);
    st.setTileSilent(42, 41, S(1));                     // 邻域实心（GrowWeb SolidTile 门）
    ghost(st, 40, 40, 1);
    st.wall[st.idx(40, 40)] = 62;                       // 蛛网墙
    const evo = priv(makeEvo(st));
    let webbed = false;
    for (let n = 0; n < 200 && !webbed; n++) {
      evo.undergroundTile(40, 40, 3);
      webbed = st.flags[st.idx(40, 40)] === 1 && st.type[st.idx(40, 40)] === S(51);
    }
    expect(webbed).toBe(true);                          // 幽灵格照样长蛛网（旧 active 早退整吞）
  });

  it('已致动格掷而不落（GrowWeb 内 !active() 门）：不生蛛网', () => {
    const st = new TileStore(80, 80);
    st.setTileSilent(42, 41, S(1));
    st.setTileSilent(40, 40, S(1));
    st.wall[st.idx(40, 40)] = 62;
    setActuated(st, 40, 40);
    const evo = priv(makeEvo(st));
    for (let n = 0; n < 200; n++) evo.undergroundTile(40, 40, 3);
    expect(st.type[st.idx(40, 40)]).toBe(S(1));         // 致动格不留蛛网
  });
});

describe('RD-F5：幽灵树苗不长树不清格（AttemptToGrowTreeFromSapling 头 active()）', () => {
  /** 40×60 迷你世界：groundLevel=21，(x,19)=草三列供成树基座 */
  function mkGameWorld(): { w: World; st: TileStore } {
    const w = new World(40, 60, 7, 'rd-ghost-sapling');
    const st = w.store;
    for (let x = 17; x < 24; x++) {
      st.setTileSilent(x, 19, S(2));                    // 草皮
      st.setTileSilent(x, 20, S(0));                    // 泥
    }
    w.groundLevel = 21;
    return { w, st };
  }
  function gameShell(w: World): Game {
    const g = Object.create(Game.prototype) as unknown as Record<string, unknown>;
    g.world = w;
    g.tickCount = 0;
    g.chunks = { markDirtyArea: () => {} };
    g.sfx = { play: () => {} };
    g.spawnParticles = () => {};
    g.player = { cx: -9999, cy: -9999 };                // treeGrowFX PlayerLOS 早退
    g.camera = { viewW: 0, viewH: 0 };
    return g as unknown as Game;
  }

  it('活性苗在同等地形成树（对照：测试面有生长能力）', () => {
    const { w } = mkGameWorld();
    const st = w.store;
    st.setTile(20, 18, T.SAPLING, 0, 0);                // 活性树苗（sheet 20）
    const g = gameShell(w);
    vi.spyOn(Math, 'random').mockReturnValue(0);        // 全概率门放行（含 RNG 种子=0）
    (g as unknown as { growSaplings(): void }).growSaplings();
    expect(st.type[st.idx(20, 18)]).not.toBe(T.SAPLING); // 苗位已被树干吃掉=生长成立
  });

  it('幽灵苗（flags=0,type=20/590）全部概率放行下仍不长树不清格', () => {
    const { w } = mkGameWorld();
    const st = w.store;
    ghost(st, 20, 18, 20);                              // 幽灵普通苗（同对照地形）
    ghost(st, 30, 30, 590);                             // 幽灵宝石苗（地下带）
    const g = gameShell(w);
    vi.spyOn(Math, 'random').mockReturnValue(0);
    (g as unknown as { growSaplings(): void }).growSaplings();
    expect(st.flags[st.idx(20, 18)]).toBe(0);           // 不复活
    expect(st.type[st.idx(20, 18)]).toBe(S(20));        // 不长树不清格
    expect(st.flags[st.idx(30, 30)]).toBe(0);
    expect(st.type[st.idx(30, 30)]).toBe(S(590));
  });
});

describe('RD-F6：矿车轨道探针/取景/连帧 type==314 裸读（Minecart.cs:1250/:1204/:1174）', () => {
  it('onTrack/getOnTrack/nearbyMask 对幽灵轨道=真（原版裸读）；isTrackCell 行车带门仍 nactive', () => {
    const st = new TileStore(80, 80);
    ghost(st, 40, 40, 314);
    st.frameX[st.idx(40, 40)] = 1;                      // 有效帧（MIDDLE/MIDDLE）
    st.frameY[st.idx(40, 40)] = 0xFFFF;                 // 无后轨
    ghost(st, 41, 40, 314);
    // 锚② onTrack（磁石位落格即认,type 裸读）
    expect(onTrack(st, 636, 610, 10, 10)).toBe(true);
    // 锚③ getOnTrack（右键上轨,type 裸读+帧界防御）
    expect(getOnTrack(st, 40, 40, 636, 610, 10, 10)).not.toBeNull();
    // 锚① nearbyMask（六邻连接掩码,幽灵右邻计入 bit16）
    expect(nearbyMask(st, 40, 40) & 16).toBe(16);
    // 行车带门不随本批放开：isTrackCell（nactive）对幽灵仍 false
    expect(isTrackCell(st, st.idx(40, 40))).toBe(false);
    // 对照：活性轨道全真
    st.setTile(40, 40, TRACK_TILE, 1, 0xFFFF);
    expect(isTrackCell(st, st.idx(40, 40))).toBe(true);
    expect(getOnTrack(st, 40, 40, 636, 610, 10, 10)).not.toBeNull();
  });

  it('非轨道格 onTrack=false（inBounds=null 判等价）', () => {
    const st = new TileStore(80, 80);
    expect(onTrack(st, 636, 610, 10, 10)).toBe(false);
  });
});

describe('RD-F8：PlaceTight 门=!anyShimmer && (!active || type!=231)', () => {
  it('幽灵大瓶 231 残型照样落钟乳石（或语义）；活性 231 拒', () => {
    const st = new TileStore(80, 80);
    st.setTileSilent(40, 39, S(1));                     // 锚=上方实心
    ghost(st, 40, 40, 231);                             // 幽灵大瓶残型
    const evo = priv(makeEvo(st));
    evo.placeTight(40, 40);
    expect(st.flags[st.idx(40, 40)]).toBe(1);           // 幽灵 231 被覆写为钟乳石
    expect(st.type[st.idx(40, 40)]).toBe(S(165));
    // 活性 231：门第二支拒
    st.setTile(41, 40, S(231), 0, 0);
    const before = st.type[st.idx(41, 40)];
    evo.placeTight(41, 40);
    expect(st.type[st.idx(41, 40)]).toBe(before);       // 活性大瓶不动
  });
});

describe('RD-F10：kill() 头门=!active()（KillTile cs:64043）', () => {
  it('幽灵残型不可被 kill；活性格照杀', () => {
    const st = new TileStore(80, 80);
    ghost(st, 40, 40, 1);
    st.setTileSilent(41, 40, S(1));
    const evo = priv(makeEvo(st));
    evo.kill(40, 40);
    expect(st.flags[st.idx(40, 40)]).toBe(0);           // 残型保域：不清型
    expect(st.type[st.idx(40, 40)]).toBe(S(1));
    evo.kill(41, 40);
    expect(st.flags[st.idx(41, 40)]).toBe(0);           // 活性格正常清除
    expect(st.type[st.idx(41, 40)]).toBe(0);
  });
});
