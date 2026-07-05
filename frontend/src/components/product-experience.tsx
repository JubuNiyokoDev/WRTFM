import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { BarChart3, Bookmark, Eye, Heart, Home, LayoutDashboard, ListChecks, Megaphone, MessageCircle, MoreHorizontal, Repeat2, ShieldCheck, Share2, Users, Wallet } from 'lucide-react';
import { Link, useLocation } from 'wouter';
import { cn } from '@/lib/utils';
import { useSession } from '@/hooks/use-session';
import { useTranslation } from '@/hooks/use-translation';

export function AppAvatar({
  label,
  src,
  size = 'md',
}: {
  label: string;
  src?: string;
  size?: 'sm' | 'md' | 'lg';
}) {
  const sizeClass = {
    sm: 'h-8 w-8 sm:h-9 sm:w-9',
    md: 'h-9 w-9 sm:h-10 sm:w-10',
    lg: 'h-12 w-12 sm:h-14 sm:w-14',
  }[size];

  return (
    <div className={cn('rounded-full bg-muted p-1 ring-2 ring-muted', sizeClass)}>
      {src ? (
        <img src={src} alt={label} className="h-full w-full rounded-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center rounded-full app-gradient-secondary text-sm font-bold text-white">
          {label.slice(0, 2).toUpperCase()}
        </div>
      )}
    </div>
  );
}

export function AppIconButton({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <button className={cn('app-icon-button flex h-9 w-9 items-center justify-center text-foreground transition-all hover:-translate-y-0.5 hover:border-primary/35 sm:h-11 sm:w-11 [&_svg]:h-4 [&_svg]:w-4 sm:[&_svg]:h-5 sm:[&_svg]:w-5', className)}>
      {children}
    </button>
  );
}

export function AppActionTile({
  icon,
  title,
  subtitle,
  metric,
  gradient = 'primary',
}: {
  icon: ReactNode;
  title: string;
  subtitle: string;
  metric?: string;
  gradient?: 'primary' | 'secondary' | 'success' | 'plain';
}) {
  const gradientClass = {
    primary: 'app-gradient-primary text-white',
    secondary: 'app-gradient-secondary text-white',
    success: 'app-gradient-success text-white',
    plain: 'bg-card text-foreground border border-border',
  }[gradient];

  return (
    <motion.div
      whileHover={{ y: -4, scale: 1.01 }}
      transition={{ type: 'spring', stiffness: 360, damping: 28 }}
      className={cn('min-h-20 rounded-[14px] p-3 shadow-md sm:min-h-24 sm:rounded-[16px] sm:p-4', gradientClass)}
    >
      <div className="mb-3 text-current opacity-95 [&_svg]:h-5 [&_svg]:w-5 sm:mb-4 sm:[&_svg]:h-6 sm:[&_svg]:w-6">{icon}</div>
      <div className="text-[11px] font-semibold uppercase opacity-80 sm:text-xs">{title}</div>
      <div className="mt-1.5 text-sm font-semibold leading-tight sm:text-base">{subtitle}</div>
      {metric && <div className="mt-2 text-lg font-bold sm:text-xl">{metric}</div>}
    </motion.div>
  );
}

