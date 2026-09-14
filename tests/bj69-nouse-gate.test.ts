// ★BJ69（2026-09-14）非使用物左键数据门守卫（RB15a 袋豁免集 BOSS_BAG_NO_USE_VIDS 的
// 推广退役刀）。
// 金标：
//  - 起用总门 Player.cs:43064 `controlUseItem && releaseUseItem && itemAnimation==0
//    && item.useStyle != 0`（1458 同域 :43062 diff=same）——useStyle==0 = 非使用物,
//    持用左键零动作（不挥/不响/不耗/不进 useTime）。
//  - useStyle 逐 id 权威 = Terarria1457/Terraria/Item.cs SetDefaults1..5 +
//    SetFoodDefaults（本测试内置执行序仿真提取器：fallthrough 组共享体、嵌套
//    switch(type)、if(type==N) 条件支、DefaultTo* 辅助族 useStyle 种子（DefaultToFood
//    条件于 useGulpSound 实参）、
//    Variant 条件基态口径（FX53：`== EnabledVariant` 恒假/`!= Disabled` 恒真））。
//  - 仓内门数据源 = vanilla-itemfunc.useStyle + Game.NO_USE_STYLE_BACKFILL_1457
//    （fallthrough 组共享体只落组末标签的提取器既有盲区,SW-FX53 族;运行时纠偏
//    先例=items.ts SHARED_GROUP_PLACE_STYLE_1457）。
// 锁面：
//  ①门数据 ≡ Item.cs 真值（6176 件逐 id,双向:误杀面=真值>0∧门=0 / 伪挥面=真值=0∧门>0）
//  ②行为面：updateUse 桩驱动——门静默集（袋 21 件+抽样）一帧零副作用（RB15a 面延续）
//  ③阳性对照：门数据>0 件照常起挥（1874 回填件/1905 表载件）——防"全 miss 恒 0"
//  ④结构锁：updateUse 臂门表达式在位（防静默回退/删除）
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';

import { heldItemUseStyle } from '../src/core/Game';
import { itemFuncOfVid } from '../src/data/vanillaItemFunc';
import vanillaMeta from '../public/sprites/vanilla.json';
import { BOSS_BAG_IDS } from '../src/data/vanillaBossBags';
import { Game } from '../src/core/Game';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { World } from '../src/world/World';
import { TILE } from '../src/core/constants';
import { ITEM_BY_KEY, VANILLA_ITEM_KEY_BY_ID } from '../src/data/items';

const REPO = join(dirname(__dirname), '..');
const ITEM_CS = readFileSync(join(REPO, 'Terarria1457', 'Terraria', 'Item.cs'), 'utf8');
const LINES = ITEM_CS.split('\n');

// ================= Item.cs useStyle 真值提取器（tools/_bj69-nouse-item-audit.mjs 同构） =================

function methodRange(name: string): [number, number] {
  const sig = LINES.findIndex((l) => new RegExp(`^\\t(public|private) void ${name}\\(`).test(l));
  if (sig < 0) throw new Error(`method ${name} not found`);
  let depth = 0;
  for (let i = sig; i < LINES.length; i++) {
    depth += (LINES[i].match(/{/g) ?? []).length - (LINES[i].match(/}/g) ?? []).length;
    if (depth === 0 && i > sig) return [sig, i];
  }
  throw new Error(`method ${name} unbalanced`);
}
const REGIONS = ['SetDefaults1', 'SetDefaults2', 'SetDefaults3', 'SetDefaults4', 'SetDefaults5', 'SetFoodDefaults']
  .map((n) => [n, methodRange(n)] as const);

