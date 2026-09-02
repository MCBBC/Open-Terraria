// ★七批备案④收尾（2026-09-02）：wld 导入 334 legacy 武器架持武还原。
//
// 编码表定谳（全部亲读 1.4.5.7 反编译源；TEdit 独立交叉验证）：
//   tile 334 = TileID.cs:1105 WeaponsRack（1.4 前武器架；现行 471 = :1379
//   WeaponsRack2，放置物品 2699 Item.cs:26048 createTile=471）。架上武器直接嵌帧：
//   写入 = Player.PlaceWeapon（Player.cs:54721-54813）——命中格归一到标记行
//   （:54723-54734 frameY/18==1）后写同行两格：
//     锚格（col0）frameX = itemType + num5 + 100（:54797，num5=5000）；
//     朝向 alternate（PlaceRight，裸架 base=54）改用二带 num5=20000（:54789-54794）；
//     前缀格（col1）frameX = prefix + num6（:54798，num6=10000 / 二带 25000）。
//   读取 = WorldGen.KillTile_DropItems :64122-64164——剥 5000 系定列（:64126-64136）、
//   itemType=锚 frameX%5000-100（:64145-64146）、prefix=右邻 frameX-10000/25000
//   （:64147-64149），掉武器后帧还原裸架（:64155-64162 base=(n5000-1)*18、前缀格
//   =base+18）。TEdit 独立同式（WorldRenderXna.xaml.cs:4669-4675
//   weapon=(curtile.U%5000)-100；U/5000≥3 翻面 ⇒ 20000 带=右向）。
//   ★任务简报勘误：20000/25000「二行带」不是染料槽——是右向 alternate 的锚/前缀
//   编码带（武器架无染料槽；TEWeaponsRack.cs 只有 item 单槽）。染料槽是帽架/模特。
import { describe, it, expect } from 'vitest';
import { parseWldToSave } from '../src/wld/WldImport';
import { loadSaveData } from '../src/save/SaveFile';
import { TILE_BY_KEY, TILE_DEFS } from '../src/data/tiles';
import { ITEM_BY_KEY, ITEM_DEFS, VANILLA_ITEM_KEY_BY_ID } from '../src/data/items';
import { FURNITURE_TILE_KIND } from '../src/world/FurnitureItems';
import { Game } from '../src/core/Game';
import { World } from '../src/world/World';

// ---------------- 合成 v279 .wld 固件（tests/wld.test.ts 同款 Writer/布局） ----------------
class Writer {
  out: number[] = [];
  u8(v: number) { this.out.push(v & 0xff); return this; }
  i16(v: number) { this.u8(v); this.u8(v >> 8); return this; }
  i32(v: number) { this.i16(v); this.i16(v >> 16); return this; }
  f32(v: number) {
    const dv = new DataView(new ArrayBuffer(4));
    dv.setFloat32(0, v, true);
    for (let i = 0; i < 4; i++) this.u8(dv.getUint8(i));
    return this;
  }
  f64(v: number) {
    const dv = new DataView(new ArrayBuffer(8));
    dv.setFloat64(0, v, true);
    for (let i = 0; i < 8; i++) this.u8(dv.getUint8(i));
    return this;
  }
  bool(v: boolean) { this.u8(v ? 1 : 0); return this; }
  str(s: string) {
    const bytes = new TextEncoder().encode(s);
    let len = bytes.length;
    while (len >= 0x80) { this.u8((len & 0x7f) | 0x80); len >>>= 7; }
    this.u8(len);
    for (const b of bytes) this.u8(b);
    return this;
  }
  bytes(arr: ArrayLike<number>) { for (let i = 0; i < arr.length; i++) this.u8(arr[i]); return this; }
}

const W = 14, H = 12;
/** 内部 id（断言/类别表用）与 wld 原版 tile id（固件写入用） */
const RACK = TILE_BY_KEY['v_334_weapon_rack_legacy_do_not_use']!;
const WLD_RACK = 334;   // TileID.cs:1105 WeaponsRack

