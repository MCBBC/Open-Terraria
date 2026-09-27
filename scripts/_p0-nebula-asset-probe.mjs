// ★P0-A/P0-B 星云案探针（2026-09-27）：线上资产面缺图 → projSprite 404 → 兜底支判别。
// 红绿两相：
//   GREEN 相（P0-A 补齐后）：Projectile_618.png 请求 200 → projSprite 就绪（14×20）→
//     GL 层 quadSprite(14×20 纹理) 命中>0（贴图 quad 发射）且 acc 窗 stroke/fill
//     路径 op 零增量（P0-B:兜底支不再走）+ raw 2D 网零增量（降级态 blindness 守卫）。
//   RED 相（模拟线上资产面缺 618:请求拦截 abort）：请求 404 → projSprite 恒 null →
//     quadSprite(14×20)=0 且 stroke 零增量（旧码每帧 stroke→rasterizePathOp→整幅
//     上传,单元锁 tests/p0-fallback-zero-upload.test.ts B 证该链）。
// ★插桩注:GLShimExecutor.wrap() 的热方法构造期预绑定→drawImage 原型补丁对既有
//   实例不可见（_p0-debug-draw 判例 exTotalDraw=0）;quadSprite/accTailOp 走调用期
//   属性查找,原型补丁对既有实例生效。
// 运行：SW_ORIGIN=http://localhost:5237 node tools/run-diag.mjs scripts/_p0-nebula-asset-probe.mjs
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5237';

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1024, height: 720 } });

async function boot(block618) {
  const page = await browser.newPage();
  const req618 = [];
  if (block618) {
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      if (req.url().includes('/sprites/vanilla/Projectile_618.png')) { req618.push('ABORT'); req.abort('failed'); return; }
      req.continue();
    });
  } else {
    page.on('response', (res) => {
      if (res.url().includes('/sprites/vanilla/Projectile_618.png')) req618.push(res.status());
    });
  }
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 120)));
  await page.evaluateOnNewDocument(() => { try { localStorage.setItem('sw.welcome.announce.acked', '1'); } catch { /* ignore */ } });
  await page.goto(ORIGIN + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
  let inGame = false;
  for (let i = 0; i < 150 && !inGame; i++) {
    inGame = await page.evaluate(() => !!(window.__swGame && window.__swGame.renderer)).catch(() => false);
    if (!inGame) await new Promise((r) => setTimeout(r, 2000));
  }
  if (!inGame) throw new Error('未进游戏: ' + errors.slice(0, 2).join('|'));
  await page.evaluate(async () => { await window.__swGame.newWorld('p0nebula', 2400, 1000, () => {}); });
  await new Promise((r) => setTimeout(r, 1200));

  await page.evaluate(async () => {
    const { GLShimExecutor } = await import('/src/render/glshim/GLShimExecutor.ts');
    const { GLSpriteLayer } = await import('/src/render/GLSpriteLayer.ts');
    const { Arrow, projSprite, projSpriteHealth } = await import('/src/entities/Arrow.ts');
    const P = GLShimExecutor.prototype;
    const LP = GLSpriteLayer.prototype;
    const probe = {
      q14x20: 0, quadsTotal: 0, exStroke: 0, exFill: 0, attachAccN: 0,
      rawDraw14x20: 0, rawStrokeBig: 0, rawStrokeSmall: 0,
    };
    if (!LP.__p0patched) {
      const oQuad = LP.quadSprite;
      LP.quadSprite = function (e, ...rest) {
        probe.quadsTotal++;
        try { if (e && e.w === 14 && e.h === 20) probe.q14x20++; } catch { /* ignore */ }
        return oQuad.apply(this, [e, ...rest]);
      };
      LP.__p0patched = true;
    }
    if (!P.__p0patched) {
      const oAtt = P.attachAcc;
      P.attachAcc = function (...a) { probe.attachAccN++; return oAtt.apply(this, a); };
      const oTail = P.accTailOp;
      P.accTailOp = function (op, args) {
        if (op === 'stroke') probe.exStroke++;
        if (op === 'fill') probe.exFill++;
        return oTail.call(this, op, args);
      };
      P.__p0patched = true;
    }
    const RP = CanvasRenderingContext2D.prototype;
    if (!RP.__p0patched) {
      const oRDraw = RP.drawImage;
      RP.drawImage = function (img, ...rest) {
        try { if (img && img.width === 14 && img.height === 20) probe.rawDraw14x20++; } catch { /* ignore */ }
        return oRDraw.apply(this, [img, ...rest]);
      };
      const oRStroke = RP.stroke;
      RP.stroke = function (...a) {
        try {
          const w = (this.canvas && this.canvas.width) || 0;
          if (w >= 900) probe.rawStrokeBig++; else probe.rawStrokeSmall++;
        } catch { /* ignore */ }
        return oRStroke.apply(this, a);
      };
      RP.__p0patched = true;
    }
    window.__nebulaProbe = probe;
    void Arrow; void projSprite;
  });

  // 1s 环境基线采样（无 618 时 ambient stroke/quad 增量）
  await new Promise((r) => setTimeout(r, 1000));
  const baseline = await page.evaluate(() => {
    const p = window.__nebulaProbe;
    return {
      q14x20: p.q14x20, exStroke: p.exStroke, exFill: p.exFill,
      rawDraw14x20: p.rawDraw14x20, rawStrokeBig: p.rawStrokeBig, rawStrokeSmall: p.rawStrokeSmall,
    };
  });

  // 放样 618（GREEN 相先踢加载等就绪;RED 相恒缺图）
  const armed = await page.evaluate(async () => {
    const { Arrow, projSprite, projSpriteHealth } = await import('/src/entities/Arrow.ts');
    const g = window.__swGame;
    projSprite(618);   // 踢加载（GREEN 相;RED 相 onerror→TTL,恒 null）
    for (let i = 0; i < 60; i++) {
      const h = projSpriteHealth([618])[0];
      if (h?.cached) break;
      await new Promise((r) => setTimeout(r, 50));
    }
    const px = g.player.x + g.player.w / 2, py = g.player.y - 60;
    const spawned = [];
    for (let k = 0; k < 5; k++) {
      const a = new Arrow(px + k * 16, py, (k % 2 ? 0.3 : -0.3), -0.1, 20, 0, 618, null);
      g.entities.add(a, 'projectiles');
      spawned.push(a);
    }
    window.__p0spawned = spawned;
    return { sprAtSpawn: projSpriteHealth([618])[0] };
  });

  // 采样窗 ~2.5s（RAF 实时渲染）
  await new Promise((r) => setTimeout(r, 2500));

  const result = await page.evaluate(async () => {
    const { projSpriteHealth } = await import('/src/entities/Arrow.ts');
    const alive = (window.__p0spawned ?? []).filter((a) => !a.dead).length;
    return { probe: window.__nebulaProbe ?? null, health: projSpriteHealth([618])[0], alive };
  });
  await page.close();
  const p = result.probe ?? {};
  const delta = {
    q14x20: (p.q14x20 ?? 0) - baseline.q14x20,
    exStroke: (p.exStroke ?? 0) - baseline.exStroke,
    exFill: (p.exFill ?? 0) - baseline.exFill,
    rawDraw14x20: (p.rawDraw14x20 ?? 0) - baseline.rawDraw14x20,
    rawStrokeBig: (p.rawStrokeBig ?? 0) - baseline.rawStrokeBig,
    rawStrokeSmall: (p.rawStrokeSmall ?? 0) - baseline.rawStrokeSmall,
  };
  return { req618, sprAtSpawn: armed.sprAtSpawn, health: result.health, alive: result.alive, delta, amb: baseline };
}

