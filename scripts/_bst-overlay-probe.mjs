// 一次性:图鉴叠层+筛选 DOM 探针（2026-09-03 三项清偿①）
//   A. 详情头像装饰叠层像素级：僵尸 3 = MapBG1 暗染底图铺满 + 月亮叠层亮斑（>240 亮度）
//      vs 网格档（无叠层）；丛林 pref 命中 NPC 52（NightTime×2+Jungle pref）→ 叠层整批不画
//   B. 偏好命中短路 + 筛选格 58 钮 / 激活筛选过滤 / 可用性灰显 / 计数文案
// SW_ORIGIN=http://localhost:5210 node tools/run-diag.mjs scripts/_bst-overlay-probe.mjs
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
await page.bringToFront();
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5210') + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
let inGame = false;
for (let i = 0; i < 150 && !inGame; i++) {
  inGame = await page.evaluate(() => !!(window.__swGame && window.__swGame.renderer)).catch(() => false);
  if (!inGame) await new Promise((r) => setTimeout(r, 2000));
}
if (!inGame) { console.error('未进游戏'); process.exit(1); }
const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const BP = await import('/src/ui/BestiaryPanel.ts');
  const { BestiaryPanel, bestiaryRows } = BP;
  const { bestiaryGating } = await import('/src/data/Bestiary.ts');
  bestiaryGating.unlockAll = true;
  const probe = {
    bg3: BP.bestiaryPortraitBackground(3, false),
    grid3: BP.bestiaryGridBackground(3, false),
    ov3: BP.bestiaryPortraitOverlays(3),
    ov541: BP.bestiaryPortraitOverlays(541),
    pref52: BP.bestiaryPortraitPrefHit(52, false),
  };
  // 页面实际收到的模块文本（过 SW 后）——post-fix 变换里 imageSmoothingEnabled
  // 后紧跟 clearRect 的出现次数应只剩 1（paintWithBg）；pre-fix 为 2（paint 也清）
  probe.served = await (await fetch('/src/ui/BestiaryPanel.ts')).text()
    .then((t) => ({
      clearAfterSmooth: (t.match(/imageSmoothingEnabled = false;\s*cx\.clearRect/g) ?? []).length,
      hasOvFallback: t.includes('ovFallback'),
    }));
  const panel = new BestiaryPanel(document.body, {
    getTracker: () => g.world.bestiary,
    atlas: g.renderer?.atlas ?? null,
    isCrimson: () => false,
    onBack: () => {},
  });
  await new Promise((r) => setTimeout(r, 800));

  // ---- A. 像素级：直接驱 panel 内部 drawPortrait（TS private 仅编译期）----
  const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  const stats = (c) => {
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let lit = 0, bright = 0, corner = d[3], total = (c.width * c.height);
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] > 10) lit++;
      const lum = Math.max(d[i], d[i + 1], d[i + 2]);
      if (d[i + 3] > 200 && lum > 240) bright++;
    }
    return { lit, litPct: +(lit / total * 100).toFixed(1), bright, cornerA: corner };
  };
  const draw = (npcId, mode) => new Promise(async (res) => {
    const c = mk(96, 96);
    c.style.cssText = 'position:fixed;left:-999px;top:-999px;';
    document.body.appendChild(c);   // drawPortrait 的 isConnected 守卫要求挂载
    panel.drawPortrait(c, npcId, mode, true);
    let last = stats(c);
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 100));
      last = stats(c);
      if (last.lit > 0 && i > 6) break;
    }
    c.remove();
    res(last);
  });
  const zombieP = await draw(3, 'portrait');
  const zombieG = await draw(3, 'grid');
  const jungleP = await draw(52, 'portrait');   // pref 命中 → 无叠层
  const sandP = await draw(541, 'portrait');    // 沙暴叠层（白）MapBGOverlay1

  // ---- B. 筛选格 ----
  const rows = bestiaryRows(g.world.bestiary);
  document.querySelector('[data-filter]').click();
  await new Promise((r) => setTimeout(r, 200));
  const grid = document.querySelector('.sw-bst-fgrid');
  const btns = grid ? [...grid.querySelectorAll('.sw-bst-fcell')] : [];
  const dimBtns = btns.filter((b) => b.classList.contains('dim')).length;
  const activeBtns = btns.filter((b) => b.classList.contains('active')).length;
  const titles = btns.slice(0, 3).map((b) => b.title);
  // 点第 2 钮（Biomes.Surface）→ 网格剩地表条目
  btns[1].click();
  await new Promise((r) => setTimeout(r, 400));
  const afterSurface = {
    cells: document.querySelectorAll('.sw-bst-cell').length,
    active: document.querySelectorAll('.sw-bst-fcell.active').length,
  };
  // 关弹层 → 计数文案
  document.body.click();
  await new Promise((r) => setTimeout(r, 200));
  const ftext = document.querySelector('[data-filtertext]')?.textContent;
  const gridGone = !document.querySelector('.sw-bst-fgrid');
  // 再开，点 rare（第 1 钮）→ rare 条目
  document.querySelector('[data-filter]').click();
  await new Promise((r) => setTimeout(r, 200));
  const g2 = document.querySelector('.sw-bst-fgrid');
  const rareBtn = g2.querySelectorAll('.sw-bst-fcell')[0];
  const rareTitle = rareBtn.title;
  rareBtn.click();
  await new Promise((r) => setTimeout(r, 400));
  const afterRare = { cells: document.querySelectorAll('.sw-bst-cell').length, title: rareTitle };
  panel.close();
  bestiaryGating.unlockAll = false;
  return {
    probe,
    A: { zombieP, zombieG, jungleP, sandP,
      overlayAddsBright: zombieP.bright > zombieG.bright,
      bgPresent: zombieP.cornerA > 200 },
    B: { total: btns.length, dimBtns, active0: activeBtns, titles,
      afterSurface, ftext, gridGone, afterRare, rows: rows.length },
  };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
