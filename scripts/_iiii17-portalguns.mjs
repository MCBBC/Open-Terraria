// IIIII17 探针②：portalGunInChests（"we don't even test for that"）——全管线生成 +
// 传送门枪在位率统计。
// 用法:SW_ORIGIN=http://localhost:5208 node tools/run-diag.mjs scripts/_iiii17-portalguns.mjs
// 断言依据 = vanilla 源码静态期望（x86 无本域 rig）：
//   DoPortalGunInChests（WorldGen.cs:3004-3026）: 前 8000 箱逐箱掷 Next(7)==0 →
//   item[1] 有货（stack>0）才继续 → 槽 j∈[1,maxItems) 首个空堆叠槽 SetDefaults(3384)。
//   ⇒ 枪永不落槽 0;stack=1;仅 ~1/7 的「第二槽有货」箱中枪。
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
await page.goto('' + (process.env.SW_ORIGIN ?? 'http://localhost:5199'), { waitUntil: 'networkidle0' });
const out = await page.evaluate(async () => {
  // ★懒 memo 门（HellFortPass.hfIs1457）：必须在 import WorldGen 之前置位。
  self.process = { env: { SW_MB_1457: '1' } };
  const items = await import('/src/data/items.ts');
  const gunKey = items.VANILLA_ITEM_KEY_BY_ID[3384];
  const gunId = gunKey ? (items.ITEM_BY_KEY[gunKey] ?? -1) : -1;
  const mod = await import('/src/world/gen/WorldGen.ts');
  const run = async (seed) => {
    const w = await mod.generateWorld({ width: 4200, height: 1200, seedText: seed, name: 'probe' });
    let stocked = 0, carriers = 0;
    const slots = new Map();      // 槽位 → 枪数
    const badStack = [], slot0 = [], nonContiguous = [];
    for (const c of w.chests) {
      const secondOk = !!(c.items[1] && c.items[1].stack > 0);
      if (secondOk) stocked++;
      for (let j = 0; j < c.items.length; j++) {
        const it = c.items[j];
        if (it && it.id === gunId && it.stack > 0) {
          carriers++;
          slots.set(j, (slots.get(j) ?? 0) + 1);
          if (j === 0) slot0.push([c.x, c.y]);
          if (it.stack !== 1) badStack.push([c.x, c.y, it.stack]);
          // 插入契约=首个空堆叠槽（槽≥1,j=数组尾追加情形合法）——判据=[1..j)
          // 区间不得残留空洞（插入前全非空且插枪不清他人）;末格之上由 maxItems 帽兜
          for (let q = 1; q < j; q++) {
            if (!c.items[q] || c.items[q].stack === 0) { nonContiguous.push([c.x, c.y, j, q]); break; }
          }
        }
      }
    }
    return { seed, gunId, chests: w.chests.length, stocked, carriers,
      slotHist: [...slots.entries()].sort((a, b) => a[0] - b[0]),
      slot0: slot0.length, badStack: badStack.length, nonContiguous };
  };
  const gun = await run('wedonteventestforthat');
  const ctrl = await run('sw-gun-ctl17');
  return { gun, ctrl };
});
const fail = (cond, msg) => { if (!cond) errs.push('ASSERT: ' + msg); };
fail(out.gun.gunId > 0, `Portal Gun(vid3384) 未注册内部 id=${out.gun.gunId}`);
fail(out.gun.chests > 100, `秘种世界箱数异常 ${out.gun.chests}`);
fail(out.gun.carriers > 0, `传送门枪零在位(${out.gun.carriers})`);
fail(out.gun.slot0 === 0, `出现槽 0 枪×${out.gun.slot0}(原版 j 从 1 起)`);
fail(out.gun.badStack === 0, `枪 stack≠1 ×${out.gun.badStack}`);
fail(out.gun.nonContiguous.length === 0, `非首空槽插枪 ${JSON.stringify(out.gun.nonContiguous.slice(0, 5))}`);
// 渗透率 p = 中枪箱 / 第二槽有货箱 ≈ 1/7（确定性骰面下允许抽样涨落 ±宽界）
const p = out.gun.stocked ? out.gun.carriers / out.gun.stocked : 0;
fail(p > 0.07 && p < 0.23, `渗透率 p=${p.toFixed(3)} 越出 [0.07,0.23](期望≈1/7≈0.143)`);
fail(out.ctrl.carriers === 0, `普通对照世界出现传送门枪 ×${out.ctrl.carriers}（应为零扰动）`);
console.log(JSON.stringify({
  portalSeed: out.gun, penetration: +(out.gun.stocked ? out.gun.carriers / out.gun.stocked : 0).toFixed(4),
  controlSeed: { chests: out.ctrl.chests, stocked: out.ctrl.stocked, carriers: out.ctrl.carriers },
}, null, 1));
console.log('PAGE_ERRORS:', errs.length ? errs : 'none');
await browser.close();
process.exit(errs.length ? 1 : 0);
