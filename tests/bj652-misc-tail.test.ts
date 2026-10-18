// BJ652 杂件批四件判别测试（2026-10-12）：
//   件1 449/450/451 彩带族 rope 旗补装（Main.tileRope Main.cs:9458-9460,BJ644 504 先例
//       同构）——tiles.ts def.rope 数据面 + Player.rawRopeAt 攀爬行为面。
//   件2 VanillaFraming tileRope 外员摘除 {42,223,314,345} + isRopeAt 重写（域错+语义错
//       双定谳）——VANILLA_TILE_ROPE 九件全等 + 帧行为面（异型绳链/绳穿平台双锚/
//       钛矿·蜂蜜瀑布脱 rope 支）+ Player.ts GetRopeEnds 穿行勘正 era guard。
//   件3 wet 灭火门（ItemCheck_CheckCanUse_Inner Player.cs:52751）——四弹型数据面
//       （85 Flames←506 喷火器/1910 精灵熔炉、15 BallOfFire←112 火花之花、
//       34 Flamelash←218 火焰鞭、1122 红闪电←6173 电弧涌动）+ updateUse 行为面
//       （湿=禁用/岩浆湿=豁免/干=正常发射）。
//   件4 PlayHurtSound mount/狼人支（Player.cs:38946-38982,BJ598 B3 待办销案）——
//       hurtVoicePlan 五坐骑音/狼人音/位次三层 + DST 门跳过面 + 音频资产在库。
//   件5 两验证定谳证据：5a z1-A7 重锚依据（643 volley=真 644 爆裂弹实体,t=30 引爆面
//       ——BJ639 批 1② 重建后旧「单拍即 steal」期望随行退役）;5b bj378 三红定谳
//       （BJ517⑥/BJ592 两处合法 newGore 调用点入 universe,金标重冻捕获）。
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
// ★C档可移植:仓库外依赖(game/ 兄弟目录,clone 侧缺=正常形态)——缺则本文件 skip,本机在=真跑零语义变化
const EXT_MISSING = !['Terarria1457'].every((d) => existsSync(new URL(`../../${d}`, import.meta.url)));
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TileStore } from '../src/world/TileStore';
import { TILE_DEFS, TILE_BY_KEY, TILE_INTERNAL_BY_SHEET } from '../src/data/tiles';
import { itemCombat } from '../src/data/vanillaItemCombat';
import { VANILLA_TILE_ROPE, vanillaFrameFor, setVanillaSolidTables } from '../src/render/VanillaFraming';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { Game } from '../src/core/Game';
import { World } from '../src/world/World';
import { ITEM_BY_KEY, VANILLA_ITEM_KEY_BY_ID } from '../src/data/items';
import { hurtVoicePlan, playHurtVoice } from '../src/player/PlayerVoice';
import { SENTRY_SHOOT, RainbowCrystalBurst } from '../src/entities/MinionProj';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const VF_SRC = readFileSync(join(ROOT, 'src/render/VanillaFraming.ts'), 'utf8');
const PLAYER_SRC = readFileSync(join(ROOT, 'src/entities/Player.ts'), 'utf8');
const GAME_SRC = readFileSync(join(ROOT, 'src/core/Game.ts'), 'utf8');

// ─── 框架行为夹具（vanilla-framing-golden 同法:反编译 Main.cs 提取 solid/solidTop）───
let _solidInit = false;
function ensureSolidTables(): void {
  if (_solidInit) return;
  _solidInit = true;
  const main = readFileSync(`${ROOT}/../Terarria1457/Terraria/Main.cs`, 'utf8');
  const solid = new Array(800).fill(false);
  const solidTop = new Array(800).fill(false);
  for (const mm of main.matchAll(/tileSolid\[(\d+)\] = true/g)) solid[+mm[1]] = true;
  for (const mm of main.matchAll(/tileSolidTop\[(\d+)\] = true/g)) solidTop[+mm[1]] = true;
  setVanillaSolidTables(solid, solidTop);
}
const int = (sheet: number): number => TILE_INTERNAL_BY_SHEET.get(sheet) ?? -1;