/** 格内容：type（0=空气）+ 帧对 + 墙 */
type Cell = { t: number; fx?: number; fy?: number; wall?: number };
const grid: Cell[][] = Array.from({ length: W }, () => Array.from({ length: H }, () => ({ t: 0, wall: 3 }) as Cell));

function putRack(x0: number, y0: number, cells: number[][][]) {
  for (let dy = 0; dy < 3; dy++) {
    for (let dx = 0; dx < 3; dx++) {
      const [fx, fy] = cells[dy][dx];
      grid[x0 + dx][y0 + dy] = { t: WLD_RACK, fx, fy, wall: 3 };
    }
  }
}

// 裸架帧对（style 带基 × 行 × 列，18px 步进；band1 base=0 / band2(右向) base=54）
const bare = (base: number): number[][][] => [
  [[base, 0], [base + 18, 0], [base + 36, 0]],
  [[base, 18], [base + 18, 18], [base + 36, 18]],
  [[base, 36], [base + 18, 36], [base + 36, 36]],
];

// A：左向带一标记（vid 4 铁阔剑 + prefix 6）——PlaceWeapon 常规态
putRack(2, 2, (() => { const c = bare(0); c[1][0] = [5100 + 4, 18]; c[1][1] = [10000 + 6, 18]; return c; })());
// B：右向带二标记（vid 3509 铜镐 + prefix 9）——右向 alternate 编码带
putRack(6, 2, (() => { const c = bare(54); c[1][0] = [20000 + 100 + 3509, 18]; c[1][1] = [25000 + 9, 18]; return c; })());
// C：右向裸架（无标记）——不物化、帧原样
putRack(10, 2, bare(54));
// D：带一标记但 vid 2777 不在物品注册表（vanilla.json items 缺号）——清标记+计数
putRack(2, 6, (() => { const c = bare(0); c[1][0] = [5100 + 2777, 18]; c[1][1] = [10000 + 2, 18]; return c; })());
// E：带二高段锚（vid 5335 ∈ CanBePlacedOnWeaponRacks ≥4900 → 锚帧 ≥25000 被剥系
//    误判 col1——vanilla :64146 同款歧义，按帧对签名救回）+ prefix 3
putRack(10, 6, (() => { const c = bare(54); c[1][0] = [20000 + 100 + 5335, 18]; c[1][1] = [25000 + 3, 18]; return c; })());
// 孤儿前缀标记（左邻 334 裸锚、右邻空气——外部工具产物）：归位+计数
grid[2][10] = { t: WLD_RACK, fx: 0, fy: 18, wall: 3 };
grid[3][10] = { t: WLD_RACK, fx: 10000 + 6, fy: 18, wall: 3 };

