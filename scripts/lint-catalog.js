const fs = require('node:fs/promises');
const path = require('node:path');

async function loadJson(file) {
  const raw = await fs.readFile(file, 'utf8');
  return JSON.parse(raw);
}

function isUrl(value) {
  if (typeof value !== 'string') return false;
  try {
    const parsed = new URL(value);
    return ['http:', 'https:'].includes(parsed.protocol);
  } catch (_) {
    return false;
  }
}

async function main() {
  const issues = [];
  const dataDir = path.join(__dirname, '..', 'data');
  const categories = await loadJson(path.join(dataDir, 'catalog', 'categories.json'));
  if (!Array.isArray(categories) || !categories.length) {
    issues.push('Aucune catégorie définie.');
  } else {
    const ids = new Set();
    categories.forEach((category) => {
      if (!category.id) issues.push('Catégorie sans identifiant');
      if (ids.has(category.id)) issues.push(`Doublon de catégorie: ${category.id}`);
      ids.add(category.id);
      if (typeof category.order !== 'number') issues.push(`Catégorie ${category.id} sans ordre numérique`);
    });
  }

  const movies = await loadJson(path.join(dataDir, 'catalog', 'movies.json'));
  if (!Array.isArray(movies)) {
    issues.push('movies.json doit être un tableau');
  } else {
    const ids = new Set();
    movies.forEach((movie) => {
      if (!movie.id) issues.push('Film sans id');
      if (ids.has(movie.id)) issues.push(`Film en doublon: ${movie.id}`);
      ids.add(movie.id);
      if (!movie.title) issues.push(`Film ${movie.id} sans titre`);
      if (!isUrl(movie.streamUrl)) issues.push(`Film ${movie.id} avec streamUrl invalide`);
      if (movie.subtitles && !Array.isArray(movie.subtitles)) issues.push(`Film ${movie.id} sous-titres doit être un tableau`);
    });
  }

  const seriesDir = path.join(dataDir, 'catalog', 'series');
  let seriesEntries = [];
  try {
    seriesEntries = await fs.readdir(seriesDir);
  } catch (err) {
    if (err.code === 'ENOENT') seriesEntries = [];
    else throw err;
  }
  for (const file of seriesEntries.filter((entry) => entry.endsWith('.json'))) {
    const serie = await loadJson(path.join(seriesDir, file));
    if (!serie.slug) issues.push(`Série ${file} sans slug`);
    if (!serie.title) issues.push(`Série ${file} sans titre lisible`);
    if (!Array.isArray(serie.seasons)) {
      issues.push(`Série ${serie.slug} sans saisons`);
      continue;
    }
    serie.seasons.forEach((season) => {
      if (!Array.isArray(season.episodes)) {
        issues.push(`Série ${serie.slug} saison ${season.seasonNumber} sans épisodes`);
        return;
      }
      season.episodes.forEach((episode) => {
        if (!isUrl(episode.streamUrl)) {
          issues.push(`Série ${serie.slug} S${episode.season}E${episode.ep} streamUrl invalide`);
        }
      });
    });
  }

  if (issues.length) {
    console.error('Erreurs détectées dans le catalogue:\n - ' + issues.join('\n - '));
    process.exit(1);
  } else {
    console.log('Catalogue valide ✅');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
