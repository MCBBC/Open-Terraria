// ★幕布期两修复刃·序列探针（2026-09-29）：进世界加载幕布期逐拍采样+关键帧截图。
//   验收面（用户双报）：
//   ① 「正在渲染世界…」步骤文字挂 VUI 加载页步骤行（__swGenUi.header.text）,
//      不再出现 .sw-progress 全屏 DOM 遮罩（domProgress 恒 null）;
//   ② 幕布期热键栏/Shift 提示不穿透（.sw-root 挂 sw-hud-suppressed 类,
//      hotbar 计算样式 visibility=hidden）;掀幕瞬间摘类=UI 同帧出现;
//   ③ wbake=0 对照：无冻结窗/无抑制类/无 DOM 遮罩/步骤行保持读档文案=零变化。
//   关键帧截图（形态中立判定,修前/修后同判）：gen=生成页稳定后 / freeze=冻结窗
//   首拍（entryFreezeActive 翻真）/ ingame=menuBg 幕布画布移除且 hotbar 可见。
//   产物：/tmp/curtain-hud-out/{seq-report-<tag>.json, <tag>-{gen,freeze,ingame}.png}
//   跑法：SW_ORIGIN=http://localhost:5264 [RUN0=1] [PROBE_TAG=after] \
//         node tools/run-diag.mjs scripts/_curtain-hud-seq.mjs
import puppeteer from 'puppeteer-core';
import { mkdirSync, writeFileSync } from 'node:fs';

const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5264';
const OUT = '/tmp/curtain-hud-out';
const TAG = process.env.PROBE_TAG ?? 'after';
const RUN0 = process.env.RUN0 === '1';   // wbake=0 对照序列（修后默认跑;修前可跳）
mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 600000,
});
const page = await browser.newPage();
const errs = [];
page.on('console', (m) => { const t = m.text(); if (/error|ERROR|缺失/.test(t)) errs.push(t.slice(0, 160)); });
page.on('pageerror', (e) => errs.push('PAGE:' + String(e).slice(0, 200)));

