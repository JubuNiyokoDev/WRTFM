# Guide de Déploiement en Production - WRTFM

Ce guide vous accompagne étape par étape pour déployer l'application **Worldwide Rapid Task For Money (WRTFM)** en production à l'aide de Docker et de la configuration durcie.

---

## Décision de déploiement

Déployer maintenant en **staging public** sur `https://wrtfm.work.gd` est utile pour tester les callbacks réels
NOWPayments, la caméra mobile HTTPS et Appwrite self-hosted. Ne pas annoncer comme production commerciale tant que
les payouts NOWPayments n'ont pas été validés avec un petit retrait réel.

Architecture retenue :

- `wrtfm.work.gd` pointe vers le serveur/VPS WRTFM, pas vers Appwrite Sites.
- Nginx sur le VPS sert le frontend Docker sur `127.0.0.1:8080`.
- Nginx envoie `/api/*` vers le backend Docker sur `127.0.0.1:3001`.
- Le backend appelle PostgreSQL et le microservice KYC Python dans le réseau Docker privé.
- Appwrite self-hosted reste le service de stockage privé des preuves KYC et proofs, via
  `APPWRITE_ENDPOINT=https://appwrite.run.place/`.

Pourquoi ne pas mettre le domaine principal sur Appwrite Sites : notre produit n'est pas un site statique.
Il dépend du backend Node, de PostgreSQL, du microservice Python KYC, des IPN NOWPayments et de routes admin
protégées. Appwrite Sites peut servir un frontend séparé, mais ne remplace pas notre VPS applicatif.

DNS attendu :

- `wrtfm.work.gd` A record -> `31.97.33.141`
- `www.wrtfm.work.gd` CNAME -> `wrtfm.work.gd`

Le panneau DNSExit montrait encore une ancienne IP. Il faut remplacer l'A record par `31.97.33.141`, qui est
l'IPv4 publique du VPS connecté en SSH. Le CNAME `www` est correct.

## Étape 1 : Configurer les Secrets de Production/Staging (`.env`)

