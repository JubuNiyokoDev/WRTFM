# Document de conception technique : Retrait Crypto & KYC Didit

## Avertissement sur l'accès aux documentations

**LIMITATION D'ACCÈS WEB** : Je n'ai pas pu accéder directement aux documentations API complètes de NOWPayments et Didit via les outils disponibles. Les recommandations ci-dessous sont basées sur :
- Les informations visibles dans les pages HTML récupérées
- Les pratiques standard de l'industrie pour ce type de services
- L'architecture existante du projet

**ACTION REQUISE** : Avant toute implémentation, vous DEVEZ :
1. Consulter la documentation officielle NOWPayments pour les payouts : https://documenter.getpostman.com/view/7907941/2s93JusNJt
2. Consulter la documentation Didit : https://docs.didit.me
3. Contacter le support des deux services pour confirmer les détails techniques
4. Vérifier les prérequis de compte (KYB, whitelisting, etc.)

---

## PARTIE 1 — Retrait crypto vers wallet externe

### 1.1 Recherche API NOWPayments Payouts

#### Ce qui a été identifié
D'après la page HTML de NOWPayments récupérée, le service propose :
- **Mass Payouts** : visible dans le menu "Manage Funds"
- **Off-ramp payouts** : également disponible
- Support de multiples cryptomonnaies (BTC, ETH, USDT, USDC, TRX, etc.)

#### Ce qui DOIT être vérifié auprès de NOWPayments
- [ ] L'API exacte pour les payouts individuels vs mass payouts
- [ ] Prérequis KYB (Know Your Business) pour activer les payouts
- [ ] Processus de whitelisting des adresses de retrait
- [ ] Montants minimum et maximum par transaction
- [ ] Frais de transaction (fixes et/ou pourcentage)
- [ ] Délais de traitement (instantané vs batch)
- [ ] Limitations de taux (rate limits)
- [ ] Format de l'API : endpoints, authentification, webhooks IPN pour confirmation

**Sources à consulter** :
- Documentation Mass Payouts : https://nowpayments.io/mass-payments
- API Docs : https://documenter.getpostman.com/view/7907941/2s93JusNJt

### 1.2 Schéma de flux proposé

#### Architecture de données

**Nouveau champ dans la table `users`** :
```sql
ALTER TABLE users ADD COLUMN crypto_wallet_address TEXT;
ALTER TABLE users ADD COLUMN crypto_wallet_currency TEXT; -- 'BTC', 'ETH', 'USDT_TRC20', etc.
ALTER TABLE users ADD COLUMN crypto_wallet_updated_at TIMESTAMP;
ALTER TABLE users ADD COLUMN crypto_wallet_verification_status TEXT DEFAULT 'pending'; -- 'pending', 'verified', 'suspicious'
```

**Nouvelle table `withdrawal_requests`** :
```sql
CREATE TABLE withdrawal_requests (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  amount DECIMAL(18,8) NOT NULL,
  currency TEXT NOT NULL,
  destination_address TEXT NOT NULL,
  network TEXT, -- 'TRC20', 'ERC20', 'BTC', etc.
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'approved', 'processing', 'completed', 'rejected', 'failed'
  nowpayments_payout_id TEXT,
  transaction_hash TEXT,
  fees DECIMAL(18,8),
  requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  approved_at TIMESTAMP,
  approved_by TEXT REFERENCES users(id),
  completed_at TIMESTAMP,
  rejection_reason TEXT,
  notes TEXT,
  security_hold_until TIMESTAMP, -- Pour délai de sécurité
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_withdrawal_user ON withdrawal_requests(user_id);
CREATE INDEX idx_withdrawal_status ON withdrawal_requests(status);
```

#### Validation des adresses wallet

**Fonction de validation par réseau** :
- Bitcoin : validation format P2PKH, P2SH, Bech32
- Ethereum/ERC20 : validation checksummed address (0x...)
- TRON/TRC20 : validation format T...
- Utiliser des libraries existantes : `bitcoinjs-lib`, `ethers.js`, etc.

**Vérifications de sécurité** :

1. **Délai de sécurité si changement d'adresse** :
   - Si `crypto_wallet_updated_at` < 7 jours : bloquer le retrait
   - Raison : éviter qu'un compte piraté ne change l'adresse et retire immédiatement
   
