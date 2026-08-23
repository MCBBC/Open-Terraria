// 运行时遗留两件清偿（2026-08-23,标杆 ../Terarria1456;1457 同构已核）：
//  A. kind4 长矛陷阱方向表修正（devices.ts fireTrap kind===4）——旧现形
//     {0左/1右/2上/3下}+偏移10 系误转录;三版活跃分支（1456 Wiring.cs:1859-1888 ≡
//     1457 :1859-1885 ≡ 1405 :1601-1634）均为 frameX/18 {0,1}下(+1)/2上(−1)/
//     3左(−1)/4右(+1)+出生偏移 18×dir（:1888）+速 8（:1884-1885）+伤 60（:1886）+
//     弹 186（:1887）+CheckMech 90（:1860）。
//  B. '无物'组剩余资源掉落 8 def（⚠️4 接档二批;488 木头/186 钱币带先例同域）——
//     647/648/651/652/694/702/704/705 全在 KillTile 共享 no-drop 表
//     （WorldGen.cs:66108-66129 case … break）→ 无放置物品返还,掉落全走 Check*
//     帧检分支资源直掉：
//       647 Check3x2 case 647 :49573-49617（列号分档,<13/<16 同掉 3）
//       648 Check3x2 case 648 :49618-49675（num6+=num3*35,12 档）
//       651 Check3x2 case 651 :49679-49688（列号三档）
//       652 Check2x2 case 652 :48705-48708（num7=fx/36,同 651 三档）
//       694 CheckStalactiteEcho :38940 → GetStalactiteEchoDrop :38947-39003（13 档）
//       702 CheckJunglePlant case 702 :48037-48040（恒掉 1291）
//       704 Check3x2 case 704 :49564-49566（恒掉 501）
//       705 Check3x2 case 705 :49458-49465（num6+=num3*9,四档三元链）
//     帧几何:Check3x2 列号 num6=frameX/54、变体行 num3=frameY/36（:49203-49213,
//     行内帧 frameY=num3*36+row*18）;Check2x2 652 特例列号 num7=frameX/36（:48434-48440）。
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { TILE_BY_KEY } from '../src/data/tiles';
import { Wiring } from '../src/world/Wiring';
import { deviceTable, type DeviceCtx } from '../src/world/wiring/devices';
import {
  echoResourceDropVid, styleDropVidOfFrames, coinBandVid,
} from '../src/data/vanillaStyleDrops';
import { VANILLA_ITEM_KEY_BY_ID } from '../src/data/items';
import { Game } from '../src/core/Game';

// ============ A. kind4 长矛方向表（Wiring.cs:1859-1888 case 4） ============
const TRAP = TILE_BY_KEY['v_137_traps']!;
interface Shot { x: number; y: number; vx: number; vy: number; dmg: number; kind: string }
function trapCtx(shots: Shot[]): DeviceCtx {
  return {
    dropItem: () => {}, spawnNpc: () => true, mechSpawnOk: () => true, itemSpawnOk: () => true,
    shootProjectile: (px, py, vx, vy, damage, kind) => { shots.push({ x: px, y: py, vx, vy, dmg: damage, kind }); },
    countProjectiles: () => 0,
    doorOpen: () => true, doorClose: () => true, teleportPair: () => {},
    relocateTownNpc: () => true, explode: () => {}, toast: () => {}, sfx: () => {},
    extractinatorPull: () => null, dropItemStack: () => {},
    worldSurface: 100,
  };
}
/** 单发 harness:每次新 Wiring（checkMech 冷却表在实例态） */
function fireSpear(frameX: number, frameY = 72): Shot[] {
  const world = new World(80, 80, 7, 'open');
  const w = new Wiring(world.store);
  w.st.setTileSilent(40, 40, TRAP, frameX, frameY);
  const shots: Shot[] = [];
  deviceTable(w, trapCtx(shots), 137, 40, 40);
  return shots;
}

