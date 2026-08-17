// 死亡散飞三件拆分 + 眼睑状态机视觉验证（审计#1/#5）。
// 快速游玩无 appearance → 探针注入默认外观（Player.cs:199-205 默认色），
// 瞳色用霓虹绿（场景无纯绿 → 瞳孔像素可精确采样，闭眼=眼睑皮肤色覆盖即消失）。
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true,
  args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5201') + '/?play=small', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => { const g = window.__swGame; return g && g.player; }, { timeout: 110000 });
await new Promise(r => setTimeout(r, 1200));

const out = await page.evaluate(async () => {
  const g = window.__swGame, p = g.player;
  const cv = g.renderer.canvas, cam = g.camera;
  // ---- 注入外观（默认色 + 洋红瞳：灰度瞳孔×(G,0,G) → 紫像素，场景稀有） ----
  p.appearance ??= {
    name: 'probe', hair: 0, skinVariant: 0,
    hairColor: { r: 215, g: 90, b: 55 }, skinColor: { r: 255, g: 125, b: 90 }, eyeColor: { r: 255, g: 0, b: 255 },
    shirtColor: { r: 175, g: 165, b: 140 }, undershirtColor: { r: 160, g: 180, b: 215 },
    pantsColor: { r: 255, g: 230, b: 175 }, shoeColor: { r: 160, g: 105, b: 60 },
    difficulty: 0, team: 0,
  };
  p.appearance = { ...p.appearance, eyeColor: { r: 255, g: 0, b: 255 } };
  await new Promise(r => setTimeout(r, 1200));   // 纸娃娃贴图懒加载就绪

  const scr = (wx, wy) => [
    Math.round((wx - cam.x) * cam.zoom + cv.width / 2),
    Math.round((wy - cam.y) * cam.zoom + cv.height / 2),
  ];
  /** 世界矩形内洋红瞳像素计数（r/b 高、g 极低） */
  const neon = (x, y, w, h) => {
    const [sx, sy] = scr(x, y);
    const W = Math.round(w * cam.zoom), H = Math.round(h * cam.zoom);
    const img = g.renderer.ctx.getImageData(Math.max(0, sx), Math.max(0, sy), W, H).data;
    let n = 0;
    for (let i = 0; i < img.length; i += 4) if (img[i] > 70 && img[i + 2] > 70 && img[i + 1] < 40 && img[i + 3] > 100) n++;
    return n;
  };
  // 头部眼区（帧顶 = 脚底 −56+pad2；眼在第 12-22px 带内）
  const eyeRegion = () => neon(p.cx - 14, p.y + p.h - 56 + 10, 28, 16);

  // ---- ② 眨眼状态机（模型 + 像素） ----
  const frames = new Set(), seq = [];
  const tEye0 = performance.now();
  while (performance.now() - tEye0 < 4600) {   // > 240t（60Hz）
    frames.add(p.eyeFrame);
    if (p.eyeFrame !== 0) seq.push([Math.round(performance.now() - tEye0), p.eyeFrame]);
    await new Promise(r => setTimeout(r, 55));
  }
  const neonOpen = eyeRegion();
  p.eyeBlinkHurt();                            // BlinkBecausePlayerGotHurt（:138）
  await new Promise(r => setTimeout(r, 130));  // 20t 锁存期内恒全闭
  const eyeHurtLocked = p.eyeFrame;
  const neonClosed = eyeRegion();
  await new Promise(r => setTimeout(r, 320));  // 20t 后回落
  const eyeHurtAfter = p.eyeFrame;
  const eye = {
    frames: [...frames].sort(), blinkHits: seq.length, eyeHurtLocked, eyeHurtAfter,
    neonOpen, neonClosed, eyelidCoversPupils: neonClosed < neonOpen * 0.5 && neonOpen >= 2,
  };

  // ---- ① 死亡散飞（三件拆分） ----
  const boxPx = () => {
    // 死亡位 ±80/±90：洋红瞳（头件）+ 皮肤/裤暖色（宽松阈值——世界光照会压暗）
    const [sx, sy] = scr(p.x + p.w / 2, p.y + p.h / 2);
    const W = Math.round(160 * cam.zoom), H = Math.round(180 * cam.zoom);
    const img = g.renderer.ctx.getImageData(Math.max(0, sx - W / 2), Math.max(0, sy - H / 2), W, H).data;
    let neonN = 0, warmN = 0;
    for (let i = 0; i < img.length; i += 4) {
      if (img[i + 3] < 100) continue;
      if (img[i] > 70 && img[i + 2] > 70 && img[i + 1] < 40) neonN++;
      else if (img[i] > 150 && img[i + 1] > 105 && img[i + 1] < 205 && img[i + 2] > 55) warmN++;
    }
    return { neon: neonN, warm: warmN };
  };
  const pxAlive = boxPx();
  p.damage(99999, p.cx + 20, p.y);             // 右侧来刀 → deathHitDir = −1
  await new Promise(r => setTimeout(r, 90));
  const t0 = {
    dead: p.dead, hp: p.hp, hd: p.deathHitDir, seg: JSON.parse(JSON.stringify(p.deadParts)),
    px: boxPx(), immuneAlpha: p.immuneAlpha,
  };
  await new Promise(r => setTimeout(r, 430));
  const tMid = { seg: JSON.parse(JSON.stringify(p.deadParts)), px: boxPx(), immuneAlpha: p.immuneAlpha };
  const deathShot = 'mid';   // 标记（外层截图）
  await new Promise(r => setTimeout(r, 800));   // 合计 ~1.32s：immuneAlpha>125 全隐
  const tHide = { px: boxPx(), immuneAlpha: p.immuneAlpha };
  const death = {
    pxAlive, t0, tMid, tHide, deathShot,
    // t0 采样已含 ~6 tick 物理（vy=初速+0.1t）——区间放宽到 [-4.6,-1.1]
    vyRangeOk: t0.seg.head.vy <= -1.09 && t0.seg.legs.vy < 0 && t0.seg.body.vy < 0 && t0.seg.head.vy >= -4.61,
    xHitDir: t0.seg.head.vx <= 0 && t0.seg.legs.vx <= 0,   // deathHitDir−1 → X∈[−4,0]
    scattered: Math.abs(tMid.seg.head.px - tMid.seg.legs.px) + Math.abs(tMid.seg.head.py - tMid.seg.legs.py) > 4,
    rolled: Math.abs(tMid.seg.head.rot) > 0.5 || Math.abs(tMid.seg.body.rot) > 0.5,
    partsVisible: Math.max(t0.px.neon + t0.px.warm, tMid.px.neon + tMid.px.warm) - tHide.px.neon - tHide.px.warm,
  };

  // ---- ③ 硬核幽灵 ----
  const tw = performance.now();
  while (p.dead && performance.now() - tw < 12500) await new Promise(r => setTimeout(r, 200));   // 软核 10s 重生
  let ghost = { skipped: 'no respawn' };
  if (!p.dead) {
    p.iframes = 0;                             // 重生赠 180t 无敌帧——探针清零以便直杀
    // 传送到地表出生点再杀：暗处幽灵会被光照乘区压没（原版同样乘 Lighting.GetColor），
    // 地表日光下灰幽灵可见
    p.x = g.world.spawnX * 16 + 8;
    p.y = (g.world.spawnY - 3) * 16;
    p.vx = 0; p.vy = 0;
    await new Promise(r => setTimeout(r, 250));
    // 直连 p.damage 绕过 Game.damagePlayer → 死亡惩罚块（hardcoreDead 标记）不会跑，
    // 探针代为置位（difficulty=2 + hardcoreDead → respawnPlayer 拒绝 → 计时越 600 即幽灵）
    p.appearance = { ...p.appearance, difficulty: 2, hardcoreDead: true };
    p.damage(99999, p.cx, p.cy);
    const tk = performance.now();
    while (!p.dead && performance.now() - tk < 2000) await new Promise(r => setTimeout(r, 60));
    if (p.dead) {
      const phaseEarly = p.isGhostPhase(g.world);
      // 幽灵像素实证：夜幕光照会把灰幽灵压暗（原版同样乘 Lighting.GetColor）——
      // 用「幽灵矩形 vs 左移同尺寸矩形」的平均亮度差（幽灵叠加灰 = 增亮）
      const lum = (wx, wy) => {
        const [sx, sy] = scr(wx, wy);
        const img = g.renderer.ctx.getImageData(Math.max(0, sx - 21), Math.max(0, sy - 28), 42, 56).data;
        let s = 0, n = 0;
        for (let i = 0; i < img.length; i += 4) { if (img[i + 3] > 100) { s += (img[i] + img[i + 1] + img[i + 2]) / 3; n++; } }
        return n ? s / n : 0;
      };
      const t2 = performance.now();
      while (!p.isGhostPhase(g.world) && performance.now() - t2 < 21000) await new Promise(r => setTimeout(r, 250));
      const lumGhost = lum(p.x + 17, p.y + 22);          // 幽灵中心矩形
      const lumAside = lum(p.x + 17 - 70, p.y + 22);     // 左移 70px 同尺寸对照（无幽灵）
      const fA = p.ghostFrame;
      await new Promise(r => setTimeout(r, 700));        // 8t/帧 → ≥5 帧推进
      ghost = {
        phaseEarly, ghostPhase: p.isGhostPhase(g.world), hardcoreDead: !!p.appearance.hardcoreDead,
        respawn: p.respawnTimer, frameA: fA, frameB: p.ghostFrame,
        lumGhost: +lumGhost.toFixed(1), lumAside: +lumAside.toFixed(1),
        ghostBrighter: lumGhost > lumAside + 4,
      };
    } else {
      ghost = { skipped: 'kill failed', hp: p.hp };
    }
  }
  return { eye, death, ghost };
});

console.log(JSON.stringify(out, null, 1));
await page.screenshot({ path: '/tmp/deathvis.png' });
await browser.close();
