// ★BJ669 插桩：864 draw 的 ctx 调用实录（translate/rotate/drawImage/globalAlpha 序列
//  + img 尺寸）——定位辉光 4 份相对本体的实际偏移与图源。
// 用法(game/ 下): SW_ORIGIN=http://localhost:5207 node tools/run-diag.mjs scripts/_bj669-hook-probe.mjs
import { launchBrowser, openPage, bootstrap, createGame } from '../tools/probe/lib/index.mjs';

const browser = await launchBrowser({});
const page = await openPage(browser, {});
await bootstrap(page, process.env.SW_ORIGIN);
await createGame(page, { mode: 'direct', seed: 'bj669h', size: 'small' });
await page.evaluate(async () => {
  const { options } = await import('/src/core/Options.ts');
  options.data.backgroundRun = true;
  options.data.playWhenUnfocused = true;
  window.__swGame.enemySpawnEnabled = false;
  const g = window.__swGame;
  const { MinionProj } = await import('/src/entities/MinionProj.ts');
  const { buffTypeByVanilla } = await import('/src/stats/Buffs.ts');
  const m = new MinionProj(g.player.cx + 40, g.player.cy - 60, 864, 6, 0, false, 0, false, () => g.player);
  g.entities.add(m, 'projectiles');
  const bt = buffTypeByVanilla(271);
  if (bt !== undefined) g.player.buffs.set(bt, 3600);
});
await new Promise((r) => setTimeout(r, 1500));
const log = await page.evaluate(() => new Promise((resolve) => {
  const g = window.__swGame;
  const m = g.entities.projectiles.find((p) => p.projId === 864 && !p.dead);
  const calls = [];
  // 包一层实体专属 ctx：直接包装 renderer.ctx（记录 1 拍的全部调用）
  const r = g.renderer;
  const orig = {
    translate: r.ctx.translate.bind(r.ctx),
    rotate: r.ctx.rotate.bind(r.ctx),
    scale: r.ctx.scale.bind(r.ctx),
    save: r.ctx.save.bind(r.ctx),
    restore: r.ctx.restore.bind(r.ctx),
    drawImage: r.ctx.drawImage.bind(r.ctx),
  };
  let capturing = false;
  r.ctx.translate = (...a) => { if (capturing) calls.push(['translate', a.map((v) => +Number(v).toFixed(2))]); orig.translate(...a); };
  r.ctx.rotate = (...a) => { if (capturing) calls.push(['rotate', a.map((v) => +Number(v).toFixed(3))]); orig.rotate(...a); };
  r.ctx.scale = (...a) => { if (capturing) calls.push(['scale', a.map((v) => +Number(v).toFixed(2))]); orig.scale(...a); };
  r.ctx.drawImage = (img, ...a) => {
    if (capturing) calls.push(['drawImage', [img.width, img.height, ...a.slice(0, 6).map((v) => typeof v === 'object' ? `${v.width}x${v.height}` : +Number(v).toFixed(2))]]);
    orig.drawImage(img, ...a);
  };
  capturing = true;
  m.draw(r);
  capturing = false;
  r.ctx.translate = orig.translate; r.ctx.rotate = orig.rotate; r.ctx.scale = orig.scale; r.ctx.drawImage = orig.drawImage;
  resolve({ calls: calls.slice(0, 200), px: m.x, py: m.y, cx: m.cx, cy: m.cy, rot: m.rot, w: m.w, h: m.h });
}));
console.log(JSON.stringify(log, null, 1));
await browser.close();
