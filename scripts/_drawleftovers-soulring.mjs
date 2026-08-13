// drawWitherSoulRing 直调冒烟：确认 Extra_89 资产懒加载完成后 16 份环真的落笔
// （参数非空 + drawImage 计数 ≥16），并验证 drawTownNPC 的 Glow 档帧切片不炸。
// 用法：SW_ORIGIN=http://localhost:5201 node tools/run-diag.mjs scripts/_drawleftovers-soulring.mjs
import puppeteer from 'puppeteer-core';

const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const b = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', args: ['--no-sandbox'],
});
const page = await b.newPage();
const errors = [];
page.on('pageerror', (e) => {
  const s = String(e && e.stack ? e.stack : e);
  if (!s.includes('prefetchInvProjectiles')) errors.push(s.slice(0, 400)); // 已知基线噪音
});
await page.goto(ORIGIN + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => window.__swGame && window.__swGame.liquid, { timeout: 600000 });
await new Promise((r) => setTimeout(r, 2500));

const res = await page.evaluate(async () => {
  const g = window.__swGame;
  const out = {};
  const { Enemy } = await import('/src/entities/Enemy.ts');
  const { TownNPC } = await import('/src/entities/TownNPC.ts');
  const { Renderer } = await import('/src/render/Renderer.ts');
  const dd2 = await import('/src/entities/bossAI_dd2.ts');
  const p = g.player;
  const px = Math.floor(p.cx / 16), py = Math.floor(p.cy / 16);
  let floorY = py;
  for (let y = py; y < py + 30; y++) if (g.world.store.isSolid(px, y)) { floorY = y; break; }
  const gx = (px + 6) * 16 + 8, gy = (floorY - 1) * 16 - 40;

  // 资产预热：跑足帧让 atlas 懒加载 Extra_89 / Glow_352 / Extra_72
  const beast = Enemy.fromVanilla(568, gx, gy);
  if (beast) g.entities.add(beast, 'enemies');
  for (const k of ['truffle', 'cyborg']) {
    const n = new TownNPC(k, (px - 10) * 16, (floorY - 1) * 16);
    if (k === 'truffle') n.shimmered = true; else n.shimmered = true;
    g.entities.add(n, 'npcs');
  }
  await new Promise((r) => setTimeout(r, 4000));
  out.extra89 = !!g.renderer.atlas.ensureVImage('vanilla/Extra_89.png');
  out.extra89Loaded = (() => {
    const im = g.renderer.atlas.ensureVImage('vanilla/Extra_89.png');
    return !!(im && im.complete && im.naturalWidth);
  })();
  out.glow352 = (() => {
    const im = g.renderer.atlas.ensureVImage('vanilla/Glow_352.png');
    return !!(im && im.complete && im.naturalWidth);
  })();

  // 环参数（真实 localAI）
  if (beast) {
    const [lai0] = dd2.witherBeastLocal(beast);
    out.lai0 = lai0;
    const prm = Renderer.npcSoulRingParams(lai0);
    out.ringParams = prm ? { count: prm.count, radius: Math.round(prm.radius), alpha: +prm.alpha.toFixed(4) } : null;
    // 直调：包一层 drawImage 计数（世界 ctx 上的原语）
    const r = g.renderer;
    const orig = r.ctx.drawImage.bind(r.ctx);
    let n = 0;
    r.ctx.drawImage = (...a) => { n++; return orig(...a); };
    try {
      r.drawWitherSoulRing(beast);
      out.ringDrawCalls = n;
      out.ringThrew = false;
    } catch (e) {
      out.ringThrew = String(e).slice(0, 200);
    } finally {
      r.ctx.drawImage = orig;
    }
  }

  // Glow 档直调（shimmered 松露人 + 电子人）
  try {
    for (const n of g.entities.npcs) g.renderer.drawTownNPC(n, g.world);
    out.townGlowThrew = false;
  } catch (e) {
    out.townGlowThrew = String(e).slice(0, 200);
  }
  return out;
});
console.log(JSON.stringify(res, null, 2));
console.log('ERRORS(' + errors.length + '):');
for (const e of errors.slice(0, 6)) console.log('  ' + e);
await b.close();
process.exit(errors.length ? 1 : 0);
