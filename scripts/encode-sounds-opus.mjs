// SFX 音源 Opus 转码管线(2026-09-04 第一阶段:wav→Opus 96k,BGM 保持 mp3)。
// 源=assets-src/sounds/*.wav(原始保真,不进 public);产物=public/sounds/*.opus。
// ★public/sounds 从此为【生成物目录】——只含 .opus,勿手放 wav。
// 增量:源 mtime+size 与产物一致 → 跳过。--force 全量重转。
// 兼容性备案:decodeAudioData 的 Opus 解码 Chrome/Firefox/Edge/Android WebView ✓;
// 旧 Safari 存在风险(本阶段接受,音效缺失走 15s 负缓存静默;回退=还原 assets-src
// 的 wav 至 public/sounds 重跑 pack)。
import { execFileSync } from 'node:child_process';
import { readdirSync, statSync, existsSync, mkdirSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(import.meta.dirname, '..', 'assets-src', 'sounds');
const OUT = join(import.meta.dirname, '..', 'public', 'sounds');
const FORCE = process.argv.includes('--force');
const BITRATE = '96k';          // Opus 主格式(游戏 SFX 下≈透明)
const MP3_BITRATE = '96k';      // 回退格式(Safari 全兼容)

mkdirSync(OUT, { recursive: true });
// ★缺链卫兵(2026-10-18 用户令「clone 后全链可跑、仅转码步跳过」):
//   assets-src/(本机软链→仓库外 wav 母带,gitignore 不入库)在他人 clone 后不存在——
//   旧 readdirSync 直接 ENOENT 炸断 build:release && 链。改为:警告+exit 0 优雅跳过,
//   发布链继续(public/sounds/ 的 863 个已转码 .opus 成品随 git 分发,游戏音效完整),
//   仅失去「改 wav 母带后重转码」能力(需要时自备母带重建 ../assets-src/sounds/)。
if (!existsSync(SRC)) {
  console.warn(
    '[encode-sounds] ⚠ 音源母带缺失(' + SRC + ')——转码步跳过。\n' +
    '  · 本机形态:game/assets-src 软链 → 仓库外 wav 母带(不入库,见 ASSETS.md/回退备案)\n' +
    '  · 影响:仅无法重转码;public/sounds/ 的既有 .opus/.mp3 成品不受影响,构建链继续');
  process.exit(0);
}
const wavs = readdirSync(SRC).filter((f) => f.endsWith('.wav'));
let done = 0, skipped = 0, failed = 0;
const t0 = Date.now();
for (const wav of wavs) {
  const base = wav.slice(0, -4);
  const srcP = join(SRC, wav);
  const outP = join(OUT, base + '.opus');
  const st = statSync(srcP);
  const mp3P = join(OUT, base + '.mp3');
  if (!FORCE && existsSync(outP) && existsSync(mp3P)) {
    const o = statSync(outP);
    if (o.mtimeMs >= st.mtimeMs && o.size > 0 && statSync(mp3P).size > 0) { skipped++; continue; }
  }
  try {
    execFileSync('ffmpeg', ['-hide_banner', '-v', 'error', '-y', '-i', srcP,
      '-c:a', 'libopus', '-b:a', BITRATE, outP], { stdio: 'pipe' });
    // ★mp3 回退产物(2026-09-04 兼容报告定案):Safari 桌面全系对 Ogg Opus 的
    //  decodeAudioData 仍"部分支持"(11-18.3 仅 CAF,18.4+ Ogg 实现不完整)——
    //  双格式:Opus 主(体积 -93%)+ mp3 回退(wav→mp3 96k 也只有原 1/10)。
    //  加载链:Sfx.ts .opus decode 失败 → .mp3(全兼容)。
    execFileSync('ffmpeg', ['-hide_banner', '-v', 'error', '-y', '-i', srcP,
      '-c:a', 'libmp3lame', '-b:a', MP3_BITRATE, join(OUT, base + '.mp3')], { stdio: 'pipe' });
    done++;
    if (done % 100 === 0) console.log(`  转码 ${done}/${wavs.length}…`);
  } catch (e) {
    failed++;
    console.error(`  ✗ ${wav}: ${String(e).slice(0, 100)}`);
  }
}
// 清理 public/sounds 残留 wav(迁移语义:产物目录只含 opus)
let cleaned = 0;
for (const f of readdirSync(OUT)) {
  if (f.endsWith('.wav')) { rmSync(join(OUT, f)); cleaned++; }
}
console.log(`[encode-sounds] 完成 ${done} 转码 / ${skipped} 跳过 / ${failed} 失败 / 清理残留wav ${cleaned} / ${((Date.now() - t0) / 1000).toFixed(0)}s`);
if (failed > 0) process.exit(1);
// assets-index.json 的 sounds 段同步(warm 清单/P3 枚举源;cleaned>0 或 done>0 时更新)
if (done > 0 || cleaned > 0) {
  const idxP = join(import.meta.dirname, '..', 'public', 'assets-index.json');
  try {
    const idx = JSON.parse(readFileSync(idxP, 'utf8'));
    idx.sounds = readdirSync(OUT).filter((f) => f.endsWith('.opus')).sort().map((f) => `sounds/${f}`);
    writeFileSync(idxP, JSON.stringify(idx));
    console.log(`[encode-sounds] assets-index sounds 段同步 → ${idx.sounds.length} 条(.opus)`);
  } catch (e) { console.error('[encode-sounds] assets-index 同步失败:', String(e).slice(0, 100)); process.exit(1); }
}
