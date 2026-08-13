// 遗留四件套冒烟：小地图皮肤×9 / 派对帽+派对贴图条 / 天幕流星可见性
// 运行：SW_ORIGIN=http://localhost:5207 node tools/run-diag.mjs scripts/_leftover-smoke.mjs
import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox'], defaultViewport: { width: 1360, height: 860 } });
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.sw-title-menu', { timeout: 120000 });
await new Promise(r => setTimeout(r, 400));
await page.click('[data-act=sp]');
await page.waitForSelector('.sw-list-panel', { timeout: 10000 });
await new Promise(r => setTimeout(r, 800));
const hasChar = await page.evaluate(() => !!document.querySelector('.sw-item'));
if (!hasChar) {
  await page.click('.sw-list-footer [data-act=new]');
  await page.waitForSelector('.sw-char-panel', { timeout: 10000 });
  await new Promise(r => setTimeout(r, 500));
  await page.click('.sw-char-row input[type=text]');
  await page.keyboard.type('遗留');
  await new Promise(r => setTimeout(r, 200));
  await page.click('[data-act=create]');
  await page.waitForSelector('.sw-item', { timeout: 10000 });
  await new Promise(r => setTimeout(r, 600));
}
await page.click('.sw-item');
await page.waitForFunction(() => document.querySelector('.sw-list-title')?.textContent === '选择世界', { timeout: 10000 });
await new Promise(r => setTimeout(r, 700));
const hasWorld = await page.evaluate(() => !!document.querySelector('.sw-list-panel .sw-item'));
if (!hasWorld) {
  await page.click('.sw-list-footer [data-act=new]');
  await page.waitForSelector('.sw-wc-panel', { timeout: 10000 });
  await new Promise(r => setTimeout(r, 500));
  await page.click('[data-g=size] .sw-wc-opt');
  await new Promise(r => setTimeout(r, 200));
  await page.click('[data-act=create]');
}
await page.waitForFunction(() => { const g = window.__swGame; return g && g.player; }, { timeout: 180000 });
await new Promise(r => setTimeout(r, 2000));

const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const res = {};
  const load = (p) => new Promise((r2) => {
    const img = new Image();
    img.onload = () => r2(img.width); img.onerror = () => r2(0);
    img.src = p;
  });

  // ① 小地图皮肤：Options 默认 + 9 款注册 + 贴图全可加载 + 切换生效
  const { options } = await import('/src/core/Options.ts');
  const { Renderer } = await import('/src/render/Renderer.ts');
  res.optDefault = options.data.minimapFrame;
  res.skins = Object.keys(Renderer.MINIMAP_SKINS);
  res.skinTex = {};
  for (const s of res.skins) res.skinTex[s] = await load(`sprites/vanilla-ui/UI_Minimap_${s}_MinimapFrame.png`);
  await options.set('minimapFrame', 'Valkyrie');
  res.switched = options.data.minimapFrame;
  await new Promise((r2) => setTimeout(r2, 200));
  await options.set('minimapFrame', 'Default');

  // ② 派对：手动开派对 → Extra_72 + 变体条就绪 + scene.partyUp 翻转
  res.extra72 = await load('sprites/vanilla/Extra_72.png');
  res.alt17 = await load('sprites/vanilla/NPC_17_Alt_1.png');
  res.alt663 = await load('sprites/vanilla/NPC_663_Alt_1.png');
  res.alt682 = await load('sprites/vanilla/NPC_682_Alt_1.png');
  g.partyState.manualParty = true;
  await new Promise((r2) => setTimeout(r2, 300));
  res.partyUpScene = g.renderer.scene ? g.renderer.scene.partyUp : null;

  // ③ 天幕流星：夜间过 15000 线 + spawnMeteor → sky.meteor 存活
  const w = g.world;
  const { Clock } = await import('/src/world/World.ts');
  w.clock.timeOfDay = Clock.DUSK + 15100 / 32400 * (1 - (Clock.DUSK - Clock.DAWN));
  g.meteorPending = true;
  await new Promise((r2) => setTimeout(r2, 800));
  res.skyMeteor = !!g.renderer.sky.meteor;
  const m = g.renderer.sky.meteor;
  res.meteorDepth = m ? m.depth : null;
  res.meteorTexW = g.renderer.sky.meteorTex ? g.renderer.sky.meteorTex.width : 0;
  res.meteorTexComplete = g.renderer.sky.meteorTex ? g.renderer.sky.meteorTex.complete : false;
  res.meteorPos = m ? { x: m.x, y: m.y, t: m.t } : null;
  res.playerPos = { x: g.player.cx, y: g.player.cy };
  return res;
});