/** 列夹具:types=[x,y,vanillaSheet] 写内部 id,框 (cx,cy) 返回帧 */
function frameAt(types: Array<[number, number, number]>, cx: number, cy: number): { fx: number; fy: number } {
  ensureSolidTables();
  const st = new TileStore(32, 32);
  for (const [x, y, sheet] of types) {
    const i = st.idx(x, y);
    st.type[i] = int(sheet);
    st.flags[i] = 1;
    st.frameX[i] = 0;
    st.frameY[i] = 0;
  }
  const r = vanillaFrameFor(st, cx, cy, st, 0, 200);
  return { fx: r.fx, fy: r.fy };
}

// ═══════════ 件1:449/450/451 彩带族 rope 旗（Main.cs:9458-9460） ═══════════

describe.skipIf(EXT_MISSING)('BJ652 件1:彩带 449/450/451 def.rope 补装（攀爬/绳臂消费面）', () => {
  it('1a 数据面:TILE_DEFS[v_449/450/451].rope=true（drop/非实心面不动）', () => {
    for (const key of ['v_449_blue_streamer', 'v_450_green_streamer', 'v_451_pink_streamer']) {
      const id = TILE_BY_KEY[key];
      const def = id !== undefined ? TILE_DEFS[id] : undefined;
      expect(def, `${key} 在表`).toBeDefined();
      expect(def?.rope, `${key} rope=Main.tileRope`).toBe(true);
      expect(def?.solid, `${key} 非实心（★F2）`).toBe(false);
    }
  });
  it('1b 行为面:真 TileStore 彩带头格 → rawRopeAt/isRopeAt 真（攀爬判定）', () => {
    const st = new TileStore(32, 32);
    const p = new Player(0, 0, new Inventory());
    const raw = (p as unknown as { rawRopeAt(s: TileStore, x: number, y: number): boolean }).rawRopeAt.bind(p);
    const isRope = (p as unknown as { isRopeAt(s: TileStore, x: number, y: number): boolean }).isRopeAt.bind(p);
    for (const sheet of [449, 450, 451]) {
      const i = st.idx(10, 10);
      st.type[i] = int(sheet);
      st.flags[i] = 1;
      expect(raw(st, 10, 10), `sheet ${sheet} rawRopeAt（Main.tileRope 直判）`).toBe(true);
      expect(isRope(st, 10, 10), `sheet ${sheet} isRopeAt`).toBe(true);
      // 裸格对照
      st.flags[i] = 0;
      expect(raw(st, 10, 10)).toBe(false);
    }
  });
});

// ═══════════ 件2:tileRope 九件全表 + IsRope 重写（域错+语义错双定谳） ═══════════

