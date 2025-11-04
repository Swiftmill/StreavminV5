const { useState, useEffect, useMemo, useCallback, useContext, useRef } = React;

function parseRoute() {
  const path = window.location.pathname || '/';
  if (path === '/' || path === '/app') return { name: 'home' };
  if (path === '/login') return { name: 'login' };
  if (path === '/admin') return { name: 'admin' };
  if (path.startsWith('/title/movies/')) {
    return { name: 'movie', id: decodeURIComponent(path.replace('/title/movies/', '')) };
  }
  if (path.startsWith('/title/series/')) {
    return { name: 'series', slug: decodeURIComponent(path.replace('/title/series/', '')) };
  }
  return { name: 'home' };
}

const SessionContext = React.createContext(null);

function useSession() {
  return useContext(SessionContext);
}

function useToastManager() {
  const [toast, setToast] = useState(null);
  const showToast = useCallback((message, type = 'success') => {
    setToast({ message, type, id: Date.now() });
    setTimeout(() => setToast(null), 3500);
  }, []);
  return { toast, showToast };
}

function LoadingScreen() {
  return React.createElement(
    'div',
    { style: { minHeight: '100vh', display: 'grid', placeItems: 'center', color: '#fff' } },
    React.createElement('div', { className: 'spinner' }, 'Chargement…')
  );
}

function Navbar({ onLogout }) {
  const { session, navigate } = useSession();
  return (
    React.createElement('nav', { className: 'navbar' },
      React.createElement('div', { className: 'navbar-brand', onClick: () => navigate('/app') },
        React.createElement('span', { style: { fontSize: '1.2rem', letterSpacing: '0.4rem' } }, 'STREAVMIN')
      ),
      session.user && React.createElement('div', { className: 'nav-actions' },
        session.user.role === 'admin' && React.createElement('button', { className: 'secondary-btn', onClick: () => navigate('/admin') }, 'Admin'),
        React.createElement('span', { style: { opacity: 0.75, fontSize: '0.9rem' } }, session.user.username),
        React.createElement('button', { className: 'secondary-btn', onClick: onLogout }, 'Déconnexion')
      )
    )
  );
}

function Hero({ hero, onPlay }) {
  if (!hero) return null;
  const item = hero.data;
  const description = item.synopsis || 'Découvrez votre prochaine obsession.';
  const { navigate } = useSession();
  return (
    React.createElement('section', { className: 'hero' },
      React.createElement('div', { className: 'hero-content' },
        React.createElement('div', { className: 'hero-meta' }, hero.type === 'movie' ? 'Film' : 'Série', item.year ? `• ${item.year}` : null),
        React.createElement('h1', { className: 'hero-title' }, item.title),
        React.createElement('p', { style: { fontSize: '1.05rem', lineHeight: 1.5, opacity: 0.85 } }, description),
        React.createElement('div', { className: 'hero-actions' },
          React.createElement('button', {
            className: 'primary-btn',
            onClick: () => onPlay(hero.type, item)
          }, 'Lecture'),
          React.createElement('button', {
            className: 'secondary-btn',
            onClick: () => {
              if (hero.type === 'movie') {
                navigate(`/title/movies/${encodeURIComponent(item.id)}`);
              } else {
                navigate(`/title/series/${encodeURIComponent(item.slug)}`);
              }
            }
          }, 'Détails')
        )
      ),
      item.poster && React.createElement('div', { className: 'hero-poster' },
        React.createElement('img', { src: item.poster, alt: item.title })
      )
    )
  );
}

function Carousel({ title, items }) {
  const { navigate } = useSession();
  if (!items || !items.length) return null;
  return (
    React.createElement(React.Fragment, null,
      React.createElement('h2', { className: 'section-title' }, title),
      React.createElement('div', { className: 'carousel' },
        items.map((item) => (
          React.createElement('div', {
            key: `${title}-${item.id}`,
            className: 'card',
            onClick: () => {
              const target = item.type === 'series' ? `/title/series/${encodeURIComponent(item.id)}` : `/title/movies/${encodeURIComponent(item.id)}`;
              navigate(target);
            }
          },
            item.poster && React.createElement('img', { src: item.poster, alt: item.title }),
            React.createElement('div', { className: 'card-title' }, item.title)
          )
        ))
      )
    )
  );
}

function SearchBar({ onSearch }) {
  const [query, setQuery] = useState('');
  const handleSubmit = (event) => {
    event.preventDefault();
    onSearch(query);
  };
  return (
    React.createElement('form', { className: 'search-bar', onSubmit: handleSubmit },
      React.createElement('svg', { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2 },
        React.createElement('circle', { cx: 11, cy: 11, r: 7 }),
        React.createElement('line', { x1: 16.65, y1: 16.65, x2: 21, y2: 21 })
      ),
      React.createElement('input', {
        placeholder: 'Rechercher un titre, un genre, un tag…',
        value: query,
        onChange: (event) => setQuery(event.target.value)
      }),
      React.createElement('button', { className: 'secondary-btn', type: 'submit' }, 'Rechercher')
    )
  );
}

function ContinueWatchingRow({ items, onSelect }) {
  if (!items?.length) return null;
  return (
    React.createElement(React.Fragment, null,
      React.createElement('h2', { className: 'section-title' }, 'Continuer la lecture'),
      React.createElement('div', { className: 'carousel' },
        items.map((item) => (
          React.createElement('div', {
            key: `${item.type}-${item.type === 'movie' ? item.id : `${item.slug}-${item.season}-${item.ep}`}`,
            className: 'card',
            onClick: () => onSelect(item)
          },
            React.createElement('div', { className: 'card-title' },
              item.type === 'movie'
                ? `Film • ${item.id}`
                : `S${item.season}E${item.ep} • ${item.slug}`
            )
          )
        ))
      )
    )
  );
}