describe('kind4 长矛四向定向（1456 Wiring.cs:1859-1888;1457 :1859-1885 ≡ 1405 :1601-1634）', () => {
  it('frameX/18 {0,1}下(+1)/2上(−1)/3左(−1)/4右(+1),速 8、出生偏移 18、伤 60、弹签 spear(186)', () => {
    const cases = [
      { fx: 0, vx: 0, vy: 8, ox: 0, oy: 18 },     // case 0 = 下
      { fx: 18, vx: 0, vy: 8, ox: 0, oy: 18 },    // case 1 = 下（与 case 0 同向）
      { fx: 36, vx: 0, vy: -8, ox: 0, oy: -18 },  // case 2 = 上
      { fx: 54, vx: -8, vy: 0, ox: -18, oy: 0 },  // case 3 = 左
      { fx: 72, vx: 8, vy: 0, ox: 18, oy: 0 },    // case 4 = 右
    ];
    for (const c of cases) {
      const shots = fireSpear(c.fx);
      expect(shots.length, `frameX=${c.fx}`).toBe(1);
      const s = shots[0]!;
      expect(s.kind).toBe('spear');              // 弹签渲染 Projectile_186（Dart.ts:58/:141）
      expect(s.dmg).toBe(60);                    // :1886
      expect(s.x).toBe(40 * 16 + 8 + c.ox);      // :1888 出生偏移 18×dir
      expect(s.y).toBe(40 * 16 + 8 + c.oy);
      expect(s.vx).toBe(c.vx);                   // :1884 速 8×dir
      expect(s.vy).toBe(c.vy);
    }
  });

  it('CheckMech 90 冷却门（:1860）：同格 90t 内第二击不发射', () => {
    const world = new World(80, 80, 7, 'open');
    const w = new Wiring(world.store);
    w.st.setTileSilent(40, 40, TRAP, 72, 72);    // case 4 = 右
    const shots: Shot[] = [];
    const ctx = trapCtx(shots);
    expect(deviceTable(w, ctx, 137, 40, 40)).toBe(true);
    expect(shots.length).toBe(1);
    deviceTable(w, ctx, 137, 40, 40);            // 冷却内
    expect(shots.length).toBe(1);
  });

  it('kind 门不回归：frameY 54（kind 3 尖刺球）仍走 spiky,frameY 0（kind 0 飞镖）仍走 dart', () => {
    expect(fireSpear(0, 54)[0]!.kind).toBe('spiky');
    expect(fireSpear(0, 0)[0]!.kind).toBe('dart');
  });
});

