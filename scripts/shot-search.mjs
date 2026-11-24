import puppeteer from 'puppeteer-core';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const BASE = 'http://localhost:4173';
const browser = await puppeteer.launch({ executablePath: EDGE, headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 900 });
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push(e.message));

await page.goto(BASE + '/#/browse', { waitUntil: 'networkidle2' });
await page.waitForSelector('.select-btn');

// 1. custom select open
await page.click('.filterbar .select:nth-of-type(3) .select-btn').catch(async () => {
  const btns = await page.$$('.select-btn'); await btns[2].click();
});
await new Promise(r => setTimeout(r, 250));
await page.screenshot({ path: 'shots/select-open.png' });
await page.keyboard.press('Escape');

// 2. type-ahead with a typo
await page.click('input[name="q"]');
await page.type('input[name="q"]', 'kinematcs', { delay: 40 });
await new Promise(r => setTimeout(r, 700));
await page.screenshot({ path: 'shots/typeahead.png' });
await page.click('.sug');

// 3. fuzzy results page with "did you mean"
await page.goto(BASE + '/#/browse?query=phisics%20optics', { waitUntil: 'networkidle2' });
await new Promise(r => setTimeout(r, 600));
await page.screenshot({ path: 'shots/fuzzy-results.png' });

// 4. search that exists only in a batch tree
await page.goto(BASE + '/#/browse?query=relativ', { waitUntil: 'networkidle2' });
await new Promise(r => setTimeout(r, 900));
await page.screenshot({ path: 'shots/tree-hint.png' });

// 5. mobile select
await page.setViewport({ width: 390, height: 844 });
await page.goto(BASE + '/#/browse', { waitUntil: 'networkidle2' });
await page.waitForSelector('.select-btn');
const btns = await page.$$('.select-btn');
await btns[1].click();
await new Promise(r => setTimeout(r, 250));
await page.screenshot({ path: 'shots/select-mobile.png' });

console.log('console errors:', errors.length ? errors : 'none');
await browser.close();