2. **Seuils de sécurité** :
   - Retrait < 50 USD : validation automatique possible
   - Retrait 50-500 USD : nécessite validation manuelle
   - Retrait > 500 USD : nécessite validation manuelle + vérification 2FA
   
3. **Vérification anti-fraude** :
   - Croiser avec `audit_logs` pour détecter activité suspecte
   - Vérifier que le worker a complété suffisamment de tâches
   - Vérifier ratio gains/temps (détecter comportements anormaux)

### 1.3 Flux de demande de retrait

**RECOMMANDATION** : Démarrer avec validation admin OBLIGATOIRE

Raisons :
- Phase de test/lancement : sécurité maximale
- Permet de détecter patterns frauduleux
- Évite pertes financières en cas d'erreur d'intégration
- Peut être automatisé progressivement après analyse

**Processus proposé** :

```
┌─────────────────────────────────────────────────────────────┐
│ 1. Worker demande retrait (frontend)                        │
│    - Montant en USD                                          │
│    - Devise crypto choisie                                   │
│    - Adresse wallet (validée côté client)                   │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. Backend valide                                            │
│    - Solde suffisant                                         │
│    - Format adresse correct                                  │
│    - Pas de délai de sécurité actif                         │
│    - Limite quotidienne non dépassée                        │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. Création withdrawal_request (status: pending)            │
│    - Déduction du wallet_balance (mise en escrow)           │
│    - Notification admin                                      │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. Admin review (dashboard)                                  │
│    - Visualiser profil worker                                │
│    - Historique transactions                                 │
│    - Vérifier adresse sur blockchain explorer                │
│    - DECISION: approuver / rejeter                           │
└────────────────────┬────────────────────────────────────────┘
                     │
          ┌──────────┴──────────┐
          │                     │
       APPROVE              REJECT
          │                     │
          ▼                     ▼
┌──────────────────┐   ┌─────────────────────┐
│ 5a. Appel API    │   │ 5b. Retour solde    │
│  NOWPayments     │   │  au wallet_balance  │
│  Payout          │   │  + notification     │
└────────┬─────────┘   └─────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────┐
│ 6. Webhook IPN NOWPayments                                   │
│    - Update status: processing → completed/failed            │
│    - Store transaction_hash                                  │
│    - Notification worker                                      │
└─────────────────────────────────────────────────────────────┘
```

### 1.4 Endpoints API nécessaires

**Backend routes** (`backend/src/routes/wallet.ts`) :

```typescript
// Configurer adresse wallet
POST /api/wallet/crypto-address
Body: { address, currency, network }

// Demander un retrait
POST /api/wallet/withdraw
Body: { amount, currency, network }

// Historique retraits (worker)
GET /api/wallet/withdrawals

// Admin: liste des retraits en attente
GET /api/admin/withdrawals?status=pending

// Admin: approuver retrait
POST /api/admin/withdrawals/:id/approve

// Admin: rejeter retrait
POST /api/admin/withdrawals/:id/reject
Body: { reason }

// Webhook IPN NOWPayments (pour confirmation payout)
POST /api/webhooks/nowpayments/payout
```

---

## PARTIE 2 — KYC via Didit

### 2.1 Recherche documentation Didit

#### Ce qui a été identifié

D'après la page HTML de Didit récupérée :
- **Service** : KYC, KYB, transaction monitoring, wallet screening
- **Couverture** : 220+ pays, 14,000+ documents supportés
- **Offre gratuite** : 500 vérifications gratuites par mois
- **SDK disponibles** : visible dans la navigation
- **Liveness detection** : mentionné dans le menu User Verification
- **Webhooks** : support confirmé pour les résultats de vérification
- **Business Console** : dashboard disponible à https://business.didit.me

#### Ce qui DOIT être vérifié auprès de Didit

