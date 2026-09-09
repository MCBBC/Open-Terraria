// ★IIIII230 永久回归：TOW(Otherworld) 选曲链（UpdateAudio_DecideOnTOWMusic,
// 1458 Main.cs:11789-12336 逐支 1:1 移植）。drunk 世界（drunkWorld && !remix &&
// !getGood,UpdateAudio :11211 派发旗）游戏内整域走本链;经典链 pickMusic 零改动。
// 派发面（Game.ts drunkTow）+ TOW num2 槽表 + 环境链谓词 + 非 drunk 零扰动哨兵。
import { describe, it, expect } from 'vitest';
import {
  pickMusic, pickTowMusic, newMusicState, MUSIC, MUSIC_SLOT, TOW_MUSIC_SLOT,
  resolveEventMusic, resolveTowEventMusic,
} from '../src/data/Music';
import { World } from '../src/world/World';
import { TILE_DEFS } from '../src/data/tiles';
import { scanScene } from '../src/world/SceneMetrics';
import type { SceneFlags } from '../src/world/SceneMetrics';

const S = (over: Partial<SceneFlags> = {}): SceneFlags =>
  ({ townNPCCount: 0, zoneGraveyard: false, zoneHallow: false, zoneCorrupt: false,
    zoneCrimson: false, zoneJungle: false, zoneSnow: false, zoneDesert: false,
    zoneDungeon: false, zoneTemple: false, zoneBeach: false, zoneMeteor: false,
    zoneGlowshroom: false, zoneUndergroundDesert: false, zoneShimmer: false,
    zoneSandstorm: false, evilTileCount: 0, bloodTileCount: 0, ...over }) as SceneFlags;

/** 地形基准：worldSurface=200/rockLevel=400/maxTilesY=1200（UnderworldLayer=1000）。
 *  centerY=3000 → 地表带（belowHalf 假）；1600 → 太空（spaceFactor<1）；16400 → 地狱 */
function towInp(over: Partial<Parameters<typeof pickTowMusic>[0]> = {}) {
  return {
    scene: S(), isDay: true, eventMusic: 0, moonMusic: 0, torchGod: false,
    worldSurface: 200, rockLevel: 400, lavaLine: 1000, maxTilesX: 4200, maxTilesY: 1200,
    centerX: 2100 * 16, centerY: 3000,
    state: newMusicState(),
    weather: { storm: false, rain: false, windy: false, timeOfDay01: 0.5 },
    ...over,
  };
}

describe('IIIII230 ①：MusicID 62-88 TOW 族常量表（MusicID.cs:207-261 逐值）', () => {
  it('27 枚 Otherworld 曲 id 与 vanilla 1:1', () => {
    const want: Record<string, number> = {
      OtherworldRain: 62, OtherworldDay: 63, OtherworldNight: 64, OtherworldUnderground: 65,
      OtherworldDesert: 66, OtherworldOcean: 67, OtherworldMushroom: 68, OtherworldDungeon: 69,
      OtherworldSpace: 70, OtherworldUnderworld: 71, OtherworldSnow: 72, OtherworldCorruption: 73,
      OtherworldUndergroundCorruption: 74, OtherworldCrimson: 75, OtherworldUndergroundCrimson: 76,
      OtherworldIce: 77, OtherworldUndergroundHallow: 78, OtherworldEerie: 79, OtherworldBoss2: 80,
      OtherworldBoss1: 81, OtherworldInvasion: 82, OtherworldLunarPillars: 83, OtherworldMoonLord: 84,
      OtherworldPlantera: 85, OtherworldJungle: 86, OtherworldWallOfFlesh: 87, OtherworldHallow: 88,
    };
    for (const [k, v] of Object.entries(want)) {
      expect((MUSIC as Record<string, number>)[k], k).toBe(v);
    }
  });
});

