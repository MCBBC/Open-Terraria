// 刀 M 探针：收场 PlayerSegment 玩家形象段实机取证（BJ409 债#1 清偿验证）。
// 用法：SW_ORIGIN=http://localhost:5410 SW_EVIDENCE=docs/evidence/credits \
//   node tools/run-diag.mjs scripts/_m-credits-player-probe.mjs
// 取证：①确定性单帧像素证据（离屏 canvas 直调 drawCreditsRollSky——玩家落点带
//   非透明像素,窗外对照带=0）②实拍三帧（下落中段/落地站位/回头帧,inst.t 钉针防漂）
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const origin = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const OUT = process.env.SW_EVIDENCE ?? '/tmp/m-credits';
import { mkdirSync } from 'node:fs';
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e).slice(0, 300)));
await page.goto(`${origin}/?play=small`, { waitUntil: 'domcontentloaded', timeout: 60000 });
let inWorld = false;
for (let i = 0; i < 240; i++) {
  await sleep(500);
  inWorld = await page.evaluate(() => !!document.querySelector('.sw-hotbar')).catch(() => false);
  if (inWorld && i > 8) break;
}
if (!inWorld) { console.log(JSON.stringify({ fatal: 'world boot timeout', errs })); await browser.close(); process.exit(1); }
await sleep(3000);
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find((x) => /我已知晓|Got it/.test(x.textContent ?? ''));
  if (b) b.click();
});
await sleep(800);

// ① 触发演出 + 确定性单帧像素证据（离屏直调,排除渲染管线竞争）
const px = await page.evaluate(async () => {
  const cr = await import('/src/world/CreditsRoll.ts');
  const comp = await import('/src/world/creditsRollComposer.ts');
  const ov = await import('/src/ui/CreditsRollOverlay.ts');
  const fill = comp.getCreditsRollFill(true);
  const p = fill.segments.find((s) => s.k === 'player');
  cr.creditsRoll.tryStarting(fill.endTime);
  // ?play=small 旁路无角色选择 → 外观可能缺省：补 vanilla 缺省外观
  // （= Player.cs:199-205 默认色,CopyVisuals(Main.LocalPlayer) 的探针供给）
  const g = window.__swGame;
  if (g && !g.player.appearance) {
    g.player.appearance = {
      name: 'probe', hair: 0, skinVariant: 0,
      hairColor: { r: 215, g: 90, b: 55 }, skinColor: { r: 255, g: 125, b: 90 },
      eyeColor: { r: 105, g: 90, b: 75 }, shirtColor: { r: 175, g: 165, b: 140 },
      undershirtColor: { r: 160, g: 180, b: 215 }, pantsColor: { r: 255, g: 230, b: 175 },
      shoeColor: { r: 160, g: 105, b: 60 }, difficulty: 0, team: 0,
    };
  }
  const inst = ov.mountCreditsRollOverlay(document.body, { canPlay: () => true });
  inst.active = true; inst.wants = true; inst.opacity = 1;
  // 离屏单帧：锚 = 画布中心(640,400)；玩家 py = 400 + (dy + disp)
  const cv = document.createElement('canvas'); cv.width = 1280; cv.height = 800;
  const ctx = cv.getContext('2d');
  const drawOnce = async (t) => {
    inst.t = t;
    ctx.clearRect(0, 0, 1280, 800);
    ov.drawCreditsRollSky(ctx, 1280, 800, 1);
    await new Promise((r) => setTimeout(r, 300));   // loadSheet 异步落地（页内无 sleep）
    ov.drawCreditsRollSky(ctx, 1280, 800, 1);
  };
  const bandLit = (x0, y0, w, h) => {
    const d = ctx.getImageData(x0, y0, w, h).data;
    let lit = 0;
    for (let i = 3; i < d.length; i += 16) if (d[i] > 10) lit++;
    return lit;
  };
  // 下落中段（local=30）：dy=-130+67.5 → py=337.5,身体带 [615,665]×[290,345]
  await drawOnce(p.t + 30);
  const fallLit = bandLit(615, 290, 50, 55);
  const fallNegative = bandLit(615, 500, 50, 55);   // 同帧远离带（对照）
  // 落地站位（local=150）：py=360,身体带 [615,665]×[312,366]
  await drawOnce(p.t + 150);
  const landedLit = bandLit(615, 312, 50, 54);
  // 窗外对照（local=-10）：同带应为空（窗门）
  await drawOnce(p.t - 10);
  const outsideLit = bandLit(615, 280, 50, 90);
  // 窗后（local=600 淡出完）：应全透明
  await drawOnce(p.t + 600);
  const afterLit = bandLit(615, 280, 50, 90);
  return { playerT: p.t, fallLit, fallNegative, landedLit, outsideLit, afterLit,
    appearanceSet: !!(window.__swGame?.player?.appearance) };
});

// ② 实拍三帧（inst.t 钉针 16ms 防 Game tick 漂移）
async function shoot(label, t) {
  await page.evaluate(async (tt) => {
    const ov = await import('/src/ui/CreditsRollOverlay.ts');
    const inst = ov.mountCreditsRollOverlay(document.body, { canPlay: () => true });
    inst.active = true; inst.wants = true; inst.opacity = 1;
    if (window.__mPin) clearInterval(window.__mPin);
    window.__mPin = setInterval(() => { inst.t = tt; }, 16);
  }, t);
  await sleep(600);
  await page.screenshot({ path: `${OUT}/${label}.png` });
  await page.evaluate(() => { clearInterval(window.__mPin); window.__mPin = null; });
}
const pT = px.playerT;
await shoot('m-player-falling', pT + 30);     // 下落中段（跳跃行5、半透淡入）
await shoot('m-player-landed', pT + 150);     // 落地站位（人群中央,朝右）
await shoot('m-player-lookleft', pT + 250);   // LookAt(-1) 回头
console.log(JSON.stringify({ px, shots: ['m-player-falling', 'm-player-landed', 'm-player-lookleft'], errs: errs.slice(0, 5) }, null, 1));
await browser.close();
process.exit(0);
