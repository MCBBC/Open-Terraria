// SW-FX33（2026-09-11）：header 特例段补齐回环——TempPartyCelebratingNPCs / 灯笼夜
// 四件套 / TreeTops 派生 / worldGenVersion 常量。
// 金标锚（Terarria1457 亲读）：
//   - TempPartyCelebratingNPCs：WF:1370-1374 Save（i32 n + n×i32，位于 _tempPartyCooldown
//     :1369 与 _tempSandstormHappening :1375 之间）；读侧 WF:2267-2276；Load 尾回灌
//     BirthdayParty.CelebratingNPCs（WorldFile.cs:168）。
//   - 灯笼夜四件套：WF:1387-1390 Save（cooldown i32 + genuine/manual/next bool），
//     TreeTops 紧随其后（WF:1391）。
//   - TreeTops：TreeTopsInfo.cs:42-49 Save（恒 13）；自建世界派生 = WorldGen.cs:11370
//     CopyExistingWorldInfoForWorldGeneration → TreeTopsInfo.cs:217-232 映射。
//   - worldGenVersion：WorldFile.cs:606 建世界恒写 Main.WorldGeneratorVersion（Main.cs:228
//     = 1395864371201）；WorldFileData.cs:104 HasValidSeed=> !=0。
// 判据：export→parse→export 全等 + 段位（后续字段蘑菇bg/肉前矿/TreeTops 作位序金丝雀）。
import { describe, it, expect } from 'vitest';
import { exportWld } from '../src/wld/WldExport';
import { parseWldToSave } from '../src/wld/WldImport';
import { parseWld } from '../src/wld/WldParser';
import { rleTiles, rlePairs, bytesToB64, type SaveData } from '../src/save/SaveFile';
import { TILE_STABLE_OF_INTERNAL } from '../src/data/tiles';

const W = 16, H = 12;

function mkSave(over?: Partial<SaveData>): SaveData {
  const n = W * H;
  return {
    format: 'sandboxworld.save', version: 5,
    header: {
      name: 'FX33回环', seed: 7, width: W, height: H,
      spawn: [8, 6], groundLevel: 6, rockLevel: 9,
      crimson: false, dungeonX: 2, dungeonY: 5,
      treeX: [4, 8, 12], treeStyle: [1, 2, 3, 4],
      created: 1700000000000, playTimeMs: 0, moonType: 3, difficulty: 0,
      bgStyles: { cave: [1, 2, 3, 0], ice: 1, jungle: 2, hell: 3, mushroom: 1, underworld: 3, bg10: 0, bg11: 0, bg12: 0, forest: [2, 3, 4], desert: 2, ocean: 5, corrupt: 2, snow: 3, hallow: 1, crimson: 4 },
    },
    clock: { timeOfDay: 0.25, dayCount: 1, moonPhase: 0, bloodMoon: false, eclipse: false },
    invasion: { type: 0, size: 0, sizeStart: 0, x: 0, delay: 0 },
    events: { partyManual: false, lanternManual: false, lanternGenuine: false, lanternNext: false, lanternCooldown: 0 },
    player: { hp: 100, x: 0, y: 0, inventory: [], selected: 0 },
    tiles: bytesToB64(rleTiles({ type: new Uint16Array(n), frameX: new Uint16Array(n), frameY: new Uint16Array(n) }, TILE_STABLE_OF_INTERNAL)),
    walls: bytesToB64(rlePairs(new Uint16Array(n))),
    liquid: bytesToB64(rlePairs(new Uint16Array(n))),
    liquidType: bytesToB64(rlePairs(new Uint8Array(n))),
    wire: bytesToB64(rlePairs(new Uint16Array(n))),
    blocks: bytesToB64(rlePairs(new Uint8Array(n))),
    paint: bytesToB64(rlePairs(new Uint8Array(n))),
    paintWall: bytesToB64(rlePairs(new Uint8Array(n))),
    coat: bytesToB64(rlePairs(new Uint8Array(n))),
    chests: [], signs: [], npcs: [], flags: {},
    ...over,
  } as unknown as SaveData;
}

