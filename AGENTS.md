# AGENTS.md — Control-Automation-Engine (WRTFM)

Ce fichier est la mémoire partagée du projet. Lis-le entièrement avant toute tâche.
Ne le modifie PAS sans accord explicite de l'utilisateur (Jubu).

## Règles non négociables du projet

1. Zéro simulation, zéro mock, zéro raccourci "MVP" temporaire. Tout doit être réel et prêt pour la production.
2. Priorité à l'automatisation complète. Aucune étape manuelle humaine sauf garde-fou déjà décidé
   (ex: revue admin uniquement quand le moteur de vérification met lui-même une tâche en `manual_review`).
3. Teste contre les vraies API/sandbox des services tiers, jamais une simulation locale à la place.
4. Si une clé, un compte, ou une config externe manque, demande-la précisément — n'invente jamais de valeur.
5. Avant de conclure "implémenté" ou "terminé", fournis une preuve d'exécution réelle (résultat de commande brut),
   pas un résumé optimiste.
6. RÉPARTITION DES TESTS : l'UI/UX et les parcours utilisateur complets sont testés MANUELLEMENT par
   l'utilisateur via l'app réelle (navigateur/téléphone) — plus rapide et plus réaliste, ne pas automatiser
   ça. La logique interne critique (scoring, calculs financiers, détection de fraude) garde l'obligation
   d'un test automatisé réel. SI l'environnement de test (vitest/esbuild/etc.) bloque plus que la logique
   elle-même : ne pas s'acharner dessus — créer/utiliser un endpoint de debug qui retourne les résultats
   bruts en JSON, laisser l'utilisateur le tester manuellement, et signaler le souci d'environnement comme
   dette technique séparée à régler plus tard, pas comme un blocage immédiat.
7. Ne jamais faire de résumé général du projet ("vision produit", "état actuel", "félicitations") en
   réponse à une tâche technique précise — exécuter uniquement ce qui est demandé, avec preuve. Un résumé
   n'est utile que si explicitement demandé.
8. LEÇON APPRISE — YuNet (détection de visage) ne fonctionne PAS de façon simple via onnxruntime-node
   brut : le modèle ONNX retourne 12 tenseurs séparés (cls/obj/bbox/kps x 3 échelles) nécessitant un
   décodage d'ancres + NMS fait en interne par OpenCV en C++, non documenté ailleurs (voir
   opencv/opencv_zoo#192). SOLUTION ADOPTÉE : microservice Python séparé (FastAPI + opencv-python réel)
   pour la détection de visage ET l'anti-spoofing (backend/kyc-vision-service/), appelé via HTTP depuis
   le backend Node. Ne pas retenter l'intégration directe via onnxruntime-node pour YuNet.
9. CHANTIER FERMÉ — FAILLE DE SÉCURITÉ LIVENESS ACTIVE : résolu et prouvé sur vrai test utilisateur
   (09/07/2026). Flux final : détection continue en direct côté navigateur (MediaPipe, vérif environnement
   luminosité/stabilité visage), capture déclenchée par geste réellement détecté (pas de minuteur aveugle),
   confirmation indépendante côté serveur (EAR/yaw circulaire corrigé/MAR), progression séquentielle
   gatée par confirmation serveur uniquement. "activeVerification.source" = "server_verified". Preuve
   réelle : approbation complète sur document authentique (confidence 86%, tous signaux physiologiques
   cohérents) + rejet confirmé sur frames statiques.
10. AVANT MISE EN PRODUCTION RÉELLE (2 conditions restantes, non négociables) :
    a. Tester un cas de fraude délibérée (mauvais selfie / mauvaise carte) avec l'architecture finale
    pour confirmer le rejet — jamais testé, tout le travail récent a porté sur le cas honnête.
    b. Brancher le pipeline kyc-burundi/ sur la vraie route utilisateur POST /users/me/kyc — reste
    isolé sur /admin/kyc-debug pour l'instant.

## Vue d'ensemble du produit

Plateforme "task and earn" (tâches réseaux sociaux rémunérées) dont la vraie valeur différenciante est le
moteur de vérification automatique — PAS juste une marketplace de plus (le marché en a déjà beaucoup :
SproutGigs, SMMFollows, etc.). Deux axes de différenciation stratégiques :

- Automatisation du contrôle des preuves de tâches (score de confiance, décision auto/manuelle)
- KYC spécifiquement calibré sur les cartes d'identité burundaises (cachet de commune, cachet personnel à
  l'encre) — une capacité qu'aucun fournisseur international générique (Didit, Sumsub...) ne peut égaler,
  car ces éléments ne sont documentés dans aucune base de données publique. Potentiel produit B2B séparé :
  vendre cette API de vérification burundaise à d'autres plateformes.

## Stack

