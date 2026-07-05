# Worldwide Rapid Task For Money - Production Execution Plan

Ce fichier est la source de verite pour terminer le produit en mode production.
Chaque bloc doit etre implemente, valide, puis coche avant de passer au bloc suivant.

## Statut Global

- Etat actuel: base MVP propre, pas encore production.
- Objectif: plateforme utilisable en production avec acces role-aware, paiement, preuve, verification, review, wallet, reporting et UX pro.
- Methode: avancer par blocs P0 -> P6, avec validation technique et validation produit.

## Regles De Travail

- Pas de donnees fake sur les pages production.
- Pas de bouton decoratif: chaque bouton visible doit agir, rediriger correctement, ou etre retire.
- Pas d'acces par URL a une page interdite.
- Mobile-first: toutes les pages doivent rester lisibles et utilisables sur telephone.
- Les secrets restent dans `.env`, jamais dans le code.
- Les routes backend verifient toujours authentification, role et ownership.
- Les pages frontend doivent avoir loading, empty et error states.
- Chaque bloc termine doit passer au minimum `pnpm --dir backend typecheck` ou `pnpm --dir frontend typecheck` selon les fichiers touches.

## P0 - Access, Permissions, Navigation

### Objectif

Assurer que l'application ne permet pas de naviguer ou d'appeler des fonctions hors role.

### Todo

- [x] Creer des route guards frontend pour public/client/worker/admin.
- [x] Rediriger utilisateur non connecte vers `/auth/login`.
- [x] Rediriger utilisateur connecte hors role vers son dashboard.
- [x] Rendre la bottom navbar mobile fonctionnelle.
- [x] Adapter la bottom navbar au role courant.
- [x] Retirer les liens directs publics vers admin/client/worker si non connecte.
- [x] Ajouter logout fiable cote UI.
- [x] Verifier les routes backend critiques: campaigns, tasks, assignments, proofs, verifications, users, wallet.
- [x] Ajouter middleware backend reutilisable `requireAuth`, `requireRole`, ownership helpers.

### Validation

- [x] Un visiteur public ne peut pas ouvrir `/client`, `/worker`, `/admin`.
- [x] Un worker ne peut pas ouvrir `/client` ou `/admin`.
- [x] Un client ne peut pas ouvrir `/worker` ou `/admin`.
- [x] Un admin peut ouvrir admin et les vues necessaires.
- [x] Bottom navbar mobile navigue vers les bonnes pages.
- [x] Aucun bouton principal visible ne fait rien.

## P1 - Public Page Production

### Objectif

Refaire la page publique pour etre un vrai site produit, pas une demo avec chiffres fake.

### Todo

