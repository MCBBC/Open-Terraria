// 风声 cue45 对齐探针：地表/地下/边界三态 → surfaceAtmospherics 门 + 音量公式 + 实际 gain 值
// 对照 Main.cs:11723-11749（case 45）+ WorldGen.IsSurfaceForAtmospherics（WorldGen.cs:11003）
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const origin = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', e.message));
await page.goto(origin + '/', { waitUntil: 'domcontentloaded', timeout: 180000 });
for (let i = 0; i < 60; i++) {
  if (await page.evaluate(() => !!document.querySelector('select')).catch(() => false)) break;
  await new Promise((r) => setTimeout(r, 1000));
}

const out = await page.evaluate(async () => {
  document.querySelector('select').selectedIndex = 0;
  document.querySelector('select').parentElement.querySelector('button').click();
  const t0 = Date.now();
  while (!(window.__swGame && window.__swGame.world && window.__swGame.renderer?.atlas) && Date.now() - t0 < 240000) {
    await new Promise((r) => setTimeout(r, 1000));
  }
  await new Promise((r) => setTimeout(r, 2000));
  const g = window.__swGame;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // 强风：绕 RNG，|wind|≥0.4 门在地表必过
  const wd = g.world.weather;
  wd.windSpeedTarget = 0.7;
  wd.windSpeedCurrent = 0.7;

  const sfx = g.sfx;
  sfx.setWind(0, false); sfx.setRain(0, false); // 触发 ctx/cue 层懒建（门关=状态机空转）
  let windSrcAtSurface = null;
  if (sfx.ctx && sfx.ctx.state === 'suspended') { try { await sfx.ctx.resume(); } catch { /* ignore */ } }

  // Game.applyWeatherLoops 同式复算（Game.ts:16706-16712）
  const expectVol = () => {
    const wAbs = Math.abs(g.world.weather.windSpeedCurrent);
    const camY = g.camera.y;
    const gl = g.world.groundLevel;
    const atmo = Math.max(0, Math.min(1, (camY / 16 - (65 + 10 * (g.world.store.w / 4200) ** 2)) / Math.max(1, gl / 5)));
    return {
      atmo: +atmo.toFixed(3),
      vol: wAbs >= 0.4 && !!g.scene?.surfaceAtmospherics
        ? +(Math.min(1, wAbs * 0.7 + 0.3) * 0.9 * atmo ** 4).toFixed(4)
        : 0,
    };
  };

  const snap = async (label) => {
    const ev = expectVol();
    return {
      label,
      tileY: Math.floor(g.player.cy / 16),
      gl: +g.world.groundLevel.toFixed(1),
      surfaceAtmospherics: !!g.scene?.surfaceAtmospherics,
      wind: +g.world.weather.windSpeedCurrent.toFixed(3),
      atmo: ev.atmo,
      expectVol: ev.vol,
      gain: sfx.cueLayers.wind.gain ? +sfx.cueLayers.wind.gain.gain.value.toFixed(4) : null,
      srcAlive: !!sfx.cueLayers.wind.src,
      ambient: sfx.ambient,
      acState: sfx.ctx ? sfx.ctx.state : null,
    };
  };
  const visit = async (tileY) => {
    g.player.x = g.world.spawnX * 16 + 8; g.player.y = tileY * 16;
    g.camera.x = g.player.x; g.camera.y = g.player.y;
  };

  const res = { acState0: sfx.ctx ? sfx.ctx.state : null };
  // 1) 地表出生点：线性斜坡 0.005/帧(0.3/s)——3s 后 fade=0.9 → gain≈0.9×num7
  visit(g.world.spawnY - 6);
  await sleep(3000);
  res.surface = await snap('surface');
  windSrcAtSurface = sfx.cueLayers.wind.src;   // 起播语义验证锚：地表在播的源节点
  // 斜坡中段采样（验证线性：+1s → fade +0.3）
  res.surface4s = await snap('surface+4s');
  // 2) 地下（岩石层下 120 格）：门关 → musicFade −0.005/帧 渐熄,200 帧(3.33s)归零停
  visit(g.world.rockLevel + 120);
  await sleep(1000);
  res.deep1s = await snap('deep+1s');
  await sleep(4000);
  res.deep5s = await snap('deep+5s');   // 此处 src 应已停拆(srcAlive=false)
  // 3) 边界：y=groundLevel（≤ → true）/ y=gl+3（> → false）
  visit(Math.round(g.world.groundLevel));
  await sleep(1500);
  res.boundaryGL = await snap('boundary y=gl');
  visit(Math.round(g.world.groundLevel) + 3);
  await sleep(1500);
  res.boundaryGLp3 = await snap('boundary y=gl+3');
  // 4) 恢复强地表风：gain 回升 + 源节点重建（Reuse+Play 从头起播,非静音常驻）
  visit(g.world.spawnY - 6);
  await sleep(3000);
  res.backSurface = await snap('back surface');
  res.srcRestarted = !!windSrcAtSurface && sfx.cueLayers.wind.src !== windSrcAtSurface;

  // 5) 暂停对齐（★本轮差异对齐核心）：paused=true 冻结世界 tick,但 cue 斜坡照走
  //    （原版 UpdateAudio Main.cs:17222 在 DoUpdate 无条件执行）——fade 应继续爬升
  sfx.stopAmbientCues();
  visit(g.world.spawnY - 6);
  await sleep(300);
  g.paused = true;                     // 天气链停更：level/gate 保持地表值不变
  const f0 = sfx.cueLayers.wind.cue.fade;
  await sleep(1500);                   // 90 tick → 预期 fade += 0.45
  res.pausedRamp = {
    f0: +f0.toFixed(3),
    f1: +sfx.cueLayers.wind.cue.fade.toFixed(3),
    deltaExpected: 0.45,
    gain: sfx.cueLayers.wind.gain ? +sfx.cueLayers.wind.gain.gain.value.toFixed(4) : null,
  };
  g.paused = false;

  // 额外：windSpeedCurrent 自然值分布快照（探针改过 target，读回自然漂移前的 current）
  res.windTarget = wd.windSpeedTarget;
  return res;
});

console.log(JSON.stringify(out, null, 2));
await browser.close();
