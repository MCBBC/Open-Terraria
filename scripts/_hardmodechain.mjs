// 肉后机制终验：V 带即时生成（珍珠岩/腐化岩计数）+ 演化快进（蔓延增长）+ 水晶碎块。
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true,
  args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5201') + '/?play=small', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => { const g = window.__swGame; return g && g.player; }, { timeout: 110000 });
await new Promise(r => setTimeout(r, 1500));
const out = await page.evaluate(async () => {
  const g = window.__swGame, st = g.world.store;
  const TILE_DEFS = (await import('/src/data/tiles.ts')).TILE_DEFS;
  const countSheets = (targets) => {
    const cnt = Object.fromEntries(targets.map(t => [t, 0]));
    for (let i = 0; i < st.type.length; i++) {
      if (!st.flags[i]) continue;
      const s = TILE_DEFS[st.type[i]]?.vanilla?.sheet ?? -1;
      if (s in cnt) cnt[s]++;
    }
    return cnt;
  };
  const T = { 珍珠石: 117, 珍珠沙: 116, 神圣草: 109, 腐化岩: 25, 腐化沙: 112, 猩红岩: 203, 水晶碎块: 129, 叶绿: 211 };
  const before = countSheets(Object.values(T));
  // 真娃娃入岩浆 → 杀
  let lx = -1, ly = -1;
  outer: for (let y = st.h - 30; y > st.h - 120; y--) {
    for (let x = Math.floor(st.w / 2) - 100; x < Math.floor(st.w / 2) + 100; x++) {
      const i = st.idx(x, y);
      if (!st.flags[i] && st.liquid[i] > 0) { lx = x; ly = y; break outer; }
    }
  }
  if (lx < 0) return { error: 'no lava' };
  const { ItemDrop } = await import('/src/entities/ItemDrop.ts');
  const dollKey = Object.keys(window.__swItems).find(k => /^vi_267_/.test(k) && !k.startsWith('vi_2670'));
  g.entities.add(new ItemDrop(lx * 16 + 8, ly * 16 + 8, window.__swItems[dollKey], 1), 'drops');
  await new Promise(r => setTimeout(r, 2500));
  const wof = g.entities.enemies.find(e => !e.dead && e.vanillaId === 113);
  if (!wof) return { error: 'no wof' };
  wof.hurt(9999999, 10, 0, g);
  await new Promise(r => setTimeout(r, 600));
  const after = countSheets(Object.values(T));
  // 演化快进：直调 evolution.update() ×3000（每次内部择批格子）
  const evo = g.evolution;
  const t0 = performance.now();
  for (let k = 0; k < 3000; k++) evo.update();
  const ms = Math.round(performance.now() - t0);
  const spread = countSheets(Object.values(T));
  const ren = {};
  for (const [name, sheet] of Object.entries(T)) {
    ren[name] = { 前: before[sheet], 后: after[sheet], 蔓延后: spread[sheet] };
  }
  return {
    hardMode: !!g.world.flags.hardMode,
    crimson: !!g.world.crimson,
    counts: ren,
    evoMs: ms,
  };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
