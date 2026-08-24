// R20 红蓝对抗回归(电线机关子系统,红队报告 /tmp/recon/red-team-r20.md 定罪项):
//   高1 B7 地雷 210 踩踏死链(hitSwitch case 210 → ExplodeMine)
//   高2 H2 剧毒飞镖陷阱 kind 5(弹 980/伤 30/速 12)
//   高3 D3 液体感应器族分派 + D4 昼夜 On 锁存(TELogicSensor.cs)
//   中5 I13 烟囱 406 三态循环(0→54→108→0)
//   中6 A9 右键 SkipWire 泄漏(running 门)
//   中9 I6 case 130 门 = PreventsActuationUnder 11 型全表 + CanKillTile
//   中10 C4 故障灯 num2==0 概率门 / F5 击退逐型分档
//   中4 C7 PokeLogicGate 放/拆灯重算门
//   低 G5/G8/G9 雕像参数 / I14 蜡烛 646 / E2 半砖传送器判等
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { Wiring } from '../src/world/Wiring';
import { TileStore } from '../src/world/TileStore';
import { attachDevices, deviceTable, switchMB, type DeviceCtx } from '../src/world/wiring/devices';
import { LOGIC_SENSOR_MODE, logicSensorMode, playerAboveSensorState, liquidSensorState, dayNightSensorState } from '../src/world/wiring/logicSensor';
import { TILE_BY_KEY } from '../src/data/tiles';
import { TRAP_SHOT_STYLE, type TrapShotKind } from '../src/entities/Dart';

/** 建 Wiring + 已挂器件表的世界 */
function fresh() {
  const world = new World(80, 80, 7, 'open');
  const w = new Wiring(world.store);
  const ctxBundle = makeCtx();
  attachDevices(w, ctxBundle.ctx);
  return { world, st: world.store, w, ...ctxBundle };
}

function makeCtx() {
  const shots: Array<{ px: number; py: number; vx: number; vy: number; dmg: number; kind: TrapShotKind }> = [];
  const explosions: Array<{ tx: number; ty: number; dmg: number; destroyTiles?: boolean; projId?: number }> = [];
  const spawnedNpc: Array<{ id: number; px: number; py: number }> = [];
  const dropped: Array<{ vid: number; px: number; py: number }> = [];
  const tpPairs: Array<[[number, number], [number, number]]> = [];
  const ctx: DeviceCtx = {
    dropItem: (vid, px, py) => { dropped.push({ vid, px, py }); },
    spawnNpc: (id, px, py) => { spawnedNpc.push({ id, px, py }); return true; },
    mechSpawnOk: () => true,
    itemSpawnOk: () => true,
    shootProjectile: (px, py, vx, vy, dmg, kind) => { shots.push({ px, py, vx, vy, dmg, kind }); },
    countProjectiles: () => 0,
    doorOpen: () => true,
    doorClose: () => true,
    teleportPair: (a, b) => { tpPairs.push([a, b]); },
    relocateTownNpc: () => true,
    explode: (tx, ty, dmg, _r, destroyTiles, projId) => { explosions.push({ tx, ty, dmg, destroyTiles, projId }); },
    toast: () => {},
    sfx: () => {},
    extractinatorPull: () => null,
    dropItemStack: () => {},
    worldSurface: 100,
  };
  return { ctx, shots, explosions, spawnedNpc, dropped, tpPairs };
}

const T137 = TILE_BY_KEY['v_137_traps']!;
const T210 = TILE_BY_KEY['v_210_landmine']!;
const T406 = TILE_BY_KEY['v_406_chimney']!;
const T139 = TILE_BY_KEY['v_139_musicboxes']!;
const T130 = TILE_BY_KEY['v_130_active_stone_block']!;
const T131 = TILE_BY_KEY['v_131_inactivestoneblock'] ?? TILE_BY_KEY['v_130_active_stone_block']!;
const T419 = TILE_BY_KEY['v_419_logicgatelamp']!;
const T420 = TILE_BY_KEY['v_420_logicgate']!;
const T531 = TILE_BY_KEY['v_531_boulderstatue']!;
const T646 = TILE_BY_KEY['v_646_shadow_candle']!;

