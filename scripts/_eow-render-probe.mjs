// EoW/蠕虫族渲染遗留四件 运行时验证（清零批 P2/P3 + EB 备案）：
//  1. behindTiles 渲染层：蠕虫族精灵画在 tile chunk 之前（墙后 tile 前）
//  2. 专家体型缩放上渲染：ctx.scale 乘 expertRenderScale（13-15 ×1.2）
//  3. BGM type 表触发：只有身/尾段在屏盒内也触发 99（EoW 曲）
//  4. EoW 出生渐显 -42/tick：头 ~7t 现身 + 段链门（前段 alpha<85 才启动）
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(ORIGIN, { waitUntil: 'networkidle0' });
await page.evaluate(() => { const s = document.querySelector('select'); s.selectedIndex = 0; s.parentElement.querySelector('button').click(); });
await page.waitForFunction(() => window.__swGame && window.__swGame.world, { timeout: 300000 });
await new Promise((r) => setTimeout(r, 1500));

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${extra !== '' ? '  ' + extra : ''}`);
  ok ? pass++ : fail++;
};

// 页内工具：装备逐帧 drawImage 日志 + drawEnemy 包装（计数/首个等比 scale）
await page.evaluate(() => {
  const g = window.__swGame;
  const r = g.renderer;
  if (r.__armed) return;
  r.__armed = true;
  r.__frames = [];        // 逐帧 drawImage 记录（每帧一个数组）
  r.__counts = {};        // 逐帧 drawEnemy 计数
  r.__scales = {};        // 逐帧 drawEnemy 首个等比 ctx.scale
  r.__cur = null;
  const ctx = r.ctx;
  const origDI = ctx.drawImage.bind(ctx);
  ctx.drawImage = function (img, ...rest) {
    const kind = img.width === 256 && img.height === 256 ? 'chunk' : 'sprite';
    const fr = r.__frames[r.__frames.length - 1];
    if (fr) fr.push({ kind, id: r.__cur });
    return origDI(img, ...rest);
  };
  const origDE = r.drawEnemy;
  r.drawEnemy = function (e, ...rest) {
    r.__cur = e.vanillaId ?? null;
    const origScale = ctx.scale;
    let first = null;
    ctx.scale = function (a, b) {
      if (first === null && a === b && a > 0 && Math.abs(a - 1.25) > 1e-6) first = a;
      return origScale.call(ctx, a, b);
    };
    try {
      return origDE.call(this, e, ...rest);
    } finally {
      ctx.scale = origScale;
      const fr = r.__frames[r.__frames.length - 1];
      if (fr && e.vanillaId != null) {
        r.__counts[e.vanillaId] = (r.__counts[e.vanillaId] ?? 0) + 1;
        r.__scales[e.vanillaId] = first;
      }
      r.__cur = null;
    }
  };
  // 逐帧分桶：包 frame（私有仅编译期），帧首开新桶
  const origFrame = g.frame;
  g.frame = function (now) {
    r.__frames.push([]);
    for (const k of Object.keys(r.__counts)) delete r.__counts[k];
    for (const k of Object.keys(r.__scales)) delete r.__scales[k];
    return origFrame.call(this, now);
  };
  // EoW 保活：无头段则重召唤（EoW 在非腐化区会下潜自清：summonBoss 族门按在场扫描，
  // 链清光后可重召；g.boss 残留引用需先清）
  g.__ensureEow = () => {
    const has = g.entities.enemies.some((e) => !e.dead && e.vanillaId === 13);
    if (has) return true;
    g.boss = null;
    return g.summonBoss('eater_of_worlds_head');
  };
  // 全链传送玩家视口内（网格铺开，保证同屏）
  g.__eowToView = () => {
    let head = null;
    for (const e of g.entities.enemies) {
      if (e.vanillaId === 13 && !e.dead) { head = e; break; }
    }
    if (!head) return 0;
    const px = g.player.cx, py = g.player.cy;
    let k = 0;
    for (let s = head; s; s = s.wormNext) { s.x = px - 100 + (k % 10) * 24; s.y = py - 60 + Math.floor(k / 10) * 24; k++; }
    return k;
  };
  return true;
});

// ---------- 0. 谓词表（isBehindTilesEnemy） ----------
{
  const out = await page.evaluate(() => {
    const r = window.__swGame.renderer;
    const fake = (id, bt) => r.isBehindTilesEnemy({ vanillaId: id, vanilla: bt ? { behindTiles: true } : {} });
    return {
      eowHead: fake(13, true), eowBody: fake(14, true), eowTail: fake(15, true),
      devourer: fake(7, true), digger: fake(95, true), tombCrawler: fake(513, true),
      wyvern: fake(87, false), unicorn: fake(86, false),
      wofMouth: fake(113, true), wofEye: fake(114, true), hungry: fake(115, true),
      zombie: fake(3, false),
    };
  });
  check('behindTiles: 世吞三段 13/14/15 判钻地层', out.eowHead && out.eowBody && out.eowTail);
  check('behindTiles: 掘地虫 7/挖掘怪 95/墓穴爬虫 513 判钻地层', out.devourer && out.digger && out.tombCrawler);
  check('behindTiles: 飞龙 87/独角兽 86 非钻地（不在表）', !out.wyvern && !out.unicorn);
  check('behindTiles: 血肉墙 113/眼 114/饥饿者 115 留实体层（墙身在上）', !out.wofMouth && !out.wofEye && !out.hungry);
  check('behindTiles: 僵尸 3 不受影响', !out.zombie);
}

// ---------- 4. 渐显轨迹（-42/tick + 段链门） ----------
const fadeOut = await page.evaluate(() => {
  const g = window.__swGame;
  if (!g.__ensureEow()) return { ok: false, why: 'summon-fail' };
  let head = null;
  for (const e of g.entities.enemies) {
    if (e.vanillaId === 13 && !e.dead) { head = e; break; }
  }
  const body = head?.wormNext;
  if (!head || !body) return { ok: false, why: 'no-chain' };
  const headSeq = [], bodySeq = [];
  let headStart = -1, bodyStart = -1;
  const a0 = { head: head.spawnAlpha, body: body.spawnAlpha };
  for (let i = 0; i < 90; i++) {
    g.fixedUpdate(1 / 60);
    headSeq.push(head.spawnAlpha);
    bodySeq.push(body.spawnAlpha);
    if (headStart < 0 && head.spawnAlpha < 255) headStart = i;
    if (bodyStart < 0 && body.spawnAlpha < 255) bodyStart = i;
  }
  // 步长校验：从头段首次递减起，逐 tick 恰 -42
  const stepOk = (() => {
    if (headStart < 0) return false;
    let prev = 255;
    for (let i = headStart; i < headSeq.length; i++) {
      const want = Math.max(0, prev - 42);
      if (headSeq[i] !== want) return false;
      prev = headSeq[i];
      if (prev === 0) break;
    }
    return true;
  })();
  return {
    ok: true, a0, headStart, bodyStart, stepOk,
    headZero: headSeq.findIndex((v) => v === 0),
    headSeq: headSeq.slice(headStart < 0 ? 0 : headStart, (headStart < 0 ? 0 : headStart) + 9),
    segCount: (() => { let n = 0; for (let s = head.wormNext; s; s = s.wormNext) n++; return n; })(),
    bodyStartVal: bodyStart >= 0 ? bodySeq[bodyStart] : -1,
  };
});
if (!fadeOut.ok) {
  check('召唤 EoW 出头段+段链', false, fadeOut.why ?? '');
} else {
  check('召唤 EoW：头/身段初值 alpha=255（不再钳 254）', fadeOut.a0.head === 255 && fadeOut.a0.body === 255, JSON.stringify(fadeOut.a0));
  check('EoW 渐显步长 -42/tick（自首次递减起逐 tick 恰 -42）', fadeOut.stepOk, `seq=${JSON.stringify(fadeOut.headSeq)}`);
  check('EoW 头首次递减后 ~7t 现身', fadeOut.headZero - fadeOut.headStart >= 5 && fadeOut.headZero - fadeOut.headStart <= 8,
    `start@t${fadeOut.headStart} zero@t${fadeOut.headZero}`);
  check('EoW 身段链门：头启动后身段才启动（前段 alpha<85）', fadeOut.bodyStart > fadeOut.headStart,
    `head@t${fadeOut.headStart} body@t${fadeOut.bodyStart} bodyStartVal=${fadeOut.bodyStartVal}`);
  check('EoW 段链生成（65 身+1 尾）', fadeOut.segCount >= 60, `segs=${fadeOut.segCount}`);
}

// ---------- 1. 层序（取最后一个完整帧的 drawImage 序） ----------
await page.evaluate(() => { window.__swGame.__ensureEow(); window.__swGame.__eowToView(); });
await new Promise((r) => setTimeout(r, 400));
const layerData = await page.evaluate(() => {
  const r = window.__swGame.renderer;
  const frames = r.__frames;
  // 取倒数第二帧（倒数第一帧可能尚未渲染完）
  const fr = frames[frames.length - 2] ?? [];
  const wormIdx = [], chunkIdx = [];
  fr.forEach((e, i) => {
    if (e.id !== null && e.id >= 13 && e.id <= 15) wormIdx.push(i);
    if (e.kind === 'chunk') chunkIdx.push(i);
  });
  const first = wormIdx[0] ?? -1, last = wormIdx[wormIdx.length - 1] ?? -1;
  return {
    frameDraws: fr.length, chunkDraws: chunkIdx.length, wormDraws: wormIdx.length,
    counts: { ...r.__counts }, scales: { ...r.__scales },
    chunkBefore: chunkIdx.filter((i) => i < first).length,
    chunkAfter: chunkIdx.filter((i) => i > last).length,
    chunkInside: chunkIdx.filter((i) => i > first && i < last).length,
  };
});
check('层序：蠕虫精灵同屏有绘制', layerData.wormDraws >= 20, `wormDraws=${layerData.wormDraws} frame=${layerData.frameDraws}`);
check('层序：蠕虫精灵画在墙 chunk 之后（前有 chunk）', layerData.chunkBefore >= 4, `before=${layerData.chunkBefore}`);
check('层序：蠕虫精灵画在 tile chunk 之前（后有 chunk）', layerData.chunkAfter >= 4, `after=${layerData.chunkAfter}`);
check('层序：蠕虫绘制区间内无 chunk 穿插', layerData.chunkInside === 0, `inside=${layerData.chunkInside}`);
check('层序：每段每帧恰好画一次（头/尾各 1，不双画）',
  layerData.counts[13] === 1 && layerData.counts[15] === 1,
  JSON.stringify({ c13: layerData.counts[13], c14: layerData.counts[14], c15: layerData.counts[15] }));

// ---------- 2. 专家体型（同帧 scales 采样：经典 → 翻专家） ----------
check('专家体型：经典档头段 scale=1（不放大）', layerData.scales[13] === 1, `classic=${layerData.scales[13]}`);
await page.evaluate(async () => {
  const g = window.__swGame;
  g.world.difficulty = 1;   // 专家档
  g.afterWorldLoad();       // 重跑 bindScaleStatsWorld（TS private 仅编译期；wireDD2Hooks 幂等）
  g.__ensureEow();
  const n = g.__eowToView();
  g.__eowInView = n;
  // 等 3 帧渲染完成后即采（避免长墙钟内头段下潜离屏）
  await new Promise((res) => { let k = 0; const step = () => { if (++k >= 3) res(); else requestAnimationFrame(step); }; requestAnimationFrame(step); });
});
const expertData = await page.evaluate(() => {
  const g = window.__swGame;
  const r = g.renderer;
  const frames = r.__frames;
  return { scales: { ...r.__scales }, inView: g.__eowInView ?? -1, frames: frames.length };
});
check('专家体型：专家档头段 scale=1.2（EoW ×1.2 上渲染）', Math.abs(expertData.scales[13] - 1.2) < 1e-6, `expert=${expertData.scales[13]}`);
check('专家体型：身/尾段同 ×1.2', Math.abs(expertData.scales[14] - 1.2) < 1e-6 && Math.abs(expertData.scales[15] - 1.2) < 1e-6,
  `body=${expertData.scales[14]} tail=${expertData.scales[15]}`);

// ---------- 3. BGM type 表（头段横向移出盒、身尾段在场 → 99） ----------
const musicOut = await page.evaluate(async () => {
  const g = window.__swGame;
  if (!g.__ensureEow()) return { ok: false, why: 'summon-fail' };
  g.__eowToView();
  const heads = g.entities.enemies.filter((e) => !e.dead && e.vanillaId === 13);
  for (const h of heads) { h.x += 7000; }   // 横向出盒（不动 y，避开下潜整链清除）
  const before = g.lastMusic;
  await new Promise((res) => { let n = 0; const step = () => { if (++n >= 40) res(); else requestAnimationFrame(step); }; requestAnimationFrame(step); });
  const nearSegs = g.entities.enemies.filter((e) => !e.dead
    && (e.vanillaId === 14 || e.vanillaId === 15)
    && Math.abs(e.cx - g.player.cx) < 5000 && Math.abs(e.cy - g.player.cy) < 5000).length;
  const headNear = g.entities.enemies.some((e) => !e.dead && e.vanillaId === 13
    && Math.abs(e.cx - g.player.cx) < 5000 && Math.abs(e.cy - g.player.cy) < 5000);
  return { ok: true, before, after: g.lastMusic, nearSegs, headNear };
});
if (!musicOut.ok) {
  check('BGM type 表前置：EoW 在场', false, musicOut.why ?? '');
} else {
  check('BGM type 表：头段出盒且身/尾段在场（前置条件）', musicOut.nearSegs >= 5 && !musicOut.headNear,
    `nearSegs=${musicOut.nearSegs} headNear=${musicOut.headNear}`);
  check('BGM type 表：触发 EoW 曲 99（13/14/15 任一段）', musicOut.after === 99,
    `before=${musicOut.before} after=${musicOut.after}`);
}

console.log(errors.length ? `PAGE ERRORS:\n${errors.slice(0, 5).join('\n')}` : 'NO PAGE ERRORS');
console.log(`\n${pass} passed, ${fail} failed`);
await browser.close();
process.exit(fail ? 1 : 0);