function useOverview(apiFetch) {
  const [state, setState] = useState({ loading: true, data: null, error: null });
  const load = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true }));
    try {
      const payload = await apiFetch('/api/catalog/overview');
      setState({ loading: false, data: payload, error: null });
    } catch (err) {
      setState({ loading: false, data: null, error: err.message || 'Erreur' });
    }
  }, [apiFetch]);
  useEffect(() => {
    load();
  }, [load]);
  return { ...state, reload: load };
}

function HomePage({ apiFetch }) {
  const { data, loading, error, reload } = useOverview(apiFetch);
  const [searchResults, setSearchResults] = useState(null);
  const { navigate } = useSession();

  const handleSearch = async (query) => {
    if (!query.trim()) {
      setSearchResults(null);
      return;
    }
    try {
      const payload = await apiFetch(`/api/catalog/search?q=${encodeURIComponent(query)}`);
      setSearchResults({ query, ...payload });
    } catch (err) {
      setSearchResults({ query, error: err.message });
    }
  };

  const handlePlay = (type, item) => {
    if (type === 'movie') {
      navigate(`/title/movies/${encodeURIComponent(item.id)}`);
    } else {
      navigate(`/title/series/${encodeURIComponent(item.slug)}`);
    }
  };

  if (loading) return LoadingScreen();
  if (error) {
    return (
      React.createElement('div', { style: { padding: '4rem', textAlign: 'center' } },
        React.createElement('p', null, error),
        React.createElement('button', { className: 'secondary-btn', onClick: reload }, 'Réessayer')
      )
    );
  }

  const rows = data?.rows || [];

  return (
    React.createElement('div', { className: 'app-shell' },
      React.createElement(Hero, { hero: data.hero, onPlay: handlePlay }),
      React.createElement(SearchBar, { onSearch: handleSearch }),
      searchResults && React.createElement('div', { className: 'search-results' },
        React.createElement('h3', null, `Résultats pour « ${searchResults.query} »`),
        searchResults.error && React.createElement('p', { className: 'alert' }, searchResults.error),
        !searchResults.error && React.createElement('div', { className: 'grid-layout' },
          searchResults.movies.map((movie) => (
            React.createElement('div', {
              key: `movie-${movie.id}`,
              className: 'card',
              onClick: () => navigate(`/title/movies/${encodeURIComponent(movie.id)}`)
            },
              movie.poster && React.createElement('img', { src: movie.poster, alt: movie.title }),
              React.createElement('div', { className: 'card-title' }, movie.title)
            )
          )),
          searchResults.series.map((serie) => (
            React.createElement('div', {
              key: `serie-${serie.slug}`,
              className: 'card',
              onClick: () => navigate(`/title/series/${encodeURIComponent(serie.slug)}`)
            },
              serie.poster && React.createElement('img', { src: serie.poster, alt: serie.title }),
              React.createElement('div', { className: 'card-title' }, serie.title)
            )
          ))
        )
      ),
      data.continueWatching && data.continueWatching.length > 0 && React.createElement(ContinueWatchingRow, {
        items: data.continueWatching,
        onSelect: (item) => {
          if (item.type === 'movie') {
            navigate(`/title/movies/${encodeURIComponent(item.id)}`);
          } else {
            navigate(`/title/series/${encodeURIComponent(item.slug)}`);
          }
        }
      }),
      rows.map((row) => React.createElement(Carousel, { key: row.id, title: row.title, items: row.items }))
    )
  );
}

function formatDuration(minutes) {
  if (!minutes) return '';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!h) return `${m} min`;
  return `${h}h${String(m).padStart(2, '0')}`;
}

