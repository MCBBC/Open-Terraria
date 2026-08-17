// 死亡散飞三件拆分 + 眼睑状态机视觉验证（审计#1/#5）。
// ① 清血致死 → dead 三件 pos/rot 散飞 + 画布死亡位非空像素 + ~1.05s 后全隐（immuneAlpha>125）
// ② 眨眼：240t 周期内 eyeFrame 出现 1(半闭)/2(全闭)；受击全闭 20t
// ③ 硬核幽灵：difficulty=2 死亡 + respawn 阈值后 Ghost.png 帧动画在死亡位
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true,
  args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5201') + '/?play=small', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => { const g = window.__swGame; return g && g.player; }, { timeout: 110000 });
await new Promise(r => setTimeout(r, 1500));

// ---- ② 眨眼（先测——不弄脏玩家状态） ----
const eye = await page.evaluate(async () => {
  const g = window.__swGame, p = g.player;
  const seen = new Set();
  const seq = [];   // [t, eyeFrame]
  const t0 = performance.now();
  while (performance.now() - t0 < 4600) {   // > 240t（60Hz）
    seen.add(p.eyeFrame);
    seq.push([Math.round(performance.now() - t0), p.eyeFrame]);
    await new Promise(r => setTimeout(r, 60));
  }
  // 受击全闭（BlinkBecausePlayerGotHurt :138——damage 落伤后立即 2，锁存 20t）
  p.eyeBlinkHurt();
  const hurtA = p.eyeFrame;
  await new Promise(r => setTimeout(r, 150));   // 20t+ 后回落（无其他触发时回正常眨眼档）
  const hurtAfter = p.eyeFrame;
  return { frames: [...seen].sort(), blinkSamples: seq.filter(s => s[1] !== 0).length, hurtA, hurtAfter };
});

// ---- 眼睑像素实证：闭眼时眼区瞳孔暗像素被皮肤色眼睑覆盖 ----
const lid = await page.evaluate(async () => {
  const g = window.__swGame, p = g.player;
  const cv = g.renderer.canvas, cam = g.camera;
  const darkInHead = () => {
    const top = p.y + p.h - 56 + 2;    // 纸娃娃帧顶（脚底锚 −56+pad2）
    const sx = Math.round((p.cx - p.facing * 2.5 - cam.x) * cam.zoom + cv.width / 2);
    const sy = Math.round((top - cam.y) * cam.zoom + cv.height / 2);
    const w = Math.round(26 * cam.zoom), h = Math.round(24 * cam.zoom);
    const img = g.renderer.ctx.getImageData(Math.max(0, sx - w / 2), Math.max(0, sy), w, h).data;
    let dark = 0, skin = 0;
    for (let i = 0; i < img.length; i += 4) {
      if (img[i + 3] > 100 && img[i] < 165 && img[i + 1] < 150) dark++;        // 瞳/眼线暗像素
      else if (img[i + 3] > 100 && img[i] > 200 && img[i + 1] > 90 && img[i + 1] < 175) skin++; // 皮肤/衣亮像素
    }
    return { dark, skin };
  };
  await new Promise(r => setTimeout(r, 300));
  const open = darkInHead();
  p.eyeBlinkHurt();
  await new Promise(r => setTimeout(r, 120));
  const closed = darkInHead();
  return { open, closed, covered: closed.dark < open.dark };
});