- [ ] Processus d'inscription développeur
- [ ] Clés API (sandbox vs production)
- [ ] Workflow exact du SDK (frontend flow)
- [ ] Format du webhook de résultat
- [ ] Signature du webhook pour vérification de sécurité
- [ ] Structure des données retournées (nom, date naissance, document, liveness score, etc.)
- [ ] Possibilité de chiffrement côté Didit ou nécessité de chiffrer nous-mêmes
- [ ] Coût au-delà de 500 vérifications/mois
- [ ] Délai de traitement moyen
- [ ] Taux de faux positifs/négatifs

**Sources à consulter** :
- Documentation complète : https://docs.didit.me
- Quick start : https://docs.didit.me/getting-started/quick-start
- API Authentication : https://docs.didit.me/getting-started/api-authentication
- Webhooks : Rechercher dans la doc

### 2.2 Décision d'architecture : Didit vs kyc-engine.ts

**RECOMMANDATION : Remplacement complet avec migration progressive**

#### Arguments pour le remplacement

**Avantages de Didit** :
1. **Liveness detection professionnelle** : technologie anti-spoofing avancée vs notre système basique
2. **Couverture mondiale** : 220+ pays, 14,000+ types de documents (nous ne pouvons pas égaler)
3. **Conformité réglementaire** : Didit maintient la conformité AML/KYC
4. **Maintenance** : pas de maintenance de notre côté pour l'OCR et la détection
5. **Coût initial faible** : 500 vérifications gratuites/mois pour tester
6. **Scalabilité** : infrastructure professionnelle

**Inconvénients** :
1. **Dépendance externe** : si Didit a un problème, notre KYC est bloqué
2. **Coût variable** : au-delà de 500/mois, coût à vérifier
3. **Migration** : travail de migration de l'existant

#### Plan de migration

**Phase 1 : Intégration parallèle** (2-4 semaines)
- Garder `kyc-engine.ts` actif
- Ajouter nouveau flow Didit
- Router 10% du traffic vers Didit
- Comparer résultats et performances

**Phase 2 : Migration progressive** (1 mois)
- 50% traffic vers Didit
- Monitorer taux de succès, temps de traitement
- Collecter feedback utilisateurs

**Phase 3 : Basculement complet** (après validation)
- 100% traffic vers Didit
- Garder `kyc-engine.ts` en fallback si besoin
- Supprimer après 3 mois de stabilité

### 2.3 Intégration avec chiffrement existant

**Principe** : Les données sensibles doivent TOUJOURS être chiffrées avant stockage en DB

**Architecture proposée** :

```
┌──────────────────────────────────────────────────────────────┐
│ Frontend                                                      │
│ - Worker lance KYC depuis son profil                         │
│ - SDK Didit se lance (modal/redirect)                        │
│ - Liveness + photo document en direct                        │
└───────────────────────────┬──────────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────────┐
│ Serveurs Didit                                                │
│ - Traitement IA (liveness, OCR, validation)                  │
│ - Génération résultat vérification                           │
│ - Envoi webhook vers notre backend                           │
└───────────────────────────┬──────────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────────┐
│ Notre Backend - Webhook handler                               │
│ POST /api/webhooks/didit/verification                         │
│                                                                │
│ 1. Vérifier signature webhook (sécurité)                     │
│ 2. Extraire données: nom, prénom, date naissance, etc.      │
│ 3. **CHIFFREMENT via lib existante**                         │
│    - Importer kyc-crypto.ts (ou équivalent)                  │
│    - Chiffrer TOUTES les données sensibles                   │
│ 4. Stocker en DB (users.kyc_data_encrypted)                 │
│ 5. Update users.kyc_status                                   │
│ 6. Notification worker (email/SMS)                           │
└──────────────────────────────────────────────────────────────┘
```

**Modification du schéma users** :

```sql
ALTER TABLE users ADD COLUMN kyc_provider TEXT DEFAULT 'didit'; -- 'internal', 'didit'
ALTER TABLE users ADD COLUMN kyc_session_id TEXT; -- ID session Didit
ALTER TABLE users ADD COLUMN kyc_liveness_score DECIMAL(5,2); -- Score 0-100
ALTER TABLE users ADD COLUMN kyc_verified_at TIMESTAMP;
-- kyc_data_encrypted existe déjà, on le réutilise
```

**Code handler webhook** (pseudo-code) :

