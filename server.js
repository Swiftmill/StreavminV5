const http = require('node:http');
const fs = require('node:fs/promises');
const fssync = require('node:fs');
const path = require('node:path');
const url = require('node:url');
const crypto = require('node:crypto');

const DATA_DIR = path.join(__dirname, 'data');
const FRONTEND_DIR = path.join(__dirname, 'frontend');
const SESSION_TTL_MS = 1000 * 60 * 60 * 8; // 8h
const sessions = new Map();
const fileLocks = new Map();

function log(...args) {
  console.log(new Date().toISOString(), '-', ...args);
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function withFileLock(filePath, fn) {
  const abs = path.resolve(filePath);
  const current = fileLocks.get(abs) || Promise.resolve();
  let release;
  const next = current.then(() => new Promise((resolve) => (release = resolve)));
  fileLocks.set(abs, next);
  try {
    await current;
    return await fn();
  } finally {
    release();
    if (fileLocks.get(abs) === next) {
      fileLocks.delete(abs);
    }
  }
}

async function readJson(filePath, fallback = null) {
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    if (!raw.trim()) return fallback;
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === 'ENOENT') return fallback;
    throw err;
  }
}

async function writeJsonAtomic(filePath, data) {
  await ensureDir(path.dirname(filePath));
  const tmp = `${filePath}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), 'utf-8');
  await fs.rename(tmp, filePath);
}

async function appendAudit(action, actor, detail) {
  const line = `${new Date().toISOString()}\t${action}\t${actor}\t${detail}\n`;
  await ensureDir(DATA_DIR);
  await fs.appendFile(path.join(DATA_DIR, 'audit.log'), line, 'utf-8');
}

function parseCookies(req) {
  const header = req.headers['cookie'];
  if (!header) return {};
  return header.split(';').reduce((acc, part) => {
    const [key, value] = part.trim().split('=');
    if (key) acc[key] = decodeURIComponent(value || '');
    return acc;
  }, {});
}

function createSession(username, role) {
  const sid = crypto.randomUUID();
  const csrfToken = crypto.randomBytes(24).toString('hex');
  const expires = Date.now() + SESSION_TTL_MS;
  sessions.set(sid, { username, role, csrfToken, expires });
  return { sid, csrfToken, expires };
}

function getSession(req) {
  const cookies = parseCookies(req);
  const sid = cookies.sid;
  if (!sid) return null;
  const session = sessions.get(sid);
  if (!session) return null;
  if (session.expires < Date.now()) {
    sessions.delete(sid);
    return null;
  }
  session.expires = Date.now() + SESSION_TTL_MS;
  return { sid, ...session };
}

function destroySession(sid) {
  sessions.delete(sid);
}

async function readRequestBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
    if (chunks.reduce((len, part) => len + part.length, 0) > 5 * 1024 * 1024) {
      throw new Error('Payload too large');
    }
  }
  return Buffer.concat(chunks).toString('utf-8');
}

async function parseJsonBody(req) {
  const raw = await readRequestBody(req);
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw Object.assign(new Error('Invalid JSON'), { statusCode: 400 });
  }
}

function sendJson(res, statusCode, payload, headers = {}) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    ...headers,
  });
  res.end(body);
}

function sendText(res, statusCode, text, headers = {}) {
  res.writeHead(statusCode, {
    'Content-Type': 'text/plain; charset=utf-8',
    ...headers,
  });
  res.end(text);
}

function sanitizeString(input, maxLength = 500) {
  if (typeof input !== 'string') return '';
  return input.replace(/[\n\r\t]+/g, ' ').trim().slice(0, maxLength);
}

function validateUrl(candidate) {
  if (!candidate) return '';
  try {
    const parsed = new URL(candidate);
    if (!['http:', 'https:'].includes(parsed.protocol)) return '';
    return parsed.toString();
  } catch (err) {
    return '';
  }
}

async function getUsers() {
  const file = path.join(DATA_DIR, 'users', 'users.json');
  const users = await readJson(file, []);
  return Array.isArray(users) ? users : [];
}

async function saveUsers(users) {
  const file = path.join(DATA_DIR, 'users', 'users.json');
  await withFileLock(file, () => writeJsonAtomic(file, users));
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const N = 16384, r = 8, p = 1, keyLen = 64;
  const derivedKey = crypto.scryptSync(password, salt, keyLen, { N, r, p });
  return `scrypt$${N}$${r}$${p}$${salt.toString('base64')}$${derivedKey.toString('base64')}`;
}

function verifyPassword(password, storedHash) {
  if (typeof storedHash !== 'string') return false;
  const parts = storedHash.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [_, N, r, p, saltB64, hashB64] = parts;
  const salt = Buffer.from(saltB64, 'base64');
  const key = Buffer.from(hashB64, 'base64');
  const derived = crypto.scryptSync(password, salt, key.length, {
    N: Number(N),
    r: Number(r),
    p: Number(p),
  });
  return crypto.timingSafeEqual(derived, key);
}

async function loadMovies() {
  const file = path.join(DATA_DIR, 'catalog', 'movies.json');
  const movies = await readJson(file, []);
  return Array.isArray(movies) ? movies : [];
}

async function saveMovies(movies) {
  const file = path.join(DATA_DIR, 'catalog', 'movies.json');
  await withFileLock(file, () => writeJsonAtomic(file, movies));
}

async function loadCategories() {
  const file = path.join(DATA_DIR, 'catalog', 'categories.json');
  const categories = await readJson(file, []);
  return Array.isArray(categories) ? categories : [];
}

async function saveCategories(categories) {
  const file = path.join(DATA_DIR, 'catalog', 'categories.json');
  await withFileLock(file, () => writeJsonAtomic(file, categories));
}

async function loadSeries(slug) {
  const file = path.join(DATA_DIR, 'catalog', 'series', `${slug}.json`);
  return readJson(file, null);
}

async function saveSeries(slug, payload) {
  const dir = path.join(DATA_DIR, 'catalog', 'series');
  await ensureDir(dir);
  const file = path.join(dir, `${slug}.json`);
  await withFileLock(file, () => writeJsonAtomic(file, payload));
}

async function listSeries() {
  const dir = path.join(DATA_DIR, 'catalog', 'series');
  await ensureDir(dir);
  const entries = await fs.readdir(dir);
  const result = [];
  for (const entry of entries) {
    if (!entry.endsWith('.json')) continue;
    const payload = await loadSeries(entry.replace(/\.json$/, ''));
    if (payload) result.push(payload);
  }
  return result;
}

async function getHistory(username) {
  if (!username) return { username: null, continueWatching: [] };
  const file = path.join(DATA_DIR, 'users', `${username}.history.json`);
  const history = await readJson(file, null);
  if (!history) return { username, continueWatching: [] };
  history.continueWatching = Array.isArray(history.continueWatching)
    ? history.continueWatching
    : [];
  return history;
}

async function saveHistory(username, history) {
  const file = path.join(DATA_DIR, 'users', `${username}.history.json`);
  await withFileLock(file, () => writeJsonAtomic(file, history));
}

function requireCsrf(req, session) {
  const method = req.method.toUpperCase();
  if (['GET', 'HEAD', 'OPTIONS'].includes(method)) return true;
  const header = req.headers['x-csrf-token'];
  if (!header || !session || header !== session.csrfToken) {
    const error = new Error('CSRF token missing or invalid');
    error.statusCode = 403;
    throw error;
  }
  return true;
}

function ensureRole(session, roles = []) {
  if (!session) {
    const error = new Error('Authentication required');
    error.statusCode = 401;
    throw error;
  }
  if (roles.length && !roles.includes(session.role)) {
    const error = new Error('Forbidden');
    error.statusCode = 403;
    throw error;
  }
}

function buildRoute(pattern) {
  const keys = [];
  const regex = new RegExp('^' + pattern.replace(/:[^/]+/g, (segment) => {
    keys.push(segment.slice(1));
    return '([^/]+)';
  }) + '$');
  return { regex, keys };
}

const routes = [];

function addRoute(method, pattern, handler) {
  const compiled = buildRoute(pattern);
  routes.push({ method, pattern, handler, ...compiled });
}

function matchRoute(method, pathname) {
  for (const route of routes) {
    if (route.method !== method) continue;
    const match = pathname.match(route.regex);
    if (match) {
      const params = {};
      route.keys.forEach((key, idx) => {
        params[key] = decodeURIComponent(match[idx + 1]);
      });
      return { handler: route.handler, params };
    }
  }
  return null;
}

function toMovieResponse(movie) {
  const { passHash, ...rest } = movie;
  return rest;
}

function sortContent(items, field = 'createdAt') {
  return [...items].sort((a, b) => {
    const aDate = new Date(a[field] || 0).getTime();
    const bDate = new Date(b[field] || 0).getTime();
    return bDate - aDate;
  });
}

function findHero(movies, series) {
  const heroMovie = movies.find((m) => m.hero && m.published !== false);
  if (heroMovie) return { type: 'movie', data: heroMovie };
  const heroSeries = series.find((s) => s.hero && s.published !== false);
  if (heroSeries) return { type: 'series', data: heroSeries };
  if (movies.length) return { type: 'movie', data: movies[0] };
  if (series.length) return { type: 'series', data: series[0] };
  return null;
}

function filterPublished(items) {
  return items.filter((item) => item.published !== false && !item.deleted);
}

async function refreshCatalogSnapshot(session) {
  const [categories, movies, allSeries, history] = await Promise.all([
    loadCategories(),
    loadMovies(),
    listSeries(),
    session ? getHistory(session.username) : { continueWatching: [] },
  ]);
  const publishedMovies = filterPublished(movies);
  const publishedSeries = filterPublished(allSeries);
  const hero = findHero(publishedMovies, publishedSeries);
  const rows = categories
    .sort((a, b) => (a.order || 0) - (b.order || 0))
    .map((category) => {
      const items = [];
      if (category.id === 'trending') {
        items.push(...sortContent(publishedMovies, 'updatedAt').slice(0, 12));
        items.push(...sortContent(publishedSeries, 'updatedAt').slice(0, 12));
      } else if (category.id === 'new') {
        items.push(...sortContent(publishedMovies, 'createdAt').slice(0, 12));
      } else {
        const taggedMovies = publishedMovies.filter((m) =>
          Array.isArray(m.categories) && m.categories.includes(category.id)
        );
        const taggedSeries = publishedSeries.filter((s) =>
          Array.isArray(s.categories) && s.categories.includes(category.id)
        );
        items.push(...taggedMovies, ...taggedSeries);
      }
      return {
        ...category,
        items: items.map((item) => ({
          type: item.slug ? 'series' : 'movie',
          id: item.slug || item.id,
          title: item.title,
          synopsis: item.synopsis,
          poster: item.poster,
          hero: Boolean(item.hero),
          published: item.published !== false,
        })),
      };
    });

  return {
    categories,
    hero,
    movies: publishedMovies,
    series: publishedSeries,
    rows,
    continueWatching: history.continueWatching || [],
  };
}

async function validateMoviePayload(body, existingId = null) {
  const id = existingId || sanitizeString(body.id || '').toLowerCase().replace(/[^a-z0-9-]+/g, '-');
  if (!id) throw Object.assign(new Error('Movie id is required'), { statusCode: 400 });
  const title = sanitizeString(body.title || '', 150);
  if (!title) throw Object.assign(new Error('Title is required'), { statusCode: 400 });
  const synopsis = sanitizeString(body.synopsis || '', 800);
  const year = Number(body.year) || new Date().getFullYear();
  const duration = Number(body.duration) || 90;
  const genres = Array.isArray(body.genres) ? body.genres.map((g) => sanitizeString(g, 40)) : [];
  const tags = Array.isArray(body.tags) ? body.tags.map((g) => sanitizeString(g, 40)) : [];
  const streamUrl = validateUrl(body.streamUrl);
  if (!streamUrl) throw Object.assign(new Error('Invalid streamUrl'), { statusCode: 400 });
  const trailerUrl = validateUrl(body.trailerUrl || '');
  const poster = sanitizeString(body.poster || '', 200);
  const subtitles = Array.isArray(body.subtitles)
    ? body.subtitles
        .map((entry) => ({
          lang: sanitizeString(entry.lang || '', 10),
          label: sanitizeString(entry.label || '', 80),
          url: validateUrl(entry.url || ''),
        }))
        .filter((entry) => entry.lang && entry.label && entry.url)
    : [];
  const published = body.published !== false;
  const categories = Array.isArray(body.categories)
    ? body.categories.map((c) => sanitizeString(c, 40))
    : [];
  return {
    id,
    title,
    synopsis,
    year,
    duration,
    genres,
    tags,
    poster,
    hero: Boolean(body.hero),
    streamUrl,
    trailerUrl,
    subtitles,
    published,
    categories,
    createdAt: body.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function slugifySeriesName(name) {
  return sanitizeString(name || '', 180)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[^a-z0-9]+/g, '-')

    .replace(/^-+|-+$/g, '')
    || null;
}

function mergeEpisodeIntoSeries(series, payload) {
  const { season, ep } = payload;
  let seasons = Array.isArray(series.seasons) ? series.seasons : [];
  let seasonEntry = seasons.find((s) => s.seasonNumber === season);
  if (!seasonEntry) {
    seasonEntry = { seasonNumber: season, episodes: [] };
    seasons.push(seasonEntry);
  }
  let episodeEntry = seasonEntry.episodes.find((item) => item.ep === ep);
  if (!episodeEntry) {
    episodeEntry = { season, ep };
    seasonEntry.episodes.push(episodeEntry);
  }
  Object.assign(episodeEntry, payload);
  seasonEntry.episodes.sort((a, b) => a.ep - b.ep);
  seasons.sort((a, b) => a.seasonNumber - b.seasonNumber);
  series.seasons = seasons;
  series.updatedAt = new Date().toISOString();
  return series;
}

function validateEpisodePayload(body) {
  const seriesNameInput = body.seriesName || '';
  const slugInput = body.slug || '';
  const slug = slugifySeriesName(slugInput || seriesNameInput);
  if (!slug) throw Object.assign(new Error('Unable to slugify series name'), { statusCode: 400 });
  const seriesName = sanitizeString(seriesNameInput || slug.replace(/-/g, ' '), 200);
  if (!seriesName) throw Object.assign(new Error('seriesName is required'), { statusCode: 400 });
  const season = Number(body.season);
  const ep = Number(body.ep);
  if (!Number.isInteger(season) || season <= 0) {
    throw Object.assign(new Error('season must be >= 1'), { statusCode: 400 });
  }
  if (!Number.isInteger(ep) || ep <= 0) {
    throw Object.assign(new Error('ep must be >= 1'), { statusCode: 400 });
  }
  const title = sanitizeString(body.title || '', 180);
  const synopsis = sanitizeString(body.synopsis || '', 800);
  const streamUrl = validateUrl(body.streamUrl);
  if (!streamUrl) throw Object.assign(new Error('Invalid streamUrl'), { statusCode: 400 });
  const subtitles = Array.isArray(body.subtitles)
    ? body.subtitles
        .map((entry) => ({
          lang: sanitizeString(entry.lang || '', 10),
          label: sanitizeString(entry.label || '', 80),
          url: validateUrl(entry.url || ''),
        }))
        .filter((entry) => entry.lang && entry.label && entry.url)
    : [];
  return {
    seriesName,
    slug,
    season,
    ep,
    title,
    synopsis,
    streamUrl,
    subtitles,
    poster: sanitizeString(body.poster || '', 200),
    published: body.published !== false,
  };
}

async function ensureSeriesMeta(slug, metaUpdates) {
  const existing = (await loadSeries(slug)) || {
    slug,
    title: metaUpdates.seriesName || metaUpdates.title || slug.replace(/-/g, ' '),
    synopsis: sanitizeString(metaUpdates.synopsis || ''),
    genres: Array.isArray(metaUpdates.genres) ? metaUpdates.genres : [],
    tags: Array.isArray(metaUpdates.tags) ? metaUpdates.tags : [],
    poster: sanitizeString(metaUpdates.poster || ''),
    hero: Boolean(metaUpdates.hero),
    published: metaUpdates.published !== false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    seasons: [],
  };
  if (metaUpdates.title) existing.title = sanitizeString(metaUpdates.title, 180);
  if (metaUpdates.synopsis) existing.synopsis = sanitizeString(metaUpdates.synopsis, 800);
  if (Array.isArray(metaUpdates.genres)) existing.genres = metaUpdates.genres.map((g) => sanitizeString(g, 60));
  if (Array.isArray(metaUpdates.tags)) existing.tags = metaUpdates.tags.map((g) => sanitizeString(g, 60));
  if (metaUpdates.poster) existing.poster = sanitizeString(metaUpdates.poster, 200);
  if (typeof metaUpdates.hero === 'boolean') existing.hero = metaUpdates.hero;
  if (typeof metaUpdates.published === 'boolean') existing.published = metaUpdates.published;
  if (Array.isArray(metaUpdates.categories)) existing.categories = metaUpdates.categories.map((c) => sanitizeString(c, 40));
  if (metaUpdates.seriesName) existing.seriesName = sanitizeString(metaUpdates.seriesName, 200);
  return existing;
}

addRoute('GET', '/api/auth/session', async (req, res, { session }) => {
  if (!session) {
    sendJson(res, 200, { authenticated: false });
    return;
  }
  const users = await getUsers();
  const user = users.find((u) => u.username === session.username);
  if (!user || user.disabled) {
    sendJson(res, 200, { authenticated: false });
    return;
  }
  sendJson(res, 200, {
    authenticated: true,
    user: { username: user.username, role: user.role },
    csrfToken: session.csrfToken,
  });
});

addRoute('POST', '/api/auth/login', async (req, res, { session }) => {
  if (session) {
    sendJson(res, 200, { ok: true, message: 'Already authenticated' });
    return;
  }
  const body = await parseJsonBody(req);
  const username = sanitizeString(body.username || '', 60);
  const password = body.password || '';
  const users = await getUsers();
  const user = users.find((entry) => entry.username === username);
  await new Promise((resolve) => setTimeout(resolve, 120)); // brute-force mitigation
  if (!user || user.disabled || !verifyPassword(password, user.passHash)) {
    sendJson(res, 401, { ok: false, error: 'Identifiants invalides' });
    return;
  }
  const { sid, csrfToken, expires } = createSession(user.username, user.role);
  await appendAudit('login', user.username, 'User logged in');
  sendJson(res, 200, {
    ok: true,
    user: { username: user.username, role: user.role },
    csrfToken,
    expires,
  }, {
    'Set-Cookie': `sid=${encodeURIComponent(sid)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`,
  });
});

addRoute('POST', '/api/auth/logout', async (req, res, { session }) => {
  if (session) {
    requireCsrf(req, session);
    destroySession(session.sid);
    await appendAudit('logout', session.username, 'User logged out');
  }
  sendJson(res, 200, {
    ok: true,
  }, {
    'Set-Cookie': 'sid=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0',
  });
});

addRoute('GET', '/api/catalog/overview', async (req, res, ctx) => {
  const snapshot = await refreshCatalogSnapshot(ctx.session);
  sendJson(res, 200, snapshot);
});

addRoute('GET', '/api/catalog/movies/:id', async (req, res, ctx) => {
  const movies = await loadMovies();
  const movie = movies.find((entry) => entry.id === ctx.params.id);
  if (!movie) {
    sendJson(res, 404, { error: 'Movie not found' });
    return;
  }
  const related = movies
    .filter((m) => m.id !== movie.id && m.published !== false)
    .slice(0, 12)
    .map((entry) => ({ id: entry.id, title: entry.title, poster: entry.poster }));
  sendJson(res, 200, { movie, related });
});

addRoute('GET', '/api/catalog/series/:slug', async (req, res, ctx) => {
  const series = await loadSeries(ctx.params.slug);
  if (!series) {
    sendJson(res, 404, { error: 'Series not found' });
    return;
  }
  sendJson(res, 200, series);
});

addRoute('GET', '/api/catalog/search', async (req, res) => {
  const { query } = url.parse(req.url, true);
  const q = sanitizeString(query.q || '', 120).toLowerCase();
  if (!q) {
    sendJson(res, 200, { movies: [], series: [] });
    return;
  }
  const [movies, allSeries] = await Promise.all([loadMovies(), listSeries()]);
  const filteredMovies = filterPublished(movies).filter((movie) =>
    movie.title.toLowerCase().includes(q) ||
    (movie.tags || []).some((tag) => tag.toLowerCase().includes(q)) ||
    (movie.genres || []).some((genre) => genre.toLowerCase().includes(q))
  );
  const filteredSeries = filterPublished(allSeries).filter((serie) =>
    serie.title.toLowerCase().includes(q) ||
    (serie.tags || []).some((tag) => tag.toLowerCase().includes(q)) ||
    (serie.genres || []).some((genre) => genre.toLowerCase().includes(q))
  );
  sendJson(res, 200, {
    movies: filteredMovies.map((movie) => ({ id: movie.id, title: movie.title, poster: movie.poster })),
    series: filteredSeries.map((serie) => ({ slug: serie.slug, title: serie.title, poster: serie.poster })),
  });
});

addRoute('POST', '/api/users/me/progress', async (req, res, ctx) => {
  const session = ctx.session;
  ensureRole(session, ['admin', 'user']);
  requireCsrf(req, session);
  const body = await parseJsonBody(req);
  const entry = {
    type: body.type === 'series' ? 'series' : 'movie',
    id: sanitizeString(body.id || '', 120),
    slug: sanitizeString(body.slug || '', 120),
    season: Number(body.season) || null,
    ep: Number(body.ep) || null,
    position: Math.max(0, Number(body.position) || 0),
    updatedAt: new Date().toISOString(),
  };
  if (entry.type === 'movie' && !entry.id) {
    sendJson(res, 400, { error: 'Movie id required' });
    return;
  }
  if (entry.type === 'series' && (!entry.slug || !entry.season || !entry.ep)) {
    sendJson(res, 400, { error: 'Series progress requires slug, season and ep' });
    return;
  }
  const history = await getHistory(session.username);
  const existing = history.continueWatching.find((item) => {
    if (entry.type === 'movie') return item.type === 'movie' && item.id === entry.id;
    return item.type === 'series' && item.slug === entry.slug && item.season === entry.season && item.ep === entry.ep;
  });
  if (existing) {
    Object.assign(existing, entry);
  } else {
    history.continueWatching.unshift(entry);
  }
  history.continueWatching = history.continueWatching.slice(0, 50);
  await saveHistory(session.username, history);
  await appendAudit('progress', session.username, `${entry.type}:${entry.type === 'movie' ? entry.id : entry.slug}`);
  sendJson(res, 200, { ok: true });
});

addRoute('GET', '/api/users/me/history', async (req, res, ctx) => {
  const session = ctx.session;
  ensureRole(session, ['admin', 'user']);
  const history = await getHistory(session.username);
  sendJson(res, 200, history);
});

addRoute('GET', '/api/admin/users', async (req, res, ctx) => {
  const session = ctx.session;
  ensureRole(session, ['admin']);
  const users = await getUsers();
  sendJson(res, 200, users.map(({ passHash, ...rest }) => rest));
});

addRoute('POST', '/api/admin/users', async (req, res, ctx) => {
  const session = ctx.session;
  ensureRole(session, ['admin']);
  requireCsrf(req, session);
  const body = await parseJsonBody(req);
  const username = sanitizeString(body.username || '', 60).toLowerCase();
  const password = body.password || '';
  const role = body.role === 'admin' ? 'admin' : 'user';
  if (!username || !password) {
    sendJson(res, 400, { error: 'username and password are required' });
    return;
  }
  const users = await getUsers();
  if (users.some((user) => user.username === username)) {
    sendJson(res, 400, { error: 'User already exists' });
    return;
  }
  const newUser = {
    username,
    role,
    passHash: hashPassword(password),
    disabled: Boolean(body.disabled),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  users.push(newUser);
  await saveUsers(users);
  await appendAudit('user.create', session.username, username);
  sendJson(res, 201, { ok: true, user: { username, role, disabled: newUser.disabled } });
});

addRoute('PUT', '/api/admin/users/:username', async (req, res, ctx) => {
  const session = ctx.session;
  ensureRole(session, ['admin']);
  requireCsrf(req, session);
  const body = await parseJsonBody(req);
  const username = ctx.params.username;
  const users = await getUsers();
  const user = users.find((entry) => entry.username === username);
  if (!user) {
    sendJson(res, 404, { error: 'User not found' });
    return;
  }
  if (body.role && ['admin', 'user'].includes(body.role)) {
    user.role = body.role;
  }
  if (typeof body.disabled === 'boolean') {
    user.disabled = body.disabled;
  }
  user.updatedAt = new Date().toISOString();
  await saveUsers(users);
  await appendAudit('user.update', session.username, username);
  sendJson(res, 200, { ok: true });
});

addRoute('POST', '/api/admin/users/:username/reset-password', async (req, res, ctx) => {
  const session = ctx.session;
  ensureRole(session, ['admin']);
  requireCsrf(req, session);
  const body = await parseJsonBody(req);
  const password = body.password || '';
  if (!password) {
    sendJson(res, 400, { error: 'Password required' });
    return;
  }
  const users = await getUsers();
  const user = users.find((entry) => entry.username === ctx.params.username);
  if (!user) {
    sendJson(res, 404, { error: 'User not found' });
    return;
  }
  user.passHash = hashPassword(password);
  user.updatedAt = new Date().toISOString();
  await saveUsers(users);
  await appendAudit('user.reset-password', session.username, ctx.params.username);
  sendJson(res, 200, { ok: true });
});

addRoute('POST', '/api/admin/users/:username/toggle', async (req, res, ctx) => {
  const session = ctx.session;
  ensureRole(session, ['admin']);
  requireCsrf(req, session);
  const users = await getUsers();
  const user = users.find((entry) => entry.username === ctx.params.username);
  if (!user) {
    sendJson(res, 404, { error: 'User not found' });
    return;
  }
  user.disabled = !user.disabled;
  user.updatedAt = new Date().toISOString();
  await saveUsers(users);
  await appendAudit('user.toggle', session.username, `${ctx.params.username}:${user.disabled ? 'disabled' : 'enabled'}`);
  sendJson(res, 200, { ok: true, disabled: user.disabled });
});

addRoute('GET', '/api/admin/catalog/movies', async (req, res, ctx) => {
  ensureRole(ctx.session, ['admin']);
  const movies = await loadMovies();
  sendJson(res, 200, movies);
});

addRoute('POST', '/api/admin/catalog/movies', async (req, res, ctx) => {
  const session = ctx.session;
  ensureRole(session, ['admin']);
  requireCsrf(req, session);
  const payload = await parseJsonBody(req);
  const newMovie = await validateMoviePayload(payload);
  const movies = await loadMovies();
  if (movies.some((movie) => movie.id === newMovie.id)) {
    sendJson(res, 400, { error: 'Movie already exists' });
    return;
  }
  movies.push(newMovie);
  await saveMovies(movies);
  await appendAudit('movie.create', session.username, newMovie.id);
  sendJson(res, 201, { ok: true, movie: newMovie });
});

addRoute('PUT', '/api/admin/catalog/movies/:id', async (req, res, ctx) => {
  const session = ctx.session;
  ensureRole(session, ['admin']);
  requireCsrf(req, session);
  const payload = await parseJsonBody(req);
  const movies = await loadMovies();
  const existing = movies.find((movie) => movie.id === ctx.params.id);
  if (!existing) {
    sendJson(res, 404, { error: 'Movie not found' });
    return;
  }
  const validated = await validateMoviePayload({ ...existing, ...payload }, existing.id);
  Object.assign(existing, validated, { createdAt: existing.createdAt });
  await saveMovies(movies);
  await appendAudit('movie.update', session.username, existing.id);
  sendJson(res, 200, { ok: true, movie: existing });
});

addRoute('DELETE', '/api/admin/catalog/movies/:id', async (req, res, ctx) => {
  const session = ctx.session;
  ensureRole(session, ['admin']);
  requireCsrf(req, session);
  const movies = await loadMovies();
  const existing = movies.find((movie) => movie.id === ctx.params.id);
  if (!existing) {
    sendJson(res, 404, { error: 'Movie not found' });
    return;
  }
  existing.deleted = true;
  existing.published = false;
  existing.updatedAt = new Date().toISOString();
  await saveMovies(movies);
  await appendAudit('movie.delete', session.username, existing.id);
  sendJson(res, 200, { ok: true });
});

addRoute('GET', '/api/admin/catalog/series', async (req, res, ctx) => {
  ensureRole(ctx.session, ['admin']);
  const series = await listSeries();
  sendJson(res, 200, series);
});

addRoute('POST', '/api/admin/catalog/series/meta', async (req, res, ctx) => {
  const session = ctx.session;
  ensureRole(session, ['admin']);
  requireCsrf(req, session);
  const payload = await parseJsonBody(req);
  const title = sanitizeString(payload.title || payload.seriesName || '', 200);
  const slug = slugifySeriesName(payload.slug || payload.seriesName || payload.title);
  if (!slug) {
    sendJson(res, 400, { error: 'slug or title required' });
    return;
  }
  const existing = await ensureSeriesMeta(slug, { ...payload, title });
  await saveSeries(slug, existing);
  await appendAudit('series.meta', session.username, slug);
  sendJson(res, 200, { ok: true, series: existing });
});

addRoute('POST', '/api/admin/catalog/series/episode', async (req, res, ctx) => {
  const session = ctx.session;
  ensureRole(session, ['admin']);
  requireCsrf(req, session);
  const payload = await parseJsonBody(req);
  const validated = validateEpisodePayload(payload);
  const meta = await ensureSeriesMeta(validated.slug, payload);
  const merged = mergeEpisodeIntoSeries(meta, {
    season: validated.season,
    ep: validated.ep,
    title: validated.title,
    synopsis: validated.synopsis,
    streamUrl: validated.streamUrl,
    subtitles: validated.subtitles,
    poster: validated.poster,
    published: validated.published,
  });
  await saveSeries(validated.slug, merged);
  await appendAudit('series.episode', session.username, `${validated.slug}:s${validated.season}e${validated.ep}`);
  sendJson(res, 200, { ok: true, series: merged });
});

addRoute('DELETE', '/api/admin/catalog/series/:slug/seasons/:season/episodes/:ep', async (req, res, ctx) => {
  const session = ctx.session;
  ensureRole(session, ['admin']);
  requireCsrf(req, session);
  const slug = ctx.params.slug;
  const seasonNo = Number(ctx.params.season);
  const epNo = Number(ctx.params.ep);
  const series = await loadSeries(slug);
  if (!series) {
    sendJson(res, 404, { error: 'Series not found' });
    return;
  }
  const season = series.seasons?.find((s) => s.seasonNumber === seasonNo);
  if (!season) {
    sendJson(res, 404, { error: 'Season not found' });
    return;
  }
  const index = season.episodes.findIndex((episode) => episode.ep === epNo);
  if (index === -1) {
    sendJson(res, 404, { error: 'Episode not found' });
    return;
  }
  season.episodes.splice(index, 1);
  if (!season.episodes.length) {
    series.seasons = series.seasons.filter((s) => s !== season);
  }
  series.updatedAt = new Date().toISOString();
  await saveSeries(slug, series);
  await appendAudit('series.episode.delete', session.username, `${slug}:s${seasonNo}e${epNo}`);
  sendJson(res, 200, { ok: true });
});

addRoute('DELETE', '/api/admin/catalog/series/:slug', async (req, res, ctx) => {
  const session = ctx.session;
  ensureRole(session, ['admin']);
  requireCsrf(req, session);
  const slug = ctx.params.slug;
  const series = await loadSeries(slug);
  if (!series) {
    sendJson(res, 404, { error: 'Series not found' });
    return;
  }
  series.published = false;
  series.deleted = true;
  series.updatedAt = new Date().toISOString();
  await saveSeries(slug, series);
  await appendAudit('series.delete', session.username, slug);
  sendJson(res, 200, { ok: true });
});

addRoute('POST', '/api/admin/catalog/categories', async (req, res, ctx) => {
  const session = ctx.session;
  ensureRole(session, ['admin']);
  requireCsrf(req, session);
  const body = await parseJsonBody(req);
  if (!Array.isArray(body)) {
    sendJson(res, 400, { error: 'Categories payload must be an array' });
    return;
  }
  const categories = body.map((entry, index) => ({
    id: sanitizeString(entry.id || '', 60) || `category-${index}`,
    title: sanitizeString(entry.title || '', 120) || `Catégorie ${index + 1}`,
    order: Number(entry.order) || index + 1,
    type: ['manual', 'dynamic'].includes(entry.type) ? entry.type : 'manual',
    description: sanitizeString(entry.description || '', 200),
  }));
  await saveCategories(categories);
  await appendAudit('categories.update', session.username, String(categories.length));
  sendJson(res, 200, { ok: true, categories });
});

addRoute('GET', '/api/admin/audit', async (req, res, ctx) => {
  ensureRole(ctx.session, ['admin']);
  const auditFile = path.join(DATA_DIR, 'audit.log');
  const content = fssync.existsSync(auditFile)
    ? await fs.readFile(auditFile, 'utf-8')
    : '';
  sendText(res, 200, content);
});

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon'
};

function guessMime(filePath) {
  const ext = filePath ? filePath.slice(filePath.lastIndexOf('.')) : '';
  return MIME_TYPES[ext] || 'application/octet-stream';
}

async function serveStatic(req, res, pathname) {
  let filePath = path.join(FRONTEND_DIR, pathname);
  if (!filePath.startsWith(FRONTEND_DIR)) {
    sendText(res, 403, 'Forbidden');
    return;
  }
  if (fssync.existsSync(filePath) && fssync.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, 'index.html');
  }
  if (!fssync.existsSync(filePath)) {
    filePath = path.join(FRONTEND_DIR, 'index.html');
  }
  try {
    const mime = guessMime(filePath);
    res.setHeader('Content-Type', mime);
    res.writeHead(200);
    if (req.method === 'HEAD') {
      res.end();
      return;
    }
    const stream = fssync.createReadStream(filePath);
    stream.on('error', (err) => {
      log('Static error', err);
      if (!res.headersSent) {
        sendText(res, 500, 'Internal Server Error');
      } else {
        res.end();
      }
    });
    stream.pipe(res);
  } catch (err) {
    log('Static serve failure', err);
    sendText(res, 500, 'Internal Server Error');
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const parsedUrl = url.parse(req.url, true);
    const pathname = parsedUrl.pathname || '/';
    const method = req.method.toUpperCase();
    const session = getSession(req);
    const match = matchRoute(method, pathname);
    if (method === 'OPTIONS' && pathname.startsWith('/api/')) {
      res.writeHead(204, { 'Access-Control-Allow-Origin': req.headers.origin || '*', 'Access-Control-Allow-Headers': 'Content-Type, X-CSRF-Token', 'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS', 'Access-Control-Allow-Credentials': 'true' });
      res.end();
      return;
    }
    if (match) {
      await match.handler(req, res, { params: match.params, session });
      return;
    }
    if (pathname.startsWith('/api/')) {
      sendJson(res, 404, { error: 'Not found' });
      return;
    }
    if (method === 'GET' || method === 'HEAD') {
      await serveStatic(req, res, pathname === '/' ? '/index.html' : pathname);
      return;
    }
    sendJson(res, 405, { error: 'Method not allowed' });
  } catch (err) {
    const statusCode = err.statusCode || 500;
    log('Error handling request', req.method, req.url, statusCode, err.message);
    if (!res.headersSent) {
      sendJson(res, statusCode, { error: err.message || 'Internal Server Error' });
    } else {
      res.end();
    }
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  log(`Server listening on http://localhost:${PORT}`);
});
