function waitForElement(selector, timeout = 8000) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(selector);
    if (existing) {
      resolve(existing);
      return;
    }

    const observer = new MutationObserver(() => {
      const el = document.querySelector(selector);
      if (el) {
        observer.disconnect();
        resolve(el);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    setTimeout(() => {
      observer.disconnect();
      reject(new Error(`Timed out waiting for ${selector}`));
    }, timeout);
  });
}

function waitForEnabled(button, timeout = 8000) {
  return new Promise((resolve, reject) => {
    if (!button.disabled) {
      resolve(button);
      return;
    }

    const observer = new MutationObserver(() => {
      if (!button.disabled) {
        observer.disconnect();
        resolve(button);
      }
    });
    observer.observe(button, { attributes: true, attributeFilter: ['disabled', 'class'] });

    setTimeout(() => {
      observer.disconnect();
      reject(new Error('Timed out waiting for button to become enabled'));
    }, timeout);
  });
}

async function submitThenFillAndClickYes() {
  // Step 1: click the initial Submit button
  const submitButton = document.getElementById('tt-header-submit');
  if (!submitButton) {
    console.error('Submit button #tt-header-submit not found');
    return;
  }
  submitButton.click();

  try {
    // Step 2: wait for the name input to appear, then fill it
    const input = await waitForElement('#name');

    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value'
    ).set;
    nativeInputValueSetter.call(input, 'END');

    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.dispatchEvent(new Event('blur', { bubbles: true }));

    // Step 3: wait for the Yes button to appear and become enabled, then click it
    const yesButton = await waitForElement('#undefinedYes1');
    await waitForEnabled(yesButton);
    yesButton.click();
  } catch (err) {
    console.error(err.message);
  }
}

submitThenFillAndClickYes();
