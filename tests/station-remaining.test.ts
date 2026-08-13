// C 组收尾三项回归：八音盒（录音/放置/播放/掉落）、水喷泉（十色表/放置/掉落）、
// 广播盒（锚点定位/粉色公告/无牌静默）。
// 对照源码：
//   录音   Player.cs:15053-15366（ApplyEquipFunctional 装备空盒 576 掷 1/540）
//   掉落   WorldGen.cs:43138-43366 GetItemDrop_MusicBoxes / :38199-38226 Check2xX case 207
//   放置帧 Item.cs DefaultToMusicBox(placeStyle) + SceneMetrics.cs:474 frameY/36
//   播放   Main.cs:11002-11405 ActiveMusicBox 覆盖（Music.pickMusic 消费）
//   喷泉色 SceneMetrics.cs:487-523 → Main.cs:56760-56762 水色短路
//   广播盒 Wiring.cs:1177-1230（Sign.ReadSign + NewTextMultiline pink 460）
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { World } from '../src/world/World';
import { Wiring } from '../src/world/Wiring';
import {
  deviceTable, type DeviceCtx,
  MUSIC_BOX_ITEM_BY_STYLE, MUSIC_BOX_EMPTY_VID,
  musicBoxRecordItem, musicBoxDropItemOf, fountainDropItemOf,
  FOUNTAIN_ITEM_BY_STYLE, fountainColorOf,
  announcementBoxMessage, announcementBoxBroadcast,
} from '../src/world/wiring/devices';
import { furnitureStyleBase } from '../src/world/FurnitureStyle';
import { scanScene, EMPTY_SCENE } from '../src/world/SceneMetrics';
import { pickMusic, newMusicState, MUSIC } from '../src/data/Music';
import { ITEM_DEFS, ITEM_BY_KEY, VANILLA_ITEM_KEY_BY_ID } from '../src/data/items';
import { TILE_BY_KEY } from '../src/data/tiles';

function makeCtx(over?: Partial<DeviceCtx>): DeviceCtx {
  return {
    dropItem: () => {}, spawnNpc: () => true, mechSpawnOk: () => true, itemSpawnOk: () => true,
    shootProjectile: () => {}, countProjectiles: () => 0,
    doorOpen: () => true, doorClose: () => true, teleportPair: () => {},
    relocateTownNpc: () => true, explode: () => {}, toast: () => {}, sfx: () => {},
    extractinatorPull: () => null, dropItemStack: () => {},
    worldSurface: 100,
    ...over,
  };
}

function freshWiring() {
  const world = new World(80, 80, 7, 'open');
  return { world, w: new Wiring(world.store) };
}

/** 放 2×2 广播盒（tile 425）：frameX/Y = 列/行 * 18 */
function placeAnnouncementBox(w: Wiring, ox: number, oy: number) {
  const t = TILE_BY_KEY['v_425_announcementbox']!;
  for (let cx = 0; cx < 2; cx++) {
    for (let cy = 0; cy < 2; cy++) {
      w.st.setTileSilent(ox + cx, oy + cy, t, cx * 18, cy * 18);
    }
  }
}

/** 放 2×4 喷泉（tile 207）：style s → frameX = s*36 + 列*18；on=true 时 frameY = 72+行*18 */
function placeFountain(w: Wiring, ox: number, oy: number, style: number, on = false) {
  const t = TILE_BY_KEY['v_207_water_fountains']!;
  for (let cx = 0; cx < 2; cx++) {
    for (let cy = 0; cy < 4; cy++) {
      w.st.setTileSilent(ox + cx, oy + cy, t, style * 36 + cx * 18, (on ? 72 : 0) + cy * 18);
    }
  }
}

