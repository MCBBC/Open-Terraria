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
  const g = window.__swGame;
  const t0 = Date.now();
  while ((!g || !g.player || !window.__swRec) && Date.now() - t0 < 90000) {
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

  // 3) 挖一格：玩家脚下旁边一格非空格（byPlayer=true → cause 'mine'）
  let mined = null;
  for (const [dx, dy] of [[1, -1], [-1, -1], [0, -1], [1, 0], [-1, 0], [0, 0]]) {
    const x = ptx + dx, y = pty + dy;
    if (!st.inBounds(x, y) || st.get(x, y) === 0) continue;
    g.breakTile(x, y, true);
    mined = [x, y, st.get(x, y)];
    break;
  }
  await new Promise(r => setTimeout(r, 120));

  // 4) 放一格：玩家旁空格 + 下方实心（伪造最小 def：tile 键 'dirt'）
  let placed = null;
  outer: for (const [dx, dy] of [[2, -1], [-2, -1], [2, 0], [-2, 0], [1, -1], [-1, -1]]) {
    const x = ptx + dx, y = pty + dy;
    if (!st.inBounds(x, y) || st.get(x, y) !== 0) continue;
    if (!st.inBounds(x, y + 1) || !st.isSolid(x, y + 1)) continue;
    g.tryPlace(x, y, { key: 'probe_item', tile: 'dirt' });
    placed = [x, y, st.get(x, y)];
    break outer;
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
  const bad = result.missing.length || !result.monotonic || result.qLeak;
  console.log(bad ? 'PROBE: FAIL' : 'PROBE: PASS');
  if (bad) process.exitCode = 1;
  console.log('--- 前 20 条事件 ---');
  for (const e of result.first20) console.log(JSON.stringify(e));
}
await browser.close();
