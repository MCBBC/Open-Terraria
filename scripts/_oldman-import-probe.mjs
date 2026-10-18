// wld 导入守卫老人/地牢守卫一致性探针(2026-09-01 用户实报):
//   不变式A: !downedBoss3 的 wld 导入 → 老人在地牢门口在场(可直接对话)
//   不变式B: downedBoss3 置位后 → 老人自灭(:5327)+地牢池不再出守卫(68)
import { REPO_ROOT, join } from './_pathlib.mjs';
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5208';
const WLD = process.env.SW_WLD ?? join(REPO_ROOT, 'tests/golden/wld/12345世界.wld');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 } });
const p = await b.newPage();
p.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 200)));
await p.goto(`${ORIGIN}/?nosw`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForFunction(() => typeof window.__swFlow === 'object', { timeout: 180000 });
const buf = fs.readFileSync(WLD);
const ok = await p.evaluate(async (bytes) => {
  try { await window.__swFlow.importWld(new Uint8Array(bytes)); return 'ok'; }
  catch (e) { return 'ERR:' + e; }
}, Array.from(buf));
console.log('importWld ->', ok);
await p.waitForFunction(() => !!window.__swGame?.player, { timeout: 300000 });
await sleep(2500);
await p.evaluate(() => {
  document.getElementById('sw-boot-prime')?.remove();
  document.getElementById('sw-splash')?.remove();
  const btn = [...document.querySelectorAll('button')].find((x) => (x.textContent || '').includes('我已知晓'));
  if (btn) btn.click();
});
await sleep(1000);

const out = await p.evaluate(() => {
  const g = window.__swGame;
  const om = g.entities.npcs.find((n) => n.npcKey === 'old_man' && !n.dead);
  return {
    w: g.world.w, dungeonX: g.world.dungeonX, dungeonY: g.world.dungeonY,
    downedSkeletron: g.world.flags.downedSkeletron ?? false,
    downed_35: g.world.flags['downed_35'] ?? false,
    npcKeys: g.entities.npcs.map((n) => n.npcKey),
    oldMan: om ? { x: Math.floor(om.cx / 16), y: Math.floor((om.y + om.h) / 16), home: om.home, dead: om.dead } : null,
    distToDungeon: om ? Math.abs(Math.floor(om.cx / 16) - g.world.dungeonX) : null,
  };
});
console.log('state:', JSON.stringify(out, null, 1));

// 不变式B: 手动置位 downed_35 → 跑 tick → 老人自灭
const b2 = await p.evaluate(() => {
  const g = window.__swGame;
  if (!g.entities.npcs.some((n) => n.npcKey === 'old_man' && !n.dead)) return 'skip-no-oldman';
  g.world.flags['downed_35'] = true;
  for (let i = 0; i < 90; i++) g.fixedUpdate(1 / 60);
  const alive = g.entities.npcs.some((n) => n.npcKey === 'old_man' && !n.dead);
  return alive ? 'FAIL-oldman-still-alive' : 'PASS-oldman-selfdestruct';
});
console.log('invariant B:', b2);
await b.close();
console.log('done');