function VideoPlayer({ source, subtitles, title, meta, progressKey, onProgress, onEnded, nextLabel, onNext }) {
  const videoRef = useRef(null);
  const { session, apiFetch, showToast } = useSession();
  const lastSent = useRef(0);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const handler = () => {
      try {
        const stored = localStorage.getItem(`streavmin-progress:${progressKey}`);
        if (stored) {
          const seconds = Number(stored);
          if (!Number.isNaN(seconds) && seconds > 10) {
            video.currentTime = seconds;
          }
        }
      } catch (_) {}
    };
    video.addEventListener('loadedmetadata', handler, { once: true });
    return () => video.removeEventListener('loadedmetadata', handler);
  }, [progressKey]);

  const pushProgress = useCallback(async (current) => {
    try {
      if (!session.user) {
        localStorage.setItem(`streavmin-progress:${progressKey}`, String(current));
        return;
      }
      await apiFetch('/api/users/me/progress', {
        method: 'POST',
        body: {
          type: meta.type,
          id: meta.id,
          slug: meta.slug,
          season: meta.season,
          ep: meta.ep,
          position: Math.floor(current)
        }
      });
    } catch (err) {
      showToast(err.message || 'Impossible de sauvegarder la progression', 'error');
    }
  }, [apiFetch, meta, progressKey, session.user, showToast]);

  const handleTimeUpdate = useCallback((event) => {
    const current = event.target.currentTime;
    if (Date.now() - lastSent.current < 4000) return;
    lastSent.current = Date.now();
    localStorage.setItem(`streavmin-progress:${progressKey}`, String(current));
    pushProgress(current);
    onProgress?.(current);
  }, [onProgress, progressKey, pushProgress]);

  const handleEnded = useCallback(() => {
    localStorage.removeItem(`streavmin-progress:${progressKey}`);
    pushProgress(0);
    onEnded?.();
  }, [onEnded, progressKey, pushProgress]);

  return (
    React.createElement('div', { className: 'player-wrapper' },
      React.createElement('video', {
        ref: videoRef,
        controls: true,
        controlsList: 'nodownload',
        playsInline: true,
        poster: meta.poster || undefined,
        onTimeUpdate: handleTimeUpdate,
        onEnded: handleEnded
      },
        React.createElement('source', { src: source, type: source.endsWith('.m3u8') ? 'application/x-mpegURL' : 'video/mp4' }),
        subtitles?.map((track) => React.createElement('track', {
          key: `${track.lang}-${track.url}`,
          kind: 'subtitles',
          src: track.url,
          srcLang: track.lang,
          label: track.label,
          default: track.default
        }))
      ),
      onNext && React.createElement('div', { style: { padding: '1rem', display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' } },
        React.createElement('button', { className: 'secondary-btn', onClick: onNext }, nextLabel || 'Épisode suivant')
      )
    )
  );
}

function MoviePage({ id }) {
  const { apiFetch, navigate } = useSession();
  const [state, setState] = useState({ loading: true, movie: null, related: [], error: null });

  useEffect(() => {
    let active = true;
    setState({ loading: true, movie: null, related: [], error: null });
    apiFetch(`/api/catalog/movies/${encodeURIComponent(id)}`)
      .then((payload) => {
        if (!active) return;
        setState({ loading: false, movie: payload.movie, related: payload.related || [], error: null });
      })
      .catch((err) => {
        if (!active) return;
        setState({ loading: false, movie: null, related: [], error: err.message || 'Erreur' });
      });
    return () => {
      active = false;
    };
  }, [apiFetch, id]);

  if (state.loading) return LoadingScreen();
  if (state.error || !state.movie) {
    return React.createElement('div', { style: { padding: '4rem' } }, state.error || 'Introuvable');
  }

  const movie = state.movie;
  const meta = {
    type: 'movie',
    id: movie.id,
    poster: movie.poster
  };

  return (
    React.createElement('div', { className: 'grid-layout' },
      React.createElement('div', { className: 'info-panel' },
        React.createElement('h2', null, movie.title),
        React.createElement('div', { className: 'info-meta' },
          movie.year && React.createElement('span', { className: 'badge' }, `Année ${movie.year}`),
          movie.duration && React.createElement('span', { className: 'badge' }, formatDuration(movie.duration)),
          movie.genres?.map((genre) => React.createElement('span', { key: genre, className: 'badge' }, genre))
        ),
        React.createElement('p', { style: { opacity: 0.85, lineHeight: 1.6 } }, movie.synopsis),
        movie.tags?.length ? React.createElement('div', { className: 'tag-cloud' }, movie.tags.map((tag) => React.createElement('span', { key: tag, className: 'chip' }, tag))) : null
      ),
      React.createElement(VideoPlayer, {
        source: movie.streamUrl,
        subtitles: movie.subtitles,
        title: movie.title,
        meta,
        progressKey: `movie:${movie.id}`,
        onProgress: () => {},
        onEnded: () => {}
      }),
      state.related?.length ? React.createElement('div', { style: { gridColumn: '1 / -1' } },
        React.createElement('h3', null, 'Vous aimerez aussi'),
        React.createElement('div', { className: 'carousel' },
          state.related.map((item) => React.createElement('div', {
            key: item.id,
            className: 'card',
            onClick: () => navigate(`/title/movies/${encodeURIComponent(item.id)}`)
          },
            item.poster && React.createElement('img', { src: item.poster, alt: item.title }),
            React.createElement('div', { className: 'card-title' }, item.title)
          ))
        )
      ) : null
    )
  );
}

function SeriesPage({ slug }) {
  const { apiFetch } = useSession();
  const [state, setState] = useState({ loading: true, series: null, error: null });
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    let active = true;
    setState({ loading: true, series: null, error: null });
    apiFetch(`/api/catalog/series/${encodeURIComponent(slug)}`)
      .then((payload) => {
        if (!active) return;
        setState({ loading: false, series: payload, error: null });
        const firstSeason = payload.seasons?.[0];
        const firstEpisode = firstSeason?.episodes?.[0];
        if (firstEpisode) {
          setSelected({ season: firstEpisode.season, ep: firstEpisode.ep });
        }
      })
      .catch((err) => {
        if (!active) return;
        setState({ loading: false, series: null, error: err.message || 'Erreur' });
      });
    return () => { active = false; };
  }, [apiFetch, slug]);

  if (state.loading) return LoadingScreen();
  if (state.error || !state.series) {
    return React.createElement('div', { style: { padding: '4rem' } }, state.error || 'Introuvable');
  }

  const series = state.series;
  const currentSeason = series.seasons?.find((s) => s.seasonNumber === selected?.season);
  const currentEpisode = currentSeason?.episodes?.find((ep) => ep.ep === selected?.ep);
  const nextEpisode = (() => {
    if (!currentSeason || !currentEpisode) return null;
    const idx = currentSeason.episodes.findIndex((ep) => ep.ep === currentEpisode.ep);
    if (idx < currentSeason.episodes.length - 1) {
      return { season: currentSeason.seasonNumber, ep: currentSeason.episodes[idx + 1].ep };
    }
    const seasonIdx = series.seasons.findIndex((s) => s.seasonNumber === currentSeason.seasonNumber);
    if (seasonIdx < series.seasons.length - 1) {
      const targetSeason = series.seasons[seasonIdx + 1];
      const ep = targetSeason.episodes?.[0];
      if (ep) return { season: targetSeason.seasonNumber, ep: ep.ep };
    }
    return null;
  })();

  const meta = currentEpisode ? {
    type: 'series',
    id: `${series.slug}-s${currentEpisode.season}e${currentEpisode.ep}`,
    slug: series.slug,
    season: currentEpisode.season,
    ep: currentEpisode.ep,
    poster: currentEpisode.poster || series.poster
  } : null;

  return (
    React.createElement('div', { className: 'grid-layout' },
      React.createElement('div', { className: 'info-panel' },
        React.createElement('h2', null, series.title),
        React.createElement('p', { style: { opacity: 0.85, lineHeight: 1.6 } }, series.synopsis),
        series.genres?.length ? React.createElement('div', { className: 'tag-cloud' }, series.genres.map((genre) => React.createElement('span', { key: genre, className: 'chip' }, genre))) : null,
        series.tags?.length ? React.createElement('div', { className: 'tag-cloud' }, series.tags.map((tag) => React.createElement('span', { key: tag, className: 'chip' }, tag))) : null
      ),
      currentEpisode && meta && React.createElement(VideoPlayer, {
        source: currentEpisode.streamUrl,
        subtitles: currentEpisode.subtitles,
        title: `${series.title} S${currentEpisode.season}E${currentEpisode.ep}`,
        meta,
        progressKey: `series:${series.slug}:s${currentEpisode.season}e${currentEpisode.ep}`,
        onNext: nextEpisode ? () => setSelected(nextEpisode) : null,
        nextLabel: nextEpisode ? `Épisode suivant S${nextEpisode.season}E${nextEpisode.ep}` : null
      }),
      series.seasons?.map((season) => (
        React.createElement('div', { key: season.seasonNumber, className: 'admin-section', style: { gridColumn: '1 / -1' } },
          React.createElement('h3', null, `Saison ${season.seasonNumber}`),
          React.createElement('div', { className: 'episode-list' },
            season.episodes.map((episode) => (
              React.createElement('div', {
                key: `s${episode.season}e${episode.ep}`,
                className: 'episode-card',
                onClick: () => setSelected({ season: episode.season, ep: episode.ep })
              },
                React.createElement('div', { className: 'episode-number' }, episode.ep),
                React.createElement('div', null,
                  React.createElement('strong', null, episode.title || `Épisode ${episode.ep}`),
                  React.createElement('p', { style: { opacity: 0.7, lineHeight: 1.5 } }, episode.synopsis || 'Résumé prochainement…')
                )
              )
            ))
          )
        )
      ))
    )
  );
}