Créez un fichier `.env` à la racine du projet (si ce n'est pas déjà fait) et configurez les clés réelles de production. **N'utilisez jamais les valeurs par défaut ou de test en production.**

### Clés critiques à générer :
1. **`APP_AUTH_SECRET`** : Générez une clé aléatoire forte (ex: `openssl rand -hex 64`).
2. **`NOWPAYMENTS_API_KEY` & `NOWPAYMENTS_IPN_SECRET`** : Vos clés API de production NOWPayments pour les dépôts.
3. **`APPWRITE_API_KEY`** : Votre clé API secrète Appwrite avec les scopes nécessaires (`documents.read`, `documents.write`, `files.read`, `files.write`).

Variables publiques importantes pour ce domaine :

```env
PUBLIC_API_URL=https://wrtfm.work.gd
CORS_ORIGIN=https://wrtfm.work.gd,https://www.wrtfm.work.gd
NOWPAYMENTS_IPN_URL=https://wrtfm.work.gd/api/payments/nowpayments/ipn
NOWPAYMENTS_PAYOUT_IPN_URL=https://wrtfm.work.gd/api/payments/nowpayments/payout-ipn
APPWRITE_ENDPOINT=https://appwrite.run.place/
KYC_VISION_SERVICE_URL=http://kyc-vision-service:5010
```

Si `NOWPAYMENTS_PAYOUT_IPN_URL` reste vide, le backend construit automatiquement :

```txt
PUBLIC_API_URL + /api/payments/nowpayments/payout-ipn
```

Ne jamais mettre `https://api.nowpayments.io/...` comme IPN URL : l'IPN doit pointer vers notre backend.

Avant de lancer Docker sur le serveur :

```bash
chmod +x scripts/production-preflight.sh
./scripts/production-preflight.sh .env
```

Le preflight bloque les erreurs dangereuses comme :

- `PUBLIC_API_URL` encore sur `localhost`
- IPN NOWPayments pointant vers `api.nowpayments.io` au lieu de notre backend
- URL publique sans HTTPS
- modèles KYC ONNX manquants
- secrets critiques encore en placeholder

---

## Étape 2 : Lancer l'Infrastructure avec Docker Compose

L'application est entièrement containerisée. Pour compiler les images et démarrer les conteneurs en tâche de fond :

```bash
# 1. Construire les images Docker (backend et frontend)
docker compose build

# 2. Démarrer les services (postgres, backend, frontend) en arrière-plan
docker compose up -d
```

Après le démarrage, pousser le schéma DB :

```bash
docker compose --profile tools run --rm db-migrator
```

Le service `db-migrator` utilise l'image de build avec Drizzle, puis disparaît. L'image backend de production
reste légère et ne contient pas les outils de développement.

### Vérifier le statut des conteneurs :
```bash
docker compose ps
```

---

## Étape 3 : Configurer les Sauvegardes Automatiques de la Base de Données

Le script de sauvegarde `backend/src/scripts/backup-db.sh` est déjà prêt. Pour qu'il s'exécute automatiquement toutes les nuits à minuit :

1. Rendez le script exécutable :
   ```bash
   chmod +x backend/src/scripts/backup-db.sh
   ```

2. Ouvrez l'éditeur de tâches cron de votre système :
   ```bash
   crontab -e
   ```

3. Ajoutez la ligne suivante pour exécuter la sauvegarde tous les jours à 00:00 (remplacez `/chemin/vers/votre/projet` par le chemin absolu de votre répertoire) :
   ```cron
   0 0 * * * /chemin/vers/votre/projet/backend/src/scripts/backup-db.sh >> /chemin/vers/votre/projet/backup.log 2>&1
   ```

---

## Étape 4 : Exposer l'Application sur Internet avec HTTPS (Nginx & SSL)

Pour rendre le site accessible via votre nom de domaine (ex: `wrtfm.com`), vous devez configurer un reverse proxy Nginx sur votre serveur hôte et installer un certificat SSL gratuit avec Let's Encrypt (Certbot).

### Configuration Nginx hôte

Le fichier prêt à copier est dans le repo :

```bash
sudo cp deploy/nginx/wrtfm.work.gd.conf /etc/nginx/sites-available/wrtfm
sudo ln -sfn /etc/nginx/sites-available/wrtfm /etc/nginx/sites-enabled/wrtfm
sudo nginx -t
sudo systemctl reload nginx
```

Contenu attendu (`/etc/nginx/sites-available/wrtfm`) :

```nginx
server {
    listen 80;
    server_name wrtfm.work.gd www.wrtfm.work.gd;

    location / {
        # Redirige le trafic vers le conteneur frontend de docker-compose
        proxy_pass http://localhost:8080; 
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /api/ {
        proxy_pass http://localhost:3001/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### Obtenir le certificat SSL HTTPS :
```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d wrtfm.work.gd -d www.wrtfm.work.gd
```

Certbot configurera automatiquement la redirection automatique du HTTP vers le HTTPS de manière hautement sécurisée.

## Étape 5 : Tests obligatoires après staging

```bash
curl -fsS https://wrtfm.work.gd/api/healthz
curl -i https://wrtfm.work.gd/api/payments/nowpayments/payout-ipn
```

Résultat attendu :

- `/api/healthz` retourne `{"status":"ok"}`
- payout IPN sans signature retourne `401`, ce qui prouve que la route existe et reste protégée

Ensuite seulement :

1. Test inscription/login.
2. Test caméra KYC mobile en HTTPS.
3. Test KYC honnête.
4. Test dépôt NOWPayments petit montant.
5. Test retrait NOWPayments petit montant, uniquement après correction de la whitelist IP/2FA dans NOWPayments.

## Étape 6 : Déploiement automatique GitHub Actions

Le workflow manuel `.github/workflows/deploy-staging.yml` déploie sur le VPS via SSH. Ajouter ces secrets dans
GitHub > Settings > Secrets and variables > Actions :

- `STAGING_HOST` : IP publique du VPS, `31.97.33.141`
- `STAGING_USER` : utilisateur SSH du VPS
- `STAGING_SSH_KEY` : clé privée SSH autorisée sur le VPS
- `STAGING_PORT` : optionnel, `22` par défaut
- `STAGING_APP_DIR` : optionnel, `/opt/wrtfm` par défaut
- `STAGING_BRANCH` : optionnel, `main` par défaut

Préparation initiale sur le VPS :

```bash
sudo mkdir -p /opt/wrtfm
sudo chown "$USER":"$USER" /opt/wrtfm
git clone https://github.com/JubuNiyokoDev/WRTFM.git /opt/wrtfm
cd /opt/wrtfm
cp .env.production.example .env
```

Remplir `/opt/wrtfm/.env` avec les vraies valeurs, puis lancer le workflow **Deploy staging** depuis GitHub.

## Étape 7 : Appwrite

Dans Appwrite self-hosted :

1. Garder `APPWRITE_ENDPOINT=https://appwrite.run.place/`.
2. Garder le projet `6a480abe00032e489eba`.
3. Créer/valider un bucket privé pour les preuves KYC et proofs.
4. Utiliser une clé serveur Appwrite avec les scopes de stockage nécessaires.
5. Si une intégration web Appwrite côté navigateur est utilisée plus tard, ajouter `https://wrtfm.work.gd` et
   `https://www.wrtfm.work.gd` comme plateformes/domaines autorisés.
