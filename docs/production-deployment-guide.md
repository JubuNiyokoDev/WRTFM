# Guide de Déploiement en Production - WRTFM

Ce guide vous accompagne étape par étape pour déployer l'application **Worldwide Rapid Task For Money (WRTFM)** en production à l'aide de Docker et de la configuration durcie.

---

## Décision de déploiement

Déployer maintenant en **staging public** sur `https://wrtfm.work.gd` est utile pour tester les callbacks réels
NOWPayments, la caméra mobile HTTPS et Appwrite self-hosted. Ne pas annoncer comme production commerciale tant que
les payouts NOWPayments n'ont pas été validés avec un petit retrait réel.

DNS actuel attendu :

- `wrtfm.work.gd` A record -> `143.105.213.167`
- `www.wrtfm.work.gd` CNAME -> `wrtfm.work.gd`

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
docker compose exec backend pnpm --dir /app/backend db:push
```

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

### Exemple de configuration Nginx hôte (`/etc/nginx/sites-available/wrtfm`) :

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