function UsersAdmin({ users, onCreateUser, onToggleUser, onResetPassword, onUpdateRole }) {
  const [form, setForm] = useState({ username: '', password: '', role: 'user' });
  return (
    React.createElement('div', { className: 'admin-section' },
      React.createElement('h3', null, 'Gestion des utilisateurs'),
      React.createElement('form', {
        className: 'admin-form',
        onSubmit: (event) => {
          event.preventDefault();
          if (!form.username || !form.password) return;
          onCreateUser(form);
          setForm({ username: '', password: '', role: 'user' });
        }
      },
        React.createElement('input', {
          placeholder: "Nom d'utilisateur",
          value: form.username,
          onChange: (event) => setForm((prev) => ({ ...prev, username: event.target.value }))
        }),
        React.createElement('input', {
          placeholder: 'Mot de passe',
          type: 'password',
          value: form.password,
          onChange: (event) => setForm((prev) => ({ ...prev, password: event.target.value }))
        }),
        React.createElement('select', {
          value: form.role,
          onChange: (event) => setForm((prev) => ({ ...prev, role: event.target.value }))
        },
          React.createElement('option', { value: 'user' }, 'Utilisateur'),
          React.createElement('option', { value: 'admin' }, 'Administrateur')
        ),
        React.createElement('button', { className: 'primary-btn', type: 'submit' }, 'Créer')
      ),
      React.createElement('table', { className: 'table' },
        React.createElement('thead', null,
          React.createElement('tr', null,
            React.createElement('th', null, 'Utilisateur'),
            React.createElement('th', null, 'Rôle'),
            React.createElement('th', null, 'Statut'),
            React.createElement('th', null, 'Actions')
          )
        ),
        React.createElement('tbody', null,
          users.map((user) => (
            React.createElement('tr', { key: user.username },
              React.createElement('td', null, user.username),
              React.createElement('td', null,
                React.createElement('select', {
                  value: user.role,
                  onChange: (event) => onUpdateRole(user.username, event.target.value)
                },
                  React.createElement('option', { value: 'user' }, 'Utilisateur'),
                  React.createElement('option', { value: 'admin' }, 'Administrateur')
                )
              ),
              React.createElement('td', null,
                React.createElement('span', { className: `status-pill ${user.disabled ? 'inactive' : ''}` }, user.disabled ? 'Désactivé' : 'Actif')
              ),
              React.createElement('td', null,
                React.createElement('div', { className: 'flex-row' },
                  React.createElement('button', { className: 'secondary-btn', onClick: () => onToggleUser(user.username) }, user.disabled ? 'Réactiver' : 'Désactiver'),
                  React.createElement('button', {
                    className: 'secondary-btn',
                    onClick: () => {
                      const password = prompt(`Nouveau mot de passe pour ${user.username}`);
                      if (password) onResetPassword(user.username, password);
                    }
                  }, 'Réinitialiser')
                )
              )
            )
          ))
        )
      )
    )
  );
}