describe.skipIf(EXT_MISSING)('BJ652 件2:VanillaFraming tileRope 外员摘除 + isRopeAt IsRope 1:1', () => {
  it('2a VANILLA_TILE_ROPE=九件全表逐值全等 Main.cs:9452-9460（外员 42/223/314/345 摘除）', () => {
    expect([...VANILLA_TILE_ROPE].sort((a, b) => a - b)).toEqual([213, 214, 353, 365, 366, 449, 450, 451, 504]);
    for (const w of [42, 223, 314, 345]) expect(VANILLA_TILE_ROPE.has(w), `外员 ${w} 摘除`).toBe(false);
  });
  it('2b era guard:谓词单源化 + isRopeAt 本格直判 + GetRopeEnds 支 + Player 穿行勘正', () => {
    expect(VF_SRC).toContain('tileRope: (t: number) => VANILLA_TILE_ROPE.has(t),');
    expect(VF_SRC, '外员 345 字面全摘').not.toContain('t === 345');
    expect(VF_SRC).toContain('if (VANILLA_TILE_ROPE.has(t0)) return true;');
    expect(VF_SRC, 'IsRope 第二支 314/380/平台').toContain('t0 !== 314 && t0 !== 380 && !SETS_PLATFORMS[t0]');
    expect(VF_SRC).toContain('function getRopeEndsAnchored');
    // Player.ts GetRopeEnds:active 非绳格【穿行】（旧首格非绳即 break=绳藏平台后漏判）
    expect(PLAYER_SRC).toContain("if (TILE_DEFS[st.type[k]]?.rope) { topRopeY = ty; break; }");
    expect(PLAYER_SRC).toContain("if (TILE_DEFS[st.type[k]]?.rope) { bottomRopeY = ty; break; }");
  });
  it('2c 异型绳链:504 上邻 213 → up=num（IsRope :83175 连通;旧域错谓词恒假=断帧）', () => {
    const het = frameAt([[12, 11, 504], [12, 12, 213], [12, 13, 213]], 12, 12);
    const ctl = frameAt([[12, 11, 213], [12, 12, 213], [12, 13, 213]], 12, 12);
    expect(het).toEqual(ctl);                          // vanilla: IsRope(异型绳)=true → up=num
  });
  it('2d 绳穿平台:上邻=平台×2+其上绳 → GetRopeEnds 双锚真（:70624-70632;绳藏平台可攀链）', () => {
    // IsRope(12,11)=平台格：上扫 y-1=10 平台（active 非绳→穿行）→ y-2=9 绳=锚；
    // 下扫自 y+1=12 绳=第二锚 → true → up=num。旧"首格非绳即 break"=漏判。
    const thru = frameAt([[12, 9, 213], [12, 10, 19], [12, 11, 19], [12, 12, 213], [12, 13, 213]], 12, 12);
    const ctl = frameAt([[12, 11, 213], [12, 12, 213], [12, 13, 213]], 12, 12);
    expect(thru).toEqual(ctl);
  });
  it('2d2 空格断扫:平台上方隔空格的绳不算锚（null/!active→break,:70564;穿行≠穿空）', () => {
    // (12,10) 为空 → vanilla 上扫 break → topRopeY=-1 → IsRope=false → up 保存
    // 平台原值（≠num）→ 顶档帧,不与连通帧混同。旧向下扫语义/穿空语义均此处翻红。
    const thruEmpty = frameAt([[12, 9, 213], [12, 11, 19], [12, 12, 213], [12, 13, 213]], 12, 12);
    const ctl = frameAt([[12, 11, 213], [12, 12, 213], [12, 13, 213]], 12, 12);
    expect(thruEmpty).not.toEqual(ctl);
  });
  it('2h Player.isRopeAt（pulley 抓绳面）GetRopeEnds 穿行/断扫（:70559-70593 亲读）', () => {
    const st = new TileStore(32, 32);
    const p = new Player(0, 0, new Inventory());
    const isRope = (p as unknown as { isRopeAt(s: TileStore, x: number, y: number): boolean }).isRopeAt.bind(p);
    const put = (x: number, y: number, sheet: number | null): void => {
      const i = st.idx(x, y);
      st.type[i] = sheet === null ? 0 : int(sheet);
      st.flags[i] = sheet === null ? 0 : 1;
    };
    // 穿行面:查询格=平台(12,11)，其上平台(12,10)【active 非绳→继续】,绳在 (12,9);
    // 下扫 (12,12) 绳=第二锚 → true。旧"首格非绳即 break"=绳藏平台×2 后漏判 → 红。
    put(12, 9, 213); put(12, 10, 19); put(12, 11, 19); put(12, 12, 213); put(12, 13, 213);
    expect(isRope(st, 12, 11), '穿平台×2 双锚=可攀（绳穿平台可攀链）').toBe(true);
    // 断扫面:(12,20) 空 → null/!active break（:70564）→ topRopeY=-1 → false（穿行≠穿空）
    put(12, 19, 213); put(12, 20, null); put(12, 21, 19); put(12, 22, 213); put(12, 23, 213);
    expect(isRope(st, 12, 21), '隔空格断扫=false').toBe(false);
    // 裸对照:绳格直判 true / 空格 false（首支 :70621/:70619）
    expect(isRope(st, 12, 12)).toBe(true);
    expect(isRope(st, 12, 20)).toBe(false);
  });
  it('2e 连通性对照:空顶 rope ≠ 连通 rope（探针非恒等;绳端帽帧）', () => {
    const emptyTop = frameAt([[12, 12, 213], [12, 13, 213]], 12, 12);
    const ctl = frameAt([[12, 11, 213], [12, 12, 213], [12, 13, 213]], 12, 12);
    expect(emptyTop).not.toEqual(ctl);
    expect(emptyTop).toEqual({ fx: 108, fy: 0 });      // (up=-1,down=num) 绳顶档钉值
  });
  it('2f 外员摘除实害①:钛矿 223 石下=空下帧（脱 rope 支;旧 rope 支实心下全并=108 档）', () => {
    const stoneBelow = frameAt([[12, 12, 223], [12, 13, 1]], 12, 12);
    const emptyBelow = frameAt([[12, 12, 223]], 12, 12);
    expect(stoneBelow).toEqual(emptyBelow);            // 223 非 tileRope → 不并任意实心
    expect(stoneBelow).toEqual({ fx: 162, fy: 54 });   // (up=-1,down 非 num) 钉值
  });
  it('2g 外员摘除实害②:蜂蜜瀑布 345 钛矿下=空下帧（旧 rope 支实心下全并=108 档）', () => {
    // 判别基面:below 须【solid 且不在 345 合族】——亲测合族面（石 1/玻璃 2/41/75
    // 均在 345 合族=108,探针判别力无效）;钛矿 223/48 非族=162,54（当前码）。
    // 旧 rope 支 `down>-1 && tileSolid(down) → down=num` 对任意实心并档 → 108 → 红。
    const oreBelow = frameAt([[12, 12, 345], [12, 13, 223]], 12, 12);
    const emptyBelow = frameAt([[12, 12, 345]], 12, 12);
    expect(oreBelow).toEqual(emptyBelow);
    expect(oreBelow).toEqual({ fx: 162, fy: 54 });
  });
});