function buildFixture(): Uint8Array {
  const VERSION = 279;
  const w = new Writer();
  w.i32(VERSION);
  w.bytes(new TextEncoder().encode('relogic'));
  w.u8(2);
  w.i32(1);
  w.i32(0); w.i32(0);
  w.i16(10);
  const ptrPos = w.out.length;
  for (let i = 0; i < 10; i++) w.i32(0);
  w.i16(30);                       // frameImportant 位图 240 位——334 越界 → 读侧恒 framed
  w.bytes(new Uint8Array(30));
  const pointers: number[] = [];
  const mark = () => pointers.push(w.out.length);

  mark();
  w.str('武器架导入测试').str('seed123');
  w.i32(0); w.i32(0);
  w.bytes(new Array(16).fill(1));
  w.i32(777);
  w.i32(0); w.i32(W * 16); w.i32(0); w.i32(H * 16);
  w.i32(H); w.i32(W);
  w.i32(0);
  for (let i = 0; i < 8; i++) w.bool(false);
  w.i32(1000); w.i32(0);
  w.u8(0);
  for (let i = 0; i < 3; i++) w.i32(0);
  for (let i = 0; i < 4; i++) w.i32(0);
  for (let i = 0; i < 3; i++) w.i32(0);
  for (let i = 0; i < 4; i++) w.i32(0);
  w.i32(0); w.i32(0); w.i32(0);
  w.i32(2); w.i32(2);
  w.f64(20.5); w.f64(40.5); w.f64(13500);
  w.bool(true);
  w.i32(0);
  w.bool(false); w.bool(false);
  w.i32(0); w.i32(0);
  w.bool(false);
  for (let i = 0; i < 10; i++) w.bool(false);
  w.bool(false);
  for (let i = 0; i < 7; i++) w.bool(false);
  w.bool(false); w.bool(false);
  w.u8(1); w.i32(0); w.bool(false);
  w.bool(false);
  w.i32(0); w.i32(0); w.i32(0); w.f64(0);
  w.f64(0);
  w.u8(0);
  w.bool(false); w.i32(0); w.f32(0);
  w.i32(107); w.i32(222); w.i32(-1);
  for (let i = 0; i < 8; i++) w.u8(0);
  w.i32(0); w.i16(0); w.f32(0);
  w.i32(0);
  w.bool(false); w.i32(0); w.bool(false);
  w.bool(false); w.bool(false);
  w.i32(0); w.i32(0);
  w.i16(0);
  w.bool(false);
  w.bool(false);
  w.bool(false); w.bool(false); w.bool(false);
  for (let i = 0; i < 5; i++) w.bool(false);
  for (let i = 0; i < 4; i++) w.bool(false);
  for (let i = 0; i < 4; i++) w.bool(false);
  w.bool(false);
  w.bool(false); w.bool(false); w.i32(0); w.i32(0);
  w.bool(false); w.i32(0); w.f32(0); w.f32(0);
  w.bool(false); w.bool(false); w.bool(false); w.bool(false);
  w.u8(0);
  w.u8(0);
  w.u8(0); w.u8(0); w.u8(0);
  w.bool(false);
  w.i32(0); w.bool(false); w.bool(false); w.bool(false);
  w.i32(13); for (let i = 0; i < 13; i++) w.i32(0);
  w.bool(false); w.bool(false);
  w.i32(0); w.i32(0); w.i32(0); w.i32(0);
  w.bool(false); w.bool(false); w.bool(false);
  w.bool(false); w.bool(false);
  w.bool(false);
  for (let i = 0; i < 8; i++) w.bool(false);
  w.bool(false);
  w.bool(false);
  for (let i = 0; i < 7; i++) w.bool(false);
  w.bool(false); w.u8(0);

  // ---- tiles 段（列优先逐格写：active+wall+type(u16)+帧） ----
  mark();
  for (let x = 0; x < W; x++) {
    for (let y = 0; y < H; y++) {
      const c = grid[x][y];
      if (c.t === 0) {
        if (c.wall) { w.u8(0x04); w.u8(c.wall); } else w.u8(0x00);
        continue;
      }
      w.u8(0x02 | 0x04 | 0x20);      // active + wall + type 走 u16（334>255）
      w.i16(c.t);
      w.i16(c.fx ?? 0); w.i16(c.fy ?? 0);
      w.u8(c.wall ?? 0);
    }
  }

  mark(); w.i16(0);                  // chests
  mark(); w.i16(0);                  // signs
  mark();
  w.i32(0);                          // shimmered count
  w.bool(true); w.i32(17); w.str('Andrew');
  w.f32(32); w.f32(32);
  w.bool(false); w.i32(2); w.i32(2); w.u8(0);
  w.bool(false);                     // end town loop
  w.bool(false);                     // mobs end
  for (let i = 0; i < 5; i++) mark();

  const u8 = new Uint8Array(w.out);
  for (let i = 0; i < 10; i++) {
    const v = pointers[i] ?? 0;
    u8[ptrPos + i * 4] = v & 0xff;
    u8[ptrPos + i * 4 + 1] = (v >> 8) & 0xff;
    u8[ptrPos + i * 4 + 2] = (v >> 16) & 0xff;
    u8[ptrPos + i * 4 + 3] = (v >> 24) & 0xff;
  }
  return u8;
}

