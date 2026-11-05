import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { outgoingState } from './tiktok';
test('counts new outgoing text, excludes existing composer and incoming text', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
    const message = 'اختبار رسالة';
    await page.setContent('<div style="position:absolute;left:50px;top:100px">اختبار رسالة</div><div style="position:absolute;left:1000px;top:200px"><span>اختبار <b>رسالة</b></span></div><div contenteditable="true" style="position:absolute;left:1000px;top:600px">اختبار رسالة</div>');
    const before = await outgoingState(page, message);
    assert.equal(before.count, 1);
    assert.equal(before.lastText, message);
    assert.equal((await outgoingState(page, message)).count, before.count);
    await page.locator('body').evaluate(el => el.insertAdjacentHTML('beforeend', '<div style="position:absolute;left:1000px;top:300px"><span>اختبار <b>رسالة</b></span></div>'));
    const after = await outgoingState(page, message);
    assert.equal(after.count, before.count + 1);
    assert.equal(after.lastText, message);
  } finally { await browser.close(); }
});