// ---- GREEN 相（资产就绪）----
let green = null;
try { green = await boot(false); } catch (e) { console.error('GREEN 相失败:', String(e).slice(0, 300)); }

// ---- RED 相（模拟线上缺 618）----
let red = null;
try { red = await boot(true); } catch (e) { console.error('RED 相失败:', String(e).slice(0, 300)); }

console.log('=== P0 星云案探针结果 ===');
console.log('GREEN(补齐):', JSON.stringify({
  req618: green?.req618?.slice(0, 2), sprAtSpawn: green?.sprAtSpawn, health: green?.health,
  alive: green?.alive, delta: green?.delta,
}));
console.log('RED(缺图):', JSON.stringify({
  req618: red?.req618?.slice(0, 2), sprAtSpawn: red?.sprAtSpawn, health: red?.health,
  alive: red?.alive, delta: red?.delta,
}));

// ---- 判定 ----
const okGreen = !!green && green.req618.some((s) => s === 200)
  && green.health?.cached === true && green.health?.w === 14 && green.health?.h === 20
  && green.delta.q14x20 > 0
  && green.delta.exStroke === 0 && green.delta.exFill === 0
  && green.delta.rawStrokeBig === 0 && green.delta.rawStrokeSmall === 0;
const okRed = !!red && red.req618.length > 0
  && red.health?.cached === false
  && red.delta.q14x20 === 0 && red.delta.rawDraw14x20 === 0
  && red.delta.exStroke === 0 && red.delta.exFill === 0
  && red.delta.rawStrokeBig === 0 && red.delta.rawStrokeSmall === 0;
console.log(`P0-A ${okGreen ? 'GREEN' : 'RED'} / P0-B(缺图零兜底op,两相零stroke) ${okRed ? 'GREEN' : 'RED'}`);
await browser.close();
process.exit(okGreen && okRed ? 0 : 1);
