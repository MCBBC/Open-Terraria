// SW-FX12 油漆/涂层补债批 探针（一次性诊断,经 tools/run-diag.mjs 运行）：
//   P1 全程 pageerror 监听 = 冠源染色/荧光叠层补画/烘焙路径零异常
//   P2 漆冠 vs 素冠双冠对照：WindSway 摆动层冠贴图对红漆实时变红
//      （getTreeFoliageSettings 特判组接线 + tintedVanillaRegion 源染色实机面）
//   P3a 对照组：实心石+荧光涂层 = glow 叠层页拷贝通道有内容（回归保护）
//   P3b 冠标记格+荧光涂层 = glow 叠层重画通道有内容（旧实现=页拷贝空=alpha 0）
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto('' + (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '', { waitUntil: 'networkidle0' });
await page.evaluate(() => { const _s = document.querySelector('select'); _s.selectedIndex = 0; _s.parentElement.querySelector('button').click(); });
await page.waitForFunction(() => window.__swGame && window.__swGame.world, { timeout: 300000 });
await new Promise((r) => setTimeout(r, 1500));

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${extra ? '  ' + extra : ''}`); ok ? pass++ : fail++; };

const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const st = g.world.store;
  // 收欢迎浮层 + 拨到正午（夜世界全黑,像素分叉不可观测）
  const btn = [...document.querySelectorAll('button')].find((b) => /我已知晓/.test(b.textContent ?? ''));
  if (btn) btn.click();
  if (g.world.clock) g.world.clock.timeOfDay = 0.5;
  // T 常量与 TILE_DEFS 注册序一致（tiles.ts 头注）：2 stone / 3 grass / 8 tree
  const STONE = 2, GRASS = 3, TREE = 8;
  // 以玩家当前位置为锚（深层洞穴会落在视区外未烘焙 chunk,取样全 0——首跑教训）
  const px0 = Math.floor(g.player.cx / 16);
  const py0 = Math.floor(g.player.cy / 16) + 3;
  // ★全部走 setTileSilent（生成期直写域,零监听级联）——运行期 setTile 的支撑
  //  检查监听链会同步枯死石基树列（首三跑标记格 type=0 的根因）
  for (let dy = -16; dy <= 0; dy++) for (let dx = -26; dx <= 26; dx++) {
    const x = px0 + dx, y = py0 + dy;
    if (st.inBounds(x, y)) st.setTileSilent(x, y, 0);
  }
  for (let dx = -26; dx <= 26; dx++) st.setTileSilent(px0 + dx, py0, STONE);
  g.player.x = (px0 - 6) * 16; g.player.y = (py0 - 4) * 16;
  g.player.vy = 0; g.player.vx = 0;
  // 双冠对照：painted（红漆）/ plain（未漆）两棵标记冠并排——同精灵同帧,一漆一素
  const txP = px0 + 6, txN = px0 + 14, tyCrown = py0 - 8;
  for (const tx of [txP, txN]) {
    for (let y = py0 - 1; y >= tyCrown; y--) st.setTileSilent(tx, y, TREE, 0, 0);
    st.setTileSilent(tx, py0, GRASS);                // 树基土壤
    st.setTileSilent(tx - 1, py0 - 1, GRASS);
    st.setTileSilent(tx, tyCrown, TREE, 22, 198);    // 冠标记帧（不进烘焙,WindSway 摆动层绘制）
  }
  g.chunks.markDirtyArea(px0 - 26, py0 - 16, px0 + 26, py0);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const raf = (n) => new Promise((r) => { let k = 0; const t = () => (k++ < n) ? requestAnimationFrame(t) : r(); t(); });
  await raf(30); await sleep(400);                   // 相机跟手 + chunk 烘焙 + 摆动层首帧
  // ★树冠标记格会被世界更新链枯死（world tick KillTile）—— coat 后同步 flushDirty
  //  抢在世界 tick 前烘焙（改动=setCoat 即时标脏,同步冲刷可观测重画面）
  const sample = (wx, wy) => {
    // 冠体框：标记格上方 40×40（冠精灵 80×80 底锚定,标记格内下半多透明）
    const [sx0, sy0] = g.camera.worldToScreen(wx * 16 + 8, wy * 16 - 20);
    const c = g.renderer.canvas.getContext('2d');
    const d = c.getImageData(Math.round(sx0) - 20, Math.round(sy0) - 20, 40, 40).data;
    let r = 0, gg = 0, b = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) { r += d[i]; gg += d[i + 1]; b += d[i + 2]; n++; }
    return { r: r / n, g: gg / n, b: b / n };
  };
  const plain = sample(txN, tyCrown);
  st.setPaint(txP, tyCrown, 1);                      // 红漆冠（特殊路径染色）
  await raf(3); await sleep(80);                     // 下一个摆动帧即生效（标记格会被世界更新枯死,取样窗口收紧）
  const after = sample(txP, tyCrown);
  // 荧光涂层 → chunk pair.glow 格内应有内容
  const ctrl = px0 + 2;
  st.setTileSilent(txN, tyCrown, TREE, 22, 198);     // 重放冠标记格（直写域防枯死）
  st.setCoat(txN, tyCrown, 8, 8);                    // 未漆冠标记格=重画通道载体
  st.setCoat(ctrl, py0, 8, 8);                       // 实心石地板本体=页拷贝通道载体
  g.chunks.flushDirty(64, 50);                       // 同步冲刷烘焙
  const keyOf = (x, y) => {
    const cx2 = Math.floor(x / 16), cy2 = Math.floor(y / 16);
    return (cx2 & 0xffff) | ((cy2 & 0xffff) << 16);
  };
  const probeGlow = (x, y) => {
    const pair = g.chunks.chunks.get(keyOf(x, y));
    if (!pair || !pair.glow) return { found: false, alpha: -1 };
    const gctx = pair.glow.getContext('2d');
    const lx = ((x % 16) + 16) % 16, ly = ((y % 16) + 16) % 16;
    const gd = gctx.getImageData(lx * 16 + 4, ly * 16 + 4, 8, 8).data;
    let a = 0;
    for (let i = 3; i < gd.length; i += 4) a = Math.max(a, gd[i]);
    return { found: true, alpha: a };
  };
  const swayGlow = probeGlow(txN, tyCrown);          // 冠标记格=烘焙层空格,重画通道载体
  const ctrlGlow = probeGlow(ctrl, py0);
  // 诊断：冠格当前 coat/type/flags + 其 chunk 内 FB 位格清单
  const diag = (() => {
    const cx2 = Math.floor(txN / 16), cy2 = Math.floor(tyCrown / 16);
    const cells = [];
    for (let ly = 0; ly < 16; ly++) for (let lx = 0; lx < 16; lx++) {
      const x = cx2 * 16 + lx, y = cy2 * 16 + ly;
      if (!st.inBounds(x, y)) continue;
      const c = st.coat[st.idx(x, y)];
      if (c & 30) cells.push([x, y, st.type[x + y * st.w], c, st.flags[x + y * st.w]]);
    }
    return { chunk: [cx2, cy2], crownCell: [txN, tyCrown, st.type[st.idx(txN, tyCrown)], st.coat[st.idx(txN, tyCrown)], st.flags[st.idx(txN, tyCrown)]], fbCells: cells.slice(0, 8) };
  })();
  return { plain, after, swayGlow, ctrlGlow, diag };
});


console.log('errors:', JSON.stringify(errors.slice(0, 5)));
if (out && out.plain) {
  check('P2 漆冠 vs 素冠像素分叉（冠源染色/特判组接线实机面）',
    Math.abs((out.after.r - out.after.g) - (out.plain.r - out.plain.g)) > 10,
    `plain=(r${out.plain.r | 0},g${out.plain.g | 0},b${out.plain.b | 0}) painted=(r${out.after.r | 0},g${out.after.g | 0},b${out.after.b | 0})`);
  check('P3a 对照组：实心石荧光=页拷贝通道有内容', out.ctrlGlow.found && out.ctrlGlow.alpha > 0,
    `ctrl=${JSON.stringify(out.ctrlGlow)}`);
  check('P3b 荧光涂层冠标记格 glow 叠层非空（旧实现=页拷贝空=alpha 0）',
    out.swayGlow.found && out.swayGlow.alpha > 0, `sway=${JSON.stringify(out.swayGlow)}`);
} else {
  check('P0 probe evaluate 返回有效数据', false, JSON.stringify(out));
}
check('P1 pageerror 零（冠源染色/glow 补画/烘焙路径）', errors.length === 0, errors.slice(0, 3).join(' | '));
await page.screenshot({ path: '/tmp/fx12-paint-probe.png' });
await browser.close();
console.log(`RESULT ${pass}/${pass + fail}`);
process.exit(fail > 0 ? 1 : 0);
