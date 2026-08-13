// 移动端适配探针（触摸仿真）：
//   ① 触屏设备 → .sw-mobile 控件层渲染
//   ② 摇杆注入 touchKeys（KeyD）→ player.inputX==1
//   ③ 跳跃键 → touchKeys Space
//   ④ 攻击键 → mouseDown 边沿/Held 电平；松开归零
//   ⑤ 智能光标键 → ControlLeft 电平（Toggle 模式点击翻转 wanted）
//   ⑥ 世界触摸：touchstart→mouseDown+光标定位；长按 400ms→rightDown 脉冲
//   ⑦ 药水键：无药水隐藏；入包 1s 后出现；点击直饮（useTime=60 且消耗）
//   ⑧ 钩爪键：装备钩爪显示；点击发射 activeGrapple≠null；再点收回
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true,
  args: ['--no-sandbox', '--touch-events'],
  defaultViewport: { width: 914, height: 412, hasTouch: true, isMobile: true },
});
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
await page.goto('' + (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '', { waitUntil: 'domcontentloaded' });
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
  await page.keyboard.type('移动测试');
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
  const res = { steps: [] };
  const ok = (name, cond, extra) => { res.steps.push({ name, pass: !!cond, extra }); return !!cond; };
    const waitUntil = async (fn, ms = 1000) => {
      const t0 = performance.now();
      while (!fn() && performance.now() - t0 < ms) await new Promise(r => setTimeout(r, 30));
      return fn();
    };
  const rect = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  };

  // ① 控件层
  ok('① 触屏设备控件层渲染', !!document.querySelector('.sw-mobile'));
  // ⑨ 视觉缩放：小地图 0.7（240→≈171）+ 控件缩小（摇杆 118/攻击 72）
  await new Promise(r => setTimeout(r, 300));
  ok('⑨ 小地图缩小 0.7', g.renderer.minimapRect.w < 200 && g.renderer.minimapRect.w > 150,
    `w=${g.renderer.minimapRect.w.toFixed(0)}`);
  const joyW = document.querySelector('.sw-mjoy').getBoundingClientRect().width;
  const atkW = document.querySelector('.sw-matk').getBoundingClientRect().width;
  ok('⑨ 摇杆 118px', Math.abs(joyW - 118) <= 3, joyW);
  ok('⑨ 攻击键 72px', Math.abs(atkW - 72) <= 3, atkW);
  ok('① 摇杆/跳跃/攻击/光标/全屏 存在',
    !!document.querySelector('.sw-mjoy') && !!document.querySelector('.sw-mjump')
    && !!document.querySelector('.sw-matk') && !!document.querySelector('.sw-msmart')
    && !!document.querySelector('.sw-mfs'));

  // ② 摇杆（向右推 → KeyD → inputX）
  const joy = rect('.sw-mjoy');
  if (joy) {
    g.input.touchKeys.clear();
    const cdp = { a: 1 };
    // 摇杆右推（中心 +60px）——派发到摇杆元素自身（其监听在 .sw-mjoy 上）
    const joyEl = document.querySelector('.sw-mjoy');
    const fireJoy = (type, x, y) => {
      const t = new Touch({ identifier: 1, target: joyEl, clientX: x, clientY: y });
      joyEl.dispatchEvent(new TouchEvent(type, { changedTouches: [t], touches: type === 'touchend' ? [] : [t], bubbles: true, cancelable: true }));
    };
    fireJoy('touchstart', joy.x, joy.y);
    fireJoy('touchmove', joy.x + 60, joy.y);
    ok('② 摇杆右推注入 KeyD', g.input.touchKeys.has('KeyD'), [...g.input.touchKeys]);
    await new Promise(r => setTimeout(r, 100));
    ok('② inputX==1', g.player.inputX === 1, g.player.inputX);
    fireJoy('touchend', joy.x + 60, joy.y);
    ok('② 松杆清键', !g.input.touchKeys.has('KeyD'));

    // ③ 跳跃键
    const jb = rect('.sw-mjump');
    const fireBtn = (sel, type, x, y) => {
      const t = new Touch({ identifier: 2, target: document.querySelector(sel), clientX: x, clientY: y });
      document.querySelector(sel).dispatchEvent(new TouchEvent(type, { changedTouches: [t], touches: type === 'touchend' ? [] : [t], bubbles: true, cancelable: true }));
    };
    fireBtn('.sw-mjump', 'touchstart', jb.x, jb.y);
    ok('③ 跳跃键注入 Space', g.input.touchKeys.has('Space'));
    fireBtn('.sw-mjump', 'touchend', jb.x, jb.y);
    ok('③ 松开清 Space', !g.input.touchKeys.has('Space'));

    // ④ 攻击键
    const ab = rect('.sw-matk');
    fireBtn('.sw-matk', 'touchstart', ab.x, ab.y);
    ok('④ 攻击按下 mouseDown/Held', g.input.mouseDown && g.input.mouseHeld);
    fireBtn('.sw-matk', 'touchend', ab.x, ab.y);
    ok('④ 攻击松开归零', !g.input.mouseDown && !g.input.mouseHeld);

    // ⑤ 智能光标（Toggle 模式：一次点击边沿翻转 wanted）
    const sb = rect('.sw-msmart');
    fireBtn('.sw-msmart', 'touchstart', sb.x, sb.y);
    fireBtn('.sw-msmart', 'touchend', sb.x, sb.y);   // 同步脉冲：不依赖 tick 窗口
    const wantedAfterTap = g.smartCursor.wanted;
    await waitUntil(() => !g.smartCursor.prevSmart);
    fireBtn('.sw-msmart', 'touchstart', sb.x, sb.y);
    fireBtn('.sw-msmart', 'touchend', sb.x, sb.y);
    await waitUntil(() => !g.smartCursor.prevSmart);
    ok('⑤ 智能光标 Toggle 翻转', wantedAfterTap === !g.smartCursor.wanted, `${wantedAfterTap}→${g.smartCursor.wanted}`);

    // ⑥ 世界触摸：canvas touchstart → mouseDown + 光标；长按 → rightDown
    const canvas = g.renderer.canvas;
    const cr = canvas.getBoundingClientRect();
    g.input.uiBlocking = false;
    const fireWorld = (type, x, y) => {
      const t = new Touch({ identifier: 3, target: canvas, clientX: x, clientY: y });
      canvas.dispatchEvent(new TouchEvent(type, { changedTouches: [t], touches: type === 'touchend' ? [] : [t], bubbles: true, cancelable: true }));
    };
    fireWorld('touchstart', cr.left + 500, cr.top + 200);
    ok('⑥ 世界触摸=左键按下', g.input.mouseDown === true);
    ok('⑥ 触摸定位光标', Math.abs(g.input.mouseX - 500) < 2 && Math.abs(g.input.mouseY - 200) < 2,
      `${g.input.mouseX},${g.input.mouseY}`);
    await new Promise(r => setTimeout(r, 450));   // 长按
    ok('⑥ 长按 400ms=右键交互脉冲', g.input.rightDown === true);
    fireWorld('touchend', cr.left + 500, cr.top + 200);
    ok('⑥ 抬起全部归零', !g.input.mouseDown && !g.input.mouseHeld && !g.input.rightDown);

    // ⑦ 药水键：先隐藏（新手无药水）→ 入包 → 1s 后显示 → 点击直饮
    const potBtn = document.querySelector('.sw-mpot');
    const hiddenBefore = potBtn.style.display === 'none';
    const potKey = Object.keys(window.__swItems).find(k => k === 'vi_188_healing_potion');
    const potId = window.__swItems[potKey];
    g.player.inv.slots[20] = { id: potId, stack: 3 };
    res.steps.push({ name: '⑦ 装入调试', pass: true, extra: `key=${potKey} id=${potId} set=${g.player.inv.slots[20]?.id}` });
    await new Promise(r => setTimeout(r, 1200));
    const shownAfter = document.querySelector('.sw-mpot').style.display !== 'none';
    ok('⑦ 无药水隐藏', hiddenBefore);
    ok('⑦ 药水入包后亮起', shownAfter);
    g.player.useTime = 0;
    const pb = rect('.sw-mpot');
    fireBtn('.sw-mpot', 'touchstart', pb.x, pb.y);
    fireBtn('.sw-mpot', 'touchend', pb.x, pb.y);
    await new Promise(r => setTimeout(r, 100));
    const slot20 = g.player.inv.slots[20];
    const drank = g.player.useTime > 0 && slot20 && slot20.stack === 2;
    ok('⑦ 快捷直饮（CD+消耗）', drank, `useTime=${g.player.useTime} stack=${slot20?.stack}`);
    if (!drank) {
      // 容错排查：可能被更早槽位的药水抢先（列出全部治疗药水槽）
      const pots = [];
      g.player.inv.slots.forEach((sl, i) => { if (sl) pots.push(`${i}:${sl.id}x${sl.stack}`); });
      res.steps.push({ name: '⑦ 调试', pass: true, extra: pots.join(' ') });
    }

    // ⑧ 钩爪键：装备钩爪 → 显示 → 发射 → 再按（原版单钩族 quickMax=1：
    //    在飞拒发/已锚换发，存活恒 ≤1）→ 跳键释放（原版 GrappleMovement :22463-22480）
    const hookKey = Object.keys(window.__swItems).find(k => k.startsWith('vi_84_'))
      ?? Object.keys(window.__swItems).find(k => /_84_grappling/.test(k));
    g.player.inv.miscEquips[4] = { id: window.__swItems[hookKey], stack: 1 };
    await new Promise(r => setTimeout(r, 1200));
    const grapShown = document.querySelector('.sw-mgrap').style.display !== 'none';
    ok('⑧ 装备钩爪显示按钮', grapShown);
    const gb = rect('.sw-mgrap');
    fireBtn('.sw-mgrap', 'touchstart', gb.x, gb.y);
    fireBtn('.sw-mgrap', 'touchend', gb.x, gb.y);
    await new Promise(r => setTimeout(r, 100));
    // 飞行中的钩不进 grappleProjs（登记在挂墙时）——查弹桶
    const fired = g.entities.projectiles.some((e) => e.constructor.name === 'GrappleProj' && !e.dead);
    ok('⑧ 点击发射钩爪', fired);
    await new Promise(r => setTimeout(r, 500));          // 飞行/挂墙窗口
    fireBtn('.sw-mgrap', 'touchstart', gb.x, gb.y);
    fireBtn('.sw-mgrap', 'touchend', gb.x, gb.y);
    await new Promise(r => setTimeout(r, 150));
    const liveCount = g.entities.projectiles.filter((e) => e.constructor.name === 'GrappleProj' && !e.dead).length; // 弹桶为准（挂墙钩同时在两表，勿相加）
    ok('⑧ 再按存活 ≤1（quickMax=1 门）', liveCount <= 1, `live=${liveCount}`);
    // 跳键释放（原版语义——无收回键）
    g.input.touchKeys.add('Space');
    await new Promise(r => setTimeout(r, 150));
    g.input.touchKeys.delete('Space');
    await new Promise(r => setTimeout(r, 1500));
    const latched = g.player.grappleProjs.some((gp) => !gp.dead && gp.ai0 === 2);
    ok('⑧ 跳键释放锚定钩', !latched);

    // ⑩ 宠物系统：装备胡萝卜(603→兔子 proj111) → 跟随体生成；坐骑/宠物键
    //    召回/再召（TogglePet hideMisc 翻转）
    const carrotKey = Object.keys(window.__swItems).find(k => /^vi_603_/.test(k));
    g.player.inv.miscEquips[0] = { id: window.__swItems[carrotKey], stack: 1 };
    await new Promise(r => setTimeout(r, 400));
    ok('⑩ 装备宠物→跟随体生成', !!g.petFollower && !g.petFollower.dead && g.petFollower.projId === 111,
      `proj=${g.petFollower?.projId}`);
    await new Promise(r => setTimeout(r, 500));
    const following = g.petFollower && Math.hypot(g.petFollower.x - g.player.x, g.petFollower.y - g.player.y) < 120;
    ok('⑩ 跟随玩家', !!following, `d=${g.petFollower ? Math.hypot(g.petFollower.x - g.player.x, g.petFollower.y - g.player.y).toFixed(0) : 'x'}`);
    const rb2 = rect('.sw-mride');
    fireBtn('.sw-mride', 'touchstart', rb2.x, rb2.y);
    fireBtn('.sw-mride', 'touchend', rb2.x, rb2.y);
    await new Promise(r => setTimeout(r, 300));
    ok('⑩ 宠物键收回（hideMisc）', g.petHidden === true && (!g.petFollower || g.petFollower.dead));
    fireBtn('.sw-mride', 'touchstart', rb2.x, rb2.y);
    fireBtn('.sw-mride', 'touchend', rb2.x, rb2.y);
    await new Promise(r => setTimeout(r, 300));
    ok('⑩ 再按重新召唤', g.petHidden === false && !!g.petFollower && !g.petFollower.dead);
    g.player.inv.miscEquips[0] = null;   // 卸装 → 消散
    await new Promise(r => setTimeout(r, 300));
    ok('⑩ 卸装消散', g.petFollower === null);
  }
  return res;
});
console.log(JSON.stringify(out, null, 1));
const failed = out.steps.filter(s => !s.pass);
console.log(failed.length ? `✗ ${failed.length} 项未过：${failed.map(f => f.name).join(' | ')}` : '✓ 全部通过');
if (errs.length) console.log('页面错误:', errs.slice(0, 5));
await browser.close();
process.exit(failed.length || errs.length ? 1 : 0);
