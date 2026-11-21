import { createServer } from 'node:http';
import { Readable } from 'node:stream';
import { DatabaseSync } from 'node:sqlite';
import { mkdir, readFile } from 'node:fs/promises';
import worker from '../dist/server/index.js';

try { process.loadEnvFile(); } catch (error) { if (error.code !== 'ENOENT') throw error; }
await mkdir('.data', { recursive: true });
const database = new DatabaseSync(process.env.LEADS_DB ?? '.data/leads.sqlite');
database.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 3000;');
if (!database.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'leads'").get()) {
  const migration = await readFile('drizzle/0000_leads.sql', 'utf8');
  database.exec(`BEGIN; ${migration} COMMIT;`);
}
if (!database.prepare("SELECT 1 FROM pragma_table_info('leads') WHERE name = 'currency'").get()) {
  const migration = await readFile('drizzle/0001_lead_currency.sql', 'utf8');
  database.exec(`BEGIN; ${migration} COMMIT;`);
}

const DB = {
  prepare(sql) {
    const statement = database.prepare(sql);
    return {
      bind(...values) {
        return {
          run: () => ({ meta: statement.run(...values) }),
          first: () => statement.get(...values),
          all: () => ({ results: statement.all(...values) }),
        };
      },
    };
  },
};

const port = Number(process.env.PORT ?? 4173);
const env = { DB, OWNER_PASSWORD: process.env.OWNER_PASSWORD, PAGES_ORIGIN: process.env.PAGES_ORIGIN };
createServer(async (incoming, outgoing) => {
  try {
    const host = /^localhost(?::\d+)?$/i.test(incoming.headers.host ?? '') ? incoming.headers.host : `127.0.0.1:${port}`;
    const url = new URL(incoming.url, `http://${host}`);
    const options = { method: incoming.method, headers: incoming.headers };
    if (!['GET', 'HEAD'].includes(incoming.method)) {
      options.body = Readable.toWeb(incoming);
      options.duplex = 'half';
    }
    const response = await worker.fetch(new Request(url, options), env);
    outgoing.writeHead(response.status, Object.fromEntries(response.headers));
    if (response.body) Readable.fromWeb(response.body).pipe(outgoing);
    else outgoing.end();
  } catch (error) {
    console.error(error);
    outgoing.writeHead(500).end();
  }
}).listen(port, '127.0.0.1', () => {
  console.log(`Local: http://127.0.0.1:${port}`);
});
