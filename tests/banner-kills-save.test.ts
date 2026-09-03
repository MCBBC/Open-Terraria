// 旗帜击杀计数存档持久化（2026-09-03 清偿）：
//   原版 BannerSystem.killCount = int[293] 静态表（BannerSystem.cs:124-126），随世界存档：
//   WorldFile.cs:1347 `BannerSystem.Save(writer)`（i16 n=293 + n×i32；v≥289 再
//   i16 m=293 + m×u16 claimableBanners）↔ :2210 `BannerSystem.Load(reader, version)`
//   （v<109 旧档无此段；:194 存表上限 `i < killCount.Length`）。
//   本仓自有 JSON 存档：SaveData.bannerKills（serialize.ts:481）↔ loadSaveData 回填
//   world.bannerKills（SaveFile.ts apply,旧档缺段守卫=空表）。
//   .wld 导入面：WldParser banner 段（曾读位即弃 → 原版世界导入旗计数清零）→
//   WldImport 顶层 bannerKills → 同一 loadSaveData 接缝。
//   2026-09-03 R4-D 批：③合成 .wld 字节夹具（非零 killCount+claimable,喂 WldParser
//   段解码——金标世界全零,循环断言空转假绿）；④(a) ExcludedFromDeathTally 18 类
//   排除门（NPCID.cs:4805/:4869）；④(b)/⑦ Game.ts 交互门+公告分档接线锁。
import { describe, it, expect } from 'vitest';
import { saveGame, loadSave } from '../src/save/SaveFile';
import { World } from '../src/world/World';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseWld } from '../src/wld/WldParser';
import { recordBannerKill, bannerOfNpc, bannerToNpcOf } from '../src/world/Banners';

describe('bannerKills 存档持久化（BannerSystem.killCount）', () => {
  it('存→读→计数一致（多键多值往返）', () => {
    const world = new World(64, 32, 42, '测试');
    world.bannerKills = { 5: 42, 87: 1, 292: 999 };
    const player = new Player(100, 100, new Inventory());
    const back = loadSave(saveGame(world, player, 0));
    expect(back.world.bannerKills).toEqual({ 5: 42, 87: 1, 292: 999 });
  });

  it('旧档无该字段 → 缺省空表不炸（读档后旗帜计数从空开始）', () => {
    const world = new World(64, 32, 42, '测试');
    world.bannerKills = { 13: 7 };
    const player = new Player(100, 100, new Inventory());
    const data = JSON.parse(saveGame(world, player, 0)) as Record<string, unknown>;
    delete data.bannerKills;                     // 模拟本批之前的旧档
    const back = loadSave(JSON.stringify(data));
    expect(back.world.bannerKills).toEqual({});
  });

  it('.wld 金标导入：banner 段解码（★该世界 killCount 全零,只证段界不炸）', () => {
    // 金标 = 原版 1.4.5.6 Steam 版小世界（v319 ≥ 289,claimable 段在 killCount 之后,
    // 须正确跳过否则后续字段全错位——fastForwardTimeToDawn 断言兜底验证段界）。
    // ★该世界 293 项 killCount 全 0：下方 for 循环属空转断言（R4-F3 定谳）——
    // 非零键域/数值往返改由合成夹具例承担,本例显式锁"全零"事实防空转假绿复发
    const GOLDEN = fileURLToPath(new URL('./golden/wld/12345世界.wld', import.meta.url));
    const wld = parseWld(new Uint8Array(readFileSync(GOLDEN)));
    expect(Object.keys(wld.bannerKills)).toEqual([]);   // 金标世界旗计数全零（实证）
    for (const [k, v] of Object.entries(wld.bannerKills)) {
      const banner = Number(k);
      expect(banner).toBeGreaterThanOrEqual(1);   // 下标 0 恒 0 不落表（BannerSystem 域 1-292）
      expect(banner).toBeLessThanOrEqual(292);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThan(0);               // 仅非零项落表
    }
    // claimable 段被正确消费的段界证据：banner 段之后的快进旗仍解析成功
    expect(typeof wld.fastForwardTimeToDawn).toBe('boolean');
    expect(wld.version).toBeGreaterThan(289);
  });
});

