import puppeteer from 'puppeteer-core';
import { readFileSync, statSync } from 'node:fs';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:4177';
const LOG = '/tmp/static-4177.log';
let prev = logSize();
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox'] });
