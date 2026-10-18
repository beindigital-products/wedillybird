# Wedillybird TikTok — cahier des charges des scripts (30 vidéos · 15 jours · 2 par jour)

Tu écris des scripts de vidéos TikTok **en anglais américain** pour le compte @wedillybird (nom affiché actuel « Wedilly Bird »). État du compte : 20 abonnés, 56 vidéos déjà publiées avec ≈ 93 likes au total → le format précédent n'a pas fonctionné ; on repart sur des vidéos **utiles, précises, calmes**, avec une voix off et des visuels soignés. Objectif : ≥ 100 followers en 15 jours (objectif ambitieux : chaque vidéo doit donner une vraie raison de suivre le compte).
Public : couples fiancés et wedding planners anglophones, États-Unis d'abord. Saison : automne → hiver, la période des fiançailles de fin d'année approche.
**Chaque vidéo dure au moins 90 secondes en tout** (voix off 255–295 mots ≈ 93–107 s, + 0,35 s de fin + 2,4 s de carte finale).

Aucun outil de génération, aucun accès web : tu écris des fichiers JSON, rien d'autre. N'écris que dans le dossier indiqué dans ta mission. Ne modifie rien dans /home/user/wedillybird.

## 1. À lire d'abord (chemins absolus, base = `<WORK>`)
1. `research/r2-wedding-tips-fact-bank.md` — **les seuls faits/chiffres autorisés** (87 éléments T01–T87 avec sources, dates, niveau de confiance ; lis les sections « Numbers worth knowing », « 10 things NOT to claim »). Lis en entier les éléments qui te sont assignés ; lis l'en-tête (§0, §0.1) pour les règles d'usage des étiquettes `no-number`, `sources-disagree`, `computed`.
2. `research/r3-product-fact-sheet.md` — ce que le produit fait VRAIMENT. §0 (les 20 affirmations qui seraient fausses), §B (tables de fonctionnalités), §E (garde-fous), §E6 (phrases sûres). Toute phrase sur le produit doit venir de là.
3. `research/r1b-benchmarks-formats-hooks.md` — formats (F1–F20), banque d'accroches H01–H60, séries, règles de fiction (§6.1), nom de marque (§5.3).
4. `research/r1a-growth-playbook.md` — hashtags (§1.2–1.3), mots-clés de recherche (§2.3), divulgation (§5.5), règles de croissance (§3, §7).
5. `production/norah-looks.md` — looks L1–L10 et plans S1–S8 de l'hôte (tu ne cites que les plans du look du jour).
6. Marque : `/home/user/wedillybird/agents/wedillybird_ai_ops/knowledge/brand-voice.md`, `claims-and-proof.md`.

