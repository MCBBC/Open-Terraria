// 浏览器侧不变量探针(自动检查四件套 A 的页面侧消费):
// window.__swGame 世界全图 auditWorld——error 违规按 FRAGMENTS 白名单核对,
// 新类型(未登记)= FAIL(与 tests/world-invariants.test.ts 集成组同语义)。
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
await page.goto(process.env.SW_ORIGIN ?? 'http://localhost:5199', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 2500));
await page.waitForSelector('select', { timeout: 120000 });
await page.evaluate(() => { const _s = document.querySelector('select'); _s.selectedIndex = 0; _s.parentElement.querySelector('button').click(); });
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.player, { timeout: 300000 });
await new Promise((r) => setTimeout(r, 1500));

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${extra ? '  ' + extra : ''}`); ok ? pass++ : fail++; };

const out = await page.evaluate(async () => {
  // 动态 import 浏览器侧 audit 模块(vite serve 下可 import)
  const { auditWorld } = await import('/src/world/audit/index.ts');
  const g = window.__swGame;
  const rep = auditWorld(g.world.store);
  const byType = new Map();
  for (const v of rep.violations) {
    if (v.severity !== 'error') continue;
    byType.set(v.typeKey, (byType.get(v.typeKey) ?? 0) + 1);
  }
  return {
    elapsedMs: rep.elapsedMs, scannedCells: rep.scannedCells,
    summary: rep.summary,
    byType: [...byType.entries()],
    sample: rep.violations.filter((v) => v.severity === 'error').slice(0, 5).map((v) => `${v.typeKey}@(${v.x},${v.y})`),
  };
});

console.log(JSON.stringify(out, null, 1));
const FRAGMENTS = new Set(['pot', 'v_26_altars', 'v_186_decos_3x2', 'v_187_decos_3x2_group_2',
  'v_529_sea_oats', 'v_105_statue', 'v_411_detonator', 'v_103_bowls', 'crystal_heart']);
const unknown = out.byType.filter(([k]) => !FRAGMENTS.has(k));
check('页面侧全图扫描完成', out.scannedCells > 4_000_000, `${(out.scannedCells / 1e6).toFixed(1)}M 格 ${out.elapsedMs}ms`);
check('无未登记残片类型', unknown.length === 0, unknown.map(([k, n]) => `${k}=${n}`).join(' '));
console.log(`\n${pass} pass / ${fail} fail`);
process.exit(fail ? 1 : 0);
