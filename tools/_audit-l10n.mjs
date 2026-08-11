// l10n 键完整性审计 CLI：node tools/_audit-l10n.mjs
// （构建期自动检查在 vite.config.ts 的 l10n-audit-auto 插件；本脚本供手动全量跑）
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { auditL10n } from './l10n-audit.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { used, missing } = auditL10n(join(ROOT, 'src'), join(ROOT, 'public', 'l10n', 'zh-Hans.json'));
console.log(`键使用总数: ${used} / 缺失: ${missing.length}`);
for (const m of missing) console.log(`MISSING ${m.key}  ←  ${m.locs.join(', ')}`);
process.exit(missing.length ? 1 : 0);
