// ★BJ607（2026-10-10）剪线钳剪断电线不进背包（用户实报「用钳子剪下来的电线消失了
//  没有进入背包」）。定谳锚（Terarria1457 亲读）：
//   · WorldGen.KillActuator（WorldGen.cs:58505-58521）/ KillWire（:58605-58627）/
//     KillWire2（:58635-58657）/ KillWire3（:58665-58687）/ KillWire4（:58695-58717）
//     五函数同面：PlaySound(SoundID.Dig=0, i*16, j*16)（SoundID.cs:22 Dig=0）→ 清位 →
//     `Main.netMode != 1` 侧 Item.NewItem(GetItemSource_FromTileBreak(i,j),
//     i*16, j*16, 16, 16, 530/849) ×1 + 5×Dust.NewDust((i*16,j*16),16,16,50)。
//   · ★四通道全掉 530=普通线（1456 与 1457 反编译逐字节同值）——1457 无彩线物品：
//     853/854/855 = 蓝/黄压板/折扣卡（idNames 亲读）,彩线由扳手消耗 530 放置
//     （Player.cs:47180-47247 四扳手全扫 inventory[].type==530 消耗）,剪断回吐 530。
//     NewItem 矩形载 = 格【中心】(i*16+8, j*16+8)（Item.cs:49657 X+Width/2）——
//     世界掉落物（掉地可拾取）,非直进背包。
//   · 剪线入口：Player.ItemCheck_UseWiringTools（Player.cs:47156）item 510 剪线钳
//     优先级 KillActuator > KillWire4(黄) > KillWire3(绿) > KillWire2(蓝) >
//     KillWire(红)（:47264-47290）,单格/次;宏伟蓝图 mass cut 与五彩扳手 cutter 位
//     同入 KillWire*（Wiring.cs:3412-3424,逐格）。
//   · 本仓病根=整缺：Wiring.killWire/killActuator 自首提交起只清位（git -S 证实
//     从无掉落面;BJ572/BJ583 动可视面/蓝图路由,与掉落面无关）。
//  判别力（旧码必红）：§1 单源钩逐通道 vid/次数（旧 killWire 无钩必红）;§2 蓝图
//    路由逐格触发;§3 useWireTool 优先级+背包不直收;§4 wireKillDropFx 实体三件套
//    （真 spawnDrop=世界掉落物面,位置=格中心/stack=1/音 Dig 带坐标/尘 5×50）;
//    §5 数据面（四通道掉落物 id 表钉值,防「彩线各自掉落」臆改回归）。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { World } from '../src/world/World';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { Wiring, TOOL_RED, TOOL_BLUE, TOOL_CUTTER } from '../src/world/Wiring';
import { TileStore } from '../src/world/TileStore';
import { EntityManager } from '../src/entities/Entity';
import { ItemDrop } from '../src/entities/ItemDrop';
import { ITEM_DEFS, ITEM_BY_KEY, VANILLA_ITEM_KEY_BY_ID } from '../src/data/items';
import { VI, VI_ID } from '../src/data/itemKeys';
import { Game } from '../src/core/Game';

const TILE = 16;

/** 记录钩：(x, y, vid) 触发台账 */
type KillRec = Array<[number, number, number]>;

/** 真 Wiring + 真 World + 真 Player/Inventory 的窄视图台架（bj569 同款,0 处 new Game()） */
function makeEnv() {
  const w = new World(200, 120, 7, 'bj607-wire-cut-drop');
  const inv = new Inventory();
  const player = new Player(60 * TILE, 90 * TILE, inv);
  const wiring = new Wiring(w.store);
  const fired: KillRec = [];
  wiring.wireKillFx = (x, y, vid) => { fired.push([x, y, vid]); };
  return { w, inv, player, wiring, fired };
}

