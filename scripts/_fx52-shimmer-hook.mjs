// ★SW-FX52 探针：微光化态（shimmering）× 钩爪 —— 浏览器级证据。
// 定谳（1457）：buff 353 → shimmering=true + frozen=true（Player.cs:11872-11876）⇒
//   CCed（:3361-3372）⇒ ItemCheck 早退（:42924-42930）/ QuickGrapple 早退
//   （:6292-6294）/ controlUseItem 清零（:25432-25442）——微光态不可发射钩爪；
//   已挂钩者牵引照旧但穿落位移 position+=v×0.375 完全绕过 tile collision
//   （:28388-28390），不存在"拉进地里"的嵌入；嵌格滞留由 TryToShimmerUnstuck
//   （:29074-29090，≥3600t 自动 / ≥1200t+任意输入）传送脱困。
// 断言：
//   ① 微光态按 E（真键盘事件）不生成钩爪弹体（cced 门生效）
//   ② 微光态左键（updateUse 入口门）不生成钩爪弹体
//   ③ 对照：非微光态按 E 正常发射
//   ④ 已锚定钩 + 微光态：牵引照走、玩家穿岩位移不被嵌格（原版穿落语义）
//   ⑤ ≥3600t 自动脱困：buff 353 清除 + 落点非实心（TryFindingShimmerFreeSpot）
// 断言失败 exit 2,全绿 exit 0。截图 /tmp/fx52-shimmer-hook.png。
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true,
  args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 },
  protocolTimeout: 540000,
});
const page = await browser.newPage();
page.setDefaultTimeout(200000);
const B = process.env.SW_ORIGIN ?? 'http://localhost:5253';
console.log('[fx52] goto', B);
await page.goto(B + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.evaluate(() => { try { localStorage.setItem('sw.welcome.announce.acked', '1'); } catch { /* ignore */ } });
await new Promise((r) => setTimeout(r, 2500));
console.log('[fx52] wait game boot');
await page.waitForFunction(() => { const g = window.__swGame; return g && g.player && window.__swUI; }, { timeout: 190000 });
await new Promise((r) => setTimeout(r, 1500));
console.log('[fx52] boot ok, entering evaluate');

const out = await page.evaluate(async () => {
  const g = window.__swGame, p = g.player, st = g.world.store;
  const IBK = window.__swItems ?? {};
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const results = [];
  const check = (name, got, want) => results.push({ name, got, want, ok: Object.is(got, want) });
  const el = g.input.el ?? document.querySelector('canvas');
  const key = (c, down) => el.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code: c, bubbles: true, cancelable: true }));
  const nHooks = () => p.grappleProjs.length;
  p.debugGod = true;

  // 钩爪 vid 84（GrapplingHook）→ 本仓内部 id
  const hookKey = Object.keys(IBK).find((k) => k.startsWith('vi_84_'));
  check('环境：钩爪物品键存在', !!hookKey, true);
  p.inv.slots[0] = { id: IBK[hookKey], stack: 1 };
  p.inv.selected = 0;

  // 找 2 宽×6 高全实心岩袋（行 y..y+5 全实心 ⇒ y+4 处可放锚点）——
  // 穿落滞留态 = 用户实报「卡进地里」的姿态；深度限 80 格内保 TryFindingShimmerFreeSpot 可达
  const sx = Math.floor(p.cx / 16), sy0 = Math.floor(p.cy / 16);
  let pocket = null;
  outer: for (let dy = 4; dy < 80; dy++) {
    for (const dx of [0, -3, 3, -6, 6]) {
      const x = sx + dx, y = sy0 + dy;
      let ok = true;
      for (let ty = y; ty <= y + 5 && ok; ty++)
        for (let tx = x; tx <= x + 1; tx++)
          if (!st.inBounds(tx, ty) || !st.isSolid(tx, ty)) { ok = false; break; }
      if (ok) { pocket = { x, y }; break outer; }
    }
  }
  check('环境：找到 2×6 实心岩袋', !!pocket, true);
  window.__fx52Pocket = pocket;
  const homeX = p.x, homeY = p.y;
  const enterShimmerSink = async () => {
    p.x = pocket.x * 16; p.y = pocket.y * 16 + 1;
    p.vx = 0; p.vy = 0;
    p.buffs.apply(77, 30);            // BuffType.Shimmered（内部 77 = 原版 353）
    await sleep(250);                 // 等 fixedUpdate 走 buff 分支 → shimmering=true
  };

  // ---- ①② 微光态：E 键 / 左键均不得发射 ----
  await enterShimmerSink();
  check('①前置：微光态建立（shimmering）', p.shimmering, true);
  check('①前置：cced 含微光腿', p.cced, true);
  key('KeyE', true); await sleep(180); key('KeyE', false); await sleep(120);
  check('① 微光态按 E 不发射（钩弹体数 0）', nHooks(), 0);
  g.input.mouseX = 640; g.input.mouseY = 400;
  g.input.mouseDown = true; await sleep(200); g.input.mouseDown = false; await sleep(120);
  check('② 微光态左键不发射（钩弹体数 0）', nHooks(), 0);

  // ---- ④ 已锚定钩 + 微光态：牵引照走 + 穿岩位移（不嵌格）----
  // ①② 期间玩家已穿落数行 ⇒ 锚点按【当下】位置放置（优先上 3 格,失验退下 3 格）
  g.fireGrapple(84, 0, 1);          // 直接发射（构造「发射后入微光」的既有锚态）
  const h = p.grappleProjs[p.grappleProjs.length - 1];
  check('④前置：钩弹体在场', !!h, true);
  const ax = pocket.x, ayUp = Math.floor((p.y - 48) / 16), ayDn = Math.floor((p.y + 48) / 16);
  const ay = st.isSolid(ax, ayUp) ? ayUp : ayDn;
  if (h) {
    h.x = ax * 16 + 8; h.y = ay * 16 + 8;                     // 锚在岩内（已验实心）
    h.ai0 = 2; h.timeLeft = 100000;                           // GRAPPLE_LATCH
  }
  const y0 = p.y;
  const trace = [];
  for (let i = 0; i < 6; i++) {
    await sleep(200);
    trace.push({
      t: i * 200, y: +p.y.toFixed(1), vy: +p.vy.toFixed(2), shim: p.shimmering,
      ai0: h ? h.ai0 : -1, dead: h ? !!h.dead : true,
      reg: p.grappling[0] === h, grapCount: p.grapCount,
      hxy: h ? [Math.floor(h.cx / 16), Math.floor(h.cy / 16)] : null,
    });
  }
  results.push({ name: '④DBG 牵引轨迹', got: JSON.stringify({ anchorTile: [ax, ay], anchorSolid: st.isSolid(ax, ay), trace }), want: '-', ok: true });
  check('④ 微光态牵引照走（仍 shimmering）', p.shimmering, true);
  check('④ 玩家被拉向锚点（穿岩位移非嵌格滞留）', Math.abs(p.y - y0) > 8, true);
  check('④ 位置有限无 NaN', Number.isFinite(p.x) && Number.isFinite(p.y), true);

  // ---- ⑤ ≥3600t 自动脱困：传送非实心 + buff 清除 ----
  const yPreUnstuck = p.y;
  p.timeShimmering = 3600;
  await sleep(600);
  check('⑤ 脱困后 buff 353 清除', p.buffs.has(77), false);
  results.push({ name: '⑤DBG 位移', got: JSON.stringify({ yPreUnstuck: +yPreUnstuck.toFixed(1), yNow: +p.y.toFixed(1), shim: p.shimmering }), want: '-', ok: true });
  // 末像素行（y+h−1）：站立时在地面砖上一行（空气）——y+h 恰压边界会误读地面砖
  const ftx = Math.floor(p.cx / 16), fty = Math.floor((p.y + p.h - 1) / 16);
  const feetFree = !st.isSolid(ftx, fty) || st.isPlatform(ftx, fty);
  check('⑤ 脱困落点非实心（TryFindingShimmerFreeSpot）', feetFree, true);
  p.removeAllGrapplingHooks();

  // ---- ③ 对照：非微光态 E 键正常发射 ----
  p.buffs.remove(77);
  p.x = homeX; p.y = homeY;
  await sleep(300);
  check('③前置：非微光态（shimmering=false/cced=false）', !p.shimmering && !p.cced, true);
  const before = nHooks();
  key('KeyE', true); await sleep(180); key('KeyE', false); await sleep(120);
  check('③ 非微光态按 E 正常发射', nHooks() > before, true);
  p.removeAllGrapplingHooks();

  await sleep(100);
  return results;
});

