import React from 'react';
import { Link, useLocation } from 'wouter';
import { LayoutDashboard, Megaphone, BarChart3, ListChecks, Coins, ShieldCheck, Users, LogOut, ChevronDown, Menu, Home, User, Wallet } from 'lucide-react';
import { motion } from 'framer-motion';
import { useSession } from '@/hooks/use-session';
import { useTranslation } from '@/hooks/use-translation';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { AppBottomNav } from '@/components/product-experience';
import { ProductMark } from '@/components/product-mark';

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { role, lang, setLang, logout } = useSession();
  const { t } = useTranslation();
  const [location] = useLocation();

  const isAuthPage = location.startsWith('/auth') || location === '/';

  if (isAuthPage) {
    return (
      <div className="min-h-screen bg-background text-foreground flex flex-col font-sans">
        <header className="sticky top-0 z-50 flex h-14 flex-none items-center justify-between border-b border-border/70 bg-background/95 px-5 backdrop-blur-xl sm:h-16 sm:px-6 lg:px-8">
          <Link href="/" className="flex min-w-0 items-center gap-2 text-foreground">
            <ProductMark showName={false} compact className="sm:hidden" />
            <ProductMark showName className="hidden max-w-[260px] sm:flex lg:max-w-none" />
          </Link>
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <div className="grid grid-cols-2 rounded-md border border-border bg-card p-0.5 shadow-inner" aria-label="Language selector">
              <button
                className={cn("h-8 rounded-[10px] px-2.5 text-xs font-semibold transition-all", lang === 'fr' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}
                onClick={() => setLang('fr')}
              >
                FR
              </button>
              <button
                className={cn("h-8 rounded-[10px] px-2.5 text-xs font-semibold transition-all", lang === 'en' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}
                onClick={() => setLang('en')}
              >
                EN
              </button>
            </div>
            {role ? (
              <Link href={`/${role}`} className="inline-flex h-9 items-center rounded-md border border-border bg-card px-3 text-xs font-semibold transition-colors hover:text-primary sm:text-sm">
                {t('nav.dashboard')}
              </Link>
            ) : (
              <>
              <Link href="/auth/login" className="hidden text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground sm:inline">
                {t('nav.login')}
              </Link>
                <Link href="/auth/register" className="app-button inline-flex h-9 items-center justify-center rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground shadow-sm transition-all hover:-translate-y-0.5 hover:bg-primary/90 sm:px-3.5 sm:text-sm">
                  {t('nav.register')}
                </Link>
              </>
            )}
          </div>
        </header>
        <motion.main
          className="flex-1 flex flex-col"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28 }}
        >
          {children}
        </motion.main>
      </div>
    );
  }

  // Dashboard Layout
  const navItems = {
    client: [
      { href: '/client', label: t('nav.dashboard'), icon: LayoutDashboard },
      { href: '/client/campaigns', label: t('nav.campaigns'), icon: Megaphone },
      { href: '/client/wallet', label: t('nav.wallet'), icon: Wallet },
      { href: '/client/reports', label: t('nav.reports'), icon: BarChart3 },
      { href: '/client/profile', label: t('nav.profile'), icon: User },
    ],
    worker: [
      { href: '/worker', label: t('nav.dashboard'), icon: LayoutDashboard },
      { href: '/worker/tasks', label: t('nav.tasks'), icon: ListChecks },
      { href: '/worker/earnings', label: t('nav.earnings'), icon: Coins },
      { href: '/worker/profile', label: t('nav.profile'), icon: User },
    ],
    admin: [
      { href: '/admin', label: t('nav.dashboard'), icon: LayoutDashboard },
      { href: '/admin/verifications', label: t('nav.verifications'), icon: ShieldCheck },
      { href: '/admin/campaigns', label: t('nav.campaigns'), icon: Megaphone },
      { href: '/admin/users', label: t('nav.users'), icon: Users },
    ],
  };

  const currentNav = role ? (navItems as any)[role] : [];

  return (
    <div className="min-h-screen bg-background text-foreground flex font-sans">
      {/* Sidebar */}
      <aside className="hidden w-64 border-r border-border/70 bg-background/95 backdrop-blur-xl lg:flex flex-col flex-none sticky top-0 h-screen">
        <div className="h-16 flex items-center px-4 border-b border-border/70">
          <Link href="/" className="font-display font-bold text-lg tracking-tight text-foreground flex items-center gap-2 min-w-0">
            <ProductMark showName />
          </Link>
        </div>
        
        <div className="px-3 py-4 flex-1 flex flex-col gap-1.5 overflow-y-auto">
          {currentNav.map((item: any) => {
            const Icon = item.icon;
            const isActive = location === item.href || (location.startsWith(item.href + '/') && item.href !== `/${role}`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "relative flex items-center gap-2.5 px-2.5 py-2 rounded-md text-xs font-semibold transition-all",
                  isActive 
                    ? "bg-card text-primary shadow-sm border border-border/60" 
                    : "text-muted-foreground hover:bg-card hover:text-foreground hover:translate-x-0.5"
                )}
              >
                {isActive && (
                  <motion.span
                    layoutId="active-nav-pill"
                    className="absolute inset-0 rounded-md border border-primary/10"
                    transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                  />
                )}
                <Icon className="w-4 h-4" />
                <span className="relative">{item.label}</span>
              </Link>
            );
          })}
        </div>

        <div className="p-3 border-t border-border/70 mt-auto">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="w-full justify-between">
                <span className="truncate flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-green-500"></span>
                  {role ? t(`role.${role}`) : 'No role'}
                </span>
                <ChevronDown className="w-4 h-4 opacity-50" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-[200px]">
              <DropdownMenuLabel>Workspace role</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem disabled>
                {role ? t(`role.${role}`) : 'No role'}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={logout} className="text-destructive">
                <LogOut className="w-4 h-4 mr-2" /> Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <div className="flex bg-card rounded-[16px] border border-border p-1 mt-4 shadow-inner">
            <button
              className={cn("flex-1 py-1.5 text-xs font-semibold rounded-sm transition-all", lang === 'fr' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground')}
              onClick={() => setLang('fr')}
            >
              FR
            </button>
            <button
              className={cn("flex-1 py-1.5 text-xs font-semibold rounded-sm transition-all", lang === 'en' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground')}
              onClick={() => setLang('en')}
            >
              EN
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 h-screen overflow-y-auto pb-20 lg:pb-0">
        <header className="h-16 border-b border-border/70 bg-background/90 backdrop-blur-xl sticky top-0 z-40 flex items-center justify-between px-4 sm:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-9 w-9 flex-none lg:hidden" aria-label="Open navigation menu">
                  <Menu className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-[min(21rem,calc(100vw-2rem))]">
                <DropdownMenuLabel>{t('nav.dashboard')}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/" className="flex items-center gap-2">
                    <Home className="h-4 w-4" /> {t('nav.home')}
                  </Link>
                </DropdownMenuItem>
                {currentNav.map((item: any) => {
                  const Icon = item.icon;
                  return (
                    <DropdownMenuItem key={item.href} asChild>
                      <Link href={item.href} className="flex items-center gap-2">
                        <Icon className="h-4 w-4" /> {item.label}
                      </Link>
                    </DropdownMenuItem>
                  );
                })}
                <DropdownMenuSeparator />
                <DropdownMenuLabel>Language</DropdownMenuLabel>
                <div className="grid grid-cols-2 gap-2 p-2">
                  <Button variant={lang === 'fr' ? 'default' : 'outline'} size="sm" onClick={() => setLang('fr')}>FR</Button>
                  <Button variant={lang === 'en' ? 'default' : 'outline'} size="sm" onClick={() => setLang('en')}>EN</Button>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={logout} className="text-destructive">
                  <LogOut className="h-4 w-4 mr-2" /> {t('nav.logout')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Link href="/" className="flex flex-none items-center lg:hidden" aria-label={t('nav.home')}>
              <ProductMark compact showName={false} />
            </Link>
            <div className="flex min-w-0 items-center gap-2 overflow-hidden text-xs text-muted-foreground font-mono sm:text-sm">
              {location.split('/').filter(Boolean).map((part, i, arr) => (
                <React.Fragment key={part}>
                  {i > 0 && <span className="opacity-50">/</span>}
                  <span className={cn('truncate', i === arr.length - 1 ? 'text-foreground font-semibold' : '')}>{part}</span>
                </React.Fragment>
              ))}
            </div>
          </div>
          <div className="hidden lg:flex items-center gap-2 text-xs text-muted-foreground">
            <span className="h-2 w-2 rounded-full bg-chart-2" />
            Engine online
          </div>
        </header>
        <motion.div
          key={location}
          className="flex-1 px-4 py-3 sm:px-5 sm:py-4 lg:p-5 xl:p-6"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
        >
          <div className="w-full app-fade-in">
            {children}
          </div>
        </motion.div>
      </main>
      <AppBottomNav />
    </div>
  );
}
