import React from 'react';
import { Link, useLocation } from 'wouter';
import { LayoutDashboard, Megaphone, BarChart3, ListChecks, Coins, ShieldCheck, Users, LogOut, ChevronDown } from 'lucide-react';
import { useSession } from '@/hooks/use-session';
import { useTranslation } from '@/hooks/use-translation';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { role, lang, setRole, setLang } = useSession();
  const { t } = useTranslation();
  const [location] = useLocation();

  const isAuthPage = location.startsWith('/auth') || location === '/';

  if (isAuthPage) {
    return (
      <div className="min-h-screen bg-background text-foreground flex flex-col font-sans">
        <header className="flex-none h-16 border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50 flex items-center justify-between px-6">
          <Link href="/" className="font-display font-bold text-xl tracking-tight text-primary flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-primary text-primary-foreground flex items-center justify-center text-xs">W</div>
            WRTFM
          </Link>
          <div className="flex items-center gap-4">
            <div className="flex bg-muted rounded-md p-1">
              <button
                className={cn("px-3 py-1 text-sm font-medium rounded-sm transition-colors", lang === 'fr' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground')}
                onClick={() => setLang('fr')}
              >
                FR
              </button>
              <button
                className={cn("px-3 py-1 text-sm font-medium rounded-sm transition-colors", lang === 'en' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground')}
                onClick={() => setLang('en')}
              >
                EN
              </button>
            </div>
            {role ? (
              <Link href={`/${role}`} className="text-sm font-medium hover:text-primary transition-colors">
                {t('nav.dashboard')}
              </Link>
            ) : (
              <>
                <Link href="/auth/login" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
                  {t('nav.login')}
                </Link>
                <Link href="/auth/register" className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90 transition-colors">
                  {t('nav.register')}
                </Link>
              </>
            )}
          </div>
        </header>
        <main className="flex-1 flex flex-col">{children}</main>
      </div>
    );
  }

  // Dashboard Layout
  const navItems = {
    client: [
      { href: '/client', label: t('nav.dashboard'), icon: LayoutDashboard },
      { href: '/client/campaigns', label: t('nav.campaigns'), icon: Megaphone },
      { href: '/client/reports', label: t('nav.reports'), icon: BarChart3 },
    ],
    worker: [
      { href: '/worker', label: t('nav.dashboard'), icon: LayoutDashboard },
      { href: '/worker/tasks', label: t('nav.tasks'), icon: ListChecks },
      { href: '/worker/earnings', label: t('nav.earnings'), icon: Coins },
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
      <aside className="w-64 border-r border-border bg-card flex flex-col flex-none sticky top-0 h-screen">
        <div className="h-16 flex items-center px-6 border-b border-border">
          <Link href="/" className="font-display font-bold text-xl tracking-tight text-primary flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-primary text-primary-foreground flex items-center justify-center text-xs">W</div>
            WRTFM
          </Link>
        </div>
        
        <div className="px-4 py-6 flex-1 flex flex-col gap-1 overflow-y-auto">
          {currentNav.map((item: any) => {
            const Icon = item.icon;
            const isActive = location === item.href || (location.startsWith(item.href + '/') && item.href !== `/${role}`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors",
                  isActive 
                    ? "bg-primary/10 text-primary" 
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <Icon className="w-4 h-4" />
                {item.label}
              </Link>
            );
          })}
        </div>

        <div className="p-4 border-t border-border mt-auto">
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
              <DropdownMenuLabel>Demo Role Switcher</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setRole('client')}>
                {t('role.client')} {role === 'client' && '✓'}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setRole('worker')}>
                {t('role.worker')} {role === 'worker' && '✓'}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setRole('admin')}>
                {t('role.admin')} {role === 'admin' && '✓'}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setRole(null)} className="text-destructive">
                <LogOut className="w-4 h-4 mr-2" /> Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <div className="flex bg-muted rounded-md p-1 mt-4">
            <button
              className={cn("flex-1 py-1.5 text-xs font-medium rounded-sm transition-colors", lang === 'fr' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground')}
              onClick={() => setLang('fr')}
            >
              FR
            </button>
            <button
              className={cn("flex-1 py-1.5 text-xs font-medium rounded-sm transition-colors", lang === 'en' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground')}
              onClick={() => setLang('en')}
            >
              EN
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 h-screen overflow-y-auto">
        <header className="h-16 border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-40 flex items-center px-8">
          <div className="flex items-center gap-2 text-sm text-muted-foreground font-mono">
            {location.split('/').filter(Boolean).map((part, i, arr) => (
              <React.Fragment key={part}>
                {i > 0 && <span className="opacity-50">/</span>}
                <span className={i === arr.length - 1 ? 'text-foreground font-semibold' : ''}>{part}</span>
              </React.Fragment>
            ))}
          </div>
        </header>
        <div className="flex-1 p-8">
          <div className="max-w-6xl mx-auto">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
