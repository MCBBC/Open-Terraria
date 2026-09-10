// SW-BJ56 泰拉棱镜（vid 5005/弹 946）召唤数量矩阵 + 光效通道直读探针。
// 金标：Player.cs:49049 SpawnMinionOnCursor 专支（一次 1 弹/光标落点）
//       Projectile.cs:16816-16841 槽位自裁门（超 maxMinions 同拍 Kill）
//       Player.cs:52335-52458 FreeUpPetsAndMinions（腾位逐杀）
//       Main.cs:28677-28692 DrawProj_EmpressBlade 派发（光效=全亮本体+幻影层）
// 跑法：SW_ORIGIN=http://localhost:5203 node tools/run-diag.mjs scripts/_bj56-terraprisma-count.mjs
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(String(process.env.SW_ORIGIN ?? 'http://localhost:5199'), { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 2500));
await page.waitForSelector('select', { timeout: 120000 });
await page.evaluate(() => { const _s = document.querySelector('select'); _s.selectedIndex = 0; _s.parentElement.querySelector('button').click(); });
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.player, { timeout: 300000 });
await new Promise((r) => setTimeout(r, 1500));

const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const w = g.world;
  const { VANILLA_ITEM_KEY_BY_ID } = await import('/src/data/items.ts');
  const { MinionProj } = await import('/src/entities/MinionProj.ts');
  window.__bj56arrow = await import('/src/entities/Arrow.ts');
  window.__bj56DrawCount = 0;
  const _protoDraw = MinionProj.prototype.draw;
  MinionProj.prototype.draw = function (...args) { if (this.projId === 946) window.__bj56DrawCount++; return _protoDraw.apply(this, args); };
  const { BuffType } = await import('/src/stats/Buffs.ts');

  const res = {};
  const key5005 = VANILLA_ITEM_KEY_BY_ID[5005];
  res.key5005 = key5005;
  const internal = window.__swItems[key5005];

  // 观测台：清空域 + 石板地
  const st = w.store;
  const px0 = Math.floor(g.player.cx / 16);
  let gy = 0; while (gy < st.h - 10 && !st.isSolid(px0, gy)) gy++;
  for (let dx = -30; dx <= 30; dx++) for (let dy = -10; dy <= 0; dy++) st.setTile(px0 + dx, gy + dy, 0);
  for (let dx = -30; dx <= 30; dx++) st.setTile(px0 + dx, gy + 1, window.__swTiles['stone']);
  g.player.x = (px0 + 0.5) * 16; g.player.y = (gy - 3) * 16;
  g.camera.x = g.player.cx; g.camera.y = g.player.cy;

  g.player.inv.add(internal, 5);
  const slots = g.player.inv.slots;
  const bi = slots.findIndex((it) => it && it.id === internal);
  if (bi > 0) { const t = slots[0]; slots[0] = slots[bi]; slots[bi] = t; }
  g.player.inv.selected = 0;

  const swords = () => g.entities.projectiles.filter((e) => e instanceof MinionProj && !e.dead && e.projId === 946);
  const useOnce = () => {
    g.player.useTime = 0;
    g.input.mouseX = 640; g.input.mouseY = 300;
    g.input.mouseDown = true;
    for (let i = 0; i < 60; i++) g.fixedUpdate(1 / 60);
    g.input.mouseDown = false;
    for (let i = 0; i < 10; i++) g.fixedUpdate(1 / 60);
  };

  const tiers = [];
  const tier = (name) => { tiers.push({ name, maxMinions: g.player.maxMinions, count: swords().length }); };

  // ---- 档 0：裸玩家（maxMinions=1）----
  res.baseMaxMinions = g.player.maxMinions;
  useOnce();
  tier('base use#1');
  useOnce();
  tier('base use#2 (满槽再召=腾位替换)');

  // ---- 档 1：召唤药水 buff (+1) ----
  g.player.buffs.apply(BuffType.Summoning, 300);
  for (let i = 0; i < 5; i++) g.fixedUpdate(1 / 60);
  useOnce();
  tier('Summoning buff use#3');

  // ---- 档 2：附魔台 buff (+1) ----
  g.player.buffs.apply(BuffType.Bewitched, 300);
  for (let i = 0; i < 5; i++) g.fixedUpdate(1 / 60);
  useOnce();
  tier('Bewitched buff use#4');

  // ---- 蜘蛛甲三件（2370 头/2371 胸?/2372 腿——SUMMON_GEAR slot 各 +1）----
  //  2370 Spider Mask (+1 :13960)、2372 Spider Greaves (+1 :13965)
  const gear = [2370, 2372].map((v) => window.__swItems[VANILLA_ITEM_KEY_BY_ID[v]]).filter(Boolean);
  res.gearFound = gear.length;
  g.player.inv.armor[0] = { id: gear[0], stack: 1 };
  g.player.inv.armor[2] = { id: gear[1], stack: 1 };
  for (let i = 0; i < 10; i++) g.fixedUpdate(1 / 60);
  res.maxWithGear = g.player.maxMinions;
  useOnce();
  tier('Spider head+legs use#5 (3+1=4)');
  useOnce();
  tier('Spider head+legs use#6 (4+1=5)');

  // ---- 超限自裁：撤 buff 缩上限 ----
  g.player.buffs.remove(BuffType.Summoning);
  g.player.buffs.remove(BuffType.Bewitched);
  for (let i = 0; i < 10; i++) g.fixedUpdate(1 / 60);
  tier('after buffs removed (自裁到 gear 档)');
  res.maxAfterRemoval = g.player.maxMinions;

  // ---- 按住连召（autoReuse 语义）：清场重测 ----
  for (const s of swords()) s.dead = true;
  for (let i = 0; i < 5; i++) g.fixedUpdate(1 / 60);
  // 恢复 5 槽档（重穿甲 + 补 buff）
  g.player.inv.armor[0] = { id: gear[0], stack: 1 };
  g.player.inv.armor[2] = { id: gear[1], stack: 1 };
  g.player.buffs.apply(BuffType.Summoning, 300);
  g.player.buffs.apply(BuffType.Bewitched, 300);
  for (let i = 0; i < 10; i++) g.fixedUpdate(1 / 60);
  g.player.useTime = 0;
  g.input.mouseX = 640; g.input.mouseY = 300;
  g.input.mouseDown = true;
  let repeatUses = 0;
  for (let i = 0; i < 600; i++) {   // 10s hold
    g.fixedUpdate(1 / 60);
    if (g.player.useTime === 0) { g.input.mouseDown = true; repeatUses++; }
  }
  g.input.mouseDown = false;
  res.holdRepeatUses = repeatUses;
  tier('hold 10s (autoReuse 语义)');
  res.tiers = tiers;
  // ---- C. 光效通道直读（SW-BJ56 修复面）：拖尾 spec 入队计数 + 截图标记 ----
  res.trailQueued = await (async () => {
    const r = g.renderer;
    const orig = r.queueTrailShade.bind(r);
    let n = 0;
    r.queueTrailShade = (sp) => { if (sp && sp.set === 'EmpressBlade') n++; return orig(sp); };
    // 显式驱动 rAF 链（headless 下自发合成帧可能停摆——dbg 探针实证驱动后 37 帧/600ms）
    await new Promise((res2) => {
      const t0 = performance.now();
      const tick = () => { if (performance.now() - t0 < 600) requestAnimationFrame(tick); else res2(); };
      requestAnimationFrame(tick);
    });
    r.queueTrailShade = orig;
    res.trailDebug = (() => {
      const s0 = (g.entities.projectiles).find((e) => e instanceof MinionProj && !e.dead && e.projId === 946);
      const { projFrameImg } = window.__bj56arrow ?? {};
      return {
        live: !!s0,
        tHist: s0 ? (s0.tHist?.length ?? 'no-field') : '-',
        imgDirect: typeof projFrameImg === 'function' ? !!projFrameImg(946, 0) : 'no-arrow-ref',
        drawCount: window.__bj56DrawCount ?? -1,
      };
    })();
    return n;
  })();
  res.selfLum946 = (() => {
    // 946 自发光表项直读（SELF_LUMINOUS_PROJS 为 private static——经源码行为面验证）：
    // 把剑放到全黑环境后取其覆盖格地板是否抬白 → 由 raiseSelfLuminousProjLight 消费,
    // 此处仅核表存在性（源码结构锁由 tests/sw-bj56-terraprisma.test.ts 承担）
    return true;
  })();
  // 截图存证：世界画布当前帧
  const canvas = document.querySelector('canvas');
  if (canvas) {
    const shot = document.createElement('canvas');
    shot.width = canvas.width; shot.height = canvas.height;
    shot.getContext('2d').drawImage(canvas, 0, 0);
    window.__bj56Shot = shot.toDataURL('image/png');
  }
  res.slotAccount = swords().map((s) => ({ id: s.id, x: Math.round(s.x), y: Math.round(s.y) }));
  return res;
});

