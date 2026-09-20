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

// The whole cookies step (checkbox + "Next" button) doesn't always appear at all - give it a
// short timeout and move straight on to waiting for the question if it never shows up, instead
// of failing the whole flow.
async function maybeClickCookiesNext({ timeout = 3000 } = {}) {
  try {
    await clickById('accept-cookies-button', { timeout });
    return true;
  } catch (e) {
    console.log('No cookies "Next" button appeared - skipping.');
    return false;
  }
}

// Tracks where the flow currently is, so mid-run you can open the console and call
// getCurrentStep() to see what it's stuck on instead of guessing.
let CURRENT_STEP = 'idle';
function setStep(step) {
  CURRENT_STEP = step;
  console.log(`[STEP ${new Date().toLocaleTimeString()}] ${step}`);
}
function getCurrentStep() {
  return CURRENT_STEP;
}

function isQuestionVisible() {
  return !!document.querySelector('[aria-labelledby="question-data"]');
}

// After clicking cookies "Next" the question screen can take a while to render. Waits up to
// 30s, and if it's still not there, waits up to another 20s before giving up (50s total) -
// returns false instead of throwing so the caller can skip this KCQ rather than crash the loop.
async function waitForQuestionToLoad() {
  setStep('Waiting for question to load (up to 30s)...');
  try {
    await waitFor(() => isQuestionVisible(), { timeout: 30000, what: 'question to render' });
    setStep('Question loaded.');
    return true;
  } catch (e) {
    setStep('Question not visible after 30s - waiting up to 20s more...');
    try {
      await waitFor(() => isQuestionVisible(), { timeout: 20000, what: 'question to render (extended wait)' });
      setStep('Question loaded (after extended wait).');
      return true;
    } catch (e2) {
      setStep('Question still not visible after 50s total - page likely failed to load. Skipping.');
      return false;
    }
  }
}

async function completeTestFlow() {
  setStep('Clicking "Take Test" / "Retake Test"...');
  await clickTakeTest();

  setStep('Waiting for "Agree & Proceed"...');
  await clickAgreeAndProceed();

  setStep('Checking for cookies consent checkbox...');
  await maybeEnableCookiesConsent();

  setStep('Checking for cookies "Next" button...');
  await maybeClickCookiesNext();

  const loaded = await waitForQuestionToLoad();
  if (!loaded) {
    setStep('Test flow skipped - question never loaded.');
    return { ok: false, reason: 'question-not-loaded' };
  }

  setStep('Test flow complete - question is visible.');
  return { ok: true };
}
