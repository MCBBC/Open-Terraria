// IIII23 一次性配置：无插件、node 环境（并行会话纪律:不动 vite.config.ts）
export default {
  test: {
    environment: 'node',
    include: ['tools/_mile8i22.test.ts'],
    testTimeout: 900000,
    hookTimeout: 30000,
    pool: 'forks',
    watch: false,
    setupFiles: [],
  },
};
