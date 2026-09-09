const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');
const dir = 'worker/.wrangler/state/v3/do/fabriik-worker-TemplateDocDO';
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sqlite'));
for (const f of files) {
  const full = path.join(dir, f);
  try {
    const db = new DatabaseSync(full, { readOnly: true });
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((r) => r.name);
    let out = f.slice(0, 8) + ' tables: ' + tables.join(',');
    for (const t of tables) {
      if (t === '_cf_METADATA' || t === 'sqlite_sequence') continue;
      try {
        const rows = db.prepare(`SELECT * FROM "${t}" LIMIT 10`).all();
        out += ` | ${t}:` + JSON.stringify(rows).slice(0, 300);
      } catch (e) {
        out += ` | ${t}:err ${e.message.slice(0, 80)}`;
      }
    }
    console.log(out);
    db.close();
  } catch (e) {
    console.log(f.slice(0, 8), 'OPEN ERR', e.message);
  }
}
