# Chasse aux ingrédients — Diptyque

Mini web app SCORM-compatible pour Diptyque : un panoramique illustré
(style gravure/coloriage) scrollable dans lequel l'utilisateur doit
retrouver 13 ingrédients bienfaisants, un par un, en cliquant sur le
bon bouton `?`. Utilisée pour la formation des équipes en boutique,
packagée pour être déposée sur la plateforme Teach on Mars (LMS).

**Statut** : projet en cours d'itération avec le client, déployé sur
Vercel pour review. Contenu (noms d'ingrédients, produits, positions,
image panoramique) actuellement en placeholder — à remplacer quand le
client fournit le contenu définitif.

## Règle du jeu

- Le texte en haut affiche l'ingrédient à trouver, un par un et dans
  l'ordre (`content/texts.html`, ordonné par `config.json` → `order`).
- Bon bouton cliqué → son de validation, la modale du produit
  s'ouvre (nom + images produits + légendes), le bouton passe en coche
  blanche une fois qu'on revient sur le diapo (RETOUR).
- Mauvais bouton cliqué → le bouton vibre (shake) + son d'erreur, pas
  de modale, la cible ne change pas.
- Une fois les 13 ingrédients trouvés → texte de fin + bouton QUITTER.

## Contraintes techniques

- **Vanilla HTML/CSS/JS uniquement** — pas de framework, pas de build
  step, pas de CDN. Contrainte SCORM : le package doit tourner en local
  file:// ou sur un LMS sans dépendances externes.
- **Mobile-first**, conçu pour être vu sur téléphone (l'app simule un
  cadre de téléphone en desktop via l'outil position-editor).
- **Sons de feedback** générés en Web Audio API (`playSuccessSound` /
  `playErrorSound` dans `script.js`) — pas de fichiers audio, zéro
  dépendance externe.
- Un seul écran principal (`index.html`) + une modale à page unique
  (titre + liste verticale de produits + RETOUR — pas de swipe/pages).

## Structure du projet

```
index.html          Écran principal + modale + password gate (temporaire)
style.css            Tout le CSS
script.js             Toute la logique app (jeu + sons + SCORM + drag)
scorm.js               Bridge SCORM/ToM (voir plus bas)
content/
  config.json           Positions des boutons + chemins des assets (PAS de texte)
  texts.html              TOUS les textes de l'app — fichier à traduire (voir plus bas)
  slides/panoramic.webp     Image panoramique
  modals/ing-01../13/       product-1.png, product-2.png... par ingrédient
tools/
  position-editor/         Outil visuel pour repositionner les boutons
  server.js                  Petit serveur Node local (port 3333) pour l'éditeur
```

## Points d'architecture à connaître

- **Panoramique** : `panoramic-track` a une largeur fixée en JS
  (`offsetWidth` de l'image) — sans ça les positions en % des boutons
  se calculent sur la largeur de l'écran au lieu de l'image, et tout
  se retrouve collé à gauche. Le scroll se fait par `transform:
  translate3d()`, jamais par `scrollLeft`.
- **Animation d'intro** (pan automatique au chargement) : transition
  CSS pure (pas de `requestAnimationFrame`), pour rester fluide même
  si le thread JS est occupé. Elle ne démarre qu'après validation du
  mot de passe (sinon elle se joue derrière l'écran de connexion et
  n'est jamais vue). Les boutons `?` apparaissent ensuite un par un,
  de gauche à droite (`showButtonsSequentially`).
- **Séquence de jeu** : `state.targetIndex` pointe vers l'ingrédient
  attendu dans `orderedIngredients()` (triée par `config.json` →
  `order`). Un clic correct appelle `markFound` + `openModal` ; c'est
  la fermeture de la modale (RETOUR) qui fait avancer `targetIndex`
  via `advanceAfterFound` — pas le clic lui-même — pour laisser le
  temps de voir le contenu du produit avant que le prompt change.
- **Textes centralisés** (`content/texts.html`) : un seul fichier
  HTML structuré et commenté contient tous les textes (app + 13
  ingrédients, avec leurs produits associés). C'est le fichier à
  dupliquer/traduire pour produire un package par langue sur Teach on
  Mars — voir les commentaires en tête du fichier. `config.json` ne
  contient aucun texte, seulement positions et chemins d'assets ; le
  nombre et l'ordre des produits par ingrédient doivent rester
  synchronisés entre les deux fichiers.
- **Préchargement** : toutes les images produits sont préchargées au
  démarrage (`preloadModalImages`) pour que l'ouverture de modale soit
  instantanée. `texts.html` et `config.json` sont fetchés une fois au
  démarrage aussi.
- **SCORM** (`scorm.js`) : détecte automatiquement Teach on Mars /
  SCORM 2004 / SCORM 1.2 en remontant la chaîne parent/opener. Reporte
  la progression (`found/13`) à **chaque** ingrédient trouvé, pas
  seulement à la fin — si l'utilisateur quitte avant d'avoir tout
  trouvé, le LMS connaît son pourcentage exact. Hors LMS (test local/
  Vercel), toutes les méthodes sont des no-op silencieux. Inspiré du
  driver de `github.com/luxmodernis/template-scorm-project` (repo de
  référence pour l'intégration SCORM/ToM, à consulter si besoin
  d'étendre). Fichier inchangé par rapport aux autres projets LRDS.
- **Password gate** : protection temporaire pour les reviews client
  (mot de passe en dur dans `script.js`, `PW_CORRECT`). À supprimer
  quand le projet sera validé — l'intro doit alors démarrer directement
  au chargement (retirer la dépendance à `passwordUnlocked` dans
  `maybeStartIntro()`).

## Outil d'édition des positions

`tools/position-editor/` — page visuelle pour repositionner les
boutons à la main sur le panoramique (glisser-déposer), au lieu
d'éditer les `%` à la main dans `config.json`.

- **En local** : `node tools/server.js` puis
  `http://localhost:3333/tools/position-editor/` — le bouton
  "Valider les positions" écrit directement dans `content/config.json`
  via une petite API du serveur Node.
- **Sur Vercel** (lecture seule) : le même outil fonctionne mais le
  bouton devient "Copier le JSON" (presse-papier) au lieu d'écrire le
  fichier.

## Workflow de travail

- Toujours vérifier les changements visuels dans le navigateur
  (`mcp__Claude_Preview__*`) avant de commiter — décoder le mot de
  passe via `sessionStorage.setItem('lrds_unlocked','1')` pour sauter
  l'écran de connexion pendant les tests.
- Commits en français, un commit par changement logique, description
  du *pourquoi* pas juste du *quoi*.
- Push sur `main` directement (pas de branches) — c'est le
  fonctionnement adopté sur ce projet, déploiement auto sur Vercel.
