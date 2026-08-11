// 召唤物验证：①爆炸烈焰魔杖(3818→p663 哨兵)召唤后不是色块 ②史莱姆法杖(1309→p266 随从)多帧动画
import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox'] });
const p = await b.newPage();
await p.setViewport({ width: 1000, height: 700 });
p.on('pageerror', e => console.log('ERR:', String(e).slice(0, 200)));
await p.goto('http://localhost:5199/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.world.store, { timeout: 600000 });
await new Promise(r => setTimeout(r, 2500));
const out = await p.evaluate(async () => {
  const g = window.__swGame;
  const { MinionProj } = await import('/src/entities/MinionProj.ts');
  const { projFrameCount, projFrameImg } = await import('/src/entities/Arrow.ts');
  const res = {};
  // 贴图可加载性（headless 无需游戏进程，直接探测 Image）
  const check = (id) => new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ id, w: img.naturalWidth, h: img.naturalHeight, frames: projFrameCount(id), fh: +(img.naturalHeight / projFrameCount(id)).toFixed(1) });
    img.onerror = () => resolve({ id, err: '404' });
    img.src = `sprites/vanilla/Projectile_${id}.png`;
  });
  res.tex = await Promise.all([check(663), check(266), check(191), check(373), check(946)]);
  // 哨兵实体化：爆炸烈焰魔杖 p663
  const s = new MinionProj(g.player.cx + 60, g.player.cy - 30, 663, 20, 2, true, 0, false, () => g.player);
  s.id = g.entities.nextId++;
  g.entities.add(s, 'projectiles');
  // 随从 p266（多帧）
  const m = new MinionProj(g.player.cx - 60, g.player.cy - 30, 266, 20, 2, false, 0, false, () => g.player);
  m.id = g.entities.nextId++;
  g.entities.add(m, 'projectiles');
  await new Promise(r => setTimeout(r, 600));
  // 直接验证 draw 不抛异常且帧裁切可产出
  try {
    const c663 = projFrameImg(663, 0);
    const c266 = projFrameImg(266, 3);
    res.frame = { s663: c663 ? c663.width + 'x' + c663.height : null, m266: c266 ? c266.width + 'x' + c266.height : null };
  } catch (e) { res.frame = { err: String(e).slice(0, 100) }; }
  return res;
});
console.log(JSON.stringify(out, null, 1));
if (out.tex?.every(t => !t.err) && out.frame?.s663) console.log('TEX OK');
await p.screenshot({ path: '/tmp/minion-shot.png', clip: { x: 330, y: 240, width: 420, height: 220 } });
await b.close();
