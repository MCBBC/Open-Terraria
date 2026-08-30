#!/usr/bin/env node
// ── IIII84 任意种子平价闸门（常驻工具）────────────────────────────────────
//
// 背景：IIIII78 批曾把「dotted 秘种子路由配方 seed=1.1.1.1.<flag>|<base>」的第 4 段
// （AWorldGenerationOption 位掩码，bit0=Drunk，WorldFileData.cs:71-82/:217-229）
// 误当占位写 1 ⇒ x86 八链全部静默开了醉酒世界，slot0 起红被误诊为「任意底种早发散」。
// 本闸门对任一底种以【勘误后配方语义】做 slot0（原版地形槽末）字节级抽样对拍：
//   x86 侧：serverconfig `seed=<size>.<mode+1>.<evil>.<optionBits>.<secrets>|<base>`
//           （optionBits 缺省省略一段等价于 0；骰源=CRC32('<secrets>|<base>')）
//   JS 侧：generateWorld({ seedText:'<secrets>|<base>', evil, seedFlags }) —— 直注旗标。
//
// 用法（cd game）：
//   # JS 抽样（快照落盘 + Reset 元组），无 x86 绑定：
//   node scripts/anyseed-slot0.mjs --seeds '20260903,12345,0,-777,99999999999'
//   # 带 x86 真值绑定逐种子字节对拍（name 必须与 seeds 表列一致）：
//   node scripts/anyseed-slot0.mjs --seeds '20260903,9293480' \
//        --g2 '20260903=/tmp/iii84-out/x86-plain;9293480=/tmp/rrrr-out/x86-g' \
//        --evil 0 --tag mybatch
//   # 由输入串生成勘误后 rig 配方行：
//   node scripts/anyseed-slot0.mjs --recipe 'nightofthelivingdead|20260903'
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

// ── 种子数字化（src/core/rng.ts translateSeed/crc32Calculate 的精确镜像）──────
// ★改动 src/core/rng.ts 时必须同步这里；对拍工具自身不得引入 TS 运行时依赖。
const CRC32_TAB = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c >>> 0;
  }
  return t;
})();
function crc32Calculate(value) {
  let num = 0xffffffff;
  for (let i = 0; i < value.length; i++) {
    num = (CRC32_TAB[(num ^ value.charCodeAt(i)) & 0xff] ^ (num >>> 8)) >>> 0;
  }
  return ~num | 0;
}
function translateSeed(seedText) {
  const m = /^\s*([+-]?\d+)\s*$/.exec(seedText);
  if (m) {
    const v = BigInt(m[1]);
    if (v >= -2147483648n && v <= 2147483647n) {
      const n = Number(v);
      return n === -2147483648 ? 2147483647 : Math.abs(n);
    }
  }
  return crc32Calculate(seedText);
}

const argv = process.argv.slice(2);
const opt = {};
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (!a.startsWith('--')) continue;
  const key = a.slice(2);
  const next = argv[i + 1];
  if (next !== undefined && !next.startsWith('--')) { opt[key] = next; i++; }
  else opt[key] = true;
}

/** 勘误后 dotted 配方生成器（对齐 GetFullSeedText 的五段式，WorldFileData.cs:135-169）。 */
function composeRecipe(seedTextIn) {
  // 特殊九种子的 optionBits（seedOptionsInOrder 序，bit 序 0..8）
  const SPECIAL_BITS = [
    ['05162020', 'drunkworld'], ['notthebees'], ['fortheworthy'],
    ['celebrationmk10'], ['constant', 'theconstant', 'eye4aneye', 'eyeforaneye'],
    ['dontdigup'], ['notraps'], ['getfixedboi'], ['skyblock'],
  ];
  const normalizedAll = String(seedTextIn ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '');
  let bits = 0;
  SPECIAL_BITS.forEach((names, bit) => {
    if (names.includes(normalizedAll)) bits += 1 << bit;
  });
  return { recipe: `1.1.1.${bits}.${seedTextIn}`, seedTextIncludingSecrets: String(seedTextIn), optionBits: bits };
}

if (opt.recipe) {
  const r = composeRecipe(opt.recipe);
  console.log(`numSeed=${translateSeed(r.seedTextIncludingSecrets)} crc32=${crc32Calculate(r.seedTextIncludingSecrets)}`);
  console.log(`serverconfig 行:\nseed=${r.recipe}`);
  process.exit(0);
}