function MovieAdmin({ movies, onCreate, onUpdate, onDelete }) {
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({
    id: '',
    title: '',
    synopsis: '',
    year: '',
    duration: '',
    genres: '',
    tags: '',
    poster: '',
    streamUrl: '',
    trailerUrl: '',
    categories: '',
    hero: false,
    published: true
  });

  const startEdit = (movie) => {
    setEditing(movie.id);
    setForm({
      ...movie,
      genres: (movie.genres || []).join(', '),
      tags: (movie.tags || []).join(', '),
      categories: (movie.categories || []).join(', ')
    });
  };

  const resetForm = () => {
    setEditing(null);
    setForm({
      id: '',
      title: '',
      synopsis: '',
      year: '',
      duration: '',
      genres: '',
      tags: '',
      poster: '',
      streamUrl: '',
      trailerUrl: '',
      categories: '',
      hero: false,
      published: true
    });
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    const payload = {
      ...form,
      year: Number(form.year) || undefined,
      duration: Number(form.duration) || undefined,
      genres: form.genres.split(',').map((s) => s.trim()).filter(Boolean),
      tags: form.tags.split(',').map((s) => s.trim()).filter(Boolean),
      categories: form.categories.split(',').map((s) => s.trim()).filter(Boolean),
      published: Boolean(form.published)
    };
    if (editing) {
      onUpdate(editing, payload);
    } else {
      onCreate(payload);
    }
    resetForm();
  };

  return (
    React.createElement('div', { className: 'admin-section' },
      React.createElement('h3', null, 'Films'),
      React.createElement('form', { className: 'admin-form', onSubmit: handleSubmit },
        !editing && React.createElement('input', {
          placeholder: 'Identifiant (slug)',
          value: form.id,
          onChange: (event) => setForm((prev) => ({ ...prev, id: event.target.value }))
        }),
        React.createElement('input', {
          placeholder: 'Titre',
          value: form.title,
          onChange: (event) => setForm((prev) => ({ ...prev, title: event.target.value }))
        }),
        React.createElement('textarea', {
          placeholder: 'Synopsis',
          value: form.synopsis,
          onChange: (event) => setForm((prev) => ({ ...prev, synopsis: event.target.value }))
        }),
        React.createElement('div', { className: 'flex-row' },
          React.createElement('input', {
            placeholder: 'Année',
            value: form.year,
            onChange: (event) => setForm((prev) => ({ ...prev, year: event.target.value }))
          }),
          React.createElement('input', {
            placeholder: 'Durée (min)',
            value: form.duration,
            onChange: (event) => setForm((prev) => ({ ...prev, duration: event.target.value }))
          })
        ),
        React.createElement('input', {
          placeholder: 'Genres (séparés par des virgules)',
          value: form.genres,
          onChange: (event) => setForm((prev) => ({ ...prev, genres: event.target.value }))
        }),
        React.createElement('input', {
          placeholder: 'Tags (séparés par des virgules)',
          value: form.tags,
          onChange: (event) => setForm((prev) => ({ ...prev, tags: event.target.value }))
        }),
        React.createElement('input', {
          placeholder: 'Catégories (ids séparés par des virgules)',
          value: form.categories,
          onChange: (event) => setForm((prev) => ({ ...prev, categories: event.target.value }))
        }),
        React.createElement('input', {
          placeholder: 'URL du poster',
          value: form.poster,
          onChange: (event) => setForm((prev) => ({ ...prev, poster: event.target.value }))
        }),
        React.createElement('input', {
          placeholder: 'URL du flux vidéo',
          value: form.streamUrl,
          onChange: (event) => setForm((prev) => ({ ...prev, streamUrl: event.target.value }))
        }),
        React.createElement('input', {
          placeholder: 'URL du trailer',
          value: form.trailerUrl,
          onChange: (event) => setForm((prev) => ({ ...prev, trailerUrl: event.target.value }))
        }),
        React.createElement('label', { style: { display: 'flex', gap: '0.5rem', alignItems: 'center' } },
          React.createElement('input', {
            type: 'checkbox',
            checked: form.hero,
            onChange: (event) => setForm((prev) => ({ ...prev, hero: event.target.checked }))
          }),
          'Mettre en avant'
        ),
        React.createElement('label', { style: { display: 'flex', gap: '0.5rem', alignItems: 'center' } },
          React.createElement('input', {
            type: 'checkbox',
            checked: form.published,
            onChange: (event) => setForm((prev) => ({ ...prev, published: event.target.checked }))
          }),
          'Publié'
        ),
        React.createElement('div', { className: 'flex-row' },
          React.createElement('button', { className: 'primary-btn', type: 'submit' }, editing ? 'Mettre à jour' : 'Créer'),
          editing && React.createElement('button', { className: 'secondary-btn', type: 'button', onClick: resetForm }, 'Annuler')
        )
      ),
      React.createElement('div', { className: 'search-results' },
        movies.map((movie) => (
          React.createElement('div', {
            key: movie.id,
            className: 'card',
            onClick: () => startEdit(movie)
          },
            movie.poster && React.createElement('img', { src: movie.poster, alt: movie.title }),
            React.createElement('div', { className: 'card-title' }, movie.title),
            React.createElement('div', { style: { padding: '0 1rem 1rem' } },
              React.createElement('button', {
                className: 'secondary-btn',
                onClick: (event) => {
                  event.stopPropagation();
                  if (confirm(`Supprimer ${movie.title} ?`)) onDelete(movie.id);
                }
              }, 'Supprimer')
            )
          )
        ))
      )
    )
  );
}

