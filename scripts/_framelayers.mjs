// 玩家帧层批探针（C1'）：①body/legs 双行 ②坐骑腿行 ③滚轴鞋 ④坐姿腿切片
// ⑤浮水/盾举行10 ⑥HidesHead 脸清除(狼人/人鱼) ⑦变身坐骑本体消失。
// ?play=small 无 appearance → 注入默认外观 + 霓虹瞳（眼部像素可精确采样）。
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
  const g = window.__swGame, p = g.player, R = g.renderer;
  const cam = g.camera, cv = R.canvas;
  const { compositePaperDoll, FRAME_H } = await import('/src/player/PaperDoll.ts');
  const { BuffType } = await import('/src/stats/Buffs.ts');
  p.appearance ??= {
    name: 'probe', hair: 0, skinVariant: 0,
    hairColor: { r: 215, g: 90, b: 55 }, skinColor: { r: 255, g: 125, b: 90 }, eyeColor: { r: 255, g: 0, b: 255 },
    shirtColor: { r: 175, g: 165, b: 140 }, undershirtColor: { r: 160, g: 180, b: 215 },
    pantsColor: { r: 255, g: 230, b: 175 }, shoeColor: { r: 160, g: 105, b: 60 },
    difficulty: 0, team: 0,
  };
  p.appearance = { ...p.appearance, eyeColor: { r: 255, g: 0, b: 255 } };
  // 贴图懒加载就绪门（composite 返回 null = 未就绪；查询本身触发后台加载）
  const ready = async (equip) => {
    for (let i = 0; i < 150; i++) {
      if (compositePaperDoll(p.appearance, equip)) return true;
      await new Promise(r => setTimeout(r, 100));
    }
    return false;
  };
  const bareReady = await ready(null);
  const A = p.appearance;

  // ---- 工具：canvas 采样 ----
  const px = (canvas) => canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
  /** 洋红瞳像素计数（瞳基础灰阶 ×(255,0,255) → 暗洋红；armor 不含该色调） */
  const neonIn = (canvas) => {
    const d = px(canvas); let n = 0;
    for (let i = 0; i < d.length; i += 4)
      if (d[i] > 60 && d[i + 2] > 60 && d[i + 1] < 40 && d[i] - d[i + 1] > 40 && d[i + 3] > 100) n++;
    return n;
  };
  /** 下半带（y 42..yEnd）鞋/裤暖色像素的 X 质心与计数（坐姿切片几何代理） */
  const legStats = (canvas, frame, yEnd = 56) => {
    const d = px(canvas);
    let n = 0, sx = 0;
    for (let y = 42; y < yEnd; y++) for (let x = 0; x < 40; x++) {
      const i = ((y + frame * 56) * 40 + x) * 4;
      const r = d[i], gg = d[i + 1], b = d[i + 2];
      // 鞋(160,105,60) / 裤(255,230,175) / 皮肤腿(255,125,90) —— 暖色且 b 低
      if (d[i + 3] > 100 && r > 120 && b < 140 && r - b > 60) { n++; sx += x; }
    }
    return { n, cx: n ? sx / n : -1 };
  };
  const frameEq = (a, b, frameA, frameB) => {   // 两 canvas 指定帧逐像素比较
    const da = px(a), db = px(b);
    let diff = 0;
    for (let y = 0; y < 56; y++) for (let x = 0; x < 40; x++) {
      const i = ((y + frameA * 56) * 40 + x) * 4, j = ((y + frameB * 56) * 40 + x) * 4;
      if (Math.abs(da[i] - db[j]) > 8 || Math.abs(da[i + 1] - db[j + 1]) > 8
        || Math.abs(da[i + 2] - db[j + 2]) > 8) diff++;
    }
    return diff;
  };
  const setPlain = () => {   // 无坐骑/无控场/地面站定的基态
    p.mount.active = false; p.mount.type = -1;
    p.vx = 0; p.vy = 0; p.onGround = true; p.inWater = false; p.swimTime = 0;
    p.carpetTime = 0; p.shieldRaised = false; p.sitting = false; p.sleeping = false;
    p.merman = false; p.eocDash = 0; p.inputDown = false;
  };

  // ---- ① 跑动静持（火把 holdStyle1）：body 钉行3、腿 7..19 循环 ----
  setPlain();
  const holdWalk = [0, 8, 16, 40, 80].map((at) => {
    p.animTime = at; p.vx = 3;
    return R.playerFrameRows(p, null, 1, null, null, 0);
  });
  const t1 = {
    bodyPinned: holdWalk.every(s => s.body === 3),
    legsCycle: holdWalk.map(s => s.legs),
    legsVary: new Set(holdWalk.map(s => s.legs)).size >= 4,
  };
  // rows 模式烘焙 = 整表对应帧（回归闸：rows{5,5} 与整表第 5 帧逐像素一致）
  const full5 = compositePaperDoll(A, null);
  const rows55 = compositePaperDoll(A, null, { rows: { body: 5, legs: 5 } });
  const rows39 = compositePaperDoll(A, null, { rows: { body: 3, legs: 9 } });
  const t1b = {
    rowsEqFull: full5 && rows55 ? frameEq(full5, rows55, 5, 0) : -1,
    rowsDiffer: full5 && rows39 ? frameEq(full5, rows39, 0, 0) : -1,   // body3/legs9 vs 整表帧0（应大量差异）
  };

  // ---- ② 坐骑腿行（普通坐骑行6 / 23·45·48 行0；body=mount.BodyFrame） ----
  setPlain(); p.animTime = 40; p.vx = 3;
  p.mount.active = true;
  p.mount.type = 1;  const bunny = R.playerFrameRows(p, null, 0, p.mount, null, 0);
  p.mount.type = 23; const broom = R.playerFrameRows(p, null, 0, p.mount, null, 0);
  const t2 = { bunny, broom, legs6: bunny.legs === 6, body3: bunny.body === 3, broomLegs0: broom.legs === 0 && broom.body === 0 };

  // ---- ③ 滚轴鞋坐骑 57（DoesNotOverrideLegFrames/BodyFrames）：腿照走循环、身体同步 ----
  setPlain(); p.mount.active = true; p.mount.type = 57;
  const skate = [0, 16, 40].map((at) => {
    p.animTime = at; p.vx = 3;
    return R.playerFrameRows(p, null, 0, p.mount, null, 0);
  });
  const t3 = {
    rows: skate, legsCycle: new Set(skate.map(s => s.legs)).size === 3,
    bodySync: skate.every(s => s.body === s.legs),
  };

  // ---- ④ 坐姿腿切片（DrawSittingLegs 默认档：底 14px 条带三片 X 2/4/6 前移、Y=44） ----
  const stand = compositePaperDoll(A, null, { rows: { body: 0, legs: 0 } });
  const sit = compositePaperDoll(A, null, { rows: { body: 0, legs: 0 }, sitting: { legIndex: 0, seatYOffset: -4, body: 0 } });
  const ls = stand ? legStats(stand, 0, 56) : null;
  const ss = sit ? legStats(sit, 0, Math.min(64, sit?.height ?? 56)) : null;
  const bandWarm = (canvas, y0, y1, kind) => {   // y 带内像素分类计数（P=裤 / O=鞋/暗暖）
    if (!canvas) return -1;
    const d = px(canvas); let n = 0;
    for (let y = y0; y < y1; y++) for (let x = 0; x < 40; x++) {
      const i = (y * 40 + x) * 4;
      const r = d[i], gg = d[i + 1], b = d[i + 2];
      const pants = r > 200 && gg > 170 && b > 120;                  // 裤(255,230,175)×灰阶
      const shoe = r > 120 && r - b > 90 && gg < 150;                // 鞋(160,105,60)
      const hit = kind === 'P' ? pants : kind === 'O' ? shoe : (pants || shoe);
      if (d[i + 3] > 100 && hit) n++;
    }
    return n;
  };
  // 原版切片几何（DrawSittingLegs 默认档）：A(n=2,src 46..56,10px,x+6)·B(n=1,2px,x+4)·
  // C(n=0,2px,x+2) 全部顶对齐 dest y44——站姿 y42..45 的膝部裤段在坐姿帧里只余
  // y44..46 的 2px 切条（+前移），y38..44 带裤像素应清零；鞋(O)在 A 条带 y44..54 内
  const t4 = {
    singleFrame: !!sit && sit.height <= 64,
    stand: ls, sit: ss,
    pantsStand: stand ? bandWarm(stand, 38, 44, 'P') : -1,   // 站姿膝部裤段
    pantsSit: sit ? bandWarm(sit, 38, 44, 'P') : -1,         // 坐姿 y<44 应≈0（上段切片掉）
    shoesStand: stand ? bandWarm(stand, 44, 56, 'O') : -1,
    shoesSit: sit ? bandWarm(sit, 44, 56, 'O') : -1,         // 坐姿鞋仍在 A 条带内可见
    shifted: !!ls && !!ss && ls.n > 0 && ss.n > 0 && ss.cx > ls.cx && ss.cx - ls.cx <= 7,
    thighsSliced: !!stand && !!sit && bandWarm(stand, 38, 44, 'P') > 4 && bandWarm(sit, 38, 44, 'P') <= 4,
    shoesKept: !!stand && !!sit && bandWarm(sit, 44, 56, 'O') > 0,
  };

  // ---- ⑤ 浮水行10（脚蹼浸水）+ 盾举行10 ----
  setPlain();
  p.inWater = true; p.buffs.apply(BuffType.FlipperPotion, 600);
  const floatRow = R.playerFrameRows(p, null, 0, null, null, 0);
  p.inWater = false; p.buffs.remove(BuffType.FlipperPotion);
  p.shieldRaised = true;
  const shieldRow = R.playerFrameRows(p, null, 0, null, null, 0);
  p.shieldRaised = false;
  const t5 = { floatRow, shieldRow, float10: floatRow.body === 10, shield10: shieldRow.body === 10, legs0: floatRow.legs === 0 };

  // ---- ⑥ HidesHead 脸清除（狼人头 38 跳过 base 头/眼；人鱼 39 原版不跳——画在甲下） ----
  const bareHead = compositePaperDoll(A, null);
  await ready({ head: 38, body: null, legs: null });
  await ready({ head: 39, body: 22, legs: 21 });
  const wolfHead = compositePaperDoll(A, { head: 38, body: null, legs: null });
  const fishHead = compositePaperDoll(A, { head: 39, body: 22, legs: 21 });
  const t6 = {
    bareReady,
    bareNeon: bareHead ? neonIn(bareHead) : -1,
    wolfNeon: wolfHead ? neonIn(wolfHead) : -1,
    fishNeon: fishHead ? neonIn(fishHead) : -1,
    wolfFaceCleared: !!wolfHead && !!bareHead && neonIn(wolfHead) < neonIn(bareHead) * 0.4,
    mermaidFaceUnder: !!fishHead && !!bareHead && neonIn(fishHead) >= neonIn(bareHead) * 0.4,
    mermaidTriple: !!fishHead,   // 人鱼三件(39/22/21)贴图链就绪可烘焙
  };

  // ---- ⑦ 变身坐骑本体消失（PlayerIsHidden 52 狼）：世界像素洋红瞳清零 ----
  const scr = (wx, wy) => [
    Math.round((wx - cam.x) * cam.zoom + cv.width / 2),
    Math.round((wy - cam.y) * cam.zoom + cv.height / 2),
  ];
  const worldNeon = () => {
    const [sx, sy] = scr(p.cx, p.y + p.h - 28);
    const W = Math.round(60 * cam.zoom), H = Math.round(60 * cam.zoom);
    const img = R.ctx.getImageData(Math.max(0, sx - W / 2), Math.max(0, sy - H / 2), W, H).data;
    let n = 0;
    for (let i = 0; i < img.length; i += 4)
      if (img[i] > 150 && img[i + 2] > 150 && img[i + 1] < 70 && img[i + 3] > 100) n++;
    return n;
  };
  setPlain();
  await new Promise(r => requestAnimationFrame(r));
  await new Promise(r => setTimeout(r, 250));
  const before = worldNeon();
  p.mount.active = true; p.mount.type = 52;
  await new Promise(r => requestAnimationFrame(r));
  await new Promise(r => setTimeout(r, 250));
  const after = worldNeon();
  p.mount.active = false; p.mount.type = -1;
  const t7 = { before, after, hidden: before >= 2 && after <= 1 };

  // ---- 复位 ----
  setPlain();
  return { t1, t1b, t2, t3, t4, t5, t6, t7 };
}, { timeout: 180000 }).catch(e => ({ error: String(e) }));

console.log(JSON.stringify(out, null, 1));
await browser.close();
