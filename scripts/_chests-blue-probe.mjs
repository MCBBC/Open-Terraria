// 红蓝对抗:全容器类型显示+交互(刀 14;2026-09-09)
//  五类:世界箱(型名/Back5)/猪猪 -2/保险箱 -3/守护者熔炉 -4(Back2 黄)/虚空 -5(Back2+收藏 Back19)
//  交互:放入/取回/收藏贴图/补货/排列/五钮
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const fails = [];
const ok = (cond, name) => {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}`);
  if (!cond) fails.push(name);
};

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 600000, defaultViewport: { width: 1600, height: 1000 } });
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push((e.stack || e.message).slice(0, 300)));
await page.goto(ORIGIN + '/?play=small&invlayout=vanilla', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swUI, { timeout: 280000, polling: 1000 });
await page.waitForFunction(() => document.querySelector('.sw-vinv'), { timeout: 240000, polling: 1000 });
await new Promise((r) => setTimeout(r, 800));
await page.evaluate(() => document.getElementById('sw-welcome-announce')?.remove());

const v = await page.evaluate(async () => {
  const g = window.__swGame, ui = window.__swUI;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const out = { types: {} };
  const { ITEM_BY_KEY, VANILLA_ITEM_KEY_BY_ID } = await import('/src/data/items.ts');
  const iidOf = (vid) => { const k = VANILLA_ITEM_KEY_BY_ID[vid]; return k !== undefined ? ITEM_BY_KEY[k] : undefined; };
  const st = g.world.store;
  const refresh = async () => { await ui.refreshAllAsync(); await ui.refreshAllAsync(); };

  const openAndCheck = async (key, x, opts = {}) => {
    // bank 类直开(x<0 豁免自动关);世界箱=真 tile+登记
    let chest;
    if (x < 0) {
      chest = { x, y: 0, items: new Array(40).fill(null) };
    } else {
      const tx = Math.min(st.w - 2, Math.floor(g.player.x / 16) + 2 + (opts.dx ?? 0));
      const ty = Math.min(st.h - 2, Math.floor(g.player.y / 16) + (opts.dy ?? 0));
      st.type[st.idx(tx, ty)] = (await import('/src/data/tiles.ts')).TILE_BY_KEY['chest'];
      if (opts.frameX !== undefined) st.frameX[st.idx(tx, ty)] = opts.frameX;
      chest = g.world.chests.find((c) => c.x === tx && c.y === ty);
      if (!chest) { chest = { x: tx, y: ty, items: new Array(40).fill(null) }; g.world.chests.push(chest); }
    }
    if (opts.items) chest.items = opts.items;
    ui.openChest = chest;
    await refresh();
    await sleep(60);
    const nameEl = ui.vinvChestNameEl;
    const slots = [...document.querySelectorAll('.sw-slot[data-where="chest"]')];
    const slot0 = slots.find((s) => s.dataset.idx === '0' && s.offsetParent !== null);
    const tex = slot0 ? (slot0.style.getPropertyValue('--slot-bgimg').match(/Inventory_Back\d+/)?.[0] ?? null) : null;
    const btns = [...document.querySelectorAll('.vinv-txt')].filter((b) => b.offsetParent !== null && ['拿走全部', '存放全部', '快速堆叠', '补货', '排列物品'].includes((b.textContent || '').trim())).length;
    const dbg3 = slots.slice(0, 3).map((s) => ({ x: s.offsetLeft, y: s.offsetTop, d: s.style.display === '' ? '(default)' : s.style.display, op: !!s.offsetParent }));
    return { chest, name: nameEl ? nameEl.textContent : null, tex, slotsVisible: slots.filter((s) => s.offsetParent !== null).length, btns, dbg3 };
  };
  const closeAll = async () => { ui.openChest = null; await refresh(); await sleep(50); };

  // ---- ① 五类显示 ----
  // 1a. 世界箱默认型(frameX=0 → LegacyChestType.0)
  {
    const r = await openAndCheck('world0', 1, { frameX: 0 });
    out.types.world0 = { name: r.name, tex: r.tex, slots: r.slotsVisible, btns: r.btns, dbg3: r.dbg3 };
    await closeAll();
  }
  // 1b. 世界箱金箱型(frameX=36·4 → LegacyChestType.4)
  {
    const r = await openAndCheck('world4', 1, { frameX: 36 * 4, dx: 3 });
    out.types.world4 = { name: r.name, tex: r.tex };
    await closeAll();
  }
  // 2-4. 三银行
  for (const [key, x, wantName] of [['piggy', -2, '猪猪储蓄罐'], ['safe', -3, '保险箱'], ['forge', -4, '守护者熔炉']]) {
    const r = await openAndCheck(key, x);
    out.types[key] = { name: r.name, tex: r.tex, btns: r.btns };
    await closeAll();
  }
  // 5. 虚空保险库(x=-5, Back2;收藏件=Back19)
  {
    const favId = iidOf(9);   // Wood 任意件
    const items = new Array(40).fill(null);
    items[0] = { id: favId, stack: 5, favorited: true };
    items[1] = { id: iidOf(3), stack: 7 };
    const r = await openAndCheck('void', -5, { items });
    const slot0 = [...document.querySelectorAll('.sw-slot')].find((s) => s.dataset.where === 'chest' && s.dataset.idx === '0');
    const slot1 = [...document.querySelectorAll('.sw-slot')].find((s) => s.dataset.where === 'chest' && s.dataset.idx === '1');
    out.types.void = {
      name: r.name, tex: r.tex,
      favTex: slot0 ? (slot0.style.getPropertyValue('--slot-bgimg').match(/Inventory_Back\d+/)?.[0] ?? null) : null,
      normTex: slot1 ? (slot1.style.getPropertyValue('--slot-bgimg').match(/Inventory_Back\d+/)?.[0] ?? null) : null,
    };
    // 收藏件 Loot All 跳过(留库)
    g.player.inv.slots[10] = null;
    const lootBtn = [...document.querySelectorAll('.vinv-txt')].find((b) => (b.textContent || '').trim() === '拿走全部');
    lootBtn?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    await refresh();
    out.types.void.favStays = !!(ui.openChest && ui.openChest.items[0] && ui.openChest.items[0].favorited && ui.openChest.items[0].id === favId);
    await closeAll();
  }
  // ---- ② 交互:放入/取回(持物链) ----
  {
    ui.openChest = { x: -2, y: 0, items: new Array(40).fill(null) };
    await refresh();
    const wid = iidOf(649) ?? iidOf(4);   // 任一近战
    ui.heldStack = { id: wid, stack: 3 };
    const slot0 = [...document.querySelectorAll('.sw-slot')].find((s) => s.dataset.where === 'chest' && s.dataset.idx === '0' && s.offsetParent !== null);
    if (!slot0 || wid === undefined) { out.putWorked = 'no-slot/wid'; return out; }
    slot0.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    await refresh();
    out.putWorked = ui.openChest.items[0]?.stack === 3 && ui.heldStack === null;
    slot0.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    await refresh();
    out.takeWorked = ui.heldStack !== null && ui.openChest.items[0] === null;
    ui.closeInventory();
    await refresh();
  }
  return out;
}).catch((e) => ({ evalFail: String(e).slice(0, 300) }));

if (v.evalFail) {
  ok(false, `evaluate 失败: ${v.evalFail}`);
} else {
  const t = v.types;
  ok(t.world0 && t.world0.name && t.world0.tex === 'Inventory_Back5' && t.world0.slots >= 40 && t.world0.btns === 5,
    `蓝:世界箱默认型 名=${t.world0 && t.world0.name} 贴=${t.world0 && t.world0.tex} 槽=${t.world0 && t.world0.slots} 钮=${t.world0 && t.world0.btns}, dbg=${JSON.stringify(t.world0 && t.world0.dbg3)}`);
  ok(t.world4 && /金箱|黄金箱/.test(t.world4.name ?? '') && t.world4.tex === 'Inventory_Back5',
    `蓝:金箱型名(LegacyChestType.4) got ${t.world4 && t.world4.name} 贴=${t.world4 && t.world4.tex}`);
  ok(t.piggy && t.piggy.name === '猪猪储蓄罐' && t.piggy.tex === 'Inventory_Back2' && t.piggy.btns === 5,
    `蓝:猪猪 名=${t.piggy && t.piggy.name} 贴=${t.piggy && t.piggy.tex} 钮=${t.piggy && t.piggy.btns}`);
  ok(t.safe && t.safe.name === '保险箱' && t.safe.tex === 'Inventory_Back2', `蓝:保险箱 got ${t.safe && t.safe.name}/${t.safe && t.safe.tex}`);
  ok(t.forge && t.forge.name === '守护者熔炉' && t.forge.tex === 'Inventory_Back2', `蓝:守护者熔炉 got ${t.forge && t.forge.name}/${t.forge && t.forge.tex}`);
  ok(t.void && t.void.name === '虚空保险库' && t.void.tex === 'Inventory_Back2', `蓝:虚空库 名/贴 got ${t.void && t.void.name}/${t.void && t.void.tex}`);
  ok(t.void && t.void.favTex === 'Inventory_Back19', `蓝:虚空收藏=Back19 got ${t.void && t.void.favTex}`);
  ok(t.void && t.void.normTex === 'Inventory_Back2', `蓝:虚空普通=Back2 got ${t.void && t.void.normTex}`);
  ok(t.void && t.void.favStays, `蓝:虚空收藏件 Loot 跳过 got ${t.void && t.void.favStays}`);
  ok(v.putWorked, `蓝:持物放入槽 got ${v.putWorked}`);
  ok(v.takeWorked, `蓝:点槽取回 got ${v.takeWorked}`);
}
ok(errs.length === 0, `无页面错误 ${errs.length ? JSON.stringify(errs.slice(0, 2)) : ''}`);

await browser.close();
console.log(fails.length ? `\n${fails.length} FAILED` : '\nALL PASS');
process.exit(fails.length ? 1 : 0);
