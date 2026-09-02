// 幽灵保域批（2026-09-02 GH-A/GH-B 双审计定谳出口迁移）回归门。
//
// 定谳背景：x86 pre 世界有 1,471,380 幽灵格（act=0,type≠0），JS pre=0——根因是
// generateWorld finalize() 出口净化（WorldGen.ts，本批删除）。原版 .wld 携带
// inactive 位，幽灵跨存档存活；本仓 v5 存档以 tileActive 差分通道承载 active 位
// （serialize.ts rleTileActiveDiff），方案 A：幽灵在内存+存档全生命周期存活。
//
// 本文件断言五面：
//  ① 生成出口幽灵存活（count>0，量级对齐 x86 census）
//  ② 保域只增不改：净化视图（flags?type:0）type 哈希+flags/wall/liquid 哈希
//     全部等于迁移前金标（tests/golden/world-final-9293480.json 旧值，硬编码锚）
//     ——证明终态唯一变化=幽灵格 type 残留，非其他管线位移
//  ③ v5 存读：幽灵跨存档逐格存活（方案 A 语义）；serializeSave 零就地写
//  ④ v4 兼容：缺 tileActive 段=「type≠0 即激活」派生式（旧读端行为，幽灵激活）
//  ⑤ 运行时 active 位门（vanilla SolidTile WorldGen.cs:70650 / TileCollision :2331 /
//     nactive Tile.cs:242）+ GERunner 裸读 type 消费幽灵格（IIII177 纯 type 直写，
//     转化后仍幽灵=原版 cs:77013 活性位原样保留）
import { describe, it, expect } from 'vitest';
import { generateWorld } from '../src/world/gen/WorldGen';
import { fnv1a } from './pass-hash.test';
import { TileStore } from '../src/world/TileStore';
import { serializeSave, type SaveData } from '../src/save/serialize';
import { buildSaveParts, loadSaveData } from '../src/save/SaveFile';
import { TILE_BY_KEY, TILE_DEFS } from '../src/data/tiles';
import { startHardmode } from '../src/world/gen/vanilla/HardmodePass';
import type { World } from '../src/world/World';

// 迁移前金标（finalize 净化时代终态；本批后 type 哈希含幽灵必然翻色，已按
// UPDATE_GOLDEN 再生新基线——旧值留此作「保域只增不改」的净面锚）
const OLD_GOLDEN_9293480 = {
  type: '115f524f', flags: 'e1c7adcd', wall: '178c5701', liquid: '0ec752c3',
};

function ghostCount(st: TileStore): number {
  let n = 0;
  for (let i = 0; i < st.type.length; i++) {
    if (!st.flags[i] && st.type[i] !== 0) n++;
  }
  return n;
}