// ═══════════ 件3:wet 灭火门（ItemCheck_CheckCanUse_Inner Player.cs:52751） ═══════════

describe.skipIf(EXT_MISSING)('BJ652 件3:wet 禁射四弹型（85/15/34/1122——湿身灭火,岩浆豁免）', () => {
  it('3a 数据面四件定谳:shoot 值 + 原版出处（506/1910 喷火器族/112 火花之花/218 火焰鞭/6173 电弧涌动）', () => {
    expect(itemCombat(506)?.shoot).toBe(85);   // Item.cs case 506 :7400 shoot=85
    expect(itemCombat(1910)?.shoot).toBe(85);  // case 1910 :20730（Elf Melter）
    expect(itemCombat(112)?.shoot).toBe(15);   // case 112 :2706（Flower of Fire）
    expect(itemCombat(218)?.shoot).toBe(34);   // case 218 :4096（Flamelash）
    expect(itemCombat(6173)?.shoot).toBe(1122);// Item.cs:47557 DefaultToStaff(1122)（1457 新件）
    expect(itemCombat(4753)?.shoot ?? 0).not.toBe(85); // 对照:非表内件
  });
  it('3b era guard:updateUse 头湿门四弹型逐字 + wet/lavaWet 位次', () => {
    expect(GAME_SRC).toContain('wetShoot === 85 || wetShoot === 15 || wetShoot === 34 || wetShoot === 1122');
    expect(GAME_SRC).toContain('this.player.wetSticky && !this.player.splashLavaWet');
  });
  it('3c 行为面:火花之花(112) 湿身禁用（零弹/零 useTime）·岩浆湿豁免·干态正常发射', () => {
    const iidOf = (vid: number): number => {
      const k = VANILLA_ITEM_KEY_BY_ID[vid];
      const found = k ? ITEM_BY_KEY[k] : undefined;
      if (found === undefined) throw new Error(`vid ${vid} 未注册`);
      return found;
    };
    const stub = (wetSticky: boolean, lavaWet: boolean) => {
      const g = Object.create(Game.prototype) as unknown as Record<string, unknown>;
      const player = new Player(50 * 16, 90 * 16, new Inventory());
      player.wetSticky = wetSticky;
      player.splashLavaWet = lavaWet;
      player.inv.add(iidOf(112), 1);
      const sel = player.inv.slots.findIndex((s) => s && s.id === iidOf(112));
      player.inv.selected = Math.max(0, sel);
      const shots: unknown[] = [];
      g.player = player;
      g.world = new World(120, 120, 30, 'bj652');
      g.entities = { critters: [], npcs: [], enemies: [], projectiles: shots, add: (e: unknown) => { shots.push(e); } };
      g.input = { mouseDown: true, mouseHeld: true, mouseX: 700, mouseY: 300, rightDown: false, uiBlocking: false, downAction: () => false };
      g.camera = { tileUnder: () => [60, 60], screenToWorld: () => [800, 0], x: 800, y: 0 };
      g.renderer = { canvas: { width: 800, height: 600 }, fullMap: { open: false }, timeUiHover: false, weatherUiHover: false };
      g.smartCursor = { showing: false };
      g.annotateMode = false;
      g.prevSwingMouse = false;
      g.wiresRadial = { active: false };
      g.uiHeldItemRef = () => null;
      g.mining = null;
      g.swingHitSet = new Set<number>();
      g.swingTileCutSet = new Set<number>();
      g.sfx = { play: () => {}, playWav: () => {}, playWavFile: () => {}, playFiles: () => {} };
      g.playSfxFile = () => {};
      g.playSfxWav = () => {};
      g.cb = { onInventoryChanged: () => {}, onToast: () => {} };
      g.newText = () => {};
      g.recLog = () => {};
      return { player, shots, run: () => (g as unknown as { updateUse: (dt: number) => void }).updateUse(1 / 60) };
    };
    const wet = stub(true, false);
    wet.run();
    expect(wet.shots.length, '湿身=禁射（flag=false 整链不达）').toBe(0);
    expect(wet.player.useTime, '湿身=不起手（TryStartUse 拒）').toBe(0);
    const lava = stub(true, true);
    lava.run();
    expect(lava.shots.length, '岩浆湿豁免（!lavaWet 门）').toBeGreaterThanOrEqual(1);
    const dry = stub(false, false);
    dry.run();
    expect(dry.shots.length, '干态正常发射').toBeGreaterThanOrEqual(1);
    expect(dry.player.useTime).toBeGreaterThan(0);
  });
});

