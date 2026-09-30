// 版本文件单源写入器(2026-09-30 用户令:版本号后带构建时间戳 YYMMDDHHMM,本地构建
// 也要刷新——用于肉眼辨认构建是否最新)。bump-version.mjs(升版+戳)与
// stamp-build.mjs(仅刷戳,本地 analyze/dev 构建链)共引本模块,模板单一来源。
// src/version.ts 仍是唯一运行时入口:默认导出 APP_VERSION(旧消费面零改动),
// 具名导出 BUILD_STAMP(TitleMenu 版本角标/更新横幅拼接显示)。
import { writeFileSync } from 'node:fs';
const tsPath = new URL('../src/version.ts', import.meta.url);

/** YYMMDDHHMM 本地时间戳(如 2609301250=2026-09-30 12:50) */
export function buildStampNow() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getFullYear() % 100)}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}`;
}

/** 直写 src/version.ts(version 单一来源=package.json;戳=调用方给定) */
export function writeVersionTs(version, stamp) {
  writeFileSync(tsPath, `// 自动生成(versionStamp.mjs;bump-version/stamp-build 共引);禁手改
// 单一来源=package.json(version)+构建时刻本地时间(stamp,YYMMDDHHMM)
// ★2026-09-30 用户令:版本显示带构建时间戳,本地构建同样刷新(辨认构建新旧)
const APP_VERSION = '${version}';
const APP_BUILD_STAMP = '${stamp}';
export default APP_VERSION;
export const BUILD_STAMP = APP_BUILD_STAMP;
`);
}
