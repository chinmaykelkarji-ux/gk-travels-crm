import { chromium } from 'file:///C:/Users/Admin/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs';

const browser = await chromium.launch();
const context = await browser.newContext();
await context.grantPermissions(['clipboard-read', 'clipboard-write']);
const page = await context.newPage();
const errors = [];
page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
page.on('pageerror', err => errors.push('PAGEERROR: ' + err.message));
page.on('response', async res => {
  if (res.status() >= 400) {
    console.log('HTTP', res.status(), res.url());
  }
});

await page.goto('http://localhost:3000/login');
await page.fill('input[type="email"]', 'admin@gktravels.local');
await page.fill('input[type="password"]', 'admin123');
await page.click('button[type="submit"]');
await page.waitForURL('http://localhost:3000/', { timeout: 15000 });

await page.goto('http://localhost:3000/trips/GK-2026-0003');
await page.waitForTimeout(2000);

const aiMsgBtn = await page.locator('button:has-text("AI Message")').count();
const aiItinBtn = await page.locator('button:has-text("AI Itinerary")').count();
console.log('AI Message button count:', aiMsgBtn);
console.log('AI Itinerary button count:', aiItinBtn);

await page.screenshot({ path: 'd:/projects/CRM/tmp_tripdetail.png', fullPage: false });

await page.locator('button:has-text("AI Message")').click();
await page.waitForTimeout(500);
const panelVisible = await page.locator('text=AI Message Generator').count();
console.log('Panel visible:', panelVisible);

await page.locator('button:has-text("Payment Reminder")').click();
await page.locator('button:has-text("Generate Message")').click();
await page.waitForTimeout(8000);
const msgArea = await page.locator('textarea').last().inputValue().catch(() => '');
console.log('Generated message (first 100 chars):', msgArea.slice(0, 100));
await page.screenshot({ path: 'd:/projects/CRM/tmp_aipanel_generated.png', fullPage: false });

const copyBtn = page.locator('button:has-text("Copy")');
if (await copyBtn.count() > 0) {
  await copyBtn.click();
  await page.waitForTimeout(300);
  const copiedText = await page.locator('button:has-text("Copied")').count();
  console.log('Copy worked:', copiedText > 0);
}

await page.goto('http://localhost:3000/trips/GK-2026-0002/itinerary');
await page.waitForTimeout(2000);
await page.screenshot({ path: 'd:/projects/CRM/tmp_itinerary_page.png', fullPage: true });

const genBtn = page.locator('button:has-text("Generate Itinerary")');
console.log('Generate Itinerary button count:', await genBtn.count());
await genBtn.click();
await page.waitForTimeout(20000);
await page.screenshot({ path: 'd:/projects/CRM/tmp_itinerary_generated.png', fullPage: true });

const summaryBtn = page.locator('button:has-text("Generate Summary")');
console.log('Generate Summary button count:', await summaryBtn.count());
if (await summaryBtn.count() > 0) {
  await summaryBtn.click();
  await page.waitForTimeout(8000);
  await page.screenshot({ path: 'd:/projects/CRM/tmp_itinerary_summary.png', fullPage: true });
}

console.log('CONSOLE ERRORS:', JSON.stringify(errors));

await browser.close();
