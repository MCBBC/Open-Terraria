// 血肉墙渲染探针 v5(行为+身份双验证):
//  1) drawImage 调用计数(按贴图 src):墙身每帧 ~屏高/16 条 WallOfFlesh +
//     每饥饿者 1 条 Chain12 肌腱链段循环 + 舌头链段——三代码路径是否真的在跑;
//  2) 墙列像素 vs WallOfFlesh.png 纹理逐像素相关(3 帧取最优):均值差 <10 即
//     平铺/帧行/翻转/顶沿对齐全部正确;
//  3) 头下方覆盖(纵向画到屏底)。
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
let r = null;
for (let att = 0; att < 12 && r === null; att++) {
  try {
    await page.goto(`${ORIGIN}/?play=small`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    r = await page.evaluate(() => new Promise((res, rej) => {
      const t0 = Date.now();
      const iv = setInterval(async () => {
        if (window.__swGame?.player) {
          clearInterval(iv);
          try {
            const g = window.__swGame;
            const boss = await import('/src/entities/bossAI.ts');
            const { BuffType } = await import('/src/stats/Buffs.ts');
            const out = {};
            const head = boss.spawnVanillaEnemy(g, 113, Math.round(g.player.x) + 400, Math.round(g.player.y));
            if (!head) { res({ headSpawned: false }); return; }
            await new Promise((r2) => setTimeout(r2, 400));
            g.player.x = head.x - 500 - g.player.w / 2;
            g.player.y = head.cy - g.player.h / 2;
            g.player.vx = 0; g.player.vy = 0;
            g.player.buffs.apply(BuffType.TheTongue, 60);
            g.camera.zoomTarget = 1.25; g.camera.zoom = 1.25;
            if (g.renderer) g.renderer.fullbright = true;
            g.camera.x = head.cx - 100; g.camera.y = head.cy;
            for (let w = 0; w < 100; w++) {
              const hh0 = g.entities.all().find((e) => e.vanillaId === 113);
              if (hh0 && !hh0.dead && hh0.cy > 10000) break;   // 等 Y 吸附地狱带(慢启动防护)
              await new Promise((r2) => setTimeout(r2, 200));
            }
            await new Promise((r2) => setTimeout(r2, 1500));
            const h = g.entities.all().find((e) => e.vanillaId === 113);
            if (!h || h.dead) { res({ headGone: true }); return; }
            // ---- 1) drawImage 计数(1.2s 窗口 / rAF 帧数) ----
            const counts = { wof: 0, chain12: 0, other: 0 };
            let frames = 0;
            const orig = CanvasRenderingContext2D.prototype.drawImage;
            CanvasRenderingContext2D.prototype.drawImage = function (...args) {
              const im = args[0];
              const src = im && im.src ? String(im.src) : '';
              if (src.includes('WallOfFlesh')) counts.wof++;
              else if (src.includes('Chain12')) counts.chain12++;
              else counts.other++;
              return orig.apply(this, args);
            };
            const countFrames = () => { frames++; requestAnimationFrame(countFrames); };
            requestAnimationFrame(countFrames);
            await new Promise((r2) => setTimeout(r2, 1200));
            CanvasRenderingContext2D.prototype.drawImage = orig;
            out.drawPerFrame = {
              frames,
              wof: +(counts.wof / Math.max(1, frames)).toFixed(1),
              chain12: +(counts.chain12 / Math.max(1, frames)).toFixed(1),
            };
            // ---- 2) 纹理身份相关 ----
            const cv = g.renderer.canvas, cam = g.camera, z = cam.zoom;
            const eyes = g.entities.all().filter((e) => e.vanillaId === 114 && !e.dead);
            const eyeTop = eyes.find((e) => e.ai0 > 0), eyeBot = eyes.find((e) => e.ai0 < 0);
            const span = eyeTop && eyeBot ? Math.max(160, 2 * (eyeBot.cy - eyeTop.cy)) : 160;
            const top = h.cy - span / 2;
            out.geom = { headCY: Math.round(h.cy), facing: h.facing, span: Math.round(span), top: Math.round(top) };
            const wx = h.facing > 0 ? h.x - 80 : h.x;
            const tex = await new Promise((r2) => {
              const im = new Image();
              im.onload = () => {
                const c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
                c.getContext('2d').drawImage(im, 0, 0);
                r2(c.getContext('2d').getImageData(0, 0, im.width, im.height));
              };
              im.onerror = () => r2(null);
              im.src = 'sprites/vanilla/WallOfFlesh.png';
            });
            if (tex) {
              // 嘴(113)精灵盖在头中心带,身份采样取其下方多条 16px 横条,逐条对 3 帧求最优均差
              // 采样前把相机钉回头上(头会随空腔平滑漂移),采样带避开嘴(212px 高,盖 cy±106)
              g.camera.x = h.cx - 100; g.camera.y = h.cy;
              await new Promise((r2) => setTimeout(r2, 120));
              // 对齐 16px 横条网格:采样带起点须满足 (yWorld-top)%140 为 16 的倍数
              // (帧内条带边界),否则纹理行错位 → 相关性崩
              // 首行起点 num2' = top - rows*140(rows= floor((top-screenTop)/140)+1,:37836-37844)
              // 140 非 16 倍数 → 条带网格相位随 rows 漂移,须按渲染同式对齐
              const screenTop = cam.y - cv.height / (2 * z);
              const rowsN = Math.floor((top - screenTop) / 140) + 1;
              const num2p = top - rowsN * 140;
              const snapRow = (want) => want - (((want - num2p) % 16) + 16) % 16;
              const yWorlds = [130, 210].map((d) => snapRow(Math.round(h.cy + d)));
              const texD = tex.data, TW = tex.width;
              const strips = [];
              for (const yWorld of yWorlds) {
                const [sx, sy] = [Math.round(cv.width / 2 + (wx - cam.x) * z), Math.round(cv.height / 2 + (yWorld - cam.y) * z)];
                const x0 = Math.max(0, sx), y0 = Math.max(0, sy);
                // zoom 缩放:canvas 像素 = 世界像素×z——采样 (190×z)×(16×z) canvas 块,
                // 纹理 texel (x,yy) 对应 canvas 最近邻 (floor(x·z), floor(yy·z))
                const CW = Math.ceil(190 * z) + 2, CH = Math.ceil(16 * z) + 2;
                if (x0 + CW > cv.width || y0 + CH > cv.height) { strips.push({ offscreen: true }); continue; }
                const strip = cv.getContext('2d').getImageData(x0, y0, CW, CH).data;
                const jOff = ((yWorld - num2p) % 140 + 140) % 140;   // 帧内行偏移(以首行起点为基)
                // 只比纹理不透明处(ta≥128)的 RGB——纹理自身透明洞处画布透出背景属预期
                const diffs = [];
                for (let f = 0; f < 3; f++) {
                  let d = 0, n = 0;
                  for (let x = 0; x < 190; x++) {
                    for (let yy = 0; yy < 16; yy++) {
                      const ti = ((f * 140 + jOff + yy) * TW + x) * 4;
                      if (texD[ti + 3] < 128) continue;
                      const ci = (Math.floor(yy * z) * CW + Math.floor(x * z)) * 4;
                      n++;
                      d += Math.abs(strip[ci] - texD[ti]) + Math.abs(strip[ci + 1] - texD[ti + 1]) + Math.abs(strip[ci + 2] - texD[ti + 2]);
                    }
                  }
                  diffs.push(n ? { n, rgbDiff: +(d / n).toFixed(1) } : null);
                }
                // 均色对照 + 横向位移搜索(±20px,排查 X 对位偏差)
                let tR = 0, tG = 0, tB = 0, tn = 0, cR = 0, cG = 0, cB = 0, cn = 0, cOp = 0;
                for (let x = 0; x < 190; x++) for (let yy = 0; yy < 16; yy++) {
                  const ti = ((jOff + yy) * TW + x) * 4;
                  if (texD[ti + 3] >= 10) { tn++; tR += texD[ti]; tG += texD[ti + 1]; tB += texD[ti + 2]; }
                  const ci = (Math.floor(yy * z) * CW + Math.floor(x * z)) * 4;
                  if (strip[ci + 3] >= 10) { cn++; cOp++; cR += strip[ci]; cG += strip[ci + 1]; cB += strip[ci + 2]; }
                }
                const shiftBest = [];
                for (let sh = -20; sh <= 20; sh++) {
                  let d = 0, n = 0;
                  for (let x = Math.max(0, -sh); x < Math.min(190, 190 - sh); x++) {
                    for (let yy = 0; yy < 16; yy++) {
                      const ci = (Math.floor(yy * z) * CW + Math.floor((x + sh) * z)) * 4;
                      const ca = strip[ci + 3];
                      const ti = ((0 * 140 + jOff + yy) * TW + x) * 4;
                      const ta = texD[ti + 3];
                      if (ca < 10 && ta < 10) continue;
                      n++;
                      d += Math.abs(strip[ci] - texD[ti]) + Math.abs(strip[ci + 1] - texD[ti + 1]) + Math.abs(strip[ci + 2] - texD[ti + 2]);
                    }
                  }
                  if (n > 500) shiftBest.push([sh, +(d / n).toFixed(1)]);
                }
                shiftBest.sort((a, b) => a[1] - b[1]);
                const vals = diffs.filter((v) => v != null).map((v) => v.rgbDiff);
                strips.push({
                  rowOff: jOff, perFrameMeanDiff: diffs, best: vals.length ? Math.min(...vals) : null,
                  texAvg: tn ? [Math.round(tR / tn), Math.round(tG / tn), Math.round(tB / tn)] : null,
                  texOpaquePct: Math.round((tn / (190 * 16)) * 100),
                  cvsAvg: cn ? [Math.round(cR / cn), Math.round(cG / cn), Math.round(cB / cn)] : null,
                  cvsOpaquePct: Math.round((cn / (190 * 16)) * 100),
                  bestShift: shiftBest.slice(0, 3),
                });
              }
              out.identity = strips;
            }
            // ---- 3) 头下方覆盖 ----
            const region = (wx0, wy0, ww, wh) => {
              const x0 = Math.max(0, Math.round(cv.width / 2 + (wx0 - cam.x) * z));
              const y0 = Math.max(0, Math.round(cv.height / 2 + (wy0 - cam.y) * z));
              const w = Math.min(Math.round(ww * z), cv.width - x0), hh = Math.min(Math.round(wh * z), cv.height - y0);
              if (w <= 4 || hh <= 4) return { err: 'offscreen' };
              const d = cv.getContext('2d').getImageData(x0, y0, w, hh).data;
              let total = 0, flesh = 0;
              for (let i = 0; i < d.length; i += 4) {
                if (d[i + 3] < 10) continue;
                total++;
                if (d[i] > d[i + 2] + 15 && d[i] < 210) flesh++;
              }
              return { fleshPct: total ? Math.round((flesh / total) * 100) : 0 };
            };
            out.belowHead = region(wx + 30, h.cy + 150, 130, 150);
            out.hungry = g.entities.all().filter((e) => e.vanillaId === 115 && !e.dead).length;
            out.tongued = g.player.buffs.has(BuffType.TheTongue);
            res(out);
          } catch (e) { rej(String(e && e.message || e)); }
        } else if (Date.now() - t0 > 120000) { clearInterval(iv); rej('boot timeout'); }
      }, 200);
    }));
  } catch (e) { console.log(`attempt ${att} failed: ${e}`); r = null; }
}
console.log(JSON.stringify(r, null, 2));
await browser.close();
