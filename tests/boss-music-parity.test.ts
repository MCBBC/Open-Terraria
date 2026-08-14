// Boss 唤起三件套对账（2026-08-14 全量审计冻结表）：
//   苏醒公告 = NPC.SpawnBoss switch（NPC.cs:81497-81513）+ SpawnOnPlayer 专项
//     （245 :81328 / 370 :81348 / 398 :81359）+ SpawnWOF :81190 + SpawnSkeletron :81269
//     + 光女踩死虹萤 661 → SpawnBoss 默认分支（:80294-80303）。
//   唤起音效 = ItemCheck_UseBossSpawners（Player.cs:43080-43232）+ 祭坛 :32322：
//     物品使用瞬间 Roar(15)（蜂后 222 = Item173 :43184）；生成路径一律无声；
//     全游戏唯一"非物品也咆哮"的生成点 = 地牢守卫 68（NPC.cs:21929-21933）。
//   战斗曲 = UpdateAudio_DecideOnNewMusic type→num3 switch（Main.cs:12196-12260）
//     + flag→MusicID 链（:12459-12503）；boss 兜底 Boss1(5)（:12283-12287）。
// 本文件字面量表 = 原版权威，防回归；改表必须先核 1456 行号。
import { describe, it, expect } from 'vitest';
import { MUSIC, BOSS_MUSIC, bossMusicFor, pickMusic, newMusicState } from '../src/data/Music';
import { INVASION_MUSIC } from '../src/world/Invasion';
import { Game } from '../src/core/Game';

/** 冻结权威表：Boss id → { announce: 公告类型, itemRoar: 物品召唤是否咆哮, music: 战斗曲 }
 *  announce: 'awoken'=Announcement.HasAwoken / 'misc48'=Lang.misc[48] 双子专项 /
 *            'moonlord'=Enemies.MoonLord / null=无公告
 *  music: 5 Boss1 为 boss 标志兜底；null=无 Boss 曲（68/551 走事件或不切曲） */
const VANILLA_TABLE: Record<number, {
  name: string; announce: 'awoken' | 'misc48' | 'moonlord' | null;
  itemRoar: boolean; music: number | null;
}> = {
  4:   { name: 'EoC',            announce: 'awoken',   itemRoar: true,  music: 5 },    // 眼球 43 :43095；boss 兜底 Boss1
  13:  { name: 'EoW head',       announce: 'awoken',   itemRoar: true,  music: 99 },   // 蠕虫食物 70 :43112
  35:  { name: 'Skeletron',      announce: 'awoken',   itemRoar: false, music: 104 },  // 老人诅咒 :81269，无咆哮
  50:  { name: 'King Slime',     announce: null,       itemRoar: true,  music: 93 },   // 王冠 560 :43080；case 50 静默
  68:  { name: 'Dungeon Guard',  announce: null,       itemRoar: false, music: null }, // 无 boss 位 :9584；生成咆哮 :21931
  113: { name: 'Wall of Flesh',  announce: 'awoken',   itemRoar: false, music: 12 },   // SpawnWOF :81190 无咆哮
  125: { name: 'Retinazer',      announce: 'misc48',   itemRoar: true,  music: 97 },   // 机械魔眼 544 :43128；misc[48] :81500
  126: { name: 'Spazmatism',     announce: null,       itemRoar: true,  music: 97 },   // case 126 静默（125 已公告）
  127: { name: 'SkeletronPrime', announce: 'awoken',   itemRoar: true,  music: 98 },   // 机械骷髅头 557 :43162（Mechdusa→25）
  134: { name: 'Destroyer',      announce: 'awoken',   itemRoar: true,  music: 92 },   // 机械蠕虫 556 :43146（Mechdusa→25）
  222: { name: 'Queen Bee',      announce: 'awoken',   itemRoar: true,  music: 96 },   // 蜂王分泌物 1133 = Item173 :43184
  245: { name: 'Golem',          announce: 'awoken',   itemRoar: true,  music: 17 },   // 能量电池祭坛 :32322 咆哮
  262: { name: 'Plantera',       announce: 'awoken',   itemRoar: false, music: 24 },   // 灯泡 WorldGen.cs:48030 无咆哮
  266: { name: 'Brain of Cth.',  announce: 'awoken',   itemRoar: true,  music: 13 },   // 血腥脊椎 1331 :43199
  370: { name: 'Duke Fishron',   announce: 'awoken',   itemRoar: false, music: 58 },   // 松露虫 :51569 无咆哮
  395: { name: 'Martian Saucer', announce: null,       itemRoar: false, music: null }, // 事件怪；曲走火星 37（INVASION_MUSIC）
  396: { name: 'MoonLord head',  announce: null,       itemRoar: false, music: 5 },    // NewNPC 生成无公告；boss 兜底 Boss1
  397: { name: 'MoonLord hand',  announce: null,       itemRoar: false, music: 5 },
  398: { name: 'MoonLord core',  announce: 'moonlord', itemRoar: false, music: 38 },   // SpawnOnPlayer :81359 + Enemies.MoonLord
  439: { name: 'LunaticCultist', announce: null,       itemRoar: false, music: 94 },   // 石碑 NewNPC :38877 无公告
  551: { name: 'Betsy',          announce: null,       itemRoar: false, music: null }, // case 551 静默；曲走 DD2 41
  636: { name: 'Empress',        announce: 'awoken',   itemRoar: false, music: 57 },   // 踩死虹萤 → SpawnBoss 默认 :80294
  657: { name: 'Queen Slime',    announce: 'awoken',   itemRoar: true,  music: 56 },   // 明胶水晶 4988 :43215
  664: { name: 'Torch God',      announce: null,       itemRoar: false, music: 5 },    // boss 兜底 Boss1；小游戏曲 101 另接
  668: { name: 'Deerclops',      announce: 'awoken',   itemRoar: true,  music: 90 },   // 鹿角怪之物 5120 :43229
};

