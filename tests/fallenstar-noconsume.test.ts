// ★坠落星 75 / 彩带 1345 不可消耗守卫（2026-09-25 用户实报「坠落星可被使用和消耗」翻案刀）。
// 金标：
//  - 通用消耗门 Player.cs:43612（1456 同式 :42602）`itemTimeMax != 0 && itemTime ==
//    itemTimeMax && item.consumable && !context.SkipItemConsumption`——关键前置
//    `itemTimeMax != 0`：itemTime/itemTimeMax 仅由效果路径 ApplyItemTime/SetItemTime
//    置位（Player.cs:4397/:4424/:43655/:45954/:46167/:46303）。零效果字段物品
//    （无 healLife/healMana/buffType/hairDye/createTile/createWall/shoot/mountType/
//    pick/axe/hammer/makeNPC）走不到任何置位路径 → itemTimeMax 恒 0 → 消耗门恒假。
//  - SetDefaults 真值：75 坠落星（Item.cs:2302-2316 useStyle4/useAnimation=useTime=17/
//    consumable/UseSound Item4/ammo FallenStar——零效果字段）；1345 彩带
//    （:16645-16654 useStyle1/useTime=useAnimation=20/autoReuse/consumable——零效果字段）。
//    两件原版点击 = 举持/挥动动画（StartActualUse :52291 ApplyItemAnimation）+
//    :52306 PlaySound（75 有声 Item4；1345 未设 UseSound=无声），仅此而已【不消耗】。
//  - ForceConsumption 覆写排除：ItemID.cs:161-173 全表 6 项
//    （2350/4870/2351/2756=false，4343/4344=true）——75/1345 均不在表内。
//  - 对照组（真消耗面,防"一刀切"误伤）：Boss/事件召唤物 361/602/1331 效果面在
//    ItemCheck_UseBossSpawners 等专支=真消耗；1990 发色去除剂 hairDye>=0=置位路径=真消耗。
// 锁面：
//  ①Item.cs SetDefaults case 真值（源码文本直读）:75/1345 零效果字段∧consumable=true
//  ②vanilla-itemfunc.json 档位 ≡ 真值（consumable=1 且零效果字段）
//  ③heldItemUseStyle(75)=4 / (1345)=1（举持/挥动姿势保持——姿势面不被本刀误摘）
//  ④结构锁：Game.ts 75 特判臂 / 1345 case 区间内无 removeHeld（消耗面禁回潮）
//  ⑤ForceConsumption 表不含 75/1345
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';

import { heldItemUseStyle } from '../src/core/Game';
import { itemFuncOfVid } from '../src/data/vanillaItemFunc';
// ★C档可移植:仓库外依赖(game/ 兄弟目录,clone 侧缺=正常形态)——缺则本文件 skip,本机在=真跑零语义变化
const EXT_MISSING = !['Terarria1457'].every((d) => existsSync(new URL(`../../${d}`, import.meta.url)));


const REPO = join(dirname(__dirname), '..');
const ITEM_CS = existsSync(join(REPO, 'Terarria1457', 'Terraria', 'Item.cs')) ? readFileSync(join(REPO, 'Terarria1457', 'Terraria', 'Item.cs'), 'utf8') : '';   // ★C档可移植:缺档降级(EXT_MISSING skip 兜底)
const PLAYER_CS = existsSync(join(REPO, 'Terarria1457', 'Terraria', 'Player.cs')) ? readFileSync(join(REPO, 'Terarria1457', 'Terraria', 'Player.cs'), 'utf8') : '';   // ★C档可移植:缺档降级(EXT_MISSING skip 兜底)
const ITEMID_CS = existsSync(join(REPO, 'Terarria1457', 'Terraria.ID', 'ItemID.cs')) ? readFileSync(join(REPO, 'Terarria1457', 'Terraria.ID', 'ItemID.cs'), 'utf8') : '';   // ★C档可移植:缺档降级(EXT_MISSING skip 兜底)
const GAME_TS = existsSync(join(REPO, 'game', 'src', 'core', 'Game.ts')) ? readFileSync(join(REPO, 'game', 'src', 'core', 'Game.ts'), 'utf8') : '';   // ★C档可移植:缺档降级(EXT_MISSING skip 兜底)

