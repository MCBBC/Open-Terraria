// R12 批备案三件放置/世界生成帧债清偿回归（docs/audit/item-audit-2026-08-22.md
// ⚠️3 段末"备案未改（后续批）"①②③；标杆=../Terarria1456/）：
//   ① 灯族 93 放置帧：furnitureStyleBase [0,style*110]→[0,style*54]+足迹 1×6→1×3
//      +掉落表联动（vanillaStyleDrops Lamps 65 档）——定谳=备案属实
//      （Place1xX cs:39203-39226 / Check1xX :37802-37819 / TileObjectData.cs:2394-2419
//      Style1xX / Wiring.ToggleLamp :2954-2975 / TileDrawing.cs:6518-6522 wrap1998）
//   ② CaveHousePass.placeFurniture Place2x2 分支带向：frameX=style*36→frameY=style*num
//      （Place2x2 cs:51433-51443 `frameX=k*18, frameY=style*num+l*18`，num=36/172=38）
//      ——现调用面仅 keg(94) style=0 → 新旧写法字节等价（本文件 B 段直证）
//   ③ TNT 桶 654：电线不致动定谳=属实不改码（Wiring.cs 器件表无 case 654）;
//      ★破坏侧勘误（❌1 复核 2026-08-23）：前判"Check2x2 case 654 不可达死码"系漏看
//      goto——no-op break 组（:86409-86428）闭合后 goto case 132（:86670）→ Check2x2
//      （:86688）→ 失撑即 NewProjectile(1002,400)（:48771-48772）——C 段锁
//      "无致动 + 挖/毁=整件清+1002 爆炸+无掉落"
import { describe, expect, it } from 'vitest';
import { World } from '../src/world/World';
import { Game } from '../src/core/Game';
import { RNG } from '../src/core/rng';
import { TILE_BY_KEY, TILE_DEFS } from '../src/data/tiles';
import { furnitureStyleBase, framedCellFrame } from '../src/world/FurnitureStyle';
import { styleDropVid, styleDropVidOfFrames, styleFromFrame } from '../src/data/vanillaStyleDrops';
import { VANILLA_ITEM_KEY_BY_ID } from '../src/data/items';
import { specialTileLight } from '../src/lighting/TileLightScanner';
import { FlickerClock } from '../src/lighting/SkyColor';
import { Wiring } from '../src/world/Wiring';
import { deviceTable, type DeviceCtx } from '../src/world/wiring/devices';
import { placeFurniture } from '../src/world/gen/vanilla/CaveHousePass';

const keyOf = (k: string) => TILE_BY_KEY[k]!;
const idOfSheet = (s: number) => {
  const id = TILE_DEFS.findIndex((d) => d?.vanilla?.sheet === s);
  expect(id, `sheet ${s} 应有 def`).toBeGreaterThan(0);
  return id;
};

