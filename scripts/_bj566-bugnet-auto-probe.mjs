// BJ566 一次性探针:虫网按住自动挥舞（vanilla 1457 定谳:autoReuse=true）
//  权威锚:Item.cs case 1991 :21306-21316（useStyle1/useTime25/useAnimation25/autoReuse=true）
//        case 3183 :29542-29552（金网 18t/autoReuse=true/rare4）case 4821 :39481-39491
//        （木网 21t/autoReuse=true/rare3）; Muramasa case 155 :3228-3242 正控。
//  判据:按住左键 180t → 挥击上升沿 ≥3（autoReuse 连挥）;松开逐击 → 点击沿亦可。
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small&bj566probe=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 60000 });
let inGame = false;
for (let i = 0; i < 90 && !inGame; i++) {
  inGame = await page.evaluate(() => !!(window.__swGame && window.__swGame.renderer)).catch(() => false);
  if (!inGame) await new Promise((r) => setTimeout(r, 2000));
}
if (!inGame) { console.error('未进游戏', errors.slice(0, 3)); process.exit(1); }
await new Promise((r) => setTimeout(r, 1200));

const van = await page.evaluate(async () => {
  const r = await fetch('sprites/vanilla.json');
  const j = await r.json();
  return j.items ?? {};
});
const keyFor = (vid) => {
  for (const [idStr, m] of Object.entries(van)) {
    if (Number(idStr) === vid) return 'vi_' + vid + '_' + m.key.replace(/[^A-Za-z0-9]/g, '');
  }
  return null;
};

const equip = async (vid) => page.evaluate((key) => {
  const g = window.__swGame;
  const id = window.__swItems?.[key];
  if (id === undefined) return false;
  g.player.inv.slots[g.player.inv.selected] = { id, stack: 1 };
  g.cb.onInventoryChanged?.();
  return true;
}, keyFor(vid));

await page.evaluate(() => {
  window.__countSwings = (ticks, mouseFn) => {
    const g = window.__swGame;
    g.swing = null; g.player.useTime = 0;
    let swings = 0, last = null, samples = [];
    for (let i = 0; i < ticks; i++) {
      if (mouseFn) mouseFn(i);
      g.fixedUpdate(1 / 60);
      if (g.swing && g.swing !== last) { swings++; last = g.swing; }
      if (!g.swing) last = null;
      if (i % 30 === 0) samples.push(g.swing ? g.swing.t : 0);
    }
    g.input.mouseDown = false; g.input.mouseHeld = false;
    return { swings, samples };
  };
});

const A = [];
const ok = (n, c, x) => A.push({ name: n, pass: !!c, ...x });

// 三网 + Muramasa 正控 + 铜短剑负控
for (const [vid, name, expect] of [[1991, 'bugnet', '>=3'], [3183, 'golden-bugnet', '>=3'], [4821, 'fireproof-bugnet', '>=3'], [155, 'muramasa-control', '>=3'], [3507, 'copper-shortsword-neg', '<=2']]) {
  const ek = await equip(vid);
  if (!ek) { ok(`equip-${name}`, false, { vid }); continue; }
  const r = await page.evaluate(() => {
    const g = window.__swGame;
    g.input.mouseX = g.player.cx + 300; g.input.mouseY = g.player.cy;
    g.input.mouseDown = true; g.input.mouseHeld = true;   // 浏览器 mousedown 双旗同置（Input.ts:241）
    return window.__countSwings(180);
  });
  ok(`${name}(vid ${vid}) held 180t swings ${expect}`, expect === '>=3' ? r.swings >= 3 : r.swings <= 2, { vid, ...r });
}

const failed = A.filter((a) => !a.pass);
console.log(JSON.stringify({ asserts: A, failed: failed.length, errors: errors.slice(0, 3) }, null, 1));
await browser.close();
process.exit(failed.length ? 1 : 0);