function SeriesAdmin({ series, onUpsertEpisode, onDeleteEpisode }) {
  const [form, setForm] = useState({
    seriesName: '',
    slug: '',
    season: 1,
    ep: 1,
    title: '',
    synopsis: '',
    streamUrl: '',
    subtitles: '',
    poster: '',
    published: true
  });

  const handleSubmit = (event) => {
    event.preventDefault();
    const subtitles = form.subtitles.split('\n').map((line) => {
      const [lang, label, url] = line.split('|').map((p) => p.trim());
      if (!lang || !label || !url) return null;
      return { lang, label, url };
    }).filter(Boolean);
    onUpsertEpisode({
      ...form,
      season: Number(form.season),
      ep: Number(form.ep),
      subtitles
    });
  };

  return (
    React.createElement('div', { className: 'admin-section' },
      React.createElement('h3', null, 'Séries & épisodes'),
      React.createElement('form', { className: 'admin-form', onSubmit: handleSubmit },
        React.createElement('input', {
          placeholder: 'Nom de la série',
          value: form.seriesName,
          onChange: (event) => setForm((prev) => ({ ...prev, seriesName: event.target.value }))
        }),
        React.createElement('input', {
          placeholder: 'Slug (optionnel)',
          value: form.slug,
          onChange: (event) => setForm((prev) => ({ ...prev, slug: event.target.value }))
        }),
        React.createElement('div', { className: 'flex-row' },
          React.createElement('input', {
            type: 'number',
            min: 1,
            placeholder: 'Saison',
            value: form.season,
            onChange: (event) => setForm((prev) => ({ ...prev, season: event.target.value }))
          }),
          React.createElement('input', {
            type: 'number',
            min: 1,
            placeholder: 'Épisode',
            value: form.ep,
            onChange: (event) => setForm((prev) => ({ ...prev, ep: event.target.value }))
          })
        ),
        React.createElement('input', {
          placeholder: 'Titre de l\'épisode',
          value: form.title,
          onChange: (event) => setForm((prev) => ({ ...prev, title: event.target.value }))
        }),
        React.createElement('textarea', {
          placeholder: 'Synopsis',
          value: form.synopsis,
          onChange: (event) => setForm((prev) => ({ ...prev, synopsis: event.target.value }))
        }),
        React.createElement('input', {
          placeholder: 'URL du flux vidéo',
          value: form.streamUrl,
          onChange: (event) => setForm((prev) => ({ ...prev, streamUrl: event.target.value }))
        }),
        React.createElement('input', {
          placeholder: 'URL du poster (optionnel)',
          value: form.poster,
          onChange: (event) => setForm((prev) => ({ ...prev, poster: event.target.value }))
        }),
        React.createElement('textarea', {
          placeholder: 'Sous-titres (format: lang|label|url par ligne)',
          value: form.subtitles,
          onChange: (event) => setForm((prev) => ({ ...prev, subtitles: event.target.value }))
        }),
        React.createElement('label', { style: { display: 'flex', gap: '0.5rem', alignItems: 'center' } },
          React.createElement('input', {
            type: 'checkbox',
            checked: form.published,
            onChange: (event) => setForm((prev) => ({ ...prev, published: event.target.checked }))
          }),
          'Publié'
        ),
        React.createElement('button', { className: 'primary-btn', type: 'submit' }, 'Enregistrer l\'épisode')
      ),
      series.map((serie) => (
        React.createElement('div', { key: serie.slug, className: 'admin-section' },
          React.createElement('h3', null, serie.title),
          serie.seasons?.map((season) => (
            React.createElement('div', { key: season.seasonNumber, className: 'episode-list' },
              React.createElement('h4', null, `Saison ${season.seasonNumber}`),
              season.episodes.map((episode) => (
                React.createElement('div', { key: `s${episode.season}e${episode.ep}`, className: 'episode-card' },
                  React.createElement('div', { className: 'episode-number' }, episode.ep),
                  React.createElement('div', { style: { flex: 1 } },
                    React.createElement('strong', null, episode.title || `Épisode ${episode.ep}`),
                    React.createElement('p', { style: { opacity: 0.7 } }, episode.synopsis || 'Synopsis à venir')
                  ),
                  React.createElement('button', {
                    className: 'secondary-btn',
                    onClick: (event) => {
                      event.stopPropagation();
                      if (confirm('Supprimer cet épisode ?')) {
                        onDeleteEpisode(serie.slug, episode.season, episode.ep);
                      }
                    }
                  }, 'Supprimer')
                )
              ))
            )
          ))
        )
      ))
    )
  );
}

function CategoriesAdmin({ categories, onSave }) {
  const [local, setLocal] = useState(categories);
  useEffect(() => setLocal(categories), [categories]);
  return (
    React.createElement('div', { className: 'admin-section' },
      React.createElement('h3', null, 'Catégories'),
      local.map((category, index) => (
        React.createElement('div', { key: category.id || index, className: 'admin-form' },
          React.createElement('input', {
            placeholder: 'ID',
            value: category.id,
            onChange: (event) => setLocal((prev) => prev.map((c, idx) => idx === index ? { ...c, id: event.target.value } : c))
          }),
          React.createElement('input', {
            placeholder: 'Titre',
            value: category.title,
            onChange: (event) => setLocal((prev) => prev.map((c, idx) => idx === index ? { ...c, title: event.target.value } : c))
          }),
          React.createElement('textarea', {
            placeholder: 'Description',
            value: category.description || '',
            onChange: (event) => setLocal((prev) => prev.map((c, idx) => idx === index ? { ...c, description: event.target.value } : c))
          }),
          React.createElement('div', { className: 'flex-row' },
            React.createElement('input', {
              type: 'number',
              value: category.order,
              onChange: (event) => setLocal((prev) => prev.map((c, idx) => idx === index ? { ...c, order: Number(event.target.value) } : c))
            }),
            React.createElement('select', {
              value: category.type,
              onChange: (event) => setLocal((prev) => prev.map((c, idx) => idx === index ? { ...c, type: event.target.value } : c))
            },
              React.createElement('option', { value: 'manual' }, 'Manuel'),
              React.createElement('option', { value: 'dynamic' }, 'Automatique')
            )
          )
        )
      )),
      React.createElement('div', { className: 'flex-row' },
        React.createElement('button', { className: 'primary-btn', onClick: () => onSave(local) }, 'Sauvegarder'),
        React.createElement('button', {
          className: 'secondary-btn',
          onClick: () => setLocal((prev) => [...prev, { id: `cat-${prev.length + 1}`, title: 'Nouvelle catégorie', order: prev.length + 1, type: 'manual' }])
        }, 'Ajouter')
      )
    )
  );
}

