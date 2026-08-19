// npm run play:带 GPU/JS 堆旗标【冷启动】Chrome 打开游戏。
//
// 为什么需要脚本而不是一行 `open -na … --args`:Chrome 有进程单例——已在运行时,
// `open` 的 URL 会被转发给既有实例开新 tab(--args 旗标全部丢失)。而
// --force-gpu-mem-available-mb / --js-flags 只对冷启动的进程生效。
// 本脚本流程:
//   ① 探活目标端口(vite preview 没起给提示,不阻断);
//   ② pgrep 检测 Chrome 在跑 → TTY 下询问是否优雅退出(osascript quit,Chrome
//     会话可恢复);非交互(无 TTY)默认【拒绝退出】只报错——防脚本/CI 误杀浏览器,
//     明确自动退出须 SW_PLAY_QUIT=1;
//   ③ 等 Chrome 全退(最多 20s,有模态对话框会超时报错);
//   ④ open -na 冷启动(此时旗标保证生效)。不用独立 user-data-dir——那会丢
//     默认 profile 的 IndexedDB 存档。
// 用法:node scripts/play.mjs [url]        缺省 http://localhost:4173
//   SW_PLAY_QUIT=1  跳过询问直接优雅退出重启(CI/脚本用)
//   SW_PLAY_DRY=1   只打印将执行的 open 命令(测试用,不启动不退出)
//   --trace / npm run playtrace:GPU 崩溃取证档——不经 open 而是直接 spawn
//     Chrome 二进制,stderr 落 game/logs/gpu-stderr-<时间戳>.log。
//     --enable-logging=stderr 后 Chrome 自带 [pid:tid:MMDD/HHMMSS:severity:file(line)]
//     前缀:IOSurface 分配失败(io_surface.cc)、上下文死亡、swapchain 报错全部
//     带时间戳落盘——DevTools Performance 录不到的正是这些(2026-08-19 双开
//     trace 两份皆"健康侧",真铁证一直在 stderr)。缺省 --log-level=1(WARNING+,
//     覆盖全部 ERROR 级失败行);SW_PLAY_TRACE_LEVEL=0 可放开到 INFO(量大)。
import { spawnSync, execSync, spawn } from 'node:child_process';
import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import readline from 'node:readline/promises';

const CHROME = 'Google Chrome';
// ★2026-08-18 实证(Chromium 源码 + 双窗探针):--force-gpu-mem-available-mb 已移除——
// 它只设 cc 合成器 tile 光栅预算(blink/common/switches.cc 注释 "GPU resources in
// cc"),与画布后备存储/WebGL 纹理/SharedImage 无关,对我们的多开崩溃是安慰剂。
// 双开风暴真根因=GPU 进程 IOSurface 分配失败(io_surface.cc "Failed to allocate
// IOSurface of size 16x16" 级,按张计费非字节),Chrome 旗标救不了,靠游戏侧
// renderMode=cpu / 减画布张数 / 单窗口双世界方案。
const FLAGS = [
  '--js-flags=--max-old-space-size=8192', // JS 堆 4GB → 8GB(真有效)
  '--ignore-gpu-blocklist',
];
// 双开联机测试模式:npm run playsoft(★勿用 `npm run play --soft`——npm 会把
// --soft 吞成自身配置不传给脚本;须 `npm run play -- --soft` 或 env SW_PLAY_SOFT=1):
// 追加 --disable-gpu 浏览器全域软
// 渲染。2026-08-18 三组双窗对照实测:GPU 模式 27 次 IOSurface 分配失败+3 熔断;
// 游戏内 renderMode=cpu 仍有 6 次(主画布合成链仍产 IOSurface);--disable-gpu
// 全域软渲染 = 0 失败 0 熔断 0 丢失(双窗完全干净)。代价:帧率降(合成器也软
// 渲染,M 系列仍可玩);单窗高质量游玩不要开。
const SOFT = process.argv.includes('--soft') || process.env.SW_PLAY_SOFT === '1';
if (SOFT) FLAGS.push('--disable-gpu');
// GPU 崩溃取证档(npm run playtrace):stderr 日志抓 io_surface 分配失败/上下文死亡
const TRACE = process.argv.includes('--trace') || process.env.SW_PLAY_TRACE === '1';
if (TRACE) FLAGS.push('--enable-logging=stderr', `--log-level=${process.env.SW_PLAY_TRACE_LEVEL ?? '1'}`);
// 位置参数只认不以 - 开头的(URL);--soft 等旗标不得落入 url(曾把 '--soft'
// 当 URL 解析直接报"无效 URL"退出)
const positional = process.argv.slice(2).filter((a) => !a.startsWith('-'));
const url = positional[0] || 'http://localhost:4173';
const DRY = !!process.env.SW_PLAY_DRY;
const AUTO_QUIT = !!process.env.SW_PLAY_QUIT;