// ═══════════ 件4:PlayHurtSound mount/狼人支（Player.cs:38946-38982） ═══════════

describe.skipIf(EXT_MISSING)('BJ652 件4:hurtVoicePlan mount/狼人支（BJ598 B3 待办销案）', () => {
  it('4a 坐骑五档音:52 狼骑(3,6)/54 迅猛龙(3,47)/55 鼠(4,4)/56 蝙蝠(4,4)/61 仙灵(3,5)', () => {
    expect(hurtVoicePlan({ mountType: 52 })).toMatchObject({ files: ['NPC_Hit_6'], source: 'mount' });
    expect(hurtVoicePlan({ mountType: 54 })).toMatchObject({ files: ['NPC_Hit_47'], source: 'mount' });
    expect(hurtVoicePlan({ mountType: 55 })).toMatchObject({ files: ['NPC_Killed_4'], source: 'mount' });
    expect(hurtVoicePlan({ mountType: 56 })).toMatchObject({ files: ['NPC_Killed_4'], source: 'mount' });
    expect(hurtVoicePlan({ mountType: 61 })).toMatchObject({ files: ['NPC_Hit_5'], source: 'mount' });
    expect(hurtVoicePlan({ mountType: 0 }).source).toBeUndefined();   // 无坐骑=不进支
  });
  it('4b 狼人支:wereWolf→NPC_Hit_6(3,6);hideWolf 摘除回落;forceWerewolf 同支', () => {
    expect(hurtVoicePlan({ wereWolf: true })).toMatchObject({ files: ['NPC_Hit_6'], source: 'werewolf' });
    expect(hurtVoicePlan({ wereWolf: true, hideWolf: true }).source).toBeUndefined();
    expect(hurtVoicePlan({ forceWerewolf: true } as never)).toMatchObject({ files: ['NPC_Hit_6'], source: 'werewolf' });
  });
  it('4c 位次:override > mount > werewolf > armor（原版 :38879→:38946→:38969→:38984 序）', () => {
    expect(hurtVoicePlan({ voiceOverride: 5, mountType: 52 }).source).toBe('override');
    expect(hurtVoicePlan({ mountType: 52, wereWolf: true }).source).toBe('mount');
    expect(hurtVoicePlan({ mountType: 52, frostArmor: true }).source).toBe('mount');
    expect(hurtVoicePlan({ wereWolf: true, frostArmor: true }).source).toBe('werewolf');
    expect(hurtVoicePlan({ frostArmor: true })).toMatchObject({ files: ['Item_27'], source: 'armor' });
  });
  it('4d DST 世界门跳过面:source 档计划直达原音;无档计划才落 DST（:38993 位次）', () => {
    const played: Array<{ f: string; v: number }> = [];
    const g = {
      world: { seedFlags: { theConstant: true, remix: false } },
      playSfxWav: (f: string, v: number) => { played.push({ f, v }); },
    } as never;
    playHurtVoice(g, { mountType: 52 });
    expect(played[0]?.f).toBe('NPC_Hit_6');
    playHurtVoice(g, { wereWolf: true });
    expect(played[1]?.f).toBe('NPC_Hit_6');
    playHurtVoice(g, {});
    expect(played[2]?.f ?? '').toMatch(/^dst_male_hit/);   // 尾段照落 DST 门
  });
  it('4e 音频资产在库:五档 legacy 音文件落盘（NPC_Hit_5/6/47 + NPC_Killed_4）', () => {
    for (const f of ['NPC_Hit_5', 'NPC_Hit_6', 'NPC_Hit_47', 'NPC_Killed_4']) {
      expect(existsSync(join(ROOT, `public/sounds/${f}.opus`)) || existsSync(join(ROOT, `public/sounds/${f}.mp3`)), f).toBe(true);
    }
  });
  it('4f era guard:Game.damagePlayer 站传 mountType/wereWolf（mount.Active 外层门）', () => {
    expect(GAME_SRC).toContain('mountType: p.mount.active ? p.mount.type : 0');
    expect(GAME_SRC).toContain('wereWolf: p.buffs.has(BuffType.Werewolf)');
  });
});