```typescript
// backend/src/routes/webhooks.ts
import { verifyDiditWebhookSignature } from '../lib/didit-webhook';
import { encryptKycData } from '../lib/kyc-crypto';

router.post('/webhooks/didit/verification', async (req, res) => {
  // 1. Vérifier signature (comme pour NOWPayments IPN)
  const signature = req.headers['x-didit-signature'];
  if (!verifyDiditWebhookSignature(req.body, signature)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  const { session_id, status, user_data, liveness_score } = req.body;

  // 2. Trouver le user par session_id
  const user = await db
    .select()
    .from(users)
    .where(eq(users.kyc_session_id, session_id))
    .get();

  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  // 3. Chiffrer les données sensibles
  const encryptedData = encryptKycData({
    firstName: user_data.first_name,
    lastName: user_data.last_name,
    dateOfBirth: user_data.date_of_birth,
    documentNumber: user_data.document_number,
    documentType: user_data.document_type,
    nationality: user_data.nationality,
    // ... autres données
  });

  // 4. Sauvegarder en DB
  await db
    .update(users)
    .set({
      kyc_data_encrypted: encryptedData,
      kyc_status: status === 'approved' ? 'verified' : 'rejected',
      kyc_liveness_score: liveness_score,
      kyc_verified_at: new Date(),
      kyc_provider: 'didit',
    })
    .where(eq(users.id, user.id));

  // 5. Audit log
  await auditLogger.log({
    userId: user.id,
    action: 'kyc_verification_completed',
    details: { provider: 'didit', status, liveness_score },
  });

  // 6. Notification
  await notifications.send(user.id, {
    type: 'kyc_status_update',
    status,
  });

  res.json({ received: true });
});
```

### 2.4 Expérience utilisateur - Détection "en direct"

#### Comment fonctionne Didit (basé sur la doc visible)

**Flow typique de vérification liveness** :

1. **Initiation** :
   - Backend crée une session via API Didit : `POST /api/sessions/create`
   - Reçoit un `session_token` temporaire
   - Frontend reçoit ce token

2. **SDK Frontend** :
   ```javascript
   // Exemple conceptuel (à vérifier dans la vraie doc Didit)
   import { DiditSDK } from '@didit/sdk';

   const didit = new DiditSDK({
     token: sessionToken,
     language: 'fr',
   });

   didit.startVerification({
     onSuccess: (result) => {
       // Webhook sera envoyé au backend
       // Afficher message de confirmation à l'utilisateur
     },
     onError: (error) => {
       // Gérer erreur
     },
   });
   ```

3. **Processus utilisateur** :
   - **Étape 1** : Autoriser caméra
   - **Étape 2** : Scanner document d'identité
     - Positionnement automatique détecté
     - Capture recto/verso automatique
   - **Étape 3** : Liveness detection
     - "Regardez la caméra"
     - "Tournez légèrement la tête à droite"
     - "Clignez des yeux"
     - Détection anti-spoofing (pas de photo de photo, pas de masque, etc.)
   - **Étape 4** : Traitement IA
     - OCR du document
     - Extraction données
     - Comparaison visage document vs visage live
     - Score de confiance

4. **Résultat** :
   - En temps réel (quelques secondes à quelques minutes)
   - Webhook envoyé à notre backend
   - Utilisateur voit confirmation dans l'interface

**Différence vs notre système actuel** :
- **Notre système** : Upload statique de photos, pas de vrai liveness, détection basique
- **Didit** : Caméra en temps réel, détection anti-spoofing professionnelle, IA avancée

---

## PARTIE 3 — Modifications DB et Endpoints détaillés

### 3.1 Schema SQL complet