const chromeRunning = () => spawnSync('pgrep', ['-x', CHROME]).status === 0;

// 端口探活:300ms 连不上提示(仍继续开——用户可能正要起 vite)
function portOpen(port, host) {
  return new Promise((resolve) => {
    const s = net.connect({ port, host, timeout: 300 });
    s.on('connect', () => { s.destroy(); resolve(true); });
    s.on('error', () => resolve(false));
    s.on('timeout', () => { s.destroy(); resolve(false); });
  });
}

let u;
try { u = new URL(url); } catch { console.error(`无效 URL: ${url}`); process.exit(1); }
const alive = await portOpen(Number(u.port) || 80, u.hostname);
if (!alive) {
  console.warn(`⚠ ${u.host} 没有服务在听——若还没起服务:开发热更 npm run dev(5199)/ 正式预览 npm run start(4173)。仍继续打开页面。`);
}

if (DRY) {
  if (TRACE) console.log('[dry] spawn Chrome 二进制', JSON.stringify(FLAGS.concat(url)), 'stderr → logs/gpu-stderr-*.log');
  else console.log('[dry] open', JSON.stringify(['-na', CHROME, '--args', ...FLAGS, url].join(' ')));
  console.log(`[dry] Chrome running=${chromeRunning()} autoQuit=${AUTO_QUIT} tty=${process.stdin.isTTY}`);
  process.exit(0);
}

if (chromeRunning()) {
  const quit = AUTO_QUIT || (process.stdin.isTTY && await ask());
  if (!quit) {
    console.error('已取消。Chrome 在运行时旗标不生效(预算默认 8GB 档);Cmd+Q 全退后重跑,或回答 y 让脚本代退。');
    process.exit(1);
  }
  execSync(`osascript -e 'tell application "${CHROME}" to quit'`, { stdio: 'ignore' });
  for (let i = 0; i < 80 && chromeRunning(); i++) await new Promise((r) => setTimeout(r, 250));
  if (chromeRunning()) {
    console.error('Chrome 20s 未退出(多半有确认对话框/下载进行中挡着)。手动处理后重跑。');
    process.exit(1);
  }
  await new Promise((r) => setTimeout(r, 500)); // 进程表清空后再留半秒,防单例竞态
}

if (TRACE) {
  // 直接 spawn 二进制(open 转发不了子进程 stderr)——detached+unref,脚本退出后
  // Chrome 继续跑,stderr 持续落盘;崩溃瞬间 io_surface.cc/上下文死亡行全带时间戳
  const logDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'logs');
  fs.mkdirSync(logDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
  const logPath = path.join(logDir, `gpu-stderr-${stamp}.log`);
  const BIN = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  if (!fs.existsSync(BIN)) { console.error(`找不到 Chrome 二进制:${BIN}`); process.exit(1); }
  const fd = fs.openSync(logPath, 'a');
  const child = spawn(BIN, [...FLAGS, url], { detached: true, stdio: ['ignore', fd, fd] });
  child.unref();
  fs.closeSync(fd);
  console.log(`已冷启动 Chrome(取证档,WARNING+ 日志)→ ${url}`);
  console.log(`stderr 落盘:${logPath}`);
  console.log('复现崩溃后把这个文件发我——IOSurface 分配失败/上下文死亡行带时间戳,可精确到崩溃点。');
  console.log('第二个窗口用普通方式开即可(同一 GPU 进程,失败行不分窗口;要分清就两个都用 playtrace 起,日志文件分开)。');
} else {
  spawnSync('open', ['-na', CHROME, '--args', ...FLAGS, url], { stdio: 'inherit' });
  console.log(`已冷启动 ${CHROME}(JS 堆 8GB;GPU 侧无旗标可救,双开请用游戏内 renderMode=cpu)→ ${url}`);
  console.log('若 Chrome 设置了"继续浏览上次打开的页面",之前的标签会一并恢复。');
}

async function ask() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const a = (await rl.question('Chrome 正在运行,旗标只对冷启动生效。优雅退出并冷启动?(Y/n) ')).trim().toLowerCase();
  rl.close();
  return a !== 'n' && a !== 'no';
}