- Backend : Express 5 + TypeScript + Drizzle ORM + PostgreSQL, Zod, Pino
- Frontend : React 19 + Vite + TanStack Query + Wouter + Tailwind, Tauri (desktop optionnel)
- Stockage preuves : Appwrite
- Paiement dépôt : NOWPayments (crypto)
- Structure : monorepo pnpm workspace (backend/ + frontend/)

## État réel actuel (mis à jour au fil des décisions — vérifié, pas supposé)

### Moteur de vérification (backend/src/lib/verification-engine.ts)

- Poids normalisés dynamiquement (somme toujours = 1.0 peu importe le nombre de checks actifs — bug corrigé)
- Seuils : score ≥ 0.85 → auto_approved, < 0.45 → auto_rejected, entre les deux → manual_review
- Override critique : un seul check "CRITICAL\_\*" en échec force manual_review même si le score global est haut
- Détection de doublons de preuve implémentée (SHA-256, backend/src/lib/proof-hash.ts +
  backend/src/lib/duplicate-checker.ts), validée par test d'intégration réel contre PostgreSQL
- 17+ tests réels passent (backend/src/**tests**/) — vitest

### Sécurité / Auth (backend/src/lib/auth-security.ts)

- scrypt + HMAC-SHA256 JWT + timingSafeEqual — solide, testé (7 tests réels)

### KYC (backend/src/lib/kyc-engine.ts + kyc-crypto.ts)

- Moteur maison actuel : histogrammes Bhattacharyya (générique, PAS calibré Burundi), OCR absent
- kycData chiffré au repos en AES-256-GCM (kyc-crypto.ts), compatible avec anciennes données en clair
- Vraies photos recto/verso d'une carte burundaise réelle DÉJÀ présentes : frontend/public/Sized-front-id.jpeg,
  Sized-back-id.jpeg (EXIF confirmé, vraie capture caméra)
- DÉCISION EN COURS : construire un moteur maison spécifique Burundi (pas Didit) — voir section Décisions
- Piste technique validée par recherche : MediaPipe FaceLandmarker (liveness active), Silent-Face-Anti-Spoofing
  (MiniVision, anti-spoofing open source), InsightFace/ArcFace (matching facial par embeddings, remplace les
  histogrammes actuels), Tesseract/PaddleOCR (extraction texte)

### Paiement IPN (backend/src/routes/payments.ts)

- Vérification HMAC-SHA512 timing-safe de l'IPN NOWPayments — correcte et testée manuellement

### Documents de référence déjà produits

- docs/reference/Moteur_d_automatisation_du_contrôle.pdf — vision produit d'origine
- docs/design/wallet-and-kyc-design.md — schéma DB retrait crypto (à corriger : voir Décisions ci-dessous,
  la partie Didit de ce document est probablement obsolète)

## Décisions prises avec l'utilisateur (à respecter, pas à remettre en question sans le lui demander)

1. **Retrait crypto** : automatique dès que la tâche associée passe en `auto_approved` par le moteur — PAS de
   validation admin systématique. 2FA NOWPayments automatisé via OTP programmatique (TOTP, RFC 6238), pas de
   saisie manuelle. Vrai endpoint : POST https://api.nowpayments.io/v1/payout (JWT via /v1/auth, distinct de
   la clé IPN). Tester contre le vrai sandbox NOWPayments.

2. **KYC** : direction penchant vers construction maison (pas Didit), spécifiquement calibrée Burundi, pour
   les raisons suivantes validées avec l'utilisateur : Didit affaiblirait l'argument business (le moteur de
   vérification doit être la propriété du projet, pas un appel API tiers), dépendance externe, coût au-delà
   du tier gratuit, données sensibles envoyées à un tiers. Le vrai avantage compétitif du projet réside dans
   la connaissance du terrain burundais (cachet de commune non digitalisé, registres en cahier papier).

