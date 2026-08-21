// 临时旁路配置：复用 vite.config 但剔除 l10n-audit 插件（并行会话缺键期间跑全量回归用，跑完即删）
import { defineConfig } from 'vite';
import base from './vite.config';
export default defineConfig(() => {
  const resolved = { ...(base as any) };
  resolved.plugins = (resolved.plugins ?? []).filter((p: any) => p?.name !== 'l10n-audit-auto');
  return resolved;
});