describe('R20-B7 地雷 210 踩踏死链', () => {
  it('hitSwitch(210) → 清格 + 爆炸 250 伤/不毁地形(Wiring.cs:288-291 ExplodeMine)', () => {
    const { st, w, explosions } = fresh();
    st.setTileSilent(30, 30, T210, 0, 0);
    w.hitSwitch(30, 30);                       // 踩踏路径 Collision.cs:3374 必经此门
    expect(st.type[st.idx(30, 30)]).toBe(0);   // KillTile(noItem)
    expect(explosions).toHaveLength(1);
    expect(explosions[0].dmg).toBe(250);
    expect(explosions[0].destroyTiles).toBe(false);   // 弹 164 不在 ExplodeTiles 表
    expect(explosions[0].projId).toBe(164);
  });
});

describe('R20-H2 剧毒飞镖陷阱 kind 5', () => {
  it('frameY=90(placeStyle 5) → 弹 venomdart/伤 30/速 12(Wiring.cs:1802-1807 case 5)', () => {
    const { st, w, ctx, shots } = fresh();
    st.setTileSilent(30, 30, T137, 18, 90);   // frameX 18=朝右,frameY 90=kind 5
    deviceTable(w, ctx, 137, 30, 30);
    expect(shots).toHaveLength(1);
    expect(shots[0].kind).toBe('venomdart');
    expect(shots[0].dmg).toBe(30);
    expect(shots[0].vx).toBe(12);              // kind5 与飞镖同速 12(:1806 num106=12f)
    // 出生点 = 格中心 + 10×dir(:1791 vector3)
    expect(shots[0].px).toBe(30 * 16 + 8 + 10);
    // 冷却注册(CheckMech 200):冷却中不再发射
    deviceTable(w, ctx, 137, 30, 30);
    expect(shots).toHaveLength(1);
  });
  it('980 已入 StatusNPC 表(Venom 300t,Projectile.cs:11714/:12353 双侧一致)', async () => {
    const table = (await import('../src/data/vanilla-projstatus.json')).default;
    expect(table['980']).toEqual([{ buff: 70, chance: 1, src: 11714, durMin: 300, durMax: 300 }]);
  });
});