function AuditLog({ log }) {
  return (
    React.createElement('div', { className: 'admin-section' },
      React.createElement('h3', null, 'Journal d\'audit'),
      React.createElement('pre', {
        style: {
          whiteSpace: 'pre-wrap',
          background: 'rgba(0,0,0,0.3)',
          padding: '1rem',
          borderRadius: '1rem',
          maxHeight: '280px',
          overflowY: 'auto'
        }
      }, log || 'Aucune activité récente')
    )
  );
}

function AdminPanel() {
  const { apiFetch, showToast } = useSession();
  const [data, setData] = useState({
    users: [],
    movies: [],
    series: [],
    categories: [],
    audit: ''
  });
  const [loading, setLoading] = useState(true);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [users, movies, series, categories, audit] = await Promise.all([
        apiFetch('/api/admin/users'),
        apiFetch('/api/admin/catalog/movies'),
        apiFetch('/api/admin/catalog/series'),
        apiFetch('/api/catalog/overview').then((payload) => payload.categories),
        apiFetch('/api/admin/audit')
      ]);
      setData({ users, movies, series, categories, audit });
    } catch (err) {
      showToast(err.message || 'Erreur de chargement', 'error');
    } finally {
      setLoading(false);
    }
  }, [apiFetch, showToast]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const handleCreateUser = async (payload) => {
    try {
      await apiFetch('/api/admin/users', { method: 'POST', body: payload });
      showToast('Utilisateur créé');
      loadAll();
    } catch (err) {
      showToast(err.message || 'Erreur', 'error');
    }
  };

  const handleToggleUser = async (username) => {
    try {
      await apiFetch(`/api/admin/users/${encodeURIComponent(username)}/toggle`, { method: 'POST' });
      showToast('Statut mis à jour');
      loadAll();
    } catch (err) {
      showToast(err.message || 'Erreur', 'error');
    }
  };

  const handleResetPassword = async (username, password) => {
    try {
      await apiFetch(`/api/admin/users/${encodeURIComponent(username)}/reset-password`, { method: 'POST', body: { password } });
      showToast('Mot de passe réinitialisé');
    } catch (err) {
      showToast(err.message || 'Erreur', 'error');
    }
  };

  const handleUpdateRole = async (username, role) => {
    try {
      await apiFetch(`/api/admin/users/${encodeURIComponent(username)}`, { method: 'PUT', body: { role } });
      showToast('Rôle mis à jour');
      loadAll();
    } catch (err) {
      showToast(err.message || 'Erreur', 'error');
    }
  };

  const handleCreateMovie = async (payload) => {
    try {
      await apiFetch('/api/admin/catalog/movies', { method: 'POST', body: payload });
      showToast('Film créé');
      loadAll();
    } catch (err) {
      showToast(err.message || 'Erreur', 'error');
    }
  };

  const handleUpdateMovie = async (id, payload) => {
    try {
      await apiFetch(`/api/admin/catalog/movies/${encodeURIComponent(id)}`, { method: 'PUT', body: payload });
      showToast('Film mis à jour');
      loadAll();
    } catch (err) {
      showToast(err.message || 'Erreur', 'error');
    }
  };

  const handleDeleteMovie = async (id) => {
    try {
      await apiFetch(`/api/admin/catalog/movies/${encodeURIComponent(id)}`, { method: 'DELETE' });
      showToast('Film supprimé');
      loadAll();
    } catch (err) {
      showToast(err.message || 'Erreur', 'error');
    }
  };

  const handleUpsertEpisode = async (payload) => {
    try {
      await apiFetch('/api/admin/catalog/series/episode', { method: 'POST', body: payload });
      showToast('Épisode enregistré');
      loadAll();
    } catch (err) {
      showToast(err.message || 'Erreur', 'error');
    }
  };

  const handleDeleteEpisode = async (slug, season, ep) => {
    try {
      await apiFetch(`/api/admin/catalog/series/${encodeURIComponent(slug)}/seasons/${season}/episodes/${ep}`, { method: 'DELETE' });
      showToast('Épisode supprimé');
      loadAll();
    } catch (err) {
      showToast(err.message || 'Erreur', 'error');
    }
  };

  const handleSaveCategories = async (categories) => {
    try {
      await apiFetch('/api/admin/catalog/categories', { method: 'POST', body: categories });
      showToast('Catégories sauvegardées');
      loadAll();
    } catch (err) {
      showToast(err.message || 'Erreur', 'error');
    }
  };

  if (loading) return LoadingScreen();

  return (
    React.createElement('div', { className: 'admin-layout' },
      React.createElement(UsersAdmin, {
        users: data.users,
        onCreateUser: handleCreateUser,
        onToggleUser: handleToggleUser,
        onResetPassword: handleResetPassword,
        onUpdateRole: handleUpdateRole
      }),
      React.createElement(MovieAdmin, {
        movies: data.movies,
        onCreate: handleCreateMovie,
        onUpdate: handleUpdateMovie,
        onDelete: handleDeleteMovie
      }),
      React.createElement(SeriesAdmin, {
        series: data.series,
        onUpsertEpisode: handleUpsertEpisode,
        onDeleteEpisode: handleDeleteEpisode
      }),
      React.createElement(CategoriesAdmin, {
        categories: data.categories,
        onSave: handleSaveCategories
      }),
      React.createElement(AuditLog, { log: data.audit })
    )
  );
}

