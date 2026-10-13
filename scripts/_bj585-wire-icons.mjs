// ★BJ585 探针 v3：四线可见度切换器两面对拍（用户实报「只有明亮正确渲染,经典/褪色像透明」）。
//  · UI 图标面：点红电线图标走真实点击链（cycleWireVisibility 0→1→2）,抓每态
//    computed style（opacity/filter）+ 元素截图——验证四态 tint 链落刀
//    （0 原色 / 1 brightness(0.498) 不透明 / 2 (83,α0.659)）。
//  · 世界线面（蓝/绿互换刀判别）：红/蓝/绿三条横线钉出生点上方,基线 D=全 Hidden(3),
//    配置 A=[蓝Hidden,绿Bright]/B=[蓝Bright,绿Hidden]/N=全 Normal——行带像差全在页内
//    计算（v2 教训:跨 evaluate 传 typed array + rAF 未落帧读态=全零伪差分）。
//    旧码（按枚举名序注入）A 会隐藏绿行、B 隐藏蓝行=本探针必红。
//  用法：SW_ORIGIN=http://localhost:5201 node tools/run-diag.mjs scripts/_bj585-wire-icons.mjs
import { launchBrowser, openPage, bootstrap, createGame, pump, ledger } from '../tools/probe/lib/index.mjs';
import { freezeClock } from '../tools/probe/lib/clock.mjs';
import { writeFileSync } from 'node:fs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5201';
const L = ledger();
const browser = await launchBrowser({});
const page = await openPage(browser, {});
await bootstrap(page, ORIGIN);
const gen = await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 20261013 });
L.chk('createGame', gen.ok, gen.why ?? '');
await freezeClock(page, { tod: 0.5 });   // 正午（light pass 乘光≈1）
await pump(page, 30);

// ---- 场景布置：3611 入包 + 开背包 + 三色横线（出生点上方,避开玩家 4 格）----
const setup = await page.evaluate(() => {
  const g = window.__swGame;
  const byKey = window.__swItems ?? {};
  const key = Object.keys(byKey).find((k) => /^vi_3611_/.test(k));
  if (!key) return { ok: false, why: '3611 未注册' };
  g.player.inv.slots[10] = { id: byKey[key], stack: 1 };
  try { g.player.inv.slots[g.player.selected] = null; } catch { /* 持物清空 */ }
  window.__swUI.openInventory(true);
  const st = g.world.store;
  const px = Math.floor(g.player.x / 16), py = Math.floor(g.player.y / 16);
  const rows = { red: py - 14, blue: py - 11, green: py - 8 };
  const put = (y, bit) => { for (let x = px - 12; x <= px + 12; x++) { const i = st.idx(x, y); st.wire[i] = (st.wire[i] & ~15) | bit; } };
  put(rows.red, 1); put(rows.blue, 2); put(rows.green, 4);
  window.__bj585 = { px, py, rows, dpr: window.devicePixelRatio };
  return { ok: true, px, py, dpr: window.devicePixelRatio };
});
L.chk('setup-3611+wires', setup.ok === true, JSON.stringify(setup));
await pump(page, 20);   // equipStats key 失效重算 + 布局
const waitFrames = (n = 3) => page.evaluate((n) => new Promise((res) => {
  let k = 0;
  const f = () => (++k >= n ? res() : requestAnimationFrame(f));
  requestAnimationFrame(f);
}), n);
await waitFrames(4);     // ★v3：读态/查 DOM 前必须等真实渲染帧（v2 全零伪差分根因之一）

const state0 = await page.evaluate(() => {
  const g = window.__swGame;
  return { mechShowWires: g.player.equipStats.mechShowWires, showWires: g.renderer.showWires };
});
L.chk('mechShowWires=背包在册即真（原版 UpdateEquips j<58 域）', state0.mechShowWires === true, JSON.stringify(state0));
L.chk('showWires 门开', state0.showWires === true, JSON.stringify(state0));

