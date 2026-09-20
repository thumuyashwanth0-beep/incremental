// @ts-nocheck
// solve-all-kcq.js
// Paste into the console on the course page. Full pipeline for a given Week/Day:
// walks every Session, and for every KCQ item in each session:
//   1. opens it                                    (click-item.js logic)
//   2. Take Test/Retake Test -> Agree & Proceed
//      -> cookies checkbox -> Next                 (complete-test-flow.js logic)
//   3. answers every question via the AI proxy      (answer-question.js logic)
//   4. clicks header Submit -> types "END" -> Yes   (fill-and-click-yes.js logic)
// then moves to the next KCQ/session, until the whole day is done.
//
// Usage:
//   await solveKcqAt(2, 3, 1)          // just Session 1's first KCQ - run this first to verify
//   await solveAllKcqForDay(2, 3)      // every KCQ in every session of Week 2 Day 3
//   await solveAllKcqForDay(2, 3, { provider: 'grok' })   // different AI proxy provider

/* ---------- shared helpers ---------- */

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

function waitForElement(selector, timeout = 15000) {
  return waitFor(() => document.querySelector(selector), { timeout, what: selector });
}

function waitForEnabled(button, timeout = 15000) {
  return waitFor(() => (!button.disabled ? button : null), { timeout, what: 'button to become enabled' });
}

function normText(el) {
  return ((el && el.textContent) || '').replace(/\s+/g, ' ').trim();
}

function fireClick(el) {
  el.scrollIntoView({ block: 'center' });
  el.click();
}

// Tracks where the whole pipeline currently is, so mid-run you can open the console and call
// getCurrentStep() to see what it's stuck on instead of guessing.
let CURRENT_STEP = 'idle';
function setStep(step) {
  CURRENT_STEP = step;
  console.log(`[STEP ${new Date().toLocaleTimeString()}] ${step}`);
}
function getCurrentStep() {
  return CURRENT_STEP;
}

/* ---------- course navigation: Week/Day -> Session -> item (click-item.js) ---------- */

function isExpanded(headerEl) {
  const img = headerEl.querySelector(':scope .caretPos img');
  return !!img && (img.getAttribute('alt') === 'up-arrow' || img.classList.contains('t-rotate-180'));
}

function getCardHeaders() {
  const root = document.getElementById('teamsID');
  if (!root) return [];
  const cards = Array.from(root.querySelectorAll('div[aria-labelledby="sidebar-module"]'));
  return cards.map((c) => ({ card: c, header: c.querySelector('div.container.modpointer') })).filter((x) => x.header);
}

async function findWeekDayCard(week, day) {
  const re = new RegExp(`Week\\s+${week}\\s+Day\\s+${day}(\\D|$)`, 'i');
  try {
    return await waitFor(() => getCardHeaders().find((x) => re.test(normText(x.header))), {
      what: `Week ${week} Day ${day} header`,
    });
  } catch (e) {
    const headers = getCardHeaders();
    console.warn(`Week ${week} Day ${day} not found. Headers currently in the DOM:`);
    console.table(headers.map((x, i) => ({ index: i, text: normText(x.header) })));
    throw e;
  }
}

async function ensureWeekDayOpen(week, day) {
  const { card, header } = await findWeekDayCard(week, day);
  if (!isExpanded(header)) fireClick(header);
  return waitFor(() => card.querySelector('div.acrBord'), {
    what: `sessions list for Week ${week} Day ${day}`,
  });
}

function getSessionHeaders(acrBord) {
  const blocks = Array.from(acrBord.querySelectorAll('.container.t-flex-col.submod'));
  return blocks
    .map((b) => ({ block: b, header: b.querySelector(':scope > div.container.modpointer') }))
    .filter((x) => x.header);
}

// Reads every "Session N" number currently listed under an open Week/Day, in DOM order.
function getAllSessionNumbers(acrBord) {
  const nums = getSessionHeaders(acrBord)
    .map((x) => {
      const m = normText(x.header).match(/Session\s+(\d+)/i);
      return m ? Number(m[1]) : null;
    })
    .filter((n) => n !== null);
  return [...new Set(nums)].sort((a, b) => a - b);
}

