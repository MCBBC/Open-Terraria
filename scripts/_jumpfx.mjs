// 多段跳特效探针：装备沙暴瓶 857 → 跳起二段跳 → 断言尘池 124 号粒子出现。
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true,
  args: ['--no-sandbox'],
  defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5201') + '/?play=small', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => { const g = window.__swGame; return g && g.player; }, { timeout: 110000 });
await new Promise(r => setTimeout(r, 1800));
const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const p = g.player;
  const st = g.world.store;
  // 平地
  const bx = Math.floor(p.x / 16), by = Math.floor(p.y / 16) + 6;
  for (let dx = -30; dx <= 30; dx++) for (let dy = -12; dy <= 2; dy++) st.setTile(bx + dx, by + dy, dy === 2 ? 1 : 0);
  await new Promise(r => setTimeout(r, 300));
  // 装备沙暴瓶 857（v_857）
  const items = await import('/src/data/items.ts');
  const key857 = items.VANILLA_ITEM_KEY_BY_ID[857];
  if (!key857) return { fail: '857 key missing' };
  const id857 = items.ITEM_BY_KEY[key857];
  p.inv.armor[p.inv.armor.length - 1] = { id: id857, stack: 1 };   // 配饰末槽
  await new Promise(r => setTimeout(r, 500));                       // equipStats 刷新
  p.x = bx * 16 + 8; p.y = (by + 2) * 16 - p.h; p.vx = 0; p.vy = 0; p.onGround = false; p.fallStartY = null;
  await new Promise(r => setTimeout(r, 300));
  // 尘池类型快照函数
  const dustTypes = () => {
    const d = gameDust();
    return d;
  };
  const gameDust = () => {
    const pool = g.vanillaDust ?? null;
    void pool;
    // VanillaDust 挂在 Game？查实例
    for (const k of Object.keys(g)) {
      const v = g[k];
      if (v && typeof v === 'object' && 'pool' in v && 'spawn' in v) return v.pool.filter(c => c.active).map(c => c.type);
    }
    return null;
  };
  // 一段跳（按住跳落地跳起）→ 空中松开再按 = 二段跳（沙暴）
  g.input.touchKeys.add('Space');
  await new Promise(r => setTimeout(r, 900));   // 起跳+平台段
  g.input.touchKeys.delete('Space');
  await new Promise(r => setTimeout(r, 250));   // 松键
  g.input.touchKeys.add('Space');               // 二段跳（沙暴）
  await new Promise(r => setTimeout(r, 120));   // 起跳帧特效
  const midJump = { performing: p.performingJump, jumpHold: p.jumpHold };
  const types1 = dustTypes();
  await new Promise(r => setTimeout(r, 350));   // 上升尾迹若干帧
  const types2 = dustTypes();
  g.input.touchKeys.delete('Space');
  return {
    key857, midJump,
    dustAtTrigger: types1, dustLater: types2,
    sand124: (types2 ?? []).filter(t => t === 124).length,
    jumpOpts: p.equipStats.jumpOpts,
  };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