describe('IIIII230 ②：TOW num2 槽表（Main.cs:11819-11968 switch + 兜底）', () => {
  it('type→num2 关键差异面（与经典 num3 编号不同域）', () => {
    expect(TOW_MUSIC_SLOT[13]).toBe(1);      // EoW → 兜底族 flag
    expect(TOW_MUSIC_SLOT[113]).toBe(3);     // WoF → 87
    expect(TOW_MUSIC_SLOT[125]).toBe(2);     // 双子 → 80
    expect(TOW_MUSIC_SLOT[134]).toBe(2);     // 毁灭者探针 → 80
    expect(TOW_MUSIC_SLOT[245]).toBe(2);     // 石巨人 → 80（经典槽 4→17）
    expect(TOW_MUSIC_SLOT[262]).toBe(6);     // 世花 → 85
    expect(TOW_MUSIC_SLOT[398]).toBe(7);     // 月总 → 84
    expect(TOW_MUSIC_SLOT[422]).toBe(10);    // 星璇塔 → 83
    expect(TOW_MUSIC_SLOT[668]).toBe(16);    // 鹿角怪 → 80
    expect(TOW_MUSIC_SLOT[657]).toBe(13);    // 史后 → 80
  });
  it('骷髅王 35/史王 50/Prime 四臂 128/毁灭者体节 135 不在 TOW 表→落 boss 兜底 1→81', () => {
    expect(TOW_MUSIC_SLOT[35]).toBeUndefined();
    expect(TOW_MUSIC_SLOT[50]).toBeUndefined();
    expect(TOW_MUSIC_SLOT[128]).toBeUndefined();
    expect(TOW_MUSIC_SLOT[135]).toBeUndefined();
    expect(TOW_MUSIC_SLOT[4]).toBeUndefined();   // EoC 表外 → 兜底
    // 兜底语义（Game 侧 num2=0 && boss → 1）经 TOW_SLOT_MUSIC[1]→81 达成
    expect(resolveTowEventMusic([1])).toBe(81);
  });
  it('438/379 无静态槽（仪式态门在 Game 侧,同经典链 20 槽处理）', () => {
    expect(TOW_MUSIC_SLOT[438]).toBeUndefined();
    expect(TOW_MUSIC_SLOT[379]).toBeUndefined();
  });
  it('num2→曲映射 + first-wins（输入序首个,同经典链勘误）', () => {
    expect(resolveTowEventMusic([7])).toBe(84);    // 月总
    expect(resolveTowEventMusic([6])).toBe(85);    // 世花
    expect(resolveTowEventMusic([3])).toBe(87);    // WoF
    expect(resolveTowEventMusic([2])).toBe(80);    // 双子/石巨人/邪教徒
    expect(resolveTowEventMusic([10])).toBe(83);   // 星璇塔
    expect(resolveTowEventMusic([11])).toBe(82);   // 哥布林/雪地军团
    expect(resolveTowEventMusic([12])).toBe(82);   // OOA
    expect(resolveTowEventMusic([16])).toBe(80);   // 鹿角怪
    expect(resolveTowEventMusic([17])).toBe(81);   // Mechdusa 覆写
    expect(resolveTowEventMusic([4])).toBe(81);    // flag5 死支保留原文 81
    expect(resolveTowEventMusic([7, 3])).toBe(84); // 输入序首独占
    expect(resolveTowEventMusic([])).toBe(0);
  });
  it('经典链槽表未被 TOW 批改动（零扰动哨兵）', () => {
    expect(MUSIC_SLOT[134]).toBe(18);   // 毁灭者→92
    expect(MUSIC_SLOT[245]).toBe(4);    // 石巨人→17
    expect(resolveEventMusic([18])).toBe(92);
    expect(resolveEventMusic([4])).toBe(17);
  });
});