describe('R20-D3/D4 液体感应器分派 + 昼夜锁存(TELogicSensor.cs)', () => {
  it('frameY/18 全值分派(FigureCheckType :169-186):54=水/72=岩浆/90=蜜/108=任意液', () => {
    expect(logicSensorMode(0)).toBe(LOGIC_SENSOR_MODE.DAY);
    expect(logicSensorMode(18)).toBe(LOGIC_SENSOR_MODE.NIGHT);
    expect(logicSensorMode(36)).toBe(LOGIC_SENSOR_MODE.PLAYER_ABOVE);
    expect(logicSensorMode(54)).toBe(LOGIC_SENSOR_MODE.WATER);
    expect(logicSensorMode(72)).toBe(LOGIC_SENSOR_MODE.LAVA);
    expect(logicSensorMode(90)).toBe(LOGIC_SENSOR_MODE.HONEY);
    expect(logicSensorMode(108)).toBe(LOGIC_SENSOR_MODE.LIQUID);
  });
  it('水档排除岩浆/蜂蜜/微光;岩浆档拒水;任意液全收(GetState :236-266)', () => {
    const OFF = false;   // 锁存 off → 不触发关断宽限,状态即裸型匹配
    expect(liquidSensorState(200, 1, LOGIC_SENSOR_MODE.WATER, OFF, 0).state).toBe(true);
    expect(liquidSensorState(200, 2, LOGIC_SENSOR_MODE.WATER, OFF, 0).state).toBe(false);
    expect(liquidSensorState(200, 3, LOGIC_SENSOR_MODE.WATER, OFF, 0).state).toBe(false);
    expect(liquidSensorState(200, 4, LOGIC_SENSOR_MODE.WATER, OFF, 0).state).toBe(false);
    expect(liquidSensorState(200, 2, LOGIC_SENSOR_MODE.LAVA, OFF, 0).state).toBe(true);
    expect(liquidSensorState(200, 1, LOGIC_SENSOR_MODE.LAVA, OFF, 0).state).toBe(false);
    expect(liquidSensorState(200, 3, LOGIC_SENSOR_MODE.HONEY, OFF, 0).state).toBe(true);
    expect(liquidSensorState(200, 4, LOGIC_SENSOR_MODE.LIQUID, OFF, 0).state).toBe(true);
    expect(liquidSensorState(0, 1, LOGIC_SENSOR_MODE.LIQUID, OFF, 0).state).toBe(false);
  });
  it('关断宽限 15t(CountedData :247-262):干后首拍仍湿,第 16 拍转干', () => {
    let grace = 0;
    let state = true;
    for (let t = 1; t <= 16; t++) {
      const r = liquidSensorState(0, 1, LOGIC_SENSOR_MODE.WATER, state, grace);
      grace = r.grace;
      state = r.state;
      if (t <= 15) expect(state, `t=${t}`).toBe(true);
      else expect(state, `t=${t}`).toBe(false);
    }
  });
  it('玩家上方判定框 82×162(PlayerAbove :177-186):±3 列/上方 ~10 格均触发', () => {
    const x = 40, y = 50;
    expect(playerAboveSensorState((x - 2) * 16, (y - 5) * 16, 20, 42, x, y)).toBe(true);
    expect(playerAboveSensorState((x + 2) * 16, (y - 9) * 16, 20, 42, x, y)).toBe(true);
    expect(playerAboveSensorState(x * 16, y * 16, 20, 42, x, y)).toBe(true);       // 踩在感应器格
    expect(playerAboveSensorState((x + 6) * 16, (y - 5) * 16, 20, 42, x, y)).toBe(false);  // 太远
    expect(playerAboveSensorState(x * 16, (y + 2) * 16, 20, 42, x, y)).toBe(false);        // 在下方
  });
  it('昼/夜档状态(Day/Night :234-235)', () => {
    expect(dayNightSensorState(LOGIC_SENSOR_MODE.DAY, true)).toBe(true);
    expect(dayNightSensorState(LOGIC_SENSOR_MODE.DAY, false)).toBe(false);
    expect(dayNightSensorState(LOGIC_SENSOR_MODE.NIGHT, false)).toBe(true);
  });
});

describe('R20-I13 烟囱 406 三态循环', () => {
  it('导线翻转 0→54→108→0(Wiring.cs:1071-1091 越阈 -108,曾 54↔108 死循环)', () => {
    const { st, w, ctx } = fresh();
    // 完整 3×3 烟囱(帧 = 列*18 / 行*18),锚 (30,30)
    for (let dx = 0; dx < 3; dx++) {
      for (let dy = 0; dy < 3; dy++) st.setTileSilent(30 + dx, 30 + dy, T406, dx * 18, dy * 18);
    }
    const flip = (x: number, y: number) => deviceTable(w, ctx, 406, x, y);
    flip(30, 30);
    expect(st.frameY[st.idx(30, 30)]).toBe(54);
    flip(31, 31);                              // 从中间格触发(锚折算)
    expect(st.frameY[st.idx(30, 30)]).toBe(108);
    flip(32, 32);
    expect(st.frameY[st.idx(30, 30)]).toBe(0); // 回到关态(曾 54↔108 死循环)
    expect(st.frameX[st.idx(32, 32)]).toBe(36);
  });
});

describe('R20-A9 右键 SkipWire 泄漏(running 门)', () => {
  it('右键 switchMB(running=false) 后,下一次导线信号照常翻转八音盒(WorldGen.cs:51449 门)', () => {
    const { st, w } = fresh();
    st.setTileSilent(30, 30, T139, 0, 0);
    st.setTileSilent(31, 30, T139, 18, 0);
    st.setTileSilent(30, 31, T139, 0, 18);
    st.setTileSilent(31, 31, T139, 18, 18);
    for (let dx = 30; dx <= 31; dx++) {
      for (let dy = 30; dy <= 31; dy++) st.wire[st.idx(dx, dy)] = TileStore.WIRE_RED;
    }
    switchMB(w, 30, 30);                        // 右键路径:running=false → 不得写 skip
    expect(st.frameX[st.idx(30, 30)]).toBe(36); // 翻到开态
    w.tripWire(30, 30, 1, 1);                   // 随后一次真实信号
    expect(st.frameX[st.idx(30, 30)]).toBe(0);  // 泄漏修复:照常翻回(曾 skip 残留吞掉本次)
  });
});

