const fs = require('node:fs');
const path = require('node:path');
const label = 'com.unshapedstudio.securecopy.dev-login';
const marker = 'SecureCopy managed login item';
const escapeXml = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[char]));
function launchAgentPlist(executable, project) {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<!-- ${marker} -->\n<plist version="1.0"><dict><key>Label</key><string>${label}</string><key>ProgramArguments</key><array><string>${escapeXml(executable)}</string><string>${escapeXml(project)}</string><string>--background</string></array><key>RunAtLoad</key><true/><key>ProcessType</key><string>Background</string></dict></plist>\n`;
}
function createLoginStartup({ app, platform = process.platform, executable = process.execPath, project = app.getAppPath(), home = app.getPath('home') }) {
  const agent = path.join(home, 'Library', 'LaunchAgents', `${label}.plist`);
  function readAgent() {
    try { return fs.readFileSync(agent, 'utf8'); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  }
  return {
    get() {
      if (platform !== 'darwin') return { supported: false, enabled: false };
      if (app.isPackaged) {
        const settings = app.getLoginItemSettings();
        return { supported: true, enabled: settings.openAtLogin, status: settings.status, openedAtLogin: settings.wasOpenedAtLogin };
      }
      const saved = readAgent();
      return { supported: true, enabled: !!saved?.includes(marker), development: true };
    },
    async set(enabled) {
      if (typeof enabled !== 'boolean' || platform !== 'darwin') throw new Error('Avvio automatico non disponibile.');
      if (app.isPackaged) {
        app.setLoginItemSettings({ openAtLogin: enabled });
        const result = this.get();
        if (enabled && !result.enabled && result.status !== 'requires-approval') throw new Error('macOS non ha registrato l’avvio automatico.');
        return result;
      }
      const saved = readAgent();
      if (saved && !saved.includes(marker)) throw new Error('Configurazione di avvio esistente non riconosciuta.');
      if (enabled) {
        await fs.promises.mkdir(path.dirname(agent), { recursive: true });
        const temp = `${agent}.tmp`;
        await fs.promises.writeFile(temp, launchAgentPlist(executable, project), { mode: 0o644 });
        await fs.promises.rename(temp, agent);
      } else if (saved) await fs.promises.unlink(agent);
      return this.get();
    }
  };
}
module.exports = { createLoginStartup, launchAgentPlist };