describe('IIIII230 ③：TOW 环境链（:12021-12333 逐支谓词）', () => {
  it('链首三域优先级：月事件 82 > 火把神 87 > boss 事件曲', () => {
    expect(pickTowMusic(towInp({ moonMusic: 30 }))).toBe(82);
    expect(pickTowMusic(towInp({ moonMusic: 32 }))).toBe(82);
    expect(pickTowMusic(towInp({ torchGod: true }))).toBe(87);
    expect(pickTowMusic(towInp({ torchGod: true, eventMusic: 84 }))).toBe(87);  // 火把神先于 boss 域
    expect(pickTowMusic(towInp({ eventMusic: 84 }))).toBe(84);
    expect(pickTowMusic(towInp({ eventMusic: 84, moonMusic: 30 }))).toBe(82);   // 月事件覆写 boss 曲
  });
  it('森林昼 63 / 夜 64（无粘性随机）;昼雨 62;夜雨仍 64（vanilla 夜支 cloud 两臂同值,与经典链 19 异）', () => {
    expect(pickTowMusic(towInp({}))).toBe(63);
    expect(pickTowMusic(towInp({ isDay: false }))).toBe(64);
    expect(pickTowMusic(towInp({ weather: { storm: false, rain: true, windy: false, timeOfDay01: 0.5 } }))).toBe(62);
    expect(pickTowMusic(towInp({ isDay: false, weather: { storm: false, rain: true, windy: false, timeOfDay01: 0.5 } }))).toBe(64);
    expect(pickTowMusic(towInp({ isDay: false, bloodMoon: true }))).toBe(79);
  });
  it('风暴 62（血月 79）——嵌槽在森林昼/神圣地表之后', () => {
    expect(pickTowMusic(towInp({ weather: { storm: true, rain: false, windy: false, timeOfDay01: 0.5 } }))).toBe(62);
    expect(pickTowMusic(towInp({ bloodMoon: true, weather: { storm: true, rain: false, windy: false, timeOfDay01: 0.5 } }))).toBe(79);
  });
  it('地狱 71 > 太空 70 的链序与深度界（UnderworldLayer=maxTilesY-200）', () => {
    expect(pickTowMusic(towInp({ centerY: 16400 }))).toBe(71);   // >1000*16
    expect(pickTowMusic(towInp({ centerY: 1600 }))).toBe(70);    // spaceFactor≈0.6<1
    expect(pickTowMusic(towInp({ centerY: 3000 }))).toBe(63);    // 地表带不进太空/地狱
  });
  it('微光 72 在沙尘暴/地狱之前（:12113 交办锚支）', () => {
    expect(pickTowMusic(towInp({ scene: S({ zoneShimmer: true }) }))).toBe(72);
    expect(pickTowMusic(towInp({ scene: S({ zoneShimmer: true, zoneSandstorm: true }), centerY: 16400 }))).toBe(72);
    // 非 drunk 经典链同场景=91 Aether,不进 72（零扰动哨兵）
    expect(pickMusic({ ...towInp({ scene: S({ zoneShimmer: true }), state: newMusicState() }) })).toBe(91);
  });
  it('神庙墙/地牢/蘑菇 69/68;地牢支在地狱支之后', () => {
    expect(pickTowMusic(towInp({ scene: S({ zoneTemple: true }) }))).toBe(69);
    expect(pickTowMusic(towInp({ scene: S({ zoneDungeon: true }) }))).toBe(69);
    expect(pickTowMusic(towInp({ scene: S({ zoneGlowshroom: true }) }))).toBe(68);
    expect(pickTowMusic(towInp({ scene: S({ zoneDungeon: true }), centerY: 16400 }))).toBe(71);
  });
  it('腐化 73/74;双邪恶共存按 BloodTileCount>EvilTileCount 分主 → 75/76', () => {
    expect(pickTowMusic(towInp({ scene: S({ zoneCorrupt: true }) }))).toBe(73);
    expect(pickTowMusic(towInp({ scene: S({ zoneCorrupt: true }), centerY: 6000 }))).toBe(74);
    expect(pickTowMusic(towInp({ scene: S({ zoneCorrupt: true, zoneCrimson: true, evilTileCount: 320, bloodTileCount: 350 }) }))).toBe(75);
    expect(pickTowMusic(towInp({ scene: S({ zoneCorrupt: true, zoneCrimson: true, evilTileCount: 320, bloodTileCount: 350 }), centerY: 6000 }))).toBe(76);
    expect(pickTowMusic(towInp({ scene: S({ zoneCorrupt: true, zoneCrimson: true, evilTileCount: 400, bloodTileCount: 350 }) }))).toBe(73);
    // 血相等（==）不成立 → 腐化主（原文严格 >）
    expect(pickTowMusic(towInp({ scene: S({ zoneCorrupt: true, zoneCrimson: true, evilTileCount: 350, bloodTileCount: 350 }) }))).toBe(73);
  });
  it('猩红 75/76;陨石/墓园 79', () => {
    expect(pickTowMusic(towInp({ scene: S({ zoneCrimson: true }) }))).toBe(75);
    expect(pickTowMusic(towInp({ scene: S({ zoneCrimson: true }), centerY: 6000 }))).toBe(76);
    expect(pickTowMusic(towInp({ scene: S({ zoneMeteor: true }) }))).toBe(79);
    expect(pickTowMusic(towInp({ scene: S({ zoneGraveyard: true }) }))).toBe(79);
  });
  it('丛林 86（TOW 无昼夜分域）;雪原地表 72 / 地下 77', () => {
    expect(pickTowMusic(towInp({ scene: S({ zoneJungle: true }) }))).toBe(86);
    expect(pickTowMusic(towInp({ scene: S({ zoneSnow: true }) }))).toBe(72);
    expect(pickTowMusic(towInp({ scene: S({ zoneSnow: true }), centerY: 6000 }))).toBe(77);
    // remix 变体（TOW 链内 remix 支仅派对女孩换乐可达,谓词仍 1:1 移植）
    const remix = { remix: true };
    expect(pickTowMusic(towInp({ ...remix, scene: S({ zoneJungle: true }) }))).toBe(70);
    expect(pickTowMusic(towInp({ ...remix, scene: S({ zoneSnow: true }) }))).toBe(70);          // 地表带
    expect(pickTowMusic(towInp({ ...remix, scene: S({ zoneSnow: true }), centerY: 5600 }))).toBe(77); // 5600<rock*16+400=6800 且 >worldSurface*16+400=3600 → 77
    expect(pickTowMusic(towInp({ ...remix, scene: S({ zoneSnow: true }), centerY: 12000 }))).toBe(72); // ≥rock 带（<16000 不吃地狱支）
  });
  it('地下带 65 / 地下沙漠 66 / 神圣地下 78;神圣地表昼 88（雨 62）', () => {
    expect(pickTowMusic(towInp({ centerY: 6000 }))).toBe(65);
    expect(pickTowMusic(towInp({ centerY: 6000, scene: S({ zoneUndergroundDesert: true }) }))).toBe(66);
    expect(pickTowMusic(towInp({ centerY: 6000, scene: S({ zoneHallow: true }) }))).toBe(78);
    expect(pickTowMusic(towInp({ scene: S({ zoneHallow: true }) }))).toBe(88);
    expect(pickTowMusic(towInp({ scene: S({ zoneHallow: true }), weather: { storm: false, rain: true, windy: false, timeOfDay01: 0.5 } }))).toBe(62);
    // 神圣地表**夜**不在此域 → 落链尾 64（vanilla 原样,TOW 无神圣夜曲支）
    expect(pickTowMusic(towInp({ isDay: false, scene: S({ zoneHallow: true }) }))).toBe(64);
  });
  it('海洋深渊 67（血月 79）;沙漠地表 66;日食谓词 = 地表半屏带严格 <', () => {
    expect(pickTowMusic(towInp({ scene: S({ zoneBeach: true }) }))).toBe(67);
    expect(pickTowMusic(towInp({ scene: S({ zoneBeach: true }), bloodMoon: true }))).toBe(79);
    expect(pickTowMusic(towInp({ scene: S({ zoneDesert: true }) }))).toBe(66);
    expect(pickTowMusic(towInp({ eclipse: true }))).toBe(79);
    // 非 remix 日食地下带不吃 79 → 落地下曲（:12097 严格 < + :12101 仅 remix 兜底）
    expect(pickTowMusic(towInp({ eclipse: true, centerY: 6000 }))).toBe(65);
    expect(pickTowMusic(towInp({ eclipse: true, remix: true, centerY: 6000 }))).toBe(79);
  });
  it('八音盒覆写两链同表（:11232+ 链后覆盖,drunk 不变域）', () => {
    expect(pickTowMusic(towInp({ musicBox: 0 }))).toBe(1);
    expect(pickTowMusic(towInp({ musicBox: 100 }))).toBe(0);
  });
});

