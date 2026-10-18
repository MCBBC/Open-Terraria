// ★用户路径全仓自适应(2026-10-19 用户令:任何人 clone 都能正常跑,缺文件的补完后
// 能跑,缺的时候给警告)——scripts/ 探针与工具的本机路径统一出口。
// 与 tests/fixturePath.ts 同语义(C 档可移植改造刀建立的习语,两域风格统一)。
//
// 消费面四类:
//   a. ~/Downloads/*.wld|*.json          用户取证存档(探针输入)→ DOWNLOADS
//      (SW_DOWNLOADS 可改挂自备目录);输入档一律经 needInput 守卫:
//      缺=warn(缺什么/去哪补/怎么跑)+exit 0,探针工具不炸链。
//   b. ~/.claude/jobs/*/tmp/*            浏览器 profile/探针输出目录 → HOME 相对;
//      profile/输出目录缺失时 puppeteer/mkdir 自建,无需守卫。
//   c. <SW项目根>/{game,…}               自身仓库与仓库外基准树(terraria-assets/
//      Terarria1456 等)→ REPO_ROOT / PROJECT_ROOT(SW_PROJECT_ROOT 可整体改挂)。
//   d. ~/Library/…/tModLoader/Logs 等    tModLoader 真值快照(输入)→ TMOD_LOGS
//      (SW_TMODLOGS 可改挂);同 a 款 needInput 守卫。
//
// 纪律:scripts/ 新代码禁止再写 /Users/<user>/… 家目录绝对路径字面量——一律
// import 本模块取基址;输入面用 needInput 守卫。静态 import 说明符无法运行时
// 推导,须写仓库相对路径(如 '../tools/probe/lib/index.mjs')。
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export { join };

/** 家目录(HOME env 可覆写;模拟他人 clone 用 HOME=/tmp/fakehome)。 */
export const HOME = process.env.HOME ?? homedir();

/** 用户取证存档目录(默认 ~/Downloads;SW_DOWNLOADS 可改挂自备目录)。 */
export const DOWNLOADS = process.env.SW_DOWNLOADS ?? join(HOME, 'Downloads');

/** tModLoader 真值快照 Logs 目录(SW_TMODLOGS 可改挂)。 */
export const TMOD_LOGS = process.env.SW_TMODLOGS
  ?? join(HOME, 'Library', 'Application Support', 'Terraria/tModLoader/Logs');

/** game/ 仓库根(clone 面;= 本模块所在 scripts/ 的父目录)。 */
export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** SandboxWorld 项目根(game/ 的父目录:反编译树/terraria-assets 等仓库外基准所在)。 */
export const PROJECT_ROOT = process.env.SW_PROJECT_ROOT ?? join(REPO_ROOT, '..');

/** 探针输入守卫:档在=原样返回(本机零语义变化);缺=warn+exit 0(不炸链)。
 *  适用:用户取证存档/真值链输入——他人 clone 缺失属正常形态,自备同名文件
 *  放到对应目录(或设 SW_DOWNLOADS/SW_TMODLOGS 等 env 改挂)后重跑即得真跑。 */
export function needInput(p, what = '用户取证存档/真值输入') {
  if (existsSync(p)) return p;
  console.warn(
    `[pathlib] 探针输入缺失(${what}):${p}\n`
    + '  —— 这是作者本机取证存档/真值链输入,他人 clone 缺失属正常形态。\n'
    + '     自备方式:放同名文件到对应目录,或设 SW_DOWNLOADS / SW_TMODLOGS /\n'
    + '     SW_PROJECT_ROOT 等 env 改挂输入目录后重跑。'
  );
  process.exit(0);
}