describe('Boss 唤起三件套冻结对账（NPC.cs/Player.cs/Main.cs 1456）', () => {
  it('苏醒公告：bossSummonAnnounceKind 与 SpawnBoss switch 逐项一致', () => {
    for (const [idStr, row] of Object.entries(VANILLA_TABLE)) {
      const id = Number(idStr);
      expect(Game.bossSummonAnnounceKind(id), `${row.name}(${id})`).toBe(row.announce);
    }
  });

  it('公告静默集 = SpawnBoss case-break 组 ∪ 非 SpawnBoss 生成路径', () => {
    // ① case-break 组（NPC.cs:81505-81512）+ ② 永不经 SpawnBoss 的生成路径
    //   （68 地牢守卫 / 395 飞碟 / 439 石碑仪式 / 396/397 月总头手 / 664 火把神）
    for (const silent of [50, 82, 126, 316, 551, 662, 68, 395, 439, 396, 397, 664]) {
      expect(Game.bossSummonAnnounceKind(silent), `id ${silent}`).toBeNull();
    }
    for (const loud of [4, 13, 35, 113, 222, 245, 262, 266, 370, 636, 657, 668]) {
      expect(Game.bossSummonAnnounceKind(loud), `id ${loud}`).not.toBeNull();
    }
  });

  it('物品召唤咆哮集 = ItemCheck_UseBossSpawners 全表（蜂后 222 = Item173 例外）', () => {
    expect([...Game.BOSS_ITEM_SUMMON_ROAR].sort((a, b) => a - b))
      .toEqual([4, 13, 50, 125, 126, 127, 134, 222, 245, 266, 657, 668]);
    // 生成路径无声的 Boss 不在集内
    for (const silent of [35, 113, 262, 370, 398, 439, 551, 636]) {
      expect(Game.BOSS_ITEM_SUMMON_ROAR.has(silent), `id ${silent}`).toBe(false);
    }
  });

  it('战斗曲：bossMusicFor 与 Main.cs type→num3→MusicID 全表一致', () => {
    for (const [idStr, row] of Object.entries(VANILLA_TABLE)) {
      if (row.music === null) {
        // 68/551/395：无 boss 位/不在 switch——表内不得有专属曲（事件曲另接）
        expect(BOSS_MUSIC[Number(idStr)], `${row.name}(${idStr}) 应无 Boss 曲表项`).toBeUndefined();
        continue;
      }
      expect(bossMusicFor(Number(idStr)), `${row.name}(${idStr})`).toBe(row.music);
    }
    // 段体同曲（Main.cs case 组）
    expect(BOSS_MUSIC[14]).toBe(99);   expect(BOSS_MUSIC[15]).toBe(99);   // EoW 身/尾
    expect(BOSS_MUSIC[36]).toBe(104);                                     // 骷髅王手
    expect(BOSS_MUSIC[114]).toBe(12);                                     // 血肉墙之眼
    expect(BOSS_MUSIC[128]).toBe(98);   expect(BOSS_MUSIC[131]).toBe(98); // Prime 四臂
    expect(BOSS_MUSIC[135]).toBe(92);   expect(BOSS_MUSIC[136]).toBe(92); // 毁灭者身/尾
    expect(BOSS_MUSIC[263]).toBe(24);   expect(BOSS_MUSIC[264]).toBe(24); // 世花钩/蔓
    // Mechdusa（remix+getGood Main.cs:12288-12291 → 25）由 Game 选曲侧覆写，锚值在此
    expect(MUSIC.Boss5).toBe(25);
  });

  it('火把神小游戏曲 101 优先级：月事件 > 火把神 > Boss 曲（Main.cs:12477-12480/12914-12921）', () => {
    const base = {
      scene: { townNPCCount: 0 } as never, isDay: false,
      eventMusic: 96, worldSurface: 300, rockLevel: 500, lavaLine: 1000,
      maxTilesX: 4200, centerX: 2100 * 16, centerY: 400 * 16, state: newMusicState(),
    };
    expect(MUSIC.TorchGodInstrumental).toBe(101);
    expect(pickMusic({ ...base, torchGod: true } as never)).toBe(101);
    expect(pickMusic({ ...base, torchGod: true, moonMusic: 32 } as never)).toBe(32);
    expect(pickMusic({ ...base } as never)).toBe(96);
  });

  it('入侵/事件曲 type 表 = Main.cs switch 原文（计分表差异件逐一对上）', () => {
    for (const id of [26, 27, 28, 29, 111, 471, 472]) expect(INVASION_MUSIC[id], `goblin ${id}`).toBe(39);
    for (const id of [212, 213, 214, 215, 216, 252, 491, 662]) expect(INVASION_MUSIC[id], `pirate ${id}`).toBe(35);
    for (const id of [381, 382, 383, 384, 385, 386, 387, 388, 389, 390, 391, 392, 395, 520]) {
      expect(INVASION_MUSIC[id], `martian ${id}`).toBe(37);
    }
    for (const id of [143, 144, 145]) expect(INVASION_MUSIC[id], `snowman ${id}`).toBe(13);
    // 音乐表与计分表（GetNPCInvasionGroup）的成员差异：
    expect(INVASION_MUSIC[492]).toBeUndefined();  // 飞船炮只计分不切曲
    expect(INVASION_MUSIC[394]).toBeUndefined();  // 飞碟尾锥同
    expect(INVASION_MUSIC[143]).toBe(13);         // 雪人组曲走 Boss3 槽（与克脑 266 同 num3=3）
  });
});
