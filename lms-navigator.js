// @ts-nocheck
// lms-navigator.js
//
// Drives the course sidebar accordion: Week/Day -> Session -> (Teaching | KCQ | Practice).
// Framework-agnostic (plain DOM + localStorage) so it works pasted into DevTools console,
// injected via page.evaluate() in Puppeteer/Playwright, or as a Tampermonkey userscript.
//
// DOM shape this relies on (from initial.html / click-on-week.html / click-on-session.html):
//   #teamsID
//     div[aria-labelledby="sidebar-module"]        <- one per Week/Day card
//       div.t-w-full > div.t-w-full
//         div.container.modpointer                  <- Week/Day header ("Week 2 Day 3- ...")
//         div.acrBord                                <- sessions list (present only when expanded)
//           div.container.t-flex-col.submod          <- one per Session
//             div.container.modpointer                <- Session header ("Session 1")
//             div.ng-star-inserted                     <- items (present only when expanded)
//               ...div.accEach1                         <- leaf row ("1. Teaching_X" / "2. KCQ_X" / "3. Practice_X")
//
// Pasting this into the console (on any page) immediately records window.location.href to
// localStorage as the "course URL". Every later open()/resume() call reuses that URL when you
// don't pass one explicitly, so you only need to paste-and-capture once per site session.
//
// Usage:
//   // just paste the file - it captures the current page URL automatically
//   LmsNavigator.open({ week: 2, day: 3, session: 1, type: 'kcq' })
//   LmsNavigator.open({ week: 2, day: 3, session: 2, type: 'practice', occurrence: 2 })  // 2nd practice item
//   LmsNavigator.resume()                // replays the last successful selection
//   LmsNavigator.getLastSelection()
//   LmsNavigator.getCourseUrl()          // the URL captured when the script was pasted/loaded
//   LmsNavigator.clearLastSelection()
//
// Note on full page navigation: if the resolved url points somewhere other than the current
// page, this sets location.href, which destroys the current script context. The pending request
// is saved to localStorage first; resumePending() re-applies it automatically once #teamsID
// shows up again, but something has to re-run this file on the new page for that to happen
// (e.g. a Tampermonkey @match on the site, or re-pasting into the console after load). If you're
// driving this from Puppeteer/Playwright, do the page.goto() on the host side instead and only
// call open() with a `url` that already matches the loaded page.

