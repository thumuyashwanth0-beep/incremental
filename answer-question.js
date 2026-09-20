// @ts-nocheck
// answer-question.js
// Paste into the console once a question/test screen is open. Reads the question (+ any
// embedded code editor snippet) and options, asks an AI proxy for the answer, clicks the
// matching option, clicks "Next", and repeats for the following question.
//
// Answers are fetched via a proxy (POST {message, provider} -> JSON), not a direct provider
// API call, which sidesteps the browser CORS problem direct provider calls would hit.
//
// The proxy's response shape isn't documented, so askAI() tries several common field names
// (response/message/reply/answer/text/content) and logs the raw object if none match - if that
// happens, check the console output for the real key name and tell me so I can fix the parsing.
//
// Usage:
//   runQuizLoop()                                    // full loop, default provider 'groq'
//   runQuizLoop({ provider: 'grok' })                // use a different provider the proxy supports
//   await waitForQuestionPayload()                    // inspect just the current question's JSON

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

function extractQuestionText() {
  const el = document.querySelector('[aria-labelledby="question-data"]');
  return el ? normText(el) : null;
}

// Only grabs the first .ace_content on the page - fine as long as a question shows at most one
// embedded code editor at a time, which is the case in the captured markup.
function extractCode() {
  const ace = document.querySelector('.ace_content');
  if (!ace) return null;
  const lines = Array.from(ace.querySelectorAll('.ace_line')).map((l) => l.textContent);
  return lines.join('\n').replace(/\n+$/, '');
}

// Matched directly by id prefix rather than scoping through aria-labelledby="content" first -
// that landmark value is likely reused elsewhere in the app (modals, other panels), so
// querySelector() could silently grab the wrong container and find zero options inside it.
// "tt-option-N" is specific to this quiz UI, so it's reliable on its own.
function extractOptions() {
  return Array.from(document.querySelectorAll('[aria-labelledby="each-option"][id^="tt-option-"]')).map((el) => ({
    id: el.id,
    text: normText(el.querySelector('.options-color') || el),
  }));
}

function extractQuestionPayloadNow() {
  const question = extractQuestionText();
  const code = extractCode();
  const options = extractOptions();
  return { question, code, options };
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

  // Confirmed shape: { success: true, data: { reply, data: { reply }, model, provider, latency_ms } }
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

async function answerCurrentQuestion({ provider = 'groq', endpoint } = {}) {
  const payload = await waitForQuestionPayload();
  console.log('Question payload:', payload);

  const answerId = await askAI(payload, { provider, endpoint });
  console.log('AI chose:', answerId);

  selectOption(answerId);
  return payload;
}

async function clickNext() {
  const btn = document.querySelector('.next-btn');
  if (!btn) return false;
  fireClick(btn);
  return true;
}

// Dumps the current page state relevant to this script in one call - run this the moment a
// stop looks suspicious, before doing anything else, to see what the DOM actually looked like.
function debugSnapshot() {
  const snapshot = {
    questionText: extractQuestionText(),
    hasCode: !!document.querySelector('.ace_content'),
    optionCount: document.querySelectorAll('[aria-labelledby="each-option"][id^="tt-option-"]').length,
    hasNextBtn: !!document.querySelector('.next-btn'),
    hasTakeOrRetakeTestBtn: Array.from(document.querySelectorAll('button')).some((b) =>
      /^(take test|retake test)$/i.test(normText(b))
    ),
  };
  console.table(snapshot);
  return snapshot;
}

// Runs ONE question's extract -> ask AI -> select-option steps and stops, without clicking
// Next - lets you inspect the page (did the right radio actually get selected?) between each
// stage instead of the full loop running unattended. Call clickNext() yourself when ready to
// move on, then call stepOnce() again for the following question.
async function stepOnce({ provider = 'groq', endpoint } = {}) {
  console.log('1. Extracting question...');
  const payload = await waitForQuestionPayload();
  console.log('Payload:', payload);

  console.log('2. Asking AI...');
  const answerId = await askAI(payload, { provider, endpoint });
  console.log('AI chose:', answerId);

  console.log('3. Selecting option...');
  selectOption(answerId);
  console.log(`Selected ${answerId}. Check the page, then call clickNext() when ready to advance.`);

  return { payload, answerId };
}

// Retries the whole "extract -> ask AI -> select option" step a few times before giving up,
// since a transient failure (slow render, a network blip on the proxy call) shouldn't kill the
// entire loop - it previously did, because nothing caught the throw.
async function answerCurrentQuestionWithRetry({ provider, endpoint, retries = 2, retryDelay = 1500 } = {}) {
  let lastErr;
  for (let attempt = 1; attempt <= retries + 1; attempt++) {
    try {
      return await answerCurrentQuestion({ provider, endpoint });
    } catch (e) {
      lastErr = e;
      console.warn(`answerCurrentQuestion attempt ${attempt}/${retries + 1} failed:`, e);
      if (attempt <= retries) await sleep(retryDelay);
    }
  }
  throw lastErr;
}

async function runQuizLoop({
  maxQuestions = 50,
  provider = 'groq',
  endpoint,
  afterSelectDelay = 800,
  questionRetries = 2,
  nextQuestionTimeout = 20000,
} = {}) {
  for (let i = 0; i < maxQuestions; i++) {
    console.log(`--- Question ${i + 1} ---`);

    let payload;
    try {
      payload = await answerCurrentQuestionWithRetry({ provider, endpoint, retries: questionRetries });
    } catch (e) {
      console.error(`Question ${i + 1} failed after ${questionRetries + 1} attempts - stopping. Reason:`, e);
      break;
    }

    await sleep(afterSelectDelay);

    const clicked = await clickNext();
    if (!clicked) {
      console.log('No "Next" button found - stopping (likely the last question).');
      break;
    }

    try {
      await waitFor(() => extractQuestionText() && extractQuestionText() !== payload.question, {
        timeout: nextQuestionTimeout,
        what: 'next question to load',
      });
    } catch (e) {
      console.warn(
        `Question text did not change within ${nextQuestionTimeout}ms after clicking Next - stopping. ` +
        'This can happen if the quiz actually ended, or a non-multiple-choice question appeared ' +
        '(e.g. a free-response/coding question this script does not handle).',
        e
      );
      break;
    }
  }
  console.log('Quiz loop finished.');
}
