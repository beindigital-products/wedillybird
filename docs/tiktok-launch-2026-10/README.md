# Lancement TikTok — 15 jours, 30 vidéos

Plan complet pour passer le compte `@wedillybird` de 20 à 100 abonnés en quinze jours : deux vidéos par jour, toutes en anglais, chacune d'au moins 1 min 30, portées par Norah (hôte virtuelle, jamais montrée de face), avec de vrais écrans de l'application quand le sujet s'y prête.

Ce dossier contient tout ce qui est prêt : la recherche, les 30 scripts validés, le calendrier, les légendes, les hashtags, les commentaires épinglés, les captures d'écran réelles et l'outillage de montage. La production des images de Norah et de la voix off est suspendue à deux actions du fondateur (voir « Blocages »).

Suivi interactif : le tableau de suivi publié pour ce plan reprend le calendrier, les textes à copier et le relevé d'abonnés.

## 1. Où en est chaque brique

| Brique | État | Détail |
|---|---|---|
| Recherche (croissance, formats, conseils, produit) | fait | `research/` : quatre rapports sourcés |
| 30 scripts en anglais | fait | `scripts/D01-A.json` à `D15-B.json`, validés par `tooling/production/validate_scripts.py` (0 erreur, 0 avertissement), 265 à 292 mots chacun, soit environ 1 min 40 à 1 min 50 |
| Calendrier, légendes, hashtags, commentaires épinglés | fait | `calendar.md`, `plan.json`, champs `caption`, `hashtags`, `pinned_comment` de chaque script |
| Vérification des affirmations | fait, à relire | chaque script liste ses chiffres, ses sources et ses points `needs_proof` ; voir « Points à vérifier » |
| Écrans réels de l'application | fait | 10 prises horodatées (parcours invité, tableau de bord, liste d'invités, plan de table, check-in avec file hors ligne, galerie, cockpit planner, CRM), données de démonstration, noms et numéros masqués |
| Décors (natures mortes, sans personne) | partiel | 71 images sur 215 générées (retéléchargeables sans frais avec `decor-manifest.json`) ; les 144 restantes coûtent environ 5 $ |
| Plans de Norah | non démarré | demande le workspace et l'élément personnage dans le studio |
| Voix off | non démarrée | demande le crédit du studio et le choix de la voix |
| Montage final | outillé, testé | `tooling/production/build_video.py` ; aperçus muets possibles sans crédit |
| Publication | non demandée | à faire à la main ou via TikTok Studio, après validation humaine |

## 2. Architecture éditoriale

Quatre séries, pour qu'un visiteur comprenne en une vidéo pourquoi suivre le compte :

- **The Quiet List** (9 vidéos, créneau A) : des listes de décisions à prendre dans l'ordre, sourcées. Vidéos « recherche » qui restent utiles.
- **Copy, Paste, Send** (6 vidéos, créneau A) : les messages exacts à copier (relance de réponse, adultes seulement, parents qui ajoutent des invités…), texte complet dans le commentaire épinglé.
- **Norah's Notebook** (10 vidéos, créneau B) : feuilleton fictif de dix entrées (Mara et Eli, mariage en janvier). Chaque entrée finit sur un cliffhanger et enseigne une vraie leçon. L'histoire est annoncée comme fictive à l'écran et à la voix.
- **Inside Wedillybird** (5 vidéos, créneau B) : démonstrations de fonctionnalités, avec de vrais écrans et leurs limites dites à voix haute.

Le calendrier détaillé est dans `calendar.md`. Créneau A = 12 h 30 à New York, créneau B = 19 h 30 à New York (soit 18 h 30 et 1 h 30 à Paris en novembre ; TikTok Studio sur ordinateur programme jusqu'à 10 jours à l'avance). Jour 1 proposé : lundi 2 novembre 2026, une fois les changements d'heure passés ; la date se change dans le tableau de suivi.

## 3. Règles de contenu

- Voix et sous-titres en anglais ; tout chiffre dit à voix haute est écrit en toutes lettres pour que la synthèse vocale le lise bien.
- Norah est annoncée à chaque vidéo comme hôte virtuelle (`Norah is an AI-generated host` en pastille permanente, mention dans la légende, bascule « Contenu généré par IA » et « Votre marque » à activer sur TikTok). Elle ne raconte aucune expérience vécue et ne juge pas le produit.
- Aucune statistique, aucun témoignage inventé. Les chiffres cités viennent de sources datées (Zola, The Knot, Joy, Emily Post, Pew, etc.), affichées à l'écran, et les valeurs peu sûres sont dites comme des ordres de grandeur.
- Rien sur le produit qui ne soit vérifié dans le code ou sur le site : pas de livraison WhatsApp ou SMS, pas de QR code remis aux invités, pas de relance automatique des invités sans réponse, pas de « fonctionne hors ligne » sans condition, pas de prix.
- Cinq hashtags par vidéo, jamais plus. Pas de `#fyp` ni `#viral`. Deux vidéos voisines partagent au plus deux hashtags.
- Musique : les cinq morceaux originaux de l'application (`public/audio/invitation`), jamais de catalogue grand public.