// ================= 合成 .wld 字节夹具（Writer 与 tests/wld-secret-seed-import.test.ts 同构） =================
class Writer {
  out: number[] = [];
  u8(v: number) { this.out.push(v & 0xff); return this; }
  u16(v: number) { this.u8(v & 0xff); this.u8((v >> 8) & 0xff); return this; }
  i16(v: number) { this.u8(v); this.u8((v >> 8) & 0xff); return this; }
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

/** v326 最小 .wld（布局按 WorldFile.cs 写侧）：banner 段 = i16 n(295=293 有效+2 越界)
 *  + n×i32 killCount + i16 m(293) + m×u16 claimable + fastForwardTimeToDawn=true */
function buildBannerFixture(
  kills: Record<number, number>,
  overflow: Record<number, number> = {},
  claimable: Record<number, number> = {},
): Uint8Array {
  const VERSION = 326;
  const W = 8, H = 8;
  const w = new Writer();

  w.i32(VERSION);
  w.bytes(new TextEncoder().encode('relogic'));
  w.u8(2);                       // fileType = World
  w.i32(1);                      // revision
  w.i32(0); w.i32(0);            // favorite u64
  w.i16(10);                     // sectionCount
  const ptrPos = w.out.length;
  for (let i = 0; i < 10; i++) w.i32(0);
  // tileFrameImportant 位图：30 位（LSB-first）= 4 字节
  w.i16(30);
  w.bytes(new Uint8Array(4));

  const pointers: number[] = [];
  const mark = () => pointers.push(w.out.length);

  // ---- header flags ----
  mark();
  w.str('旗段夹具').str('');
  w.i32(0); w.i32(0);            // worldGenVersion u64
  w.bytes(new Array(16).fill(1)); // guid
  w.i32(777);                    // worldId
  w.i32(0); w.i32(W * 16); w.i32(0); w.i32(H * 16); // bounds
  w.i32(H); w.i32(W);            // tilesHigh, tilesWide
  w.i32(0);                      // gameMode (209+)
  for (let i = 0; i < 9; i++) w.bool(false);   // 九特殊种子选项位（222-302）
  w.i32(1000); w.i32(1000);      // creationTime i64
  w.i32(0); w.i32(0);            // lastPlayed i64 (284)
  w.u8(0);                       // moonType
  for (let i = 0; i < 3; i++) w.i32(0);   // treeX
  for (let i = 0; i < 4; i++) w.i32(0);   // treeStyle
  for (let i = 0; i < 3; i++) w.i32(0);   // caveBackX
  for (let i = 0; i < 4; i++) w.i32(0);   // caveBackStyle
  w.i32(0); w.i32(0); w.i32(0);           // ice/jungle/hell bg
  w.i32(2); w.i32(2);                     // spawn
  w.f64(20.5); w.f64(40.5); w.f64(13500); // ground/rock/time
  w.bool(true);                           // dayTime
  w.i32(0);                               // moonPhase
  w.bool(false); w.bool(false);           // bloodMoon / eclipse
  w.i32(0); w.i32(0);                     // dungeon
  w.bool(false);                          // isCrimson
  for (let i = 0; i < 10; i++) w.bool(false); // downed boss 十连
  w.bool(false);                          // slime king (118)
  for (let i = 0; i < 7; i++) w.bool(false);  // saved 七连
  w.bool(false); w.bool(false);           // orb smashed / meteor
  w.u8(0); w.i32(0); w.bool(false);       // orbCount / altarCount / hardMode
  w.bool(false);                          // partyOfDoom (257)
  w.i32(0); w.i32(0); w.i32(0); w.f64(0); // invasion
  w.f64(0);                               // slimeRain (118)
  w.u8(0);                                // sundial (113)
  w.bool(false); w.i32(0); w.f32(0);      // rain
  w.i32(-1); w.i32(-1); w.i32(-1);        // savedOreTiers 三档未砸
  for (let i = 0; i < 8; i++) w.u8(0);    // bg
  w.i32(0); w.i16(0); w.f32(0);           // clouds/wind
  w.i32(0);                               // angler count
  w.bool(false); w.i32(0); w.bool(false); // savedAngler/quest/stylist
  w.bool(false); w.bool(false);           // taxCollector / golfer
  w.i32(0); w.i32(0);                     // invasionSizeStart / cultistDelay
  // ---- banners 段（WF:2210 BannerSystem.Load）----
  {
    const N = 295;                        // 293 有效（MaxBannerTypes,BannerSystem.cs:124）+2 越界
    w.i16(N);
    for (let i = 0; i < N; i++) w.i32(i < 293 ? (kills[i] ?? 0) : (overflow[i] ?? 0));
    w.i16(293);                           // claimable（v≥289）
    for (let i = 0; i < 293; i++) w.u16(claimable[i] ?? 0);
  }
  w.bool(true);                           // fastForwardTimeToDawn (128)——段界证据
  w.bool(false);                          // fishron
  w.bool(false); w.bool(false); w.bool(false); // martians/cultist/moonlord
  for (let i = 0; i < 5; i++) w.bool(false);   // holiday bosses
  for (let i = 0; i < 4; i++) w.bool(false);   // celestial downed
  for (let i = 0; i < 4; i++) w.bool(false);   // celestial active
  w.bool(false);                          // apocalypse
  w.bool(false); w.bool(false); w.i32(0); w.i32(0); // party (170)
  w.bool(false); w.i32(0); w.f32(0); w.f32(0);      // sandstorm (174)
  w.bool(false); w.bool(false); w.bool(false); w.bool(false); // DD2 (178)
  w.u8(0); w.u8(0); w.u8(0); w.u8(0); w.u8(0);               // mushroom/underworld/bg10-12
  w.bool(false);                          // combatBook (204)
  w.i32(0); w.bool(false); w.bool(false); w.bool(false);     // lantern (207)
  w.i32(13); for (let i = 0; i < 13; i++) w.i32(0);          // treetops (211)
  w.bool(false); w.bool(false);          // forceH/X ForToday (212)
  w.i32(0); w.i32(0); w.i32(0); w.i32(0); // oreTiersPH (216)
  w.bool(false); w.bool(false); w.bool(false); // pets (217)
  w.bool(false); w.bool(false);          // empress/queenSlime (223)
  w.bool(false);                         // deerclops (240)
  w.bool(false);                         // slimeBlue (250)
  for (let i = 0; i < 8; i++) w.bool(false);  // unlocks (251)
  w.bool(false);                         // combatBook2 (259)
  w.bool(false);                         // peddler (260)
  for (let i = 0; i < 7; i++) w.bool(false);  // slimeRain colors (261)
  w.bool(false); w.u8(0);                // duskFastForward + moondial (264)
  w.bool(false); w.bool(false);          // forever halloween/xmas (287)
  w.bool(false);                         // vampireSeed (288)
  w.bool(false);                         // infectedSeed (296)
  w.i32(0); w.i32(0);                    // (291) pair
  w.bool(false); w.u8(0);                // teamBasedSpawnsSeed + ExtraSpawnPointManager (297)
  w.bool(false);                         // dualDungeons (304)
  w.bool(false); w.bool(false);          // lightning 双位 (323)
  w.str('');                             // manifest (299)

  // ---- tiles 段：8×8 全泥土（每列一条满高游程，RLE 不跨列）----
  mark();
  for (let x = 0; x < W; x++) { w.u8(0x02 | 0x40); w.u8(0); w.u8(H - 1); }

  // ---- chests 段：空 ----
  mark();
  w.i16(0);

  // ---- signs 段：空 ----
  mark();
  w.i16(0);

  // ---- npcs 段：无城镇 NPC ----
  mark();
  w.i32(0);            // shimmered count (268)
  w.bool(false);       // end town loop

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

describe('.wld 合成夹具导入（非零 killCount+claimable,WldParser 段解码）', () => {
  it('非零计数往返；越界下标 293/294 弃读（BannerSystem.cs:194 i<killCount.Length）', () => {
    const buf = buildBannerFixture(
      { 5: 42, 74: 7, 87: 1, 292: 999 },   // 有效域（1-292）非零计数
      { 293: 555, 294: 666 },              // 越界下标（段头 n=295,第三方/旧工具形态）
      { 8: 3 },                            // claimable 非零（本仓不建模,验读即弃）
    );
    const wld = parseWld(buf);
    // 键=旗种、值=正整数逐项往返；下标 0 恒不落表；越界 293/294 弃读（曾整表入库）
    expect(wld.bannerKills).toEqual({ 5: 42, 74: 7, 87: 1, 292: 999 });
    // claimable 段被正确消费的段界证据：banner 段之后的快进旗仍解析成功
    expect(wld.fastForwardTimeToDawn).toBe(true);
    expect(wld.version).toBe(326);
  });

  it('全零 banner 段（原版常规形态）→ 空表不炸', () => {
    const wld = parseWld(buildBannerFixture({}, {}, {}));
    expect(wld.bannerKills).toEqual({});
    expect(wld.fastForwardTimeToDawn).toBe(true);
  });
});

describe('ExcludedFromDeathTally 门（NPC.cs:80610-80625 + NPCID.cs:4805/:4869）', () => {
  const PROJECTILE_NPC = [25, 30, 665, 33, 112, 666, 261, 265, 371, 516, 519];            // :4805
  const POSITIVE_EXCLUDED = [121, 384, 478, 479, 410, 472, 378];                          // :4869

  it('18 类排除面：映射存在也不计数（连 killCount 递增都不发生）', () => {
    // 门承重性实证：18 类中 14 类在 NPCtoBanner 有映射（原版有旗无计数）
    const mapped = [...PROJECTILE_NPC, ...POSITIVE_EXCLUDED].filter((id) => bannerOfNpc(id) > 0);
    expect(mapped.length).toBeGreaterThanOrEqual(10);
    expect(bannerOfNpc(25)).toBe(50);          // 克眼有旗——排除门才是承重的
    for (const id of [...PROJECTILE_NPC, ...POSITIVE_EXCLUDED]) {
      const kills: Record<number, number> = {};
      expect(recordBannerKill(kills, id)).toBe(false);
      expect(Object.keys(kills)).toEqual([]);   // AddNPCKillBy 整体不达（NPC.cs:80627-80628）
    }
  });

  it('排除集外正常计数（蓝史莱姆 74 → 旗 8,门槛 50 沿返回 true）', () => {
    const kills: Record<number, number> = {};
    for (let i = 0; i < 49; i++) expect(recordBannerKill(kills, 74)).toBe(false);
    expect(kills[8]).toBe(49);
    expect(recordBannerKill(kills, 74)).toBe(true);   // 第 50 只 → 恰跨整数倍门槛
    expect(kills[8]).toBe(50);
  });
});

describe('BannerToNPC 规范代表表（BannerSystem.cs:1156,提取面 vanilla-banners.json）', () => {
  it('同旗多 NPC 取规范 id（蓝史莱姆 74/297/298 → 规范 74"Blue Slime"）', () => {
    expect(bannerOfNpc(74)).toBe(8);
    expect(bannerOfNpc(297)).toBe(8);
    expect(bannerOfNpc(298)).toBe(8);
    expect(bannerToNpcOf(8)).toBe(74);
    expect(bannerToNpcOf(1)).toBe(102);
    expect(bannerToNpcOf(292)).toBe(694);
    expect(bannerToNpcOf(90)).toBe(0);   // 表外 12 旗之一（原版 `_ => 0`,NPCtoBanner 侧不可达）
  });
});

describe('Game.ts 接线锁（④b GetWereThereAnyInteractions 门 + ⑦ 公告分档/规范名）', () => {
  const gamePath = fileURLToPath(new URL('../src/core/Game.ts', import.meta.url));
  const src = () => readFileSync(gamePath, 'utf8');

  it('旗杀记账包在交互门内（enemy.playerInteracted 前置,NPC.cs:79652-79661）', () => {
    const s = src();
    const anchorAt = s.indexOf('★GetWereThereAnyInteractions 门');   // 门锚注释（全文件唯一）
    expect(anchorAt).toBeGreaterThan(-1);
    const seg = s.slice(anchorAt, anchorAt + 2400);
    expect(seg).toContain('if (enemy.playerInteracted === true) {'); // 门（先于记账）
    expect(seg.indexOf('if (enemy.playerInteracted === true) {'))
      .toBeLessThan(seg.indexOf('recordBannerKill('));               // 门内才调记账（曾无门=环境/雕像杀也计）
  });

  it('公告键分档含玩家名 + 规范名查表（BannerSystem.cs:245-255）', () => {
    const s = src();
    expect(s).toContain('Game.EnemiesDefeatedByAnnouncement');   // plr∈[0,255) 档（含玩家名）
    expect(s).toContain('bannerToNpcOf(banner)');                // 规范名 = BannerToNPC(banner)
  });
});