async function ensureSessionOpen(acrBord, week, day, session) {
  const re = new RegExp(`Session\\s+${session}(\\D|$)`, 'i');
  let found;
  try {
    found = await waitFor(() => getSessionHeaders(acrBord).find((x) => re.test(normText(x.header))), {
      what: `Session ${session} under Week ${week} Day ${day}`,
    });
  } catch (e) {
    const headers = getSessionHeaders(acrBord);
    console.warn(`Session ${session} not found under Week ${week} Day ${day}. Sessions currently in the DOM:`);
    console.table(headers.map((x, i) => ({ index: i, text: normText(x.header) })));
    throw e;
  }
  const { block, header } = found;
  if (!isExpanded(header)) fireClick(header);
  await waitFor(() => block.querySelectorAll('.accEach1').length > 0, {
    what: `items for Session ${session}`,
  });
  return block;
}

function getItems(itemsWrap) {
  return Array.from(itemsWrap.querySelectorAll('.accEach1')).map((el) => normText(el));
}

function classify(text) {
  const t = text.toLowerCase();
  if (t.includes('teaching')) return 'teaching';
  if (t.includes('kcq')) return 'kcq';
  if (t.includes('practice')) return 'practice';
  return 'other';
}

async function listSessionItems(week, day, session) {
  const acrBord = await ensureWeekDayOpen(week, day);
  const itemsWrap = await ensureSessionOpen(acrBord, week, day, session);
  const texts = getItems(itemsWrap);

  const counters = {};
  const rows = texts.map((text) => {
    const type = classify(text);
    counters[type] = (counters[type] || 0) + 1;
    return { type, occurrence: counters[type], text };
  });

  console.table(rows);
  return rows;
}

async function clickItem(week, day, session, type, occurrence = 1) {
  if (!/^(kcq|practice|teaching)$/i.test(type)) {
    throw new Error(`type must be one of kcq | practice | teaching, got "${type}"`);
  }
  const wanted = type.toLowerCase();

  const acrBord = await ensureWeekDayOpen(week, day);
  const itemsWrap = await ensureSessionOpen(acrBord, week, day, session);

  const matches = await waitFor(
    () => {
      const found = Array.from(itemsWrap.querySelectorAll('.accEach1')).filter((el) =>
        normText(el).toLowerCase().includes(wanted)
      );
      return found.length >= occurrence ? found : null;
    },
    { what: `${type} item #${occurrence} in Week ${week} Day ${day} Session ${session}` }
  );

  const target = matches[occurrence - 1];
  setStep(`Clicking item: ${normText(target)}`);
  fireClick(target);

  try {
    localStorage.setItem(
      'lmsNavigator:lastSelection',
      JSON.stringify({ week, day, session, type, occurrence, savedAt: new Date().toISOString() })
    );
  } catch (e) {
    /* ignore */
  }

  return target;
}

/* ---------- intro screens: Take Test -> Agree & Proceed -> cookies -> Next (complete-test-flow.js) ---------- */

// The "Take Test" / "Retake Test" buttons' ids look auto-generated/buggy
// (id="undefinedTake Test", id="undefinedRetake Test"), so they're matched by visible label
// text instead of id.
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
    console.log('  No cookies-enabled checkbox appeared - skipping.');
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
    console.log('  No cookies "Next" button appeared - skipping.');
    return false;
  }
}

function isQuestionVisible() {
  return !!document.querySelector('[aria-labelledby="question-data"]');
}

// After clicking cookies "Next" the question screen can take a while to render. Waits up to
// 30s, and if it's still not there, waits up to another 20s before giving up (50s total) -
// returns false instead of throwing so the caller can skip this KCQ rather than crash the loop.
async function waitForQuestionToLoad() {
  setStep('  Waiting for question to load (up to 30s)...');
  try {
    await waitFor(() => isQuestionVisible(), { timeout: 30000, what: 'question to render' });
    setStep('  Question loaded.');
    return true;
  } catch (e) {
    setStep('  Question not visible after 30s - waiting up to 20s more...');
    try {
      await waitFor(() => isQuestionVisible(), { timeout: 20000, what: 'question to render (extended wait)' });
      setStep('  Question loaded (after extended wait).');
      return true;
    } catch (e2) {
      setStep('  Question still not visible after 50s total - page likely failed to load. Skipping.');
      return false;
    }
  }
}