// 截图：回放④沉底姿态（微光半透明玩家嵌在岩袋内、锚钩在侧；欢迎浮层已按 ACK_KEY 预关）
await page.evaluate(async () => {
  const g = window.__swGame, p = g.player;
  const pk = window.__fx52Pocket;
  if (!pk) return;
  p.buffs.remove(77);
  p.x = pk.x * 16; p.y = pk.y * 16 + 1; p.vx = 0; p.vy = 0;
  p.buffs.apply(77, 30);
  g.fireGrapple(84, 0, 1);
  const h = p.grappleProjs[p.grappleProjs.length - 1];
  const ay = Math.floor((p.y - 48) / 16);
  if (h) { h.x = pk.x * 16 + 8; h.y = ay * 16 + 8; h.ai0 = 2; h.timeLeft = 100000; }
});
await new Promise((r) => setTimeout(r, 500));
const shotState = await page.evaluate(() => {
  const g = window.__swGame, p = g.player;
  g.camera.x = p.cx; g.camera.y = p.cy;   // 相机硬跟（follow 缓动余量清零）
  return { x: +p.x.toFixed(0), y: +p.y.toFixed(0), shim: p.shimmering, cam: [Math.floor(g.camera.x / 16), Math.floor(g.camera.y / 16)] };
});
console.log('[fx52] shot state', JSON.stringify(shotState));
await new Promise((r) => setTimeout(r, 120));
await page.screenshot({ path: '/tmp/fx52-shimmer-hook.png' });

const bad = out.filter((r) => !r.ok);
console.log(JSON.stringify(out, null, 1));
console.log(bad.length ? 'FAIL ' + bad.length : 'ALL GREEN');
await browser.close();
process.exit(bad.length ? 2 : 0);
