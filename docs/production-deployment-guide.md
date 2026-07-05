# Guide de Déploiement en Production - WRTFM

Ce guide vous accompagne étape par étape pour déployer l'application **Worldwide Rapid Task For Money (WRTFM)** en production à l'aide de Docker et de la configuration durcie.

---

## Étape 1 : Configurer les Secrets de Production (`.env`)

Créez un fichier `.env` à la racine du projet (si ce n'est pas déjà fait) et configurez les clés réelles de production. **N'utilisez jamais les valeurs par défaut ou de test en production.**

### Clés critiques à générer :
1. **`APP_AUTH_SECRET`** : Générez une clé aléatoire forte (ex: `openssl rand -hex 64`).
2. **`NOWPAYMENTS_API_KEY` & `NOWPAYMENTS_IPN_SECRET`** : Vos clés API de production NOWPayments pour les dépôts.
3. **`APPWRITE_API_KEY`** : Votre clé API secrète Appwrite avec les scopes nécessaires (`documents.read`, `documents.write`, `files.read`, `files.write`).

---

## Étape 2 : Lancer l'Infrastructure avec Docker Compose

L'application est entièrement containerisée. Pour compiler les images et démarrer les conteneurs en tâche de fond :

```bash
# 1. Construire les images Docker (backend et frontend)
docker compose build

# 2. Démarrer les services (postgres, backend, frontend) en arrière-plan
docker compose up -d
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
    server_name wrtfm.com www.wrtfm.com;

    location / {
        # Redirige le trafic vers le conteneur frontend de docker-compose
        proxy_pass http://localhost:8080; 
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
sudo certbot --nginx -d wrtfm.com -d www.wrtfm.com
```

Certbot configurera automatiquement la redirection automatique du HTTP vers le HTTPS de manière hautement sécurisée.