// ---- UI 图标面：真实点击链走四态 ----
const iconProbe = await page.evaluate(() => {
  const g = window.__swGame;
  const btns = [...document.querySelectorAll('button')].filter((b) =>
    (b.style.backgroundImage || '').includes('UI_BuilderIcons') && b.offsetParent !== null);
  // DOM 序=BUILDER_ACC_ICON_ORDER 可见子序;可见 = [8,9,0,(1,)4,5,6,7] → 末 4=红/蓝/绿/黄图标
  const wireBtns = btns.slice(-4);
  if (wireBtns.length !== 4) return { ok: false, why: `wire 图标数=${wireBtns.length}`, total: btns.length };
  window.__bj585Btns = wireBtns;
  const st = () => g.player.builderAccStatus;
  const out = { ok: true, states: [] };
  for (let k = 0; k < 3; k++) {
    wireBtns[0].dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    const s4 = st()[4];
    const cs = getComputedStyle(wireBtns[0]);
    out.states.push({ click: k + 1, status4: s4, opacity: cs.opacity, filter: cs.filter });
  }
  return out;
});
L.chk('icon-clicks', iconProbe.ok === true, JSON.stringify(iconProbe).slice(0, 400));
if (iconProbe.ok) {
  const [s1, s2, s3] = iconProbe.states;
  L.chk('态1 Classic=不透明暗灰 brightness(0.498)', s1.status4 === 1 && s1.opacity === '1' && s1.filter.includes('brightness(0.498'), JSON.stringify(s1));
  L.chk('态2 Faded=(83,α0.659) 半暗', s2.status4 === 2 && Math.abs(parseFloat(s2.opacity) - 168 / 255) < 0.01 && s2.filter.includes('brightness(0.325'), JSON.stringify(s2));
  L.chk('态3 回绕 2→0（vanilla ++>=3 quirk）', s3.status4 === 0, JSON.stringify(s3));
  const shoot = async (name) => {
    const h = await page.evaluateHandle(() => window.__bj585Btns[0]);
    const el = h.asElement();
    if (el) await el.screenshot({ path: `/tmp/bj585-${name}.png` });
  };
  await page.evaluate(() => { window.__bj585Btns[0].dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); });
  await shoot('icon-red-s1-normal');
  await page.evaluate(() => { window.__bj585Btns[0].dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); });
  await shoot('icon-red-s2-faded');
  await page.evaluate(() => { window.__bj585Btns[0].dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); });   // 回 0
}

// ---- 世界线面：行带快照全存页内,差分页内算（★v3）----
const worldProbe = await page.evaluate(() => {
  const g = window.__swGame;
  const { rows, dpr } = window.__bj585;
  const cam = g.camera;
  const c = g.renderer.canvas;
  const band = (ty) => {
    const [, sy] = cam.worldToScreen(g.player.x, ty * 16 + 8);   // 只取行带 Y（x 用画布中带）
    const cyy = Math.round(sy * dpr);
    const H = 12, W = 420;
    const x0 = Math.max(0, Math.round(c.width / 2 - W / 2));
    const lc = window.__bj585Lc ?? (window.__bj585Lc = document.createElement('canvas'));
    lc.width = W; lc.height = H;
    const lx = lc.getContext('2d', { willReadFrequently: true });
    lx.drawImage(c, x0, cyy - 6, W, H, 0, 0, W, H);
    return lx.getImageData(0, 0, W, H).data;
  };
  const diff = (a, b) => {
    let n = 0;
    for (let i = 0; i < a.length; i += 4) {
      if (Math.abs(a[i] - b[i]) > 8 || Math.abs(a[i + 1] - b[i + 1]) > 8 || Math.abs(a[i + 2] - b[i + 2]) > 8) n++;
    }
    return n;
  };
  const setStatus = (r, b, gr, y) => {
    const s = g.player.builderAccStatus;
    s[4] = r; s[5] = b; s[6] = gr; s[7] = y; s[9] = 1;
  };
  window.__bj585api = { band, diff, setStatus, rows };
  window.__bj585bands = {};
  return { ok: true };
});
L.chk('world-probe-installed', worldProbe.ok === true);