// ---------------- 断言 ----------------
const vidKey = (vid: number) => VANILLA_ITEM_KEY_BY_ID[vid]!;
const vidIid = (vid: number) => ITEM_BY_KEY[vidKey(vid)]!;
/** 掉落键 = ITEM_DEFS[id].key（def 注册键，可能带别名大小写差） */
const defKey = (vid: number) => ITEM_DEFS[vidIid(vid)]!.key;

/** breakTile 运行时 harness（multi-tile-drop.test.ts boulderShell 同款） */
function breakShell(w: World, drops: Array<{ key: string; n: number }>) {
  const g = Object.create(Game.prototype) as unknown as Record<string, unknown> & {
    world: World; breakTile: (x: number, y: number, byPlayer?: boolean) => void;
  };
  g.world = w;
  g.chunks = { markDirtyArea: () => {} };
  g.spawnParticles = () => {};
  g.sfx = { play: () => {} };
  g.spawnDrop = (_x: number, _y: number, key: string, n: number) => { drops.push({ key, n }); return null; };
  g.recLog = () => {};
  g.dumpChest = () => {};
  g.entities = { add: () => {}, drops: [], critters: [], enemies: [] };
  g.trackTile = 0;
  g.player = { equipStats: {}, cx: 0, cy: 0 };
  return g as unknown as { breakTile: (x: number, y: number, byPlayer?: boolean) => void };
}