// ============ A. 灯族 93：帧带 54 / 足迹 1×3 / 掉落联动（定谳=备案①属实） ============
describe('93 灯族放置帧（Place1xX cs:39203-39226：frameY=j*18+style*54，1×3）', () => {
  it('furnitureStyleBase 两档带距=54：style0→[0,0] / 1→[0,54] / 2→[0,108]（曾 110 空带误读）', () => {
    expect(furnitureStyleBase(93, 0, 1)).toEqual([0, 0]);
    expect(furnitureStyleBase(93, 1, 1)).toEqual([0, 54]);
    expect(furnitureStyleBase(93, 2, 1)).toEqual([0, 108]);
  });

  it('存储帧=raw 不预折：style37→[0,1998] / style64→[0,3456]（越 2048 表底由渲染端折列）', () => {
    // TileDrawing.cs:6518-6522 `num70=frameY/1998 → addFrY-=1998*n, addFrX+=36*n`；
    // 预折进 frameX 会破坏亮灭 X 0/18 门（ToggleLamp :2954-2975/specialTileLight case 93）
    expect(furnitureStyleBase(93, 37, 1)).toEqual([0, 1998]);
    expect(furnitureStyleBase(93, 64, 1)).toEqual([0, 3456]);
  });

  it('framedCellFrame 逐行：1×3 三行 fy=style*54+dy*18、fx 恒 0（Place1xX cs:39226）', () => {
    for (const s of [0, 1, 17, 37, 64]) {
      expect(framedCellFrame(93, 1, s, 0, 0)).toEqual([0, s * 54]);
      expect(framedCellFrame(93, 1, s, 0, 1)).toEqual([0, s * 54 + 18]);
      expect(framedCellFrame(93, 1, s, 0, 2)).toEqual([0, s * 54 + 36]);
    }
  });

  it('足迹 1×3（TileObjectData.cs:2394-2419 Style1xX Height=3；92 路灯柱才 1×6）', () => {
    const def = TILE_DEFS[keyOf('v_93_lamps')];
    expect(def.w).toBe(1);
    expect(def.h).toBe(3);
    expect(def.vanilla?.fw).toBe(1);
    expect(def.vanilla?.fh).toBe(3);
  });

  it('帧⇄style roundtrip（Check1xX :37814-37819 num=3 → fy/54；亮灭 fx 0/18 不参与）', () => {
    const der = styleFromFrame[93]!;
    for (const s of [0, 1, 36, 37, 64]) {
      for (const dy of [0, 1, 2]) {
        expect(der(0, s * 54 + dy * 18)).toBe(s);
        expect(der(18, s * 54 + dy * 18)).toBe(s);   // 亮档 fx=18
      }
    }
  });

  it('掉落表 GetItemDrop_Lamps（WorldGen.cs:41087-41262）档位：0→342/1-10→2082+/11-16→2129+/17→2225/37→4219/64→6122', () => {
    expect(styleDropVid(93, 0)).toBe(342);
    expect(styleDropVid(93, 1)).toBe(2082);
    expect(styleDropVid(93, 10)).toBe(2091);
    expect(styleDropVid(93, 11)).toBe(2129);
    expect(styleDropVid(93, 16)).toBe(2134);
    expect(styleDropVid(93, 17)).toBe(2225);
    expect(styleDropVid(93, 37)).toBe(4219);
    expect(styleDropVid(93, 64)).toBe(6122);
    expect(styleDropVid(93, 65)).toBe(342);   // 越界回落 default 档（C# 初值语义）
  });

  it('breakTile 集成：style1 灯 1×3 挖掉 → vi_2082 一件（曾 place_v_ 幽灵/恒 style0）', () => {
    const w = new World(40, 40, 7, 'pfd');
    const drops: Array<{ key: string; n: number }> = [];
    const g = breakShell(w, drops);
    const t = keyOf('v_93_lamps');
    for (let dy = 0; dy < 3; dy++) w.store.setTileSilent(10, 10 + dy, t, 0, 54 + dy * 18);
    g.breakTile(10, 11, false);   // 中格命中（非锚格也整件清）
    expect(drops).toEqual([{ key: VANILLA_ITEM_KEY_BY_ID[2082], n: 1 }]);
    expect(w.store.get(10, 10)).toBe(0);
    expect(w.store.get(10, 12)).toBe(0);
  });

  it('breakTile 集成：style37（fy=1998 折列带）挖掉 → vi_4219（wrap 带下 style 反推不偏）', () => {
    const w = new World(40, 40, 7, 'pfd');
    const drops: Array<{ key: string; n: number }> = [];
    const g = breakShell(w, drops);
    const t = keyOf('v_93_lamps');
    for (let dy = 0; dy < 3; dy++) w.store.setTileSilent(10, 10 + dy, t, 0, 37 * 54 + dy * 18);
    g.breakTile(10, 10, false);
    expect(drops).toEqual([{ key: VANILLA_ITEM_KEY_BY_ID[4219], n: 1 }]);
  });

  it('光照/火苗侧同带对齐：fy/54（specialTileLight case 93 灭档门 fx!==0）', () => {
    const flicker = new FlickerClock();
    // 亮档 style1（LAMP_LIGHT_93[1]=[0.95,0.95,0.5]）；灭档 null；style37 raw 帧（fy=1998）非灭档
    expect(specialTileLight(93, 0, 54, flicker)).toEqual([0.95, 0.95, 0.5]);
    expect(specialTileLight(93, 18, 54, flicker)).toBeNull();
    expect(specialTileLight(93, 0, 37 * 54, flicker)).not.toBeNull();
  });

  it('电线翻转（devices case 93 flipBlock 1×3 fx±18）：raw style40 帧锚点行不偏、整件翻转', () => {
    const { w } = wiringFixture();
    const t = keyOf('v_93_lamps');
    for (let dy = 0; dy < 3; dy++) w.st.setTileSilent(10, 10 + dy, t, 0, 40 * 54 + dy * 18);
    expect(deviceTable(w, makeCtx(), 93, 10, 11)).toBe(true);   // 中格触发
    for (let dy = 0; dy < 3; dy++) {
      const i = w.st.idx(10, 10 + dy);
      expect(w.st.frameX[i]).toBe(18);
      expect(w.st.frameY[i]).toBe(40 * 54 + dy * 18);           // fy 不动
    }
    expect(deviceTable(w, makeCtx(), 93, 10, 10)).toBe(true);   // 顶格回翻
    expect(w.st.frameX[w.st.idx(10, 12)]).toBe(0);
  });
});

