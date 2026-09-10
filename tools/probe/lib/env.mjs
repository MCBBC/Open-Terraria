/**
 * IIII236 统一探针框架 —— 环境与参数面。
 *
 * 坑史锚(memory: lavaslope-infiltration-type-blind-enhancement「无头后台探针五坑」/
 * vite-probe-stale-transform-cache / diag-script-orphan-prevention / parallel-vite-sessions):
 *   - 私有 vite 实例三件套 SW_PORT/SW_NO_HMR=1/SW_CACHE 由本模块统一产出;
 *   - 探针脚本一律读 SW_ORIGIN(缺省回退共享 5199——只读不打扰,不往 5199 上压探针负载);
 *   - 端口被占绝静默漂移(vite strictPort 已防双实例错位),本框架扫描时先 lsof 探测。
 */
import { existsSync } from 'node:fs';
import net from 'node:net';

/** 世界尺寸预设(= main.ts ?play= 分支的字面映射,勿改值)。 */
export const SIZE_PRESETS = {
  small: [4200, 1200],
  medium: [6400, 1800],
  large: [8400, 2400],
};
/** 数字尺寸档(createWorldProbe 的 size 参数)。 */
export function sizeCode(sz) {
  if (sz === 'small' || sz === 0 || sz === '0') return 0;
  if (sz === 'large' || sz === 2 || sz === '2') return 2;
  return 1; // medium
}
export function sizeDims(sz) {
  const key = typeof sz === 'number' ? (sz === 0 ? 'small' : sz === 2 ? 'large' : 'medium') : sz;
  return SIZE_PRESETS[key] ?? SIZE_PRESETS.medium;
}

/** 彩蛋种子字面量(与 src/world/gen/SeedEasterEggs 的字符串匹配逐字一致;
 *  探针历史用例:_iii215b drunk='05162020' / zenith='get fixed boi' /
 *  anniversary='celebrationmk10' / bees='not the bees')。 */
export const SEED_PRESETS = {
  zenith: 'get fixed boi',
  drunk: '05162020',
  anniversary: 'celebrationmk10',
  bees: 'not the bees',
};
export function resolveSeed(s) {
  if (s == null || s === '') return '';
  return SEED_PRESETS[String(s).toLowerCase()] ?? String(s);
}

/**
 * 通用 CLI 参数解析:`--k=v` / `--k v` / `--flag` 三形态 + 其余为位置参数。
 * 未知键不报错(透传给场景脚本自取),返回 { opts, positionals, unknown }。
 */
export function parseArgs(argv) {
  const opts = {};
  const positionals = [];
  const unknown = [];
  const KNOWN = new Set(['seed', 'flags', 'size', 'vite', 'headed', 'out', 'timeout', 'keep-vite',
    'port', 'origin', 'browser', 'headed', 'help', 'h', 'keep', 'pin-random', 'pin']);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) { positionals.push(a); continue; }
    const eq = a.indexOf('=');
    const key = (eq > 2 ? a.slice(2, eq) : a.slice(2));
    let value;
    if (eq > 2) value = a.slice(eq + 1);
    else if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) value = argv[++i];
    else value = true;
    opts[key] = value;
    if (!KNOWN.has(key)) unknown.push(key);
  }
  return { opts, positionals, unknown };
}

/**
 * 端口是否有监听者(瞬时 connect 探测,2s 超时)。
 * ★双栈探测:本机 vite 实例常只绑 [::1](IPv6),只探 127.0.0.1 会漏判"已占"
 * → pickFreePort 撞上并行会话实例(竞态复检实测抓到过)。
 */
export function portBusy(port, host = null, timeoutMs = 2000) {
  const hosts = host ? [host] : ['127.0.0.1', '::1'];
  return Promise.all(hosts.map((h) => portBusyOne(port, h, timeoutMs))).then((rs) => rs.some(Boolean));
}

function portBusyOne(port, host, timeoutMs) {
  return new Promise((resolve) => {
    const sock = net.connect({ port, host });
    const done = (v) => { try { sock.destroy(); } catch { /* 已断 */ } resolve(v); };
    sock.setTimeout(timeoutMs, () => done(false));
    sock.once('connect', () => done(true));
    sock.once('error', () => done(false));
  });
}

/** HTTP 可达(GET,任意状态码都算"服务在";连接层失败=不在)。 */
export async function httpUp(url, timeoutMs = 3000) {
  try {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), timeoutMs);
    const res = await fetch(url, { signal: ac.signal });
    clearTimeout(t);
    return res.status > 0;
  } catch {
    return false;
  }
}

/** HTTP GET 全量(状态码+文本+字节数;doctor 资产面用)。 */
export async function httpGet(url, timeoutMs = 8000) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ac.signal });
    const text = await res.text();
    return { status: res.status, text, bytes: text.length };
  } catch (e) {
    return { status: 0, text: '', error: String(e?.message ?? e) };
  } finally {
    clearTimeout(t);
  }
}

/**
 * 私有端口扫描:从 base(缺省 5201,约定见 CLAUDE.md 并行会话 vite 约定)起
 * 找第一个空闲端口。已被其他会话占用的 52xx 自动跳过——绝不复用他人实例。
 */
export async function pickFreePort(base = Number(process.env.SW_PROBE_PORT_BASE ?? 5201), tries = 60) {
  for (let p = base; p < base + tries; p++) {
    if (!(await portBusy(p))) return p;
  }
  throw new Error(`[probe] ${base}..${base + tries - 1} 全被占用——并行会话过多,请指定 --vite=PORT`);
}

/** Chrome 可执行文件解析(env SW_CHROME 优先)。 */
export function resolveChromePath() {
  const candidates = [
    process.env.SW_CHROME,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
  ].filter(Boolean);
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return null;
}

/** 产物目录(env SW_PROBE_OUT 优先;探针脚本与 CLI 共用此解析)。 */
export function outDirDefault(scriptPath = '') {
  if (process.env.SW_PROBE_OUT) return process.env.SW_PROBE_OUT;
  const base = String(scriptPath || 'probe').split('/').pop().replace(/\.mjs$/, '');
  return `/tmp/probe-out/${base}`;
}