/** DefaultTo* 辅助函数体顶层首个 useStyle 赋值 = 该族 useStyle 种子 */
function helperUseStyle(name: string): number | undefined {
  let r: [number, number];
  try { r = methodRange(name); } catch { return undefined; }
  for (let i = r[0]; i <= r[1]; i++) {
    const m = LINES[i].match(/^\t\tuseStyle = (\d+);/);
    if (m) return +m[1];
  }
  return undefined;
}
const HELPERS: Record<string, number> = {};
for (const n of ['DefaultToPlaceableTile', 'DefaultToPlaceableWall', 'DefaultToCapturedCritter', 'DefaultToFood',
  'DefaultToHealingPotion', 'DefaultToManaPotion', 'DefaultToTorch', 'DefaultToMusicBox', 'DefaultToBanner',
  'DefaultToMonolith', 'DefaultToSeaShell', 'DefaultToGolfBall', 'DefaultToGolfClub', 'DefaultToLawnMower',
  'DefaultToGuitar', 'DefaultToQuestFish', 'DefaultToVoiceOverrideAccessory', 'DefaultToBomb', 'DefaultToSolution',
  'DefaultToWhip', 'DefaultToKite', 'DefaultToVanitypet', 'DefaultToSpear', 'DefaultToBow', 'DefaultToStaff',
  'DefaultToMagicWeapon', 'DefaultToRangedWeapon', 'DefaultToThrownWeapon']) {
  const v = helperUseStyle(n);
  if (v !== undefined) HELPERS[n] = v;
}
expect(Object.keys(HELPERS).length, 'DefaultTo* useStyle 种子表不得为空（提取器面漂移即断）').toBeGreaterThanOrEqual(15);

/** 单个 switch(type) 块的 case 标签组收集（花括号层级感知,不依赖 tab 深度;
 *  连续标签=fallthrough 组共享同一体） */
function switchCases(from: number, to: number, startLine: number): { cases: Array<{ ids: number[]; start: number; end: number }>; bodyEnd: number } {
  let level = 0, bodyEnd = to;
  const cases: Array<{ ids: number[]; start: number; end: number }> = [];
  let curIds: number[] = [], curStart = -1, curEnd = -1;
  const flush = () => {
    if (curStart >= 0) cases.push({ ids: [...curIds], start: curStart, end: curEnd });
    curIds = []; curStart = -1; curEnd = -1;
  };
  for (let k = startLine; k <= to; k++) {
    const opens = (LINES[k].match(/{/g) ?? []).length;
    const closes = (LINES[k].match(/}/g) ?? []).length;
    const before = level;
    level += opens - closes;
    if (k > startLine && level === 0 && before === 1) {
      if (curStart >= 0) curEnd = k - 1;
      flush();
      bodyEnd = k;
      return { cases, bodyEnd };
    }
    if (level === 1) {
      const cl = LINES[k].trim().match(/^(?:case (\d+)|default):\s*$/);
      if (cl) {
        if (curStart >= 0 && curEnd >= curStart) flush();
        curIds.push(cl[1] ? +cl[1] : -1);   // -1 = default 组标签（C# 无 case 命中时执行）
        if (curStart < 0) { curStart = k + 1; curEnd = k; }
        continue;
      }
      if (curStart >= 0) curEnd = k;
    } else if (curStart >= 0 && level >= 2) {
      curEnd = k;
    }
  }
  flush();
  return { cases, bodyEnd };
}

/** 条件支判定（`if (type == N)` 单行头 + Variant 基态口径） */
type Cond = { kind: 'eq'; id: number } | { kind: 'variant'; applies: boolean } | null;

/** if 头谓词求值：type 代 vid、Variant 条件按基态口径（FX53：`== X` 恒假/`!= X`
 *  恒真）；可解=布尔,不可解（Main.* 等外部态）=null（乐观真——保守向「真值>0」
 *  倾斜,误杀面不因求解失败而漏报）。 */
function evalCond(head: string, vid: number): boolean | null {
  const expr = head.replace(/^if\s*\(/, '').replace(/\)\s*$/, '').trim();
  if (/Variant\s*==/.test(expr) || /Variant\s*!=/.test(expr)) {
    const isNe = /Variant\s*!=/.test(expr);
    if (/\btype\b|Main\.|NPC\.|WorldGen\./.test(expr)) return isNe ? true : null;
    return isNe;
  }
  if (!/\btype\b/.test(expr)) return null;
  if (/[^0-9\s()<>=!&|]/.test(expr.replace(/\btype\b/g, ''))) return null;   // 外部标识符=不可解
  const js = expr.replace(/\btype\b/g, String(vid));
  try {
    // eslint-disable-next-line no-new-func
    return !!new Function(`"use strict"; return (${js});`)();
  } catch { return null; }
}