// ============ B. CaveHousePass Place2x2 带向（定谳=备案②属实；style0 等价=oracle 不受扰） ============
describe('CaveHousePass.placeFurniture Place2x2（cs:51433-51443 frameX=k*18 / frameY=style*num+l*18）', () => {
  /** 2×2 底承放置 fixture：(x-1,y-1) 起 2×2 空 + (x-1..x, y+1) 实心 */
  function place2x2(w: World, key: string, x: number, y: number, style: number): boolean {
    for (let dx = -1; dx <= 0; dx++) for (let dy = -1; dy <= 0; dy++) w.store.setTileSilent(x + dx, y + dy, 0, 0, 0);
    w.store.setTileSilent(x - 1, y + 1, idOfSheet(1), 0, 0);
    w.store.setTileSilent(x, y + 1, idOfSheet(1), 0, 0);
    // ★签名勘误：placeFurniture 第 2 位是 rng（尘掷流位）——曾按旧签名漏传，
    //   运行时 key=数字 → TILE_BY_KEY[num]=undefined 恒 false（vitest 不做类型检查）
    return placeFurniture(w.store, new RNG(1), key, x, y, style);
  }
  const framesOf = (w: World, x: number, y: number) => {
    const out: Array<[number, number]> = [];
    for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
      const i = w.store.idx(x + dx, y + dy);
      out.push([w.store.frameX[i], w.store.frameY[i]]);
    }
    return out;
  };

  it('keg(94) style0：帧=(dx*18, dy*18)——与旧 frameX=style*36 写法【字节等价】（oracle 哈希不受扰直证）', () => {
    const w = new World(40, 40, 7, 'pfd');
    expect(place2x2(w, 'keg', 12, 10, 0)).toBe(true);
    const frames = framesOf(w, 11, 9);
    expect(frames).toEqual([[0, 0], [18, 0], [0, 18], [18, 18]]);
    // 旧公式 (style*36+dx*18, dy*18) 在 style=0 时逐格相同
    expect(frames).toEqual([[0 * 36 + 0, 0], [0 * 36 + 18, 0], [0 * 36 + 0, 18], [0 * 36 + 18, 18]]);
  });

  it('烛台 100 style2：样式带进 frameY（72+dy*18）、frameX=dx*18——曾写 frameX=72 带向相反', () => {
    const w = new World(40, 40, 7, 'pfd');
    expect(place2x2(w, 'candelabra', 12, 10, 2)).toBe(true);
    expect(framesOf(w, 11, 9)).toEqual([[0, 72], [18, 72], [0, 90], [18, 90]]);
  });

  it('水槽 172 style3：num=38 带距（cs:51433 `(type==172)?38:36`）→ frameY=114+dy*18', () => {
    const w = new World(40, 40, 7, 'pfd');
    expect(place2x2(w, 'v_172_sinks', 12, 10, 3)).toBe(true);
    expect(framesOf(w, 11, 9)).toEqual([[0, 114], [18, 114], [0, 132], [18, 132]]);
  });

  it('放置侧⇄帧检侧互逆：Check2x2 num5=fy/36（:48405 区）/172 fy/38——放置帧反推回原 style', () => {
    for (const [sheet, num, key] of [[100, 36, 'candelabra'], [172, 38, 'v_172_sinks']] as const) {
      for (const s of [0, 1, 5]) {
        const w = new World(40, 40, 7, 'pfd');
        expect(place2x2(w, key, 12, 10, s)).toBe(true);
        const [fx, fy] = framesOf(w, 11, 9)[0];
        expect(fx).toBe(0);
        expect(Math.floor(fy / num)).toBe(s);
        expect(styleDropVidOfFrames(sheet, fx, fy)).toBe(styleDropVid(sheet, s));
      }
    }
  });
});

