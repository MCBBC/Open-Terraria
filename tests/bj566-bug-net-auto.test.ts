// ★BJ566（2026-10-08）虫网自动挥舞判别测试（用户实报"虫网不能自动挥舞"）。
// 金标（亲读 Terarria1457/Terraria/Item.cs）：
//  - 虫网 Bug Net 1991：useStyle=1 / useTime=25 / useAnimation=25 / autoReuse=true /
//    useTurn=true / UseSound=Item1 / value=buyPrice(0,0,25)（case 1991 :21306-21316）
//  - 金网 Golden Bug Net 3183：18/18 / autoReuse=true / rare=4 / scale=1.15（:29542-29552）
//  - 木网 Fireproof Bug Net 4821：21/21 / autoReuse=true / rare=3 / scale=0.85（:39481-39491）
//  - 起用总门 Player.cs:43064 `controlUseItem && releaseUseItem && itemAnimation==0
//    && item.useStyle != 0`：非 autoReuse 件 releaseUseItem=!controlUseItem（:43160）
//    ——松开再按才可重挥；autoReuse 件 AutoReuseLogic :53521-53529 强制 releaseUseItem=
//    true（按住连挥）且 itemAnimation==1 拍归零=同帧重启窗。
//  - 捕捉面 :43986 `(sItem.damage>=0 && ... || sItem.type==1991/3183/4821) &&
//    itemAnimation>0` ——捕捉随挥击窗走，autoReuse 连挥即连续捕捉（数据面在案）。
// 本仓定谳：数据面（vanilla-itemcombat.json）autoReuse/useTime/useAnimation 全在案
// 【非数据漏】；病灶=Game.updateUse 裸挥臂（「其它物品」else 支）对按住帧逐帧
// useSwing 重启（探针 scripts/_bj566-bugnet-auto-probe.mjs:按住 180t 重启 180 次、
// swing.t 钉在 dur−1,动画永走不完）。落刀=复用节拍门（swingOver && (edge||held)）。
// 锁面：
//  ①数据面：itemCombat/vanilla-itemfunc 三网钉值 ≡ Item.cs 真值（反编译直读提取,防漂移）
//  ②行为面：updateUse 桩驱动（bj69 stubGame 惯例）——起挥/周期推进/按住连挥/松手断链/
//    挥击中点击不重启（itemAnimation==0 门）
//  ③同族对拍：金网 18t / 木网 21t 各自周期长
//  ④结构锁：裸挥臂复用节拍门表达式在位
import { describe, it, expect } from 'vitest';
import { newWiresRadialState } from '../src/stats/wiresRadial';   // ★BJ662 桩族补齐（BJ626 newWiresRadialState 先例）
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';

import { itemCombat } from '../src/data/vanillaItemCombat';
import { itemFuncOfVid } from '../src/data/vanillaItemFunc';
import { Game } from '../src/core/Game';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { World } from '../src/world/World';
import { TILE } from '../src/core/constants';
import { ITEM_BY_KEY, VANILLA_ITEM_KEY_BY_ID } from '../src/data/items';
// ★C档可移植:仓库外依赖(game/ 兄弟目录,clone 侧缺=正常形态)——缺则本文件 skip,本机在=真跑零语义变化
const EXT_MISSING = !['Terarria1457'].every((d) => existsSync(new URL(`../../${d}`, import.meta.url)));


const REPO = join(dirname(__dirname), '..');
const ITEM_CS = existsSync(join(REPO, 'Terarria1457', 'Terraria', 'Item.cs')) ? readFileSync(join(REPO, 'Terarria1457', 'Terraria', 'Item.cs'), 'utf8') : '';   // ★C档可移植:缺档降级(EXT_MISSING skip 兜底)
const LINES = ITEM_CS.split('\n');
const GAME_SRC = existsSync(join(REPO, 'game', 'src', 'core', 'Game.ts')) ? readFileSync(join(REPO, 'game', 'src', 'core', 'Game.ts'), 'utf8') : '';   // ★C档可移植:缺档降级(EXT_MISSING skip 兜底)