/** useWireTool 窄视图 fake（prototype 方法挂载,bj467/bj569 判例） */
function makeUseFake() {
  const env = makeEnv();
  const sounds: Array<[string, number, number | undefined, number | undefined]> = [];
  const denies: string[] = [];
  const invChanged: number[] = [];
  const fake: Record<string, unknown> = {
    world: env.w,
    wiring: env.wiring,
    player: env.player,
    netCanEditTile: () => true,
    netDeny: (m: string) => { denies.push(m); },
    sfx: { play: (n: string, v = 1, x?: number, y?: number) => { sounds.push([n, v, x, y]); } },
    cb: { onToast: () => {}, onInventoryChanged: () => { invChanged.push(1); } },
    wireToolMode: TOOL_RED,
  };
  const proto = Game.prototype as unknown as Record<string, unknown>;
  fake.useWireTool = proto.useWireTool;
  fake.inTileRange = proto.inTileRange;
  fake.tileReach = proto.tileReach;
  fake.blockRange = proto.blockRange;
  const call = (tx: number, ty: number, vid: number) =>
    (fake.useWireTool as (this: unknown, tx: number, ty: number, def: unknown) => void)
      .call(fake, tx, ty, ITEM_DEFS[ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[vid]]!]);
  return { ...env, fake, sounds, denies, invChanged, call };
}

// ================ §1 单源：Wiring.killWire/killActuator 剪断面（五函数 1:1） ================
describe('BJ607-§1：killWire 四通道逐格剪断面（WorldGen.cs:58605/:58635/:58665/:58695）', () => {
  const cases: Array<[number, string]> = [
    [TileStore.WIRE_RED, '红'],
    [TileStore.WIRE_BLUE, '蓝'],
    [TileStore.WIRE_GREEN, '绿'],
    [TileStore.WIRE_YELLOW, '黄'],
  ];
  for (const [bit, name] of cases) {
    it(`剪断${name}线：钩恰一次、vid=530（四通道全掉普通线）、位清零`, () => {
      const { w, wiring, fired } = makeEnv();
      w.store.setWire(10, 10, w.store.wire[w.store.idx(10, 10)] | bit);
      expect(wireAt(w, 10, 10) & bit).toBeTruthy();
      expect(wiring.killWire(10, 10, bit)).toBe(true);
      // 位清零（剪断动作本身,用户实证既有面）
      expect(wireAt(w, 10, 10) & bit).toBeFalsy();
      // 掉落面：恰一次、vid=530（WorldGen.cs:58613/:58643/:58673/:58703 四支同值 530）
      expect(fired).toEqual([[10, 10, 530]]);
    });
  }
  it('KillActuator：vid=849（WorldGen.cs:58505-58521 掉致动器）', () => {
    const { w, wiring, fired } = makeEnv();
    w.store.setWire(10, 10, TileStore.WIRE_ACTUATOR);
    expect(wiring.killActuator(10, 10)).toBe(true);
    expect(fired).toEqual([[10, 10, 849]]);
  });
  it('不剪面：无线/无致动器=返回 false+钩零触发（WorldGen 五函数 if 门）', () => {
    const { wiring, fired } = makeEnv();
    expect(wiring.killWire(3, 3, TileStore.WIRE_RED)).toBe(false);
    expect(wiring.killWire(3, 3, TileStore.WIRE_YELLOW)).toBe(false);
    expect(wiring.killActuator(3, 3)).toBe(false);
    expect(fired).toEqual([]);
  });
  it('多通道并存：剪一格只触发一次钩（每 KillWire* 调用独立结算）', () => {
    const { w, wiring, fired } = makeEnv();
    w.store.setWire(5, 5, TileStore.WIRE_RED | TileStore.WIRE_BLUE);
    expect(wiring.killWire(5, 5, TileStore.WIRE_RED)).toBe(true);
    expect(fired).toEqual([[5, 5, 530]]);
    expect(wireAt(w, 5, 5) & TileStore.WIRE_BLUE).toBeTruthy();   // 蓝位保留
    expect(wiring.killWire(5, 5, TileStore.WIRE_BLUE)).toBe(true);
    expect(fired).toEqual([[5, 5, 530], [5, 5, 530]]);
  });
});