// ═══════════ 件5:两验证定谳证据（非落刀件——重锚/重冻依据在档） ═══════════

describe.skipIf(EXT_MISSING)('BJ652 件5:z1-A7 重锚依据 + bj378 三红重冻依据', () => {
  it('5a z1-A7 重锚定谳:643 volley=真 644 爆裂弹实体×3（BJ639 批1②）,t=30 引爆面在位', () => {
    // 重锚根因：643 volley 已从「落点即时 AoE」重建为真 644 爆裂弹实体
    // （RainbowCrystalBurst 14×14 → t=30 引爆/t≥60 二段）——旧期望「单拍 fixedUpdate
    // 即 steal」锚在已退役形态（BJ640 攻速链不在 643 哨兵支,发射节奏 cd=26 未变）。
    expect(SENTRY_SHOOT[643]).toMatchObject({ shot: 644, volley: 3 });   // MinionProj.ts :624
    expect(new RainbowCrystalBurst(0, 0, 0, null, { hitAt: () => {} }).projId).toBe(644); // 瞬态载体
  });
  it('5b bj378 三红定谳:BJ517⑥(:41027)/BJ592(:69724) 两处合法 newGore 调用点已捕获入金标', () => {
    // 三红根因=recon-frame-tables 金标冻于两调用点落码前——源合法（反编译
    // NPC.cs:69724 臭气团 580-582/AI_197 :41027 气球线 1146 均逐字移植面）,
    // 处置=--freeze --force-full 重冻（2026-10-12,sha256 对拍在案）。
    expect(readFileSync(join(ROOT, 'src/entities/MinionProj.ts'), 'utf8')).toContain('GorePiece.newGore(1146,');
    expect(readFileSync(join(ROOT, 'src/entities/TownNPC.ts'), 'utf8')).toContain('GorePiece.newGore(580 +');
    const golden = JSON.parse(readFileSync(join(ROOT, 'tests/golden/frame-tables-recon.json'), 'utf8')) as {
      gore: { universe: { callsites: number[] } };
    };
    const cs = golden.gore.universe.callsites;
    expect(cs, '580 入 universe（重冻捕获）').toContain(580);
    expect(cs, '1146 入 universe（重冻捕获）').toContain(1146);
  });
});