const seeds = String(opt.seeds ?? '').split(',').map((s) => s.trim()).filter(Boolean);
if (seeds.length === 0) {
  console.error('无 --seeds 输入');
  process.exit(2);
}
const evil = opt.evil !== undefined ? Number(opt.evil) : -1;
const flags = String(opt.flags ?? '');
const tag = String(opt.tag ?? 'anyseed');
const out = String(opt.out ?? `/tmp/iii84-out/${tag}`);
mkdirSync(out, { recursive: true });

// --g2 'name=dir;...' 解析（键按种子原样匹配）
const g2map = new Map();
for (const ent of String(opt.g2 ?? '').split(';').filter(Boolean)) {
  const eq = ent.indexOf('=');
  if (eq > 0) g2map.set(ent.slice(0, eq).trim(), ent.slice(eq + 1).trim());
}

function slug(s) {
  return s.replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 60) || 'blank';
}

const rows = [];
for (const seed of seeds) {
  const jsOut = `${out}/js-${slug(seed)}`;
  const env = {
    ...process.env,
    SW84_SEED: seed,
    SW84_EVIL: String(evil),
    SW84_FLAGS: flags,
    SW84_OUT: jsOut,
  };
  const g2 = g2map.get(seed);
  if (g2) { env.SW84_G2 = g2; env.SW84_OUT = `${jsOut}`; }
  const r = spawnSync('npx', ['vitest', 'run', 'tools/_iii84slot0.test.ts'], {
    cwd: new URL('..', import.meta.url).pathname,
    env,
    encoding: 'utf8',
    timeout: 600_000,
  });
  const text = `${r.stdout ?? ''}\n${r.stderr ?? ''}`;
  const rowLine = text.split('\n').find((l) => l.startsWith('@ROW '));
  const hdrLine = text.split('\n').find((l) => l.startsWith('HDR '));
  if (!rowLine) {
    rows.push({ seed, error: true, tail: text.split('\n').filter(Boolean).slice(-4).join(' | ') });
    console.log(`${'ERR'.padEnd(6)} ${seed} —— 未捕获 @ROW（详见 ${jsOut}）`);
    continue;
  }
  try {
    rows.push(JSON.parse(rowLine.slice(5)));
    console.log(hdrLine ?? '');
  } catch {
    rows.push({ seed, error: true, raw: rowLine });
  }
}

writeFileSync(`${out}/spectrum.jsonl`, rows.map((r) => JSON.stringify(r)).join('\n') + '\n');

// 谱系表
const CH = ['dA', 'dT', 'dW', 'dL', 'dHf', 'dSl', 'dLt', 'dIa'];
console.log('\n── 任意种子 slot0 谱系（✓=8通道字节零差 / ✗=有差 / -=未绑 x86 / ?=缺通道或无 dump）──');
console.log(
  'seed'.padEnd(24), ('numSeed=' + '').slice(0, 12).padEnd(12),
  CH.map((c) => c.padStart(7)).join(''), '  flag  first',
);
let greens = 0;
let cmpable = 0;
for (const r of rows) {
  if (r.error) { console.log(String(r.seed).padEnd(24), 'ERROR', r.tail ?? ''); continue; }
  const bound = CH.some((c) => typeof r[c] === 'number' && r[c] !== null);
  if (bound) {
    cmpable++;
    const missingChans = CH.some((c) => r[c] === -1);
    const bad = CH.some((c) => r[c] > 0);
    if (!bad && !missingChans) greens++;
  } else greens++; // 未绑定=纯抽样行，无差可断言，计入产出
  const flag = !bound ? '-' : (CH.some((c) => r[c] === -1)) ? '?' : (CH.some((c) => r[c] > 0)) ? '✗' : '✓';
  console.log(
    String(r.seed).padEnd(24),
    String(r.numSeed).padEnd(12),
    CH.map((c) => String(r[c] ?? '-').padStart(7)).join(''),
    ('  ' + flag).padEnd(6),
    r.first || '',
  );
}
writeFileSync(`${out}/spectrum.md`,
  '# IIII84 anyseed spectrum\n\n' +
  '```jsonl\n' + rows.map((r) => JSON.stringify(r)).join('\n') + '\n```\n');
const sampled = rows.filter((r) => !r.error).length - cmpable;
console.log(`\n谱系落盘: ${out}/spectrum.jsonl|spectrum.md；绑定对拍 ${cmpable} 行（全绿 ${greens}/${cmpable}），未绑 JS 抽样 ${sampled} 行${g2map.size ? '' : ''}`);
