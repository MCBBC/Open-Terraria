// SW-RB10e 验证探针：668 帧矩形外扩几何 + 自发光层出实体层 + 红雾环 α 无 Opacity
//  ① 体绘源矩形 = 220×242（旧内缩 214×236 即红）
//  ② lai3>0 时实体层 drawImage 不再含红雾/雾层（→ compositeLight 后 drawDeerclopsGlow）
//  ③ drawDeerclopsGlow 实调且 α=(128/255)(1-(30/36)²/2)≈0.3275（无 ×Opacity）
//  ④ 页面零 pageerror
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5205';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`${ORIGIN}/?play=small&rb10e=${Date.now()}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
let inGame = false;
for (let i = 0; i < 90 && !inGame; i++) {
  inGame = await page.evaluate(() => !!(window.__swGame && window.__swGame.renderer)).catch(() => false);
  if (!inGame) await new Promise((r) => setTimeout(r, 2000));
}
if (!inGame) { console.error('未进游戏', errors.slice(0, 3)); process.exit(1); }
await new Promise((r) => setTimeout(r, 1500));
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find((x) => (x.textContent ?? '').includes('我已知晓'));
  b?.click();
});

// 召唤 668（复用 BJ51 探针通道）
const ok = await page.evaluate(() => {
  const g = window.__swGame;
  g.debugClearEnemies?.();
  g.summonPanel?.close();
  g.toggleSummonPanel();
  const q = document.querySelector('[data-role=q]');
  q.value = '668';
  q.dispatchEvent(new Event('input', { bubbles: true }));
  const row = document.querySelector('[data-role=list] > div');
  if (!row) return false;
  row.click();
  g.summonPanel?.close();
  return true;
});
if (!ok) { console.error('召唤失败'); process.exit(1); }
// ★预载 668/Extra_245（ensureVImage 首调异步返回 null——不预载则体绘整段空转）
await page.evaluate(async () => {
  const a = window.__swGame.renderer.atlas;
  await a.ensureVImage('vanilla/NPC_668.png');
  await a.ensureVImage('vanilla/Extra_245.png');
});
await new Promise((r) => setTimeout(r, 800));
// 拉到远距注入 lai3=30（红雾态）
await page.evaluate(() => {
  const g = window.__swGame;
  const e = [...g.entities.enemies].find((n) => n.vanillaId === 668);
  if (!e) throw new Error('no 668');
  g.player.x = e.x - 600; g.player.y = e.y + e.h - 60; g.player.vx = 0; g.player.vy = 0;
  e.lai3 = 30; e.ai0 = 0; e.ai1 = 0;
  const p = g.player; p.dead = false; p.hp = p.maxHp ?? 500; p.iframes = 600;
});

// ①+②：一帧世界层 drawImage 源矩形指纹
const trace1 = await page.evaluate(async () => {
  const g = window.__swGame;
  const e = [...g.entities.enemies].find((n) => n.vanillaId === 668);
  g.player.x = e.x - 420; g.player.vx = 0;   // 屏内（AI 每拍重推 lai3,这里持续钉 30）
  const rec = { world: [], glow: [] };
  const r = g.renderer;
  const origGlow = r.drawDeerclopsGlow.bind(r);
  let cap = null;
  r.drawDeerclopsGlow = function (en) { cap = rec.glow; try { return origGlow(en); } finally { cap = null; } };
  const proto = CanvasRenderingContext2D.prototype;
  const orig = proto.drawImage;
  proto.drawImage = function (src, ...rest) {
    // glow 窗口内记 glow,其余全记 world（体绘指纹在世界层窗口找）
    (cap ?? rec.world).push({ sw: rest[2], sh: rest[3], a: Math.round((this.globalAlpha ?? 1) * 1000) / 1000 });
    return orig.call(this, src, ...rest);
  };
  await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
  proto.drawImage = orig;
  r.drawDeerclopsGlow = origGlow;
  return rec;
});

// ③：纯 glow 调用一次（含 red+fog 4 层 drawImage）
const glowOnce = await page.evaluate(async () => {
  const g = window.__swGame;
  const e = [...g.entities.enemies].find((n) => n.vanillaId === 668);
  e.lai3 = 30; e.ai0 = 0;
  const out = [];
  const r = g.renderer;
  const proto = CanvasRenderingContext2D.prototype;
  const orig = proto.drawImage;
  proto.drawImage = function (src, ...rest) { out.push({ sw: rest[2], sh: rest[3], a: Math.round((this.globalAlpha ?? 1) * 1000) / 1000 }); return orig.call(this, src, ...rest); };
  r.drawDeerclopsGlow(e);
  proto.drawImage = orig;
  return out;
});

const summary = {
  worldBodyCell0: trace1.world.find((d) => d.sw === 220 && d.sh === 242) ?? null,
  worldOldInset: trace1.world.some((d) => d.sw === 214 && d.sh === 236),
  worldRedOrFogLeak: trace1.world.some((d) => Math.abs(d.a - 0.328) < 0.02 && d.sw === 220),
  glowCalls: glowOnce.length,
  glowAlphas: [...new Set(glowOnce.map((d) => d.a))],
  pageErrors: errors.slice(0, 5),
};
console.log(JSON.stringify(summary, null, 1));
const h = await page.evaluateHandle(() => window.__swGame.renderer.canvas);
await h.asElement().screenshot({ path: '/tmp/rb10e-668-far.png' });
await browser.close();
// 红雾环 α 金标（lai3=30 注入拍）：(128/255)(1-(30/36)²/2)≈0.3278;雾 (66/255)×0.25≈0.0647
const redOk = summary.glowAlphas.some((a) => Math.abs(a - 0.3278) < 0.01);
const fogOk = summary.glowAlphas.some((a) => Math.abs(a - 0.0647) < 0.01);
const pass = !!summary.worldBodyCell0 && !summary.worldOldInset && !summary.worldRedOrFogLeak
  && summary.glowCalls === 4 && redOk && fogOk
  && summary.pageErrors.length === 0;
console.log(pass ? 'RB10E-VERIFY PASS' : 'RB10E-VERIFY FAIL');
process.exit(pass ? 0 : 1);