/** 单次进世界序列：中世界拉长烘焙窗;60ms 采样抓冻结窗关键帧 */
async function runSequence(tag, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => typeof window.__swFlow === 'object' && !!window.__swFlow?.createWorldProbe, { timeout: 180000 });
  const report = { tag, samples: [], shots: {}, errs: [] };
  // 【不 await】——createWorldFlow 返回在生成完之后,采样须从生成期就开始
  await page.evaluate(() => {
    void window.__swFlow.createWorldProbe({ seed: '424242', size: 1, name: '幕布序列' })?.catch?.((e) => { globalThis.__swProbeErr = String(e).slice(0, 200); });
  });
  const t0 = Date.now();
  let shotGen = false, shotFreeze = false, shotIngame = false, freezeOpenAt = -1, freezeCloseAt = -1, liftAt = -1;
  while (Date.now() - t0 < 240000) {
    const s = await page.evaluate(() => {
      const g = globalThis.__swGame ?? null;
      const ui = globalThis.__swGenUi ?? null;
      const root = document.querySelector('.sw-root');
      const hb = document.querySelector('.sw-hotbar');
      const domProg = document.querySelector('.sw-progress');
      return {
        inGame: !!g?.world,
        freeze: g ? !!g.entryFreezeActive : null,
        genHeaderText: ui ? ui.header.text : null,
        domProgressExists: !!domProg,
        domProgressText: domProg ? (domProg.children[0]?.textContent ?? null) : null,
        hudSuppressed: root ? root.classList.contains('sw-hud-suppressed') : null,
        hotbarVisibility: hb ? getComputedStyle(hb).visibility : null,
        menuBgGone: (() => {
          // 菜单幕布=MenuBackground 画布（insertBefore 恒为 #game-root 首子元素,
          // cssText z-index:0）——stopMenu 后首子=无内联 z 的游戏画布=幕布已撤
          const fc = document.getElementById('game-root')?.firstElementChild;
          return !(fc && fc.tagName === 'CANVAS' && fc.style.zIndex === '0');
        })(),
      };
    }).catch(() => null);
    if (s) {
      s.t = (Date.now() - t0) / 1000;
      report.samples.push(s);
      // 关键帧截图（形态中立）：
      if (!shotGen && s.genHeaderText && !s.inGame && s.t > 1.5) {
        await page.screenshot({ path: `${OUT}/${tag}-gen.png` }).catch(() => {});
        shotGen = true; report.shots.gen = s.t;
      }
      if (!shotFreeze && s.freeze === true) {   // 冻结窗首拍（修后此帧应=无遮罩+HUD 隐藏+步骤行已接管）
        freezeOpenAt = s.t;
        await page.screenshot({ path: `${OUT}/${tag}-freeze.png` }).catch(() => {});
        shotFreeze = true; report.shots.freeze = s.t;
      }
      if (!shotIngame && s.inGame && s.freeze === false && s.menuBgGone && s.hotbarVisibility === 'visible') {
        liftAt = s.t;
        await page.screenshot({ path: `${OUT}/${tag}-ingame.png` }).catch(() => {});
        shotIngame = true; report.shots.ingame = s.t;
      }
    }
    if (shotIngame && liftAt >= 0 && Date.now() - t0 > (liftAt + 1) * 1000) break;
    if (!shotIngame && Date.now() - t0 > 210000) break;   // 掀幕未现(异常)——防死等
    await new Promise((r) => setTimeout(r, 60));
  }
  report.errs = errs.splice(0);
  report.freezeOpenAt = freezeOpenAt;
  report.freezeCloseAt = freezeCloseAt;
  report.liftAt = liftAt;
  // 冻结窗代表样本（首/中/末）+ 掀幕代表样本
  const frz = report.samples.filter((x) => x.freeze === true);
  report.freezeWindow = frz.length ? { first: frz[0], mid: frz[Math.floor(frz.length / 2)], last: frz[frz.length - 1], n: frz.length } : null;
  report.afterLift = report.samples.filter((x) => x.inGame && x.freeze === false && liftAt >= 0 && x.t >= liftAt)[0] ?? null;
  writeFileSync(`${OUT}/seq-report-${tag}.json`, JSON.stringify(report, null, 2));
  return report;
}

const wbake1 = await runSequence(`${TAG}-wbake1`, ORIGIN);
console.log('WBAKE1', JSON.stringify({
  freeze: wbake1.freezeWindow && {
    header: wbake1.freezeWindow.last.genHeaderText,
    domProgress: wbake1.freezeWindow.last.domProgressExists,
    domProgressText: wbake1.freezeWindow.last.domProgressText,
    suppressed: wbake1.freezeWindow.last.hudSuppressed,
    hotbar: wbake1.freezeWindow.last.hotbarVisibility,
    n: wbake1.freezeWindow.n,
  },
  afterLift: wbake1.afterLift && { suppressed: wbake1.afterLift.hudSuppressed, hotbar: wbake1.afterLift.hotbarVisibility, inGame: wbake1.afterLift.inGame, menuBgGone: wbake1.afterLift.menuBgGone },
  shots: wbake1.shots, errs: wbake1.errs.slice(0, 3),
}));

if (RUN0) {
  const wbake0 = await runSequence(`${TAG}-wbake0`, `${ORIGIN}/?wbake=0`);
  console.log('WBAKE0', JSON.stringify({
    freezeEver: wbake0.samples.some((x) => x.freeze === true),
    domProgressEver: wbake0.samples.some((x) => x.domProgressExists),
    suppressedEver: wbake0.samples.some((x) => x.hudSuppressed === true),
    lastGenHeader: [...new Set(wbake0.samples.filter((x) => !x.inGame && x.genHeaderText).map((x) => x.genHeaderText))].slice(-2),
    afterLift: wbake0.afterLift && { suppressed: wbake0.afterLift.hudSuppressed, hotbar: wbake0.afterLift.hotbarVisibility, inGame: wbake0.afterLift.inGame },
    shots: wbake0.shots, errs: wbake0.errs.slice(0, 3),
  }));
}

await browser.close();
