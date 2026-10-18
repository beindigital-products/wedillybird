# Norah — bibliothèque de looks & de plans (autumn → winter, France)

Règles non négociables (héritées du projet OpenArt « Wedillybird — social 15 jours »)
- Norah n'apparaît **jamais de face** : de dos, de trois-quarts dos, de profil avec le visage détourné / dans l'ombre / caché par les cheveux ou l'écharpe, en silhouette, ou en plans de mains/corps. Aucun gros plan du visage. Aucune bouche qui parle (la voix est une voix off).
- Identité = élément « character: Norah » du studio (images de référence + description). On ne redécrit jamais ses traits dans les prompts ; on décrit **tenue, lieu, lumière, action, caméra**.
- 9:16, photoréaliste, lumière naturelle, optique 35–50 mm, faible profondeur de champ, léger grain pellicule. Palette : ivoire, blush, champagne, sauge + tons d'automne désaturés (camel, bordeaux, pierre). Aucun texte lisible, aucun logo, aucune marque visible, aucun écran lisible.
- Figurants : seulement de dos, flous ou hors-champ.
- Chaque look = 1 tenue + 1 lieu. Un look sert plusieurs vidéos (bibliothèque de plans réutilisables avec recadrages différents).

## Looks

| id | Nom | Tenue (précise) | Lieu / lumière |
|---|---|---|---|
| L1 | Camel & crème — Paris, matin | manteau long en laine camel, grosse écharpe en maille crème, jean brut foncé, bottines cuir marron, petit cabas en cuir | rue haussmannienne, terrasse de café, feuilles qui tombent, soleil bas doré |
| L2 | Cardigan sauge — bureau | cardigan oversize en maille sauge sur col roulé ivoire, cheveux relevés en chignon lâche, pas de bijou apparent | appartement parisien lumineux, bureau en chêne près d'une fenêtre, laptop, carnet, tasse de café ; lumière latérale douce |
| L3 | Trench pierre & écharpe blush — marché aux fleurs | trench beige pierre, écharpe en laine blush, jean clair, baskets blanches ou bottines | marché aux fleurs en plein air, dahlias, chrysanthèmes, eucalyptus ; matin humide après la pluie |
| L4 | Maille écrue & manteau anthracite — château | pull torsadé écru épais, long manteau en laine anthracite, écharpe grise | jardin d'un château d'automne, allées de gravier, arbres cuivrés, brume légère |
| L5 | Bordeaux — café du soir | col roulé en maille bordeaux, manteau noir posé sur la chaise | café chaleureux au crépuscule, lampes ambrées, bougie, carnet, téléphone (écran jamais lisible) |
| L6 | Manteau noir & écharpe ivoire — Paris, heure bleue | long manteau noir en laine, écharpe ivoire, gants en cuir fin | rue de Paris à l'heure bleue, vitrines éclairées, reflets sur les pavés mouillés |
| L7 | Manteau blush — visite de lieu | manteau en laine rose poudré (couleur de marque), maille crème, tote avec carnet/planche | orangerie / grange / salle de réception avec longues tables nues, lumière d'hiver pâle par les verrières |
| L8 | Cocooning ivoire — maison | pull oversize ivoire, chaussettes épaisses, plaid | salon, canapé, pluie sur la fenêtre, thé fumant, bougie, soirée |
| L9 | Doudoune matelassée sauge — campagne | veste matelassée vert sauge, écharpe moutarde douce, bottes | chemin de campagne / vignes en fin d'automne, brume du matin, domaine viticole |
| L10 | Satin champagne & camel — soirée | jupe satin champagne, haut en maille ivoire, manteau camel sur les épaules | entrée d'un lieu de réception éclairé la nuit, guirlandes chaudes, tapis ; de dos |

## Plans par look (8 plans × 6–8 s) — identifiants `L{n}-S{k}`

| S | Plan | Caméra |
|---|---|---|
| S1 | Elle marche en s'éloignant, plan moyen large | suivi stabilisé à hauteur d'épaule, léger travelling arrière |
| S2 | Par-dessus l'épaule : mains tenant carnet / téléphone (écran sombre ou flou) | plan fixe à l'épaule, mise au point sur les mains |
| S3 | Gros plan mains : action propre au lieu (écrire, remuer un café, choisir des fleurs, feuilleter, tenir une enveloppe) | macro légère, très faible profondeur de champ |
| S4 | Profil en silhouette à contre-jour, visage détourné/ombre | plan fixe, vapeur/poussière dans la lumière |
| S5 | Elle s'arrête et regarde le lieu (de dos, trois-quarts dos) | lent push-in par l'arrière |
| S6 | Assise, de dos / trois-quarts dos, travaille ou réfléchit | dolly latéral très lent |
| S7 | Détail de matière en mouvement : écharpe/manteau dans le vent, bottes dans les feuilles, tissu | plan fixe serré, mouvement naturel |
| S8 | Elle marche vers une porte / un portail / une arche ; la porte s'ouvre sur la lumière | suivi arrière, fin sur la lumière |

Notes de production
- Image clé d'abord (élément Norah + tenue + lieu) → validation visuelle de l'identité → animation 5–8 s.
- Chaque plan peut servir 2–3 fois grâce à des recadrages (plan large → serré) et des inversions de sens.
- Garder une table de cohérence : `look → seed → modèle → image clé validée`.