// ================ §2 宏伟蓝图 massWireOperation cutter 支（Wiring.cs:3412-3424） ================
describe('BJ607-§2：蓝图/五彩 cutter 路由逐格触发（MassWireOperation → KillWire*）', () => {
  it('L 形三格剪线：逐格各一钩、全 vid=530、不耗背包线', () => {
    const { w, wiring, fired } = makeEnv();
    for (const [x, y] of [[20, 20], [20, 21], [21, 21]] as const) {
      w.store.setWire(x, y, TileStore.WIRE_RED);
    }
    const mode = TOOL_CUTTER | TOOL_RED;
    const res = wiring.massWireOperation([20, 20], [21, 21], mode, Infinity, Infinity, true);
    expect(res.aborted).toBe(false);
    expect(fired).toEqual([[20, 20, 530], [20, 21, 530], [21, 21, 530]]);
    for (const [x, y] of [[20, 20], [20, 21], [21, 21]] as const) {
      expect(wireAt(w, x, y) & TileStore.WIRE_RED).toBeFalsy();
    }
  });
});

// ================ §3 useWireTool 剪线钳路由（Player.cs:47156 优先级面） ================
describe('BJ607-§3：useWireTool(510/五彩 cutter 位) 路由+背包不直收', () => {
  it('剪线钳剪红线：位清零+useTime=5+钩恰一次 vid 530（Player.cs:47283 优先级尾）', () => {
    const f = makeUseFake();
    f.w.store.setWire(61, 91, TileStore.WIRE_RED);       // 玩家 (60,90) 邻格,射程内
    f.call(61, 91, 510);
    expect(wireAt(f.w, 61, 91) & TileStore.WIRE_RED).toBeFalsy();
    expect(f.player.useTime).toBe(5);
    expect(f.fired).toEqual([[61, 91, 530]]);
  });
  it('优先级：致动器+红线并存只剪致动器（Player.cs:47264-47290 顺序字面）', () => {
    const f = makeUseFake();
    f.w.store.setWire(61, 91, TileStore.WIRE_ACTUATOR | TileStore.WIRE_RED);
    f.call(61, 91, 510);
    expect(f.fired).toEqual([[61, 91, 849]]);
    expect(wireAt(f.w, 61, 91) & TileStore.WIRE_RED).toBeTruthy();  // 红位保留
    expect(wireAt(f.w, 61, 91) & TileStore.WIRE_ACTUATOR).toBeFalsy();
  });
  it('空按（无任何通道）零钩零冷却（不剪面）', () => {
    const f = makeUseFake();
    f.call(61, 91, 510);
    expect(f.fired).toEqual([]);
    expect(f.player.useTime).toBe(0);
  });
  it('进包语义锁：剪断后背包不直收 Wire（原版=NewItem 世界掉落,Item.cs:49657）', () => {
    const f = makeUseFake();
    f.w.store.setWire(61, 91, TileStore.WIRE_RED);
    const before = f.inv.countOf(VI_ID(530));
    f.call(61, 91, 510);
    expect(f.inv.countOf(VI_ID(530))).toBe(before);      // 背包零变化=掉地面,拾取另行走 ItemDrop
  });
});