// ================= 八音盒 =================
describe('八音盒（tile 139）', () => {
  it('录音目标表（Player.cs:15053-15366 if-chain 逆映射 + WorldGen.cs:43138）', () => {
    expect(MUSIC_BOX_EMPTY_VID).toBe(576);          // 空盒 ItemID.MusicBox
    expect(MUSIC_BOX_ITEM_BY_STYLE).toHaveLength(101); // style 0-100 全量
    // style 0-12 → 562+style；13-27 → 1596+style-13；离散段抽样
    expect(musicBoxRecordItem(MUSIC.OverworldDay)).toBe(562);   // curMusic 1 → style 0
    expect(musicBoxRecordItem(MUSIC.OverworldNight)).toBe(564); // curMusic 3 → style 2
    expect(musicBoxRecordItem(MUSIC.Snow)).toBe(1596);          // curMusic 14 → style 13
    expect(musicBoxRecordItem(MUSIC.Eclipse)).toBe(1609);       // curMusic 27 → style 27
    expect(musicBoxRecordItem(MUSIC.WindyDay)).toBe(4082);      // curMusic 44 → style 40
    expect(musicBoxRecordItem(MUSIC.Skeletron)).toBe(6144);     // curMusic 104 → style 98
  });

  it('录音门：MusicID.Sets.CanBeRecorded 排除 {0,28,45,102}（MusicID.cs:9）+ 无映射曲静默', () => {
    for (const bad of [0, 28, 45, 102]) expect(musicBoxRecordItem(bad)).toBe(-1);
    expect(musicBoxRecordItem(50)).toBe(-1);   // TitleIntro 可录但 if-chain 无分支
    expect(musicBoxRecordItem(-1)).toBe(-1);
    expect(musicBoxRecordItem(106)).toBe(-1);  // > maxMusic 105（Main.cs:435）
  });

  it('放置帧：furnitureStyleBase(139) 竖排 frameY = style*36（Item.cs DefaultToMusicBox）', () => {
    for (const s of [0, 1, 13, 27, 50, 99, 100]) {
      expect(furnitureStyleBase(139, s, 2)).toEqual([0, s * 36]);
    }
  });

  it('唱片物品全量注册：tile 139 + placeStyle=style（Item.cs createTile=139）', () => {
    for (const s of [0, 13, 40, 50, 85, 99]) {
      const key = VANILLA_ITEM_KEY_BY_ID[MUSIC_BOX_ITEM_BY_STYLE[s]!]!;
      const def = ITEM_DEFS[ITEM_BY_KEY[key]]!;
      expect(def.tile).toBe('v_139_musicboxes');
      expect(def.placeStyle).toBe(s);
      // 1456 堆叠改制：CommonMaxStack=9999 默认、唱片无逐物品覆盖（曾 .toBe(1) 陈旧）
      expect(def.maxStack).toBe(9999);
    }
    // 6145 彩虹巨石/6146 静音盒（无素材不在 vanilla.json）单独注册：style 99/100
    for (const [vid, style] of [['6145', 99], ['6146', 100]] as const) {
      const def = ITEM_DEFS[ITEM_BY_KEY[`vi_${vid}_MusicBox${vid === '6146' ? 'Silence' : 'RainbowBoulder'}`]!]!;
      expect(def.tile).toBe('v_139_musicboxes');
      expect(def.placeStyle).toBe(style);
    }
  });

  it('掉落表（WorldGen.cs GetItemDrop_MusicBoxes）：style→唱片；越界兜底空盒 576', () => {
    expect(musicBoxDropItemOf(0)).toBe(562);
    expect(musicBoxDropItemOf(13)).toBe(1596);
    expect(musicBoxDropItemOf(50)).toBe(4421);
    expect(musicBoxDropItemOf(100)).toBe(6146);
    expect(musicBoxDropItemOf(999)).toBe(576);   // CheckMB 兜底 result=576
  });

  it('播放覆盖（Main.cs:11002-11405）：通电后 style→MusicID，style 100 = 静音', () => {
    const base = {
      scene: EMPTY_SCENE,
      worldSurface: 200, rockLevel: 400, lavaLine: 600, maxTilesX: 4200,
      centerX: 3000, centerY: 3000, state: newMusicState(), bossMusic: 0,
    };
    // 通电 style 40 → WindyDay 44（覆盖森林白天曲）
    expect(pickMusic({ ...base, musicBox: 40, isDay: true })).toBe(44);
    // style 100 → 静音（MusicBoxSilence → newMusic=0）
    expect(pickMusic({ ...base, musicBox: 100, isDay: true })).toBe(MUSIC.None);
    // 未通电 -1 → 正常环境选曲
    expect(pickMusic({ ...base, musicBox: -1, isDay: true })).not.toBe(44);
  });

  it('通电帧翻转（Wiring.cs:2019-2022 → WorldGen.SwitchMB）', () => {
    const { w } = freshWiring();
    const t = TILE_BY_KEY['v_139_musicboxes']!;
    w.st.setTileSilent(10, 20, t, 0, 3 * 36);   // style 3 off 锚点
    w.st.setTileSilent(11, 20, t, 18, 3 * 36);
    w.st.setTileSilent(10, 21, t, 0, 3 * 36 + 18);
    w.st.setTileSilent(11, 21, t, 18, 3 * 36 + 18);
    expect(deviceTable(w, makeCtx(), 139, 11, 21)).toBe(true); // 右下格触发整块
    expect(w.st.frameX[w.st.idx(10, 20)]).toBe(36);            // +36 = on 带
    expect(w.st.frameY[w.st.idx(10, 20)]).toBe(3 * 36);        // 曲目帧不动
  });
});