## 4. Croissance : attentes et routine

- Départ : 20 abonnés (relevé du 18/10/2026). Cible : 100.
- Fourchette réaliste avec 30 vidéos soignées et un engagement quotidien : 35 à 100 abonnés, avec une queue haute jusqu'à 150 si une vidéo décolle. Aucun résultat n'est garanti ; la publication ne vaut pas la promesse.
- Routine de dix minutes par jour : répondre à tous les commentaires dans l'heure, répondre en vidéo aux deux ou trois meilleures questions, épingler le commentaire prévu, commenter cinq comptes du secteur avec une vraie remarque.
- À éviter : suivre pour être suivi, acheter des abonnés, groupes d'engagement, musique du catalogue grand public, toute promesse produit non vérifiée.
- Bio : le lien du profil ouvre aujourd'hui le site en français ; le remplacer par `wedillybird.com/en` (ou `/en/demo`).

## 5. Blocages et actions du fondateur

1. **Recharger le crédit du studio** (Vercel AI Gateway). Le solde est tombé à zéro après les 71 premiers décors (probablement l'allocation gratuite) : toute nouvelle image, voix ou vidéo est refusée. La vidéo exige au moins 10 $ de solde. Budget conseillé : environ 100 $ pour tout produire avec les reprises (décors 5 $, voix 2 $, plans de Norah 20 à 80 $ selon le modèle).
2. **Créer le workspace « Wedillybird — TikTok 15 jours »** dans l'interface web du studio et y importer Norah comme élément de type personnage (photos de référence). Les outils disponibles ne permettent ni de créer un workspace ni d'exporter un personnage d'OpenArt : le compte OpenArt connecté ne contient aucune image de Norah (historique d'autres projets uniquement) et le connecteur ne donne pas accès aux « Characters ».
3. **Choisir la voix** (échantillons dans le studio) et confirmer la prononciation de la marque (« Wed-ill-ee bird » par défaut).
4. Corriger le lien de bio, passer le compte en Business, activer les bascules IA et marque sur chaque vidéo.
5. Relire les points listés dans « Points à vérifier » et confirmer les limites produit dites à voix haute.

## 6. Reprise de la production (runbook)

Une fois le crédit rechargé et Norah importée :

0. `tooling/production/restore_decor.py` retélécharge les 71 décors déjà générés (le studio les garde).
1. `tooling/production/make_decor_jobs.py` liste les décors manquants et prépare des lots ; chaque lot se génère avec `bytedance/seedream-5.0-pro` en 9:16 (limite de 5 requêtes par minute pour l'équipe), puis `tooling/production/fetch_decor.py` rogne le bandeau du générateur.
2. Plans de Norah : un look par tenue (`tooling/production/norah-looks.md`, dix tenues d'automne et d'hiver, huit plans par tenue, réutilisés avec des recadrages). Image clé avec l'élément, validation visuelle de l'identité, puis animation. Contrôler à chaque étape que le visage n'apparaît jamais de face.
3. Voix off : un appel de synthèse par script (texte `voiceover`, marque écrite « Wed-ill-ee bird » pour la synthèse), puis `tooling/production/transcribe.py` pour les horodatages mot à mot.
4. `tooling/production/make_manifest.py` assemble script, décors, plans et prises d'écran ; `tooling/production/build_video.py` produit le MP4 1080×1920 (sous-titres mot à mot, cartes, pastille IA, mix et normalisation à −14 LUFS).
5. Contrôle : durée d'au moins 90 s, mots du script alignés sur la voix, aucun texte coupé, pastille IA visible, volume.

Sans crédit, `tooling/production/make_preview.sh <ID>` produit déjà un aperçu muet d'une vidéo (minutage estimé, décors réels, prises d'écran réelles, plans de Norah remplacés par des décors).

## 7. Points à vérifier avant de publier

- Chiffres lus uniquement par extrait de recherche (pages The Knot inaccessibles en lecture directe) : part de 20 % de refus, décembre premier mois de fiançailles, fourchettes d'envoi des invitations.
- Heures de coucher du soleil (D13-B, D15-A) : à relancer sur le Naval Observatory pour la ville et la date indiquées.
- Limites produit dites à voix haute : pas de relance automatique, CRM réservé aux plans supérieurs, check-in hors ligne seulement si la page est déjà ouverte, galerie ouverte « un temps limité » après le mariage.
- D15-B suppose qu'un couple peut ouvrir le lien d'un invité sur un second téléphone avant l'envoi.
- Hors vidéos : TVA et Stripe Tax (BACKLOG n° 9), mentions légales incomplètes, nom proche « Weddybird » à surveiller.

## 8. Arborescence

```
docs/tiktok-launch-2026-10/
  README.md            ce document
  calendar.md          les 30 publications, jour par jour
  plan.json            toutes les données du plan (calendrier, textes à copier, état de production)
  decor-manifest.json  décors déjà générés : URL du studio et prompt de chacun
  scripts/             30 scripts (voix off, plans, légende, hashtags, sources)
  research/            quatre rapports de recherche
  tooling/             validation, montage, captures d'écran, décors (voir tooling/README.md)
```
