import { cn } from '@/lib/utils';

function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('app-shimmer rounded-[16px]', className)}
      {...props}
    />
  );
}

export { Skeleton };
