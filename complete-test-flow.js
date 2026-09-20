// @ts-nocheck
// complete-test-flow.js
// Paste into the console after clickItem(...) has opened a KCQ/Practice item.
// Walks: "Take Test"/"Retake Test" -> "Agree & Proceed" -> (optional) cookies checkbox -> "Next".
//
// Usage:
//   completeTestFlow()

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitFor(fn, { timeout = 15000, interval = 150, what = 'condition' } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const result = fn();
    if (result) return result;
    await sleep(interval);
  }
  throw new Error(`Timed out waiting for: ${what}`);
}

function normText(el) {
  return ((el && el.textContent) || '').replace(/\s+/g, ' ').trim();
}

function fireClick(el) {
  el.scrollIntoView({ block: 'center' });
  el.click();
}

// The "Take Test" / "Retake Test" buttons' ids look auto-generated/buggy
// (id="undefinedTake Test", id="undefinedRetake Test"), so they're matched by visible label
// text instead of id. Accepts either a single label or an array of acceptable labels.
async function clickButtonByText(texts, { timeout = 15000 } = {}) {
  const wanted = (Array.isArray(texts) ? texts : [texts]).map((t) => t.trim().toLowerCase());
  const btn = await waitFor(
    () => Array.from(document.querySelectorAll('button')).find((b) => wanted.includes(normText(b).toLowerCase())),
    { timeout, what: `button with text ${wanted.map((t) => `"${t}"`).join(' or ')}` }
  );
  fireClick(btn);
  return btn;
}

async function clickById(id, { timeout = 15000 } = {}) {
  const el = await waitFor(() => document.getElementById(id), { timeout, what: `#${id}` });
  fireClick(el);
  return el;
}

async function clickTakeTest() {
  return clickButtonByText(['Take Test', 'Retake Test']);
}

async function clickAgreeAndProceed() {
  return clickById('tt-start-accept');
}

// Optional step - this checkbox doesn't always appear, so give it a short timeout and
// move on quietly if it never shows up instead of failing the whole flow.
async function maybeEnableCookiesConsent({ timeout = 3000 } = {}) {
  let checkbox;
  try {
    checkbox = await waitFor(() => document.getElementById('cookies-enabled'), { timeout, what: '#cookies-enabled' });
  } catch (e) {
    console.log('No cookies-enabled checkbox appeared - skipping.');
    return null;
  }
  if (!checkbox.checked) {
    fireClick(checkbox);
  }
  return checkbox;
}

async function clickCookiesNext() {
  return clickById('accept-cookies-button');
}

async function completeTestFlow() {
  console.log('Clicking "Take Test" / "Retake Test"...');
  await clickTakeTest();

  console.log('Waiting for "Agree & Proceed"...');
  await clickAgreeAndProceed();

  console.log('Checking for cookies consent checkbox...');
  await maybeEnableCookiesConsent();

  console.log('Clicking "Next"...');
  await clickCookiesNext();

  console.log('Test flow complete.');
}