describe('SW-FX33 header 特例段回环', () => {
  it('TempPartyCelebratingNPCs：export→import→export 名单保真（netId 域）', () => {
    const save = mkSave({
      events: { partyManual: true, partyGenuine: true, partyCooldown: 4, partyCelebratingNpcs: [17, 20, 208], lanternManual: false, lanternGenuine: false, lanternNext: false, lanternCooldown: 0 },
    } as Partial<SaveData>);
    const back = parseWldToSave(exportWld(save)).save;
    expect(back.events?.partyCelebratingNpcs).toEqual([17, 20, 208]);
    expect(back.events?.partyManual).toBe(true);
    expect(back.events?.partyGenuine).toBe(true);
    expect(back.events?.partyCooldown).toBe(4);
    // 二次导出→原版域读回：名单逐 id 全等
    const wld2 = parseWld(exportWld(back));
    expect(wld2.party.celebrating).toEqual([17, 20, 208]);
    expect(wld2.party.manual).toBe(true);
    expect(wld2.party.genuine).toBe(true);
    expect(wld2.party.cooldown).toBe(4);
  });

  it('空名单写 i32(0) 且位序不错位（后续蘑菇bg/肉前矿金丝雀）', () => {
    const save = mkSave();
    save.savedOreTiers = { cobalt: 11, mythril: 12, adamantite: 13 };
    const bytes = exportWld(save);
    const wld = parseWld(bytes);
    expect(wld.party.celebrating).toEqual([]);
    // 位序金丝雀：名单段后 sandstorm 四连 → savedBartender → DD2 → bg 五连……
    // 名单错位（多写/少写/漏 count）将整体平移 → 下列字段全部失真
    expect(wld.bgMushroom).toBe(1);
    expect(wld.bgUnderworld).toBe(3);
    // treeBG2/3/4 = bgStyles.forest[1..3]（夹具 forest=[2,3,4] → 3,4,0）
    expect(wld.treeBG2).toBe(3); expect(wld.treeBG3).toBe(4); expect(wld.treeBG4).toBe(0);
    const back = parseWldToSave(bytes).save;
    expect(back.savedOreTiers).toEqual({ cobalt: 11, mythril: 12, adamantite: 13 });
    expect(back.savedOreTiers).toEqual({ cobalt: 11, mythril: 12, adamantite: 13 });
  });

  it('灯笼夜四件套回环（cooldown/genuine/manual/next）', () => {
    const save = mkSave({
      events: { partyManual: false, lanternManual: true, lanternGenuine: true, lanternNext: true, lanternCooldown: 12 },
    } as Partial<SaveData>);
    const bytes = exportWld(save);
    const wld = parseWld(bytes);
    expect(wld.lantern).toEqual({ cooldown: 12, genuine: true, manual: true, next: true });
    const back = parseWldToSave(bytes).save;
    expect(back.events?.lanternCooldown).toBe(12);
    expect(back.events?.lanternManual).toBe(true);
    expect(back.events?.lanternGenuine).toBe(true);
    expect(back.events?.lanternNext).toBe(true);
    // TreeTops 紧随灯笼夜（WF:1391）——灯笼夜错位则 TreeTops 读垃圾
    expect(wld.treeTops.length).toBe(13);
  });

  it('TreeTops：有数据透传 / 无数据按 CopyExistingWorldInfo 派生（TreeTopsInfo.cs:217-232）', () => {
    // ① 透传：header.treeTops 13 项原值
    const saveA = mkSave();
    saveA.header.treeTops = [5, 4, 3, 2, 1, 6, 7, 8, 9, 10, 11, 12, 13];
    const wldA = parseWld(exportWld(saveA));
    expect(wldA.treeTops).toEqual([5, 4, 3, 2, 1, 6, 7, 8, 9, 10, 11, 12, 13]);
    // ② 派生：无 treeTops → treeStyle[0..3] + corrupt/snow/hallow/crimson/desert/ocean/
    //    mushroom/underworldBG（jungleBG 无键落 0——WldHeaderFields 既有登记偏差）
    const saveB = mkSave();
    delete (saveB.header as { treeTops?: number[] }).treeTops;
    const wldB = parseWld(exportWld(saveB));
    expect(wldB.treeTops).toEqual([1, 2, 3, 4, 2, 0, 3, 1, 4, 2, 5, 1, 3]);
  });

  it('worldGenVersion 恒写原版常量 1395864371201（Main.cs:228/WorldFile.cs:606）', () => {
    const bytes = exportWld(mkSave());
    // header 段起 = pointers[0]；title/seed 两个 7bit 长度前缀串之后即 worldGenVersion i64
    const dv = new DataView(bytes.buffer);
    let p = dv.getInt32(26, true);   // pointers[0] = header 起点
    for (let k = 0; k < 2; k++) {    // title, seedText
      let len = 0, shift = 0;
      for (;;) { const b = bytes[p++]; len |= (b & 0x7f) << shift; if (!(b & 0x80)) break; shift += 7; }
      p += len;
    }
    expect(dv.getBigUint64(p, true)).toBe(1395864371201n);
  });

  it('manifest 落 varint 0（空串,WorldManifest.cs:31-45 容错域）+ footer worldName 一致', () => {
    const bytes = exportWld(mkSave());
    // 段位断言：header 尾（pointers[1]）前 1 字节 = manifest 长前缀 0x00
    const dv = new DataView(bytes.buffer);
    const p1 = dv.getInt32(26 + 4, true);
    expect(bytes[p1 - 1]).toBe(0);
    // footer（WF:1759）：true + worldName + worldId——名一致（官方 BadFooter 门）
    const wld = parseWld(bytes);
    expect(wld.title).toBe('FX33回环');
  });
});
