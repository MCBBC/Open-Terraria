// 6152 太阳花法杖运行时出手探针:真实 Game 管线内持杖按住鼠标,步进 tick,
// 统计弹 1114 生成数/魔耗/停发窗行为
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 300_000 });
const page = await browser.newPage();
page.on('console', (m) => { const t = m.text(); if (t.includes('Error') || t.includes('error')) console.log('[page]', t.slice(0, 200)); });
await page.goto(process.env.SW_ORIGIN ?? 'http://localhost:5199', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 2500));
await page.waitForSelector('select', { timeout: 120000 });
await page.evaluate(() => { const _s = document.querySelector('select'); _s.selectedIndex = 0; _s.parentElement.querySelector('button').click(); });
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.player && window.__swItems, { timeout: 300000 });
const KEY = process.env.SW_PROBE_ITEM ? 'vi_' + process.env.SW_PROBE_ITEM : 'vi_6152_DaybloomStaff';
const out = await page.evaluate((key) => {
  const g = window.__swGame;
  const p = g.player;
  // 给玩家目标杖并选中
  const id = g.constructor && null; // noop
  const items = window.__swItems ?? {};
  const vim = window.__swVANILLA_ITEM_KEY_BY_ID;
  const near = { exposed: !!vim, total: vim ? Object.keys(vim).length : 0 };
  if (vim) {
    for (let v = 6150; v <= 6155; v++) near[v] = { k: vim[v] ?? null, inMap: vim[v] ? items[vim[v]] !== undefined : false };
    near.sample6152 = vim[6152] ?? null;
    near.sample100 = vim[100] ?? null;
  }
  const itemId = items[key];
  if (itemId === undefined) return { err: 'vi_6152 不在 ITEM_BY_KEY', near };
  p.inv.slots[0] = { id: itemId, stack: 1 };
  p.inv.selected = 0;
  p.mana = 100; p.maxMana = 100;
  // 准星设到玩家右侧 5 格（世界→屏幕）
  const cam = g.camera;
  const [sx, sy] = cam.worldToScreen(p.cx + 5 * 16, p.cy);
  g.input.mouseX = Math.round(sx); g.input.mouseY = Math.round(sy);
  const seen = new Set();
  const snap = () => { const out = []; for (const e of g.entities.projectiles) { const k = e; if (!seen.has(k)) { seen.add(k); out.push(k); } } return out; };
  let known = snap();
  const shots = [];
  const manaTrace = [];
  // 真实 DOM 按住:puppeteer 层 page.mouse.down() 由外层驱动;此处只装计数
  // 猴补计数:useCombatWeapon / useSwing 调用观测
  const calls = { useCombatWeapon: 0, useSwing: 0, err: null };
  const origUCW = g.useCombatWeapon?.bind(g);
  const origUS = g.useSwing?.bind(g);
  if (origUCW) g.useCombatWeapon = (...a) => { calls.useCombatWeapon++; try { return origUCW(...a); } catch (e) { calls.ucwErr = String(e).slice(0, 300); calls.ucwStack = new Error().stack.split('\n').slice(2, 4).join(' | ').slice(0, 300); } };
  if (origUS) g.useSwing = (...a) => { calls.useSwing++; if (calls.useSwing > 2 && calls.useSwing < 6) { calls['stack' + calls.useSwing] = new Error().stack.split('\n').slice(2, 5).join(' | ').slice(0, 400); } try { return origUS(...a); } catch (e) { calls.err = String(e).slice(0, 200); throw e; } };
  const trace = [];
  for (let t = 0; t < 120; t++) {
    g.input.mouseDown = true; g.input.mouseHeld = true;   // 模拟连续挥动(每 tick 重按)
    if (t < 14) trace.push({ t, pre: { md: g.input.mouseDown, ut: g.player.useTime, swT: g.swing?.t ?? null, swDur: g.swing?.dur ?? null } });
    g.fixedUpdate(1 / 60);
    if (t < 14) trace[t].post = { md: g.input.mouseDown, ut: g.player.useTime, swT: g.swing?.t ?? null, ucw: calls.useCombatWeapon, shots: shots.length };
    const cur = snap();
    for (const e of cur) {
      if (!known.includes(e)) {
        known = cur;
        shots.push({ cls: e.constructor.name, projId: e.projId ?? null });
      }
    }
    if (t % 10 === 0) manaTrace.push(p.mana);
  }
  g.input.mouseDown = false; g.input.mouseHeld = false;
  const p1114 = shots.filter((x) => x.projId === 1114);
  g.useCombatWeapon = origUCW; g.useSwing = origUS;
  // 页内直查 use 链各门（combatWeapon 经 __swDiag 钩子）
  const DEFS = (window).__swITEM_DEFS ?? {};
  const heldDef = p.inv.heldItem() ? DEFS[p.inv.heldItem().id] ?? null : null;
  const cwFn = (window).__swCombatWeapon;
  const cw = heldDef && cwFn ? cwFn(heldDef) : 'fn-missing';
  // 手动驱动 case 本体 ×5:直接调 useCombatWeapon,数 1114 产出
  const manual = { fired: 0, manaBefore: p.mana };
  if (cw && cw !== 'fn-missing' && origUCW) {
    const before = new Set(g.entities.projectiles);
    for (let k = 0; k < 5; k++) { p.useTime = 0; origUCW(cw, heldDef); }
    for (const e of g.entities.projectiles) if (!before.has(e) && e.projId === 1114) manual.fired++;
  }
  manual.manaAfter = p.mana;
  const diag = {
    heldId: p.inv.heldItem()?.id, heldDefKey: heldDef?.key ?? null,
    vid: heldDef?.vid ?? null, defVidField: heldDef ? ('vid' in heldDef ? heldDef.vid : 'no-field') : null,
    cw: cw === 'fn-missing' ? cw : (cw ? { kind: cw.kind, shoot: cw.shoot, mana: cw.mana, autoReuse: cw.autoReuse } : null),
    manual,
    ladder: {
      potion: !!heldDef?.potion,
      pearl: (heldDef?.key || '').includes('5340'),
      consumableGate: g.consumableFuncGate ? g.consumableFuncGate(heldDef) : 'n/a',
      ranged: !!(heldDef?.ranged) || (window.__swRangedAmmo ? window.__swRangedAmmo(heldDef) > 0 : 'n/a'),
    },
    calls,
    mouseDown: g.input.mouseDown, mouseHeld: g.input.mouseHeld, useTime: p.useTime,
    uiBlocking: g.input.uiBlocking ?? null,
    silenced: p.buffs ? p.buffs.has(35) || p.buffs.has('Silenced') || p.buffs.has('silenced') : 'n/a',
  };
  return {
    heldKey: p.inv.heldItem() ? (p.inv.heldItem().id === itemId ? key : 'wrong') : 'none',
    totalNew: shots.length, p1114Count: p1114.length, trace,
    diag, manaTrace: manaTrace.slice(0, 4),
  };
}, KEY);
console.log(JSON.stringify(out, null, 1));
process.exit(0);