/** Item.cs SetDefaults switch case 体提取（BJ69 methodRange 同构,单 case 域;
 *  反编译缩进：case 行=2 tab,体/break 行=3 tab） */
function caseBody(type: number): string {
  const sig = LINES.findIndex((l) => l === `\t\tcase ${type}:`);
  if (sig < 0) throw new Error(`case ${type} not found`);
  const end = LINES.findIndex((l, i) => i > sig && /^\t\t\t(break|return);/.test(l));
  if (end < 0) throw new Error(`case ${type} unterminated`);
  return LINES.slice(sig, end + 1).join('\n');
}

const NETS = [
  { vid: 1991, name: 'Bug Net', useTime: 25, useAnimation: 25, scale: null, rare: null },
  { vid: 3183, name: 'Golden Bug Net', useTime: 18, useAnimation: 18, scale: 1.15, rare: 4 },
  { vid: 4821, name: 'Fireproof Bug Net', useTime: 21, useAnimation: 21, scale: 0.85, rare: 3 },
] as const;

const iidOf = (vid: number): number => {
  const k = VANILLA_ITEM_KEY_BY_ID[vid];
  const found = k ? ITEM_BY_KEY[k] : undefined;
  if (found === undefined) throw new Error(`vid ${vid} 未注册`);
  return found;
};

/** updateUse 可驱动的最小 Game 桩（tests/bj69-nouse-gate.test.ts stubGame 同构） */
function stubGame(heldVid: number) {
  const g = Object.create(Game.prototype) as unknown as Record<string, unknown>;
  // ★BJ662（2026-10-12）updateUse 头 tickWiresRadial（BJ572）读 this.wiresRadial——Object.create 壳无构造器字段 → flowerUpdate(st=undefined) TypeError（存量桩族缺件,持物非 wire 工具走早退支,桩仅为通路）
  (g as unknown as { wiresRadial: unknown }).wiresRadial = newWiresRadialState();
  const player = new Player(50 * TILE, 90 * TILE, new Inventory());
  player.inv.add(iidOf(heldVid), 1);
  const sel = player.inv.slots.findIndex((s) => s && s.id === iidOf(heldVid));
  player.inv.selected = Math.max(0, sel);
  g.player = player;
  g.world = new World(120, 120, 30, 'bj566');
  g.entities = { critters: [], npcs: [], enemies: [], projectiles: [] };
  g.input = {
    mouseDown: false, mouseHeld: false, mouseX: 700, mouseY: 300,
    rightDown: false, uiBlocking: false, downAction: () => false,
  };
  g.camera = { tileUnder: () => [60, 60], screenToWorld: () => [800, 0], x: 800, y: 0 };
  g.renderer = { canvas: { width: 800, height: 600 }, fullMap: { open: false }, timeUiHover: false, weatherUiHover: false };
  g.smartCursor = { showing: false };
  g.annotateMode = false;
  g.prevSwingMouse = false;
  g.mining = null;
  g.swingHitSet = new Set<number>();
  g.swingTileCutSet = new Set<number>();
  g.sfx = { play: () => {}, playWav: () => {}, playWavFile: () => {}, playFiles: () => {} };
  g.playSfxFile = () => {};
  g.playSfxWav = () => {};
  g.playUseSound = () => {};
  g.cb = { onInventoryChanged: () => {}, onToast: () => {} };
  return {
    g,
    player,
    inp: g.input as { mouseDown: boolean; mouseHeld: boolean },
    swing: () => (g as { swing?: { t: number; dur: number } }).swing,
    updateUse: () => (g as unknown as { updateUse: (dt: number) => void }).updateUse(1 / 60),
  };
}

// ================= ①数据面：三网钉值 ≡ Item.cs 真值 =================