// ================ §4 wireKillDropFx 实体面（真 spawnDrop → 世界掉落物三件套） ================
describe('BJ607-§4：wireKillDropFx 三件套（NewItem/PlaySound(Dig)/5×Dust 50 1:1）', () => {
  /** 真 EntityManager + 真 spawnDrop 的窄视图台架 */
  function makeDropFake() {
    const ents = new EntityManager();
    const drops: ItemDrop[] = [];
    const sounds: Array<[string, number, number | undefined, number | undefined]> = [];
    const dusts: Array<{ x: number; y: number; w: number; h: number; type: number }> = [];
    const fake: Record<string, unknown> = {
      entities: { drops: ents.drops, add: (e: ItemDrop, bucket: string) => { ents.add(e, bucket as 'drops'); drops.push(e); } },
      net: null,
      recLog: () => {},
      emergencyStackMakeSpace: () => false,
      sfx: { play: (n: string, v = 1, x?: number, y?: number) => { sounds.push([n, v, x, y]); } },
      vanillaDust: { spawn: (x: number, y: number, w: number, h: number, type: number) => { dusts.push({ x, y, w, h, type }); return null; } },
    };
    const proto = Game.prototype as unknown as Record<string, unknown>;
    fake.spawnDrop = proto.spawnDrop;
    fake.wireKillDropFx = proto.wireKillDropFx;
    const call = (kx: number, ky: number, vid: number) =>
      (fake.wireKillDropFx as (this: unknown, x: number, y: number, vid: number) => void)
        .call(fake, kx, ky, vid);
    return { fake, drops, sounds, dusts, call };
  }

  it('剪红线掉落：世界掉落物 vid=530×1、锚=格【中心】(+8,+8)（Item.cs:49657）', () => {
    const { drops, call } = makeDropFake();
    call(30, 40, 530);
    expect(drops.length).toBe(1);
    const d = drops[0];
    expect(ITEM_DEFS[d.itemId]?.vid).toBe(530);
    expect(d.stack).toBe(1);
    expect(d.x + d.w / 2).toBe(30 * TILE + 8);           // NewItem(i*16,j*16,16,16) 中心载
    expect(d.y + d.h / 2).toBe(40 * TILE + 8);
  });
  it('剪致动器掉落：vid=849×1（WorldGen.cs:58514）', () => {
    const { drops, call } = makeDropFake();
    call(30, 40, 849);
    expect(drops.length).toBe(1);
    expect(ITEM_DEFS[drops[0].itemId]?.vid).toBe(849);
    expect(drops[0].stack).toBe(1);
  });
  it('音面：Dig 恰一次、坐标=格左上像素（SoundEngine.PlaySound(0, i*16, j*16)）', () => {
    const { sounds, call } = makeDropFake();
    call(30, 40, 530);
    expect(sounds).toEqual([['dig', 1, 30 * TILE, 40 * TILE]]);
  });
  it('尘面：恰 5×Dust 50、盒=(i*16,j*16,16,16)（WorldGen.cs:58617-58619）', () => {
    const { dusts, call } = makeDropFake();
    call(30, 40, 530);
    expect(dusts.length).toBe(5);
    for (const d of dusts) {
      expect(d.type).toBe(50);
      expect(d.x).toBe(30 * TILE);
      expect(d.y).toBe(40 * TILE);
      expect(d.w).toBe(16);
      expect(d.h).toBe(16);
    }
  });
  it('构造器注入源锚：Game 构造链必须装配 wiring.wireKillFx（防静默拆线回归）', () => {
    const src = readFileSync(join(import.meta.dirname, '../src/core/Game.ts'), 'utf8');
    expect(src).toContain('this.wiring.wireKillFx =');
    expect(src).toContain('this.wireKillDropFx(kx, ky, vid)');
  });
});

// ================ §5 数据面：四通道掉落物 id 表钉值（防「彩线各自掉落」臆改） ================
describe('BJ607-§5：1457 无彩线物品——853-855=压板/折扣卡,id 表勘误锁', () => {
  it('853/854/855 非 Wire（idNames 亲读:BluePressurePlate/DiscountCard 等）', () => {
    // 1456/1457 反编译 KillWire2/3/4 掉落支逐字节同值 530——「彩线各自掉 853-855」
    // 是 1.4.4 以前臆测,1.4.5.7 权威面=四通道全掉普通线。
    expect(VI(853)).not.toBe(VI(530));
    expect(VI(854)).not.toBe(VI(530));
    expect(VI(855)).not.toBe(VI(530));
    expect(VI(530)).not.toBe('');
  });
  it('五彩扳手 cutter 位剪蓝线：仍掉 530（useWireTool 五彩支 + :58635 KillWire2 掉落支）', () => {
    const f = makeUseFake();
    f.fake.wireToolMode = TOOL_CUTTER | TOOL_BLUE;
    f.w.store.setWire(61, 91, TileStore.WIRE_BLUE);
    f.call(61, 91, 3625);
    expect(f.fired).toEqual([[61, 91, 530]]);            // 蓝 → 仍掉 530
    expect(wireAt(f.w, 61, 91) & TileStore.WIRE_BLUE).toBeFalsy();
  });
});

function wireAt(w: World, x: number, y: number): number {
  return w.store.wire[w.store.idx(x, y)];
}
