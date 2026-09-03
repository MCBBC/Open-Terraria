// 一次性:装备/时装/染料/杂项全槽位审计 v3(2026-09-03)
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1920, height: 1080 } });
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push((e.stack || e.message).slice(0, 300)));
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swUI, { timeout: 300000, polling: 1000 });
await new Promise((r) => setTimeout(r, 2000));
await page.evaluate(() => {
  [...document.body.children].filter((d) => d.tagName === 'DIV' && d.style?.position === 'fixed'
    && d.textContent?.includes('欢迎来到 SandboxWorld')).forEach((d) => d.remove());
  const g = window.__swGame, inv = g.player.inv;
  const pool = ['vi_103_nightmare_pickaxe', 'vi_104_the_breaker', 'vi_109_mana_crystal', 'vi_1103_slush_block', 'vi_1111_blue_berries', 'vi_1115_red_husk', 'vi_112_flower_of_fire', 'vi_113_magic_missile', 'vi_1134_bottled_honey', 'vi_1156_piranha_gun', 'vi_1158_pygmy_necklace', 'vi_1169_bone_key', 'vi_117_meteorite_bar', 'vi_1173_grave_marker', 'vi_1175_headstone', 'vi_1179_chlorophyte_bullet'];
  const plan = [];
  const put = (where, i, vid) => plan.push([where, i, vid]);
  put('armor', 0, pool[0]); put('armor', 1, pool[1]); put('armor', 2, pool[2]);
  for (let k = 3; k <= 9; k++) put('armor', k, pool[k % pool.length]);
  for (let k = 10; k <= 19; k++) put('armor', k, pool[k % pool.length]);
  for (let k = 0; k <= 9; k++) put('dye', k, pool[(k + 5) % pool.length]);
  for (let k = 0; k <= 4; k++) put('misc', k, pool[(k + 3) % pool.length]);
  for (let k = 0; k <= 4; k++) put('miscDye', k, pool[(k + 8) % pool.length]);
  let skipped = 0;
  for (const [where, i, vid] of plan) {
    const id = g.itemId(vid);
    if (id === undefined || id < 0) { skipped++; continue; }
    const entry = { id, stack: 1 };
    if (where === 'armor') inv.armor[i] = entry;
    else if (where === 'dye') inv.dye[i] = entry;
    else if (where === 'misc') inv.miscEquips[i] = entry;
    else inv.miscDyes[i] = entry;
  }
  window.__skipped = skipped;
  window.__swUI.openInventory();
});
await new Promise((r) => setTimeout(r, 300));
await page.evaluate(() => { try { window.__swUI.refreshAll(); } catch {} });
await new Promise((r) => setTimeout(r, 500));
const out = await page.evaluate(() => {
  const g = window.__swGame, inv = g.player.inv;
  const dock = document.querySelector('.sw-eqdock');
  const arrOf = (w) => w === 'armor' ? inv.armor : w === 'dye' ? inv.dye : w === 'misc' ? inv.miscEquips : inv.miscDyes;
  const slots = [...dock.querySelectorAll('.sw-slot')];
  const hidden = [];
  const srcBySlot = new Map();
  const mismatch = [];
  const eyes = [];
  for (const s of slots) {
    const where = s.dataset.where, i = Number(s.dataset.idx);
    const r = s.getBoundingClientRect();
    const shown = r.height > 4;
    const data = arrOf(where)[i];
    const img = s.querySelector('img');
    const src = img?.getAttribute('src') ?? '';
    srcBySlot.set(`${where}[${i}]`, src);
    if (!shown) { hidden.push(`${where}[${i}]${data ? '(有数据!)' : ''}`); continue; }
    if (s.querySelector('.sw-peteye')) eyes.push(`${where}[${i}]`);
    if (data && !src) mismatch.push(`${where}[${i}] 空图标(有数据)`);
    if (!data && src) mismatch.push(`${where}[${i}] 有图标(无数据)`);
  }
  const same = (a, b) => srcBySlot.get(a) && srcBySlot.get(b) && srcBySlot.get(a) === srcBySlot.get(b);
  const colY = (where, idxs) => idxs.map((i) => {
    const s = dock.querySelector(`.sw-slot[data-idx="${i}"][data-where="${where}"]`);
    const r2 = s.getBoundingClientRect();
    return r2.height > 4 ? Math.round(r2.top) : null;
  }).filter((v) => v !== null);
  const eq = colY('armor', [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  const va = colY('armor', [10, 11, 12, 13, 14, 15, 16, 17, 18, 19]);
  const dy = colY('dye', [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  const aligned = eq.length === va.length && va.length === dy.length
    && eq.every((y, i) => Math.abs(y - va[i]) < 2 && Math.abs(y - dy[i]) < 2);
  const miscPair = (() => {
    const rows = [];
    for (let k = 0; k <= 4; k++) {
      const m = dock.querySelector(`.sw-slot[data-idx="${k}"][data-where="misc"]`)?.getBoundingClientRect();
      const d = dock.querySelector(`.sw-slot[data-idx="${k}"][data-where="miscDye"]`)?.getBoundingClientRect();
      rows.push(m && d ? Math.abs(m.top - d.top) < 2 : 'missing');
    }
    return rows;
  })();
  return { skipped: window.__skipped, hidden, mismatch, eyes, consistency: {
      eq0_vs_misc0: same('armor[0]', 'misc[0]') ? '同图(池冲突)' : '异图(正确)',
      armor1_vs_misc1: same('armor[1]', 'misc[1]') ? '同图(池冲突)' : '异图(正确)' },
    colCounts: [eq.length, va.length, dy.length], aligned, miscPair,
    op: getComputedStyle(dock.querySelector('.sw-invgrid, .sw-slot'), '::after').opacity };
});
console.log(JSON.stringify(out, null, 1));
console.log('ERRS', JSON.stringify(errs.slice(0, 3)));
await page.screenshot({ path: 'shots/slot-audit.png' });
await browser.close();
