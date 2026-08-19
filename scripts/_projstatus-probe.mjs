// 弹药命中 debuff E2E 探针:火矢 33% OnFire / 毒镖陷阱 Poison / 表驱动链路
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 300_000 });
const page = await browser.newPage();
await page.goto(process.env.SW_ORIGIN ?? 'http://localhost:5199', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 2500));
await page.waitForSelector('select', { timeout: 120000 });
await page.evaluate(() => { const _s = document.querySelector('select'); _s.selectedIndex = 0; _s.parentElement.querySelector('button').click(); });
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.player, { timeout: 300000 });
const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const mod = await import('/src/entities/projStatus.ts');
  // ① 表驱动直测:火矢 2 掷骰(压 Math.random=0 全中)
  const real = Math.random;
  Math.random = () => 0;
  let fired = false;
  try {
    const target = { onFireT: 0 };
    for (let k = 0; k < 3; k++) mod.applyProjStatus(2, target);
    fired = target.onFireT > 0;   // 33% ×3 全中(random=0)→ 必染
  } finally { Math.random = real; }
  // ② 毒镖 98 表内掷中
  Math.random = () => 0;
  let poisoned = false;
  try {
    const t2 = { poisonT: 0 };
    mod.applyProjStatus(98, t2);
    poisoned = t2.poisonT >= 10;   // 600t = 10s
  } finally { Math.random = real; }
  // ③ 实体链:发一支 projId=2 的 Arrow 直击敌怪 → onFireT 上升
  const st = g.world.store;
  const px = Math.floor(g.player.cx / 16) + 14;
  let gy = Math.floor(g.player.cy / 16);
  while (gy < st.h - 4 && !st.isSolid(px, gy)) gy++;
  g.debugSpawnNpc(3, 1, false);
  for (let t = 0; t < 3; t++) g.fixedUpdate(1 / 60);
  const enemy = g.entities.enemies.find((n) => !n.dead && n.vanillaId === 3);
  let chainWorked = false;
  if (enemy) {
    const { Arrow } = await import('/src/entities/Arrow.ts');
    const a = new Arrow(enemy.cx - 24, enemy.cy, 4, 0, 5, 1, 2, null, {});
    g.entities.add(a, 'projectiles');
    Math.random = () => 0;
    try { for (let t = 0; t < 40; t++) g.fixedUpdate(1 / 60); }
    finally { Math.random = real; }
    chainWorked = (enemy.onFireT ?? 0) > 0;
  }
  return { fired, poisoned, chainWorked, enemyFound: !!enemy };
});
console.log(JSON.stringify(out, null, 1));
let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${extra ? '  ' + extra : ''}`); ok ? pass++ : fail++; };
check('火矢 2 表驱动:命中掷骰染 OnFire', out.fired);
check('毒镖 98:掷中染 Poison ≥10s(600t)', out.poisoned);
check('实体链:Arrow(projId=2) 直击敌怪 → OnFire 生效', out.chainWorked);
console.log(`\n${pass} pass / ${fail} fail`);
process.exit(fail ? 1 : 0);