/** 摘 SetDefaults switch(type) 主表内 `case N:` 起至下一个同级 `case`/`default` 的源码块 */
// Item.cs 有多处 switch 含 case N（SetDefaults 主表/GetDrawHitbox 等）——主表判定:
// 取【第一个】含 consumable/useStyle 字段赋值的匹配块（GetDrawHitbox 的 case 75 只
// 有 return Frame(...),无字段赋值）
function setDefaultsCaseMain(id: number): string {
  const re = new RegExp(`\\n\\t\\tcase ${id}:\\n([\\s\\S]*?)\\n\\t\\t(case |default:)`, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(ITEM_CS)) !== null) {
    if (/useStyle|consumable|createTile|width = /.test(m[1])) return m[1];
  }
  throw new Error(`main-table case ${id} not found`);
}

/** 效果字段族（itemTime 置位路径判据字段——见文件头金标） */
const EFFECT_FIELD_RE = /\b(healLife|healMana|buffType|hairDye|createTile|createWall|shoot|mountType|pick|axe|hammer|makeNPC|tileWand|fishingPole|mana)\s*=/;

describe.skipIf(EXT_MISSING)('坠落星75/彩带1345 原版真值（SetDefaults 零效果字段）', () => {
  it('case 75: useStyle4/useTime=useAnimation=17/consumable/UseSound Item4 且零效果字段', () => {
    const body = setDefaultsCaseMain(75);
    expect(body).toContain('useStyle = 4');
    expect(body).toContain('useAnimation = 17');
    expect(body).toContain('useTime = 17');
    expect(body).toContain('consumable = true');
    expect(body).toContain('UseSound = SoundID.Item4');
    expect(body).toContain('ammo = AmmoID.FallenStar');
    expect(body).not.toMatch(EFFECT_FIELD_RE); // 零效果字段 = 消耗门不可达的根据
  });

  it('case 1345: useStyle1/useTime=useAnimation=20/autoReuse/consumable 且零效果字段', () => {
    const body = setDefaultsCaseMain(1345);
    expect(body).toContain('useStyle = 1');
    expect(body).toContain('useAnimation = (useTime = 20)');
    expect(body).toContain('autoReuse = true');
    expect(body).toContain('consumable = true');
    expect(body).not.toMatch(EFFECT_FIELD_RE);
    expect(body).not.toContain('UseSound'); // 未设 UseSound = 原版点击无声
  });

  it('对照组: Boss/事件召唤物与发色去除剂应有真效果字段或专支效果面', () => {
    // 1990 发色去除剂 hairDye = 0（>=0 即置位路径=真消耗）——防提取器/断言域漂移
    expect(setDefaultsCaseMain(1990)).toMatch(/\bhairDye\s*=/);
    // 361/602/1331 Boss/事件召唤物：SetDefaults 亦零效果字段,但效果面在
    // ItemCheck_UseBossSpawners/事件专支（Player.cs CheckCanUse_Inner 对 361/602/
    // 1331 有专支判据）——它们的消耗合法,锁专支存在
    expect(PLAYER_CS).toContain('private void ItemCheck_UseBossSpawners');
    expect(PLAYER_CS).toMatch(/ItemCheck_UseBossSpawners\(/); // 确有调用点
  });
});

describe.skipIf(EXT_MISSING)('itemfunc 数据档 ≡ 原版真值', () => {
  it('itemFuncOfVid(75) = {consumable:1, useStyle:4} 且零效果字段', () => {
    const f = itemFuncOfVid(75);
    expect(f?.consumable).toBe(1);
    expect(f?.useStyle).toBe(4);
    for (const k of ['healLife', 'healMana', 'buffType', 'createTile', 'shoot', 'pick', 'axe', 'hammer'] as const) {
      expect(f?.[k]).toBeUndefined();
    }
  });

  it('itemFuncOfVid(1345) = {consumable:1, useStyle:1} 且零效果字段', () => {
    const f = itemFuncOfVid(1345);
    expect(f?.consumable).toBe(1);
    expect(f?.useStyle).toBe(1);
  });

  it('heldItemUseStyle 姿势面保持（75 举持=4 / 1345 挥动=1）——本刀只摘消耗不摘姿势', () => {
    expect(heldItemUseStyle(75)).toBe(4);
    expect(heldItemUseStyle(1345)).toBe(1);
  });
});

describe.skipIf(EXT_MISSING)('ForceConsumption 覆写排除', () => {
  it('ItemID.cs ForceConsumption 全表仅 6 项且不含 75/1345', () => {
    const m = /ForceConsumption = Factory\.CreateCustomSet<bool\?>\(null, new object\[(\d+)\]\s*\{([\s\S]*?)\}\);/.exec(ITEMID_CS);
    expect(m).not.toBeNull();
    expect(Number(m![1])).toBe(12); // 6 对 (short)+bool
    const body = m![2];
    expect(body).not.toMatch(/\(short\)75\b/);
    expect(body).not.toMatch(/\(short\)1345\b/);
  });
});

describe.skipIf(EXT_MISSING)('结构锁：消耗面禁回潮（Game.ts）', () => {
  /** 摘 Game.ts 中以 `{` 收尾的锚行起的完整配对块（臂/分支体） */
  function blockFromBraceLine(anchor: string): string {
    const idx = GAME_TS.indexOf(anchor);
    if (idx < 0) throw new Error(`anchor not found: ${anchor}`);
    const lineStart = GAME_TS.lastIndexOf('\n', idx) + 1;
    const open = GAME_TS.indexOf('{', idx);
    if (open < 0) throw new Error('no brace after anchor');
    let depth = 1;
    for (let i = open + 1; i < GAME_TS.length; i++) {
      if (GAME_TS[i] === '{') depth++;
      else if (GAME_TS[i] === '}') {
        depth--;
        if (depth === 0) return GAME_TS.slice(lineStart, i + 1);
      }
    }
    throw new Error('unbalanced');
  }

  /** 无花括号的 switch case 体（case N: 行起至使 depth 变负的 } = switch 闭合） */
  function blockFromCaseLine(anchor: string): string {
    const idx = GAME_TS.indexOf(anchor);
    if (idx < 0) throw new Error(`anchor not found: ${anchor}`);
    let depth = 0;
    for (let i = idx; i < GAME_TS.length; i++) {
      if (GAME_TS[i] === '{') depth++;
      else if (GAME_TS[i] === '}') {
        depth--;
        if (depth < 0) return GAME_TS.slice(idx, i + 1);
      }
    }
    throw new Error('unbalanced');
  }

  it('75 特判臂内无 removeHeld（点击=举持+Item4 音效,不消耗）', () => {
    const blk = blockFromBraceLine('heldDef.vid ?? -1) === 75) {');
    expect(blk).toContain('坠落星 75 点击');
    expect(blk).toContain('useSwing');
    expect(blk).toContain('Item_4');
    expect(blk).toContain('_prevMouseDown'); // fresh-click 边沿门（非 autoReuse）
    expect(blk).not.toContain('removeHeld');
  });

  it('1345 case 内无 removeHeld（点击=纯挥动,不消耗）', () => {
    const blk = blockFromCaseLine('case 1345:');
    expect(blk).toContain('useSwing');
    expect(blk).toContain('break;');
    expect(blk).not.toContain('removeHeld');
  });
});
