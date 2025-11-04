const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const dataset = require('./seed-data');

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function writeJsonAtomic(target, data) {
  await ensureDir(path.dirname(target));
  const tmp = `${target}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), 'utf8');
  await fs.rename(tmp, target);
}

async function main() {
  await ensureDir(path.join(__dirname, '..', 'data'));
  await writeJsonAtomic(path.join(__dirname, '..', 'data', 'catalog', 'categories.json'), dataset.categories);
  await writeJsonAtomic(path.join(__dirname, '..', 'data', 'catalog', 'movies.json'), dataset.movies);
  const seriesDir = path.join(__dirname, '..', 'data', 'catalog', 'series');
  await ensureDir(seriesDir);
  for (const serie of dataset.series) {
    await writeJsonAtomic(path.join(seriesDir, `${serie.slug}.json`), serie);
  }
  const usersDir = path.join(__dirname, '..', 'data', 'users');
  await ensureDir(usersDir);
  await writeJsonAtomic(path.join(usersDir, 'users.json'), dataset.users.list);
  await writeJsonAtomic(path.join(usersDir, 'admin.json'), dataset.users.admin);
  for (const [username, history] of Object.entries(dataset.users.histories)) {
    await writeJsonAtomic(path.join(usersDir, `${username}.history.json`), history);
  }
  await fs.writeFile(path.join(__dirname, '..', 'data', 'audit.log'), dataset.audit, 'utf8');
  console.log('Seed completed.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