async function completeTestFlow() {
  setStep('  Clicking "Take Test" / "Retake Test"...');
  await clickTakeTest();

  setStep('  Waiting for "Agree & Proceed"...');
  await clickAgreeAndProceed();

  setStep('  Checking for cookies consent checkbox...');
  await maybeEnableCookiesConsent();

  setStep('  Checking for cookies "Next" button...');
  await maybeClickCookiesNext();

  const loaded = await waitForQuestionToLoad();
  if (!loaded) {
    setStep('  Intro flow: skipped - question never loaded.');
    return { ok: false, reason: 'question-not-loaded' };
  }

  setStep('  Intro flow complete - question is visible.');
  return { ok: true };
}

/* ---------- quiz answering (answer-question.js) ---------- */

function extractQuestionText() {
  const el = document.querySelector('[aria-labelledby="question-data"]');
  return el ? normText(el) : null;
}

function extractCode() {
  const ace = document.querySelector('.ace_content');
  if (!ace) return null;
  const lines = Array.from(ace.querySelectorAll('.ace_line')).map((l) => l.textContent);
  return lines.join('\n').replace(/\n+$/, '');
}

function extractOptions() {
  return Array.from(document.querySelectorAll('[aria-labelledby="each-option"][id^="tt-option-"]')).map((el) => ({
    id: el.id,
    text: normText(el.querySelector('.options-color') || el),
  }));
}

function extractQuestionPayloadNow() {
  return { question: extractQuestionText(), code: extractCode(), options: extractOptions() };
}

async function waitForQuestionPayload({ timeout = 20000 } = {}) {
  await waitFor(
    () => {
      const p = extractQuestionPayloadNow();
      return p.question && p.options.length > 0;
    },
    { timeout, what: 'question and options to render' }
  );
  return extractQuestionPayloadNow();
}

async function askAI(payload, { provider = 'groq', endpoint = 'https://on-a-new-mission.onrender.com/api/chat' } = {}) {
  const validIds = payload.options.map((o) => o.id);
  const message = [
    'You are answering a multiple-choice quiz question. Respond with ONLY the "id" value of the',
    'correct option from the JSON below - no explanation, no extra words, no punctuation.',
    '',
    JSON.stringify(payload, null, 2),
  ].join('\n');

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, provider }),
  });

  if (!res.ok) {
    throw new Error(`AI proxy request failed: ${res.status} ${res.statusText} - ${await res.text()}`);
  }

  const data = await res.json();
  if (data.success === false) {
    throw new Error(`AI proxy reported failure: ${JSON.stringify(data)}`);
  }
  const raw = data?.data?.reply ?? data?.reply ?? '';
  const text = (typeof raw === 'string' ? raw : JSON.stringify(raw)).trim();

  if (!text) {
    console.warn('No recognizable text field in the proxy response - full response:', data);
    throw new Error('Empty/unrecognized response shape from the AI proxy - see the logged object above.');
  }

  if (validIds.includes(text)) return text;
  const found = validIds.find((id) => text.includes(id));
  if (found) return found;

  console.warn('Proxy response text did not contain a known option id:', text);
  throw new Error(`Could not parse a valid option id out of the AI response: "${text}"`);
}

function selectOption(id) {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Option element #${id} not found`);
  fireClick(el);
}

async function answerCurrentQuestionWithRetry({ provider, endpoint, retries = 2, retryDelay = 1500 } = {}) {
  let lastErr;
  for (let attempt = 1; attempt <= retries + 1; attempt++) {
    try {
      const payload = await waitForQuestionPayload();
      console.log('    Question payload:', payload);
      const answerId = await askAI(payload, { provider, endpoint });
      console.log('    AI chose:', answerId);
      selectOption(answerId);
      return payload;
    } catch (e) {
      lastErr = e;
      console.warn(`    Answer attempt ${attempt}/${retries + 1} failed:`, e);
      if (attempt <= retries) await sleep(retryDelay);
    }
  }
  throw lastErr;
}

async function clickNext() {
  const btn = document.querySelector('.next-btn');
  if (!btn) return false;
  fireClick(btn);
  return true;
}

