// 三方对账:Steam 1.4.5.8 安装包 Content/Sounds/*.xnb × terraria-assets/Sounds(解包缓存)
//           × game/public/sounds(复刻版拷贝面)。
//
// 背景(2026-08-25 音频对账):文件名级 diff 曾显示"863 全覆盖零缺失",但那只是
// 名单比对——本脚本下沉到 PCM 采样级(md5(s16le 解码流)),同时抓三类问题:
//   MISSING  xnb 有而 game 无(真正要补拷的)
//   DRIFTED  两边都有但 PCM 不一致(版本陈旧/损坏/被并行会话改写)
//   EXTRA    game 有而 1458 官方没有(非原版素材,须逐个人工定罪:改名重复?
//           自合成?旧版本残留?——如 lava_0/waterfall_0,原版走 Liquid_0/1)
// 另核对 Wave Bank.xwb(音乐库,104 条 Music_N 流,与音效无关但同属音频资产):
//   默认只校验流总数 == public/audios/music 的 Music_*.mp3 数;--wavebank 追加
//   全量流名迭代(每流一次 vgmstream 调用,495MB 库寻址慢,~15s/条,慎用;
//   全量名字映射的权威工具是 tools/xwb-extract.mjs)。
//
// 用法(game/ 目录下执行;依赖 brew install vgmstream ffmpeg):
//   node tools/recon-sound-1458.mjs            (只读对账,exit 0=干净)
//   node tools/recon-sound-1458.mjs --copy     (把 MISSING/DRIFTED 从 xnb 重提补进
//                                               game/public/sounds,原文件先备份)
// 环境变量 SW_TERRARIA_CONTENT 可指到其他 Content 目录(缺省探 Steam 安装)。
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync, statSync, unlinkSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { createInterface } from 'node:readline';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ASSETS = process.env.SW_ASSETS ?? join(ROOT, 'terraria-assets', 'Sounds');
const GAME = process.env.SW_GAME_SOUNDS ?? join(ROOT, 'game', 'public', 'sounds');
const MUSIC_DIR = process.env.SW_GAME_MUSIC ?? join(ROOT, 'game', 'public', 'audios', 'music');
const CONTENT = process.env.SW_TERRARIA_CONTENT
  ?? join(process.env.HOME, 'Library/Application Support/Steam/steamapps/common/Terraria/Terraria.app/Contents/Resources/Content');
const TMP = '/tmp/recon-sound-1458';
const COPY_MODE = process.argv.includes('--copy');
const WAVEBANK_FULL = process.argv.includes('--wavebank');

if (!existsSync(join(CONTENT, 'Sounds'))) {
  console.error(`找不到 Content/Sounds:${CONTENT}(可用 SW_TERRARIA_CONTENT 覆盖)`);
  process.exit(2);
}

/** 目录 → { 展平小写名: 含子目录前缀的原始大小写名 }。键与 game 落位同款
 *  (Custom/x → x,子目录名整个剥掉);值保留子目录前缀(xnb 实际路径靠它拼)。
 *  ★两版各踩一坑:值丢前缀→全 Custom 族指向不存在路径假 DRIFT;值丢目录名
 *  不够→键带 custom 前缀与 game 键对不上,假 MISSING+假 EXTRA 成对出现。 */
function listDir(root) {
  const out = {};
  if (!existsSync(root)) return out;
  const AUDIO_RE = /\.(wav|xnb|ogg|mp3)$/i;
  const walk = (dir, keyPrefix, valPrefix) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (!e.isFile()) { walk(join(dir, e.name), keyPrefix, `${valPrefix}${e.name}/`); continue; }
      if (!AUDIO_RE.test(e.name)) continue;
      const base = e.name.replace(AUDIO_RE, '');
      out[`${keyPrefix}${base}`.toLowerCase()] = `${valPrefix}${base}`;
    }
  };
  walk(root, '', '');
  return out;
}

/** 文件 → md5(解码后 s16le PCM)。vgmstream 出 wav 再 ffmpeg 抽裸采样,
 *  归一化容器差异(xnb 内嵌 PCM vs RIFF 包装),只比声音本身。
 *  ★临时文件必须逐次唯一:并发池共用一个名字会互相覆写(首版踩过,804 假 DRIFT)。 */
let decSeq = 0;
function pcmHash(file) {
  return new Promise((resolve) => {
    const tmp = join(TMP, `dec-${process.pid}-${decSeq++}.wav`);
    execFile('vgmstream-cli', ['-o', tmp, file], (e) => {
      if (!existsSync(tmp)) return resolve(null);
      // ffmpeg 直管道,不落盘
      const ff = execFile('ffmpeg', ['-v', 'error', '-i', tmp, '-f', 's16le', '-'], { maxBuffer: 512 * 1024 * 1024 }, () => {});
      const hash = createHash('md5');
      ff.stdout.on('data', (c) => hash.update(c));
      ff.stdout.on('end', () => resolve(hash.digest('hex')));
      ff.on('error', () => resolve(null));
      ff.on('close', () => { try { unlinkSync(tmp); } catch {} });
    });
  });
}

async function pool(items, worker, conc = 8) {
  const queue = [...items];
  const results = new Map();
  await Promise.all(Array.from({ length: Math.min(conc, items.length) }, async () => {
    while (queue.length) {
      const it = queue.shift();
      results.set(it.key, await worker(it));
    }
  }));
  return results;
}

mkdirSync(TMP, { recursive: true });

