# Streavmin V5

Plateforme de streaming style Netflix propulsée par Node.js et React (sans base de données) avec stockage 100 % fichiers.

## Sommaire

- [Fonctionnalités](#fonctionnalités)
- [Architecture](#architecture)
- [Prérequis](#prérequis)
- [Installation et lancement](#installation-et-lancement)
  - [Avec Node.js](#avec-nodejs)
  - [Avec Docker](#avec-docker)
- [Scripts utilitaires](#scripts-utilitaires)
- [Comptes de démonstration](#comptes-de-démonstration)
- [API](#api)
- [Structure des fichiers](#structure-des-fichiers)
- [Sécurité et bonnes pratiques](#sécurité-et-bonnes-pratiques)

## Fonctionnalités

- Authentification par session et hashage `scrypt` stocké dans des fichiers JSON (admin/user).
- Page de connexion dédiée (`/login`) avec redirection automatique après authentification.
- Frontend React type Netflix : hero, carrousels, recherche, fiches films/séries, lecteur vidéo, continuer la lecture.
- Lecteur vidéo HTML5 (HLS/DASH/mp4) avec sous-titres, reprise de la progression par utilisateur.
- Admin panel sécurisé (`/admin`) :
  - Gestion des utilisateurs (création, rôle, activation/désactivation, reset mot de passe).
  - CRUD sur films, séries, saisons et épisodes avec fusion automatique (idempotence).
  - Gestion des catégories, mise en avant (hero) et publication/dépublication.
  - Journal d'audit consultable.
- Données 100 % fichiers (`/data`) avec écritures atomiques + verrouillage applicatif.
- Scripts de seed, sauvegarde (tar.gz) et lint JSON.
- Docker Compose prêt à l'emploi.

## Architecture

```
/workspace/StreavminV5
├── server.js            # API HTTP, sessions, gestion des fichiers
├── frontend/            # Application React (UMD) + CSS
├── data/                # Catalogue, utilisateurs, historiques, audit
├── scripts/             # seed, backup, lint
└── docker-compose.yml   # Lancement conteneurisé
```

Le serveur Node s'appuie uniquement sur les modules natifs (pas de dépendance npm externe) : le routage, les sessions, la validation et la persistance sont implémentés à la main.

## Prérequis

- Node.js ≥ 18
- `tar` pour le script de sauvegarde
- (Optionnel) Docker & Docker Compose

## Installation et lancement

### Avec Node.js

```bash
npm install   # aucune dépendance n'est installée mais initialise package-lock
npm run seed  # réinitialise les données de démonstration
npm start     # démarre le serveur sur http://localhost:3000
```

### Avec Docker

```bash
docker compose up --build
```

Le serveur écoute sur `http://localhost:3000`. Les fichiers de données sont montés en volume (`./data`).

## Scripts utilitaires

| Script              | Commande              | Description |
|---------------------|-----------------------|-------------|
| Seed catalogue      | `npm run seed`        | Réinitialise tout le contenu JSON (catalogue + utilisateurs + audit).
| Sauvegarde          | `npm run backup`      | Crée une archive `backup/streavmin-<timestamp>.tar.gz`.
| Lint catalogue      | `npm run lint:catalog`| Vérifie la cohérence des JSON (IDs, URLs, doublons, etc.).

## Comptes de démonstration

| Utilisateur | Mot de passe | Rôle  |
|-------------|--------------|-------|
| `admin`     | `admin123`   | Admin |
| `demo`      | `demo1234`   | User  |

## API

Les routes commencent par `/api`. Toutes les requêtes mutantes nécessitent un header `X-CSRF-Token` renvoyé par `GET /api/auth/session` ou `POST /api/auth/login`. Les cookies de session (`sid`) sont HttpOnly.

### Authentification

| Méthode | Route                  | Description |
|---------|------------------------|-------------|
| `GET`   | `/api/auth/session`    | Renvoie l'état de session et le jeton CSRF.
| `POST`  | `/api/auth/login`      | Authentifie un utilisateur (username/password).
| `POST`  | `/api/auth/logout`     | Déconnecte la session courante.

### Catalogue public

| Méthode | Route                               | Description |
|---------|-------------------------------------|-------------|
| `GET`   | `/api/catalog/overview`             | Vue agrégée (hero, carrousels, continuer la lecture).
| `GET`   | `/api/catalog/movies/:id`           | Détails d'un film + suggestions.
| `GET`   | `/api/catalog/series/:slug`         | Détails d'une série (saisons/épisodes).
| `GET`   | `/api/catalog/search?q=...`         | Recherche multi critères.

### Historique utilisateur

| Méthode | Route                      | Description |
|---------|----------------------------|-------------|
| `GET`   | `/api/users/me/history`    | Historique/continuer la lecture (session requise).
| `POST`  | `/api/users/me/progress`   | Sauvegarde la progression (film/épisode).

### Administration (rôle `admin`)

| Méthode | Route | Description |
|---------|-------|-------------|
| `GET`   | `/api/admin/users`                            | Liste des utilisateurs.
| `POST`  | `/api/admin/users`                            | Création utilisateur.
| `PUT`   | `/api/admin/users/:username`                  | Mise à jour rôle/statut.
| `POST`  | `/api/admin/users/:username/reset-password`   | Réinitialisation mot de passe.
| `POST`  | `/api/admin/users/:username/toggle`           | Activation/désactivation.
| `GET`   | `/api/admin/catalog/movies`                   | Tous les films (publiés ou non).
| `POST`  | `/api/admin/catalog/movies`                   | Création film.
| `PUT`   | `/api/admin/catalog/movies/:id`               | Mise à jour film.
| `DELETE`| `/api/admin/catalog/movies/:id`               | Suppression (soft delete).
| `GET`   | `/api/admin/catalog/series`                   | Toutes les séries.
| `POST`  | `/api/admin/catalog/series/meta`              | Mise à jour métadonnées série.
| `POST`  | `/api/admin/catalog/series/episode`           | Création/mise à jour épisode (fusion idempotente).
| `DELETE`| `/api/admin/catalog/series/:slug/seasons/:season/episodes/:ep` | Suppression épisode.
| `DELETE`| `/api/admin/catalog/series/:slug`             | Dépublication série.
| `POST`  | `/api/admin/catalog/categories`               | Sauvegarde des catégories.
| `GET`   | `/api/admin/audit`                            | Consultation du journal d'audit.

## Structure des fichiers

```
frontend/
  index.html        # React UMD + point d'entrée
  app.js            # SPA Netflix-like
  styles.css        # Thème sombre responsive

data/
  catalog/
    categories.json
    movies.json
    series/
      chrono-guardians.json
      echoes-of-neon.json
  users/
    users.json
    admin.json
    demo.history.json
  audit.log

scripts/
  seed-data.js
  seed.js
  backup.js
  lint-catalog.js
```

## Sécurité et bonnes pratiques

- Sessions temporisées (8 h) stockées en mémoire + cookie HttpOnly.
- Jeton CSRF obligatoire sur toutes les requêtes POST/PUT/DELETE.
- Validation stricte des URLs, slugification et sanitation des champs.
- Écritures JSON atomiques (temp file + rename) + verrouillage applicatif.
- Journal d'audit (`data/audit.log`) pour tracer toutes les opérations sensibles.
- Sauvegarde/seed rapides pour restaurer l'environnement.

Bon streaming ! 🎬
