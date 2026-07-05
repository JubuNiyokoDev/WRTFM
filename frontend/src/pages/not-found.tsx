import { Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { useTranslation } from '@/hooks/use-translation';
import { AppIllustration } from '@/components/illustrations';

export default function NotFound() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
      <AppIllustration kind="empty" className="mb-2 max-w-[180px] sm:max-w-[220px]" />
      <div className="mb-3 text-xl font-display font-bold text-primary sm:text-2xl">404</div>
      <h1 className="mb-2 text-base font-bold sm:text-lg">{t('notfound.title')}</h1>
      <p className="mb-6 max-w-md text-sm text-muted-foreground sm:mb-8">
        {t('notfound.copy')}
      </p>
      <Link href="/">
        <Button>{t('general.back')}</Button>
      </Link>
    </div>
  );
}