// ============ C. TNT 桶 654：电线不致动（原版无器件 case）+ 挖/毁=整件清+1002 爆炸 ============
// Wiring.cs HitWireSingle 器件表（:1012-3229 全 case 清单）确无 case 654——电线不致动
// 语义保留（本段前两测锁负控）。★破坏侧勘误（❌1 复核 2026-08-23）：前判"Check2x2
// case 654 不可达死码"系漏看 goto——TileFrameImportant no-op break 组（:86409-86428,
// 654 在 :86427）switch 闭合后 `goto case 132`（:86670）→ 654 仍进 Check2x2（:86688）
// → 整件失撑/缺件即 Projectile.NewProjectile(1002, 400)（:49178,桶中心
// num2*16+8/num6*16+8）。★SW-BJ102（2026-09-16）归一重锚：挖/毁 TNT 桶=整件清+弹体
// 单发（爆炸面全在弹体首 AI 拍 Kill——格侧旧"等效爆炸面"与 _tntPending 队列退役;
// 殉爆=他因破桶格各链发 1002,详见下方两测的重锚注与 sw-bj102 套件）。
describe('TNT 桶 654（★BJ102：电线无致动 / 破坏=无掉落+1002 弹体单发,格侧零爆炸面）', () => {
  it('deviceTable(654) = false（无 case）+ 帧/格不变 + explode 零调用（对照 case 141 炸药才引爆）', () => {
    const { w } = wiringFixture();
    const t = keyOf('v_654_tnt_barrel');
    for (let dx = 0; dx < 2; dx++) for (let dy = 0; dy < 2; dy++) {
      w.st.setTileSilent(10 + dx, 10 + dy, t, dx * 18, dy * 18);
    }
    const calls: string[] = [];
    const ctx = { ...makeCtx(), explode: () => { calls.push('explode'); } };
    expect(deviceTable(w, ctx, 654, 10, 10)).toBe(false);
    expect(calls).toEqual([]);
    for (let dx = 0; dx < 2; dx++) for (let dy = 0; dy < 2; dy++) {
      const i = w.st.idx(10 + dx, 10 + dy);
      expect(w.st.type[i]).toBe(t);
      expect(w.st.frameX[i]).toBe(dx * 18);
      expect(w.st.frameY[i]).toBe(dy * 18);
    }
  });

  it('hitSwitch 全链负控：HitSwitch（Wiring.cs:163-324 无 654 分支）→ 不 Trip 不致动', () => {
    const { w } = wiringFixture();
    const t = keyOf('v_654_tnt_barrel');
    for (let dx = 0; dx < 2; dx++) for (let dy = 0; dy < 2; dy++) {
      w.st.setTileSilent(10 + dx, 10 + dy, t, dx * 18, dy * 18);
    }
    w.hitSwitch(10, 10);
    expect(w.st.type[w.st.idx(10, 10)]).toBe(t);   // 格在、帧原样、无爆炸入口可走
    expect(w.st.frameX[w.st.idx(10, 10)]).toBe(0);
  });

  it('破坏对照：654 无样式掉落表 + breakTile 无掉落但整件清+1002 弹体单发（★BJ102 归一重锚：格侧零爆炸面,面在弹体首 AI 拍 Kill）', () => {
    expect(styleDropVidOfFrames(654, 0, 0)).toBe(0);
    expect(styleDropVidOfFrames(654, 18, 36)).toBe(0);
    const w = new World(40, 40, 7, 'pfd');
    const drops: Array<{ key: string; n: number }> = [];
    const g = breakShell(w, drops);
    const blasts: Array<[number, number, number, number, number]> = [];
    (g as unknown as Record<string, unknown>).explodeAt =
      (tx: number, ty: number, dmg: number, radius: number, _dt: boolean, _hb: unknown, _pen: unknown, projId: number) => {
        blasts.push([tx, ty, dmg, radius, projId]);
      };
    const spawns: number[] = [];
    (g as unknown as Record<string, unknown>).entities = {
      add: (e: unknown) => spawns.push((e as { projId?: number }).projId ?? -1),
      drops: [],
    };
    (g as unknown as Record<string, unknown>).player = { equipStats: {} };   // cs:48764 生成/读档门近似
    const t = keyOf('v_654_tnt_barrel');
    for (let dx = 0; dx < 2; dx++) for (let dy = 0; dy < 2; dy++) {
      w.store.setTileSilent(10 + dx, 10 + dy, t, dx * 18, dy * 18);
    }
    g.breakTile(10, 10, false);
    expect(drops).toEqual([]);                     // 无物品返还（KillTile :66114 no-drop）
    expect(w.store.get(10, 10)).toBe(0);
    expect(w.store.get(11, 11)).toBe(0);           // 整件清（2×2 锚点算法）
    // ★SW-J1 2026-09-03 定谳（沿立）：radius 10→0/destroyTiles=true→false——
    //  Kill_ExplodeTiles 闸门表（P.cs:79027-79030）不含 1002,:79064 `type==1002→num6=10`
    //  是死代码=原版 1002 Kill 不炸地形。★SW-BJ102 2026-09-16 归一：vanilla 格侧
    //  【无】爆炸面——KillTile case 654 只经 Check2x2 destroy 块 NewProjectile
    //  （WorldGen.cs:49178 dmg 400）,爆炸面（自伤+NPC dmg/2+大族视觉,r=0）全在
    //  弹体首 AI 拍 Kill（RollingBoulder.rbKill1002Face,sw-bj102 F2 钉）：
    expect(blasts).toEqual([]);                    // 格侧零爆炸面（旧「等效爆炸一次」钉退役）
    expect(spawns).toEqual([1002]);                // 弹体单发（spawnTntBarrelRoll→convert 单口）
  });

  it('殉爆（★BJ102 归一重锚）：两桶各破 → 各自弹体单发+零格侧面——vanilla 1002 自身不破格（SW-J1 死代码定谳）=无自续链,串行面在弹体首拍', () => {
    const w = new World(40, 40, 7, 'pfd');
    const drops: Array<{ key: string; n: number }> = [];
    const g = breakShell(w, drops);
    const t = keyOf('v_654_tnt_barrel');
    const place = (bx: number) => {
      for (let dx = 0; dx < 2; dx++) for (let dy = 0; dy < 2; dy++) {
        w.store.setTileSilent(bx + dx, 10 + dy, t, dx * 18, dy * 18);
      }
    };
    place(10); place(13);
    const blasts: Array<[number, number]> = [];
    (g as unknown as Record<string, unknown>).explodeAt = (tx: number, ty: number) => {
      blasts.push([tx, ty]);
    };
    const spawns: number[] = [];
    (g as unknown as Record<string, unknown>).entities = {
      add: (e: unknown) => spawns.push((e as { projId?: number }).projId ?? -1),
      drops: [],
    };
    (g as unknown as Record<string, unknown>).player = { equipStats: {} };
    g.breakTile(10, 10, false);
    g.breakTile(13, 10, false);
    // 旧钉「本爆入队→他桶补爆」退役：其前提=1002 爆炸面破他桶格,与 SW-J1 死代码
    // 定谳相悖（1002 不破地形）。vanilla 真链=他因（炸弹/镐/电路）破桶格 → KillTile
    // case 654 各链发 1002（WorldGen :49178）→ 各弹首 AI 拍各自 Kill（跨拍串行,
    // sw-bj102 F 域）;面计数=弹体数×1。
    expect(blasts).toEqual([]);                    // 格侧零爆炸面
    expect(spawns).toEqual([1002, 1002]);          // 两桶两弹（单口各一）
    expect(w.store.get(13, 10)).toBe(0);
  });
});

