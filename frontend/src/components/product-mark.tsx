import { product } from '@/lib/product';
import { cn } from '@/lib/utils';

export function ProductMark({
  className,
  showName = true,
  compact = false,
}: {
  className?: string;
  showName?: boolean;
  compact?: boolean;
}) {
  return (
    <div className={cn('flex min-w-0 items-center gap-2.5', className)}>
      <img
        src={product.logo}
        alt={product.name}
        className={cn(
          'flex-none rounded-[14px] border border-border/70 bg-card object-contain shadow-sm',
          compact ? 'h-9 w-9' : 'h-10 w-10 sm:h-11 sm:w-11',
        )}
      />
      {showName && (
        <div className="min-w-0">
          <div className="truncate text-sm font-bold leading-tight sm:text-base">
            {product.name}
          </div>
          <div className="truncate text-[11px] font-medium text-muted-foreground sm:text-xs">
            {product.descriptor}
          </div>
        </div>
      )}
    </div>
  );
}