(function (global) {
  'use strict';

  const STORAGE_KEY = 'lmsNavigator:lastSelection';
  const PENDING_KEY = 'lmsNavigator:pending';
  const URL_KEY = 'lmsNavigator:courseUrl';
  const DEFAULT_TIMEOUT_MS = 20000;
  const POLL_MS = 150;

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function waitFor(fn, { timeout = DEFAULT_TIMEOUT_MS, interval = POLL_MS, what = 'condition' } = {}) {
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

  function getRoot() {
    const root = document.getElementById('teamsID');
    if (!root) throw new Error('#teamsID sidebar not found - course page has not loaded yet');
    return root;
  }

  function findWeekDayCard(week, day) {
    const re = new RegExp(`Week\\s+${week}\\s+Day\\s+${day}(\\D|$)`, 'i');
    const cards = getRoot().querySelectorAll(':scope > div[aria-labelledby="sidebar-module"]');
    for (const card of cards) {
      const header = card.querySelector(':scope > div.t-w-full > div.t-w-full > div.container.modpointer');
      if (header && re.test(normText(header))) {
        return card;
      }
    }
    return null;
  }

  async function ensureWeekDayOpen(week, day) {
    const card = await waitFor(() => findWeekDayCard(week, day), {
      what: `Week ${week} Day ${day} header`,
    });
    const header = card.querySelector(':scope > div.t-w-full > div.t-w-full > div.container.modpointer');
    if (!isExpanded(header)) {
      fireClick(header);
    }
    return waitFor(
      () => card.querySelector(':scope > div.t-w-full > div.t-w-full > div.acrBord'),
      { what: `sessions list for Week ${week} Day ${day}` }
    );
  }

  function findSessionBlock(acrBord, session) {
    const re = new RegExp(`Session\\s+${session}(\\D|$)`, 'i');
    const blocks = acrBord.querySelectorAll(':scope > div.container.t-flex-col.submod');
    for (const block of blocks) {
      const header = block.querySelector(':scope > div.container.modpointer');
      if (header && re.test(normText(header))) {
        return block;
      }
    }
    return null;
  }

  async function ensureSessionOpen(acrBord, week, day, session) {
    const block = await waitFor(() => findSessionBlock(acrBord, session), {
      what: `Session ${session} under Week ${week} Day ${day}`,
    });
    const header = block.querySelector(':scope > div.container.modpointer');
    if (!isExpanded(header)) {
      fireClick(header);
    }
    return waitFor(
      () => block.querySelector(':scope > div.ng-star-inserted'),
      { what: `items for Session ${session}` }
    );
  }

  function findItems(itemsWrap, type) {
    const wanted = type.toLowerCase();
    return Array.from(itemsWrap.querySelectorAll(':scope .accEach1')).filter((leaf) =>
      normText(leaf).toLowerCase().includes(wanted)
    );
  }

  async function clickItem(itemsWrap, session, type, occurrence) {
    const matches = await waitFor(
      () => {
        const found = findItems(itemsWrap, type);
        return found.length >= occurrence ? found : null;
      },
      { what: `${type} item #${occurrence} in Session ${session}` }
    );
    const target = matches[occurrence - 1];
    fireClick(target);
    return target;
  }

  function saveLastSelection(sel) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...sel, savedAt: new Date().toISOString() }));
    } catch (e) {
      /* storage unavailable - non-fatal */
    }
  }

  function getLastSelection() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function clearLastSelection() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (e) {
      /* ignore */
    }
  }

  function savePending(req) {
    try {
      localStorage.setItem(PENDING_KEY, JSON.stringify(req));
    } catch (e) {
      /* ignore */
    }
  }

  function clearPending() {
    try {
      localStorage.removeItem(PENDING_KEY);
    } catch (e) {
      /* ignore */
    }
  }

  function readPending() {
    try {
      const raw = localStorage.getItem(PENDING_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function saveCourseUrl(url) {
    try {
      localStorage.setItem(URL_KEY, url);
    } catch (e) {
      /* ignore */
    }
  }

  function getCourseUrl() {
    try {
      return localStorage.getItem(URL_KEY);
    } catch (e) {
      return null;
    }
  }

  function samePage(url) {
    if (!url) return true;
    try {
      const target = new URL(url, location.href);
      return target.origin === location.origin && target.pathname === location.pathname;
    } catch (e) {
      return location.href === url;
    }
  }

  async function open(opts) {
    const { week, day, session, type = 'kcq', occurrence = 1 } = opts || {};
    const url = (opts && opts.url) || getCourseUrl() || undefined;

    if (week == null || day == null || session == null) {
      throw new Error('week, day and session are required');
    }
    if (!/^(kcq|practice|teaching)$/i.test(type)) {
      throw new Error(`type must be one of kcq | practice | teaching, got "${type}"`);
    }

    const request = { url, week, day, session, type, occurrence };
    savePending(request);

    if (url && !samePage(url)) {
      location.href = url;
      return 'navigating';
    }

    await waitFor(() => document.getElementById('teamsID'), { what: 'course sidebar (#teamsID)' });

    const acrBord = await ensureWeekDayOpen(week, day);
    const itemsWrap = await ensureSessionOpen(acrBord, week, day, session);
    const target = await clickItem(itemsWrap, session, type, occurrence);

    clearPending();
    saveLastSelection({ url: url || location.href, week, day, session, type, occurrence });

    return target;
  }

  async function resume(overrides) {
    const last = getLastSelection();
    if (!last) throw new Error('No previous selection stored yet - call open({...}) first');
    return open({ ...last, ...overrides });
  }

  async function resumePending() {
    const pending = readPending();
    if (!pending) return null;
    if (pending.url && !samePage(pending.url)) return null;
    return open(pending);
  }

  const api = {
    open,
    resume,
    resumePending,
    getLastSelection,
    clearLastSelection,
    getCourseUrl,
    setCourseUrl: saveCourseUrl,
  };
  global.LmsNavigator = api;

  // Capture wherever this gets pasted/loaded as "the" course URL, so open()/resume() work
  // without needing `url` passed in every time.
  saveCourseUrl(location.href);

  function autoResume() {
    resumePending().catch(() => {
      /* nothing pending, or page not ready - ignore */
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autoResume);
  } else {
    autoResume();
  }
})(window);
