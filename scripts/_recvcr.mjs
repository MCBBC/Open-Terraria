// 行为录制系统探针：私有 vite(5221) → 进世界 → __swRec.toggle() →
// 模拟按键/挖一格/放一格/杀一只史莱姆 → export() 断言 key/tile/spawn/death/drop
// 事件且 t 单调 → 打印前 20 条。经 tools/run-diag.mjs 运行：
//   SW_ORIGIN=http://localhost:5221 node tools/run-diag.mjs scripts/_recvcr.mjs
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 160)));

let ok2 = null;
for (let att = 0; att < 10 && !ok2; att++) {
  try {
    await page.goto(`${ORIGIN}/?play=small`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    ok2 = 'yes';
  } catch { await new Promise(r => setTimeout(r, 2500)); }
}
if (!ok2) { console.log('GAVE UP: 页面加载失败'); await browser.close(); process.exit(1); }

const result = await page.evaluate(async () => {
  const t0 = Date.now();
  let g = null;
  while ((!g || !g.player || !window.__swRec) && Date.now() - t0 < 120000) {
    g = window.__swGame;   // 世界生成 ~15s 后才挂——循环内重取
    await new Promise(r => setTimeout(r, 500));
  }
  if (!g?.player || !window.__swRec) return { fail: 'game/recorder 未就绪' };
  const rec = window.__swRec;
  const p = g.player;
  const st = g.world.store;
  const TILE = 16;
  const ptx = Math.floor(p.cx / TILE), pty = Math.floor(p.cy / TILE);

  // 1) 开窗
  const recordingOn = rec.toggle();
  if (!recordingOn) return { fail: 'toggle 未开窗' };

  // 2) 模拟按键（Input 监听 window keydown/keyup → recLog('key')）
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyD', bubbles: true }));
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', bubbles: true }));
  window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space', bubbles: true }));
  window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyD', bubbles: true }));
  // 非关键键应被忽略（降噪过滤）
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyQ', bubbles: true }));
  await new Promise(r => setTimeout(r, 150));

  // 3) 挖一格：出生点可能在睡莲/水上——沿玩家列向下扫首个非空格（5.5 格射程内）
  let mined = null;
  for (let dy = 0; dy <= 5 && !mined; dy++) {
    for (const dx of [1, -1, 0, 2, -2]) {
      const x = ptx + dx, y = pty + dy;
      if (!st.inBounds(x, y) || st.get(x, y) === 0) continue;
      g.breakTile(x, y, true);
      mined = [x, y];
      break;
    }
  }
  await new Promise(r => setTimeout(r, 120));

  // 4) 放一格：玩家旁空格 + 下方实心（伪造最小 def：tile 键 'dirt'）。
  //    用刚挖开的坑优先（坑壁邻接/下方都实心）
  let placed = null;
  const cand = [];
  if (mined) cand.push([mined[0], mined[1]], [mined[0], mined[1] - 1]);
  for (const dx of [2, -2, 1, -1, 3, -3]) cand.push([ptx + dx, pty], [ptx + dx, pty + 1]);
  for (const [x, y] of cand) {
    if (!st.inBounds(x, y) || st.get(x, y) !== 0) continue;
    if (!st.inBounds(x, y + 1) || !st.isSolid(x, y + 1)) continue;
    g.tryPlace(x, y, { key: 'probe_item', tile: 'dirt' });
    placed = [x, y, st.get(x, y)];
    break;
  }
  await new Promise(r => setTimeout(r, 120));

  // 5) 杀一只史莱姆：spawnNpcByVanilla(1) → hurt(9999)（death + drop 全链）
  let killed = null;
  const slime = g.spawnNpcByVanilla?.(1, p.cx + 48, p.cy - 32);
  if (slime) {
    await new Promise(r => setTimeout(r, 120));
    const dead = slime.hurt(9999, 3, 0, g);
    killed = { id: slime.id, hurt: dead };
  }
  await new Promise(r => setTimeout(r, 250));

  // 6) 关窗 + 导出
  const recordingOff = rec.toggle();
  const dump = rec.export();

  // 7) F5 两档验证（合成事件非 trusted，不会真刷新）：
  //    短按(<500ms) = 调试报告（behaviorTail 注入）；长按(≥500ms) = 录制窗 toggle
  const f5 = (down) => window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup',
    { code: 'F5', key: 'F5', bubbles: true, cancelable: true }));
  window.__swDebugReport = undefined;
  f5(true); await new Promise(r => setTimeout(r, 120)); f5(false);   // 短按
  await new Promise(r => setTimeout(r, 400));
  const shortReport = {
    hasReport: !!window.__swDebugReport,
    tailLen: Array.isArray(window.__swDebugReport?.behaviorTail) ? window.__swDebugReport.behaviorTail.length : -1,
  };
  const recBefore = rec.recording;
  f5(true); await new Promise(r => setTimeout(r, 620)); f5(false);   // 长按 → 开窗
  const longOn = rec.recording;
  f5(true); await new Promise(r => setTimeout(r, 620)); f5(false);   // 长按 → 关窗
  const longOff = rec.recording;
  const kinds = [...new Set(dump.events.map(e => e.k))];
  // 断言：事件类齐全 + t 单调不减
  const need = ['key', 'tile', 'spawn', 'death', 'drop'];
  const missing = need.filter(k => !kinds.includes(k));
  let monotonic = true;
  for (let i = 1; i < dump.events.length; i++) {
    if (dump.events[i].t < dump.events[i - 1].t) { monotonic = false; break; }
  }
  // 非关键键过滤断言（KeyQ 不应出现）
  const qLeak = dump.events.some(e => e.k === 'key' && e.d?.c === 'KeyQ');
  return {
    fail: null,
    recordingOn, recordingOff,
    mined, placedTile: placed ? placed[2] : null, killed,
    f5: { shortReport, recBefore, longOn, longOff },
    meta: dump.meta,
    kinds,
    missing, monotonic, qLeak,
    first20: dump.events.slice(0, 20),
  };
});

if (result.fail) {
  console.log('FAIL:', result.fail);
  process.exitCode = 1;
} else {
  console.log('=== 行为录制探针 ===');
  console.log('toggle 开/关:', result.recordingOn, '/', result.recordingOff);
  console.log('挖格(mined):', JSON.stringify(result.mined), ' 放置后 type:', result.placedTile, ' 击杀:', JSON.stringify(result.killed));
  console.log('meta:', JSON.stringify(result.meta));
  console.log('事件类:', result.kinds.join(','));
  console.log(`断言: 缺失=${JSON.stringify(result.missing)} t单调=${result.monotonic} 非关键键泄漏(KeyQ)=${result.qLeak}`);
  console.log(`F5: 短按报告=${result.f5.shortReport.hasReport} behaviorTail=${result.f5.shortReport.tailLen} 条; 长按开窗=${result.f5.longOn}(前置${result.f5.recBefore}) 长按关窗=${result.f5.longOff}`);
  const f5bad = !result.f5.shortReport.hasReport || result.f5.shortReport.tailLen <= 0
    || !result.f5.longOn || result.f5.longOff;
  const bad = result.missing.length || !result.monotonic || result.qLeak || f5bad;
  console.log(bad ? 'PROBE: FAIL' : 'PROBE: PASS');
  if (bad) process.exitCode = 1;
  console.log('--- 前 20 条事件 ---');
  for (const e of result.first20) console.log(JSON.stringify(e));
}
await browser.close();