describe.skipIf(EXT_MISSING)('BJ566 数据面：三网 autoReuse 钉值（Item.cs SetDefaults 直读对拍）', () => {
  for (const n of NETS) {
    it(`${n.name}(${n.vid})：case 体含 autoReuse=true 且 useTime/useAnimation=${n.useTime}`, () => {
      const body = caseBody(n.vid);
      expect(body).toMatch(/autoReuse = true;/);                       // :21315/:29551/:39490
      expect(body).toMatch(new RegExp(`useTime = ${n.useTime};`));
      expect(body).toMatch(new RegExp(`useAnimation = ${n.useAnimation};`));
      expect(body).toMatch(/useStyle = 1;/);
      expect(body).toMatch(/useTurn = true;/);
      if (n.scale !== null) expect(body).toMatch(new RegExp(`scale = ${n.scale}f;`));
      if (n.rare !== null) expect(body).toMatch(new RegExp(`rare = ${n.rare};`));
    });
    it(`${n.name}(${n.vid})：本仓 combat/itemfunc 表钉值在案（数据面非漏）`, () => {
      const c = itemCombat(n.vid);
      expect(c, 'combat 条目在案').toBeTruthy();
      expect(c!.autoReuse).toBe(true);                                 // Item.cs :21315 等
      expect(c!.useTime).toBe(n.useTime);
      expect(c!.useAnimation).toBe(n.useAnimation);
      expect(c!.useTurn).toBe(true);
      expect(c!.damage, '网 damage=0（无伤面,捕捉专件）').toBeUndefined();
      const f = itemFuncOfVid(n.vid);
      expect(f?.useStyle).toBe(1);
      expect(f?.autoReuse).toBeTruthy();
    });
  }
});

// ================= ②行为面：updateUse 桩驱动 =================

