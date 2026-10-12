// ★BJ664（2026-10-10 用户实报「右键施法桌的时候没有音效」+ 战争桌/蛋糕块并案）
// 工位家具右键音效 1:1 锁。债源 = 工位音分流旧档「非三站恒 drink(Item_3)」：
//   · 原版七站音各异（Player.cs TileInteractionsUse :32839-32880）——水晶球
//     125→Item4(:32843)/蛋糕 621→Item2(:32849)/战争桌 464→Item4(:32855)/
//     药水站 699→Item179(:32861)/磨刀石 377→Item37(:32867)/附魔台 354→Item4(:32873)/
//     弹药箱 287→Item149(:32879)；旧档水晶球/战争桌/附魔台/蛋糕四站全放 Item_3
//     （药水饮用音）= 错档占位（有音但非原版音，用户实报面）。
//   · 第二参原版全站恒 `position`=玩家坐标——旧 tile 坐标多一重距离衰减。
//   · 日晷/月晷右键同族（:32887/:32896 Item4），旧档同 drink 错档。
//   · 导线路径翻案：Wiring.cs:1149-1175 case 356/663 → Main.Sundialing/Moondialing
//     （Main.cs:6304-6331）全链【无 PlaySound】——Item4 只在右键臂体内；旧档导线
//     timeSkip 挂 'drink' = 原版没有的多余音，撤。
// 音量修正面：Item_37 ×0.5 已在 FILE_CASE_VOL（LegacySoundPlayer.cs:567）；Item2/
// Item4/Item149/Item179 无 case 2 修正。素材 Item_2/3/4/37/149/179 均在盘
// （public/sounds/，opus+mp3 双档）。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { World } from '../src/world/World';
import { Game } from '../src/core/Game';
import { TILE_BY_KEY } from '../src/data/tiles';
import { TILE } from '../src/core/constants';
import { Wiring } from '../src/world/Wiring';
import { BuffType } from '../src/stats/Buffs';

const gameSrc = readFileSync(new URL('../src/core/Game.ts', import.meta.url), 'utf8');

// 原版七站+日晷/月晷音面表：[站名, 原版音, 原版锚行, 本仓 tile key, 预期 buff, 预期秒]
const STATIONS: Array<{
  name: string; wav: string; anchor: string; key: string;
  buff?: BuffType; sec?: number;
}> = [
  { name: '水晶球 125', wav: 'Item_4', anchor: 'Player.cs:32843', key: 'v_125_crystal_ball', buff: BuffType.Clairvoyance, sec: 1800 },
  { name: '附魔台 354', wav: 'Item_4', anchor: 'Player.cs:32873', key: 'v_354_bewitching_table', buff: BuffType.Bewitched, sec: 1800 },
  { name: '战争桌 464', wav: 'Item_4', anchor: 'Player.cs:32855', key: 'v_464_war_table', buff: BuffType.WarTable, sec: 1800 },
  { name: '蛋糕 621', wav: 'Item_2', anchor: 'Player.cs:32849', key: 'v_621_slice_of_cake', buff: BuffType.SugarRush, sec: 120 },
  { name: '磨刀石 377', wav: 'Item_37', anchor: 'Player.cs:32867', key: 'v_377_sharpening_station', buff: BuffType.Sharpened, sec: 1800 },
  { name: '弹药箱 287', wav: 'Item_149', anchor: 'Player.cs:32879', key: 'v_287_ammo_box', buff: BuffType.AmmoBox, sec: 1800 },
  { name: '药水站 699', wav: 'Item_179', anchor: 'Player.cs:32861', key: 'v_699_alchemy_flask', buff: BuffType.DeadCellsPotionStation, sec: 1800 },
];

function mkWorld(): World {
  return new World(80, 60, 7, 'bj664');
}

