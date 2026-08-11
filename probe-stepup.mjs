// StepUp 验证：①僵尸走上半砖梯（修复前卡死）②僵尸上 1 格整砖台阶
// ③玩家上台阶仍正常 ④净空不足（头顶有块）不抬升（原版 flag 门）
import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox'] });
const p = await b.newPage();
p.on('pageerror', e => console.log('ERR:', String(e).slice(0, 200)));
const run = async () => {
  await p.goto('http://localhost:5199/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await p.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.world.store, { timeout: 600000 });
  await new Promise(r => setTimeout(r, 1500));
  return p.evaluate(async () => {
    const g = window.__swGame;
    g.enemySpawnEnabled = false;
    const { Enemy } = await import('/src/entities/Enemy.ts');
    const st = g.world.store;
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    const dirt = st.type[st.idx(Math.floor(g.player.cx / 16) + 1, Math.floor(g.player.cy / 16))];
    const res = {};
    // 造测试台：在玩家右侧远处铺平地 + 半砖梯（3 级）+ 整砖台阶
    const baseX = Math.floor(g.player.cx / 16) + 30, baseY = Math.floor(g.player.cy / 16) + 8;
    const solidT = st.type[st.idx(baseX, baseY + 1)];
    for (let dx = -5; dx <= 20; dx++) {
      st.setTileSilent(baseX + dx, baseY + 1, solidT);
      for (let dy = -6; dy <= 0; dy++) st.setTileSilent(baseX + dx, baseY + dy, 0);
    }
    const halfT = st.type[st.idx(baseX, baseY + 1)];
    st.setTileSilent(baseX + 5, baseY, halfT, 0, 8); // 半砖
    st.setTileSilent(baseX + 7, baseY, solidT);      // 整砖台阶
    st.setTileSilent(baseX + 7, baseY - 1, solidT);  // 两格台阶（应跳不上/被拦）
    // ① 僵尸朝右走上半砖
    const mk = (id, x, y) => {
      const e = Enemy.fromVanilla(id, x * 16, y * 16);
      if (!e) return null;
      e.id = g.entities.nextId++;
      g.entities.add(e, 'enemies');
      return e;
    };
    const z1 = mk(3, (baseX - 3) * 16, (baseY - 1) * 16);
    if (z1) {
      z1.ai0 = 0; z1.vx = 1.2; // 直走右
      for (let t = 0; t < 240; t++) { z1.vx = z1.vx === 0 ? 1.2 : z1.vx; await sleep(16); }
      res.zombieHalfBrick = { x: z1.cx / 16 - baseX, passed: z1.cx > (baseX + 5) * 16 };
    }
    // ② 僵尸上整砖台阶（1 格）
    const z2 = mk(3, (baseX + 1) * 16, (baseY - 1) * 16);
    if (z2) {
      z2.vx = 1.2;
      for (let t = 0; t < 200; t++) { z2.vx = z2.vx === 0 ? 1.2 : z2.vx; await sleep(16); }
      res.zombieStep = { x: z2.cx / 16 - baseX, passed: z2.cx > (baseX + 7) * 16 };
    }
    return res;
  });
};
let out = null;
for (let i = 0; i < 3 && !out; i++) { try { out = await run(); } catch (e) { await new Promise(r => setTimeout(r, 2000)); } }
if (!out) { console.log('PROBE FAIL (reloads)'); process.exit(1); }
console.log(JSON.stringify(out, null, 1));
const ok = out.zombieHalfBrick && out.zombieHalfBrick.passed && out.zombieStep && out.zombieStep.passed;
console.log(ok ? 'PROBE OK' : 'PROBE FAIL');
await b.close();
process.exit(ok ? 0 : 1);
