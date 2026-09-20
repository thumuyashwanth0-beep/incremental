// @ts-nocheck
// debug-teamsid.js
// Your "Week N Day N" text nodes exist with exactly the expected structure, but the card
// lookup still failed - meaning #teamsID likely isn't actually the ancestor containing them
// (duplicate ids from a responsive mobile/desktop layout are a common cause). This checks that.
// Paste into the console, then run:  debugTeamsId()

function debugTeamsId() {
  const byGetElementById = document.getElementById('teamsID');
  const allWithThatId = document.querySelectorAll('[id="teamsID"]');

  console.log('document.getElementById("teamsID"):', byGetElementById);
  console.log(`Number of elements with id="teamsID" in the document: ${allWithThatId.length}`);
  if (allWithThatId.length > 1) {
    console.warn('Duplicate id="teamsID" found - getElementById only returns the first one, which may not be the visible/active one.');
    console.log('All of them:', Array.from(allWithThatId));
  }

  // Find a "Week N Day N" text node and report whether it's actually inside #teamsID.
  const re = /Week\s+\d+\s*[-,]?\s*Day\s+\d+/i;
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let node;
  let sample = null;
  while ((node = walker.nextNode())) {
    if (re.test(node.textContent.trim())) {
      sample = node;
      break;
    }
  }

  if (!sample) {
    console.warn('No "Week N Day N" text found this time - the page state may have changed.');
    return;
  }

  let el = sample.parentElement;
  const idChain = [];
  while (el) {
    if (el.id) idChain.push(el.id);
    el = el.parentElement;
  }
  console.log('IDs found walking up from the "Week N Day N" text node (closest first):', idChain);
  console.log(
    'Is that text node inside document.getElementById("teamsID")?',
    byGetElementById ? byGetElementById.contains(sample) : 'N/A (#teamsID not found)'
  );

  // Also report which of the (possibly multiple) #teamsID elements actually contains it, if any.
  allWithThatId.forEach((cand, i) => {
    console.log(`  contains sample? [teamsID candidate #${i}]:`, cand.contains(sample));
  });
}
