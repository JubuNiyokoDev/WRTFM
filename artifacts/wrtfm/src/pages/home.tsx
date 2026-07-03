import { useTranslation } from '@/hooks/use-translation';
import { Button } from '@/components/ui/button';
import { Link } from 'wouter';
import { motion } from 'framer-motion';
import { ShieldCheck, Zap, Globe, Activity, CheckCircle2, TrendingUp } from 'lucide-react';

export default function Home() {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col w-full">
      {/* Hero Section */}
      <section className="relative pt-32 pb-20 md:pt-48 md:pb-32 overflow-hidden px-6">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-primary/10 via-background to-background z-0" />
        <div className="absolute top-1/4 -left-64 w-96 h-96 bg-primary/20 blur-[128px] rounded-full z-0" />
        
        <div className="max-w-6xl mx-auto relative z-10 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-sm font-medium mb-8">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
              </span>
              Engine v2.4 Operational
            </div>
          </motion.div>
          
          <motion.h1 
            className="text-5xl md:text-7xl font-display font-bold tracking-tight text-foreground mb-6"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
          >
            {t('home.hero.title')}
          </motion.h1>
          
          <motion.p 
            className="text-xl text-muted-foreground max-w-2xl mx-auto mb-10 leading-relaxed font-sans"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            {t('home.hero.subtitle')}
          </motion.p>
          
          <motion.div 
            className="flex items-center justify-center gap-4"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
          >
            <Link href="/auth/register" className="inline-flex h-12 items-center justify-center rounded-md bg-primary px-8 py-2 text-base font-medium text-primary-foreground shadow hover:bg-primary/90 transition-colors">
              {t('home.hero.cta')}
            </Link>
            <Link href="/auth/login" className="inline-flex h-12 items-center justify-center rounded-md border border-input bg-background px-8 py-2 text-base font-medium shadow-sm hover:bg-accent hover:text-accent-foreground transition-colors">
              View Demo
            </Link>
          </motion.div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="border-y border-border bg-card/50 px-6 py-12">
        <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-8 divide-y md:divide-y-0 md:divide-x divide-border">
          <div className="flex flex-col items-center text-center p-4">
            <Activity className="w-6 h-6 text-primary mb-4" />
            <div className="text-4xl font-mono font-bold text-foreground mb-2">4.2M+</div>
            <div className="text-sm font-medium text-muted-foreground uppercase tracking-wider">{t('home.stats.processed')}</div>
          </div>
          <div className="flex flex-col items-center text-center p-4">
            <Zap className="w-6 h-6 text-chart-4 mb-4" />
            <div className="text-4xl font-mono font-bold text-foreground mb-2">97.3%</div>
            <div className="text-sm font-medium text-muted-foreground uppercase tracking-wider">{t('home.stats.automation')}</div>
          </div>
          <div className="flex flex-col items-center text-center p-4">
            <Globe className="w-6 h-6 text-chart-2 mb-4" />
            <div className="text-4xl font-mono font-bold text-foreground mb-2">140+</div>
            <div className="text-sm font-medium text-muted-foreground uppercase tracking-wider">{t('home.stats.countries')}</div>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="py-24 px-6 bg-background">
        <div className="max-w-6xl mx-auto">
          <div className="mb-16">
            <h2 className="text-3xl md:text-4xl font-display font-bold mb-4">Industrial-grade precision.</h2>
            <p className="text-lg text-muted-foreground max-w-2xl">We process thousands of task verifications per minute using advanced computer vision and platform API cross-referencing.</p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="p-8 rounded-xl border border-border bg-card flex flex-col gap-4">
              <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-semibold">Zero Fraud Tolerance</h3>
              <p className="text-muted-foreground leading-relaxed">Our confidence engine detects screenshot manipulation, bot accounts, and proxy usage before any reward is issued.</p>
            </div>
            
            <div className="p-8 rounded-xl border border-border bg-card flex flex-col gap-4">
              <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-semibold">Auto-Approval Pipeline</h3>
              <p className="text-muted-foreground leading-relaxed">Over 97% of submitted proofs are processed instantly. Only edge cases are routed to manual review by administrators.</p>
            </div>

            <div className="p-8 rounded-xl border border-border bg-card flex flex-col gap-4">
              <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                <Globe className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-semibold">Global Worker Pool</h3>
              <p className="text-muted-foreground leading-relaxed">Distribute your campaigns by country, language, and worker reputation tier for maximum relevance and quality.</p>
            </div>

            <div className="p-8 rounded-xl border border-border bg-card flex flex-col gap-4">
              <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                <TrendingUp className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-semibold">Real-time Telemetry</h3>
              <p className="text-muted-foreground leading-relaxed">Monitor campaign spend, completion velocity, and automation rates on a dense, data-rich control panel.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 border-t border-border bg-card px-6">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-2">
             <div className="w-6 h-6 rounded bg-muted text-muted-foreground flex items-center justify-center text-xs font-bold">W</div>
             <span className="font-display font-medium text-foreground">WRTFM Inc.</span>
          </div>
          <div className="text-sm text-muted-foreground">
            © {new Date().getFullYear()} WorldwideRapidTaskForMoney. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}