const snap = async (name) => {
  await waitFrames(3);
  await page.evaluate((name) => {
    const { band } = window.__bj585api;
    window.__bj585bands[name] = {
      red: band(window.__bj585.rows.red),
      blue: band(window.__bj585.rows.blue),
      green: band(window.__bj585.rows.green),
    };
  }, name);
};
const setSt = (r, b, gr, y) => page.evaluate(([r, b, gr, y]) => window.__bj585api.setStatus(r, b, gr, y), [r, b, gr, y]);

await setSt(3, 3, 3, 3);   // D：全 Hidden 基线（背景纯态）
await snap('D');
await setSt(1, 3, 0, 1);   // A：蓝Hidden 绿Bright（互换刀判别配置）
await waitFrames(2);        // ★wireModes 渲染帧才刷新,读前等帧（v4 竞态教训）
const modesA = await page.evaluate(() => window.__swGame.renderer.wireModes);
await snap('A');
await setSt(1, 0, 3, 1);   // B：蓝Bright 绿Hidden
await snap('B');
await setSt(1, 1, 1, 1);   // N：全 Normal（白天 light 通道可见性）
await snap('N');
const modes = modesA;
const diffs = await page.evaluate(() => {
  const { diff } = window.__bj585api;
  const B = window.__bj585bands;
  const out = {};
  for (const k of ['A', 'B', 'N']) {
    out[k] = {
      red: diff(B[k].red, B.D.red),
      blue: diff(B[k].blue, B.D.blue),
      green: diff(B[k].green, B.D.green),
    };
  }
  return out;
});
L.chk('配置A(wireModes=[1,3,0,1,1])：蓝行≈基线 且 红行/绿行可见 —— 互换刀判别(旧码反相必红)',
  JSON.stringify(modes) === JSON.stringify([1, 3, 0, 1, 1]) && diffs.A.blue < 600 && diffs.A.red > 1200 && diffs.A.green > 1200,
  JSON.stringify({ modes, dA: diffs.A }));
L.chk('配置B：绿行≈基线 且 红行/蓝行可见', diffs.B.green < 600 && diffs.B.red > 1200 && diffs.B.blue > 1200, JSON.stringify(diffs.B));
L.chk('全 Normal 白天三行全可见（light pass 乘光≈1=原版 GetColor 白昼相）',
  diffs.N.red > 1200 && diffs.N.blue > 1200 && diffs.N.green > 1200, JSON.stringify(diffs.N));

// 世界证据图（A 态=蓝 Hidden + N 态=三色全显）
const cropOf = (tag) => page.evaluate(() => {
  const g = window.__swGame;
  const c = g.renderer.canvas;
  const { rows, dpr } = window.__bj585;
  const [, syTop] = g.camera.worldToScreen(g.player.x, rows.red * 16 - 8);
  const [, syBot] = g.camera.worldToScreen(g.player.x, rows.green * 16 + 24);
  const lc = document.createElement('canvas');
  const y0 = Math.max(0, Math.round(syTop * dpr) - 8);
  const h = Math.max(10, Math.round((syBot - syTop) * dpr) + 16);
  const x0 = Math.max(0, Math.round(c.width / 2) - 220);
  lc.width = 440; lc.height = h;
  lc.getContext('2d').drawImage(c, x0, y0, 440, h, 0, 0, 440, h);
  return lc.toDataURL('image/png');
});
await page.evaluate(() => window.__bj585api.setStatus(1, 3, 0, 1));   // 回 A 态
await waitFrames(3);
writeFileSync('/tmp/bj585-world-A-blueHidden.png', Buffer.from((await cropOf('A')).split(',')[1], 'base64'));
await page.evaluate(() => window.__bj585api.setStatus(1, 1, 1, 1));   // N 态
await waitFrames(3);
writeFileSync('/tmp/bj585-world-normal.png', Buffer.from((await cropOf('N')).split(',')[1], 'base64'));

console.log('[bj585] rows:', JSON.stringify({ modes, diffs }));
await browser.close();
L.print();
process.exit(L.exitCode());
