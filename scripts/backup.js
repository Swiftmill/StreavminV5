const { execFile } = require('node:child_process');
const fs = require('node:fs/promises');
const path = require('node:path');

async function main() {
  const backupDir = path.join(__dirname, '..', 'backup');
  await fs.mkdir(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const target = path.join(backupDir, `streavmin-${stamp}.tar.gz`);
  await new Promise((resolve, reject) => {
    execFile('tar', ['-czf', target, 'data'], { cwd: path.join(__dirname, '..') }, (err) => {
      if (err) return reject(err);
      resolve();
    });
  });
  console.log(`Backup written to ${target}`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