// ================= 水喷泉 =================
describe('水喷泉（tile 207）', () => {
  it('十色全表（SceneMetrics.cs:488-523 frameX/36 → ActiveFountainColor）', () => {
    const expected = [0, 12, 3, 5, 2, 10, 4, 9, 8, 6]; // 普通/沙漠/丛林/冰雪/腐化/猩红/神圣/血月/洞穴/绿洲
    for (let s = 0; s < 10; s++) {
      expect(fountainColorOf(s * 36, 72)).toBe(expected[s]); // on 帧（frameY≥72）
      expect(fountainColorOf(s * 36, 0)).toBe(-1);          // off 帧
    }
    // 表外 style → -1（SceneMetrics default 分支 ActiveFountainColor=-1 由扫描侧保持）
    expect(fountainColorOf(10 * 36, 72)).toBe(-1);
  });

  it('换色链：SceneMetrics 扫描读出 fountainColor（扫描窗内 on 帧生效）', () => {
    const { world, w } = freshWiring();
    const playerTile = { x: 40 * 16 + 8, y: 40 * 16 + 8 };
    expect(scanScene(world, playerTile.x, playerTile.y, 0).fountainColor).toBe(-1);
    placeFountain(w, 38, 36, 6, true);   // 神圣喷泉 on 帧（style 6 → 水色 4 Hallow）
    const f = scanScene(world, playerTile.x, playerTile.y, 0);
    expect(f.fountainColor).toBe(4);
  });

  it('喷泉物品全量注册 + 掉落表（Item.cs createTile=207 / Check2xX :38199-38226）', () => {
    expect(FOUNTAIN_ITEM_BY_STYLE).toEqual([909, 910, 940, 941, 942, 943, 944, 945, 4922, 4417]);
    for (const s of [0, 1, 2, 7, 8, 9]) {
      const key = VANILLA_ITEM_KEY_BY_ID[FOUNTAIN_ITEM_BY_STYLE[s]!]!;
      const def = ITEM_DEFS[ITEM_BY_KEY[key]]!;
      expect(def.tile).toBe('v_207_water_fountains');
      expect(def.placeStyle).toBe(s);
      expect(fountainDropItemOf(s)).toBe(FOUNTAIN_ITEM_BY_STYLE[s]);
    }
    expect(fountainDropItemOf(10)).toBe(-1);   // Check2xX default：表外不掉
    // 放置帧 X 向：fw=2 → style*36（FurnitureStyle default 分支）
    expect(furnitureStyleBase(207, 9, 2)).toEqual([9 * 36, 0]);
  });

  it('通电换档帧翻转（Wiring.cs:2023 → WorldGen.SwitchFountain）', () => {
    const { w } = freshWiring();
    placeFountain(w, 10, 20, 5);
    expect(deviceTable(w, makeCtx(), 207, 11, 23)).toBe(true); // 右下格触发整块
    expect(w.st.frameY[w.st.idx(10, 20)]).toBe(72);            // +72 = on 带
    expect(w.st.frameX[w.st.idx(10, 20)]).toBe(5 * 36);        // 水色帧不动
    expect(fountainColorOf(5 * 36, 72)).toBe(10);              // 猩红水
  });
});

// ================= 广播盒 =================
describe('广播盒（tile 425，Wiring.cs:1177-1230）', () => {
  it('触发定位：帧内偏移回算 2×2 锚点后交引擎读牌（:1179-1183）', () => {
    const { w } = freshWiring();
    placeAnnouncementBox(w, 10, 20);
    let got: [number, number] | null = null;
    expect(deviceTable(w, makeCtx({ announce: (x, y) => { got = [x, y]; } }), 425, 11, 21)).toBe(true);
    expect(got).toEqual([10, 20]);   // 右下格触发 → 锚点 (10,20)
    expect(deviceTable(w, makeCtx({ announce: () => {} }), 425, 10, 20)).toBe(true); // 锚点格也可触发
  });

  it('读 sign + 粉色公告：NewTextMultiline(text, Color.Pink, 460)（:1204-1216）', () => {
    const signs = [{ x: 10, y: 20, text: '欢迎来到沙盒世界！' }];
    const msg = announcementBoxMessage(signs, 10, 20);
    expect(msg).not.toBeNull();
    expect(msg!.text).toBe('欢迎来到沙盒世界！');
    expect(msg!.r).toBe(255);   // Color.Pink = (255,105,180)
    expect(msg!.g).toBe(105);
    expect(msg!.b).toBe(180);
    expect(msg!.width).toBe(460); // NewTextMultiline WidthLimit
  });

  it('无 sign / 空白文本静默（:1208-1211 return）', () => {
    expect(announcementBoxMessage([], 10, 20)).toBeNull();          // 无登记
    expect(announcementBoxMessage([{ x: 10, y: 20, text: '   ' }], 10, 20)).toBeNull(); // IsNullOrWhiteSpace
    expect(announcementBoxMessage([{ x: 11, y: 20, text: 'x' }], 10, 20)).toBeNull();   // 锚点精确匹配
    expect(announcementBoxBroadcast(null)).toBeNull();
    expect(announcementBoxBroadcast('')).toBeNull();
  });
});

// ================= i18n =================
describe('i18n 键（tools/l10n-custom → public/l10n）', () => {
  const here = fileURLToPath(new URL('.', import.meta.url));
  it('广播盒编辑面板键 zh-Hans/en-US 双语齐备', () => {
    for (const cult of ['zh-Hans', 'en-US']) {
      const pack = JSON.parse(readFileSync(`${here}../public/l10n/${cult}.json`, 'utf8')) as {
        Mods: Record<string, string>;
      };
      for (const k of ['Title', 'Hint', 'Placeholder', 'Save']) {
        const v = pack.Mods[`SandboxWorld.Sign.${k}`];
        expect(typeof v, `${cult} Sign.${k}`).toBe('string');
        expect((v ?? '').length, `${cult} Sign.${k}`).toBeGreaterThan(0);
      }
    }
  });
});
