// ★C 档测试可移植性（2026-10-18 用户拍板：他人 clone 后 `npm run test` 全绿，
// 零本机路径依赖）——本地证据档案（tests/fixtures/local/）与外部真值树的统一解析入口。
//
// 三类消费面：
//   1. 用户取证存档（原 ~/Downloads / 微信收件路径，含 wxid 隐私面）→ 收编为
//      tests/fixtures/local/ 脱敏档案（gz 压缩、git 跟踪；清单见该目录 README.md）。
//      测试一律经 readLocalFixture()/localFixtureMissing() 存取：档案在=真跑
//      （本机零语义变化），缺档=it.skipIf 跳过（他人 clone 全绿）。
//   2. 仓库外反编译树（Terarria1457/1458、Terraria-Map-Editor、CalamityModPublic
//      等 = game/ 的兄弟目录）→ PROJECT_ROOT 解析（SW_PROJECT_ROOT 可覆盖）；
//      只读它们的测试自行 existsSync + describe/it.skipIf 缺树跳过。
//   3. 本机对拍真值链 ~/GoldenChains（体积/语义不可收编）→ GOLDENCHAINS_ROOT
//      （SW_GOLDENCHAINS_ROOT 可覆盖）；探针 env 门控缺省 skip，不因缺目录变红。
//
// 纪律：禁止在 tests/tools 新增用户家目录绝对路径、微信 wxid 等本机标识字面量——
// 一律走本模块或 process.env.HOME 相对式（隐私终验 grep 零命中）。
import { existsSync, readFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'fflate';

/** 仓库根（game/，git clone 面） */
export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** 项目根（game/ 的父目录：反编译树 / TEdit / CalamityModPublic / l10n 源所在）。
 *  clone 侧天然不存在 → 消费测试须 existsSync + skipIf；本机在=真跑。 */
export const PROJECT_ROOT = process.env.SW_PROJECT_ROOT ?? join(REPO_ROOT, '..');

/** 本地证据档案目录（git 跟踪；档案本体 gz 压缩，清单=目录内 README.md）。 */
export const LOCAL_FIXTURE_DIR = process.env.SW_LOCAL_FIXTURE_DIR
  ?? join(REPO_ROOT, 'tests', 'fixtures', 'local');

/** 本机对拍真值链（x86 侧 dump 桶群，体积/语义不可收编；探针 env 门控用）。 */
export const GOLDENCHAINS_ROOT = process.env.SW_GOLDENCHAINS_ROOT
  ?? join(process.env.HOME ?? homedir(), 'GoldenChains');

/** env 缺省回退式取路径（探针/工具的自定义输入面统一习语）。 */
export function optInPath(envName: string, fallback: string): string {
  return process.env[envName] ?? fallback;
}

/** 档案磁盘落点名：优先 <name>.gz（收编态），兼容未压缩 <name>。 */
function localFixtureCandidates(name: string): string[] {
  return [join(LOCAL_FIXTURE_DIR, `${name}.gz`), join(LOCAL_FIXTURE_DIR, name)];
}

const missingHints = new Set<string>();
function hintMissing(name: string): void {
  if (missingHints.has(name)) return;
  missingHints.add(name);
  // 一条提示（每档名一次）：他人 clone 缺档=正常形态，测试将 skip 不红
  console.warn(
    `[fixturePath] 本地证据档案 ${name} 缺失——相关用例将 skip。`
    + ` 来源与获取方式见 ${LOCAL_FIXTURE_DIR}/README.md`,
  );
}

/** 档案是否缺（it/describe.skipIf 用）。缺时打一条 console 提示。 */
export function localFixtureMissing(name: string): boolean {
  const missing = !localFixtureCandidates(name).some((p) => existsSync(p));
  if (missing) hintMissing(name);
  return missing;
}

/** 读本地证据档案字节（gz 自动解压；<name> 直存与 <name>.gz 同名通道）。 */
export function readLocalFixture(name: string): Buffer {
  for (const p of localFixtureCandidates(name)) {
    if (!existsSync(p)) continue;
    const raw = readFileSync(p);
    return p.endsWith('.gz') ? Buffer.from(gunzipSync(new Uint8Array(raw))) : raw;
  }
  throw new Error(
    `[fixturePath] 本地证据档案缺失：${join(LOCAL_FIXTURE_DIR, name)}(.gz)`
    + `——清单与来源见同目录 README.md；他人 clone 缺档属正常形态（测试应 skipIf 缺档）。`,
  );
}

/** 读本地证据档案文本（utf8）。 */
export function readLocalFixtureText(name: string): string {
  return readLocalFixture(name).toString('utf8');
}

/** 档案绝对路径（须真档在位才有效；缺档判定请用 localFixtureMissing）。 */
export function localFixturePath(name: string): string {
  const hit = localFixtureCandidates(name).find((p) => existsSync(p));
  if (!hit) throw new Error(`[fixturePath] 档案不存在：${name}（先 localFixtureMissing 判定）`);
  return hit;
}

/** OS tmp（探针落盘惯用面的统一出口，避免散落绝对路径）。 */
export const TMP_DIR = process.env.TMPDIR ?? tmpdir();