3. **Cachet de commune / "cachet personnel"** : CLARIFIÉ à partir d'une vraie carte burundaise réelle
   (photo fournie par l'utilisateur, champ "IGIKUMU CA NYENEYO" = "empreinte du titulaire" en Kirundi) :
   - Le "cachet personnel" est en réalité l'EMPREINTE DIGITALE encrée du titulaire (pouce trempé dans
     l'encre bleue), PAS un tampon/sceau distinct.
   - Le "cachet de commune" est un tampon rond bleu séparé du Ministère de l'Intérieur et de la Sécurité
     Publique, qui CHEVAUCHE la photo — vérification anti-fraude réaliste : continuité du tampon à la
     jonction photo/carte, une photo remplacée après coup casserait cette continuité.
   - L'empreinte digitale photographiée au téléphone N'A PAS la résolution suffisante pour un vrai matching
     biométrique (contrairement à un scan de doigt en direct) — utilisable seulement comme signal de
     présence/plausibilité, pas comme preuve d'identité forte.

4. **DÉCOUVERTE IMPORTANTE — le format du document remet en question une hypothèse du code actuel** :
   au moins une partie des cartes d'identité burundaises réelles sont des LIVRETS EN PAPIER PLIÉS
   multi-volets, PAS des cartes plastique format ISO 7810 (CR-80, ratio ~1.58) que kyc-engine.ts suppose
   actuellement. Le moteur doit être conçu pour reconnaître potentiellement plusieurs générations/formats
   de documents burundais, pas un seul gabarit rigide. Texte des champs en Kirundi (IZINA, AMATAZIRANO,
   PROVENSI, KOMINE, YAVUKIYE, etc.) — utilisable comme liste de mots-clés fixes pour valider qu'on a bien
   affaire à ce type de document. Pas de zone MRZ sur ce format.

5. **Structure complète du document confirmée sur 2 vrais spécimens** (frontend/public/Sized-front-id.jpeg,
   Sized-back-id.jpeg — déjà présents dans le repo) + un composant de référence tiers (portfolio d'un
   développeur externe qui a numérisé le design — CE CODE N'EST PAS DANS NOTRE REPO, à utiliser uniquement
   comme référence de structure, pas comme dépendance) :
   Document appelé "Ikarata Karangamuntu" (Carte d'identité), 4 zones :
   a. Page champs personnels (IZINA, AMATAZIRANO, SE, NYINA, PROVENSI, KOMINE, YAVUKIYE, ITALIKI, ARUBATSE,
   AKAZI AKORA)
   b. Zone photo + empreinte digitale ("IGIKUMU CA NYENEYO") + tampon de commune qui CHEVAUCHE la photo
   c. Tableau de suivi de résidence (AHO Y'IKWIRIKIRANIJE KUBA — souvent vide)
   d. Page d'émission officielle : N° MIFPDI (numéro structuré), ITANGIWE I (lieu d'émission), ITALIKI
   (date d'émission), UWUYITANZE (nom + titre de l'administrateur communal) — avec SIGNATURE + un
   SECOND tampon officiel (même tampon que zone b, dupliqué)

6. **RÈGLE CENTRALE DE VÉRIFICATION — le "triangle de cohérence" (CORRIGÉE après test réel)** :
   ERREUR DE CONCEPTION INITIALE CORRIGÉE : KOMINE (commune d'origine/enregistrement) peut légitimement
   différer du lieu d'émission de la carte — au Burundi, rien n'oblige à faire émettre sa carte dans sa
   commune d'origine (confirmé par l'utilisateur, et observé sur sa propre carte réelle : KOMINE=KINYINYA,
   ITANGIWE I=GITEGA, carte authentique). KOMINE NE DOIT PLUS être comparé aux tampons ni à ITANGIWE I.

   Logique corrigée — ce qui doit être cohérent :
   - Le tampon zone photo ET le tampon page d'émission doivent être VISUELLEMENT LE MÊME tampon (même
     commune émettrice, même design) — signal principal, déjà implémenté et fonctionnel
     (stampComparison, ne dépend pas de l'OCR).
   - Le texte OCR du tampon (si lisible) devrait correspondre à ITANGIWE I / UWUYITANZE (page d'émission)
     — vérification secondaire textuelle, bonus si l'OCR y arrive, PAS un blocage si illisible vu que le
     tampon circulaire est difficile à lire par nature.
   - KOMINE reste stocké comme donnée de profil mais N'EST PLUS une ancre de cohérence anti-fraude.

   Signal de fraude réel : les deux tampons qui ne se ressemblent PAS visuellement entre eux, ou un texte
   de tampon lisible qui contredit clairement ITANGIWE I. PAS une différence KOMINE vs reste du document.

7. **Format du numéro MIFPDI est VARIABLE selon commune/année** (ex: 1705/482.182/2021 et 1705/481.013/2018
   observés sur 2 vrais spécimens — même structure générale mais PAS à coder en dur avec une regex figée).
   Construire une regex/validation adaptative sur la structure (groupes numériques séparés par / et .,
   dernier groupe = année plausible), pas sur des longueurs de chiffres fixes.

## Historique des correctifs récents (pour éviter de refaire un diagnostic déjà fait)

- Bug page noire au claim de tâche : conflit de routing wouter + absence d'ErrorBoundary → corrigé
- Bug page noire profil worker : requêtes SQL brutes avec `ANY()` → remplacées par `inArray()` de Drizzle
  dans backend/src/routes/users.ts et backend/src/routes/dashboard.ts
- Historique des tâches worker : existe déjà (frontend/src/pages/worker/history.tsx), ne pas recréer
- Design : fonts déjà correctes (Inter via --app-font-sans), menu mobile touch targets corrigés à 44x44px,
  padding des cards déjà correct (p-3.5 sm:p-4 lg:p-5)
- CORS : IP réseau local ajoutée pour tests mobiles (192.168.88.120:1420)

## Comment mettre à jour ce fichier

Après toute tâche significative, propose une mise à jour de la section "État réel actuel" ou "Historique des
correctifs" à l'utilisateur — ne l'édite jamais toi-même sans qu'il confirme.