describe('幽灵保域：生成出口/存档/运行时门', () => {
  it('①②③ 生成出口幽灵存活 + 净化视图哈希=迁移前金标 + v5 存读幽灵逐格存活', async () => {
    const world = await generateWorld({ width: 4200, height: 1200, seedText: '9293480', evil: 0 });
    const st = world.store;
    const n = st.type.length;

    // ① 出口存活：x86 pre census=1,471,380（Stone 35%/Mud 30%/Snow 8%…）
    const gh = ghostCount(st);
    console.log(`[ghost-preserve] 生成出口幽灵=${gh} (x86=1471380)`);
    expect(gh).toBeGreaterThan(1000000);

    // ② 净化视图（旧 finalize 语义的等价投影）哈希=迁移前金标——保域只增不改
    const pt = new Uint16Array(n);
    for (let i = 0; i < n; i++) pt[i] = st.flags[i] ? st.type[i] : 0;
    expect(fnv1a(pt)).toBe(OLD_GOLDEN_9293480.type);
    expect(fnv1a(st.flags)).toBe(OLD_GOLDEN_9293480.flags);
    expect(fnv1a(st.wall)).toBe(OLD_GOLDEN_9293480.wall);
    expect(fnv1a(st.liquid)).toBe(OLD_GOLDEN_9293480.liquid);

    // ③ v5 存读：serializeSave 零就地写 + tileActive 落段 + 读档幽灵逐格还原
    const parts = buildSaveParts(world);
    const json = serializeSave(parts.view, parts.meta, parts.player, 0);
    expect(ghostCount(st)).toBe(gh);   // 序列化不动活存储（净化循环已删）
    const data = JSON.parse(json) as SaveData;
    expect(data.version).toBe(5);
    expect(typeof data.tileActive).toBe('string');
    expect(data.tileActive!.length).toBeGreaterThan(0);
    const { world: loaded } = loadSaveData(data);
    const lst = loaded.store;
    expect(ghostCount(lst)).toBe(gh);  // 方案 A：跨存档存活（对齐原版 .wld inactive 位）
    let diff = 0;
    for (let i = 0; i < n; i++) {
      if (lst.type[i] !== st.type[i] || lst.flags[i] !== st.flags[i]) diff++;
    }
    expect(diff).toBe(0);
  }, 600000);

  it('④ v4 兼容语义：缺 tileActive 段=type≠0 派生激活（旧读端行为）', () => {
    const st = new TileStore(8, 8);
    const stone = TILE_BY_KEY['stone']!;
    st.setTileSilent(2, 2, stone);
    st.deactivateTile(2, 2);                       // 幽灵：type 残留 + 未激活
    const meta = {
      name: 't', seed: 1, w: 8, h: 8, spawnX: 4, spawnY: 4,
      groundLevel: 4, rockLevel: 5, timeOfDay: 0, dayCount: 0, chests: [], flags: {},
    };
    const player = { hp: 100, x: 0, y: 0, inventory: [], selected: 0 };
    const data = JSON.parse(serializeSave(
      { type: st.type, flags: st.flags, frameX: st.frameX, frameY: st.frameY,
        wall: st.wall, liquid: st.liquid, liquidType: st.liquidType, wire: st.wire,
        half: st.half, slope: st.slope, paint: st.paint, paintWall: st.paintWall },
      meta, player, 0,
    )) as SaveData;
    expect(data.tileActive).toBeTruthy();
    // 模拟 v4 旧档/旧读端：剥离差分通道 → 派生式（type≠0 即激活）
    delete (data as Partial<SaveData>).tileActive;
    const { world } = loadSaveData(data);
    const i = world.store.idx(2, 2);
    expect(world.store.type[i]).toBe(stone);       // type 落盘仍在（旧读端存档本无幽灵）
    expect(world.store.flags[i]).toBe(1);          // 派生激活=旧「写侧净化后重读」等价语义
  });

  it('⑤a 运行时 active 位门：幽灵格 isSolid/isPlatform/isActive=空（type 保留）', () => {
    const st = new TileStore(8, 8);
    const stone = TILE_BY_KEY['stone']!;
    const platform = TILE_BY_KEY['platform']!;
    st.setTileSilent(1, 1, stone);
    expect(st.isSolid(1, 1)).toBe(true);
    st.deactivateTile(1, 1);                       // 幽灵化（保留 type）
    expect(st.type[st.idx(1, 1)]).toBe(stone);      // 幽灵核心语义：type 残留
    expect(st.isSolid(1, 1)).toBe(false);          // vanilla SolidTile active() 首门
    expect(st.isActive(1, 1)).toBe(false);         // vanilla nactive()
    st.setTileSilent(2, 1, platform);
    expect(st.isPlatform(2, 1)).toBe(true);
    st.deactivateTile(2, 1);
    expect(st.isPlatform(2, 1)).toBe(false);       // vanilla TileCollision :2331 active 门
    expect(st.type[st.idx(2, 1)]).toBe(platform);
  });

  it('⑤b GERunner 裸读 type 消费幽灵格：转化后仍幽灵（x86 cs:77013 活性位原样保留）', () => {
    const w = 420, h = 220, seed = 20260813;
    const store = new TileStore(w, h);
    const stone = TILE_BY_KEY['stone']!;
    const grass = TILE_BY_KEY['grass']!;
    const dirt = TILE_BY_KEY['dirt']!;
    for (let x = 0; x < w; x++) {
      store.setTileSilent(x, 70, grass);
      for (let y = 71; y < 90; y++) store.setTileSilent(x, y, dirt);
      for (let y = 90; y < h - 10; y++) store.setTileSilent(x, y, stone);
      for (let y = 72; y < h - 10; y++) store.setWallSilent(x, y, 63);
    }
    // 全石层幽灵化——GERunner 转化链裸读 type（HardmodePass IIIII177 纯 type 直写）
    for (let x = 0; x < w; x++) {
      for (let y = 90; y < h - 10; y++) store.deactivateTile(x, y);
    }
    expect(ghostCount(store)).toBeGreaterThan(10000);
    const world = {
      store, crimson: false, seed, dungeonX: Math.floor(w / 2), groundLevel: 70,
      flags: {} as Record<string, boolean>,
    } as unknown as World;
    startHardmode(world);
    // 神圣/邪恶条带扫过石层：幽灵石（sheet1）被转化为 117 珍珠岩/25 魔岩石等，
    // 且活性位原样保留（flags=0）——纯 type 直写=原版 Main.tile[m,n].type=X 语义
    let ghostConverted = 0;
    for (let x = 0; x < w; x++) {
      for (let y = 90; y < h - 10; y++) {
        const i = store.idx(x, y);
        if (store.flags[i]) continue;
        const sh = TILE_DEFS[store.type[i]]?.vanilla?.sheet ?? -1;
        if (sh === 117 || sh === 25 || sh === 203) ghostConverted++;
      }
    }
    console.log(`[ghost-preserve] GERunner 幽灵转化格=${ghostConverted}`);
    expect(ghostConverted).toBeGreaterThan(0);
  });
});
