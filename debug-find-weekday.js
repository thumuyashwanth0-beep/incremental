// @ts-nocheck
// debug-find-weekday.js
// Paste into the console, then run:  debugFindWeekDay()
// Makes zero assumptions about DOM structure/classes - just tells us what's actually there.

function debugFindWeekDay() {
  console.log('document.getElementById("teamsID"):', document.getElementById('teamsID'));

  const re = /Week\s+\d+\s*[-,]?\s*Day\s+\d+/i;
  const matches = [];

  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) {
    const text = node.textContent.trim();
    if (text && re.test(text)) {
      const el = node.parentElement;
      matches.push({
        text,
        tag: el ? el.tagName.toLowerCase() : null,
        class: el ? el.className : null,
        // a couple of ancestor tag/class pairs, closest first, to see real nesting
        ancestors: (() => {
          const chain = [];
          let a = el ? el.parentElement : null;
          for (let i = 0; i < 5 && a; i++) {
            chain.push(`${a.tagName.toLowerCase()}.${(a.className || '').toString().split(' ').join('.')}`);
            a = a.parentElement;
          }
          return chain.join(' > ');
        })(),
      });
    }
  }

  console.log(`Found ${matches.length} text node(s) matching "Week N Day N":`);
  console.table(matches);

  if (matches.length === 0) {
    console.warn(
      'No "Week N Day N" text found anywhere in document.body. Possible causes: ' +
      'the content is inside an <iframe> (check with document.querySelectorAll("iframe")), ' +
      'the sidebar has not finished loading yet, or the wording differs from "Week N Day N" - ' +
      'try widening the regex in this script and re-running.'
    );
  }

  return matches;
}