function LoginPage({ onLogin, loading, error }) {
  const [form, setForm] = useState({ username: '', password: '' });
  return (
    React.createElement('div', { className: 'login-page' },
      React.createElement('div', { className: 'login-card' },
        React.createElement('h1', null, 'Connexion'),
        error && React.createElement('div', { className: 'alert' }, error),
        React.createElement('form', {
          onSubmit: (event) => {
            event.preventDefault();
            onLogin(form.username, form.password);
          }
        },
          React.createElement('input', {
            placeholder: "Nom d'utilisateur",
            value: form.username,
            onChange: (event) => setForm((prev) => ({ ...prev, username: event.target.value }))
          }),
          React.createElement('input', {
            placeholder: 'Mot de passe',
            type: 'password',
            value: form.password,
            onChange: (event) => setForm((prev) => ({ ...prev, password: event.target.value }))
          }),
          React.createElement('button', { type: 'submit', disabled: loading }, loading ? 'Connexion…' : 'Se connecter')
        )
      )
    )
  );
}

function App() {
  const [session, setSession] = useState({ loading: true, user: null, csrfToken: null });
  const [route, setRoute] = useState(parseRoute());
  const [authError, setAuthError] = useState(null);
  const { toast, showToast } = useToastManager();

  const refreshSession = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/session', { credentials: 'include' });
      const data = await res.json();
      if (data.authenticated) {
        setSession({ loading: false, user: data.user, csrfToken: data.csrfToken });
      } else {
        setSession({ loading: false, user: null, csrfToken: null });
      }
    } catch (err) {
      setSession({ loading: false, user: null, csrfToken: null });
    }
  }, []);

  useEffect(() => {
    refreshSession();
  }, [refreshSession]);

  useEffect(() => {
    const handler = () => setRoute(parseRoute());
    window.addEventListener('popstate', handler);
    return () => window.removeEventListener('popstate', handler);
  }, []);

  const navigate = useCallback((path) => {
    if (window.location.pathname === path) return;
    window.history.pushState({}, '', path);
    setRoute(parseRoute());
  }, []);

  useEffect(() => {
    if (session.loading) return;
    if (!session.user && route.name !== 'login') {
      navigate('/login');
    }
    if (session.user && route.name === 'login') {
      navigate('/app');
    }
  }, [session, route, navigate]);

  const apiFetch = useCallback(async (path, options = {}) => {
    const opts = { ...options };
    const skipCsrf = opts.skipCsrf;
    delete opts.skipCsrf;
    opts.credentials = 'include';
    opts.headers = opts.headers ? { ...opts.headers } : {};
    const method = (opts.method || 'GET').toUpperCase();
    if (opts.body && typeof opts.body !== 'string') {
      opts.body = JSON.stringify(opts.body);
    }
    if (method !== 'GET' && method !== 'HEAD' && !skipCsrf) {
      opts.headers['Content-Type'] = opts.headers['Content-Type'] || 'application/json';
      if (session.csrfToken) {
        opts.headers['X-CSRF-Token'] = session.csrfToken;
      }
    }
    const response = await fetch(path, opts);
    if (response.status === 401) {
      await refreshSession();
      throw new Error('Session expirée');
    }
    if (response.status === 204) return null;
    const contentType = response.headers.get('content-type') || '';
    const payload = contentType.includes('application/json') ? await response.json() : await response.text();
    if (!response.ok) {
      throw new Error(payload?.error || 'Erreur');
    }
    return payload;
  }, [refreshSession, session.csrfToken]);

  const handleLogin = async (username, password) => {
    setAuthError(null);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();
      if (!res.ok) {
        setAuthError(data.error || 'Connexion impossible');
        setSession({ loading: false, user: null, csrfToken: null });
        return;
      }
      setSession({ loading: false, user: data.user, csrfToken: data.csrfToken });
      navigate('/app');
      showToast(`Bienvenue ${data.user.username}!`);
    } catch (err) {
      setAuthError(err.message || 'Connexion impossible');
    }
  };

  const handleLogout = async () => {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' });
    } catch (_) {}
    setSession({ loading: false, user: null, csrfToken: null });
    navigate('/login');
  };

  const contextValue = useMemo(() => ({ session, setSession, apiFetch, navigate, showToast }), [session, apiFetch, navigate, showToast]);

  if (session.loading) {
    return LoadingScreen();
  }

  return (
    React.createElement(SessionContext.Provider, { value: contextValue },
      session.user && React.createElement(Navbar, { onLogout: handleLogout }),
      route.name === 'login'
        ? React.createElement(LoginPage, { onLogin: handleLogin, loading: false, error: authError })
        : route.name === 'home'
        ? React.createElement(HomePage, { apiFetch })
        : route.name === 'movie'
        ? React.createElement(MoviePage, { id: route.id })
        : route.name === 'series'
        ? React.createElement(SeriesPage, { slug: route.slug })
        : route.name === 'admin'
        ? React.createElement(AdminPanel, null)
        : React.createElement(HomePage, { apiFetch }),
      toast && React.createElement('div', { className: `toast ${toast.type}` }, toast.message)
    )
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(App));
