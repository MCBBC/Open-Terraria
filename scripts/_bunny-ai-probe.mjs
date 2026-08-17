// 兔子 AI 端到端探针（2026-08-17）——手动 fixedUpdate 步进（不依赖页面时钟）:
//   1. critters 桶全 Enemy 化（零遗留 Critter 类实例）
//   2. spawner 友好链产出存在（向导在镇 → townNPCs≥1 门开）
//   3. 行走族平地采样:无自发跳脉冲 + 巡航速度未被摩擦压制
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
await page.goto(process.env.SW_ORIGIN ?? 'http://localhost:5199', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 2500));
await page.waitForSelector('select', { timeout: 120000 });
await page.evaluate(() => { const _s = document.querySelector('select'); _s.selectedIndex = 0; _s.parentElement.querySelector('button').click(); });
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.player, { timeout: 300000 });
const out = await page.evaluate(() => {
  const g = window.__swGame;
  // 3600 tick = 60s 游戏时（spawner 友好轮在 fixedUpdate 内滚动）
  for (let i = 0; i < 3600; i++) g.fixedUpdate(1 / 60);
  const crits = g.entities.critters;
  return {
    tick: g.tickCount,
    total: crits.length,
    entries: crits.map((c) => ({
      vid: c.vanillaId ?? c.def?.npc ?? null,
      legacy: 'hopCd' in c,
      dead: c.dead,
    })),
  };
});
console.log(JSON.stringify({ tick: out.tick, total: out.total, vids: out.entries.filter((e) => !e.dead).map((e) => e.vid) }, null, 1));
let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${extra ? '  ' + extra : ''}`); ok ? pass++ : fail++; };
check('critters 桶全 Enemy 化（零遗留 Critter 实例）', out.entries.every((e) => !e.legacy), `total=${out.total}`);
check('spawner 友好链产出小动物（≥1 只存活）', out.entries.some((e) => !e.dead), '');
if (out.entries.some((e) => !e.dead)) {
  const vy = await page.evaluate(() => {
    const g = window.__swGame;
    const WALKERS = new Set([46, 148, 149, 230, 299, 300, 361, 362, 443, 445, 447, 538, 539, 540, 602, 607, 608, 610, 687]);
    const targets = g.entities.critters.filter((c) => !c.dead && WALKERS.has(c.vanillaId ?? -1));
    const samples = targets.map(() => ({ minVy: 0, maxVx: 0 }));
    for (let f = 0; f < 240; f++) {
      targets.forEach((c, i) => {
        if (c.vy < samples[i].minVy) samples[i].minVy = c.vy;
        if (Math.abs(c.vx) > samples[i].maxVx) samples[i].maxVx = Math.abs(c.vx);
      });
      g.fixedUpdate(1 / 60);
    }
    return { n: targets.length, vids: targets.map((c) => c.vanillaId), samples };
  });
  if (vy.n > 0) {
    check('行走族 240 帧无自发跳脉冲（minVy ≥ -2.5）', vy.samples.every((s) => s.minVy >= -2.5),
      vy.samples.map((s, i) => `#${vy.vids[i]}:minVy=${s.minVy.toFixed(1)},maxVx=${s.maxVx.toFixed(2)}`).join(' | '));
    check('行走族巡航速度 ≥0.5px/t', vy.samples.some((s) => s.maxVx >= 0.5),
      vy.samples.map((s) => s.maxVx.toFixed(2)).join(','));
  } else {
    console.log('SKIP: 采样窗内无行走族（多为飞行/水生种,重跑可复验）');
  }
}
console.log(`\n${pass} pass / ${fail} fail`);
process.exit(fail ? 1 : 0);
