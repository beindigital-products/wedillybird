# Outillage de production TikTok

Tout est conçu pour tourner dans un dossier de travail jetable (`WORK/`) ; rien n'est ajouté au build de l'application. Les vidéos, les images générées et les captures vidéo ne sont pas versionnées (trop lourdes) : elles se régénèrent avec ces outils.

## Prérequis

- Python 3.11 avec `Pillow`, `numpy` et `faster-whisper` ; `ffmpeg` 6 avec `libass`, `xfade` et `loudnorm`.
- Node 22 avec `playwright-core` (`pw/package.json`) et un Chromium (`CHROMIUM_PATH` pour changer le chemin par défaut).
- Pour les captures de l'application : une copie du dépôt construite (`pnpm build`) et le serveur de test en mémoire (`tests/e2e/support/serve.mjs`, Convex en mémoire sur `127.0.0.1:3210`).
- Polices : `production/fonts_prep.py` prépare Bodoni Moda Italic et Geist dans `WORK/assets/fonts`.

## Disposition attendue

```
WORK/
  production/   (ce dossier)      scripts/  (les 30 JSON)
  assets/fonts  assets/decor  assets/norah  assets/product/takes  assets/gallery
  pw/           (captures)
```

`production/build_video.py` retrouve le dépôt (musiques, logo) en remontant les dossiers, ou via `WEDILLYBIRD_REPO`.

## Les étapes

1. **Valider les scripts** : `python production/validate_scripts.py scripts` (longueur, voix off = somme des plans, interdits, chiffres écrits en toutes lettres, présence de l'avertissement IA, cartes numérotées).
2. **Registre des ressources** : `python production/build_registry.py` regroupe décors, plans de Norah, prises d'écran (`assets/product/takes/<prise>.mp4` + `<prise>.marks.json`) et images de remplacement.
3. **Manifeste d'une vidéo** : `python production/make_manifest.py scripts/D01-A.json production/registry.json out/manifest.json --vo vo.mp3 --words words.json`. Les plans d'écran sont choisis par `production/screen_segments.json` (prise + repère + décalage) ou, à défaut, par la séquence par défaut de chaque écran.
4. **Montage** : `python production/build_video.py out/manifest.json out/D01-A.mp4 --cover out/D01-A.jpg` (1080×1920, 30 i/s, sous-titres mot à mot, cartes, pastille IA, musique avec réduction pendant la voix, −14 LUFS).
5. **Aperçu muet sans crédit** : `production/make_preview.sh D06-B` (minutage estimé par `synth_words.py`, plans de Norah remplacés par des images de substitution). Utile pour juger rythme, textes et écrans.
6. **Décors** : `python production/make_decor_jobs.py` puis, pour chaque lot, génération avec `bytedance/seedream-5.0-pro` (9:16) et `python production/fetch_decor.py <ID> <url>`. Limite de l'équipe : 5 requêtes par minute. `decor_jobs/remaining_*.json` liste les 144 décors qui restent.
7. **Voix off** : un appel de synthèse par script avec le texte `voiceover` (marque écrite « Wed-ill-ee bird » pour la synthèse) ; `production/transcribe.py` produit les horodatages.
8. **Données du plan** : `build_plan_data.py` agrège les scripts dans `plan.json` (calendrier, légendes, vérifications, état de production) ; la page de suivi interactive se publie à part, à partir de ce fichier.

## Captures d'écran réelles

`pw/capture_job.mjs <job.json> <sortie.mp4>` filme une page mobile (360×640 à l'échelle 3, soit 1080×1920) par flux CDP et écrit `<sortie>.marks.json` : un repère par étape `{"mark": "nom"}`, en secondes depuis la première image. Étapes disponibles : `wait`, `tap`, `click`, `text`, `type`, `fill`, `press`, `smoothScroll`, `scrollTo`, `scrollSel`, `scrollToText`, `drag` (glisser-déposer progressif), `dragBy`, `dragFromTo`, `eval`, `goto`, `reload`, `offline`, `api` (appel direct au serveur de test, pour changer les données en cours de prise), `shot`.

Un bloc `sanitize` remplace les noms de la base de démonstration, masque téléphones et courriels, traduit les libellés français de la graine de données et cache les cartes de prix ou de quotas. Aucune donnée réelle n'est filmée et les sessions de test (`state_*.json`) ne sont pas versionnées : `login.mjs` les recrée.

Pièges rencontrés : un écran statique n'envoie aucune image, donc la fin d'une prise est prolongée par le dernier temps réel (corrigé dans le lanceur) ; chercher dans le dernier dixième de seconde d'une prise bloque ffmpeg (le manifeste borne désormais la position) ; les pages de démonstration publiques affichent un bandeau et un pied de page qu'il vaut mieux cacher quand ils contredisent le propos.

## Données de démonstration et vie privée

Les prises utilisent la démo publique (couple fictif Léa et Adam) et une base locale de test (couple Sarah et Marc, agence Studio Lumière). Les noms et numéros issus de la graine sont remplacés avant l'enregistrement. Ne jamais filmer ni publier un jeton d'invité réel.