describe('R20-I6 case 130 通电石门(11 型全表 + CanKillTile)', () => {
  it('上方地狱熔炉 77(全表成员、旧 3 型子集漏)→ 不缩;清空 → 缩;未激活宝箱 → 放行', () => {
    const { st, w, ctx } = fresh();
    const T77 = TILE_BY_KEY['v_77_hellforge']!;
    st.setTileSilent(30, 29, T77, 0, 0);
    st.setTileSilent(30, 30, T130, 0, 0);
    deviceTable(w, ctx, 130, 30, 30);
    expect(st.type[st.idx(30, 30)]).toBe(T130);   // 全表拦截(旧子集 {21,88,467} 漏 77 会误缩)
    // 清掉上方 → 缩为 131
    st.setTileSilent(30, 29, 0, 0, 0);
    deviceTable(w, ctx, 130, 30, 30);
    expect(st.type[st.idx(30, 30)]).toBe(T131);
    // 上方未激活(inactive)宝箱 → 原版 !active() 放行,仍可缩
    st.setTileSilent(30, 30, T130, 0, 0);
    st.setTileSilent(30, 29, TILE_BY_KEY['chest']!, 0, 0);
    st.flags[st.idx(30, 29)] = 0;                 // 幽灵残型(active 位清)
    deviceTable(w, ctx, 130, 30, 30);
    expect(st.type[st.idx(30, 30)]).toBe(T131);
  });
});

describe('R20-F5 击退逐型分档(Wiring 各 NewProjectile 实参)', () => {
  it('镖 2 / 炮弹·兔兔 8 / 巨石 10 / 雪球 3.5 / 烟花火箭 7 / 喷泉 2', () => {
    expect(TRAP_SHOT_STYLE.dart.kb).toBe(2);           // :1983 2f
    expect(TRAP_SHOT_STYLE.superdart.kb).toBe(2);
    expect(TRAP_SHOT_STYLE.flame.kb).toBe(2);
    expect(TRAP_SHOT_STYLE.venomdart.kb).toBe(2);      // case5 同支(:1983)
    expect(TRAP_SHOT_STYLE.spear.kb).toBe(2);
    expect(TRAP_SHOT_STYLE.spiky.kb).toBe(2);
    expect(TRAP_SHOT_STYLE.cannonball.kb).toBe(8);     // :1317 knockBack=8f
    expect(TRAP_SHOT_STYLE.bunny.kb).toBe(8);          // :1326 knockBack=8f
    expect(TRAP_SHOT_STYLE.boulder.kb).toBe(10);       // :2010/:WorldGen 49180 10f
    expect(TRAP_SHOT_STYLE.snowball.kb).toBe(3.5);     // :1399 knockBack2=3.5f
    expect(TRAP_SHOT_STYLE.geyser.kb).toBe(2);         // :3128 2f
    expect(TRAP_SHOT_STYLE.fireworkRocket.kb).toBe(7); // WorldGen.cs:62672 num3=7
    expect(TRAP_SHOT_STYLE.portalbolt.kb).toBe(0);     // :1271 knockBack 初值 0f
  });
});

describe('R20-C7 PokeLogicGate 放/拆灯重算门', () => {
  it('pokeLogicGate(灯)→ OR 门按灯输出;拆灯后 poke(门格)→ 输出回落', () => {
    const { st, w } = fresh();
    // OR 门(num1=1: out = 亮灯数>0),frameY=18;上方一格灯 frameX=18(亮)
    st.setTileSilent(30, 31, T420, 0, 18);
    st.setTileSilent(30, 30, T419, 18, 0);
    w.pokeLogicGate(30, 30);                    // 放置路径:PokeLogicGate(tileTarget)
    expect(st.frameX[st.idx(30, 31)]).toBe(18); // out=true ≠ 当前 off → 门开
    // 拆灯(KillTile :64432 → PokeLogicGate(i, j+1))
    st.setTileSilent(30, 30, 0, 0, 0);
    w.pokeLogicGate(30, 31);
    expect(st.frameX[st.idx(30, 31)]).toBe(0);  // 无灯 → out=false → 门关
  });
});

