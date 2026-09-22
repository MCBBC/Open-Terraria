// ★BJ257 实机探针——「先进战斗技术：卷二 5336」使用消耗面定谳取证。
//   症状：用户实报卷二使用后不被消耗（物品还在）。
//   修复：Game.ts 战斗书支（4382/5336）补通用消耗门 removeHeld(1)（原版
//         Player.cs:43612 itemTime==itemTimeMax && consumable → stack-1）+
//         起手面补 useSwing/playUseSound + useTime 30→45。
//   本探针只出数据（判读在台账层）：
//     A 卷二首次使用 → 旗标置位 + stack 1→0 + useTime 45 + swing + Item_92 + 公告
//     B 惰性书（旗标已置位）再点 → stack 不变 + useTime 0 + swing/音照播（原版语义）
//     C 卷一 4382 同消耗面（同支同漏一并修）
//     D stack=2 用一次余 1（堆叠消耗面）
//     E 城镇 NPC maxHp 增量观测（有 NPC 在场才有数据,判读在台账层）
// GPU 页禁 trace。跑法：SW_ORIGIN=http://localhost:5202 node tools/run-diag.mjs scripts/_bj257-combat-book-use.mjs
import { launchBrowser, openPage, bootstrap, createGame, ledger, saveJson }
  from '../tools/probe/lib/index.mjs';

const L = ledger();
const errors = [];
const browser = await launchBrowser({});
const page = await openPage(browser, { errors });
try {
  const boot = await bootstrap(page, process.env.SW_ORIGIN);
  L.chk('bootstrap', boot?.ok !== false, JSON.stringify(boot ?? {}));
  const gen = await createGame(page, { mode: 'direct', seed: '05162020', size: 'small' });
  L.chk('世界已建', gen.ok, JSON.stringify({ w: gen.w, h: gen.h }));

  const out = await page.evaluate(() => {
    const g = window.__swGame;
    const KEY = window.__swVANILLA_ITEM_KEY_BY_ID;
    const ITEMS = window.__swItems;
    const book2 = ITEMS[KEY[5336]], book1 = ITEMS[KEY[4382]];
    if (book2 === undefined || book1 === undefined) return { fatal: `book not registered v2=${book2} v1=${book1}` };

    // ---- 仪器（中立包装：只记录不改行为）----
    const texts = [], sfx = [];
    const origText = g.newText.bind(g);
    g.newText = (t, r, gg, b) => { texts.push(String(t)); return origText(t, r, gg, b); };
    const origSfx = g.playSfxFile.bind(g);
    g.playSfxFile = (w, v) => { sfx.push(String(w)); return origSfx(w, v); };
    const npcSnap = () => (g.entities.npcs ?? [])
      .filter((n) => !n.dead && typeof n.maxHp === 'number')
      .map((n) => ({ vid: n.vanillaId ?? -1, maxHp: n.maxHp }));

    const grant = (iid, stack = 1) => {
      g.player.inv.selected = 0;
      g.player.inv.slots[0] = { id: iid, stack };
      g.cb.onInventoryChanged?.();
    };
    const snap = () => ({
      stack: g.player.inv.slots[0]?.stack ?? 0,
      useTime: g.player.useTime,
      swing: !!g.swing,
      v1: !!g.world.flags.combatBookWasUsed,
      v2: !!g.world.flags.combatBookVolumeTwoWasUsed,
      textsN: texts.length, sfxNew: sfx.slice(),
      npcs: npcSnap(),
    });
    // 单次使用：一次 mouseDown 边沿 + 1 tick（同步 evaluate 内完成，rAF 不插队）
    const useOnce = () => {
      const sfxN = sfx.length;
      g.player.useTime = 0;
      g.input.mouseDown = true;
      g.fixedUpdate(1 / 60);
      const s = snap();
      s.sfxNew = s.sfxNew.slice(sfxN);      // 只看本拍新增
      g.input.mouseDown = false;
      return s;
    };
    // 冷却泄放（同步 60t——rAF 不插队）
    const settle = () => { for (let i = 0; i < 60; i++) g.fixedUpdate(1 / 60); };

    const stages = [];
    stages.push({ name: 'baseline', ...snap() });

    // ---- A. 卷二 5336 首次使用（stack 1）----
    grant(book2, 1);
    stages.push({ name: 'A_granted', ...snap() });
    const A = useOnce();
    settle();
    stages.push({ name: 'A_after_settle', ...snap() });

    // ---- B. 惰性书（旗标已置位）再点 ----
    grant(book2, 1);
    const B = useOnce();
    settle();

    // ---- C. 卷一 4382 首次使用 ----
    grant(book1, 1);
    const C = useOnce();
    settle();

    // ---- D. 第二本卷二（旗标已置位）零消耗（原版门=世界旗 :45722,非按本耗）----
    grant(book2, 2);
    const D = useOnce();
    settle();

    return { stages, A, B, C, D, texts, errors: undefined };
  });

  L.chk('A 卷二消耗 stack=0', out?.A?.stack === 0, JSON.stringify({ stack: out?.A?.stack }));
  L.chk('A 卷二旗标 v2 置位', out?.A?.v2 === true, JSON.stringify({ v2: out?.A?.v2 }));
  L.chk('A useTime=45（ApplyItemTime 45）', out?.A?.useTime === 45, JSON.stringify({ useTime: out?.A?.useTime }));
  L.chk('A swing 起挥（useStyle 4 举持）', out?.A?.swing === true);
  L.chk('A Item_92 响（UseSound）', out?.A?.sfxNew?.includes('Item_92') === true, JSON.stringify(out?.A?.sfxNew));
  L.chk('A 世界公告 1 条', out?.A?.textsN === 1, JSON.stringify({ textsN: out?.A?.textsN, t: out?.texts }));
  L.chk('B 惰性书 stack=1 不耗', out?.B?.stack === 1, JSON.stringify({ stack: out?.B?.stack }));
  L.chk('B 惰性 useTime=0（无 ApplyItemTime）', out?.B?.useTime === 0, JSON.stringify({ useTime: out?.B?.useTime }));
  L.chk('B 惰性无公告', out?.B?.textsN === 1, JSON.stringify({ textsN: out?.B?.textsN }));
  L.chk('B 惰性照播照响（swing+Item_92）', out?.B?.swing === true && out?.B?.sfxNew?.includes('Item_92') === true,
    JSON.stringify(out?.B?.sfxNew));
  L.chk('C 卷一消耗 stack=0 + v1 置位 + 45', out?.C?.stack === 0 && out?.C?.v1 === true && out?.C?.useTime === 45,
    JSON.stringify({ stack: out?.C?.stack, v1: out?.C?.v1, useTime: out?.C?.useTime }));
  L.chk('D 第二本（旗标已置位）零消耗 stack=2 不变', out?.D?.stack === 2 && out?.D?.useTime === 0,
    JSON.stringify({ stack: out?.D?.stack, useTime: out?.D?.useTime }));
  const nBefore = out?.stages?.[1]?.npcs ?? [], nAfter = out?.stages?.[2]?.npcs ?? [];
  L.say(`INFO E 城镇NPC: A前=${JSON.stringify(nBefore)} A后=${JSON.stringify(nAfter)}`);
  L.say(`INFO 公告流=${JSON.stringify(out?.texts)}`);
  L.chk('页零 pageerror', errors.length === 0, errors.slice(0, 3).join(' | '));
  await saveJson('bj257-combat-book-use.json', { out, errors: errors.slice(0, 10) });
} finally {
  await browser.close().catch(() => {});
}
process.exit(L.ok ? 0 : 2);