describe.skipIf(EXT_MISSING)('BJ566 行为面：裸挥臂复用节拍（updateUse 桩,挥击窗以手动 t-- 推进）', () => {
  it('虫网 1991：按住连挥——周期走完同拍重启（≥3 周期）,周期内不重启', () => {
    const s = stubGame(1991);
    // 按住（浏览器 mousedown 双旗同置 Input.ts:241;持住帧 prevSwingMouse=true）
    s.inp.mouseDown = true; s.inp.mouseHeld = true;
    s.updateUse();
    const sw1 = s.swing();
    expect(sw1, '起挥').toBeTruthy();
    expect(sw1!.dur).toBe(25);                       // useAnimation 25（:21309-21310）
    expect(sw1!.t).toBe(25);
    // 周期内逐帧：swing 对象恒等（不逐帧重启）+ t 递减（动画推进）
    // （持住帧 prevSwingMouse=true——fixedUpdate :10714 在 updateUse 后记录,模拟真实按住）
    let cycleEnds = 0;
    let last = sw1!;
    for (let i = 0; i < 80; i++) {
      s.g.prevSwingMouse = true;
      last.t -= 1;                                   // postUpdate updateSwingHits t--（挥击窗推进）
      s.updateUse();
      const sw = s.swing();
      expect(sw, `帧 ${i} swing 在位`).toBeTruthy();
      if (sw !== last) {
        cycleEnds++;
        expect(last.t, '重启仅发生在周期末（itemAnimation==1 预清零窗,AutoReuseLogic :53526）')
          .toBeLessThanOrEqual(1);
        expect(sw!.dur).toBe(25);
        last = sw!;
      }
    }
    expect(cycleEnds, '80t/25t 周期 → ≥2 次同拍重启（按住连挥）').toBeGreaterThanOrEqual(2);
  });

  it('虫网 1991：挥击中点击（fresh edge）不重启——原版 itemAnimation==0 门 :43064', () => {
    const s = stubGame(1991);
    s.inp.mouseDown = true; s.inp.mouseHeld = true;
    s.updateUse();
    const sw1 = s.swing()!;
    // 周期中段模拟重新点击（prevSwingMouse=false=fresh edge,近战支 clickEdge 同态）
    (s.g as { swing: { t: number } }).swing.t = 12;
    s.g.prevSwingMouse = false;
    s.updateUse();
    expect(s.swing(), '周期中点击不重启').toBe(sw1);
    expect(s.swing()!.t).toBe(12);
  });

  it('虫网 1991：松手断链——mouseHeld 消失后周期走完不再重启（非 autoReuse 语义≠网）', () => {
    const s = stubGame(1991);
    s.inp.mouseDown = true; s.inp.mouseHeld = true;
    s.updateUse();
    const sw1 = s.swing()!;
    // 松开（mouseup 双旗同清 Input.ts:249）
    s.inp.mouseDown = false; s.inp.mouseHeld = false;
    for (let i = 0; i < 30; i++) {
      s.g.prevSwingMouse = false;
      (s.g as { swing?: { t: number } }).swing!.t -= 1;
      s.updateUse();
      expect(s.swing(), '松手后旧周期对象不再被替换').toBe(sw1);
    }
  });

  it('同族对拍：金网 3183 周期 18t / 木网 4821 周期 21t（各自 useAnimation 节拍连挥）', () => {
    for (const [vid, dur] of [[3183, 18], [4821, 21]] as const) {
      const s = stubGame(vid);
      s.inp.mouseDown = true; s.inp.mouseHeld = true;
      s.updateUse();
      expect(s.swing()!.dur, `${vid} 起挥 dur`).toBe(dur);
      let restarts = 0;
      let last = s.swing()!;
      for (let i = 0; i < 60; i++) {
        s.g.prevSwingMouse = true;                   // 持住帧
        last.t -= 1;
        s.updateUse();
        const sw = s.swing();
        if (sw !== last) {
          restarts++;
          expect(last.t, '重启仅发生在周期末（itemAnimation==1 预清零窗）').toBeLessThanOrEqual(1);
          last = sw!;
        }
      }
      expect(restarts, `${vid} 60t/${dur}t → ≥2 周期`).toBeGreaterThanOrEqual(2);
    }
  });

  it('负控对照：非 autoReuse 裸挥件（215 声音坐垫,case 215 无 autoReuse 行）按住仅一挥——'
    + '松开再按才可重挥（releaseUseItem :43160）', () => {
    expect(caseBody(215)).not.toMatch(/autoReuse/);      // :4049-4061 无 autoReuse 行
    expect(itemCombat(215)?.autoReuse ?? false).toBe(false);
    const s = stubGame(215);
    s.inp.mouseDown = true; s.inp.mouseHeld = true;
    s.updateUse();
    const sw1 = s.swing();
    expect(sw1, '起挥').toBeTruthy();
    let restarts = 0;
    let last = sw1!;
    for (let i = 0; i < 60; i++) {
      s.g.prevSwingMouse = true;                     // 持住帧（非 fresh edge）
      last.t -= 1;
      s.updateUse();
      const sw = s.swing();
      if (sw !== last) restarts++;
      if (sw) last = sw;
    }
    expect(restarts, '非 autoReuse 按住零重启').toBe(0);
  });

  it('阳性对照（防恒 0 陷阱）：虫网 fresh click 起挥 + 网捕捉面数据在案（isNet 特判输入）', () => {
    const s = stubGame(1991);
    s.inp.mouseDown = true; s.inp.mouseHeld = true;
    s.g.prevSwingMouse = false;
    s.updateUse();
    expect(s.swing()).toBeTruthy();
    // updateSwingHits 网特判消费面在案（:42962 网特判——捕捉随挥击窗走,本刀只改重启节拍）
    expect(GAME_SRC).toMatch(/const isNet = swingVid === 1991 \|\| swingVid === 3183 \|\| swingVid === 4821;/);
  });
});

// ================= ④结构锁 =================

describe.skipIf(EXT_MISSING)('BJ566 结构锁：裸挥臂复用节拍门在位', () => {
  it('updateUse「其它物品」else 支含 BJ566 复用节拍门（swingOver && (edge || autoReuseHeld)）', () => {
    expect(GAME_SRC).toMatch(/const bareOver = !this\.swing \|\| this\.swing\.t <= 1;/);
    expect(GAME_SRC).toMatch(/const bareEdge = inp\.mouseDown && !this\.prevSwingMouse;/);
    expect(GAME_SRC).toMatch(/const bareHeld = itemCombat\(bareVid\)\?\.autoReuse === true && inp\.mouseHeld;/);
    expect(GAME_SRC).toMatch(/if \(bareOver && \(bareEdge \|\| bareHeld\)\) \{/);
    expect(GAME_SRC).toContain('BJ566');
  });
});
