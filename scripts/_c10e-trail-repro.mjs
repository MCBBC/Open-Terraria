// C10e 前景拖影复现探针（2026-10-01 用户实报:地形/人物/怪物拖影,仅无背景墙位置,120fps）
// 手段:①强制用户档(frameCap=120+subtle)②走路驱动相机连续平移③GL 侧账目仪
//      (clearScreenForStack 计数/world FBO begin(clear) 序/accOpen 态/屏栈长)④连拍截图
import { launchBrowser, openPage, bootstrap, createGame } from '../tools/probe/lib/index.mjs';
import { clockSet, clockInfo } from '../tools/probe/lib/clock.mjs';
const NIGHT = process.env.TRAIL_NIGHT === '1';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5204';
const MODE = process.env.TRAIL_MODE || 'c10e';   // c10e | base
const flag = MODE === 'c10e' ? '/?c10e=1&' : '/?c10e=0&';   // ★gotoApp 拼 /?t= 后缀——query 须以 & 收尾防值被胶连
const browser = await launchBrowser({});
const errs = [];
const page = await openPage(browser, {});
page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message.slice(0, 200)));
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 200)); });
await bootstrap(page, ORIGIN + '/' + flag);
const gen = await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 20260925 });
const c10eOn = await page.evaluate(() => !!window.__swGame.renderer.constructor.c10e);
if (MODE === 'c10e' && !c10eOn) { console.log('FATAL: c10e flag not engaged, url=', await page.url()); process.exit(2); }
console.log('createGame:', !!gen?.ok, 'c10eOn:', c10eOn);
if (NIGHT) { await clockSet(page, 0.05); console.log('clock:', JSON.stringify(await clockInfo(page))); }

// 用户档:frameCap=120 钳在 beat.observeVsync 入参（options 单例无页桥,IDB 权威
//  预置不可靠——判例 zsh 内联 env;frameSkipMode 缺省已 subtle）;GL 侧账目仪挂装
await page.evaluate(() => {
  const g = window.__swGame;
  const beat = g.beat;
  if (beat && !beat.__capPin) {
    beat.__capPin = 1;
    const orig = beat.observeVsync.bind(beat);
    beat.observeVsync = (now, cap) => orig(now, 120);
  }
  const r = g.renderer;
  window.__inst = { clears: 0, presents: 0, overPresents: 0, begins: [], accEnds: 0, restacks: 0 };
  const I = window.__inst;
  const wrap = (obj, name, fn) => {
    const orig = obj[name].bind(obj);
    obj[name] = (...a) => { fn(a); return orig(...a); };
  };
  const arm = () => {
    if (r.swPipe && !r.swPipe.__w) {
      r.swPipe.__w = 1;
      const p = r.swPipe;
      wrap(p, 'clearScreenForStack', () => I.clears++);
      wrap(p, 'present', (a) => { I.presents++; if (a[1]) I.overPresents++; });
      wrap(p, 'restackScreen', () => I.restacks++);
    }
    if (r._accGlw && !r._accGlw.__w) {
      r._accGlw.__w = 1;
      const glw = r._accGlw;
      wrap(glw, 'begin', (a) => I.begins.push(a.join(',')));
      wrap(glw, 'endAccumulate', () => I.accEnds++);
    }
  };
  window.__probe = () => {
    const r2 = window.__swGame.renderer;
    arm();
    const p = r2.swPipe;
    return {
      c10e: r2._c10eFrame, inter: r2._c10eWorldToHud, acc: r2._accMode,
      accOpen: r2._accGlw ? r2._accGlw.isAccumOpen('world') : null,
      stackLen: p ? p.screenStack.length : null, stackMode: p ? p.screenStackMode : null,
      clears: I.clears, presents: I.presents, overs: I.overPresents, restacks: I.restacks,
      accEnds: I.accEnds, begins: I.begins.splice(0, I.begins.length),
      k: window.__swGame.beat ? window.__swGame.beat.k : null,
      cam: Math.round(window.__swGame.camera.x),
      fps: (() => { const b = window.__swGame.beat; return b ? Math.round(1000 / (b.costP50() || 1)) : 0; })(),
    };
  };
  window.__probe();
});

// 走路驱动相机:按住 D(右)走 12s,期间每 2s 采样+截图
const samples = [];
await page.keyboard.down('KeyD');
for (let t = 1; t <= 6; t++) {
  await new Promise((r) => setTimeout(r, 2000));
  const s = await page.evaluate(() => window.__probe());
  samples.push(`t=${t * 2}s ${JSON.stringify(s)}`);
  await page.screenshot({ path: `shots/c10e-trail/${MODE}-t${t * 2}s.png` });
}
await page.keyboard.up('KeyD');
console.log(samples.join('\n'));
// 停走后再采样两拍(拖影若存在,站定后仍应可见)
await new Promise((r) => setTimeout(r, 1500));
console.log('post-move', JSON.stringify(await page.evaluate(() => window.__probe())));
await page.screenshot({ path: `shots/c10e-trail/${MODE}-post.png` });
console.log('errs:', errs.slice(0, 6));
process.exit(0);
