// 浏览器 decodeAudioData 实测:XNB→WAV 产物能否被 WebAudio 接受
import puppeteer from 'puppeteer-core'
import fs from 'node:fs'
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const b64 = fs.readFileSync('/tmp/player-hit-0.wav').toString('base64')
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new' })
const page = await browser.newPage()
await page.goto('about:blank')
const r = await page.evaluate(async (b64) => {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  const ctx = new AudioContext()
  try {
    const buf = await ctx.decodeAudioData(bytes.slice().buffer)
    return { ok: true, dur: +buf.duration.toFixed(3), ch: buf.numberOfChannels, rate: buf.sampleRate }
  } catch (e) { return { ok: false, err: String(e).slice(0, 140) } }
}, b64)
console.log('decodeAudioData:', JSON.stringify(r))
await browser.close()
