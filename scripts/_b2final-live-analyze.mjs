// 活机探针结果分析:分段帧距/fps 读数/迁移
import fs from 'node:fs';
import readline from 'node:readline';

const SRC = '/Users/vinlic/.claude/projects/-Users-vinlic-Project-GLM-SandboxWorld/d3098226-687c-4541-b195-905156fcb457/tool-results/btibgo3od.txt';
const rl = readline.createInterface({ input: fs.createReadStream(SRC), crlfDelay: Infinity });
let jsonLine = null, capturing = false;
for await (const line of rl) {
  if (line.trim() === 'RESULT_JSON_START') { capturing = true; continue; }
  if (line.trim() === 'RESULT_JSON_END') break;
  if (capturing) jsonLine = (jsonLine ?? '') + line;
}
const d = JSON.parse(jsonLine);
const marks = d.events.filter(e => e.ev === 'mark');
const renderT = d.renderT, obsT = d.obsT;
console.log('marks:', marks.map(m => `${m.n}@${(m.t / 1000).toFixed(1)}`).join(' '));
console.log('obs callbacks:', obsT.length, 'renders:', renderT.length, `[beat] lines:`, d.beats.length);

const q = (arr, p) => arr[Math.min(arr.length - 1, Math.floor(p * (arr.length - 1)))];

function segment(name, t0, t1, expectK) {
  // t0/t1: mark 时刻(ms,performance.now 域);renderT 同域
  const renders = renderT.filter(t => t >= t0 && t < t1);
  const obs = obsT.filter(t => t >= t0 && t < t1);
  const gaps = [];
  for (let i = 1; i < renders.length; i++) gaps.push(renders[i] - renders[i - 1]);
  if (!gaps.length) { console.log(`${name}: no data`); return; }
  const gs = [...gaps].sort((a, b) => a - b);
  const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  const sd = Math.sqrt(gaps.reduce((a, b) => a + (b - mean) ** 2, 0) / gaps.length);
  const longGaps = gaps.filter(g => g > 13).length;
  // fps 读数(60 渲帧滚动窗,复算 game.fps 语义)
  const fps = [];
  for (let j = 60; j < gaps.length; j++) {
    let sum = 0; for (let k = j - 60; k < j; k++) sum += gaps[k];
    fps.push(1000 / (sum / 60));
  }
  const fs2 = [...fps].sort((a, b) => a - b);
  let cross = 0;
  for (let i = 1; i < fps.length; i++) if ((fps[i - 1] < 120) !== (fps[i] < 120)) cross++;
  const durS = (t1 - t0) / 1000;
  const skipRate = obs.length ? (1 - renders.length / obs.length) : 0;
  console.log(`${name} (${durS.toFixed(0)}s): obs=${obs.length} renders=${renders.length} skipRate=${(100 * skipRate).toFixed(2)}%` +
    ` gap p50=${q(gs, .5).toFixed(2)} p95=${q(gs, .95).toFixed(2)} max=${gs[gs.length - 1].toFixed(1)} >13ms:${longGaps}` +
    ` CV=${(sd / mean).toFixed(3)}` +
    (fps.length ? ` fps p05=${q(fs2, .05).toFixed(1)} p50=${q(fs2, .5).toFixed(1)} p95=${q(fs2, .95).toFixed(1)} cross120=${fps.length ? (cross / durS).toFixed(2) : '-'}/s` : ''));
}

const M = Object.fromEntries(marks.map(m => [m.n, m.t]));
segment('cap120-menu', M['cap120-subtle-menu'], M['menu-done'], 1);
// 世界内稳态:入世界后留 3s 入场结算(护栏期),取 [inworld+3s, steady-done]
segment('cap120-steady', M['inworld'] + 3000, M['steady-done'], 1);
segment('cap60', M['cap60-begin'] + 2000, M['cap60-done'], 2);
segment('cap30', M['cap30-begin'] + 2000, M['cap30-done'], 4);
segment('cap120-again', M['cap120-again'] + 2000, M['done'], 1);
console.log('\n[beat] lines:');
for (const b of d.beats) console.log(`  t+${(b.t / 1000).toFixed(1)}s ${b.text.slice(0, 150)}`);
// 游戏侧 fps 读数采样(200ms 轮询)
const gf = d.fpsSeries.filter(x => x.fps != null && x.t >= M['inworld'] + 3000 && x.t < M['steady-done']).map(x => x.fps);
if (gf.length) {
  const gs2 = [...gf].sort((a, b) => a - b);
  let cross = 0;
  for (let i = 1; i < gf.length; i++) if ((gf[i - 1] < 120) !== (gf[i] < 120)) cross++;
  console.log(`\ngame.fps poll(cap120 steady): p10=${q(gs2, .1).toFixed(1)} p50=${q(gs2, .5).toFixed(1)} p90=${q(gs2, .9).toFixed(1)} min=${gs2[0].toFixed(1)} max=${gs2[gs2.length - 1].toFixed(1)} cross120=${(cross / ((M['steady-done'] - M['inworld'] - 3000) / 1000)).toFixed(2)}/s`);
}
