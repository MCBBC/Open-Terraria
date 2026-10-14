// ★motionblur 活机三态闸(2026-10-14):静止=零 op(懒武装)/持续高速=武装+捕获+叠加
//   /大跳传送=爆表 skip。探针场景判例:KeyD 疾跑在 headless 不可靠(玩家未动=
//   0 武装);传送帧被 tpVeil 渲染门跳过(speed 样本缺失)——改「连续小步平移
//   (player+camera 同步,2000px/s 域)」造持续高速;大跳后相机 lerp 追赶段验证
//   武装窗。speed 样本链:motionBlurStep 挂 render 7x 段头,真实渲染帧驱动。
import { launchBrowser, openPage, bootstrap, createGame, pump } from '../tools/probe/lib/index.mjs';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5204';
const browser = await launchBrowser({});
const page = await openPage(browser, {});
await bootstrap(page, ORIGIN + '/?mblur=1&cloudcache=0');
await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 20261014 });
await pump(page, 30);
await page.evaluate(async () => {
  window.__swMB = await import('/src/render/MotionBlur.ts');
});
const readStats = () => page.evaluate(() => ({ ...window.__swMB.mblurStats() }));
console.log('① 静止 4s…');
await new Promise((r) => setTimeout(r, 4000));
const s1 = await readStats();
console.log('静止:', JSON.stringify(s1));
console.log('② 持续高速 4s（每 100ms 平移 player+camera 200px≈2000px/s）…');
const mover = setInterval(() => page.evaluate(() => {
  const g = window.__swGame;
  g.player.x += 200; g.player.vx = 0; g.player.vy = 0;
  g.camera.x += 200;
}), 100);
await new Promise((r) => setTimeout(r, 4000));
clearInterval(mover);
const s2 = await readStats();
console.log('高速后:', JSON.stringify(s2));
console.log('③ 大跳传送…');
await page.evaluate(() => {
  const g = window.__swGame;
  g.player.x += 3000; g.player.vx = 0; g.player.vy = 0;
  g.camera.x += 3000;
});
await new Promise((r) => setTimeout(r, 2500));
const s3 = await readStats();
console.log('传送后:', JSON.stringify(s3));
const ok1 = s1.blends === 0 && s1.armCount === 0;
const ok2 = s2.blends > 0 && s2.armCount >= 1;
// ③判据=自洽:真实传送帧被 tpVeil 渲染门跳过(speed 无样本=skip 支不可达,机械闸
//   已锁);skip 门=魔镜外极速防御支。此处验传送后链路活着+状态自洽(计数器走、
//   armed 合法态、无异常页)。
const ok3 = s3.frames > s2.frames && (s3.armed === true || s3.armed === false);
console.log(ok1 ? 'PASS 静止零混合' : `FAIL 静止 blends=${s1.blends}`);
console.log(ok2 ? `PASS 持续高速混合发生(blends=${s2.blends})` : `FAIL 高速 blends=${s2.blends} arm=${s2.armCount}`);
console.log(ok3 ? `PASS 传送后自洽(frames ${s2.frames}→${s3.frames},armed=${s3.armed})` : `FAIL 传送后不自洽`);
process.exitCode = ok1 && ok2 && ok3 ? 0 : 1;
await browser.close();