export function AppStatusCard({
  author,
  time,
  title,
  children,
  stats = { likes: 3, comments: 1, reposts: 0, views: 9 },
}: {
  author: string;
  time: string;
  title: string;
  children?: ReactNode;
  stats?: { likes: number; comments: number; reposts: number; views: number };
}) {
  return (
    <motion.article
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.36 }}
      className="app-panel rounded-[18px] border border-border/60 bg-card p-3.5 sm:rounded-[16px] sm:p-4"
    >
      <div className="flex items-start gap-3 sm:gap-4">
        <AppAvatar label={author} size="md" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-base font-semibold sm:text-lg">{author}</h3>
            <span className="flex h-7 w-7 items-center justify-center rounded-full border border-muted text-xs text-muted-foreground sm:h-8 sm:w-8">✓</span>
          </div>
          <p className="text-sm text-muted-foreground">{time}</p>
        </div>
        <Bookmark className="h-5 w-5 text-foreground sm:h-6 sm:w-6" />
        <MoreHorizontal className="h-5 w-5 text-foreground sm:h-6 sm:w-6" />
      </div>

      <p className="mt-4 text-base font-semibold leading-snug text-muted-foreground sm:mt-5 sm:text-lg">{title}</p>

      {children && <div className="mt-5 overflow-hidden rounded-[18px]">{children}</div>}

      <div className="mt-5 flex items-center justify-between gap-2 text-xs text-muted-foreground sm:mt-6 sm:text-sm">
        <div className="flex items-center gap-1.5 text-accent"><Heart className="h-4 w-4 fill-current sm:h-5 sm:w-5" /> {stats.likes}</div>
        <div className="flex items-center gap-1.5"><MessageCircle className="h-4 w-4 sm:h-5 sm:w-5" /> {stats.comments}</div>
        <div className="flex items-center gap-1.5"><Repeat2 className="h-4 w-4 sm:h-5 sm:w-5" /> {stats.reposts}</div>
        <div className="flex items-center gap-1.5"><Eye className="h-4 w-4 sm:h-5 sm:w-5" /> {stats.views}</div>
        <Share2 className="h-4 w-4 sm:h-5 sm:w-5" />
      </div>
    </motion.article>
  );
}

export function AppBottomNav() {
  const { role } = useSession();
  const { t } = useTranslation();
  const [location] = useLocation();

  if (!role) {
    return null;
  }

  const navItems = {
    client: [
      { href: '/client', label: t('nav.dashboard'), icon: LayoutDashboard },
      { href: '/client/campaigns', label: t('nav.campaigns'), icon: Megaphone },
      { href: '/client/wallet', label: t('nav.wallet'), icon: Wallet },
      { href: '/client/reports', label: t('nav.reports'), icon: BarChart3 },
    ],
    worker: [
      { href: '/worker', label: t('nav.dashboard'), icon: LayoutDashboard },
      { href: '/worker/tasks', label: t('nav.tasks'), icon: ListChecks },
      { href: '/worker/earnings', label: t('nav.earnings'), icon: Wallet },
    ],
    admin: [
      { href: '/admin', label: t('nav.dashboard'), icon: LayoutDashboard },
      { href: '/admin/verifications', label: t('nav.verifications'), icon: ShieldCheck },
      { href: '/admin/campaigns', label: t('nav.campaigns'), icon: Megaphone },
      { href: '/admin/users', label: t('nav.users'), icon: Users },
    ],
  }[role];

   return (
     <nav
       className="app-bottom-bar fixed bottom-0 left-0 right-0 z-40 mx-auto grid h-20 max-w-4xl grid-flow-col auto-cols-fr items-center gap-1 border-t border-border px-2 py-2 text-muted-foreground lg:hidden"
       aria-label="Mobile navigation"
     >
      {navItems.map((item) => {
        const Icon = item.icon;
        const isActive = location === item.href || (item.href !== `/${role}` && location.startsWith(`${item.href}/`));

        return (
           <Link
             key={item.href}
             href={item.href}
             aria-current={isActive ? 'page' : undefined}
             className={cn(
               'mx-auto flex h-12 min-w-0 max-w-[6rem] flex-col items-center justify-center gap-1 rounded-md px-2 text-xs font-semibold transition-all sm:text-xs',
               isActive
                 ? 'bg-primary text-primary-foreground shadow-[0_14px_36px_-24px_hsl(var(--primary))]'
                 : 'hover:bg-card hover:text-foreground'
             )}
           >
             <Icon className="h-5 w-5 flex-none sm:h-5 sm:w-5" />
             <span className="w-full truncate text-center text-xs leading-tight">{item.label}</span>
           </Link>
        );
      })}
    </nav>
  );
}
