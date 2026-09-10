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
