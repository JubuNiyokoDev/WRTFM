import { Link } from 'wouter';
import { motion } from 'framer-motion';
import {
  Activity,
  ArrowRight,
  Bot,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Coins,
  FileSearch,
  Gauge,
  Globe2,
  Layers3,
  LockKeyhole,
  PenLine,
  ScanSearch,
  ShieldCheck,
  Sparkles,
  Split,
  UploadCloud,
  UserCheck,
  Zap,
} from 'lucide-react';
import { product } from '@/lib/product';
import { useTranslation } from '@/hooks/use-translation';
import { useSession } from '@/hooks/use-session';
import { cn } from '@/lib/utils';
import { AppActionTile } from '@/components/product-experience';
import { ProductMark } from '@/components/product-mark';
import { AppIllustration } from '@/components/illustrations';

export default function Home() {
  const { t } = useTranslation();
  const { role } = useSession();
  const dashboardHref = role ? `/${role}` : '/auth/login';
  const channels = [
    t('home.categories.youtube'),
    t('home.categories.social'),
    t('home.categories.website'),
    t('home.categories.app'),
    t('home.categories.form'),
    t('home.categories.content'),
  ];

  const pipeline = [
    { label: t('home.pipeline.intake'), detail: t('home.pipeline.intake.detail') },
    { label: t('home.pipeline.proof'), detail: t('home.pipeline.proof.detail') },
    { label: t('home.pipeline.review'), detail: t('home.pipeline.review.detail') },
    { label: t('home.pipeline.payout'), detail: t('home.pipeline.payout.detail') },
  ];

  const surfaceHref = (targetRole: 'client' | 'worker' | 'admin') => {
    if (role === targetRole) return `/${targetRole}`;
    if (role) return `/${role}`;
    return targetRole === 'worker' || targetRole === 'client' ? '/auth/register' : '/auth/login';
  };
  const workflow = [
    { icon: PenLine, title: t('home.workflow.client.title'), copy: t('home.workflow.client.copy') },
    { icon: ClipboardCheck, title: t('home.workflow.worker.title'), copy: t('home.workflow.worker.copy') },
    { icon: Bot, title: t('home.workflow.engine.title'), copy: t('home.workflow.engine.copy') },
    { icon: UserCheck, title: t('home.workflow.review.title'), copy: t('home.workflow.review.copy') },
  ];
  const workspaces = [
    { role: 'client' as const, icon: Layers3, kind: 'campaign' as const, title: t('home.workspace.client.title'), copy: t('home.workspace.client.copy') },
    { role: 'worker' as const, icon: UploadCloud, kind: 'proof' as const, title: t('home.workspace.worker.title'), copy: t('home.workspace.worker.copy') },
    { role: 'admin' as const, icon: ShieldCheck, kind: 'review' as const, title: t('home.workspace.admin.title'), copy: t('home.workspace.admin.copy') },
  ];
  const trustItems = [
    { icon: LockKeyhole, label: t('home.trust.permissions') },
    { icon: Coins, label: t('home.trust.payments') },
    { icon: UploadCloud, label: t('home.trust.storage') },
    { icon: FileSearch, label: t('home.trust.audit') },
  ];
  const faqs = [
    { q: t('home.faq.client.q'), a: t('home.faq.client.a') },
    { q: t('home.faq.worker.q'), a: t('home.faq.worker.a') },
    { q: t('home.faq.admin.q'), a: t('home.faq.admin.a') },
  ];

  return (
    <div className="flex w-full flex-col bg-background pb-16 lg:pb-0">
      <section className="relative overflow-hidden border-b border-border bg-background">
        <div className="grid w-full grid-cols-1 gap-8 px-5 py-7 sm:px-6 sm:py-9 lg:min-h-[calc(100vh-4rem)] lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] lg:items-center lg:gap-8 lg:px-8 lg:py-8 xl:px-10">
          <motion.div
            className="flex max-w-3xl flex-col justify-start lg:pt-0"
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45 }}
          >
            <div className="mb-5 inline-flex w-fit items-center gap-2 rounded-md border border-primary/20 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary shadow-sm">
              <ShieldCheck className="h-3.5 w-3.5" />
              {t('home.hero.badge')}
            </div>

            <h1 className="max-w-3xl text-2xl font-bold leading-tight tracking-normal text-foreground sm:text-3xl lg:text-4xl">
              {product.name}
            </h1>

            <p className="mt-5 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base sm:leading-7">
              {t('home.hero.subtitle')}
            </p>

            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/auth/register"
                className="app-button inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition-all hover:-translate-y-0.5 hover:bg-primary/90"
              >
                {t('home.hero.cta')}
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
              <Link
                href={dashboardHref}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-input bg-background/80 px-4 text-sm font-semibold shadow-sm transition-all hover:-translate-y-0.5 hover:bg-accent hover:text-accent-foreground"
              >
                {role ? t('nav.dashboard') : t('nav.login')}
                <Gauge className="h-3.5 w-3.5" />
              </Link>
            </div>

            <div className="mt-8 hidden max-w-3xl grid-cols-3 gap-3 sm:grid">
              <AppActionTile icon={<PenLine />} title={t('home.hero.metric.automation')} subtitle={t('home.feature.scoring.title')} gradient="primary" />
              <AppActionTile icon={<Globe2 />} title={t('home.hero.metric.scope')} subtitle={t('home.categories.title')} gradient="secondary" />
              <AppActionTile icon={<Sparkles />} title={t('home.hero.metric.api')} subtitle={t('home.engine.title')} gradient="plain" />
            </div>
          </motion.div>

          <motion.div
            className="flex flex-col justify-start gap-4 lg:justify-center"
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.08 }}
          >
            <div className="app-panel w-full overflow-hidden rounded-[18px] border border-border bg-card shadow-lg">
              <div className="flex min-h-12 items-center justify-between border-b border-border px-4 py-3">
                <div className="flex items-center gap-2 text-xs font-semibold sm:text-sm">
                  <Activity className="h-4 w-4 text-primary" />
                  {t('home.pipeline.title')}
                </div>
              </div>

              <div className="grid gap-px bg-border sm:grid-cols-2 xl:grid-cols-4">
                {pipeline.map((item) => (
                  <div key={item.label} className="bg-card p-4">
                    <div className="text-xs font-medium uppercase text-muted-foreground">{item.label}</div>
                    <div className="mt-2 text-xs leading-5 text-muted-foreground sm:text-sm">{item.detail}</div>
                  </div>
                ))}
              </div>

              <div className="grid gap-0 border-t border-border xl:grid-cols-[1fr_280px]">
                <div className="p-4 sm:p-5 lg:p-6">
                  <div className="grid gap-5 md:grid-cols-[1fr_220px] md:items-center">
                    <div>
                      <h2 className="text-base font-semibold">{t('home.engine.title')}</h2>
                      <p className="mt-3 text-sm leading-6 text-muted-foreground">{t('home.engine.copy')}</p>
                    </div>
                    <AppIllustration kind="earn" className="mx-auto max-w-[190px] sm:max-w-[220px]" fit="contain" />
                  </div>
                </div>

                <div className="border-t border-border bg-card p-4 sm:p-5 xl:border-l xl:border-t-0">
                  <h2 className="text-base font-semibold">{t('home.surfaces.title')}</h2>
                  <div className="mt-4 grid gap-3">
                    <Link href={surfaceHref('client')} className="flex items-center justify-between rounded-md border border-border bg-background p-4 text-sm font-semibold hover:bg-muted">
                      {t('home.surfaces.client')} <ArrowRight className="h-4 w-4 text-muted-foreground" />
                    </Link>
                    <Link href={surfaceHref('worker')} className="flex items-center justify-between rounded-md border border-border bg-background p-4 text-sm font-semibold hover:bg-muted">
                      {t('home.surfaces.worker')} <ArrowRight className="h-4 w-4 text-muted-foreground" />
                    </Link>
                    <Link href={surfaceHref('admin')} className="flex items-center justify-between rounded-md border border-border bg-background p-4 text-sm font-semibold hover:bg-muted">
                      {t('home.surfaces.review')} <ArrowRight className="h-4 w-4 text-muted-foreground" />
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Problem section */}
      <section className="border-b border-border bg-background px-5 py-14 sm:px-6 lg:px-8 lg:py-16 xl:px-10">
        <div className="mx-auto max-w-5xl">
          <motion.div
            className="mx-auto mb-10 max-w-2xl text-center"
            initial={{ opacity: 0, y: 14 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ duration: 0.35 }}
          >
            <h2 className="page-title">{t('home.problem.title')}</h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">{t('home.problem.subtitle')}</p>
          </motion.div>

          <div className="grid gap-5 sm:grid-cols-3">
            {[
              { icon: Clock, title: t('home.problem.risk1.title'), desc: t('home.problem.risk1.desc'), accent: 'text-chart-4 bg-chart-4/10' },
              { icon: ScanSearch, title: t('home.problem.risk2.title'), desc: t('home.problem.risk2.desc'), accent: 'text-destructive bg-destructive/10' },
              { icon: Coins, title: t('home.problem.risk3.title'), desc: t('home.problem.risk3.desc'), accent: 'text-chart-4 bg-chart-4/10' },
            ].map((item, index) => {
              const Icon = item.icon;
              return (
                <motion.article
                  key={item.title}
                  className="app-card rounded-[16px] border border-border bg-card p-5"
                  initial={{ opacity: 0, y: 14 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.2 }}
                  transition={{ duration: 0.35, delay: index * 0.05 }}
                >
                  <div className={cn('flex h-10 w-10 items-center justify-center rounded-md', item.accent)}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="mt-4 text-base font-semibold">{item.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.desc}</p>
                </motion.article>
              );
            })}
          </div>
        </div>
      </section>

      {/* Solution section */}
      <section className="border-b border-border bg-primary/5 px-5 py-14 sm:px-6 lg:px-8 lg:py-16 xl:px-10">
        <div className="mx-auto max-w-5xl">
          <motion.div
            className="mx-auto mb-10 max-w-2xl text-center"
            initial={{ opacity: 0, y: 14 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ duration: 0.35 }}
          >
            <h2 className="page-title">{t('home.solution.title')}</h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">{t('home.solution.subtitle')}</p>
          </motion.div>

          <div className="grid gap-5 sm:grid-cols-3">
            {[
              { icon: Zap, title: t('home.solution.benefit1.title'), desc: t('home.solution.benefit1.desc'), accent: 'text-chart-2 bg-chart-2/10' },
              { icon: ShieldCheck, title: t('home.solution.benefit2.title'), desc: t('home.solution.benefit2.desc'), accent: 'text-primary bg-primary/10' },
              { icon: FileSearch, title: t('home.solution.benefit3.title'), desc: t('home.solution.benefit3.desc'), accent: 'text-chart-2 bg-chart-2/10' },
            ].map((item, index) => {
              const Icon = item.icon;
              return (
                <motion.article
                  key={item.title}
                  className="app-card rounded-[16px] border border-primary/20 bg-card p-5 shadow-sm"
                  initial={{ opacity: 0, y: 14 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.2 }}
                  transition={{ duration: 0.35, delay: index * 0.05 }}
                >
                  <div className={cn('flex h-10 w-10 items-center justify-center rounded-md', item.accent)}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="mt-4 text-base font-semibold">{item.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.desc}</p>
                </motion.article>
              );
            })}
          </div>
        </div>
      </section>

      <section className="border-b border-border bg-card/40 px-5 py-12 sm:px-6 lg:px-8 lg:py-14 xl:px-10">
        <div className="grid w-full gap-6 lg:grid-cols-[320px_1fr] lg:items-start">
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ duration: 0.35 }}
          >
            <h2 className="page-title">{t('home.workflow.title')}</h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">{t('home.workflow.copy')}</p>
          </motion.div>

          <div className="grid gap-4 sm:grid-cols-2 lg:gap-5">
            {workflow.map((item, index) => {
              const Icon = item.icon;
              return (
                <motion.article
                  key={item.title}
                  className="app-card rounded-[16px] border border-border bg-card p-4 sm:p-5"
                  initial={{ opacity: 0, y: 14 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.2 }}
                  transition={{ duration: 0.35, delay: index * 0.04 }}
                >
                  <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary sm:h-10 sm:w-10">
                    <Icon className="h-4 w-4 sm:h-5 sm:w-5" />
                  </div>
                  <h3 className="mt-4 text-base font-semibold">{item.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.copy}</p>
                </motion.article>
              );
            })}
          </div>
        </div>
      </section>

      <section className="border-b border-border bg-background px-5 py-12 sm:px-6 lg:px-8 lg:py-14 xl:px-10">
        <div className="grid w-full gap-6 lg:grid-cols-[320px_1fr]">
          <div>
            <h2 className="page-title">{t('home.engine.title')}</h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              {t('home.engine.copy')}
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-3 lg:gap-5">
            <div className="app-card rounded-[16px] border border-border bg-card p-4 sm:p-5">
              <Bot className="h-5 w-5 text-primary" />
              <h3 className="mt-4 font-semibold">{t('home.feature.scoring.title')}</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{t('home.feature.scoring.copy')}</p>
            </div>
            <div className="app-card rounded-[16px] border border-border bg-card p-4 sm:p-5">
              <Split className="h-5 w-5 text-chart-4" />
              <h3 className="mt-4 font-semibold">{t('home.feature.routing.title')}</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{t('home.feature.routing.copy')}</p>
            </div>
            <div className="app-card rounded-[16px] border border-border bg-card p-4 sm:p-5">
              <FileSearch className="h-5 w-5 text-chart-2" />
              <h3 className="mt-4 font-semibold">{t('home.feature.audit.title')}</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{t('home.feature.audit.copy')}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-border bg-background px-5 py-12 sm:px-6 lg:px-8 lg:py-14 xl:px-10">
        <div className="w-full">
          <div className="max-w-2xl">
            <h2 className="page-title">{t('home.workspace.title')}</h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">{t('home.workspace.copy')}</p>
          </div>

          <div className="mt-8 grid gap-5 lg:grid-cols-3">
            {workspaces.map((workspace, index) => {
              const Icon = workspace.icon;
              return (
                <motion.article
                  key={workspace.role}
                  className="app-card flex min-h-[220px] flex-col rounded-[16px] border border-border bg-card p-4 sm:min-h-[250px] sm:p-5"
                  initial={{ opacity: 0, y: 14 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.2 }}
                  transition={{ duration: 0.35, delay: index * 0.05 }}
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex h-9 w-9 items-center justify-center rounded-md bg-muted text-foreground sm:h-10 sm:w-10">
                      <Icon className="h-4 w-4 sm:h-5 sm:w-5" />
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <AppIllustration kind={workspace.kind} className="mx-auto mt-5 max-w-[230px]" fit="contain" />
                  <div className="mt-auto pt-5">
                    <h3 className="text-lg font-semibold">{workspace.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">{workspace.copy}</p>
                    <Link href={surfaceHref(workspace.role)} className="mt-4 inline-flex text-sm font-semibold text-primary hover:underline">
                      {role === workspace.role ? t('nav.dashboard') : workspace.role === 'admin' ? t('nav.login') : t('nav.register')}
                    </Link>
                  </div>
                </motion.article>
              );
            })}
          </div>
        </div>
      </section>

      <section className="px-5 py-10 sm:px-6 lg:px-8 xl:px-10">
        <div className="flex w-full flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <Globe2 className="h-5 w-5 text-muted-foreground" />
            <div>
              <h2 className="font-semibold">{t('home.categories.title')}</h2>
              <p className="text-sm text-muted-foreground">{t('home.categories.copy')}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {channels.map((channel) => (
              <span key={channel} className="rounded-md border border-border bg-card px-3 py-2 text-xs font-semibold text-muted-foreground sm:text-sm">
                {channel}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-border bg-card/50 px-5 py-12 sm:px-6 lg:px-8 lg:py-14 xl:px-10">
        <div className="grid w-full gap-7 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-start">
          <div>
            <h2 className="page-title">{t('home.trust.title')}</h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">{t('home.trust.copy')}</p>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {trustItems.map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.label} className="flex items-center gap-3 rounded-md border border-border bg-background p-4 text-sm font-semibold">
                    <Icon className="h-4 w-4 text-primary" />
                    {item.label}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="grid gap-3">
            <h2 className="text-lg font-semibold sm:text-xl">{t('home.faq.title')}</h2>
            {faqs.map((faq) => (
              <details key={faq.q} className="group rounded-[16px] border border-border bg-background p-4">
                <summary className="cursor-pointer list-none text-sm font-semibold text-foreground">
                  <span className="flex items-center justify-between gap-3">
                    {faq.q}
                    <ArrowRight className="h-4 w-4 flex-none text-muted-foreground transition-transform group-open:rotate-90" />
                  </span>
                </summary>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">{faq.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-border bg-background px-5 py-12 sm:px-6 lg:px-8 xl:px-10">
        <div className="grid w-full gap-6 rounded-[18px] border border-border bg-card p-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_280px] lg:items-center">
          <div>
            <h2 className="page-title">{t('home.final.title')}</h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">{t('home.final.copy')}</p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <Link
                href={role ? `/${role}` : '/auth/register'}
                className="app-button inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition-all hover:-translate-y-0.5 hover:bg-primary/90"
              >
                {role ? t('nav.dashboard') : t('home.hero.cta')}
                <ArrowRight className="h-4 w-4" />
              </Link>
              {!role && (
                <Link
                  href="/auth/login"
                className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-input bg-background/80 px-4 text-sm font-semibold shadow-sm transition-all hover:-translate-y-0.5 hover:bg-accent hover:text-accent-foreground"
                >
                  {t('nav.login')}
                </Link>
              )}
            </div>
          </div>
          <AppIllustration kind="wallet" variant="transfer" className="mx-auto max-w-[260px]" fit="contain" />
        </div>
      </section>

      <footer className="border-t border-border bg-card px-5 py-6 sm:px-6 lg:px-8 xl:px-10">
        <div className="flex w-full flex-col gap-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="flex h-6 w-6 items-center justify-center rounded bg-muted text-xs font-bold text-muted-foreground">{product.shortName}</div>
              <span>{product.company}</span>
            </div>
            <div className="flex items-center gap-3 border-l border-border pl-4">
              <Link href="/privacy" className="hover:text-foreground hover:underline">Privacy Policy</Link>
              <Link href="/terms" className="hover:text-foreground hover:underline">Terms of Service</Link>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-chart-2" />
            {t('home.footer.promise')}
          </div>
        </div>
      </footer>
    </div>
  );
}