// ═══════════ 变异测试（mutation-guard withMutation——写盘变异+守卫还原+恰红断言） ═══════════

import { withMutation } from './mutation-guard';
import { spawnSync } from 'node:child_process';


// 内层全文件重跑经 SW_BJ652_MUT=1 跳过本 describe（防嵌套递归,BJ606 同法）
describe.skipIf(EXT_MISSING || process.env.SW_BJ652_MUT === '1')('BJ652 变异:逐刀恰红（守卫逐字节还原对拍由守卫 finally 内建）', () => {
  const spawnVitest = (): ReturnType<typeof spawnSync> => spawnSync(
    'npx', ['vitest', 'run', 'tests/bj652-misc-tail.test.ts', '--no-file-parallelism'], {
      cwd: process.cwd(), encoding: 'utf8', timeout: 420_000,
      maxBuffer: 64 * 1024 * 1024,
      env: { ...process.env, SW_BJ652_MUT: '1' },
    },
  );
  /** 恰红断言:stdout 提取红名集合=期望集（防「全文件红=变异无判别力」假证） */
  const assertExactlyRed = (r: ReturnType<typeof spawnSync>, expected: string[]): void => {
    expect(r.status, '变异须证红').not.toBe(0);
    const out = String(r.stdout ?? '') + String(r.stderr ?? '');
    const clean = out.replace(/\u001B\[[0-9;]*m/g, '');   // 全 ANSI 剥除（含 ESC 码,残段 [2m 级）
    const reds = new Set(
      clean.split('\n').filter((l: string) => l.includes('× ') && l.includes(' > '))
        .map((l: string) => l.trim().replace(/^×\s*/, '').split(' > ').pop() ?? '').map((t: string) => t.replace(/\s+\d+ms$/, ''))
        .filter(Boolean),
    );
    for (const t of expected) expect(reds.has(t), `恰红须含: ${t}（实红=${[...reds].join(' | ')}）`).toBe(true);
    expect(reds.size, `恰红须无旁红: 实红=${[...reds].join(' | ')}`).toBe(expected.length);
  };

  const TILES = join(process.cwd(), 'src', 'data', 'tiles.ts');
  const VF = join(process.cwd(), 'src', 'render', 'VanillaFraming.ts');
  const GAME = join(process.cwd(), 'src', 'core', 'Game.ts');
  const PV = join(process.cwd(), 'src', 'player', 'PlayerVoice.ts');

  it('M1 件1 摘 449 rope 旗 → 1a+1b 恰红', () => {
    withMutation(TILES, 'drop: 3739, rope: true,', 'drop: 3739,', () => {
      assertExactlyRed(spawnVitest(), ['1a 数据面:TILE_DEFS[v_449/450/451].rope=true（drop/非实心面不动）', '1b 行为面:真 TileStore 彩带头格 → rawRopeAt/isRopeAt 真（攀爬判定）']);
    }, { label: 'BJ652 M1' });
  }, 360_000);
  it('M2 件2 外员 345 回灌 tileRope → 2a+2g 恰红', () => {
    withMutation(VF, 'new Set([213, 214, 353, 365, 366, 504, 449, 450, 451])', 'new Set([213, 214, 353, 365, 366, 504, 449, 450, 451, 345])', () => {
      assertExactlyRed(spawnVitest(), ['2a VANILLA_TILE_ROPE=九件全表逐值全等 Main.cs:9452-9460（外员 42/223/314/345 摘除）', '2g 外员摘除实害②:蜂蜜瀑布 345 钛矿下=空下帧（旧 rope 支实心下全并=108 档）']);
    }, { label: 'BJ652 M2' });
  }, 360_000);
  it('M3 件2 isRopeAt GetRopeEnds 支摘除 → 2d 恰红', () => {
    withMutation(VF, 'return getRopeEndsAnchored(st, x, y);', 'return false;', () => {
      assertExactlyRed(spawnVitest(), ['2d 绳穿平台:上邻=平台×2+其上绳 → GetRopeEnds 双锚真（:70624-70632;绳藏平台可攀链）']);
    }, { label: 'BJ652 M3' });
  }, 360_000);
  it('M4 件3 湿门整链摘除 → 3c 恰红', () => {
    withMutation(GAME, 'if (heldDef && this.player.wetSticky && !this.player.splashLavaWet) {', 'if (false && heldDef && this.player.wetSticky && !this.player.splashLavaWet) {', () => {
      assertExactlyRed(spawnVitest(), ['3c 行为面:火花之花(112) 湿身禁用（零弹/零 useTime）·岩浆湿豁免·干态正常发射']);
    }, { label: 'BJ652 M4' });
  }, 360_000);
  it('M5 件4 mount52 音错配 → 4a+4d 恰红', () => {
    withMutation(PV, "if (mt === 52) return { files: ['NPC_Hit_6'], vol: 1, source: 'mount' };", "if (mt === 52) return { files: ['NPC_Hit_5'], vol: 1, source: 'mount' };", () => {
      assertExactlyRed(spawnVitest(), ['4a 坐骑五档音:52 狼骑(3,6)/54 迅猛龙(3,47)/55 鼠(4,4)/56 蝙蝠(4,4)/61 仙灵(3,5)', '4d DST 世界门跳过面:source 档计划直达原音;无档计划才落 DST（:38993 位次）']);
    }, { label: 'BJ652 M5' });
  }, 360_000);
  it('M6 件2 Player GetRopeEnds 空格断扫摘除 → 2h 恰红', () => {
    withMutation(join(process.cwd(), 'src', 'entities', 'Player.ts'),
      'if (!(st.flags[k] & 1)) break;                   // tile==null||!active → break（:70564）',
      '                                   // tile==null||!active → break（:70564）',
      () => {
        assertExactlyRed(spawnVitest(), ['2h Player.isRopeAt（pulley 抓绳面）GetRopeEnds 穿行/断扫（:70559-70593 亲读）']);
      }, { label: 'BJ652 M6' });
  }, 360_000);
});