// ---- ① 死亡散飞 ----
const death = await page.evaluate(async () => {
  const g = window.__swGame, p = g.player;
  const cv = g.renderer.canvas, cam = g.camera;
  // 死亡位周边皮肤/衣色像素采样（排除红色粉碎粒子：g<95 全是血尘色带）
  const bodyPx = () => {
    const sx = Math.round((p.x + p.w / 2 - cam.x) * cam.zoom + cv.width / 2);
    const sy = Math.round((p.y + p.h / 2 - cam.y) * cam.zoom + cv.height / 2);
    const w = Math.round(140 * cam.zoom), h = Math.round(160 * cam.zoom);
    const img = g.renderer.ctx.getImageData(Math.max(0, sx - w / 2), Math.max(0, sy - h / 2), w, h).data;
    let body = 0, blood = 0;
    for (let i = 0; i < img.length; i += 4) {
      if (img[i + 3] > 80 && img[i] > 180 && img[i + 1] > 95 && img[i + 2] > 55) body++;
      else if (img[i + 3] > 80 && img[i] > 140 && img[i] > img[i + 1] * 2 && img[i] > img[i + 2] * 2) blood++;
    }
    return { body, blood };
  };
  const px0 = bodyPx();   // 死前存活基线（完整身体）
  const before = { dead: p.dead, hp: p.hp, parts: JSON.parse(JSON.stringify(p.deadParts)) };
  p.damage(99999, p.cx + 20, p.y);   // 右侧来刀 → deathHitDir = -1
  await new Promise(r => setTimeout(r, 60));
  const t0 = {
    dead: p.dead, hp: p.hp,
    seg: JSON.parse(JSON.stringify(p.deadParts)),
    px: bodyPx(), immuneAlpha: p.immuneAlpha, respawn: p.respawnTimer,
  };
  await new Promise(r => setTimeout(r, 450));
  const tMid = { seg: JSON.parse(JSON.stringify(p.deadParts)), px: bodyPx(), immuneAlpha: p.immuneAlpha };
  await new Promise(r => setTimeout(r, 1750));   // 合计 ~2.26s
  const tFade = { px: bodyPx(), immuneAlpha: p.immuneAlpha, respawn: p.respawnTimer };
  const vy0 = [before.parts.head.vy, before.parts.body.vy, before.parts.legs.vy];
  return {
    before, t0, tMid, tFade, px0,
    vyRangeOk: t0.seg.head.vy >= -4.01 && t0.seg.head.vy <= -1.09 && t0.seg.legs.vy < 0,
    xHitDir: t0.seg.head.vx < 0,   // deathHitDir −1 → X = rand*0.1 − 2（大概率负向）
    scattered: Math.abs(tMid.seg.head.px - tMid.seg.legs.px) + Math.abs(tMid.seg.head.py - tMid.seg.legs.py) > 4,
    rolled: tMid.seg.head.rot !== 0 || tMid.seg.body.rot !== 0,
    vy0,
  };
});

// ---- ③ 硬核幽灵 ----
const ghost = await page.evaluate(async () => {
  const g = window.__swGame, p = g.player;
  // 软核下 10s 自动重生复活——重杀一次并钉死硬核难度
  p.appearance = { ...p.appearance, difficulty: 2 };
  p.damage(99999, p.cx, p.cy);
  await new Promise(r => setTimeout(r, 300));
  const deadX = p.x, deadY = p.y;
  const phaseEarly = p.isGhostPhase(g.world);
  // 等待 respawn 阈值（600t=10s；世界经典档非专家）+ 一点余量
  await new Promise(r => setTimeout(r, 10900));
  const cv = g.renderer.canvas, cam = g.camera;
  const sx = Math.round((p.x + 17 - cam.x) * cam.zoom + cv.width / 2);
  const sy = Math.round((p.y + 22 - cam.y) * cam.zoom + cv.height / 2);
  const img = g.renderer.ctx.getImageData(Math.max(0, sx - 20), Math.max(0, sy - 26), 40, 52).data;
  let bright = 0;
  for (let i = 0; i < img.length; i += 4) if (img[i + 3] > 100) bright++;
  return {
    phaseEarly, ghostPhase: p.isGhostPhase(g.world), dead: p.dead,
    respawn: p.respawnTimer, ghostFrame: p.ghostFrame, at: [deadX, deadY],
    px: bright,
  };
});

console.log(JSON.stringify({ eye, lid, death, ghost }, null, 1));
await page.screenshot({ path: '/tmp/deathvis.png' });
await browser.close();
