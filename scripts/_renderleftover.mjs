// 渲染遗留四件收口抽验（#2 迅猛龙手持锚深层档 / #3 冰面滑行腿行 / #4 食物手持帧）。
// 快速游玩无 appearance → 注入默认外观（同 _deathvis.mjs 方法论）。
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true,
  args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => { const g = window.__swGame; return g && g.player && g.renderer; }, { timeout: 110000 });
await new Promise(r => setTimeout(r, 1500));

const out = await page.evaluate(async () => {
  const g = window.__swGame, p = g.player;
  const R = Object.getPrototypeOf(g.renderer);
  const K = R.constructor;
  const res = { fail: [] };
  const eq = (name, got, want) => {
    const ok = JSON.stringify(got) === JSON.stringify(want);
    if (!ok) res.fail.push(`${name}: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);
    return ok;
  };

  // ---------- #3 冰面滑行无输入腿行（Player.cs:35818-35826） ----------
  const save3 = { vx: p.vx, vy: p.vy, onGround: p.onGround, floorTileT: p.floorTileT, inputX: p.inputX, animTime: p.animTime, swimTime: p.swimTime };
  const legs3 = (o) => R.playerFrameRows.call(g.renderer, Object.assign(p, {
    vy: 0, onGround: true, swimTime: 0, animTime: 12, vx: 2.4, inputX: 0, floorTileT: -1,
  }, o), null, 0, o.mnt ?? null, null, 0).legs;
  res.ice_noInput = legs3({ floorTileT: 161, inputX: 0 });              // 期望 0
  res.ice197_noInput = legs3({ floorTileT: 197, inputX: 0 });           // slippy2 冻史莱姆块 期望 0
  res.ice_input = legs3({ floorTileT: 161, inputX: 1 });                // 有输入 → 行走循环 7..19
  res.ground_noInput = legs3({ floorTileT: -1, inputX: 0 });            // 普通地面无输入（击退余速）→ 原版走循环
  res.skates_noInput = legs3({ mnt: { type: 57 }, inputX: 0 });         // 滚轴鞋 57 无输入 期望 0
  res.skates_input = legs3({ mnt: { type: 57 }, inputX: 1, vx: 4 });    // 滚轴鞋有输入 → 循环
  eq('#3 冰161无输入', res.ice_noInput, 0);
  eq('#3 冻197无输入', res.ice197_noInput, 0);
  eq('#3 冰有输入走循环', res.ice_input >= 7 && res.ice_input <= 19, true);
  eq('#3 普地无输入走循环', res.ground_noInput >= 7 && res.ground_noInput <= 19, true);
  eq('#3 滚轴鞋无输入', res.skates_noInput, 0);
  eq('#3 滚轴鞋有输入走循环', res.skates_input >= 7 && res.skates_input <= 19, true);
  Object.assign(p, save3);

  // ---------- #2 mountHeldAnchor 表值（Player.cs:50671-50793 原文数字） ----------
  const M = (mtype, us, hs, anim, fish, held) => R.mountHeldAnchor.call(g.renderer, mtype, us, hs, anim, fish, held);
  const yoyoRow = (row) => M(54, 5, 0, true, false, { vid: 3389, bodyRow: row });
  res.yoyo_r2 = yoyoRow(2); res.yoyo_r3 = yoyoRow(3); res.yoyo_r4 = yoyoRow(4);
  eq('#2 悠悠球行2', yoyoRow(2), { dx: 10, dy: -10 });
  eq('#2 悠悠球行3', yoyoRow(3), { dx: 8, dy: 0 });
  eq('#2 悠悠球行4', yoyoRow(4), { dx: 2, dy: 2 });
  res.kite = M(54, 5, 0, true, false, { vid: 4367, bodyRow: 3 });       // 风筝不分动画态
  eq('#2 风筝4367', res.kite, { dx: 4, dy: -4 });
  res.neb_r2 = M(54, 5, 0, true, false, { vid: 3542, bodyRow: 2 });
  res.neb_r3 = M(54, 5, 0, true, false, { vid: 3542, bodyRow: 3 });
  eq('#2 星云烈焰行2', res.neb_r2, { dx: -10, dy: 0 });
  eq('#2 星云烈焰行3', res.neb_r3, { dx: 10, dy: 0 });
  res.us5_plain = M(54, 5, 0, true, false, { vid: 120, bodyRow: 3 });   // 非悠悠球/3542 的 us5
  eq('#2 useStyle5', res.us5_plain, { dx: 4, dy: 0 });
  res.def_r1 = M(54, 1, 0, true, false, { vid: 1, bodyRow: 1 });
  res.def_r2 = M(54, 1, 0, true, false, { vid: 1, bodyRow: 2 });
  res.def_r3 = M(54, 1, 0, true, false, { vid: 1, bodyRow: 3 });
  eq('#2 default行1', res.def_r1, { dx: 1, dy: -1 });
  eq('#2 default行2', res.def_r2, { dx: 4, dy: 2 });
  eq('#2 default行3', res.def_r3, { dx: 2, dy: 0 });
  res.wolf_yoyo = M(52, 5, 0, true, false, { vid: 3389, bodyRow: 3 });  // 狼表无悠悠球特判 → flag(us5) 档
  eq('#2 狼+悠悠球=us5档', res.wolf_yoyo, { dx: 4, dy: -4 });
  res.wolf_yoyo_static = M(52, null, 0, false, false, { vid: 3389 });   // 狼静持悠悠球（holdStyle0）无偏移
  eq('#2 狼静持悠悠球无偏移', res.wolf_yoyo_static, { dx: 0, dy: 0, resetX: 14, resetY: 12 });

  // ---------- #2 端到端：drawUseItem 真路径（迅猛龙+悠悠球）像素差分 ----------
  const { ITEM_DEFS } = await import('/src/data/items');
  const yoyoItem = ITEM_DEFS.findIndex((d) => /^vi_3389_/.test(d?.key ?? ''));
  res.yoyoItemId = yoyoItem;
  if (yoyoItem >= 0) {
    // ridingMount 是只读 getter（= mount.active && !isCart）→ 改写 mount 三字段
    const save2 = { mActive: p.mount.active, mType: p.mount.type, mCart: p.mount.isCart, facing: p.facing, gravDir: p.gravDir };
    p.mount.active = true; p.mount.type = 54; p.mount.isCart = false; p.facing = 1; p.gravDir = 1;
    const cv = document.createElement('canvas'); cv.width = 360; cv.height = 300;
    const c2 = cv.getContext('2d');
    const spyArgs = [];
    const orig = R.mountHeldAnchor;
    R.mountHeldAnchor = function (...a) { spyArgs.push(a.slice(0, 6)); return orig.apply(this, a); };
    // 质心成像（含贴图懒加载重试）：行2(aim-1.2) vs 行3(aim0)，锚差 (10,-10)vs(8,0)
    const snap = async (aim) => {
      for (let k = 0; k < 12; k++) {
        c2.clearRect(0, 0, cv.width, cv.height);
        R.drawUseItem.call(g.renderer, c2, p, { t: 30, dur: 60, item: yoyoItem, useStyle: 5, aim }, null);
        const d = c2.getImageData(0, 0, cv.width, cv.height).data;
        let sx = 0, sy = 0, n = 0;
        for (let y = 0; y < cv.height; y++) for (let x = 0; x < cv.width; x++) {
          const a = d[(y * cv.width + x) * 4 + 3];
          if (a > 8) { sx += x; sy += y; n++; }
        }
        if (n > 40) return { cx: sx / n, cy: sy / n, n };
        await new Promise(r => setTimeout(r, 250));
      }
      return null;
    };
    let a3 = null, a2 = null;
    try { a3 = await snap(0); a2 = await snap(-1.2); }
    finally { R.mountHeldAnchor = orig; }
    p.mount.active = save2.mActive; p.mount.type = save2.mType; p.mount.isCart = save2.mCart;
    p.facing = save2.facing; p.gravDir = save2.gravDir;
    if (a3 && a2) {
      res.pixelDiff = { r3: a3, r2: a2, dx: +(a2.cx - a3.cx).toFixed(2), dy: +(a2.cy - a3.cy).toFixed(2) };
      eq('#2 像素差分dy≈-10', Math.abs(res.pixelDiff.dy + 10) <= 5, true);
      eq('#2 像素差分dx≈+2', Math.abs(res.pixelDiff.dx - 2) <= 6, true);
      res.spyWiring = spyArgs.filter(a => a[0] === 54).map(a => ({ us: a[1], anim: a[3], vid: a[5]?.vid, row: a[5]?.bodyRow }));
      const rowsSeen = new Set(res.spyWiring.map(w => w.row));
      eq('#2 端到端传参含行2/3', rowsSeen.has(2) && rowsSeen.has(3), true);
      eq('#2 端到端vid=3389', res.spyWiring.every(w => w.vid === 3389), true);
    } else { res.fail.push('#2 端到端未成像（贴图未就绪）'); }
  } else { res.fail.push('#2 找不到 vi_3389_ 悠悠球物品'); }

  // ---------- #4 食物手持帧（GetItemDrawFrame :41901-41903 Frame(1,3,0,1)） ----------
  const itemOf = (vid) => ITEM_DEFS.findIndex((d) => new RegExp(`^vi_${vid}_`).test(d?.key ?? ''));
  const bbox = async (vid, useStyle) => {
    const id = itemOf(vid);
    if (id < 0) return null;
    const save4 = { mActive: p.mount.active, mType: p.mount.type, mCart: p.mount.isCart, facing: p.facing, gravDir: p.gravDir };
    p.mount.active = false; p.facing = 1; p.gravDir = 1;
    const cv = document.createElement('canvas'); cv.width = 260; cv.height = 260;
    const c2 = cv.getContext('2d');
    let r = null;
    for (let k = 0; k < 12; k++) {
      c2.clearRect(0, 0, cv.width, cv.height);
      R.drawUseItem.call(g.renderer, c2, p, { t: 30, dur: 60, item: id, useStyle }, null);
      const d = c2.getImageData(0, 0, cv.width, cv.height).data;
      let x0 = 1e9, x1 = -1, y0 = 1e9, y1 = -1, n = 0;
      for (let y = 0; y < cv.height; y++) for (let x = 0; x < cv.width; x++) {
        if (d[(y * cv.width + x) * 4 + 3] > 8) { n++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      }
      if (n > 4) { r = { w: x1 - x0 + 1, h: y1 - y0 + 1, n }; break; }
      void d;
      await new Promise(rr => setTimeout(rr, 250));
    }
    p.mount.active = save4.mActive; p.mount.type = save4.mType; p.mount.isCart = save4.mCart;
    p.facing = save4.facing; p.gravDir = save4.gravDir;
    return r;
  };
  res.food969_us2 = await bbox(969, 2);    // 12×51 竖3条 → 第2行 12×17
  res.food353_us9 = await bbox(353, 9);    // 18×60 竖3条 → 第2行 18×20
  res.mm968_us1 = await bbox(968, 1);      // 32×10 单帧整图
  eq('#4 熟棉花糖969=12×17', res.food969_us2 && res.food969_us2.w === 12 && res.food969_us2.h === 17, true);
  eq('#4 麦酒353=18×20', res.food353_us9 && res.food353_us9.w === 18 && res.food353_us9.h === 20, true);
  eq('#4 棉花糖串968=32×10整图', res.mm968_us1 && res.mm968_us1.w === 32 && res.mm968_us1.h === 10, true);
  res.foodHeldFrame = (() => {   // 静态助手直检：969 原条 12×51 → 行1 12×17
    const raw = g.renderer.atlas.vicon(969);
    if (!raw) return null;
    const f = K.foodHeldFrame(raw, raw);
    return { rawH: raw.sh, got: [f.sw, f.sh], syShift: f.sy - raw.sy };
  })();
  eq('#4 foodHeldFrame(969)行1', res.foodHeldFrame && res.foodHeldFrame.got[0] === 12 && res.foodHeldFrame.got[1] === 17 && res.foodHeldFrame.syShift === 17, true);

  res.pass = res.fail.length === 0;
  return res;
}, { timeout: 120000 }).catch(e => ({ crash: String(e), stack: e.stack?.slice(0, 600) }));

console.log(JSON.stringify(out, null, 1));
await browser.close();