// ============ B. Echo 资源组 8 def 帧段→掉落对拍（纯函数） ============
describe('echoResourceDropVid 帧段直查（⚠️4 接档二批,1456 WorldGen.cs 逐 case）', () => {
  it('647 大石堆 Echo（:49573-49617 列号分档）:154/3/71/72/73/9/593/183,≥35 无,行不敏感', () => {
    const bands: Array<[number, number]> = [   // [列号 s, vid]——s=fx/54
      [0, 154], [6, 154], [7, 3], [15, 3],     // <13/<16 两支同 3（:49580-49587）
      [16, 71], [17, 71], [18, 72], [20, 73], [22, 9], [26, 593], [32, 183],
    ];
    for (const [s, vid] of bands) {
      expect(echoResourceDropVid(647, s * 54, 0), `s=${s}`).toBe(vid);
    }
    expect(echoResourceDropVid(647, 35 * 54, 0)).toBe(0);    // num13=0 不发（:49612 门）
    expect(echoResourceDropVid(647, 0, 36)).toBe(154);       // case 647 无 num3 行乘
    expect(echoResourceDropVid(647, 0, 54)).toBe(154);
  });

  it('648 大石堆 Echo·二（:49618-49675 num6+=num3*35 12 档）', () => {
    const bands: Array<[number, number]> = [   // [s=fx/54, vid]（fy=0 行）
      [0, 195], [5, 195], [6, 174], [9, 150], [14, 3], [17, 989], [18, 1101],
      [21, 9], [29, 3271], [35, 3086], [41, 3081], [47, 62], [52, 154],
    ];
    for (const [s, vid] of bands) {
      expect(echoResourceDropVid(648, s * 54, 0), `s=${s}`).toBe(vid);
    }
    expect(echoResourceDropVid(648, 55 * 54, 0)).toBe(0);    // num14=0 不发（:49670 门）
    // 行乘:num3=fy/36（变体行）→ s+=35/行（顶行 195 档 ↔ 变体行 1 同列落 3086 档）
    expect(echoResourceDropVid(648, 0, 36)).toBe(3086);      // s=35
    expect(echoResourceDropVid(648, 0, 54)).toBe(3086);      // 底行 num3 同 1
    expect(echoResourceDropVid(648, 0, 72)).toBe(0);         // s=70 越表
  });

  it('651 植物碎屑 3x2 Echo（:49679-49688 列号三档）与 652 2x2 Echo（:48705-48708 fx/36 同式）', () => {
    expect(echoResourceDropVid(651, 0, 0)).toBe(195);
    expect(echoResourceDropVid(651, 2 * 54, 0)).toBe(195);   // s=2 带尾
    expect(echoResourceDropVid(651, 3 * 54, 0)).toBe(62);    // s=3
    expect(echoResourceDropVid(651, 5 * 54, 0)).toBe(62);    // s=5 带尾
    expect(echoResourceDropVid(651, 6 * 54, 0)).toBe(331);   // s=6
    expect(echoResourceDropVid(651, 30 * 54, 0)).toBe(331);  // 越远仍 331（无上界档）
    expect(echoResourceDropVid(652, 0, 0)).toBe(195);
    expect(echoResourceDropVid(652, 2 * 36, 0)).toBe(195);   // s=2 带尾
    expect(echoResourceDropVid(652, 3 * 36, 0)).toBe(62);    // s=3
    expect(echoResourceDropVid(652, 5 * 36, 0)).toBe(62);    // s=5 带尾
    expect(echoResourceDropVid(652, 6 * 36, 0)).toBe(331);   // s=6
    expect(echoResourceDropVid(652, 12 * 36, 0)).toBe(331);
  });

  it('694 钟乳石 1x2 Echo（:38940→GetStalactiteEchoDrop :38947-39003 13 档,style=fx/18）', () => {
    const bands: Array<[number, number]> = [
      [0, 664], [3, 3], [6, 150], [9, 1124], [12, 409], [15, 61], [18, 836],
      [21, 3271], [24, 3086], [27, 3081], [30, 834], [33, 833], [36, 835],
    ];
    for (const [s, vid] of bands) {
      expect(echoResourceDropVid(694, s * 18, 0), `s=${s}`).toBe(vid);
      expect(echoResourceDropVid(694, s * 18 + 17, 0), `s=${s} 带尾`).toBe(vid);
    }
    expect(echoResourceDropVid(694, 39 * 18, 0)).toBe(0);    // ≥39 无档
  });

  it('702 生命果仿品（:48037-48040 恒 1291）与 704 倒木 Echo（:49564-49566 恒 501）', () => {
    for (const fx of [0, 18, 36, 54, 90]) {
      expect(echoResourceDropVid(702, fx, 0)).toBe(1291);
      expect(echoResourceDropVid(702, fx, 18)).toBe(1291);
      expect(echoResourceDropVid(704, fx, 0)).toBe(501);
      expect(echoResourceDropVid(704, fx, 36)).toBe(501);
    }
  });

  it('705 绿洲植物 Echo（:49458-49465 num6+=num3*9 四档三元链）', () => {
    const bands: Array<[number, number]> = [   // [s=fx/54, vid]（fy=0 行）
      [0, 276], [8, 276], [9, 369], [17, 369], [18, 2171], [26, 2171], [27, 59],
    ];
    for (const [s, vid] of bands) {
      expect(echoResourceDropVid(705, s * 54, 0), `s=${s}`).toBe(vid);
    }
    expect(echoResourceDropVid(705, 40 * 54, 0)).toBe(59);   // 三元链 else 支无上界
    // 行乘:num3=fy/36 → s+=9/行
    expect(echoResourceDropVid(705, 0, 36)).toBe(369);       // s=9
    expect(echoResourceDropVid(705, 0, 54)).toBe(369);
    expect(echoResourceDropVid(705, 0, 72)).toBe(2171);      // s=18
    expect(echoResourceDropVid(705, 9 * 54, 72)).toBe(59);   // s=27
  });

  it('非 Echo sheet 恒 0（不侵 21 族 style 表/帧带特例域）+既有通道冒烟', () => {
    for (const sheet of [0, 14, 15, 21, 105, 137, 186, 488, 649, 650, 693, 703, 706]) {
      expect(echoResourceDropVid(sheet, 0, 0), `sheet=${sheet}`).toBe(0);
      expect(echoResourceDropVid(sheet, 900, 36)).toBe(0);
    }
    expect(styleDropVidOfFrames(18, 0, 0)).toBe(36);         // 工作台 style0 不回归
    expect(coinBandVid(900)).toBe(71);
  });
});

