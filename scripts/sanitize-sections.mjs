import { createRequire } from 'module';
import { resolve } from 'path';
import { pathToFileURL } from 'url';

const root = resolve(process.cwd());
const require = createRequire(resolve(root, 'apps/server/package.json'));
const Database = require('better-sqlite3');
const { sanitizeLlmOutput } = await import(
  pathToFileURL(resolve(root, 'apps/server/dist/common/llm-parsing.js')).href,
);

const db = new Database(resolve(root, 'apps/server/data/dev.db'));
const rows = db
  .prepare("SELECT id, title, content FROM t_bid_section WHERE project_id = ?")
  .all('223673464197296128');
const upd = db.prepare('UPDATE t_bid_section SET content = ? WHERE id = ?');
let n = 0;
for (const r of rows) {
  const clean = sanitizeLlmOutput(r.content || '');
  if (clean !== (r.content || '')) {
    upd.run(clean, r.id);
    n += 1;
    console.log(
      `${r.title}: ${(r.content || '').length} -> ${clean.length} | ${clean.slice(0, 48).replace(/\n/g, ' ')}`,
    );
  }
}
console.log(`updated ${n} of ${rows.length}`);
console.log(
  db
    .prepare(
      "SELECT title, CASE WHEN content LIKE '%<think>%' OR content LIKE '%Let me %' THEN 'DIRTY' ELSE 'OK' END AS st FROM t_bid_section WHERE project_id = ?",
    )
    .all('223673464197296128'),
);
