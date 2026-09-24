// BJ319 探针 v8（headed,实 GPU）：用户原始序列复现——
// P0 基线 → 杀 161 → 立测 → 15s 后再测(自恢复?) → 重进 → 再测(恢复?):
// fps/Commit/实体桶全记录。杀怪现场=玩家脚下,不掉落瞬间被吸走(把玩家移开 40 格)。
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5201';

const browser = await puppeteer.launch({ executablePath: CHROME, headless: false, defaultViewport: { width: 1280, height: 800 }, args: ['--hide-scrollbars'] });
const page = await browser.newPage();
page.on('dialog', (d) => { void d.accept(); });
const cdp0 = await page.createCDPSession();
async function refocus() {
  await cdp0.send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});
  await page.bringToFront().catch(() => {});
}
async function enterWorld() {
  await refocus();
  await page.goto(ORIGIN, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await new Promise((r) => setTimeout(r, 3000));
  await page.waitForSelector('select', { timeout: 60000 }).catch(() => {});
  await page.evaluate(() => { const _s = document.querySelector('select'); if (_s) { _s.selectedIndex = 0; _s.parentElement.querySelector('button').click(); } });
  await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.liquid, { timeout: 300000 });
  await refocus();
  await new Promise((r) => setTimeout(r, 3000));
  await page.waitForFunction(() => window.__swGame && window.__swGame.paused === false, { timeout: 30000 }).catch(() => {});
}
async function traceCommit(secs = 3) {
  const cdp = await page.createCDPSession();
  const evs = [];
  cdp.on('Tracing.dataCollected', (e) => { if (Array.isArray(e.value)) evs.push(...e.value); else if (e.value) evs.push(e.value); });
  const done = new Promise((res) => cdp.once('Tracing.tracingComplete', res));
  await cdp.send('Tracing.start', { categories: 'devtools.timeline,disabled-by-default-devtools.timeline,disabled-by-default-devtools.timeline.frame' });
  await new Promise((r) => setTimeout(r, secs * 1000));
  await cdp.send('Tracing.end');
  await done;
  try { await cdp.detach(); } catch { /* ignore */ }
  const bmf = new Map(); const commit = new Map();
  for (const ev of evs) {
    if (ev.name === 'BeginMainThreadFrame') bmf.set(ev.tid, (bmf.get(ev.tid) ?? 0) + 1);
    else if (ev.name === 'Commit' && typeof ev.dur === 'number') {
      const a = commit.get(ev.tid) ?? [0, 0]; a[0] += ev.dur / 1000; a[1]++; commit.set(ev.tid, a);
    }
  }
  let mt = -1, best = 0;
  for (const [tid, n] of bmf) if (n > best) { best = n; mt = tid; }
  const [cSum, cN] = commit.get(mt) ?? [0, 0];
  return { fps: +(best / secs).toFixed(1), commitMsPerF: cN ? +(cSum / cN).toFixed(2) : -1 };
}
async function counters(label) {
  const cdp = await page.createCDPSession();
  await cdp.send('Performance.enable');
  const { metrics } = await cdp.send('Performance.getMetrics');
  try { await cdp.send('Performance.disable'); } catch { /* ignore */ }
  try { await cdp.detach(); } catch { /* ignore */ }
  const g = (n) => metrics.find((x) => x.name === n)?.value ?? -1;
  const b = await page.evaluate(() => {
    const em = window.__swGame?.entities;
    const out = {};
    for (const k of ['enemies', 'drops', 'npcs']) out[k] = Array.isArray(em?.[k]) ? em[k].length : -1;
    return out;
  }).catch(() => ({}));
  console.log(`  [${label}] lis=${Math.round(g('JSEventListeners'))} heap=${(g('JSHeapUsedSize') / 1e6).toFixed(0)}MB buckets=${JSON.stringify(b)}`);
}
async function phase(label) {
  await refocus();
  const tr = await traceCommit(3);
  await counters(label);
  console.log(`${label.padEnd(26)} fps=${String(tr.fps).padStart(6)} Commit=${String(tr.commitMsPerF).padStart(5)}ms/f`);
}
async function spawnKill(n, away) {
  await page.evaluate((n, away) => {
    const g = window.__swGame;
    const p = g.player;
    g.player.maxHp = 1e6; g.player.hp = 1e6;
    const ids = [201, 202, 203, 254, 144];
    const bx = p.x + away * 16, by = p.y; // away=0:原地;away>0:旁侧空地
    let ok = 0;
    for (let i = 0; i < n; i++) {
      const e = g.spawnEnemy('v_' + ids[i % ids.length], bx + ((i % 20) - 10) * 40, by - 48 - Math.floor(i / 20) * 40);
      if (e) ok++;
    }
    window.__swSpawned = ok;
  }, n, away);
  await new Promise((r) => setTimeout(r, 1000));
  return page.evaluate(() => {
    const g = window.__swGame;
    let k = 0;
    for (const e of g.entities.enemies) {
      if (e && e.hp > 0) { try { e.hurt(1e9, 0, 0, g, 0, false, 1, true); k++; } catch { /* ignore */ } }
    }
    return k;
  });
}

await enterWorld();
await phase('P0 baseline');
// 战斗现场:原地杀 161(玩家 1e6 HP 不死)
const k1 = await spawnKill(161, 0);
console.log(`  killed=${k1} (现场 drops/gore/尘 留场)`);
await phase('P1 just after kill');
await new Promise((r) => setTimeout(r, 15000));
await phase('P1b 15s later (settle?)');
// 重进
await page.evaluate(() => window.__swFlow.quitToMenu());
await page.waitForFunction(() => !window.__swGame, { timeout: 120000 });
await new Promise((r) => setTimeout(r, 1200));
await page.waitForSelector('select', { timeout: 60000 });
await page.evaluate(() => { const _s = document.querySelector('select'); if (_s) { _s.selectedIndex = 0; _s.parentElement.querySelector('button').click(); } });
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.liquid, { timeout: 300000 });
await new Promise((r) => setTimeout(r, 3000));
await page.waitForFunction(() => window.__swGame && window.__swGame.paused === false, { timeout: 30000 }).catch(() => {});
await phase('P2 after reenter');
await browser.close();
