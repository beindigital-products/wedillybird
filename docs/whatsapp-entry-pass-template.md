# Gabarit WhatsApp « QR d'entrée » (`wedding_entry_pass`)

Message envoyé par **« Envoyer les QR codes »** (page _Liste d'invitations_ d'un événement) à chaque invité **confirmé**. Il ne contient que le QR d'entrée : **aucun bouton, aucune invitation, aucune demande de réponse** — à l'inverse des gabarits `wedding_invitation_*`.

Tant que ce gabarit n'est pas **créé et approuvé chez Meta**, l'envoi échoue et l'écran l'indique (« Le gabarit WhatsApp « QR d'entrée » n'existe pas encore ou n'est pas validé par Meta »). Rien n'est marqué comme envoyé : on relance le même bouton une fois le gabarit validé.

## À créer dans Meta (WhatsApp Manager → Modèles de messages → Créer)

| Champ          | Valeur                                                                                     |
| -------------- | ------------------------------------------------------------------------------------------ |
| Nom            | `wedding_entry_pass` (ou autre nom, à reporter dans `WHATSAPP_TICKET_TEMPLATE`)            |
| Catégorie      | **Utilitaire** (message transactionnel lié à un événement auquel l'invité a déjà dit oui) |
| Langue         | Français (`fr`)                                                                            |
| En-tête        | **Image** — exemple : n'importe quel QR de test (PNG carré, ex. 640 × 640 px)              |
| Corps          | texte exact ci-dessous, 3 variables                                                        |
| Pied de page   | aucun                                                                                      |
| Boutons        | **aucun**                                                                                  |

### Corps (copie exacte de `TICKET_TEMPLATE.bodyText`, `lib/whatsapp/templates.ts`)

```text
Bonjour {{1}},

voici votre QR code d'entrée pour le mariage de {{2}} le {{3}}.

Présentez-le à l'accueil : il est personnel et ne peut être scanné qu'une seule fois.

À très bientôt !
```

Exemples de variables à fournir à Meta : `{{1}}` = `Aminata`, `{{2}}` = `Daba & Moussa`, `{{3}}` = `19 décembre 2026`.

Toute modification du texte doit être faite **dans le code ET chez Meta** (re-soumission, 24–48 h de validation). Un test (`tests/unit/lib/whatsapp-ticket-template.test.ts`) vérifie que ce document et le code restent identiques.

## Ce que le code envoie

Pour chaque invité : en-tête `image` dont le lien est `https://<domaine>/api/qr/<jeton>` (Meta **télécharge** l'image depuis cette URL), puis le corps avec `{{1}}` prénom, `{{2}}` prénoms du couple, `{{3}}` date.

## Prérequis d'environnement

- `NEXT_PUBLIC_APP_URL` (déploiement **Convex**) : domaine public HTTPS d'où Meta peut télécharger l'image. Sur `localhost`, l'envoi réel ne peut pas fonctionner. Par défaut : `https://wedillybird.com`.
- `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` (déjà requis pour les invitations).
- `WHATSAPP_TICKET_TEMPLATE` (optionnel) : nom du gabarit si différent de `wedding_entry_pass`.
- La route `/api/qr/<jeton>` est publique et exclue du routage de langues (`proxy.ts`) : à vérifier qu'aucun pare-feu / mot de passe de prévisualisation Vercel ne la bloque sur le domaine utilisé.

## Vérifier avant un vrai envoi

1. Ouvrir `https://<domaine>/api/qr/<jeton d'un invité>` dans un navigateur : une image PNG s'affiche.
2. Envoyer à **un seul** invité de test (par ex. importer une liste d'une ligne avec son propre numéro, « déjà confirmé » coché) et vérifier la réception.
3. Tant que le compte WhatsApp Business n'est pas vérifié par Meta, seuls les numéros ajoutés à la liste de test reçoivent des messages (erreur Meta 131030 pour les autres).
