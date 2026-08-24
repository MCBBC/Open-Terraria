// 秃鹫死亡音效实测（2026-08-24）：召唤 61 → 击杀 → 记录 playWavFile 实际文件序列
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
  // hook sfx.playWavFile
  const played = [];
  const orig = g.sfx.playWavFile.bind(g.sfx);
  g.sfx.playWavFile = function (file, vol, x, y) {
    played.push(String(file));
    return orig(file, vol, x, y);
  };
  // 召唤秃鹫
  g.debugSpawnNpc(61, 1, false);
  await wait(600);
  const vul = (g.entities.enemies ?? []).find(e => e.vanillaId === 61);
  if (!vul) return { noVulture: true, played };
  const defSounds = { hit: vul.def.hitSound, killed: vul.def.killedSound };
  // 击杀（直调 hurt 大伤害）
  vul.hurt(9999, 0, 0, g, 0, false, 1);
  await wait(400);
  return { defSounds, played, vultureDead: !!vul.dead };
});
console.log(JSON.stringify(out, null, 1));
console.log('errors:', JSON.stringify(errors.slice(0, 3)));
await browser.close();
process.exit(errors.length ? 1 : 0);
