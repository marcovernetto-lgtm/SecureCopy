const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const {
  escapeHtml,
  formatBytes,
  sendTelegramMessage,
  detectTelegramChatId,
  sendTestNotification,
  formatCopyCompletionMessage
} = require('../src/telegram-notify.js');

test('escapeHtml properly sanitizes text for Telegram HTML', () => {
  assert.equal(escapeHtml('DCIM & Photos <A>'), 'DCIM &amp; Photos &lt;A&gt;');
  assert.equal(escapeHtml('Card_01'), 'Card_01');
  assert.equal(escapeHtml(null), '');
});

test('formatBytes formats byte counts correctly', () => {
  assert.equal(formatBytes(0), '0 B');
  assert.equal(formatBytes(1024), '1.0 KB');
  assert.equal(formatBytes(1024 * 1024 * 500), '500.0 MB');
  assert.equal(formatBytes(1024 * 1024 * 1024 * 4.5), '4.5 GB');
});

test('formatCopyCompletionMessage builds clear, valid notifications', () => {
  const successMsg = formatCopyCompletionMessage(
    { description: 'SD_CARD_1', destinationDir: '/Volumes/BackupSSD/Project' },
    { status: 'completed', copied: 15, skipped: 3, transferredBytes: 1024 * 1024 * 250, failures: [] }
  );

  assert.match(successMsg, /Backup Completato/);
  assert.match(successMsg, /SD_CARD_1/);
  assert.match(successMsg, /Project/);
  assert.match(successMsg, /15 copiati/);
  assert.match(successMsg, /3 già validi/);
  assert.match(successMsg, /SHA-256 bit-per-bit certificata/);

  const errorMsg = formatCopyCompletionMessage(
    { description: 'CFExpress_A', destinationDir: '/Volumes/RAID/Dailies' },
    { status: 'partial', copied: 10, skipped: 0, transferredBytes: 1024 * 1024 * 50, failures: [{ path: 'clip.mp4', reason: 'I/O' }] }
  );

  assert.match(errorMsg, /Backup Terminato con Avvisi/);
  assert.match(errorMsg, /1 file da verificare/);
});

test('sendTelegramMessage validates parameters without making requests', async () => {
  const res1 = await sendTelegramMessage('', '12345', 'Ciao');
  assert.equal(res1.ok, false);

  const res2 = await sendTelegramMessage('123:TOKEN', '', 'Ciao');
  assert.equal(res2.ok, false);
  assert.match(res2.error, /Chat ID/);

  const res3 = await sendTelegramMessage('123:TOKEN', '12345', '');
  assert.equal(res3.ok, false);
  assert.match(res3.error, /Testo del messaggio/);
});

test('Telegram API interaction with mock server', async (t) => {
  let receivedRequests = [];
  const mockServer = http.createServer((req, res) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      receivedRequests.push({ url: req.url, method: req.method, body });

      if (req.url.includes('/sendMessage')) {
        const payload = JSON.parse(body || '{}');
        if (payload.chat_id === '9999') {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, description: 'Forbidden: bot was blocked by the user' }));
        } else {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, result: { message_id: 42 } }));
        }
      } else if (req.url.includes('/getUpdates')) {
        if (req.url.includes('EMPTY_TOKEN')) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, result: [] }));
        } else {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            ok: true,
            result: [
              {
                update_id: 101,
                message: {
                  message_id: 1,
                  chat: { id: 12345678, first_name: 'Marco', type: 'private' },
                  text: '/start'
                }
              }
            ]
          }));
        }
      } else {
        res.writeHead(404);
        res.end();
      }
    });
  });

  await new Promise(resolve => mockServer.listen(0, '127.0.0.1', resolve));
  const port = mockServer.address().port;
  const mockOptions = { host: '127.0.0.1', port, protocol: 'http:' };

  t.after(() => mockServer.close());

  // Test sendMessage success
  const sendRes = await sendTelegramMessage('TEST_TOKEN', '12345678', 'Test mess', mockOptions);
  assert.equal(sendRes.ok, true);
  assert.equal(sendRes.result.message_id, 42);

  // Test sendMessage failure
  const failRes = await sendTelegramMessage('TEST_TOKEN', '9999', 'Fail mess', mockOptions);
  assert.equal(failRes.ok, false);
  assert.match(failRes.error, /Forbidden/);

  // Test detectTelegramChatId success
  const detectRes = await detectTelegramChatId('TEST_TOKEN', mockOptions);
  assert.equal(detectRes.ok, true);
  assert.equal(detectRes.chatId, '12345678');
  assert.equal(detectRes.title, 'Marco');

  // Test detectTelegramChatId empty
  const emptyRes = await detectTelegramChatId('EMPTY_TOKEN', mockOptions);
  assert.equal(emptyRes.ok, false);
  assert.match(emptyRes.error, /Nessun messaggio trovato/);

  // Test sendTestNotification
  const testRes = await sendTestNotification('TEST_TOKEN', '12345678', mockOptions);
  assert.equal(testRes.ok, true);
});
