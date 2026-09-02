// 飞龙链段修复实机验证（2026-09-02）：直生 87 头 + 生产同款 14 段链，
// 采样各段 vanillaId/间距/visAngle，并在飞行稳定后截图。
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MACOS/Google Chrome'.replace('MACOS', 'MacOS');
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`${ORIGIN}/?play=small&beh=${Date.now()}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
let inGame = false;
for (let i = 0; i < 90 && !inGame; i++) {
  inGame = await page.evaluate(() => !!(window.__swGame && window.__swGame.renderer)).catch(() => false);
  if (!inGame) await new Promise((r) => setTimeout(r, 2000));
}
if (!inGame) { console.error('未进游戏', errors.slice(0, 3)); process.exit(1); }
await new Promise((r) => setTimeout(r, 1500));

const spawned = await page.evaluate(async () => {
  const g = window.__swGame;
  const { Enemy } = await import('/src/entities/Enemy.ts');
  g.entities.enemies.length = 0;                    // 清场
  g.player.statLife = g.player.statLifeMax2 ?? g.player.maxHp;   // 叠满血防撞死冻结
  const SEGS = [89, 88, 89, 89, 89, 89, 89, 89, 88, 89, 89, 90, 91, 92]; // NPC.cs:51700-51724
  // 生成在玩家右侧高空 → 龙向右俯冲(验证向右不翻),也避免开局即贴脸
  const head = Enemy.fromVanilla(87, g.player.cx - 620, g.player.cy - 260);
  head.id = g.entities.nextId++;
  g.entities.enemies.push(head);
  const segs = Enemy.spawnWormChain(head, SEGS.length, SEGS, true);
  for (const s of segs) { s.id = g.entities.nextId++; g.entities.enemies.push(s); }
  return { head: head.vanillaId, segs: segs.map((s) => s.vanillaId), shared: segs.every((s) => s.realLifeHost === head) };
});
console.log('生成:', JSON.stringify(spawned));
if (spawned.segs.join(',') !== '89,88,89,89,89,89,89,89,88,89,89,90,91,92') {
  console.error('段表不符!'); process.exit(1);
}
// 飞行 4 秒让链展开(龙从左侧向玩家俯冲=向右飞)
await new Promise((r) => setTimeout(r, 4000));
// 关掉欢迎弹窗（若有）
await page.evaluate(() => {
  for (const b of document.querySelectorAll('button')) {
    if ((b.textContent || '').includes('我已知晓')) { b.click(); break; }
  }
});
const state = await page.evaluate(() => {
  const g = window.__swGame;
  const chain = g.entities.enemies
    .filter((e) => !e.dead && e.vanillaId != null && e.vanillaId >= 87 && e.vanillaId <= 92)
    .map((e) => ({ id: e.vanillaId, x: Math.round(e.cx), y: Math.round(e.cy),
      ang: +((e.visAngle ?? 0) * 180 / Math.PI).toFixed(1), alive: !e.dead }));
  return { n: chain.length, chain, hp: g.entities.enemies.filter((e) => e.vanillaId === 87).map((e) => e.hp)[0] };
});
console.log('链态:', JSON.stringify(state));
await page.screenshot({ path: '/Users/vinlic/.claude/jobs/4a66e745/tmp/wyvern-after.png' });
console.log('errors:', JSON.stringify(errors.slice(0, 5)));
await browser.close();