/** shell 直驱 interactAt（BJ250 同款夹具族）——sfx 口全录（名+坐标） */
function bjShell(w: World, px = 30 * TILE, py = 30 * TILE) {
  const g = Object.create(Game.prototype) as unknown as
    Record<string, unknown> & { interactAt(tx: number, ty: number): void };
  const sfxFiles: Array<{ name: string; x?: number; y?: number }> = [];
  const sfxNamed: string[] = [];
  const buffs: Array<[BuffType, number]> = [];
  const wiring = new Wiring(w.store);
  g.world = w;
  g.wiring = wiring;
  g.input = { rightDown: true };
  g.netCanEditTile = () => true;
  g.inTileRange = () => true;
  g.entities = { projectiles: [], enemies: [], npcs: [], critters: [], add: () => {} };
  g.player = {
    cx: px, cy: py, x: px - 6, y: py - 14, w: 12, h: 28,
    isGhostPhase: () => false,
    snowballLauncherInteractionCooldown: 0,
    buffs: { apply: (t: BuffType, d: number) => buffs.push([t, d]) },
    inv: { slots: [] as Array<{ id: number; stack: number } | null> },
  };
  g.playSfxFile = (name: string, _v?: number, x?: number, y?: number) => { sfxFiles.push({ name, x, y }); };
  g.sfxAt = (name: string) => { sfxNamed.push(name); };
  g.sfx = { play: (n: string) => { sfxNamed.push(n); } };
  g.cb = { onInventoryChanged: () => {} };
  return { g, sfxFiles, sfxNamed, buffs };
}

describe('BJ664 结构锁：七站+日晷/月晷原版音面标记', () => {
  it('工位音分流臂逐站标记在盘（缺失=分流表回退,爆红）', () => {
    for (const s of STATIONS) {
      expect(gameSrc, `${s.name}（${s.anchor}）音标记缺失`).toContain(`playSfxFile('${s.wav}'`);
    }
    // 125/354/464 三站共占 Item_4 else 兜底臂（分流尾）
    expect(gameSrc).toContain("else this.playSfxFile('Item_4', 1, this.player.cx, this.player.cy);");
  });

  it('日晷/月晷右键臂 Item_4 标记在盘（:32887/:32896）', () => {
    expect(gameSrc).toContain("this.playSfxFile('Item_4', 1, this.player.cx, this.player.cy); // SoundID.Item4（:32887/:32896");
  });

  it('工位臂/日晷臂不再有 drink 占位（错档音回归=爆红）', () => {
    const armStart = gameSrc.indexOf("工位音分流（★BJ664");
    expect(armStart, 'BJ664 工位音分流注缺失').toBeGreaterThan(0);
    const armBlock = gameSrc.slice(armStart, gameSrc.indexOf('this.cb.onInventoryChanged()', armStart));
    expect(armBlock).not.toContain("sfx.play('drink')");
    expect(armBlock).not.toContain("sfx.play('drink')");
    const sundialStart = gameSrc.indexOf("|| type === TILE_BY_KEY['v_663_enchanted_moondial']) {");
    const sundialBlock = gameSrc.slice(sundialStart, gameSrc.indexOf("} else if (type === TILE_BY_KEY['v_494_golf_tee'])", sundialStart));
    expect(sundialBlock).not.toContain("sfx.play('drink')");
  });

  it('导线 timeSkip 臂无音（原版 Main.Sundialing/Wiring 触发链零 PlaySound）', () => {
    const tsStart = gameSrc.indexOf("timeSkip: (kind: 'dawn' | 'dusk')");
    expect(tsStart, 'timeSkip 臂缺失').toBeGreaterThan(0);
    const tsBlock = gameSrc.slice(tsStart, gameSrc.indexOf('dropItem:', tsStart));
    expect(tsBlock, '导线路径多余音回归（原版无声）').not.toContain('sfx.play(');
    expect(tsBlock).not.toContain('playSfxFile(');
  });
});