// ============ 共用 harness（同 style-drop-restore breakShell / wiring-devices makeCtx） ============
interface Drop { key: string; n: number }
function breakShell(w: World, drops: Drop[]) {
  const g = Object.create(Game.prototype) as unknown as Record<string, unknown> & {
    world: World; breakTile: (x: number, y: number, byPlayer?: boolean) => void;
  };
  g.world = w;
  g.chunks = { markDirtyArea: () => {} };
  g.spawnParticles = () => {};
  g.sfx = { play: () => {} };
  g.spawnDrop = (x: number, y: number, key: string, n: number) => { drops.push({ key, n }); return null; };
  g.recLog = () => {};
  g.dumpChest = () => {};
  g.entities = { add: () => {}, drops: [] };
  g.trackTile = 0;
  g.player = undefined;
  return g as unknown as { breakTile: (x: number, y: number, byPlayer?: boolean) => void };
}

function makeCtx(): DeviceCtx {
  return {
    dropItem: () => {}, spawnNpc: () => true, mechSpawnOk: () => true, itemSpawnOk: () => true,
    shootProjectile: () => {}, countProjectiles: () => 0,
    doorOpen: () => true, doorClose: () => true, teleportPair: () => {},
    relocateTownNpc: () => true, explode: () => {}, toast: () => {}, sfx: () => {},
    extractinatorPull: () => null, dropItemStack: () => {},
    worldSurface: 100,
  };
}

function wiringFixture() {
  const world = new World(40, 40, 7, 'pfd');
  return { world, w: new Wiring(world.store) };
}