describe('IIIII230 ④：非 drunk 零扰动（经典链行为面）', () => {
  it('森林昼 1/18、夜 3、地狱 36、太空 42/15——TOW 批不改经典链输出', () => {
    const cls = towInp();
    const day = pickMusic(cls);
    expect([MUSIC.OverworldDay, MUSIC.OverworldDayAlt]).toContain(day);
    expect(day).not.toBe(63);   // 非 63 OtherworldDay
    expect(pickMusic({ ...cls, isDay: false })).toBe(MUSIC.OverworldNight);
    expect(pickMusic({ ...cls, centerY: 16400 })).toBe(MUSIC.Underworld);
    expect(pickMusic({ ...cls, centerY: 1600 })).toBe(MUSIC.SpaceDay);
    expect(pickMusic({ ...cls, centerY: 6000, state: { ugMusic: 4, dayMusic: 1 } })).toBe(MUSIC.Underground);
  });
  it('经典链不返回 TOW 族 62-88（既有场景矩阵抽查）', () => {
    const scenes = [
      S({ zoneShimmer: true }), S({ zoneCorrupt: true }), S({ zoneCrimson: true }),
      S({ zoneJungle: true }), S({ zoneSnow: true }), S({ zoneHallow: true }),
      S({ zoneDungeon: true }), S({ zoneBeach: true }), S({ zoneDesert: true }),
      S({ zoneGlowshroom: true }), S({ zoneMeteor: true }), S({ zoneGraveyard: true }),
    ];
    for (const scene of scenes) {
      for (const isDay of [true, false]) {
        for (const centerY of [3000, 6000, 16400]) {
          const m = pickMusic({ ...towInp({ scene, isDay, centerY, eventMusic: 0, moonMusic: 0, torchGod: false, musicBox: -1 }) });
          expect(m === 0 || (m >= 1 && m <= 61) || (m >= 89 && m <= 104), `scene=${JSON.stringify(scene).slice(0, 60)} y=${centerY} m=${m}`).toBe(true);
        }
      }
    }
  });
});

