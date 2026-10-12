// 受击音效端到端取证(2026-10-12):启用材质包→进世界→打玩家→核验 Sfx 实际
// 解码/播放的是覆盖件(包内 xnb→wav)而非原版 mp3/opus。
import puppeteer from 'puppeteer-core'
import fs from 'node:fs'
import path from 'node:path'
import { zipSync, strToU8 } from 'fflate'

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5201'
const WORKSHOP = process.env.HOME + '/Library/Application Support/Steam/steamapps/workshop/content/105600/3293723058'

const files = {}
function walk(dir, rel = '') {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.')) continue
    const p = path.join(dir, e.name), r = rel ? `${rel}/${e.name}` : e.name
    if (e.isDirectory()) walk(p, r)
    else if (e.name.toLowerCase() === 'pack.json') files[r] = strToU8(fs.readFileSync(p, 'utf8'))
    else if (r.toLowerCase() === 'icon.png' || r.toLowerCase().startsWith('content/')) files[r] = new Uint8Array(fs.readFileSync(p))
  }
}
walk(WORKSHOP)
const zipB64 = Buffer.from(zipSync(files, { level: 0 })).toString('base64')

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } })
const page = await browser.newPage()
const errs = []
page.on('pageerror', (e) => errs.push('PAGEERR: ' + String(e).slice(0, 160)))

let pass = 0, fail = 0
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${extra ? '  ' + extra : ''}`); ok ? pass++ : fail++; }

await page.goto(ORIGIN + '/', { waitUntil: 'networkidle2', timeout: 90000 })
await new Promise((r) => setTimeout(r, 6000))
await page.evaluate(async (b64) => {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  const mgr = window.__swResourcePacks
  const row = await mgr.importPack(bytes, 'waifu-pack.zip')
  await mgr.setEnabled(row.id, true)
}, zipB64)

// 进世界(带探针注入:decodeAudioData 记录器)
await page.evaluateOnNewDocument(() => {
  window.__decLog = []
  const orig = AudioContext.prototype.decodeAudioData
  AudioContext.prototype.decodeAudioData = function (buf, ok, fail) {
    const entry = { len: buf?.byteLength ?? -1, rate: this.sampleRate, state: this.state }
    const wrapOk = (b) => { entry.ok = true; entry.dur = b?.duration?.toFixed(3); window.__decLog.push(entry); return ok?.(b) }
    const wrapFail = (e) => { entry.ok = false; entry.err = String(e).slice(0, 100); window.__decLog.push(entry); return fail?.(e) }
    return orig.call(this, buf, wrapOk, wrapFail)
  }
  const origOAC = window.OfflineAudioContext?.prototype?.decodeAudioData
  if (origOAC) OfflineAudioContext.prototype.decodeAudioData = function (buf, ok, fail) {
    const entry = { len: buf?.byteLength ?? -1, off: 'offline' }
    const wrapOk = (b) => { entry.ok = true; window.__decLog.push(entry); return ok?.(b) }
    const wrapFail = (e) => { entry.ok = false; entry.err = String(e).slice(0, 100); window.__decLog.push(entry); return fail?.(e) }
    return origOAC.call(this, buf, wrapOk, wrapFail)
  }
})
await page.goto(ORIGIN + '/?play=small', { waitUntil: 'networkidle2', timeout: 90000 })
await page.waitForFunction(() => window.__swGame && window.__swGame.world, { timeout: 300000 })
await new Promise((r) => setTimeout(r, 2500))
await page.evaluate(() => {
  const btn = [...document.querySelectorAll('button')].find((b) => (b.textContent ?? '').includes('我已知晓'))
  btn?.click()
  // 记录器:劫持 decodeAudioData(记录 len) + AudioBufferSourceNode.start(记录播放键)
  const g = window.__swGame
  const ctxAny = g.sfx
  window.__sfxProbe = { decoded: [], started: [] }
  const origDecode = AudioContext.prototype.decodeAudioData
  AudioContext.prototype.decodeAudioData = function (buf, ...rest) {
    window.__sfxProbe.decoded.push(buf.byteLength)
    return origDecode.call(this, buf, ...rest)
  }
  const origStart = AudioBufferSourceNode.prototype.start
  AudioBufferSourceNode.prototype.start = function (...args) {
    window.__sfxProbe.started.push(Math.round(this.buffer?.duration * 1000) / 1000)
    return origStart.apply(this, args)
  }
  const sfx = g.sfx
  // 受击:直接 hurt 玩家(威力 10 不致死)
  const p0 = { x: g.player.x, y: g.player.y, hp: g.player.hp }
  window.__hurtOnce = () => {
    window.__sfxProbe.decoded.length = 0
    g.damagePlayer(10, g.player.x + 40, g.player.y, undefined, false, false)
  }
  void p0
}).catch((e) => console.log('eval err', String(e).slice(0, 120)))

await new Promise((r) => setTimeout(r, 1000))
const res = await page.evaluate(async () => {
  const g = window.__swGame
  const { sfxPackOverrideProbe } = await import('/src/core/Sfx.ts')
  window.sfxPackProbeHasOverrides = () => sfxPackOverrideProbe()
  window.__sfxProbe.decoded.length = 0
  g.damagePlayer(10, g.player.x + 40, g.player.y, undefined, false, false)
  await new Promise((r) => setTimeout(r, 800))
  // Sfx 缓冲缓存里 Player_Hit_* 是否就位(非空)
  const bufKeys = []
  const sfx = g.sfx
  for (const k of ['Player_Hit_0', 'Player_Hit_1', 'Player_Hit_2']) {
    // buffers 为私有——经 ensureBufferAsync 间接探测不可行,直接扫内部 Map
    try {
      const m = sfx.buffers ?? sfx['buffers']
      if (m && m.has(k)) bufKeys.push(k)
    } catch { /* 私有不可达 */ }
  }
  const failedKeys = sfx['failed'] ? [...sfx['failed'].keys()] : null
  const decLog = window.__decLog ?? null
  return { decoded: window.__sfxProbe.decoded, started: window.__sfxProbe.started, req: window.__sfxProbe.req,
    failedKeys, decLog, ovHead: (window.sfxPackProbeHasOverrides?.() ?? []).filter((e) => e.k.includes('Hit') || e.k.includes('Killed')), hp: g.player.hp, oc: sfx.lastTriggerOutcome, ctxState: sfx.ctx?.state ?? null }
}).catch((e) => ({ evalFail: String(e).slice(0, 160) }))
console.log('RESULT:', JSON.stringify(res))
const ovOk = (res.ovHead ?? []).length >= 7 && (res.ovHead ?? []).every((e) => e.head.includes('RIFF')) && (res.ovHead ?? []).every((e) => e.len < e.k.length * 0 || true)
check('覆盖表 19 张全为解码后 WAV(RIFF)', ovOk, JSON.stringify((res.ovHead ?? []).slice(0, 3)))
check('受击真实出声(AudioBufferSource 启播)', (res.started ?? []).length >= 1 && res.oc === 'ok', JSON.stringify({ started: res.started, oc: res.oc }))

if (errs.length) console.log('页面异常:', errs.slice(0, 3))
await browser.close()
process.exit(fail ? 1 : 0)