describe('BJ664 行为锁：七站右键音+buff+位次（shell 直驱 interactAt）', () => {
  for (const s of STATIONS) {
    it(`${s.name} 右键 → ${s.wav}（${s.anchor}）+ 玩家坐标 + ${s.buff === undefined ? '—' : 'buff'}${s.sec !== undefined ? `${s.sec}s` : ''}`, () => {
      const w = mkWorld();
      const tid = TILE_BY_KEY[s.key];
      expect(tid, `tile def 缺 ${s.key}`).toBeDefined();
      w.store.setTileSilent(10, 20, tid, 0, 0);
      const { g, sfxFiles, sfxNamed, buffs } = bjShell(w);
      g.interactAt(10, 20);
      // 音：恰一发、名对、坐标=玩家（原版第二参 position）
      const hits = sfxFiles.filter((f) => f.name === s.wav);
      expect(hits.length, `${s.name} 应恰播一发 ${s.wav}`).toBe(1);
      expect(hits[0]!.x).toBe(30 * TILE);
      expect(hits[0]!.y).toBe(30 * TILE);
      // 无错档音（Item_3/drink 族禁入工位面）
      expect(sfxNamed.filter((n) => n === 'drink')).toEqual([]);
      expect(sfxFiles.some((f) => f.name === 'Item_3')).toBe(false);
      // buff 面（右键授予同拍）
      if (s.buff !== undefined) expect(buffs).toEqual([[s.buff, s.sec]]);
    });
  }
});

describe('BJ664 行为锁：日晷/月晷右键（Player.cs:32881-32898）', () => {
  it('日晷 356 冷却 0 → 快进置位 + 冷却 8 + Item_4 一发（玩家坐标）', () => {
    const w = mkWorld();
    w.store.setTileSilent(10, 20, TILE_BY_KEY['v_356_enchanted_sundial'], 0, 0);
    const { g, sfxFiles, sfxNamed } = bjShell(w);
    g.interactAt(10, 20);
    expect(w.fastForwardTimeToDawn).toBe(true);
    expect(w.sundialCooldown).toBe(8);
    const hits = sfxFiles.filter((f) => f.name === 'Item_4');
    expect(hits.length).toBe(1);
    expect(hits[0]!.x).toBe(30 * TILE);
    expect(hits[0]!.y).toBe(30 * TILE);
    expect(sfxNamed.filter((n) => n === 'drink')).toEqual([]);
  });

  it('月晷 663 冷却 0 → fastForwardTimeToDusk + 冷却 8 + Item_4', () => {
    const w = mkWorld();
    w.store.setTileSilent(10, 20, TILE_BY_KEY['v_663_enchanted_moondial'], 0, 0);
    const { g, sfxFiles } = bjShell(w);
    g.interactAt(10, 20);
    expect(w.fastForwardTimeToDusk).toBe(true);
    expect(w.moondialCooldown).toBe(8);
    expect(sfxFiles.filter((f) => f.name === 'Item_4').length).toBe(1);
  });

  it('冷却中右键 → 不快进不播音（原版 if 门包住 Sundialing+PlaySound 整块）', () => {
    const w = mkWorld();
    w.store.setTileSilent(10, 20, TILE_BY_KEY['v_356_enchanted_sundial'], 0, 0);
    w.sundialCooldown = 3;
    const { g, sfxFiles } = bjShell(w);
    g.interactAt(10, 20);
    expect(w.fastForwardTimeToDawn).toBe(false);
    expect(sfxFiles.length).toBe(0);
  });
});

describe('BJ664 素材面：音档在盘（playWav 取数前提）', () => {
  it('Item_2/4/37/149/179 原版素材 opus 档在盘', async () => {
    const { readdir } = await import('node:fs/promises');
    const files = new Set(await readdir(new URL('../public/sounds/', import.meta.url)));
    for (const wav of ['Item_2', 'Item_4', 'Item_37', 'Item_149', 'Item_179', 'Item_4']) {
      expect(files.has(`${wav}.opus`), `${wav}.opus 缺盘`).toBe(true);
    }
  });
});
