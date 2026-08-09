// 掉落表验证：vanilla 怪死亡 → def.drops 来自提取表 → spawnDrop 产生掉落物
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto('http://localhost:5199', { waitUntil: 'networkidle0' });
await page.evaluate(() => { const _s = document.querySelector('select'); _s.selectedIndex = 0; _s.parentElement.querySelector('button').click(); });
await page.waitForFunction(() => window.__swGame && window.__swGame.world, { timeout: 300000 });
await new Promise((r) => setTimeout(r, 1200));

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${extra ? '  ' + extra : ''}`); ok ? pass++ : fail++; };

const out = await page.evaluate(() => {
  const g = window.__swGame;
  window.__swSetPool?.([1]); // 蓝史莱姆：凝胶 100%
  const drops = [];
  for (const id of [1, 3, 21]) {
    const before = g.entities.drops.length;
    // 直接构造怪并杀死（绕过生成等待）
    const e = g.entities.enemies.find((x) => x.vanillaId === id);
    if (e) { e.hurt(99999, 0, 0, g); continue; }
  }
  // 手动造：用生成池触发后杀
  for (let i = 0; i < 2500; i++) g.fixedUpdate(1 / 60);
  const targets = g.entities.enemies.filter((x) => x.vanillaId != null && !x.dead);
  for (const e of targets) {
    const def = { drops: e.def.drops.map((d) => ({ item: d.item, chance: d.chance })) };
    drops.push({ id: e.vanillaId, def });
    e.hurt(99999, 0, 0, g);
  }
  return { count: targets.length, drops, after: g.entities.drops.length };
});
console.log(JSON.stringify(out).slice(0, 500));
check('vanilla 怪挂原版掉落表', out.drops.length > 0 && out.drops.some((d) => d.def.drops.length > 0),
  `${out.count} 只怪，掉落物 ${out.after} 个`);
const slime = out.drops.find((d) => d.id === 1);
check('史莱姆带凝胶掉落', !!slime && slime.def.drops.some((d) => d.item.includes('gel') || d.chance >= 1),
  slime ? JSON.stringify(slime.def.drops) : '无史莱姆');

console.log(`\n${pass} passed, ${fail} failed`);
if (errors.length) console.log('页面异常:', errors.slice(0, 3));
await browser.close();
process.exit(fail ? 1 : 0);
