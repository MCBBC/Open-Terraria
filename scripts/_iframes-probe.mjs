// 一次性：玩家受击无敌帧实机复测。流程=真实创建流进世界 → 出生点旁刷僵尸 →
// 每 100ms 采样 (hp, iframes) 持续 3s → 断言：两次掉血间隔 ≥ ~30t（0.5s）且
// 掉血窗口内 iframes>0（受击即 40t 起步）。
import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5201';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', defaultViewport: { width: 1200, height: 800 }, protocolTimeout: 600000,
});
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e).slice(0, 160)));
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => typeof window.__swFlow === 'object' && !!window.__swFlow?.createWorldProbe, { timeout: 180000 });
await page.evaluate(() => window.__swFlow.createWorldProbe());
await page.waitForFunction(() => !!globalThis.__swGame?.world?.store?.w, { timeout: 240000 });
// 刷两只僵尸到玩家脚下两侧（近距保证接触）
await page.evaluate(() => {
  const g = globalThis.__swGame;
  const p = g.player;
  g.spawnVanillaEnemy?.(3, Math.floor(p.x / 16) + 2, Math.floor(p.y / 16));
  g.spawnVanillaEnemy?.(3, Math.floor(p.x / 16) - 2, Math.floor(p.y / 16));
});
// 确定性直测：三连击门/写/递减全链（第一击进→iframes=40；第二击立即被吞返回 0；
// 700ms(≈42t) 后第三击再进）。随后再做真实接触采样（僵尸贴脸）。
const direct = await page.evaluate(() => new Promise((resolve) => {
  const p = globalThis.__swGame.player;
  const r = {};
  r.hp0 = p.hp;
  r.first = p.damage(10, p.x + 8, p.y + 8, true);
  r.ifrAfterFirst = p.iframes;
  r.second = p.damage(10, p.x + 8, p.y + 8, true);
  r.ifrAfterSecond = p.iframes;
  setTimeout(() => {
    r.third = p.damage(10, p.x + 8, p.y + 8, true);
    r.ifrAfterThird = p.iframes;
    r.hpEnd = p.hp;
    resolve(r);
  }, 700);
}));
// 真实接触采样（僵尸贴脸重刷）
await page.evaluate(() => {
  const g = globalThis.__swGame;
  const p = g.player;
  g.spawnVanillaEnemy?.(3, Math.floor(p.x / 16), Math.floor(p.y / 16) - 1);
});
const samples = await page.evaluate(() => new Promise((resolve) => {
  const g = globalThis.__swGame;
  const out = [];
  let n = 0;
  const iv = setInterval(() => {
    const p = g.player;
    out.push({ t: n, hp: p.hp, ifr: p.iframes });
    if (++n >= 30) { clearInterval(iv); resolve(out); }
  }, 100);
}));
const hits = [];
let lastHp = samples[0].hp;
for (const s of samples) {
  if (s.hp < lastHp) hits.push({ t: s.t, drop: lastHp - s.hp, ifr: s.ifr });
  lastHp = Math.min(lastHp, s.hp);
}
const gaps = [];
for (let i = 1; i < hits.length; i++) gaps.push((hits[i].t - hits[i - 1].t) * 100);
const minGapMs = gaps.length ? Math.min(...gaps) : -1;
const zeroIfrOnHit = hits.filter((h) => h.ifr <= 0).length;
console.log(JSON.stringify({
  direct,
  samples: samples.length,
  hpStart: samples[0].hp, hpEnd: samples[samples.length - 1].hp,
  hitCount: hits.length, hits, minGapMs, zeroIfrOnHit,
  ifrTimelineHead: samples.slice(0, 10).map((s) => s.ifr),
  errs: errs.slice(0, 4),
}));
process.exit(0);
