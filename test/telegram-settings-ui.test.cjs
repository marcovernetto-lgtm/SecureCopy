const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const rendererCode = fs.readFileSync(require.resolve('../renderer.js'), 'utf8');

function extractTelegramLogic() {
  const isTelegramBotTokenValidMatch = rendererCode.match(/function isTelegramBotTokenValid\([\s\S]*?\n\}/);
  const updateTelegramTutorialVisibilityMatch = rendererCode.match(/function updateTelegramTutorialVisibility\([\s\S]*?\n\}/);

  assert.ok(isTelegramBotTokenValidMatch, 'isTelegramBotTokenValid function found in renderer.js');
  assert.ok(updateTelegramTutorialVisibilityMatch, 'updateTelegramTutorialVisibility function found in renderer.js');

  return {
    isTelegramBotTokenValidCode: isTelegramBotTokenValidMatch[0],
    updateTelegramTutorialVisibilityCode: updateTelegramTutorialVisibilityMatch[0]
  };
}

test('isTelegramBotTokenValid validates real Telegram bot token formats', () => {
  const { isTelegramBotTokenValidCode } = extractTelegramLogic();
  const sandbox = {};
  vm.runInNewContext(isTelegramBotTokenValidCode, sandbox);
  const isValid = sandbox.isTelegramBotTokenValid;

  // Valid standard Telegram bot tokens (8-12 digits + colon + 35 chars)
  assert.equal(isValid('123456789:ABCdefGhIJKLMNOPQRSTUVWXYZabcdefghi'), true);
  assert.equal(isValid('842877845:AAF_1234567890abcdefghijklmnopqrstuvw'), true);
  assert.equal(isValid('  842877845:AAF_1234567890abcdefghijklmnopqrstuvw  '), true);

  // Invalid: empty / null / non-string
  assert.equal(isValid(''), false);
  assert.equal(isValid('   '), false);
  assert.equal(isValid(null), false);
  assert.equal(isValid(undefined), false);

  // Invalid: missing colon or improper characters
  assert.equal(isValid('123456789'), false);
  assert.equal(isValid('abcdefgh:abcdefgh'), false);
  assert.equal(isValid('123:short'), false);
  assert.equal(isValid('bad token with spaces:123456'), false);
});

test('updateTelegramTutorialVisibility hides tutorial when valid and reveals when empty or incorrect', () => {
  const { isTelegramBotTokenValidCode, updateTelegramTutorialVisibilityCode } = extractTelegramLogic();

  function createMockElement() {
    const classes = new Set();
    return {
      style: {},
      classList: {
        add: c => classes.add(c),
        remove: c => classes.delete(c),
        toggle: (c, force) => {
          if (force === undefined) {
            if (classes.has(c)) classes.delete(c);
            else classes.add(c);
          } else if (force) {
            classes.add(c);
          } else {
            classes.delete(c);
          }
          return classes.has(c);
        },
        contains: c => classes.has(c)
      },
      value: '',
      textContent: '',
      hidden: false
    };
  }

  const telegramGuideBox = createMockElement();
  const telegramConfigPanel = createMockElement();
  const telegramBotTokenInput = createMockElement();
  const telegramToggleGuideBtn = createMockElement();
  const telegramStatusBadge = createMockElement();
  const telegramEnabledToggle = { checked: true };

  const sandbox = {
    telegramGuideBox,
    telegramConfigPanel,
    telegramBotTokenInput,
    telegramToggleGuideBtn,
    telegramStatusBadge,
    telegramEnabledToggle,
    isTokenApiInvalid: false,
    userToggledGuide: false
  };

  const script = `
    ${isTelegramBotTokenValidCode}
    ${updateTelegramTutorialVisibilityCode}
  `;
  vm.runInNewContext(script, sandbox);

  // Case 1: Token is empty -> tutorial is visible, panel is not is-configured
  sandbox.telegramBotTokenInput.value = '';
  sandbox.updateTelegramTutorialVisibility();
  assert.equal(sandbox.telegramGuideBox.style.display, 'block');
  assert.equal(sandbox.telegramConfigPanel.classList.contains('is-configured'), false);

  // Case 2: Token is invalid format -> tutorial is visible, input marked invalid
  sandbox.telegramBotTokenInput.value = 'invalid_token_123';
  sandbox.updateTelegramTutorialVisibility();
  assert.equal(sandbox.telegramGuideBox.style.display, 'block');
  assert.equal(sandbox.telegramConfigPanel.classList.contains('is-configured'), false);
  assert.equal(sandbox.telegramBotTokenInput.classList.contains('input-invalid'), true);

  // Case 3: Token is valid format -> tutorial is hidden, panel is configured & reduced
  sandbox.telegramBotTokenInput.value = '123456789:ABCdefGhIJKLMNOPQRSTUVWXYZabcdefghi';
  sandbox.updateTelegramTutorialVisibility();
  assert.equal(sandbox.telegramGuideBox.style.display, 'none');
  assert.equal(sandbox.telegramConfigPanel.classList.contains('is-configured'), true);
  assert.equal(sandbox.telegramBotTokenInput.classList.contains('input-invalid'), false);
  assert.equal(sandbox.telegramToggleGuideBtn.style.display, 'inline-block');
  assert.equal(sandbox.telegramStatusBadge.style.display, 'inline-block');

  // Case 4: Token was valid, but Telegram API rejected it (isTokenApiInvalid = true)
  sandbox.isTokenApiInvalid = true;
  sandbox.updateTelegramTutorialVisibility();
  assert.equal(sandbox.telegramGuideBox.style.display, 'block');
  assert.equal(sandbox.telegramConfigPanel.classList.contains('is-configured'), false);
  assert.equal(sandbox.telegramBotTokenInput.classList.contains('input-invalid'), true);

  // Case 5: Token becomes empty again -> tutorial reappears
  sandbox.isTokenApiInvalid = false;
  sandbox.telegramBotTokenInput.value = '';
  sandbox.updateTelegramTutorialVisibility();
  assert.equal(sandbox.telegramGuideBox.style.display, 'block');
  assert.equal(sandbox.telegramConfigPanel.classList.contains('is-configured'), false);
});