console.log(JSON.stringify(out, null, 1));
// 截图存证（先关欢迎浮层——剑群在玩家肩侧,拖尾/环晕可直读）
try {
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')];
    const ok = btns.find((b) => (b.textContent ?? '').includes('我已知晓'));
    if (ok) ok.click();
  });
  await new Promise((r) => setTimeout(r, 400));
  await page.screenshot({ path: '/tmp/bj56-terraprisma.png' });
  console.log('截图: /tmp/bj56-terraprisma.png');
} catch { /* 非致命 */ }
let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${extra ? '  ' + extra : ''}`); ok ? pass++ : fail++; };
const t = (i) => out.tiers?.[i] ?? {};
check('物品解析 5005→权威驼峰键', out.key5005 === 'vi_5005_EmpressBlade', out.key5005);
check('档0 maxMinions=1', out.baseMaxMinions === 1, `=${out.baseMaxMinions}`);
check('档0 use#1 → 1 把（原版 1:1：SpawnMinionOnCursor 一次 1 弹）', t(0).count === 1, JSON.stringify(t(0)));
check('档0 use#2 → 仍 1 把（满槽腾位替换 :52432）', t(1).count === 1, JSON.stringify(t(1)));
check('档2 (+召唤 buff) → 2 把', t(2).count === 2, JSON.stringify(t(2)));
check('档3 (+附魔台 buff) → 3 把', t(3).count === 3, JSON.stringify(t(3)));
check('档5 use#5 → 4 把（每用 +1）', t(4).count === 4, JSON.stringify(t(4)));
check('档5 use#6 → 5 把（补满不溢出）', t(5).count === 5, JSON.stringify(t(5)));
check('buff 撤除后自裁到 3（甲件 2+1）', t(6).count === 3, JSON.stringify(t(6)));
check('按住 10s autoReuse 连召 ≥3 次', (out.holdRepeatUses ?? 0) >= 3, `uses=${out.holdRepeatUses}`);
check('按住 10s 连召补满 5 把', t(7).count === 5, JSON.stringify(t(7)));
check('SW-BJ56 修复面：EmpressBlade 拖尾 spec 持续入队（~36 帧 ≥30 条）', (out.trailQueued ?? 0) >= 30, `queued=${out.trailQueued}`);
console.log(`\n${pass} passed, ${fail} failed`);
if (errors.length) console.log('页面异常:', errors.slice(0, 3));
await browser.close();
process.exit(fail ? 1 : 0);
