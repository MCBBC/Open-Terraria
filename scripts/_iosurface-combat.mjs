// 战斗态 IOSurface 复测(2026-08-19 TintAtlas 落地后):刷染色史莱姆群,
// 量 tintAtlas 页数/条目 vs 旧 tintCache(上限 1024 张 canvas)。
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', userDataDir: '/Users/vinlic/.claude/jobs/8405c930/tmp/combat-profile',
  args: ['--no-first-run'], defaultViewport: { width: 1512, height: 862 },
});
const page = await browser.newPage();
page.setDefaultTimeout(300000);
await page.goto((process.env.SW_ORIGIN || 'http://localhost:5201') + '/debug-line.html', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 2500));
await page.evaluate(() => import('/src/data/items.ts').catch(() => {})).catch(() => {});
await new Promise((r) => setTimeout(r, 1000));
await page.waitForFunction(() => !!window.__swFlow, { timeout: 60000 });
await page.evaluate(async () => {
  const res = await fetch('/debug-save.sbw.json');
  await window.__swFlow.loadJson(await res.text());
});
await page.waitForFunction(() => !!window.__swGame, { timeout: 120000 });
await page.evaluate(() => {
  const g = window.__swGame;
  g.player.x = 386 * 16; g.player.y = 254 * 16;
  g.player.debugGod = true;
  const c = g.world.clock; if (c) c.timeOfDay = 0.4; // 白天,光照染色链全开
  // 刷 12 只史莱姆(多色:染色 pass + glow 轨道)
  const kinds = ['slime_green', 'slime_blue', 'slime_purple', 'slime_yellow', 'lava_slime', 'slime_red'];
  for (let i = 0; i < 12; i++) {
    g.spawnEnemy(kinds[i % kinds.length], (380 + i) * 16, 252 * 16);
  }
});
// 即时检查(3s)+ 滚动 40s
await new Promise((r) => setTimeout(r, 3000));
const early = await page.evaluate(() => ({ enemies: window.__swGame.entities.enemies.length,
  keys: window.__swGame.entities.enemies.slice(0, 3).map((e) => e.key) }));
console.log('[3s]', JSON.stringify(early));
await new Promise((r) => setTimeout(r, 40000));
// 直接驱动两族 API(运行时私有可调):模拟 40 个染色变体 + LRU
const drive = await page.evaluate(async () => {
  const g = window.__swGame, r = g.renderer;
  let tex = null;
  const at = r.atlas ?? g.atlas;
  for (let k = 0; k < 6 && !tex; k++) {
    tex = at?.ensureVImage?.('vanilla/NPC_1.png') ?? null;
    if (!tex) await new Promise((res) => setTimeout(res, 1000));
  }
  const src = { img: tex, sx: 0, sy: 0, sw: 42, sh: 56 };
  if (!src.img) return { err: 'no img' };
  let ok = 0, nulls = 0;
  for (let i = 0; i < 40; i++) {
    const t = r.tintedSprite(`probe${i % 7}`, { ...src, sx: (i % 7) * 42 }, [(i * 13) % 256, 40, 90]);
    if (t) ok++; else nulls++;
  }
  const l = r.lerpSprite('probeL', src, [200, 30, 30], 0.5);
  const again = r.tintedSprite('probe0', { ...src, sx: 0 }, [0, 40, 90]);
  return { ok, nulls, lerp: !!l, entries: r.tintAtlas.size, pages: r.tintAtlas.pageCount };
});
console.log('[atlas 驱动]', JSON.stringify(drive));
const inv = await page.evaluate(() => {
  const g = window.__swGame, r = g.renderer;
  const ta = r.tintAtlas;
  const chunks = g.chunks;
  const dom = [...document.querySelectorAll('canvas')].map((c) => `${c.width}x${c.height}`);
  return {
    enemies: g.entities.enemies.length,
    tintAtlas: ta ? { entries: ta.size, pages: ta.pageCount } : null,
    chunkPages: chunks?.wallPages?.length ?? -1,
    glfxTexs: r.glfx?.texs?.size ?? -1,
    glfxMB: +((r.glfx?.bytes ?? 0) / 1048576).toFixed(1),
    domCanvases: dom.length, domList: dom,
    cloudGLAlive: !!r.sky?.cloudGL,
  };
}).catch((e) => ({ err: String(e).slice(0, 200) }));
console.log(JSON.stringify(inv, null, 1));
await browser.close();