// Answers every question in the currently-open KCQ, clicking Next after each one, until no
// .next-btn is left (submission then happens separately via the header Submit button).
async function runQuizLoop({
  maxQuestions = 50,
  provider = 'groq',
  endpoint,
  afterSelectDelay = 800,
  questionRetries = 2,
  nextQuestionTimeout = 20000,
} = {}) {
  for (let i = 0; i < maxQuestions; i++) {
    setStep(`  Answering question ${i + 1}...`);
    let payload;
    try {
      payload = await answerCurrentQuestionWithRetry({ provider, endpoint, retries: questionRetries });
    } catch (e) {
      console.error(`  Question ${i + 1} failed after ${questionRetries + 1} attempts - stopping.`, e);
      throw e;
    }

    await sleep(afterSelectDelay);

    const clicked = await clickNext();
    if (!clicked) {
      console.log('  No "Next" button found - all questions answered.');
      return;
    }

    try {
      await waitFor(() => extractQuestionText() && extractQuestionText() !== payload.question, {
        timeout: nextQuestionTimeout,
        what: 'next question to load',
      });
    } catch (e) {
      console.log('  Question text did not change after clicking Next - assuming the last question was reached.');
      return;
    }
  }
  console.warn(`  Hit maxQuestions (${maxQuestions}) safety limit.`);
}

/* ---------- submit + confirm: header Submit -> type "END" -> Yes (fill-and-click-yes.js) ---------- */

async function submitCurrentTest({ confirmText = 'END' } = {}) {
  setStep('  Clicking header Submit...');
  const submitButton = await waitForElement('#tt-header-submit');
  fireClick(submitButton);

  setStep('  Waiting for confirmation input...');
  const input = await waitForElement('#name');

  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  nativeInputValueSetter.call(input, confirmText);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
  input.dispatchEvent(new Event('blur', { bubbles: true }));

  setStep('  Waiting for "Yes" to enable...');
  const yesButton = await waitForElement('#undefinedYes1');
  await waitForEnabled(yesButton);
  fireClick(yesButton);
  setStep('  Submission confirmed.');
}

/* ---------- orchestration ---------- */

// Full pipeline for one specific KCQ: open -> intro flow -> answer all questions -> submit.
// Returns 'done' or 'skipped' (page never loaded a question after the intro flow).
async function solveKcqAt(week, day, session, occurrence = 1, options = {}) {
  console.log(`=== Week ${week} Day ${day} Session ${session}, KCQ #${occurrence} ===`);

  await clickItem(week, day, session, 'kcq', occurrence);
  await sleep(500);

  const flowResult = await completeTestFlow();
  if (!flowResult.ok) {
    setStep(`=== KCQ #${occurrence} in Session ${session} skipped (${flowResult.reason}) ===`);
    return 'skipped';
  }

  await runQuizLoop(options);
  await submitCurrentTest(options);
  setStep(`=== KCQ #${occurrence} in Session ${session} done ===`);
  return 'done';
}

// Walks every Session under a Week/Day, solving every KCQ item found in each one.
async function solveAllKcqForDay(week, day, options = {}) {
  const acrBord = await ensureWeekDayOpen(week, day);
  const sessions = getAllSessionNumbers(acrBord);
  console.log(`Week ${week} Day ${day} has sessions: ${sessions.join(', ')}`);

  const results = [];
  for (const session of sessions) {
    let rows;
    try {
      rows = await listSessionItems(week, day, session);
    } catch (e) {
      console.error(`Could not read items for Session ${session} - skipping.`, e);
      results.push({ session, ok: false, error: String(e) });
      continue;
    }

    const kcqCount = rows.filter((r) => r.type === 'kcq').length;
    if (kcqCount === 0) {
      console.log(`Session ${session}: no KCQ items - skipping.`);
      continue;
    }

    for (let occurrence = 1; occurrence <= kcqCount; occurrence++) {
      try {
        const outcome = await solveKcqAt(week, day, session, occurrence, options);
        results.push({ session, occurrence, ok: outcome === 'done', outcome });
      } catch (e) {
        console.error(`Session ${session} KCQ #${occurrence} failed - moving to the next one.`, e);
        results.push({ session, occurrence, ok: false, outcome: 'error', error: String(e) });
      }
      await sleep(800);
    }
  }

  console.log('=== Summary ===');
  console.table(results);
  return results;
}