describe('R20 低项:雕像参数 / 蜡烛 646 / E2 半砖传送器', () => {
  const T105 = TILE_BY_KEY['v_105_statue']!;
  it('G9 巨石雕像生成 Y = oy*16+28(Wiring.cs:2004-2006 Y+=28f)', () => {
    const { st, w, ctx, shots } = fresh();
    st.setTileSilent(30, 30, T531, 0, 0);
    deviceTable(w, ctx, 531, 30, 30);
    expect(shots).toHaveLength(1);
    expect(shots[0].py).toBe(30 * 16 + 28);
    expect(shots[0].px).toBe(31 * 16);
    expect(shots[0].dmg).toBe(70);
  });
  it('G5 史莱姆王雕像 dy-12(:2393-2404 num143-12)/ G8 炸弹雕像掉落 -20(:2412-2416)', () => {
    const { st, w, ctx, dropped, spawnedNpc } = fresh();
    // style 50(史莱姆王):num79 = frameX/36 + (frameY/54%3)*55 = 50 → frameX=1800
    st.setTileSilent(30, 30, T105, 1800, 0);
    deviceTable(w, ctx, 105, 30, 30);
    expect(spawnedNpc).toHaveLength(1);
    expect(spawnedNpc[0].id).toBe(65);
    expect(spawnedNpc[0].py).toBe((30 + 3) * 16 - 12);   // 曾漏 -12
    // style 17(炸弹雕像):frameX=17*36=612 → 物品雕像,y = py-20(曾 -16)
    st.setTileSilent(40, 40, T105, 612, 0);
    deviceTable(w, ctx, 105, 40, 40);
    expect(dropped).toHaveLength(1);
    expect(dropped[0].vid).toBe(166);
    expect(dropped[0].py).toBe((40 + 3) * 16 - 20);
  });
  it('I14 蜡烛 646 影烛导线翻帧 ±18(:1754-1759 ToggleCandle)', () => {
    const world = new World(80, 80, 7, 'open');
    const w = new Wiring(world.store);
    const { ctx } = makeCtx();
    world.store.setTileSilent(30, 30, T646, 0, 0);
    deviceTable(w, ctx, 646, 30, 30);
    expect(world.store.frameX[world.store.idx(30, 30)]).toBe(18);
    deviceTable(w, ctx, 646, 30, 30);
    expect(world.store.frameX[world.store.idx(30, 30)]).toBe(0);
  });
  it('E2 半砖传送器判等不带偏移(:1567 _teleport[0].Y != j)——同板半砖格不得自配对', () => {
    const { st, w, tpPairs } = fresh();
    const T235 = TILE_BY_KEY['v_235_teleporter']!;
    // 同一块板两格:锚格(30,30) 平 / 次格(31,30) 半砖(tx 同为 30,y 同为 30)
    st.setTileSilent(30, 30, T235, 0, 0);
    st.setTileSilent(31, 30, T235, 18, 0);
    st.half[st.idx(31, 30)] = 1;
    for (let dx = 29; dx <= 31; dx++) st.wire[st.idx(dx, 30)] = TileStore.WIRE_RED;
    // case 235 在 Wiring.hitWireSingle 核心段——种子格自身被 SkipWire(:695-703),
    // 须从相邻信号格传播到达(压板→导线→板的实机路径)。一次 BFS 内:
    //   格(30,30) 捕获 slot0=[30,30];格(31,30) 判等——原版比【未加偏移】的 j
    //   (=30,相等→跳过);旧实现比 y+halfOff(=30.5≠30)→ 误填 slot1 自配对成对
    w.tripWire(29, 30, 1, 1);
    expect(tpPairs.length).toBe(0);             // 单板永不自搬(修复生效)
  });
});
