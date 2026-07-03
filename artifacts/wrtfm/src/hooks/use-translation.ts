import { useSession } from './use-session';

const translations = {
  fr: {
    // Nav
    'nav.dashboard': 'Tableau de bord',
    'nav.campaigns': 'Campagnes',
    'nav.reports': 'Rapports',
    'nav.tasks': 'Missions',
    'nav.earnings': 'Gains',
    'nav.verifications': 'Vérifications',
    'nav.users': 'Utilisateurs',
    'nav.login': 'Connexion',
    'nav.register': "S'inscrire",
    
    // Roles
    'role.client': 'Client',
    'role.worker': 'Travailleur',
    'role.admin': 'Administrateur',

    // General
    'general.loading': 'Chargement...',
    'general.error': 'Une erreur est survenue',
    'general.empty': 'Aucune donnée disponible',
    'general.save': 'Enregistrer',
    'general.cancel': 'Annuler',
    'general.create': 'Créer',
    'general.delete': 'Supprimer',
    'general.status': 'Statut',
    'general.actions': 'Actions',
    
    // Status
    'status.active': 'Actif',
    'status.draft': 'Brouillon',
    'status.paused': 'En pause',
    'status.completed': 'Terminé',
    'status.cancelled': 'Annulé',
    'status.pending': 'En attente',
    'status.in_progress': 'En cours',
    'status.submitted': 'Soumis',
    'status.approved': 'Approuvé',
    'status.rejected': 'Rejeté',
    'status.manual_review': 'Revue manuelle',

    // Home
    'home.hero.title': 'Vérification de missions automatisée à l\'échelle mondiale',
    'home.hero.subtitle': 'La machine de vérification industrielle. Éliminez la revue manuelle. 97% d\'automatisation avec un score de confiance de haute précision.',
    'home.hero.cta': 'Commencer maintenant',
    'home.stats.processed': 'Missions traitées',
    'home.stats.automation': 'Taux d\'automatisation',
    'home.stats.countries': 'Pays actifs',

    // Auth
    'auth.email': 'Email',
    'auth.password': 'Mot de passe',
    'auth.name': 'Nom complet',
    'auth.country': 'Pays',

    // Client Dashboard
    'client.dash.active_campaigns': 'Campagnes actives',
    'client.dash.total_spent': 'Total dépensé',
    'client.dash.automation_rate': 'Taux d\'automatisation',
    'client.dash.recent_campaigns': 'Campagnes récentes',
    'client.dash.activity_feed': 'Flux d\'activité',

    // Client Campaigns
    'client.campaigns.title': 'Titre',
    'client.campaigns.budget': 'Budget',
    'client.campaigns.progress': 'Progression',
    'client.campaigns.new': 'Nouvelle campagne',

    // Worker Dashboard
    'worker.dash.wallet': 'Portefeuille',
    'worker.dash.pending_earnings': 'Gains en attente',
    'worker.dash.reputation': 'Réputation',
    'worker.dash.available_tasks': 'Missions disponibles',
    
    // Admin Dashboard
    'admin.dash.total_users': 'Utilisateurs totaux',
    'admin.dash.pending_reviews': 'Revues manuelles en attente',
    'admin.dash.volume': 'Volume total',
  },
  en: {
    // Nav
    'nav.dashboard': 'Dashboard',
    'nav.campaigns': 'Campaigns',
    'nav.reports': 'Reports',
    'nav.tasks': 'Tasks',
    'nav.earnings': 'Earnings',
    'nav.verifications': 'Verifications',
    'nav.users': 'Users',
    'nav.login': 'Log in',
    'nav.register': 'Sign up',

    // Roles
    'role.client': 'Client',
    'role.worker': 'Worker',
    'role.admin': 'Admin',

    // General
    'general.loading': 'Loading...',
    'general.error': 'An error occurred',
    'general.empty': 'No data available',
    'general.save': 'Save',
    'general.cancel': 'Cancel',
    'general.create': 'Create',
    'general.delete': 'Delete',
    'general.status': 'Status',
    'general.actions': 'Actions',

    // Status
    'status.active': 'Active',
    'status.draft': 'Draft',
    'status.paused': 'Paused',
    'status.completed': 'Completed',
    'status.cancelled': 'Cancelled',
    'status.pending': 'Pending',
    'status.in_progress': 'In Progress',
    'status.submitted': 'Submitted',
    'status.approved': 'Approved',
    'status.rejected': 'Rejected',
    'status.manual_review': 'Manual Review',

    // Home
    'home.hero.title': 'Global Automated Task Verification',
    'home.hero.subtitle': 'The industrial verification machine. Eliminate manual review. 97% automation with high-precision confidence scoring.',
    'home.hero.cta': 'Get Started',
    'home.stats.processed': 'Tasks Processed',
    'home.stats.automation': 'Automation Rate',
    'home.stats.countries': 'Active Countries',

    // Auth
    'auth.email': 'Email',
    'auth.password': 'Password',
    'auth.name': 'Full Name',
    'auth.country': 'Country',

    // Client Dashboard
    'client.dash.active_campaigns': 'Active Campaigns',
    'client.dash.total_spent': 'Total Spent',
    'client.dash.automation_rate': 'Automation Rate',
    'client.dash.recent_campaigns': 'Recent Campaigns',
    'client.dash.activity_feed': 'Activity Feed',

    // Client Campaigns
    'client.campaigns.title': 'Title',
    'client.campaigns.budget': 'Budget',
    'client.campaigns.progress': 'Progress',
    'client.campaigns.new': 'New Campaign',

    // Worker Dashboard
    'worker.dash.wallet': 'Wallet',
    'worker.dash.pending_earnings': 'Pending Earnings',
    'worker.dash.reputation': 'Reputation',
    'worker.dash.available_tasks': 'Available Tasks',

    // Admin Dashboard
    'admin.dash.total_users': 'Total Users',
    'admin.dash.pending_reviews': 'Pending Manual Reviews',
    'admin.dash.volume': 'Total Volume',
  }
};

type TranslationKey = keyof typeof translations.en;

export function useTranslation() {
  const { lang } = useSession();

  const t = (key: string): string => {
    return ((translations as any)[lang] as Record<string, string>)[key] || key;
  };

  return { t, lang };
}
