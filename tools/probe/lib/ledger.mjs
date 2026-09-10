/**
 * IIII236 统一探针框架 —— 断言台账与退出码。
 *
 * 坑史锚:
 *  - _iii219/_iii219-regression 的 chk/PASS/FAIL 行格式(探针家族既定观感);
 *  - _iii231 的 FAILS 聚合 + exit 2(run-diag 语义:2=脚本断言失败);
 *  - 负对照必须显式成行(如 OOO_SHINY 的 neg= false 才是真门控)。
 */

export class Ledger {
  constructor({ failExit = 2, quiet = false } = {}) {
    this.lines = [];
    this.failExit = failExit;
    this.quiet = quiet;
    this.fails = [];
    this.t0 = Date.now();   // ③ 分步计时基准(全程 t+ 行)
  }

  /** chk(name, ok, extra?) → PASS/FAIL 行;返回 ok 便于 && 串联。 */
  chk(name, ok, extra = '') {
    const line = `${ok ? 'PASS' : 'FAIL'}: ${name}${extra ? `  ${extra}` : ''}`;
    this.lines.push(line);
    if (!ok) this.fails.push(name);
    if (!this.quiet) console.log(line);
    return !!ok;
  }

  /** 信息行(不参与成败)。 */
  say(msg) { this.lines.push(msg); if (!this.quiet) console.log(msg); }

  /** 自构造起的耗时(③;`12.3s` / `2m05s`)。 */
  elapsed() {
    const s = (Date.now() - this.t0) / 1000;
    return s < 60 ? `${s.toFixed(1)}s` : `${Math.floor(s / 60)}m${String(Math.round(s % 60)).padStart(2, '0')}s`;
  }

  /**
   * ③ 分步计时(IIIII238 收编 IIII237 实战摩擦 #3):case 起止各打一行
   * (`▶ name (t+…)` / `◀ name 2.4s (t+…)`),nohup+轮询窗能看到当前跑到哪个
   * 场景、每步多久,不再 tail 猜。fn 收到 ledger 自身;返回值透传。
   * 用法:await L.step('B1 夜20:00 右键采收', async () => { …; return r; });
   */
  async step(name, fn) {
    const t0 = Date.now();
    if (!this.quiet) console.log(`▶ ${name} (t+${this.elapsed()})`);
    try {
      return await fn(this);
    } finally {
      const dur = ((Date.now() - t0) / 1000).toFixed(1);
      if (!this.quiet) console.log(`◀ ${name} ${dur}s (t+${this.elapsed()})`);
      this.lines.push(`STEP: ${name} ${dur}s (t+${this.elapsed()})`);
    }
  }

  get ok() { return this.fails.length === 0; }

  print() {
    if (this.quiet || this.fails.length) {
      const fails = this.lines.filter((l) => l.startsWith('FAIL'));
      if (fails.length) console.log('\n' + fails.length + ' FAILED');
      else if (!this.quiet) console.log('\nALL PASS');
    }
    return this;
  }

  /** 打印摘要 + 返回退出码(0/2)。 */
  exitCode() {
    if (this.fails.length) {
      console.log('PROBE FAIL: ' + this.fails.join(' | '));
      return this.failExit;
    }
    return 0;
  }

  dump(path) {
    Promise.all([import('node:fs'), import('node:path')]).then(([{ mkdirSync, writeFileSync }, { dirname }]) => {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, JSON.stringify({ ok: this.ok, fails: this.fails, lines: this.lines }, null, 2));
    }).catch(() => { /* 落盘失败不影响主流程 */ });
    return this;
  }
}

/** 快捷工厂。 */
export function ledger(opts) { return new Ledger(opts); }