/** case 体执行（花括号条件栈解释器）：
 *  · 嵌套 switch(type) 递归=仅命中该 id 的嵌套组（+default 兜底）生效;
 *  · 条件块栈：useStyle/return/DefaultTo* 仅在【无任何 false 外层条件】时生效
 *    （null=不可解=乐观真）;} else { 携 else 谓词再入栈;
 *  · return=true 终止整个方法（同受条件栈门控）。 */
function execCaseBody(vid: number, start: number, end: number, capture: (v: number) => void): boolean {
  let depth = 0;
  let pendingHead: boolean | null | undefined = undefined;   // 已求值待入栈的 if 头
  let pendingElse: boolean | null | undefined = undefined;
  const stack: Array<{ depth: number; pred: boolean | null }> = [];
  const taken = (): boolean => !stack.some((f) => f.pred === false);   // 任一 false=块未采用
  for (let k = start; k <= end; k++) {
    const s = LINES[k].trim();
    if (!s) continue;
    if (s === '{') {
      depth++;
      if (pendingHead !== undefined) { stack.push({ depth, pred: pendingHead }); pendingHead = undefined; pendingElse = undefined; }
      continue;
    }
    if (/^\}\s*else\s+if\s*\(/.test(s)) {
      const head = s.replace(/^\}\s*/, '');
      pendingHead = evalCond(head.replace(/^else if/, 'if'), vid);
      pendingElse = pendingHead === null ? undefined : !pendingHead;
      continue;
    }
    if (/^\}\s*else\s*\{\s*$/.test(s)) {
      depth--;   // else 随 if 块闭括号
      if (pendingElse !== undefined && pendingElse !== undefined) stack.push({ depth, pred: pendingElse });
      pendingElse = undefined;
      continue;
    }
    if (s === '}') {
      depth--;
      while (stack.length && stack[stack.length - 1].depth > depth) stack.pop();
      continue;
    }
    if (/^if\s*\(/.test(s)) {
      pendingHead = evalCond(s, vid);
      pendingElse = pendingHead === null ? undefined : !pendingHead;
      continue;
    }
    // 嵌套 switch(type)：仅执行该 id 命中的嵌套组（+default 兜底），整块跳出
    if (/^\t*switch \(type\)\s*$/.test(LINES[k])) {
      if (taken()) {
        const { cases, bodyEnd } = switchCases(start, end, k);
        const hit = cases.filter((c) => c.ids.includes(vid));
        const grp = hit.length ? hit : cases.filter((c) => c.ids.includes(-1));
        for (const c of grp) {
          if (execCaseBody(vid, c.start, c.end, capture)) return true;
        }
      }
      // 跳过嵌套块（无论是否采用——case 体界至本组尾）
      let lv = 0;
      for (let j = k; j <= end; j++) {
        lv += (LINES[j].match(/{/g) ?? []).length - (LINES[j].match(/}/g) ?? []).length;
        if (j > k && lv === 0) { k = j; break; }
      }
      continue;
    }
    const um = s.match(/^useStyle = (\d+);$/);
    if (um) {
      if (taken()) capture(+um[1]);
      continue;
    }
    if (/^return/.test(s)) { if (taken()) return true; continue; }
    if (s === 'break;') continue;
    const hm = s.match(/^(DefaultTo\w+)\(/);
    if (hm) {
      if (taken()) {
        // DefaultToFood 的 useStyle 条件于 useGulpSound 实参（Item.cs:48554-48561）
        if (hm[1] === 'DefaultToFood') capture(/useGulpSound:\s*true/.test(s) ? 9 : 2);
        else {
          const hv = HELPERS[hm[1]];
          if (hv !== undefined) capture(hv);
        }
      }
      continue;
    }
    // 其余赋值/调用：不影响条件栈
  }
  return false;
}

/** per-id useStyle 真值。Item.SetDefaults（Item.cs:48666-48711）为【独占分派】：
 *  IsFood → SetFoodDefaults；否则按 type 区间唯一命中 SetDefaults1(≤1000)/2(≤2001)/
 *  3(≤3000)/4(≤3989)/5(其余)——非顺序多区执行。命中区内 switch(type) 按行序执行,
 *  命中组跑体（嵌套 switch+default 兜底递归）,return 终止该区。 */
function vanillaUseStyle(vid: number): number {
  if (vid <= 0) return 0;
  let v = 0;
  const capture = (nv: number) => { v = nv; };
  const runRegion = (name: string): boolean => {
    const [, [from, to]] = REGIONS.find(([n]) => n === name)!;
    let terminated = false;
    let i = from;
    while (i <= to && !terminated) {
      if (!/^\t*switch \(type\)\s*$/.test(LINES[i])) { i++; continue; }
      const { cases, bodyEnd } = switchCases(from, to, i);
      const hit = cases.filter((c) => c.ids.includes(vid));
      const grp = hit.length ? hit : cases.filter((c) => c.ids.includes(-1));   // default 兜底
      for (const c of grp) {
        if (execCaseBody(vid, c.start, c.end, capture)) { terminated = true; break; }
      }
      i = bodyEnd + 1;
    }
    return terminated;
  };
  // IsFood 面 = SetFoodDefaults 有该 id 显式 case（ItemID.Sets.IsFood 集的运行时等价域）
  const foodR = REGIONS.find(([n]) => n === 'SetFoodDefaults')![1];
  if (regionHasCase(foodR, vid)) { runRegion('SetFoodDefaults'); return v; }
  const name = vid <= 1000 ? 'SetDefaults1' : vid <= 2001 ? 'SetDefaults2'
    : vid <= 3000 ? 'SetDefaults3' : vid <= 3989 ? 'SetDefaults4' : 'SetDefaults5';
  runRegion(name);
  return v;
}

/** 区内是否存在该 id 的显式 case 标签（顶层 switch 直属） */
function regionHasCase([from, to]: readonly [number, number], vid: number): boolean {
  let i = from;
  while (i <= to) {
    if (!/^\t*switch \(type\)\s*$/.test(LINES[i])) { i++; continue; }
    const { cases, bodyEnd } = switchCases(from, to, i);
    for (const c of cases) if (c.ids.includes(vid)) return true;
    i = bodyEnd + 1;
  }
  return false;
}

// ================= ①门数据 ≡ Item.cs 真值（全量逐 id） =================

const ALL_VIDS = Object.keys(vanillaMeta.items).map(Number).filter((n) => n > 0);

// ================= 臂可达分类（tools/_bj69-nouse-item-audit.mjs 同构,保守口径） =================
// 门只作用于 updateUse「其它物品」臂——被上方/梯 B 确定消费支接管的物品不经门,
// 其门值无行为义,不入断言域;仅「臂可达」(无消费支,或消费支=臂内 critter/mount 子支)
// 的 id 须满足 门数据 ≡ Item.cs 真值。
import { HOOK_ITEMS } from '../src/data/grappleHooks';
import { CRITTER_RELEASE_BY_ITEM } from '../src/data/critters';
import { ITEM_TO_MOUNT } from '../src/entities/Mounts';
import { HAIR_DYE_ITEM_IDS } from '../src/data/vanillaHairDyes';
import { PLACE_TILE_ON_ALT_USE } from '../src/data/items';
import { itemCombat } from '../src/data/vanillaItemCombat';

const GAME_SRC = readFileSync(join(dirname(__dirname), 'src', 'core', 'Game.ts'), 'utf8');
const parseSetInTest = (name: string): Set<number> => {
  const m = GAME_SRC.match(new RegExp(`(?:const|export const) ${name} = new Set\\(\\[([\\s\\S]*?)\\]\\);`));
  if (!m) return new Set();
  return new Set(m[1].replace(/\/\/[^\n]*/g, '').split(',')
    .map((t) => Number(t.trim())).filter((n) => Number.isFinite(n) && n > 0));
};
const TELEPORT_SET = parseSetInTest('TELEPORT_ITEM_VIDS');
const PERMANENT_SET = parseSetInTest('PERMANENT_USE_VIDS');
const FUN_USE_SET = new Set([...parseSetInTest('FUN_USE_VIDS')]);
for (const m of GAME_SRC.matchAll(/else if \(heldDef && \[([\[\]0-9,\s.]+)\]\s*\n?\s*\.includes/g)) {
  for (const n of m[1].match(/\d+/g) ?? []) FUN_USE_SET.add(+n);   // 桶/海绵族内联臂并入特判域
}
const SPECIAL_VID_SET = new Set([43, 29, 109, 1291, 5340, 2610, 4049, 1130, 5438, 5518, 3989, 4271, 4382, 5336, 1844, 1958, 4095]);
for (let v = 4242; v <= 4253; v++) SPECIAL_VID_SET.add(v);

function consumersOf(vid: number): string[] {
  const f = itemFuncOfVid(vid) ?? {};
  const c = itemCombat(vid) ?? {};
  const meta = (vanillaMeta as { items: Record<string, { createTile?: number | null }> }).items[String(vid)] ?? {};
  const cons: string[] = [];
  if ((f.pick ?? 0) > 0 || (f.axe ?? 0) > 0 || (f.hammer ?? 0) > 0) cons.push('tool');
  if (meta.createTile != null || f.createTile != null) cons.push('tile');
  if (f.createWall != null) cons.push('wall');
  if (HOOK_ITEMS[vid]) cons.push('hook');
  if (CRITTER_RELEASE_BY_ITEM[vid] !== undefined) cons.push('critter');
  if (ITEM_TO_MOUNT[String(vid)] !== undefined) cons.push('mount');
  if (HAIR_DYE_ITEM_IDS.includes(vid)) cons.push('hairDye');
  if (TELEPORT_SET.has(vid)) cons.push('teleport');
  if (PERMANENT_SET.has(vid)) cons.push('permanent');
  if (FUN_USE_SET.has(vid)) cons.push('funUse');
  if (SPECIAL_VID_SET.has(vid)) cons.push('specialVid');
  if (PLACE_TILE_ON_ALT_USE.has(vid)) cons.push('placeAltUse');
  if (f.consumable && ((f.healLife ?? 0) > 0 || (f.healMana ?? 0) > 0 || (f.buffType ?? 0) > 0)) cons.push('potion');
  if ((f.damage ?? 0) > 0 || (f.shoot ?? 0) > 0 || f.melee || f.ranged || f.magic || f.summon
    || (c.damage ?? 0) > 0 || (c.shoot ?? 0) > 0) cons.push('weapon');
  if (f.fishingPole) cons.push('fishingPole');
  return cons;
}
/** 臂可达=无确定消费支,或唯一消费支=本臂内子支（critter/mount——门在其外层） */
function reachesGenericArm(vid: number): boolean {
  const cons = consumersOf(vid);
  return cons.length === 0 || cons.every((c) => c === 'critter' || c === 'mount');
}

describe('BJ69 非使用物门数据 ≡ Item.cs useStyle 真值（SetDefaults1..5+SetFoodDefaults 仿真）', () => {
  it('抽样锚定（手读 Item.cs 复核过的 10 件）', () => {
    // 袋族（无 useStyle,Item.cs:30544 共块） / 魔镜 50=4（:22514 族）/ 可疑眼球 43=4（:1888）/
    // 复原药水 226=9（:4200 组 226/227）/ 驯鹿铃铛 1914=1 / 兔子 1992=1（DefaultToCapturedCritter）/
    // 圣诞装饰 1874=1（组 1874-1905）/ 坐骑鞍 4785=4（组 4785-4787）/ 食物 353=9（SetFoodDefaults）
    expect(vanillaUseStyle(3318)).toBe(0);
    expect(vanillaUseStyle(3861)).toBe(0);
    expect(vanillaUseStyle(3862)).toBe(0);
    expect(vanillaUseStyle(50)).toBe(4);
    expect(vanillaUseStyle(43)).toBe(4);
    expect(vanillaUseStyle(226)).toBe(9);
    expect(vanillaUseStyle(1914)).toBe(1);
    expect(vanillaUseStyle(1992)).toBe(1);
    expect(vanillaUseStyle(1874)).toBe(1);
    expect(vanillaUseStyle(4785)).toBe(4);
    expect(vanillaUseStyle(353)).toBe(9);
    // 门数据与真值同相
    for (const vid of [3318, 3861, 3862, 50, 43, 226, 1914, 1992, 1874, 4785, 353]) {
      expect(heldItemUseStyle(vid) > 0, `vid ${vid} 门相`).toBe(vanillaUseStyle(vid) > 0);
    }
  });

  it('全量臂可达件双向对拍：真值>0 ⟺ 门数据>0（误杀面+伪挥面零漂移）', () => {
    const killed: number[] = [];   // 臂可达 ∧ 真值>0 ∧ 门=0 → 原版挥摆被吞（误杀）
    const faked: number[] = [];    // 臂可达 ∧ 真值=0 ∧ 门>0 → 非使用物被起挥（伪挥）
    let reach = 0;
    for (const vid of ALL_VIDS) {
      if (!reachesGenericArm(vid)) continue;
      reach++;
      const truth = vanillaUseStyle(vid);
      const gate = heldItemUseStyle(vid);
      if (truth > 0 && gate === 0) killed.push(vid);
      if (truth === 0 && gate > 0) faked.push(vid);
    }
    expect(reach, '臂可达件数（保守超集）').toBeGreaterThan(1000);
    expect(killed, `误杀面（真值>0∧门=0）: ${killed.slice(0, 20).join(',')}`).toEqual([]);
    expect(faked, `伪挥面（真值=0∧门>0）: ${faked.slice(0, 20).join(',')}`).toEqual([]);
  });

  it('袋 21 件（ItemID.cs:1215 全集）门数据全 0=左键零动作面', () => {
    expect(BOSS_BAG_IDS.size).toBe(21);
    for (const vid of BOSS_BAG_IDS) {
      expect(heldItemUseStyle(vid), `袋 ${vid} 门数据`).toBe(0);
      expect(vanillaUseStyle(vid), `袋 ${vid} Item.cs 真值`).toBe(0);
    }
  });
});

// ================= ②③行为面（sw-fx21 桩同款,updateUse 直驱） =================

const bagIid = (vid: number): number => {
  const k = VANILLA_ITEM_KEY_BY_ID[vid];
  const found = k ? ITEM_BY_KEY[k] : undefined;
  if (found === undefined) throw new Error(`vid ${vid} 未注册`);
  return found;
};

/** updateUse 可驱动的最小 Game 桩（blue-r2-fixes casterGame / sw-fx21 bagGame 惯例） */
function stubGame(heldVid: number) {
  const g = Object.create(Game.prototype) as unknown as Record<string, unknown>;
  const player = new Player(50 * TILE, 90 * TILE, new Inventory());
  player.inv.add(bagIid(heldVid), 1);
  const sel = player.inv.slots.findIndex((s) => s && s.id === bagIid(heldVid));
  player.inv.selected = Math.max(0, sel);
  const added: unknown[] = [];
  const sfxCalls: string[] = [];
  const record = (k: string) => () => { sfxCalls.push(k); };
  const toasts: string[] = [];
  g.player = player;
  g.world = new World(120, 120, 30, 'bj69');
  g.entities = { critters: [], npcs: [], enemies: [], projectiles: [], add: (e: unknown) => added.push(e) };
  g.input = { mouseDown: true, mouseHeld: true, mouseX: 700, mouseY: 300, rightDown: false, uiBlocking: false, downAction: () => false };
  g.camera = { tileUnder: () => [60, 60], screenToWorld: () => [800, 0], x: 800, y: 0 };
  g.renderer = { canvas: { width: 800, height: 600 }, fullMap: { open: false }, timeUiHover: false, weatherUiHover: false };
  g.smartCursor = { showing: false };
  g.annotateMode = false;
  g.prevSwingMouse = false;
  g.mining = null;
  g.swingHitSet = new Set<number>();
  g.swingTileCutSet = new Set<number>();
  g.sfx = { play: record('play'), playWav: record('playWav'), playWavFile: record('playWavFile'), playFiles: record('playFiles') };
  g.playSfxFile = record('playSfxFile');
  g.playSfxWav = record('playSfxWav');
  g.cb = { onInventoryChanged: () => {}, onToast: (m: string) => toasts.push(m) };
  return { g, player, added, sfxCalls, toasts, heldSlot: sel };
}

describe('BJ69 行为面：门静默集左键一帧零副作用 / 门数据>0 件照常起挥', () => {
  it('袋 21 件全量（含 3861/3862 注册件）：左键一帧 no-op（无 swing/无音/无消耗/无 useTime/无实体/无 toast）', () => {
    expect([...BOSS_BAG_IDS].filter((v) => !VANILLA_ITEM_KEY_BY_ID[v]), '袋全件须已注册可持用（BJ69 数据管线）').toEqual([]);
    for (const vid of BOSS_BAG_IDS) {
      const { g, player, added, sfxCalls, toasts, heldSlot } = stubGame(vid);
      (g as unknown as { updateUse: (dt: number) => void }).updateUse(1 / 60);
      expect(player.useTime, `${vid} useTime`).toBe(0);
      expect((g as unknown as { swing?: unknown }).swing, `${vid} swing`).toBeUndefined();
      expect(added, `${vid} 实体`).toHaveLength(0);
      expect(sfxCalls, `${vid} 音效`).toHaveLength(0);
      expect(toasts, `${vid} toast`).toHaveLength(0);
      expect(player.inv.slots[heldSlot]?.id, `${vid} 不消耗`).toBe(bagIid(vid));
    }
  });

  it('门静默抽样（真值=0 表/凝胶/条 combos 族）：一帧 no-op（RB15a 袋面的推广面）', () => {
    // ★71/999 等在 1457 系真使用物（func useStyle=1,金币=投掷武器 1.4.5 新制）——
    //  不入静默集;本组逐件先断真值=0（真值面漂移即在此爆红,不静默错杀）
    for (const vid of [15, 16, 17, 18, 23, 3456]) {
      expect(vanillaUseStyle(vid), `vid ${vid} 真值锚定`).toBe(0);
      expect(heldItemUseStyle(vid), `vid ${vid} 门数据`).toBe(0);
      const { g, player, added, sfxCalls, toasts, heldSlot } = stubGame(vid);
      (g as unknown as { updateUse: (dt: number) => void }).updateUse(1 / 60);
      expect(player.useTime, `${vid} useTime`).toBe(0);
      expect((g as unknown as { swing?: unknown }).swing, `${vid} swing`).toBeUndefined();
      expect(added, `${vid} 实体`).toHaveLength(0);
      expect(sfxCalls, `${vid} 音效`).toHaveLength(0);
      expect(toasts, `${vid} toast`).toHaveLength(0);
      expect(player.inv.slots[heldSlot]?.id, `${vid} 不消耗`).toBe(bagIid(vid));
    }
  });

  it('阳性对照（防"全 miss 恒 0"反向陷阱,playbook P3.1）：3213 钱槽发射+音效', () => {
    const { g, added, sfxCalls } = stubGame(3213);
    (g as unknown as { updateUse: (dt: number) => void }).updateUse(1 / 60);
    expect(added.length).toBeGreaterThanOrEqual(1);
    expect(sfxCalls.length).toBeGreaterThanOrEqual(1);
  });

  it('阳性对照（回填面）：1874 圣诞装饰（回填 1）与 1905（表载 1）照常起挥', () => {
    for (const vid of [1874, 1905]) {
      expect(heldItemUseStyle(vid), `${vid} 门数据>0`).toBeGreaterThan(0);
      const { g } = stubGame(vid);
      (g as unknown as { updateUse: (dt: number) => void }).updateUse(1 / 60);
      const swing = (g as unknown as { swing?: { t: number; dur: number } }).swing;
      expect(swing, `${vid} 挥摆在位`).toBeTruthy();
    }
  });
});

// ================= ④结构锁：门表达式在位（防静默回退/删除） =================

describe('BJ69 结构锁', () => {
  it('updateUse「其它物品」臂门表达式在位且消费 heldItemUseStyle（>0 相位）', () => {
    const gameSrc = readFileSync(join(dirname(__dirname), 'src', 'core', 'Game.ts'), 'utf8');
    expect(gameSrc).toMatch(/heldItemUseStyle\(viIdFromKey\(heldDef\.key\) \?\? -1\) > 0/);
    // 袋豁免集已退役（推广为数据门,防两表漂移的旧结构锁随之退役）
    expect(gameSrc).not.toContain('BOSS_BAG_NO_USE_VIDS');
    // 左键开包入口回潮禁令延续（§五/RB15a 锁面）
    expect(gameSrc).not.toContain('openBossBag');
  });
});