// ============ C. 运行时 breakTile 对拍（object 分支 Echo 资源组 else 支） ============
interface Drop { key: string; n: number }
/** breakTile 运行时 harness（multi-tile-drop.test.ts boulderShell 同款;
 *  player={} = 生成/读档门近似） */
function dropShell(w: World, drops: Drop[]) {
  const g = Object.create(Game.prototype) as unknown as Record<string, unknown> & {
    breakTile: (x: number, y: number, byPlayer?: boolean) => void;
    checkFurnitureSupport: (x: number, y: number) => void;
  };
  g.world = w;
  g.chunks = { markDirtyArea: () => {} };
  g.spawnParticles = () => {};
  g.sfx = { play: () => {} };
  g.spawnDrop = (x: number, y: number, key: string, n: number) => { drops.push({ key, n }); return null; };
  g.recLog = () => {};
  g.dumpChest = () => {};
  g.entities = { add: () => {}, drops: [], critters: [], enemies: [] };
  g.trackTile = 0;
  g.player = { equipStats: {}, cx: 0, cy: 0 };
  return g;
}

/** 铺一件 3x2 style 件（原版帧:fx=style*54+col*18 / fy=变体行 num3*36+row*18） */
function place3x2(w: World, key: string, x: number, y: number, style: number, num3 = 0): void {
  const t = TILE_BY_KEY[key]!;
  for (let dx = 0; dx < 3; dx++) for (let dy = 0; dy < 2; dy++) {
    w.store.setTileSilent(x + dx, y + dy, t, style * 54 + dx * 18, num3 * 36 + dy * 18);
  }
}
/** 铺一件 2x2 style 件（652:fx=style*36+col*18 / fy=row*18;702 同形） */
function place2x2(w: World, key: string, x: number, y: number, style: number): void {
  const t = TILE_BY_KEY[key]!;
  for (let dx = 0; dx < 2; dx++) for (let dy = 0; dy < 2; dy++) {
    w.store.setTileSilent(x + dx, y + dy, t, style * 36 + dx * 18, dy * 18);
  }
}

