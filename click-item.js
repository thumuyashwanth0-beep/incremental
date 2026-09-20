// @ts-nocheck
// click-item.js
// Paste into the console on the course page. Two functions:
//
//   listSessionItems(2, 3, 1)
//     Lists every item (Teaching/KCQ/Practice) inside Week 2 Day 3, Session 1,
//     with its type and occurrence number - use this to see how many "Practice"
//     rows a session has before picking one.
//
//   clickItem(2, 3, 1, 'kcq')
//   clickItem(2, 3, 1, 'practice', 2)   // 2nd Practice row in that session
//     Expands Week/Day -> Session and clicks the matching item.

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

function isExpanded(headerEl) {
  const img = headerEl.querySelector(':scope .caretPos img');
  return !!img && (img.getAttribute('alt') === 'up-arrow' || img.classList.contains('t-rotate-180'));
}

function fireClick(el) {
  el.scrollIntoView({ block: 'center' });
  el.click();
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
  // Search .accEach1 directly inside the session block instead of first locating a wrapper
  // div - "ng-star-inserted" is a generic Angular marker class present on many siblings
  // (e.g. loading placeholders), so picking "the" wrapper by that class alone is unreliable.
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
  console.log(`Clicking: ${normText(target)}`);
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