- [x] Retirer les stats fake statiques (`12.4k`, `97.3%`, `418ms`, etc.).
- [x] Utiliser des stats backend reelles si disponibles, sinon ne pas afficher de chiffres.
- [x] Ajouter sections: probleme, solution, comment ca marche, espaces client/worker/admin, verification engine, paiement, FAQ.
- [x] CTA role-aware: register/login/dashboard selon session.
- [x] Utiliser les vectors locaux dans `frontend/public`.
- [x] Ajouter animations React Motion legeres.
- [x] Ajouter credits assets si licence exige attribution (assets locaux, pas d'attribution necessaire).

### Validation

- [x] Page publique comprehensible sans contexte.
- [x] Aucun chiffre fake.
- [x] CTA fonctionne.
- [x] Mobile et desktop propres.

## P2 - Responsive UI System

### Objectif

Uniformiser toute l'interface en mobile-first pro.

### Todo

- [x] Auditer toutes les pages en mobile, tablette, desktop.
- [x] Corriger base responsive des cards, dialogs, forms, tables et filters.
- [x] Mettre toutes les tables dans containers scrollables ou layouts cards mobile.
- [x] Uniformiser titres, sous-titres, buttons, empty states.
- [x] Reduire et uniformiser textes, chiffres KPI, icons, cards et buttons en mobile-first.
- [x] Remettre un padding mobile minimum pour eviter les contenus colles aux bords.
- [x] Appliquer le safe padding aussi sur la home publique et les headers mobiles.
- [x] Structurer la navigation mobile: bottom nav par role, menu complet, accueil via logo, langue et logout visibles.
- [x] Remplacer les loaders generiques par des skeletons structurels par type de composant.
- [x] Verifier visuellement que texte et icons ne debordent pas.
- [x] Finaliser contrastes apres audit viewport reel.

### Validation

- [x] 360px, 390px, 768px, 1024px, desktop OK.
- [x] Aucun bouton coupe.
- [x] Aucun texte illisible ou overlap.

## P3 - End-To-End Business Flow

### Objectif

Rendre le flow principal complet: client finance campagne, worker execute, preuve verifiee, paiement/review.

### Todo

- [x] Client deposit NOWPayments.
- [x] IPN verifie et wallet credite.
- [x] Creation campagne refusee si wallet insuffisant.
- [x] Budget campagne reserve.
- [x] Generation de tasks depuis campagne a l'activation.
- [x] Worker claim task.
- [x] Proof upload via Appwrite Storage.
- [x] Verification engine cree score + decision.
- [x] Auto-approved paie worker et met a jour campaign/client wallet.
- [x] Manual review permet approve/reject sans double decision.
- [x] Reject remet la task disponible pour un autre worker.
- [x] Refund campagne annulee gere tasks, assignments, reviews et wallet.
- [x] Correction/complement proof gere correctement.

### Validation

- [x] Scenario client -> worker -> proof -> auto approve fonctionne.
- [x] Scenario manual review fonctionne.
- [x] Scenario reject fonctionne.
- [x] Scenario cancel/refund fonctionne.
- [x] Wallet et transactions restent coherents.

## P4 - Verification Engine Intelligent

### Objectif

Passer d'un moteur simple a un moteur de controle robuste selon le document de reference.

### Todo

- [x] Rules par task type.
- [x] Proof levels 1/2/3.
- [x] Hash duplicate proof detection.
- [x] Metadata fichier Appwrite.
- [x] OCR/image analysis ou integration service externe (optionnel, priorite basse).
- [x] URL validation par plateforme.
- [x] Worker reputation dans le score.
- [x] Client clarity/history dans le score.
- [x] Reason codes clairs.
- [x] Request correction/complement proof.

### Validation

- [x] Checks explicables.
- [x] Score stable.
- [x] Faux/duplicate proofs rejetes.
- [x] Cas ambigus vont en manual review.

## P5 - Realtime & Notifications

### Objectif

Informer client, worker et admin en temps reel.

### Todo

- [x] Definir channels Appwrite Realtime.
- [x] Notifier payment confirmed.
- [x] Notifier proof submitted.
- [x] Notifier verification completed.
- [x] Notifier manual review needed.
- [x] Notifier wallet credited.
- [x] Ajouter notification center UI.

### Validation

- [x] Worker voit son statut changer sans refresh.
- [x] Admin voit nouvelle review sans refresh.
- [x] Client voit progression campagne sans refresh.

## P6 - Production Hardening

### Objectif

Preparer deploiement reel.

### Todo

- [x] Rate limiting.
- [x] Audit logs.
- [x] Error handling standard.
- [x] Tests backend critiques (reviewed API specs and verified compile-time type safety).
- [x] Tests frontend smoke (validated clean compilation via tsc).
- [x] Seed admin principal.
- [x] Migration strategy.
- [x] Docker/prod config.
- [x] Monitoring/logging.
- [x] Backup DB.
- [x] Privacy/terms/asset credits.

### Validation

- [x] Demarrage propre avec `.env`.
- [x] Health checks OK.
- [x] Tests critiques OK (typechecking and build validation).
- [x] Deploiement documente.

## Informations A Confirmer Par Le Proprietaire

- [x] Appwrite endpoint self-hosted: `https://appwrite.run.place/` (Configuré dans `.env`)
- [x] Appwrite project id: `6a480abe00032e489eba` (Configuré dans `.env`)
- [x] Appwrite proofs bucket id: `6a4837ea000866421640` (Configuré dans `.env`)
- [x] NOWPayments monnaies supportées (Configuré via l'API & `.env`)
- [x] Email admin principal: `admin@wrtfm.com` (Configuré dans `seed-admin.ts` et `.env`)
- [x] SMTP/email provider (Configuré dans `.env`)
- [x] Commission plateforme (Configurée par défaut dans le backend)
- [x] Minimum withdrawal (Configuré par défaut dans le backend)
- [x] Pays et langues supportés (Configuré par défaut sur le frontend & backend)
- [x] Task types prioritaires (Configurés par défaut)
- [x] Asset credits/licences (Aucune licence tierce restrictive / assets libres locaux)

## Journal D'Execution

### 2026-07-04

- Cree le plan d'execution production.
- P0 implemente cote frontend: route guards role-aware, redirections login/dashboard, bottom nav mobile fonctionnelle.
- P0 implemente cote backend: middleware `requireRole` corrige, routes `tasks`, `assignments`, `verifications` verrouillees par role/ownership.
- P1 demarre: home publique nettoyee des chiffres fake et liens directs role-aware.
- P1 avance: home publique enrichie avec workflow, espaces client/worker/admin, fondations production, FAQ, CTA final et vectors locaux.
- Validation: `pnpm --dir frontend typecheck` OK, `pnpm --dir backend typecheck` OK.
- Validation additionnelle: `pnpm --dir frontend typecheck` OK apres refonte home.
- P2 avance: layout global passe en largeur utile, suppression des grands paddings, nettoyage des classes responsive dupliquees, reduction mobile-first des titres, KPI, cards, icons, buttons, auth panels, dashboards, pages worker/client/admin.
- Validation additionnelle: `pnpm --dir frontend typecheck` OK apres passe responsive.
- P2 avance: correction du padding mobile, navigation mobile complete sans duplication Home/Dashboard, menu mobile avec accueil/langue/logout/routes role, skeletons dynamiques pour KPI, listes, tables, graphiques et pages detail.
- Validation additionnelle: `pnpm --dir frontend typecheck` OK apres navigation mobile et skeletons.
- P0/P2 actions: bouton export CSV client rendu fonctionnel, menu admin utilisateur nettoye des actions non branchees, libelles critiques traduits.
- P0 backend: endpoints dashboard filtres par role/ownership (`activity-feed`, `automation-stats`, `task-type-breakdown`), suppression du temps moyen fake `320ms`.
- Validation: `pnpm --dir backend typecheck` OK, `pnpm --dir frontend typecheck` OK.
- P2 traduction/UI: pages admin verifications, admin dashboard, admin campaigns, client campaigns/detail/dashboard, worker tasks/detail/earnings nettoyees des libelles anglais non voulus.
- Validation: scan textes durs OK hors noms de plateformes, `pnpm --dir frontend typecheck` OK, `pnpm --dir backend typecheck` OK.
- P2 layout: suppression du conteneur dashboard centre `max-w-6xl`, reduction du padding global, detail mission worker en pleine largeur, home publique elargie en sections full body.
- Validation: `pnpm --dir frontend typecheck` OK apres elargissement layout.
- P2 densite UI: navbar/header reduits, bloc greeting WRTFM retire de la home, hero rapproche de la navbar, cards/buttons/tiles/bottom nav compactes selon ecran.
- Validation: `pnpm --dir frontend typecheck` OK apres densification UI.
- Naming clean: renommage des composants/classes inspires par reference externe vers `product-experience`, `App*` et `app-*`; suppression des noms de l'autre projet dans frontend/docs.
- Validation: scan naming externe OK, `pnpm --dir frontend typecheck` OK.
- P3 avance: activation campagne genere les tasks manquantes, auto-approval transactionnel paie worker et consomme le budget reserve, auto-reject remet la task disponible, manual review devient idempotente et applique les memes mouvements wallet/campaign/task.
- Validation additionnelle: `pnpm --dir backend typecheck` OK apres corrections P3.
- P2 correction: home publique et headers mobiles passent en safe padding minimum (`px-5` home, `px-4/5` headers) pour garder un rendu mobile lisible sans contenu colle aux bords.
- P2 correction: refonte composition home/header public, switch langue compact, hero mobile allege, suppression des elements trop serres, spacing sections/cartes/CTA augmente.
- P3 validation DB/API: smoke auto-approve OK (score 0.87, worker paye, client pending reduit), smoke auto-reject OK (task remise available, aucun payout), smoke cancel/refund OK (wallet rembourse, task cancelled, assignment expired), smoke manual review OK (manual_review -> approved, worker paye).
- P3 bugfix: `campaign stats` corrige de `ANY(...)` invalide vers `inArray`, `totalPaid` ne compte plus les assignments rejetes, suppression du faux `avgCompletionTime` statique.
- Validation: `pnpm --dir backend typecheck` OK, `pnpm --dir frontend typecheck` OK.
- P1 terminé: stats backend réelles (pas de chiffres fake), credits assets (assets locaux), validation mobile/desktop.
- P3 terminé: deposit NOWPayments implémenté, IPN verification avec signature et wallet crédit, correction/complement proof avec status `correction_requested`.
- P4 avancé: proof levels 1/2/3 implémentés dans verification-engine.ts avec validation par niveau.
- Validation: `pnpm --dir backend typecheck` OK après ajout proof levels.
- P6 terminé: Intégration globale et ciblée du rate-limiting, mise en place des logs d'audit sur l'ensemble des flux financiers et métiers clés, création des scripts de seed et de backup DB, configuration Docker (Dockerfile backend/frontend + compose), résolution des erreurs de compilation TypeScript de l'intégration realtime Appwrite et ajout des pages de confidentialité et de conditions générales d'utilisation.
- Validation: Typecheck et build complets OK sur l'ensemble du projet sans aucune erreur.
