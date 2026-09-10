/**
 * SW-BJ58 探针：装备「创造之手」(vid 5126) 后玩家右侧/头部高度出现"水平一排约 10
 * 个小物件（彩色小工具精灵）"——定位泄漏层与坐标公式。
 *
 * 法证手段：
 *  A. 实机截图（装备/不装备 × 朝向左/右 × 静止），全画布落盘；
 *  B. drawImage 取证补丁（页面内 monkey-patch）——记录玩家世界邻域 + 屏中心邻域的
 *     drawImage 调用（源矩形/目标坐标/变换/caller 栈），聚合找"等距 ~10 连"家族；
 *  C. 嫌疑家族源精灵快照（页内 toDataURL → 落盘 PNG）供人眼判型；
 *  D. 对照臂：5126+标尺 486（判别「创造之手自创面」vs「标尺线家族」形态差异）。
 *
 * 运行：node tools/probe.mjs run scripts/_bj58.mjs --seed=05162020 --size=small
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { launchBrowser, openPage, bootstrap, createGame, pump, nextFrame,
  godMode, clearEnemies, itemByVid, screenshot, Ledger } from '../tools/probe/lib/index.mjs';

const L = new Ledger();
const OUT = process.env.SW_PROBE_OUT ?? '/tmp/probe-out/_bj58';
mkdirSync(OUT, { recursive: true });

// ---- 页内取证补丁：记录玩家世界邻域 + 屏中心邻域的 drawImage ----
const INSTALL = `
window.__bj58Recs = null;
window.__bj58Install = () => {
  const proto = CanvasRenderingContext2D.prototype;
  if (proto.__bj58Patched) return 'already';
  proto.__bj58Patched = true;
  const orig = proto.drawImage;
  proto.__bj58Orig = orig;
  const recs = [];
  window.__bj58Recs = recs;
  proto.drawImage = function (...a) {
    try {
      const g = window.__swGame;
      const p = g && g.player;
      if (p && a.length >= 3 && a[0] && typeof a[0] === 'object') {
        let sx = 0, sy = 0, sw = 0, sh = 0, dx = 0, dy = 0, dw = 0, dh = 0;
        if (a.length === 9) { [sx, sy, sw, sh, dx, dy, dw, dh] = a.slice(1); }
        else if (a.length === 5) { [dx, dy] = a.slice(1); }
        else if (a.length === 4) { [dx, dy, dw, dh] = a.slice(1); }
        const cx = p.cx, cy = p.cy;
        const inWorld = (dx + dw > cx - 420) && (dx < cx + 420) && (dy + dh > cy - 200) && (dy < cy + 200);
        const cw = this.canvas ? this.canvas.width : 0, ch = this.canvas ? this.canvas.height : 0;
        const inScreen = (dx + dw > cw / 2 - 420) && (dx < cw / 2 + 420) && (dy + dh > ch / 2 - 200) && (dy < ch / 2 + 200);
        if ((inWorld || inScreen) && recs.length < 40000) {
          const st = new Error().stack.split('\\n');
          const caller = (st[2] || '').trim().replace(/^at /, '');
          const caller2 = (st[3] || '').trim().replace(/^at /, '');
          const t = this.getTransform();
          recs.push({
            __src: a[0],
            sx, sy, sw, sh, dx, dy, dw, dh,
            a: +t.a.toFixed(3), d: +t.d.toFixed(3), e: +t.e.toFixed(1), f: +t.f.toFixed(1),
            alpha: +this.globalAlpha.toFixed(3), op: this.globalCompositeOperation,
            cw, ch,
            caller: caller.slice(0, 90), caller2: caller2.slice(0, 90),
          });
        }
      }
    } catch (e) { /* 取证补丁不干扰游戏 */ }
    return orig.apply(this, a);
  };
  return 'installed';
};
window.__bj58Uninstall = () => {
  const proto = CanvasRenderingContext2D.prototype;
  if (!proto.__bj58Patched) return 'none';
  proto.drawImage = proto.__bj58Orig;
  proto.__bj58Patched = false;
  const r = window.__bj58Recs ?? [];
  window.__bj58Recs = null;
  return r;
};
window.__bj58Snap = () => {
  const recs = window.__bj58Recs ?? [];
  const agg = new Map();
  for (const r of recs) {
    const k = r.caller + ' <- ' + r.caller2 + ' | ' + r.cw + 'x' + r.ch;
    let e = agg.get(k);
    if (!e) { e = { count: 0, dxs: [], dys: [], sws: new Set(), shs: new Set(), alphas: new Set() }; agg.set(k, e); }
    e.count++;
    if (e.dxs.length < 48) { e.dxs.push(r.dx); e.dys.push(r.dy); }
    e.sws.add(r.sw); e.shs.add(r.sh); e.alphas.add(r.alpha);
  }
  const out = [];
  for (const [k, e] of agg) {
    e.dxs.sort((x, y) => x - y);
    out.push({ k, count: e.count, dx: e.dxs, dy: e.dys.slice(0, 12), sw: [...e.sws], sh: [...e.shs], alpha: [...e.alphas] });
  }
  out.sort((a, b) => b.count - a.count);
  return { total: recs.length, agg: out };
};
window.__bj58Families = () => {
  const recs = window.__bj58Recs ?? [];
  const fam = new Map();
  for (const r of recs) {
    if (!fam.has(r.caller)) fam.set(r.caller, []);
    fam.get(r.caller).push(r);
  }
  const out = [];
  for (const [k, rs] of fam) {
    if (rs.length < 6) continue;
    const xs = rs.map((r) => r.dx).sort((a, b) => a - b);
    const gaps = xs.slice(1).map((x, i) => x - xs[i]);
    const near = gaps.filter((gp) => gp >= 10 && gp <= 64);
    if (near.length < 4) continue;
    const r0 = rs[0];
    let preview = null;
    try {
      const sw = r0.sw || 24, sh = r0.sh || 24;
      const c2 = document.createElement('canvas');
      c2.width = Math.max(16, Math.min(72, sw + 8)); c2.height = Math.max(16, Math.min(72, sh + 8));
      const cx2 = c2.getContext('2d', { willReadFrequently: true });
      cx2.imageSmoothingEnabled = false;
      if (r0.sw && r0.sh && r0.__src) cx2.drawImage(r0.__src, r0.sx, r0.sy, r0.sw, r0.sh, 4, 4, r0.sw, r0.sh);
      else if (r0.__src) cx2.drawImage(r0.__src, 4, 4);
      preview = c2.toDataURL('image/png');
    } catch (e) { preview = 'ERR:' + e.message; }
    out.push({
      caller: k, n: rs.length,
      gaps: gaps.slice(0, 14),
      sw: [...new Set(rs.map((r) => r.sw))], sh: [...new Set(rs.map((r) => r.sh))],
      dx: xs.slice(0, 16),
      dy: [...new Set(rs.map((r) => r.dy))].slice(0, 6),
      alpha: [...new Set(rs.map((r) => r.alpha))],
      sx: [...new Set(rs.map((r) => r.sx))].slice(0, 8),
      sy: [...new Set(rs.map((r) => r.sy))].slice(0, 8),
      preview,
    });
  }
  out.sort((a, b) => b.n - a.n);
  return { total: recs.length, fams: out.slice(0, 14) };
};
'ok';
`;

const browser = await launchBrowser({});
try {
  const page = await openPage(browser, { errors: L.fails });
  page.__probeOrigin = process.env.SW_ORIGIN;
  const boot = await bootstrap(page, process.env.SW_ORIGIN);
  L.chk('bootstrap', boot.ok, boot.why ?? '');
  const gen = await createGame(page, { mode: 'direct', seed: '05162020', size: 'small' });
  L.chk('createGame', gen.ok, gen.why ?? '');
  await godMode(page, true);
  await clearEnemies(page);
  await pump(page, 60, { clearEnemies: true });
  await page.evaluate(INSTALL);

  const iid5126 = await itemByVid(page, 5126);
  L.chk('vid5126→iid', Number.isInteger(iid5126) && iid5126 > 0, `iid=${iid5126}`);

  // ---- 状态机：基线(空槽) → 装备 5126 右/左朝向 → 摘除复测；每态录 4 真实帧 + 截图 ----
  const states = [
    { name: 'none', acc: null, facing: 1 },
    { name: 'hoc-right', acc: iid5126, facing: 1 },
    { name: 'hoc-left', acc: iid5126, facing: -1 },
    { name: 'hoc-right-removed', acc: null, facing: 1 },
  ];
  const playerInfo = await page.evaluate(() => {
    const p = window.__swGame.player;
    return { x: p.x, y: p.y, cx: p.cx, cy: p.cy, w: p.w, h: p.h };
  });
  L.say(`player @ (${playerInfo.cx.toFixed(0)}, ${playerInfo.cy.toFixed(0)})`);

  for (const st of states) {
    await page.evaluate(({ acc, facing }) => {
      const g = window.__swGame;
      g.player.inv.armor[3] = acc ? { id: acc, stack: 1 } : null;
      g.player.facing = facing;
      g.player.vx = 0; g.player.vy = 0;
    }, st);
    await pump(page, 30, { clearEnemies: true });
    await page.evaluate('window.__bj58Install()');
    await page.evaluate('if (window.__bj58Recs) window.__bj58Recs.length = 0');
    for (let i = 0; i < 4; i++) await nextFrame(page);
    const snap = await page.evaluate('window.__bj58Snap()');
    await page.evaluate('window.__bj58Uninstall()');
    writeFileSync(`${OUT}/draws-${st.name}.json`, JSON.stringify(snap, null, 2));
    const top = (snap?.agg ?? []).slice(0, 6).map((e) => `${e.k} ×${e.count}`);
    L.say(`[${st.name}] recs=${snap?.total} top: ${top.join(' ; ')}`);
    await screenshot(page, `bj58-${st.name}`, { time: 'day', wx: playerInfo.cx, wy: playerInfo.cy, w: 110, h: 70, onDark: 'auto' });
  }

  // ---- 嫌疑家族 + 精灵快照（装备态重录）----
  await page.evaluate(({ acc }) => {
    const g = window.__swGame;
    g.player.inv.armor[3] = acc ? { id: acc, stack: 1 } : null;
    g.player.facing = 1;
    g.player.vx = 0; g.player.vy = 0;
  }, { acc: iid5126 });
  await pump(page, 20, { clearEnemies: true });
  await page.evaluate('window.__bj58Install()');
  for (let i = 0; i < 4; i++) await nextFrame(page);
  const fams = await page.evaluate('window.__bj58Families()');
  writeFileSync(`${OUT}/families.json`, JSON.stringify(fams, null, 2));
  for (let i = 0; i < (fams?.fams ?? []).length; i++) {
    const f = fams.fams[i];
    if (typeof f.preview === 'string' && f.preview.startsWith('data:image/png')) {
      writeFileSync(`${OUT}/sprite-${i}-${f.n}.png`, Buffer.from(f.preview.split(',')[1], 'base64'));
    }
  }
  L.say(`families=${(fams?.fams ?? []).length} (see ${OUT}/families.json + sprite-*.png)`);
  await page.evaluate('window.__bj58Uninstall()');

  // ---- 对照臂：5126 + 标尺 486（看标尺线家族形态，判别触发面）----
  const iid486 = await itemByVid(page, 486);
  if (Number.isInteger(iid486) && iid486 > 0) {
    await page.evaluate(({ acc1, acc2 }) => {
      const g = window.__swGame;
      g.player.inv.armor[3] = { id: acc1, stack: 1 };
      g.player.inv.armor[4] = { id: acc2, stack: 1 };
      g.player.facing = 1;
      g.player.vx = 0; g.player.vy = 0;
      if (g.player.builderAccStatus) { g.player.builderAccStatus[0] = 0; g.player.builderAccStatus[1] = 0; }
    }, { acc1: iid5126, acc2: iid486 });
    await pump(page, 30, { clearEnemies: true });
    await page.evaluate('window.__bj58Install()');
    for (let i = 0; i < 4; i++) await nextFrame(page);
    const snap2 = await page.evaluate('window.__bj58Snap()');
    await page.evaluate('window.__bj58Uninstall()');
    writeFileSync(`${OUT}/draws-hoc+ruler.json`, JSON.stringify(snap2, null, 2));
    const top2 = (snap2?.agg ?? []).slice(0, 6).map((e) => `${e.k} ×${e.count}`);
    L.say(`[hoc+ruler] recs=${snap2?.total} top: ${top2.join(' ; ')}`);
    await page.evaluate(() => {
      const g = window.__swGame;
      g.player.inv.armor[3] = null; g.player.inv.armor[4] = null;
    });
  } else {
    L.say('vid486 反查失败,跳过标尺对照');
  }

  process.exit(L.exitCode());
} finally {
  await browser.close();
}