describe('wld 导入：334 legacy 武器架持武还原', () => {
  const { save, report, warnings } = parseWldToSave(buildFixture());
  const furn = save.furniture ?? [];
  const rec = (x: number, y: number) => furn.find((f) => f.x === x && f.y === y && f.kind === 'weapon_rack');

  it('FURNITURE_TILE_KIND 已收 334（weapon_rack）', () => {
    expect(FURNITURE_TILE_KIND.get(RACK)).toBe('weapon_rack');
    expect(TILE_DEFS[RACK]?.vanilla?.sheet).toBe(334);
  });

  it('带一标记（vid4+prefix6）→ 锚格左上物化 weapon_rack 单槽记录', () => {
    const r = rec(2, 2);
    expect(r).toBeDefined();
    expect(r!.slots[0]).toEqual({ id: vidIid(4), stack: 1, prefix: 6 });
  });

  it('带二标记（右向 alternate，vid3509+prefix9）→ 二带解码', () => {
    const r = rec(6, 2);
    expect(r).toBeDefined();
    expect(r!.slots[0]).toEqual({ id: vidIid(3509), stack: 1, prefix: 9 });
  });

  it('高段锚（vid5335 ≥4900，锚帧被剥系误判 col1）按帧对签名救回', () => {
    const r = rec(10, 6);
    expect(r).toBeDefined();
    expect(r!.slots[0]).toEqual({ id: vidIid(5335), stack: 1, prefix: 3 });
  });

  it('无标记裸架（rack C）不物化', () => {
    expect(rec(10, 2)).toBeUndefined();
    // 334 全图只有物化/孤儿标记之外的裸架帧原样
    const st = loadSaveData(save).world.store;
    expect(st.frameX[st.idx(10, 3)]).toBe(54);
    expect(st.frameX[st.idx(11, 3)]).toBe(72);
  });

  it('未知 vid（2777）→ 不物化 + itemsSkipped 计数登记', () => {
    expect(rec(2, 6)).toBeUndefined();
    const e = report.itemsSkipped.find((s) => s.id === 2777);
    expect(e?.count).toBe(1);
  });

  it('标记帧还原裸架态（WorldGen.cs:64155-64162：base=0/54、前缀格=base+18）', () => {
    const st = loadSaveData(save).world.store;
    expect(st.frameX[st.idx(2, 3)]).toBe(0);    // A 锚：带一 → base 0
    expect(st.frameX[st.idx(3, 3)]).toBe(18);   // A 前缀格
    expect(st.frameX[st.idx(6, 3)]).toBe(54);   // B 锚：带二 → base 54
    expect(st.frameX[st.idx(7, 3)]).toBe(72);   // B 前缀格
    expect(st.frameX[st.idx(10, 7)]).toBe(54);  // E 锚（高段救回后同样按带还原）
    expect(st.frameX[st.idx(11, 7)]).toBe(72);
    expect(st.frameX[st.idx(2, 7)]).toBe(0);    // D（未知 vid）标记也清掉
    expect(st.frameX[st.idx(3, 7)]).toBe(18);
  });

  it('孤儿前缀标记归位 + warnings 登记', () => {
    const st = loadSaveData(save).world.store;
    expect(st.frameX[st.idx(3, 10)]).toBe(18);
    expect(warnings.join('\n')).toContain('武器架持武帧标记损坏');
  });

  it('破架链：第一击弹武器（架保留）、第二击碎架+架本体 2699 返还一次（2026-09-02 ⑥-b 翻正）', () => {
    const { world } = loadSaveData(save);
    const drops: Array<{ key: string; n: number }> = [];
    const g = breakShell(world, drops);
    const st = world.store;
    // 命中标记行中格（col1）——经 furnitureAnchor 归一到锚点记录
    g.breakTile(3, 3, false);
    expect(drops).toEqual([{ key: defKey(4), n: 1 }]);
    expect(world.furnitureItems.find((f) => f.x === 2 && f.y === 2 && f.kind === 'weapon_rack')?.slots[0]).toBeNull();
    expect(st.type[st.idx(2, 3)]).toBe(RACK);    // 架本体保留（两段式 pop）
    // 第二击：空架正常破坏+架本体返还 2699（WeaponRack,ItemID.cs:6944）一次。
    // 原版语义（亲读 ../Terarria1457）：334 不走 GetItemDrop（KillTile_GetItemDrops
    // 共享 no-drop 组 case 334 WorldGen.cs:66406 → 共享 break）,返还走 CheckWeaponsRack
    // 完整性支（:46796 → Item.NewItem(...,2699) :46855,TileFrameImportant case 334
    // :86785-86788 派发）,destroyObject 旗 :46854 闭锁内层 KillTile 重入（:46798-46801
    // 早退）= 恒一次。1.4.5.7 无物品 createTile=334（case 2699 Item.cs:26055 是
    // createTile=471）→ place_v_ 兜底不可达,由 v_334 def.drop=2699 直掉
    // （multiTileDropKey 数字路径,见 multi-tile-drop.test.ts「legacy 武器架 334」describe）。
    // ★差异备案：原版 334 持武架一击双掉（武器帧嵌读取 KillTile_DropItems :64122-64164
    // 无 early return+架体 :46855 同击）;本仓与 471 共用两段式 pop 链（:64186-64195
    // 471 early-return 同构）,物品集相同、架体多承一击——共享链不在此批动。
    g.breakTile(3, 3, false);
    expect(drops).toEqual([
      { key: defKey(4), n: 1 },
      { key: vidKey(2699), n: 1 },
    ]);
    expect(st.type[st.idx(2, 3)]).toBe(0);
  });

  it('前缀格命中也能锚定（破坏 col1 → 同记录）', () => {
    const { world } = loadSaveData(save);
    const drops: Array<{ key: string; n: number }> = [];
    const g = breakShell(world, drops);
    g.breakTile(7, 3, false);   // rack B 前缀格
    expect(drops).toEqual([{ key: defKey(3509), n: 1 }]);
  });
});