describe('breakTile object 分支 Echo 资源组掉落（挖掉路;无放置物品返还）', () => {
  it('648 3x2：顶行 s=0 → 丛林草种子 195;变体行 1（num3=1）s=35 → 花岗岩 3086', () => {
    const w = new World(60, 40, 7, 'lwd-648');
    const drops: Drop[] = [];
    const g = dropShell(w, drops);
    place3x2(w, 'v_648_large_rubble_3x2_group_2', 10, 10, 0);
    g.breakTile(10, 10, false);
    expect(drops.length).toBe(1);
    expect(drops[0].key).toBe(VANILLA_ITEM_KEY_BY_ID[195]);
    expect(w.store.get(10, 10)).toBe(0);
    expect(w.store.get(12, 11)).toBe(0);            // 整件清
    drops.length = 0;
    place3x2(w, 'v_648_large_rubble_3x2_group_2', 20, 10, 0, 1);   // num3=1 → s=35
    g.breakTile(20, 11, false);                     // 底行格命中
    expect(drops.length).toBe(1);
    expect(drops[0].key).toBe(VANILLA_ITEM_KEY_BY_ID[3086]);
    expect(w.store.get(20, 10)).toBe(0);
  });

  it('694 1x2：fx=162（s=9）→ 蜂巢 1124;702 2x2：恒掉生命果 1291', () => {
    const w = new World(60, 40, 7, 'lwd-694');
    const drops: Drop[] = [];
    const g = dropShell(w, drops);
    const st = w.store;
    st.setTileSilent(10, 10, TILE_BY_KEY['v_694_stalactite_1x2_echo']!, 9 * 18, 0);
    st.setTileSilent(10, 11, TILE_BY_KEY['v_694_stalactite_1x2_echo']!, 9 * 18, 18);
    g.breakTile(10, 10, false);
    expect(drops.length).toBe(1);
    expect(drops[0].key).toBe(VANILLA_ITEM_KEY_BY_ID[1124]);
    drops.length = 0;
    place2x2(w, 'v_702_life_fruit_replica', 20, 10, 1);
    g.breakTile(20, 10, false);
    expect(drops.length).toBe(1);
    expect(drops[0].key).toBe(VANILLA_ITEM_KEY_BY_ID[1291]);
    expect(st.get(21, 11)).toBe(0);
  });

  it('652 2x2：fx=108（s=3）→ 草种子 62;705 3x2 变体行 1（s=9）→ 神圣种子 369', () => {
    const w = new World(60, 40, 7, 'lwd-652');
    const drops: Drop[] = [];
    const g = dropShell(w, drops);
    place2x2(w, 'v_652_medium_rubble_2x2', 10, 10, 3);
    g.breakTile(10, 10, false);
    expect(drops.length).toBe(1);
    expect(drops[0].key).toBe(VANILLA_ITEM_KEY_BY_ID[62]);
    drops.length = 0;
    place3x2(w, 'v_705_oasis_plants_echo', 20, 10, 0, 1);   // num3=1 → s=9
    g.breakTile(20, 11, false);
    expect(drops.length).toBe(1);
    expect(drops[0].key).toBe(VANILLA_ITEM_KEY_BY_ID[369]);
  });

  it('704 倒木 Echo 3x2：恒掉仙尘 501;647 3x2：s=0 → 骨块 154', () => {
    const w = new World(60, 40, 7, 'lwd-704');
    const drops: Drop[] = [];
    const g = dropShell(w, drops);
    place3x2(w, 'v_704_fallen_log_echo', 10, 10, 2);
    g.breakTile(10, 10, false);
    expect(drops.length).toBe(1);
    expect(drops[0].key).toBe(VANILLA_ITEM_KEY_BY_ID[501]);
    drops.length = 0;
    place3x2(w, 'v_647_large_rubble_3x2', 20, 10, 0);
    g.breakTile(20, 10, false);
    expect(drops.length).toBe(1);
    expect(drops[0].key).toBe(VANILLA_ITEM_KEY_BY_ID[154]);
  });

  it('651 3x2：fx=324（s=6）→ 丛林孢子 331;帧段无档（647 s=35）不掉亦不还 Rubblemaker', () => {
    const w = new World(60, 40, 7, 'lwd-651');
    const drops: Drop[] = [];
    const g = dropShell(w, drops);
    place3x2(w, 'v_651_large_rubble_3x2_group_3', 10, 10, 6);
    g.breakTile(10, 10, false);
    expect(drops.length).toBe(1);
    expect(drops[0].key).toBe(VANILLA_ITEM_KEY_BY_ID[331]);
    drops.length = 0;
    place3x2(w, 'v_647_large_rubble_3x2', 20, 10, 35);
    g.breakTile(20, 10, false);
    expect(drops.length).toBe(0);   // num13=0 不发（:49612 门）
    expect(w.store.get(20, 10)).toBe(0);
  });

  it('648 底掏空 → 悬空保留（1457 勘误：case 组 :86841 break→goto case 14 :87239→Check3x2 对 648 【仅】完整性无支撑行;Echo 掉落只在挖掉路）', () => {
    const w = new World(60, 40, 7, 'lwd-sup');
    const drops: Drop[] = [];
    const g = dropShell(w, drops);
    place3x2(w, 'v_648_large_rubble_3x2_group_2', 10, 10, 0);
    for (let dx = 0; dx < 3; dx++) w.store.setTileSilent(10 + dx, 12, 1, 0, 0);   // 临时土撑
    for (let dx = 0; dx < 3; dx++) w.store.setTileSilent(10 + dx, 12, 0, 0, 0);   // 掏空
    g.checkFurnitureSupport(10, 11);   // onTileChanged (x, y-1) 注册语义
    // 1457 TileFrameImportant：647/648/651 在 :86830-86846 no-op break 组,闭合后
    // goto case 14（:87239）→ Check3x2（:49617）——支撑行判据列表（:49700-49716）
    // 与内层 switch（:49717-49790）均不含 648 → 仅完整性校验,支撑掏空不塌不掉
    //（旧断言"失撑同掉 195"系家具 hasSupport 近似期行为,2026-08-23 派发全量对照勘误）
    const RUB648 = TILE_BY_KEY['v_648_large_rubble_3x2_group_2']!;
    expect(w.store.get(10, 10)).toBe(RUB648);   // 整件保留
    expect(w.store.get(12, 11)).toBe(RUB648);
    expect(drops.length).toBe(0);
    // 挖掉路（breakTile object 支）Echo 帧段掉落不受影响（上方 651/647 it 已对拍）
  });
});