// ---- 三方清单 ----
const xnbSet = listDir(join(CONTENT, 'Sounds'));       // 权威:1458 安装包
const assetSet = listDir(ASSETS);                       // 解包缓存(provenance 校验用)
const gameSet = listDir(GAME);                          // 复刻版拷贝面

console.log(`xnb=${Object.keys(xnbSet).length}  assets=${Object.keys(assetSet).length}  game=${Object.keys(gameSet).length}`);

// ---- 集合级 diff ----
const missing = Object.keys(xnbSet).filter((k) => !(k in gameSet));
const extra = Object.keys(gameSet).filter((k) => !(k in xnbSet));

// ---- PCM 级 drift(xnb ↔ game;assets 仅作 provenance 参考) ----
const common = Object.keys(xnbSet).filter((k) => k in gameSet);
console.log(`PCM 对账 ${common.length} 个公共文件...`);
const hashes = await pool(
  common.map((k) => ({ key: k, file: join(CONTENT, 'Sounds', xnbSet[k] + '.xnb') })),
  (it) => pcmHash(it.file),
);
const gameHashes = await pool(
  common.map((k) => ({ key: k, file: join(GAME, gameSet[k] + '.wav') })),
  (it) => pcmHash(it.file),
);
const drifted = common.filter((k) => hashes.get(k) !== gameHashes.get(k));

// ---- 补拷(--copy:MISSING 与 DRIFTED 一律从 xnb 重提,保证 1458 终态) ----
let copied = 0;
if (COPY_MODE && (missing.length || drifted.length)) {
  const backupDir = join(TMP, 'backup');
  mkdirSync(backupDir, { recursive: true });
  for (const k of [...missing, ...drifted]) {
    if (drifted.includes(k)) copyFileSync(join(GAME, gameSet[k] + '.wav'), join(backupDir, gameSet[k] + '.wav'));
    const src = join(CONTENT, 'Sounds', xnbSet[k] + '.xnb');
    const dst = join(GAME, xnbSet[k] + '.wav'); // 大小写随官方名
    await new Promise((resolve, reject) => {
      execFile('vgmstream-cli', ['-o', dst, src], (e) => (e ? reject(e) : resolve()));
    });
    copied++;
    console.log(`  补拷 ${gameSet[k]} → ${xnbSet[k]}.wav`);
  }
}

// ---- Wave Bank 音乐面 ----
let wbLine = '';
try {
  const meta = await new Promise((resolve, reject) => {
    execFile('vgmstream-cli', ['-m', '-s', '1', '-i', join(CONTENT, 'Wave Bank.xwb')], { maxBuffer: 1024 * 1024 }, (e, out) => (e ? reject(e) : resolve(out)));
  });
  const count = parseInt(meta.match(/stream count: (\d+)/)?.[1] ?? '-1', 10);
  const mp3s = existsSync(MUSIC_DIR) ? readdirSync(MUSIC_DIR).filter((f) => /^Music_\d+\.mp3$/i.test(f)) : [];
  let detail = '';
  if (WAVEBANK_FULL) {
    console.log(`Wave Bank 全量流名迭代(${count} 条,慢)...`);
    const names = {};
    for (let k = 1; k <= count; k++) {
      const m = await new Promise((resolve) => {
        execFile('vgmstream-cli', ['-m', '-s', String(k), '-i', join(CONTENT, 'Wave Bank.xwb')], { maxBuffer: 1024 * 1024 }, (e, out) => resolve(e ? '' : out));
      });
      const name = m.match(/stream name: (\S+)/)?.[1];
      if (name) names[name.toLowerCase()] = name;
    }
    const want = Array.from({ length: count }, (_, i) => `music_${i}`);
    const missMusic = want.filter((n) => !(n in names));
    if (missMusic.length) detail += `  流名缺口: ${missMusic.join(',')}`;
  }
  wbLine = `Wave Bank: ${count} 条流 vs public/audios/music ${mp3s.length} 个 Music_*.mp3${count === mp3s.length ? ' ✓' : ` ✗ 差 ${count - mp3s.length}`}${detail}`;
} catch (e) {
  wbLine = `Wave Bank: 校验失败(${e.message.split('\n')[0]})`;
}

// ---- 报告 ----
console.log('');
if (missing.length) console.log(`MISSING(xnb 有 game 无)${COPY_MODE ? '(已补)' : ''}: ${missing.map((k) => xnbSet[k]).join(', ')}`);
else console.log('MISSING: 0');
if (drifted.length) console.log(`DRIFTED(PCM 不一致): ${drifted.map((k) => xnbSet[k]).join(', ')}`);
else console.log('DRIFTED: 0');
if (extra.length) {
  console.log(`EXTRA(game 有而 1458 官方无,须人工定罪): ${extra.map((k) => gameSet[k]).join(', ')}`);
}
console.log(wbLine);

// provenance:解包缓存 terraria-assets 与安装包的名单一致性(信息性)
const assetMissingFromCache = Object.keys(xnbSet).filter((k) => !(k in assetSet));
if (assetMissingFromCache.length) console.log(`NOTE: terraria-assets/Sounds 缺 ${assetMissingFromCache.length} 个 xnb 同名文件(解包缓存陈旧,不影响 game 判定)`);

const bad = missing.length + drifted.length;
console.log(bad === 0 ? '\nRECON SOUND: PASS' : `\nRECON SOUND: FAIL(${bad} 处)${COPY_MODE ? '(已自动修复,重跑验证)' : '(--copy 一键从 1458 安装包补齐)'}`);
process.exit(bad === 0 ? 0 : 1);
