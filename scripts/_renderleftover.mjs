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
  const save3 = { vx: p.vx, vy: p.vy, onGround: p.onGround, floorTileT: p.floorTileT, inputX: p.inputX, animTime: p.animTime, swimTime: p.swimTime, mType: p.mount.type };
  const legs3 = (o) => {
    if (o.mountType !== undefined) p.mount.type = o.mountType;   // mtype 取自 p.mount.type（:6641）
    return R.playerFrameRows.call(g.renderer, Object.assign(p, {
      vy: 0, onGround: true, swimTime: 0, animTime: 12, vx: 2.4, inputX: 0, floorTileT: -1,
    }, o), null, 0, o.mnt ?? null, null, 0).legs;
  };
  res.ice_noInput = legs3({ floorTileT: 161, inputX: 0 });              // 期望 0
  res.ice197_noInput = legs3({ floorTileT: 197, inputX: 0 });           // slippy2 冻史莱姆块 期望 0
  res.ice_input = legs3({ floorTileT: 161, inputX: 1 });                // 有输入 → 行走循环 7..19
  res.ground_noInput = legs3({ floorTileT: -1, inputX: 0 });            // 普通地面无输入（击退余速）→ 原版走循环
  // mtype 取自 p.mount.type（:6641），滚轴鞋用例须连 p.mount.type 一起置 57
  res.skates_noInput = legs3({ mnt: { type: 57 }, inputX: 0, mountType: 57 });
  res.skates_input = legs3({ mnt: { type: 57 }, inputX: 1, vx: 4, mountType: 57 });
  p.mount.type = save3.mType;
  eq('#3 冰161无输入', res.ice_noInput, 0);
  eq('#3 冻197无输入', res.ice197_noInput, 0);
  eq('#3 冰有输入走循环', res.ice_input >= 7 && res.ice_input <= 19, true);
  eq('#3 普地无输入走循环', res.ground_noInput >= 7 && res.ground_noInput <= 19, true);
  eq('#3 滚轴鞋无输入', res.skates_noInput, 0);
  eq('#3 滚轴鞋有输入走循环', res.skates_input >= 7 && res.skates_input <= 19, true);
  Object.assign(p, save3); p.mount.type = save3.mType;

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
    const cv = document.createElement('canvas'); cv.width = 1280; cv.height = 800;
    const c2 = cv.getContext('2d');
    const spyArgs = [];
    const orig = R.mountHeldAnchor;
    R.mountHeldAnchor = function (...a) { spyArgs.push(a.slice(0, 6)); return orig.apply(this, a); };
    // 质心成像（含贴图懒加载重试）：行2(aim-1.2) vs 行3(aim0)，锚差 (10,-10)vs(8,0)
    // 锚点/帧源矩形间谍：drawUseItem 的锚=drawImage 前最后一个 translate（旋转前、
    // 无质心污染）；帧规格=drawImage 源矩形 (sx,sy,sw,sh)——透明边/旋转均不影响
    const cam = g.camera, zm = cam.zoom ?? 1;
    const applyCam = () => c2.setTransform(zm, 0, 0, zm, cv.width / 2 - cam.x * zm, cv.height / 2 - cam.y * zm);
    const bag = { draws: [], translates: [] };
    const od = c2.drawImage.bind(c2), ot = c2.translate.bind(c2);
    c2.drawImage = function (img, sx, sy, sw, sh, ...rest) { bag.draws.push([sx, sy, sw, sh]); return od(img, sx, sy, sw, sh, ...rest); };
    c2.translate = function (x, y) { bag.translates.push([x, y]); return ot(x, y); };
    const snap = async (aim) => {
      for (let k = 0; k < 12; k++) {
        bag.draws.length = 0; bag.translates.length = 0;
        c2.setTransform(1, 0, 0, 1, 0, 0); c2.clearRect(0, 0, cv.width, cv.height); applyCam();
        R.drawUseItem.call(g.renderer, c2, p, { t: 30, dur: 60, item: yoyoItem, useStyle: 5, aim }, null);
        if (bag.draws.length) return { anchor: bag.translates[bag.translates.length - 1], src: bag.draws[bag.draws.length - 1] };
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
      res.zoom = zm;
      res.e2e = { r3: a3, r2: a2 };
      // us5 基锚 offX=−2（:50387）→ 行3 offX=−2+8=6、行2 offX=−2+10=8 → Δ=(+2,−10) 整像素
      const o3 = { x: a3.anchor[0] - p.cx, y: a3.anchor[1] - p.y };
      const o2 = { x: a2.anchor[0] - p.cx, y: a2.anchor[1] - p.y };
      res.anchorOff = { r3: [+o3.x.toFixed(2), +o3.y.toFixed(2)], r2: [+o2.x.toFixed(2), +o2.y.toFixed(2)] };
      res.anchorDelta = [+(o2.x - o3.x).toFixed(2), +(o2.y - o3.y).toFixed(2)];
      eq('#2 端到端锚差Δ=(2,-10)', res.anchorDelta, [2, -10]);
      res.spyWiring = spyArgs.filter(a => a[0] === 54).map(a => ({ us: a[1], anim: a[3], vid: a[5]?.vid, row: a[5]?.bodyRow }));
      const rowsSeen = new Set(res.spyWiring.map(w => w.row));
      eq('#2 端到端传参含行2/3', rowsSeen.has(2) && rowsSeen.has(3), true);
      eq('#2 端到端vid=3389', res.spyWiring.every(w => w.vid === 3389), true);
    } else { res.fail.push('#2 端到端未成像（贴图未就绪）'); }
  } else { res.fail.push('#2 找不到 vi_3389_ 悠悠球物品'); }

  // ---------- #4 食物手持帧（GetItemDrawFrame :41901-41903 Frame(1,3,0,1)） ----------
  const itemOf = (vid) => ITEM_DEFS.findIndex((d) => new RegExp(`^vi_${vid}_`).test(d?.key ?? ''));
  // 帧规格取 drawImage 源矩形（透明边/旋转无污染）：969→竖3条第2行 12×17、
  // 353→18×20、968→32×10 整图（GetItemDrawFrame :41901-41903 / GetDrawHitbox :49200）
  const srcOf = async (vid, useStyle) => {
    const id = itemOf(vid);
    if (id < 0) return null;
    const save4 = { mActive: p.mount.active, mType: p.mount.type, mCart: p.mount.isCart, facing: p.facing, gravDir: p.gravDir };
    p.mount.active = false; p.facing = 1; p.gravDir = 1;
    const cv = document.createElement('canvas'); cv.width = 1280; cv.height = 800;
    const c2 = cv.getContext('2d');
    const cam = g.camera, zm = cam.zoom ?? 1;
    const bag = { draws: [] };
    const od = c2.drawImage.bind(c2);
    c2.drawImage = function (img, sx, sy, sw, sh, ...rest) { bag.draws.push([sx, sy, sw, sh]); return od(img, sx, sy, sw, sh, ...rest); };
    let r = null;
    for (let k = 0; k < 12; k++) {
      bag.draws.length = 0;
      c2.setTransform(1, 0, 0, 1, 0, 0); c2.clearRect(0, 0, cv.width, cv.height);
      c2.setTransform(zm, 0, 0, zm, cv.width / 2 - cam.x * zm, cv.height / 2 - cam.y * zm);
      R.drawUseItem.call(g.renderer, c2, p, { t: 30, dur: 60, item: id, useStyle }, null);
      if (bag.draws.length) { r = bag.draws[bag.draws.length - 1]; break; }
      await new Promise(rr => setTimeout(rr, 250));
    }
    p.mount.active = save4.mActive; p.mount.type = save4.mType; p.mount.isCart = save4.mCart;
    p.facing = save4.facing; p.gravDir = save4.gravDir;
    const raw = g.renderer.atlas.vicon(vid);
    return { src: r, raw: raw ? [raw.sx, raw.sy, raw.sw, raw.sh] : null };
  };
  res.food969_us2 = await srcOf(969, 2);
  res.food353_us9 = await srcOf(353, 9);
  res.mm968_us1 = await srcOf(968, 1);
  eq('#4 熟棉花糖969源=第2行12×17', res.food969_us2 && res.food969_us2.src
    && res.food969_us2.src[2] === 12 && res.food969_us2.src[3] === 17
    && res.food969_us2.src[1] - res.food969_us2.raw[1] === 17, true);
  eq('#4 麦酒353源=第2行18×20', res.food353_us9 && res.food353_us9.src
    && res.food353_us9.src[2] === 18 && res.food353_us9.src[3] === 20
    && res.food353_us9.src[1] - res.food353_us9.raw[1] === 20, true);
  eq('#4 棉花糖串968源=整图32×10', res.mm968_us1 && res.mm968_us1.src
    && res.mm968_us1.src[2] === 32 && res.mm968_us1.src[3] === 10
    && res.mm968_us1.src[1] - res.mm968_us1.raw[1] === 0, true);
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
