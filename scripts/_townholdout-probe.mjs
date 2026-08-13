// 持械视觉探针（一次性）：向导自卫攻击态应手持木弓（DrawNPCExtras Main.cs:27121-27195）。
// 断言：① 攻击态 attackState===12 可达 ② holdoutAim ∈[-0.5,0.5] ③ 攻击态截图
//       ④ 灭档：态尽后 holdoutAim 归零。截图落 /tmp 供人工核。
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`${process.env.SW_ORIGIN ?? 'http://localhost:5199'}/?play=small`, { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.waitForFunction(() => window.__swGame?.player && window.__swGame.world, { timeout: 300000 });
await new Promise((r) => setTimeout(r, 2000));

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${extra ? '  ' + extra : ''}`); ok ? pass++ : fail++; };

const setup = await page.evaluate(() => {
  const g = window.__swGame;
  // 清场后定点生成:向导 + 僵尸(玩家旁平地)
  g.debugClearEnemies();
  for (const n of [...g.entities.npcs]) if (!n.dead) n.hp = 0, n.dead = true; // 清旧城镇
  const px = Math.floor(g.player.cx / 16), py = Math.floor(g.player.cy / 16);
  // 找脚下实心行
  let gy = py; while (gy < 200 && !g.world.store.flags[g.world.store.idx(px, gy)]) gy++;
  return { ok: true, px, gy };
});
check('场地就绪', setup.ok);

await page.evaluate((s) => {
  window.__swGame.debugSpawnNpc(22, 1, false);   // 向导(玩家位)
  window.__swGame.debugSpawnNpc(3, 1, false);    // 僵尸(玩家位)
}, setup);

// 等攻击态（最长 40s）;命中瞬间【同步】完成像素断言 + 整帧抓取（态窗仅 0.5s,异步会错过）
const state = await page.evaluate(() => new Promise((resolve) => {
  const t0 = performance.now();
  const iv = setInterval(() => {
    const g = window.__swGame;
    const guide = g.entities.npcs.find(n => !n.dead && n.npcKey === 'guide');
    if (guide && guide.attackState === 12) {
      clearInterval(iv);
      // ---- 命中即采：像素断言 + toDataURL ----
      const r = g.renderer;
      let px = { err: 'no run' };
      try {
        const icon = r.atlas.vicon(39);
        if (!icon) px = { err: 'no icon' };
        else {
          const tc = document.createElement('canvas');
          tc.width = icon.sw; tc.height = icon.sh;
          const tctx = tc.getContext('2d');
          tctx.drawImage(icon.img, icon.sx, icon.sy, icon.sw, icon.sh, 0, 0, icon.sw, icon.sh);
          const idata = tctx.getImageData(0, 0, icon.sw, icon.sh).data;
          const pal = new Set();
          for (let i = 0; i < idata.length; i += 4) {
            if (idata[i + 3] < 200) continue;
            pal.add(((idata[i] >> 4) << 8) | ((idata[i + 1] >> 4) << 4) | (idata[i + 2] >> 4));
          }
          const sd = guide.facing;
          const ax = guide.cx - (sd === 1 ? -14 : 14), ay = guide.y + guide.h - 26;
          const ext = sd === 1 ? 46 : -46;
          const [sx0, sy0] = g.camera.worldToScreen(Math.min(ax, ax + ext) - 10, ay - 36);
          const [sx1, sy1] = g.camera.worldToScreen(Math.max(ax, ax + ext) + 10, ay + 12);
          const gc = r.canvas.getContext('2d');
          const bx = Math.max(0, Math.floor(sx0)), by = Math.max(0, Math.floor(sy0));
          const bw = Math.max(1, Math.min(r.canvas.width - bx, Math.ceil(sx1 - sx0)));
          const bh = Math.max(1, Math.min(r.canvas.height - by, Math.ceil(sy1 - sy0)));
          const gdata = gc.getImageData(bx, by, bw, bh).data;
          let hits = 0;
          for (let i = 0; i < gdata.length; i += 4) {
            if (gdata[i + 3] < 200) continue;
            if (pal.has(((gdata[i] >> 4) << 8) | ((gdata[i + 1] >> 4) << 4) | (gdata[i + 2] >> 4))) hits++;
          }
          px = { hits, box: `${bw}x${bh}`, palSize: pal.size };
        }
      } catch (e) { px = { err: String(e) }; }
      resolve({
        hit: true, aim: guide.holdoutAim, x: guide.cx, y: guide.cy,
        ms: Math.round(performance.now() - t0), px, shot: r.canvas.toDataURL('image/png'),
      });
    } else if (performance.now() - t0 > 40000) {
      clearInterval(iv);
      resolve({ hit: false, st: guide?.attackState ?? -1, ms: Math.round(performance.now() - t0) });
    }
  }, 100);
}));
check('① 向导进入弓攻击态(attackState==12)', state.hit === true, JSON.stringify({ ...state, shot: state.shot ? '<png>' : undefined }));
if (state.hit) {
  check('② 瞄准值域 [-0.5,0.5]', state.aim >= -0.5 && state.aim <= 0.5, `aim=${state.aim.toFixed(3)}`);
  if (state.shot) {
    const { writeFileSync } = await import('node:fs');
    writeFileSync('/tmp/townholdout.png', Buffer.from(state.shot.split(',')[1], 'base64'));
    check('③ 攻击态整帧落盘(/tmp/townholdout.png)', true);
  }
  check('④ 手部区域木弓同色像素(≥30)', !state.px.err && state.px.hits >= 30, JSON.stringify(state.px));
  // 等态尽 → aim 归零
  const after = await page.evaluate(() => new Promise((resolve) => {
    const t0 = performance.now();
    const iv = setInterval(() => {
      const g = window.__swGame;
      const guide = g.entities.npcs.find(n => !n.dead && n.npcKey === 'guide');
      if (!guide) { clearInterval(iv); resolve({ gone: true }); return; }
      if (guide.attackState === 0) { clearInterval(iv); resolve({ gone: false, aim: guide.holdoutAim }); }
      else if (performance.now() - t0 > 15000) { clearInterval(iv); resolve({ gone: false, aim: guide.holdoutAim, timeout: true }); }
    }, 100);
  }));
  check('⑤ 态尽 ai[2] 归零', !after.gone && after.aim === 0 && !after.timeout, JSON.stringify(after));
}
check('无页面错误', errors.length === 0, errors.join(' | ').slice(0, 200));
console.log(`\n${pass} PASS / ${fail} FAIL`);
await browser.close();
process.exit(fail ? 1 : 0);
