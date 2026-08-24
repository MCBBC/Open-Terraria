// 秃鹫死亡音效·回退诊断（2026-08-24）：抓 playWavFile 返回值 + 合成回退触发点
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true,
  args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5201') + '/?play=small', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => { const g = window.__swGame; return g && g.player; }, { timeout: 110000 });
await new Promise(r => setTimeout(r, 1500));

const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  const log = [];
  // hook playWavFile（记返回值）与 play（记合成回退）
  const origWav = g.sfx.playWavFile.bind(g.sfx);
  g.sfx.playWavFile = function (file, vol, x, y, pitch, replace) {
    const r = origWav(file, vol, x, y, pitch, replace);
    log.push({ kind: 'wav', file: String(file), ok: r, x, y });
    return r;
  };
  const origPlay = g.sfx.play.bind(g.sfx);
  g.sfx.play = function (name, vol, x, y) {
    log.push({ kind: 'synth', name: String(name), vol, x, y });
    return origPlay(name, vol, x, y);
  };
  // 召唤秃鹫（在玩家附近）→ 等预热 → 击杀
  g.debugSpawnNpc(61, 1, false);
  await wait(2500);   // 给足预热时间
  const vul = (g.entities.enemies ?? []).find(e => e.vanillaId === 61);
  if (!vul) return { noVulture: true, log };
  const dist = Math.hypot(vul.cx - g.player.cx, vul.cy - g.player.cy);
  // 缓冲状态检查
  const bufReady = g.sfx.buffers?.has?.('NPC_Killed_31');
  const bufFailed = g.sfx.failed?.has?.('NPC_Killed_31');
  vul.hurt(9999, 0, 0, g, 0, false, 1);
  await wait(400);
  // 再杀一只（缓冲此时应已好）
  g.debugSpawnNpc(61, 1, false);
  await wait(800);
  const vul2 = (g.entities.enemies ?? []).find(e => e.vanillaId === 61 && !e.dead);
  if (vul2) vul2.hurt(9999, 0, 0, g, 0, false, 1);
  await wait(400);
  return {
    dist: Math.round(dist), bufReady, bufFailed,
    log: log.slice(0, 12),
    attenSample: g.sfx.atten?.(1, vul.cx, vul.cy),
  };
});
console.log(JSON.stringify(out, null, 1));
console.log('errors:', JSON.stringify(errors.slice(0, 3)));
await browser.close();
process.exit(errors.length ? 1 : 0);