describe('IIIII230 ⑤：SceneMetrics evilTileCount/bloodTileCount 出口（ZoneScanSize 窗终值）', () => {
  const sheetId = (sheet: number): number => {
    for (let i = 0; i < TILE_DEFS.length; i++) if (TILE_DEFS[i]?.vanilla?.sheet === sheet) return i;
    throw new Error(`sheet ${sheet} 未注册`);
  };
  it('纯腐化块：evilTileCount≥300 → zoneCorrupt,血计 0', () => {
    const w = new World(80, 60, 30, 'open');
    const ebon = sheetId(23);
    for (let y = 10; y < 30; y++) for (let x = 20; x < 40; x++) w.store.setTileSilent(x, y, ebon, 0, 0);
    const sc = scanScene(w, 30 * 16, 20 * 16, 0);
    expect(sc.zoneCorrupt).toBe(true);
    expect(sc.evilTileCount).toBeGreaterThanOrEqual(300);
    expect(sc.bloodTileCount).toBe(0);
  });
  it('双邪恶共存：血块更大 → bloodTileCount>evilTileCount（TOW 75/76 分主判据源）', () => {
    const w = new World(80, 60, 30, 'open');
    const ebon = sheetId(23), crim = sheetId(199);
    for (let y = 10; y < 30; y++) for (let x = 20; x < 40; x++) w.store.setTileSilent(x, y, ebon, 0, 0);
    for (let y = 10; y < 32; y++) for (let x = 45; x < 68; x++) w.store.setTileSilent(x, y, crim, 0, 0);
    const sc = scanScene(w, 40 * 16, 20 * 16, 0);
    expect(sc.zoneCorrupt).toBe(true);
    expect(sc.zoneCrimson).toBe(true);
    expect(sc.bloodTileCount).toBeGreaterThan(sc.evilTileCount);
    expect(pickTowMusic(towInp({ scene: S({ zoneCorrupt: true, zoneCrimson: true, evilTileCount: sc.evilTileCount, bloodTileCount: sc.bloodTileCount }) }))).toBe(75);
  });
});