```sql
-- Ajouts table users
ALTER TABLE users ADD COLUMN IF NOT EXISTS crypto_wallet_address TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS crypto_wallet_currency TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS crypto_wallet_network TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS crypto_wallet_updated_at TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS crypto_wallet_verification_status TEXT DEFAULT 'pending';
ALTER TABLE users ADD COLUMN IF NOT EXISTS kyc_provider TEXT DEFAULT 'didit';
ALTER TABLE users ADD COLUMN IF NOT EXISTS kyc_session_id TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS kyc_liveness_score DECIMAL(5,2);
ALTER TABLE users ADD COLUMN IF NOT EXISTS kyc_verified_at TIMESTAMP;

-- Nouvelle table withdrawal_requests
CREATE TABLE IF NOT EXISTS withdrawal_requests (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_id TEXT NOT NULL REFERENCES users(id),
  amount DECIMAL(18,8) NOT NULL,
  currency TEXT NOT NULL,
  network TEXT NOT NULL,
  destination_address TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  nowpayments_payout_id TEXT,
  transaction_hash TEXT,
  fees DECIMAL(18,8),
  requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  approved_at TIMESTAMP,
  approved_by TEXT REFERENCES users(id),
  completed_at TIMESTAMP,
  rejected_at TIMESTAMP,
  rejection_reason TEXT,
  admin_notes TEXT,
  security_hold_until TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_withdrawal_user ON withdrawal_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_withdrawal_status ON withdrawal_requests(status);
CREATE INDEX IF NOT EXISTS idx_withdrawal_created ON withdrawal_requests(created_at DESC);
```

### 3.2 Drizzle Schema

Ajouter dans `backend/src/db/schema/wallets.ts` :

```typescript
export const withdrawalRequests = sqliteTable('withdrawal_requests', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  amount: text('amount').notNull(), // Decimal stored as text
  currency: text('currency').notNull(),
  network: text('network').notNull(),
  destinationAddress: text('destination_address').notNull(),
  status: text('status').notNull().default('pending'),
  nowpaymentsPayoutId: text('nowpayments_payout_id'),
  transactionHash: text('transaction_hash'),
  fees: text('fees'),
  requestedAt: integer('requested_at', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`),
  approvedAt: integer('approved_at', { mode: 'timestamp' }),
  approvedBy: text('approved_by').references(() => users.id),
  completedAt: integer('completed_at', { mode: 'timestamp' }),
  rejectedAt: integer('rejected_at', { mode: 'timestamp' }),
  rejectionReason: text('rejection_reason'),
  adminNotes: text('admin_notes'),
  securityHoldUntil: integer('security_hold_until', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).default(sql`CURRENT_TIMESTAMP`),
});
```

---

## SOURCES ET PROCHAINES ÉTAPES

### Sources consultées (partiellement)

1. **NOWPayments** :
   - Page principale : https://nowpayments.io (HTML récupéré)
   - Section Mass Payouts identifiée
   - **À CONSULTER** : https://documenter.getpostman.com/view/7907941/2s93JusNJt

2. **Didit** :
   - Page documentation : https://docs.didit.me (HTML récupéré)
   - Features identifiées : KYC, liveness, 500 free checks/month
   - **À CONSULTER** : Documentation complète sur docs.didit.me

### Actions requises avant implémentation

#### Immédiat
1. ✅ Créer compte développeur NOWPayments
2. ✅ Créer compte développeur Didit
3. ✅ Lire documentation API complète des deux services
4. ✅ Obtenir clés API sandbox
5. ✅ Tester en sandbox les deux intégrations

#### Validation fonctionnelle
6. ✅ Confirmer pricing exact au-delà des tiers gratuits
7. ✅ Vérifier prérequis KYB pour NOWPayments payouts
8. ✅ Tester processus de whitelisting adresses (si requis)
9. ✅ Vérifier délais de traitement réels (NOWPayments payouts)
10. ✅ Tester flux complet Didit en sandbox

#### Sécurité & Conformité
11. ✅ Audit de sécurité du flux de retrait
12. ✅ Test de la vérification de signature webhook Didit
13. ✅ Vérifier conformité RGPD pour stockage données KYC
14. ✅ Plan de backup si Didit/NOWPayments indisponible

---

## CONCLUSION

Ce document fournit une architecture technique détaillée pour :
1. **Retraits crypto** : système sécurisé avec validation admin, intégration NOWPayments
2. **KYC Didit** : remplacement progressif du système maison par solution professionnelle

**IMPORTANT** : Ce document est une **proposition basée sur des informations partielles**. Une consultation approfondie des documentations officielles est **OBLIGATOIRE** avant toute implémentation.

**Prochaine étape** : Valider ce design avec l'équipe, puis consulter les docs officielles pour affiner les détails techniques précis.