const fails = [];
const eq = (name, got, want) => { if (got !== want) fails.push(`${name}: 期望 ${want} 实得 ${got}`); };
eq('Options.minimapFrame 默认', out.optDefault, 'Default');
eq('皮肤注册数', out.skins.length, 9);
const badTex = Object.entries(out.skinTex).filter(([, v]) => !v).map(([k]) => k);
eq('9 款框贴图全部可加载', badTex.length, 0);
eq('皮肤切换持久化', out.switched, 'Valkyrie');
eq('Extra_72 派对帽表就位(800px)', out.extra72 >= 800, true);
eq('Merchant 变体条 17', out.alt17 > 0, true);
eq('Princess 变体条 663', out.alt663 > 0, true);
eq('SlimeRed 变体条 682', out.alt682 > 0, true);
eq('派对态进 SceneFlags', out.partyUpScene, true);
eq('夜 15000+ 触发天幕流星', out.skyMeteor, true);
eq('流星带 depth(3-6)', out.meteorDepth !== null && out.meteorDepth >= 3 && out.meteorDepth < 6, true);
if (errs.length) fails.push(...errs.slice(0, 5));

// 帧间差分证流星真实可见：流星 t=600 才过玩家头顶（出生=中心−v*600 屏外高处），
// 先等到 t≥350 进屏再截
await page.waitForFunction(() => {
  const m = window.__swGame?.renderer?.sky?.meteor;
  return m && m.t >= 350;
}, { timeout: 20000 });
await page.evaluate(() => {
  const m = window.__swGame.renderer.sky.meteor;
  m.x = window.__swGame.player.cx;
  m.y = window.__swGame.player.cy - 300;
  m.t = 200;   // 避开尾段淡出
});
const shot = () => page.screenshot({ type: 'png', clip: { x: 300, y: 40, width: 760, height: 340 } });
const b1 = await shot();
await new Promise(r => setTimeout(r, 400));
const b2 = await shot();
const { PNG } = await import('/node_modules/pngjs/browser.js').catch(() => ({ PNG: null }));
void PNG;
const diff = await page.evaluate((a1, a2) => {
  // 简化：用 canvas 解码对比
  const dec = (b64) => new Promise((res) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = img.width; c.height = img.height;
      const cx = c.getContext('2d');
      cx.drawImage(img, 0, 0);
      res(cx.getImageData(0, 0, c.width, c.height).data);
    };
    img.src = 'data:image/png;base64,' + b64;
  });
  return (async () => {
    const d1 = await dec(a1), d2 = await dec(a2);
    let n = 0;
    for (let i = 0; i < d1.length; i += 4) {
      if (Math.abs(d1[i] - d2[i]) + Math.abs(d1[i + 1] - d2[i + 1]) + Math.abs(d1[i + 2] - d2[i + 2]) > 40) n++;
    }
    return n;
  })();
}, Buffer.from(b1).toString('base64'), Buffer.from(b2).toString('base64'));
out.meteorPixelsMoved = diff;
eq('流星帧间可见(天空区差分像素>200)', diff > 200, true);
await page.screenshot({ path: '/tmp/leftover-smoke.png' });
console.log(JSON.stringify({ out: { ...out, skins: out.skins.length, skinTex: Object.values(out.skinTex).map(Boolean) }, fails }, null, 2));
await browser.close();
process.exit(fails.length ? 1 : 0);