## 2. Voix et règles de fond
**Ton** : un partenaire calme des opérations de mariage — pratique avant poétique, chaleureux sans être sucré, direct sur les frictions (tableurs, réponses éparpillées, relances, check-in), **anti-pression** (« your wedding isn't behind schedule »), aucune fausse urgence, aucun superlatif.
**Norah = personnage fictif généré par IA, hôte de la marque** (jamais présentée comme une vraie wedding planner/experte). Elle n'est jamais de face (voir §6). Interdit pour Norah : toute expérience vécue (« when I planned my wedding », « my clients », « I've seen hundreds of weddings », « I used it », « I love »), tout avis sur le produit, toute promesse de résultat. Autorisé : « here's what I'd do », « let me show you », « you'll want to ». Quand le produit est recommandé, c'est **la marque** qui parle (« Wedillybird shows you… », « at Wedillybird we built… »).
**Divulgation IA obligatoire dans la voix off de chaque vidéo** : une phrase du type « I'm Norah, Wedillybird's AI host. » (dans les 10 premières secondes ou dans la dernière phrase). Le validateur exige « AI host » / « AI character » / « AI-generated » dans la voix off. (Une pastille IA permanente est ajoutée au montage.)
**Chiffres** : uniquement ceux de r2 (confiance high / medium-high, jamais `low`), écrits **en toutes lettres** dans la voix off (« seventy-five percent », « thirty days »), avec **source nommée et datée affichée à l'écran** (un `overlay` ou une `CARD` : « Source: Zola, 2025 survey of 720 couples »). Chaque chiffre → `claims_review.numbers_used` avec `{figure, source, r2_id}`. Les éléments `sources-disagree` : dis que les sources divergent ; ne présente jamais un chiffre comme « la règle ». Les éléments `jurisdiction` : nomme la juridiction à l'écran. Aucun chiffre sur le produit (pas de secondes, de taps, de pourcentages, de prix, de capacité).
**Interdits absolus** (le validateur en bloque une partie) : « nobody tells you », « game-changer », « revolutionary », « unlock », « seamless », « free », « guarantee », « 100 % », « studies show / research shows / experts say » sans source nommée à l'écran, « most couples », « thousands of couples », témoignages, comparaisons nommées de concurrents (pas de Zola/Knot/Joy/etc.), Weddybird, prix, remboursement, RGPD/sécurité/chiffrement, hébergement en Europe, taxes, tout chiffre de performance du produit.
**Le produit (r3) — dire seulement** : un lien personnel par invité, qui s'ouvre dans le navigateur du téléphone, rien à installer, pas de compte pour l'invité ; une invitation animée (« The Seal », l'enveloppe qui s'ouvre) ; les invités répondent « I'll be there / Maybe / I can't make it » avec plus-ones, besoins alimentaires (texte libre) et un mot ; le couple voit confirmed / pending / maybe / declined sur un tableau de bord ; export CSV de la liste d'invités pour le traiteur ; check-in à la porte avec le scanner du téléphone ou en saisissant le code, et file d'attente hors ligne qui se synchronise au retour du réseau (jamais « 100 % hors ligne ») ; plan de table glisser-déposer + placement auto + impression (Premium) ; galerie partagée : les invités ajoutent leurs photos depuis le même lien, le couple approuve (tri automatique + validation) ; une seule fois payé par mariage, pas d'abonnement (pour les couples) ; pour les planners : cockpit multi-mariages, CRM kanban, budget, prestataires (Business et plus).
**Ne jamais dire / montrer** : livraison par WhatsApp ou SMS (non prouvée), « invitations by text », QR code remis aux invités, relance automatique des non-répondants (inexistante : seuls les invités confirmés reçoivent des rappels), import de liste d'invités, résumé des régimes alimentaires par catégorie, album PDF/albums, livre photo, « twelve openings » (2 seulement sont choisissables ; la page invité joue toujours « The Seal » pour l'instant), choix de musique/photo visible par les invités, intégrations HoneyBook/Zapier/API, portail couple `/mon-mariage`, onglets simulés du hub agence, PAYG, « no card required », stockage/localisation des données, prix de quoi que ce soit.
**Nom** : écrire « Wedillybird » (un mot). Max 2 mentions du nom dans une vidéo de conseil (3–4 dans INSIDE/NOTEBOOK à partir de l'entrée 03). Ne jamais dire « Weddy » ni citer Weddybird. Pas de #weddybird.

## 3. Longueur, rythme et rétention
- Voix off **255–295 mots**, 28–46 beats (1–2 phrases, 6–14 mots, ≈ 2,5–3,8 s par beat). Un changement visuel à chaque beat. Phrases courtes (moyenne 8–12 mots). Anglais parlé : contractions, « you », concret.
- Pas de chiffres en digits dans la voix off (TTS), pas d'emoji, pas d'abréviation ambiguë (« vs », « etc. », « p.m. » → « four in the afternoon »). « RSVP » et « WhatsApp » sont OK (WhatsApp seulement dans un contexte de conseil/étiquette, jamais comme canal du produit).
- **0–3 s : accroche** (≤ 12 mots, le mot-clé de recherche dans les trois premiers mots, texte écran identique, pas de « Hi », pas de présentation ; la première phrase de la voix off = `hook.spoken` exactement).
- 3–12 s : promesse + enjeu + boucle ouverte (« number four saves the most chasing »).
- Corps : 3–6 segments de 12–20 s, chacun avec un micro-gain ; relance « Here's the part people skip. » vers 35–45 s et 65–75 s ; **un CTA de follow doux vers 55–65 s** (« If you're planning a winter wedding, follow: tomorrow I'll show you… »).
- Résolution à ≈ 75–85 % ; derniers 8–10 s : bonus/script final + phrase de divulgation + **un seul CTA** (follow pour la suite précise / save / « link in bio: see a sample invitation ») + retour à l'accroche pour que la relecture boucle.
- Chaque vidéo doit être utile **sans** le produit. Un seul passage produit par vidéo hors INSIDE (≤ 14 s à l'écran) ; INSIDE = 40–60 s de vrais écrans, mais toujours « problème d'abord ».
- Un beat SCREEN doit rester compréhensible si l'écran est remplacé par une carte : la voix et le texte portent l'information.
- Aucun script ne ressemble à un autre : angle, exemples, accroche, structure différents.

## 4. Séries (le champ `series` du JSON) et lignes récurrentes
**QUIET_LIST** — « The Quiet List » : listes calmes, ordonnées, anti-pression (timelines, checklists, questions à poser, budget, comparaison). Intro (dans le beat 2) : « The Quiet List: [sujet]. » Visuel : cartes numérotées + décors.
**COPY_PASTE_SEND** — « Copy, Paste, Send » : le texte exact à envoyer pour une situation gênante (invités, famille). Beat 1 = situation/hook ; beat 2 : « Copy, Paste, Send. Today's awkward message: … ». Les textes complets vont dans `pinned_comment` (sauvegardable). Le script du message apparaît en `CARD` type `quote`.
**NOTEBOOK** — « Norah's Notebook » : journal **fictif** (voir bible §8). Beat 1 = accroche d'entrée (ex. « Entry 03. A maybe arrived with a heart emoji. ») ; beat 2 = « Norah's Notebook, entry three. The story is fiction. The fix is real. » ; dernier tiers : phrase d'IA (« I'm Norah, an AI character, and this is Wedillybird. ») ; fin = cliffhanger vers l'entrée suivante.
**INSIDE** — « Inside Wedillybird » : démonstrations honnêtes sur de vrais écrans (données de démo). Structure : le problème → la démo → **une limite à connaître** (ce que l'outil ne fait pas). CTA : « link in bio: see a sample invitation ».

## 5. Calendrier (respecter jour, slot, série, look, sujet, éléments r2, écrans, teaser)
Slot A = 12:30 ET (recherche/evergreen). Slot B = 19:30 ET (rendez-vous du soir). Le `next_teaser` annonce **précisément** la vidéo suivante du même slot (voir colonne Teaser).

| ID | Série · n° | Sujet / angle (graine) | Accroche (R1b) | Éléments r2 | Look | Écrans (r3) | Teaser (vidéo suivante) |
|---|---|---|---|---|---|---|---|
| D01-A | CPS 1 | Guests who haven't replied : le texte exact (3 versions, de douce à ferme) | H13 | T31 T30 T25 | L1 | — | « Tomorrow: five things to settle before you send a single invitation » |
| D02-A | QL 1 | Five things to settle before you send a single invitation | H01 | T22 T23 T29 T30 T33 T34 | L2 | S04 ≤ 12 s | « Tomorrow: your wedding isn't behind schedule » |
| D03-A | QL 2 | Your wedding isn't behind schedule : ce qui compte maintenant / ce qui attend après les fêtes | H54 / H53 | T01 T02 T06 T07 T08 T09 | L4 | — | « Tomorrow: how to say adults only politely » |
| D04-A | CPS 2 | « Adults only » et plus-ones : formulations claires | H31 / H45 | T24 T34 T23 | L5 | — | « Tomorrow: count back from your wedding date » |
| D05-A | QL 3 | Count back from your wedding date : chaque échéance (save-the-date → invitations → RSVP → décompte final) | H10 / H11 | T07 T09 T10 T28 T29 T30 | L3 | — | « Tomorrow: where your budget leaks » |
| D06-A | QL 4 | Where your wedding budget leaks after the venue is booked | H07 | T11 T14 T15 T16 T17 T19 | L2 | — | « Tomorrow: late RSVPs and surprise extra guests » |
| D07-A | CPS 3 | Someone RSVPs late, or with extra people : le script | H32 / H33 | T77 T30 T31 T25 | L7 | — | « Tomorrow: seven questions to ask a venue » |
| D08-A | QL 5 | Seven questions to ask a venue about guest arrival (et frais) | H58 | T42 T43 T44 T49 | L6 | — | « Tomorrow: four ways to collect RSVPs, compared honestly » |
| D09-A | QL 6 | Four ways to collect RSVPs, compared honestly (paper, site, group chat/texts, QR) — SANS nommer de concurrent ; montrer au moins un inconvénient de chaque | H40 / H41 | T35 T36 T37 T38 T30 | L1 | S04 ≤ 12 s (une des quatre) | « Tomorrow: parents who want to add guests » |
| D10-A | CPS 4 | Parents want to add guests? Give them a number, not a veto | (à écrire, style H14/H45) | T26 T22 T27 | L8 | — | « Tomorrow: your wedding day, minute by minute » |
| D11-A | QL 7 | Your wedding day, minute by minute, starting at the front door | H34 | T49 T52 T56 T86 | L9 | S09 ≤ 10 s (optionnel) | « Tomorrow: bad invitation wording, rewritten » |
| D12-A | CPS 5 | Bad invitation wording, rewritten line by line | H23 / H22 | T32 T33 T34 T29 | L5 | S03 ≤ 8 s | « Tomorrow: ten days out and nobody has replied » |
| D13-A | QL 8 | Ten days out and guests still haven't replied? Do this. (triage, pas de relance auto) | H46 | T30 T31 T25 T10 | L3 | S06 ≤ 10 s (compteur pending) | « Tomorrow: replies for relatives asking about the wedding » |
| D14-A | CPS 6 | Relatives asking about the wedding this season? Use these replies | H14 | T75 T76 T26 T62 | L8 | — | « Tomorrow: winter wedding, five things people forget » |
| D15-A | QL 9 | Planning a winter wedding? Five things people forget (chaleur, lumière, plan B, week-end férié) | (H53 variante) | T58 T59 T60 T61 T62 T50 | L9 | — | CTA : suivre pour la suite de la saison |
| D01-B | NOTEBOOK 01 | « The Spreadsheet » (dix semaines) | « Entry 01. Four tabs, three versions, one guest list. » | T22 T27 | L2 | — (aucun produit) | « Entry 02 tomorrow » |
| D02-B | NOTEBOOK 02 | « The Group Chat » (neuf semaines) | « Entry 02. Replies are arriving in four different places. » | T30 T35 T36 | L8 | — | « Tomorrow I show you what a guest sees » |
| D03-B | INSIDE 1 | What your guests see when they tap your invitation link (POV) | H50 / H49 | T38 | L3 | S01 S03 S04 (≥ 40 s) | « Entry 03 on the next evening » (jour 4) |
| D04-B | NOTEBOOK 03 | « The Maybe » (huit semaines) | « Entry 03. A maybe arrived with a heart emoji. » | T31 T30 T25 | L2 | S04 + S06 ≤ 12 s | « Entry 04 tomorrow » |
| D05-B | NOTEBOOK 04 | « The Plus-One » (six semaines) | H30 « Entry 04. Someone replied for six people. We invited four. » | T23 T34 T77 | L5 | S04 (plus-ones) ≤ 12 s | « Tomorrow: replies in five places vs one link » |
| D06-B | INSIDE 2 | Not this: replies in five places. Do this: one link. (tableau de bord + liste + CSV) | H19 | T30 | L1 | S06 S07 (≥ 40 s) | « Entry 05 tomorrow » |
| D07-B | NOTEBOOK 05 | « The Stranger on the List » (cinq semaines) | « Entry 05. The guest list has a stranger on it. » | T22 T27 T26 | L4 | S07 (CSV) ≤ 12 s | « Entry 06 tomorrow » |
| D08-B | NOTEBOOK 06 | « Table Nine » (trois semaines) | H29 « Dear notebook: the caterer needs a number by Friday. » | T30 T33 T19 | L5 | S07 (CSV avec besoins alimentaires) ≤ 12 s | « Tomorrow: the seating plan, in real screens » |
| D09-B | INSIDE 3 | Seating plan: drag, auto-seat, print (Premium) — « your seating chart shouldn't take over your weekend » (opinion, pas de durée) | (à écrire) | T39 T40 T41 | L2 | S08 (≥ 40 s) | « Entry 07 tomorrow » |
| D10-B | NOTEBOOK 07 | « The Front Door » (une semaine) | « Entry 07. The line at the front door isn't moving. » | T49 T86 | L6 | S09 ≤ 12 s (scan ou saisie du code) | « Entry 08 tomorrow » |
| D11-B | NOTEBOOK 08 | « No Signal » (deux jours) | « Entry 08. The venue Wi-Fi just died. » | T49 | L10 | S09 file hors ligne ≤ 12 s (remplaçable par une carte) | « Tomorrow: planners, one calm status per couple » |
| D12-B | INSIDE 4 | Planners: your guest tracker shouldn't live in a group chat (cockpit, CRM — thème sombre ; Business et plus) | H26 | — | L7 | S11 S12 (≥ 40 s) | « Entry 09 tomorrow » |
| D13-B | NOTEBOOK 09 | « Golden Hour » (jour J) | « Entry 09. Golden hour, and the timeline is slipping. » | T50 T51 T59 T52 | L9 | — | « Entry 10 tomorrow » |
| D14-B | NOTEBOOK 10 | « The Photos » (lendemain) | « Entry 10. Everyone's taking photos. Where do they go? » | T54 T55 T57 | L8 | S10 ≤ 14 s | « Tomorrow: check your invitation on a guest's phone » |
| D15-B | INSIDE 5 | Check your invitation on a guest's phone before you send (liste de test + récap) | H51 | — | L1 | S01 S03 S04 (≥ 40 s) | Clôture de saison : « follow, and see a sample invitation: link in bio » |

CPS = COPY_PASTE_SEND, QL = QUIET_LIST. D13-A et D06-B/D09-B/D12-B/D15-B sont les seules vidéos où le look est repris plus d'une fois dans la même journée : respecte la colonne Look.

## 6. Visuels de chaque beat (`visual`)
Chaque beat a **exactement un** visuel (ou une liste de 2 visuels qui se succèdent dans le beat).
- **NORAH** : `{"kind":"NORAH","asset":"L2-S3","crop":"wide|medium|tight|detail","focus":"center|left|right|top|bottom|hands","note":"…"}`. Uniquement les plans du look du jour (norah-looks.md : S1 marche de dos · S2 par-dessus l'épaule · S3 gros plan mains · S4 profil en silhouette · S5 regard sur le lieu · S6 assise de dos · S7 détail de matière · S8 vers une porte). Norah n'est jamais de face ni en gros plan de visage. 6–10 beats NORAH par vidéo ; réutilise un plan avec des recadrages différents (crop/focus), jamais plus de 3 fois par vidéo.
- **DECOR** : `{"kind":"DECOR","asset":"D03-A-d2","prompt":"…","motion":"push-in|pull-out|pan-left|pan-right"}` — **objets et lieux uniquement, aucune personne, aucune main** (les mains sont à Norah). Photoréaliste, éditorial, 9:16, lumière naturelle, palette ivoire/blush/champagne/sauge + tons d'automne désaturés (camel, bordeaux, pierre), faible profondeur de champ, grain léger, **« no text, no logos, no screens with legible content »**. Gabarit de prompt : « Photorealistic editorial still life, vertical, [objets précis et matières], [lieu], [lumière], 50 mm, shallow depth of field, subtle film grain, muted palette of ivory, blush, champagne and sage with autumn accents. No text, no logos, no people. » Max **9 DECOR uniques** par vidéo (un même `asset` peut resservir).
- **SCREEN** : `{"kind":"SCREEN","asset":"S04","note":"ce qui se passe"}` — **uniquement** les écrans du catalogue ci-dessous. Ce sont de vraies captures (données de démo ; couple fictif Léa & Adam sur la démo publique).
- **CARD** : `{"kind":"CARD","card":{"type":"number|title|checklist|quote|entry","n":1,"text":"…","sub":"…","items":["…"]}}` — cartes de marque typographiques. `number` (grand chiffre + titre + sous-titre), `title` (phrase-clé), `checklist` (≤ 4 items courts, beat ≥ 3,5 s), `quote` (le message à copier ; ≤ 18 mots), `entry` (page de carnet : n, titre, sous = « Ten weeks to go »). 4–8 cartes par vidéo. Les chiffres sourcés s'affichent en `overlay` (« Source: … »).
- **overlay** : texte écran optionnel du beat, ≤ 8 mots (Bodoni italique en haut). Le beat 1 a toujours un overlay = l'accroche.
- Alterne les types ; jamais plus de 2 beats consécutifs du même type.

**Catalogue SCREEN (vraies captures, 9:16)**
| ID | Contenu | Statut |
|---|---|---|
| S01 | Démo publique : l'enveloppe « The Seal » avec le sceau L&A s'ouvre et révèle l'invitation | capturé |
| S03 | Page d'invitation : noms, compte à rebours, date et lieu (défilement) | capturé |
| S04 | Réponse de l'invité : I'll be there / Maybe / I can't make it → plus-ones, besoins alimentaires, note → Send → confettis « Thank you, your reply is saved » | capturé |
| S05 | Page d'accueil `/en` (héros) | optionnel |
| S06 | Tableau de bord de l'événement : compteurs confirmed / pending / maybe / declined | à capturer |
| S07 | Liste d'invités avec statuts, formulaire d'ajout, export CSV | à capturer |
| S08 | Plan de table : glisser les invités sur les tables, Auto-seat, vue plan, impression | à capturer |
| S09 | Check-in : scanner du téléphone / saisie du code, message de bienvenue, annulation 30 s, file « check-ins pending sync » hors ligne | à capturer |
| S10 | Galerie : l'invité envoie ses photos ; le couple approuve/rejette | à capturer |
| S11 | Planner (thème sombre) : cockpit multi-mariages, jauges de quotas | à capturer |
| S12 | Planner (thème sombre) : CRM kanban Lead → Contacted → Quote → Booked → In progress → Delivered | à capturer |
Chaque capture porte la mention « données de démo » ; ne décris jamais de vrais noms d'invités.

## 7. Légende, hashtags, commentaire épinglé
- `caption` (≤ 400 car., SANS hashtags) : 1ʳᵉ ligne = l'expression de recherche exacte (r1a §2.3 : ex. « guests not RSVPing wedding », « wedding RSVP wording ») ; 2ᵉ phrase = la valeur ; dernière ligne = « Hosted by Norah, an AI character created by the Wedillybird team. » Série NOTEBOOK : ajouter avant « Fiction: Norah and the couple are invented. The tips are real. »
- `hashtags` : **exactement 5** (r1a §1.3) : 1 audience large (#weddingplanning | #bridetobe | #engaged | #weddingtok — max 1) ; 2 sujets (niche/mid : #rsvp #weddingguestlist #weddinginvitations #weddingtimeline #budgetwedding…) ; 1 saison/cohorte (#fallwedding #winterwedding #winterweddinginspo #weddingtrends) ; 1 longue traîne (#2027bride #weddingguestlisttips #weddingtodolist #weddingtimelinetips). Jamais #fyp #viral #foryou ; jamais #weddybird ; pas deux jours de suite le même jeu complet.
- `keywords` : 2–4 expressions de recherche dites dans la voix off.
- `pinned_comment` : pour CPS = les textes complets à copier ; pour QL = la liste résumée ; toujours terminer par « Norah is AI-generated. » (+ « Screens shown are real Wedillybird screens (demo data). » si SCREEN).
- `comment_bait` : une question qui appelle une réponse concrète (« Which of these did you almost forget? »).
- `search_intent` : la phrase tapée par un couple.

## 8. Bible du journal « Norah's Notebook » (fiction — ne dévie pas)
Couple inventé : **Mara & Eli** (Norah les aide à organiser leur mariage d'hiver ; elle les connaît, mais n'est pas planner). Mariage : un samedi de janvier, dans une orangerie de campagne, à la fin de l'après-midi d'hiver. Les nombres de l'histoire (« four tabs », « six people ») sont fictifs et jamais présentés comme des résultats. Objets récurrents : carnet sauge, stylo qui **barre le problème résolu et écrit le suivant** (cliffhanger), lampe de bureau, thé, « Dear notebook: ». Format : beat 1 = accroche d'entrée ; beat 2 = « Norah's Notebook, entry N. The story is fiction. The fix is real. » ; puis rappel d'une phrase du précédent (« Last time: … ») ; le problème → l'escalade → la solution pratique **utile hors histoire** (r2) → mini-résolution → cliffhanger exact de l'entrée suivante (ci-dessous). Les entrées 01–02 n'évoquent **aucun** outil ; le produit n'apparaît qu'à partir de l'entrée 03, au plus 12–14 s, décrit au présent comme un outil neutre (« Wedillybird shows… »), jamais en avis de Norah.
| Entrée | Titre (jusqu'au mariage) | Leçon autonome | Produit (≤ 14 s) | Cliffhanger |
|---|---|---|---|---|
| 01 | The Spreadsheet (10 sem.) | une seule source de vérité ; les cinq colonnes d'une liste | aucun | « Overnight the count changed. » |
| 02 | The Group Chat (9) | un seul chemin de réponse, une seule date limite | aucun | « A maybe arrives with a heart emoji. » |
| 03 | The Maybe (8) | traiter les « maybe » : date limite + script de relance | S04, S06 | « A reply for six. The invitation said four. » |
| 04 | The Plus-One (6) | règle des plus-ones et formulation | S04 | « A name nobody invited. » |
| 05 | The Stranger on the List (5) | auditer une liste (doublons, fautes) | S07 | « The caterer needs the final number by Friday. » |
| 06 | Table Nine (3) | verrouiller le décompte ; besoins alimentaires | S07 (CSV) | « The seating plan is due, and Table Nine has a problem. » |
| 07 | The Front Door (1) | plan d'arrivée à la porte | S09 | « The venue Wi-Fi dies. » |
| 08 | No Signal (2 jours) | plan hors ligne + liste de secours | S09 hors ligne (remplaçable) | « Guests arrive early. » |
| 09 | Golden Hour (jour J) | tampons, coucher du soleil d'hiver, shot list | aucun | « Everyone is taking photos. Where do they go? » |
| 10 | The Photos (J+1) | récupérer les photos des invités | S10 | Clôture : « Season one done. Follow for what's next. » |

## 9. JSON par vidéo — un fichier `D{jj}-{A|B}.json` (ex. `D03-B.json`), JSON valide strict
```json
{
  "id": "D04-B", "day": 4, "slot": "B", "series": "NOTEBOOK", "episode": 3, "fiction": true,
  "pillar": "RSVP clarity", "look": "L2", "hook_id": "H31",
  "working_title": "…", "search_intent": "how to handle maybe rsvp wedding",
  "hook": {"spoken": "Entry three. A maybe arrived with a heart emoji.", "on_screen": "Entry 03", "visual": "entry card"},
  "voiceover": "texte complet exact pour la TTS = concaténation exacte (séparée par un espace) des beats[].vo",
  "word_count": 271,
  "beats": [
    {"n": 1, "vo": "Entry three. A maybe arrived with a heart emoji.", "overlay": "Entry 03",
     "visual": {"kind": "CARD", "card": {"type": "entry", "n": 3, "text": "The Maybe", "sub": "Eight weeks to go"}}},
    {"n": 2, "vo": "…", "visual": {"kind": "NORAH", "asset": "L2-S3", "crop": "tight", "focus": "hands", "note": "pen over the notebook"}}
  ],
  "cta": "…", "next_teaser": "…",
  "caption": "…", "hashtags": ["#…", "#…", "#…", "#…", "#…"], "keywords": ["…"],
  "pinned_comment": "…", "comment_bait": "…",
  "r2_items": ["T31", "T30"],
  "sources": [{"fact": "…", "publisher": "…", "title": "…", "url": "…", "date": "…", "r2_id": "T31"}],
  "claims_review": {"numbers_used": [{"figure": "seventy-five percent", "source": "Zola, 2025 survey of 720 couples", "r2_id": "T15"}], "needs_proof": [], "notes": "…"},
  "ai_disclosure": true
}
```
`sources` : une entrée par fait utilisé (reprends publisher/url/date de r2 — jamais d'URL inventée). Si un fait n'est pas dans r2, ne l'utilise pas.

## 10. Avant de rendre
1. Valide : `python3 production/validate_scripts.py scripts --glob "<tes fichiers>"` (zéro ERROR ; réduis les WARN utiles : beats trop longs, plus de deux beats consécutifs du même type, plus de 9 DECOR).
2. Relis à voix haute chaque script : coupe toute phrase qui trébuche. Vérifie qu'aucun script n'en répète un autre et qu'aucun fait ne dépasse r2/r3.
3. Réponds par ≤ 250 mots : fichiers écrits, écarts au brief (sujet remplacé, élément r2 indisponible, écran remplaçable), 3 points que tu voudrais que le fondateur relise.
