// @ts-nocheck
// list-sessions.js
// Paste into the browser console on the course page, then run:
//   listSessions(2, 3)
// Prints the session names found inside Week 2 Day 3 (expanding that card if needed).

async function listSessions(week, day) {
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

  // Descendant (not direct-child) lookups on purpose: the first .container.modpointer
  // inside a card is always its own week/day header (session headers only exist deeper
  // in document order, after it), so this stays correctly scoped even if the live site's
  // wrapper nesting differs slightly from the captured snapshot.
  function getCardHeaders() {
    const root = document.getElementById('teamsID');
    if (!root) return [];
    const cards = Array.from(root.querySelectorAll('div[aria-labelledby="sidebar-module"]'));
    return cards.map((c) => ({ card: c, header: c.querySelector('div.container.modpointer') })).filter((x) => x.header);
  }

  const weekDayRe = new RegExp(`Week\\s+${week}\\s+Day\\s+${day}(\\D|$)`, 'i');

  // The sidebar is populated asynchronously (Angular fetches it after load), so poll for the
  // target card instead of checking once - a single synchronous check right after paste can
  // easily run before the data has arrived.
  let found;
  try {
    found = await waitFor(
      () => getCardHeaders().find((x) => weekDayRe.test(normText(x.header))),
      { what: `Week ${week} Day ${day} header` }
    );
  } catch (e) {
    const headers = getCardHeaders();
    console.warn(`Week ${week} Day ${day} not found. Headers currently in the DOM:`);
    console.table(headers.map((x, i) => ({ index: i, text: normText(x.header) })));
    throw new Error(
      `Week ${week} Day ${day} not found in the sidebar after waiting - see the table above for what's ` +
      `actually rendered (it may be phrased differently, or the list may be virtual-scrolled/lazy-loaded - ` +
      `scroll it into view and retry).`
    );
  }

  const { card, header } = found;
  if (!isExpanded(header)) {
    header.scrollIntoView({ block: 'center' });
    header.click();
  }

  const acrBord = await waitFor(() => card.querySelector('div.acrBord'), {
    what: `sessions list for Week ${week} Day ${day}`,
  });

  const sessionHeaders = Array.from(acrBord.querySelectorAll('.container.t-flex-col.submod > .container.modpointer'));
  const sessions = sessionHeaders.map((h, i) => ({ index: i + 1, name: normText(h) }));

  console.table(sessions);
  return sessions;
}
