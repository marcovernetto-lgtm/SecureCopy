const https = require('node:https');
const path = require('node:path');

/**
 * Escapes special HTML characters for Telegram HTML parse_mode.
 */
function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Format bytes into human-readable string.
 */
function formatBytes(bytes) {
  if (bytes === 0 || !bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(i === 0 ? 0 : 1)} ${sizes[i]}`;
}

/**
 * Internal helper to make HTTPS requests to the Telegram Bot API.
 */
function requestTelegram(token, apiMethod, payload = null, options = {}) {
  const normToken = String(token || '').trim();
  if (!normToken) {
    return Promise.resolve({ ok: false, error: 'Token del bot Telegram mancante' });
  }

  const host = options.host || 'api.telegram.org';
  const port = options.port || 443;
  const protocol = options.protocol === 'http:' ? require('node:http') : https;
  const method = payload ? 'POST' : 'GET';
  const bodyData = payload ? JSON.stringify(payload) : null;

  return new Promise((resolve, reject) => {
    const req = protocol.request({
      hostname: host,
      port: port,
      path: `/bot${encodeURIComponent(normToken)}/${apiMethod}`,
      method,
      headers: {
        ...(bodyData ? {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(bodyData)
        } : {})
      },
      timeout: options.timeout || 10000
    }, (res) => {
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        try {
          const data = JSON.parse(body);
          if (data.ok) {
            resolve({ ok: true, result: data.result });
          } else {
            const desc = data.description || `Errore Telegram (HTTP ${res.statusCode})`;
            resolve({ ok: false, error: desc, statusCode: res.statusCode });
          }
        } catch {
          resolve({ ok: false, error: `Risposta Telegram non valida (HTTP ${res.statusCode})`, statusCode: res.statusCode });
        }
      });
    });

    req.on('error', (err) => {
      resolve({
        ok: false,
        error: `Connessione non riuscita: ${err.message || 'Server Telegram irraggiungibile'}`
      });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({ ok: false, error: 'Timeout connessione con i server Telegram' });
    });

    if (bodyData) {
      req.write(bodyData);
    }
    req.end();
  });
}

/**
 * Send a message via Telegram Bot.
 */
async function sendTelegramMessage(botToken, chatId, text, options = {}) {
  const normToken = String(botToken || '').trim();
  if (!normToken) {
    return { ok: false, error: 'Token del bot Telegram mancante' };
  }
  const normChatId = String(chatId || '').trim();
  if (!normChatId) {
    return { ok: false, error: 'Chat ID Telegram mancante' };
  }
  if (!text) {
    return { ok: false, error: 'Testo del messaggio mancante' };
  }

  const payload = {
    chat_id: normChatId,
    text: String(text).trim(),
    parse_mode: 'HTML',
    disable_web_page_preview: true
  };

  return requestTelegram(botToken, 'sendMessage', payload, options);
}

/**
 * Query recent updates from the bot to auto-detect the user's or group's Chat ID.
 */
async function detectTelegramChatId(botToken, options = {}) {
  const res = await requestTelegram(botToken, 'getUpdates?limit=20', null, options);
  if (!res.ok) {
    return res;
  }

  const updates = Array.isArray(res.result) ? res.result : [];
  if (updates.length === 0) {
    return {
      ok: false,
      error: 'Nessun messaggio trovato. Apri il tuo bot su Telegram, invia un messaggio o premi "Avvia" (/start) e riprova.'
    };
  }

  // Iterate backwards from the most recent update
  for (let i = updates.length - 1; i >= 0; i--) {
    const u = updates[i];
    const msg = u.message || u.channel_post || u.my_chat_member;
    const chat = msg?.chat;
    if (chat && chat.id) {
      const title = chat.title || chat.username || `${chat.first_name || ''} ${chat.last_name || ''}`.trim() || 'Chat Telegram';
      return {
        ok: true,
        chatId: String(chat.id),
        title: title
      };
    }
  }

  return {
    ok: false,
    error: 'Nessuna chat attiva identificata nei messaggi recenti.'
  };
}

/**
 * Send a test notification to verify the credentials.
 */
async function sendTestNotification(botToken, chatId, options = {}) {
  const message = [
    '🔔 <b>SecureCopy — Test Notifica</b>',
    '',
    'Connessione riuscita! Il bot Telegram è configurato correttamente.',
    'Riceverai un avviso su questa chat ogni volta che un backup o una copia viene completata.'
  ].join('\n');

  return sendTelegramMessage(botToken, chatId, message, options);
}

/**
 * Format a clean copy completion notification.
 */
function formatCopyCompletionMessage(item = {}, report = {}) {
  const isSuccess = report.status === 'completed' && (!report.failures || !report.failures.length);
  const icon = isSuccess ? '✅' : '⚠️';
  const header = isSuccess ? 'Backup Completato' : 'Backup Terminato con Avvisi';

  const sourceDesc = item.description || (item.sourceDirs && item.sourceDirs.length ? path.basename(item.sourceDirs[0]) : 'Sorgente');
  const destName = item.destinationDir ? path.basename(item.destinationDir) : 'Destinazione';

  const copied = report.copied ?? item.filesCopied ?? 0;
  const skipped = report.skipped ?? item.filesSkipped ?? 0;
  const bytes = report.transferredBytes || report.totalBytes || 0;
  const failuresCount = report.failures?.length || item.filesFailed || 0;

  const timeStr = new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  const lines = [
    `${icon} <b>SecureCopy — ${header}</b>`,
    '',
    `📁 <b>Sorgente:</b> <code>${escapeHtml(sourceDesc)}</code>`,
    `💾 <b>Destinazione:</b> <code>${escapeHtml(destName)}</code>`,
    `📊 <b>File:</b> ${copied} copiati (${formatBytes(bytes)})${skipped > 0 ? ` · ${skipped} già validi` : ''}`,
    ...(failuresCount > 0 ? [`⚠️ <b>Errori:</b> ${failuresCount} file da verificare`] : []),
    '🛡️ <b>Integrità:</b> SHA-256 bit-per-bit certificata',
    `⏱️ <b>Ora:</b> ${timeStr}`
  ];

  return lines.join('\n');
}

module.exports = {
  escapeHtml,
  formatBytes,
  sendTelegramMessage,
  detectTelegramChatId,
  sendTestNotification,
  formatCopyCompletionMessage,
  requestTelegram
};
