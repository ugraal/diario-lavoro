// Segreti (API key Anthropic, token Asana) cifrati con safeStorage, che usa il
// portachiavi del sistema operativo. Le variabili d'ambiente hanno la precedenza (sviluppo).
'use strict';
const fs = require('fs');
const path = require('path');

const ENV = { anthropic: 'ANTHROPIC_API_KEY', asana: 'ASANA_TOKEN' };

class Secrets {
  constructor(dir, safeStorage) {
    this.file = path.join(dir, 'secrets.json');
    this.safe = safeStorage || null;
    this.data = {};
    try { this.data = JSON.parse(fs.readFileSync(this.file, 'utf8')); } catch { this.data = {}; }
  }
  encryptionAvailable() { try { return !!(this.safe && this.safe.isEncryptionAvailable()); } catch { return false; } }
  get(name) {
    if (ENV[name] && process.env[ENV[name]]) return process.env[ENV[name]];
    const rec = this.data[name];
    if (!rec) return '';
    if (rec.enc) {
      try { return this.safe.decryptString(Buffer.from(rec.value, 'base64')); } catch { return ''; }
    }
    return rec.value || '';
  }
  set(name, value) {
    value = String(value || '').trim();
    if (!value) delete this.data[name];
    else if (this.encryptionAvailable()) this.data[name] = { enc: true, value: this.safe.encryptString(value).toString('base64') };
    else this.data[name] = { enc: false, value };
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file, JSON.stringify(this.data, null, 1), { mode: 0o600 });
  }
  status() {
    const s = { encryption: this.encryptionAvailable() };
    Object.keys(ENV).forEach((k) => {
      const fromEnv = !!process.env[ENV[k]];
      const v = this.get(k);
      s[k] = { set: !!v, fromEnv, hint: v ? '…' + v.slice(-4) : '' };
    });
    return s;
  }
}

module.exports = { Secrets };
