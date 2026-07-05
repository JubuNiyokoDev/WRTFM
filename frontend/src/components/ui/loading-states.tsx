import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

export function MetricGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="metric-grid">
      {Array.from({ length: count }).map((_, index) => (
        <Card key={index}>
          <CardContent className="p-3.5 sm:p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1 space-y-3">
                <Skeleton className="h-3 w-24 rounded-md" />
                <Skeleton className="h-6 w-20 rounded-md" />
              </div>
              <Skeleton className="h-9 w-9 rounded-md sm:h-10 sm:w-10" />
            </div>
            <Skeleton className="mt-4 h-3 w-32 rounded-md" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function ChartPanelSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-4 w-32 rounded-md" />
          <Skeleton className="h-3 w-48 rounded-md" />
        </div>
        <Skeleton className="h-8 w-20 rounded-md" />
      </div>
      <div className="flex h-[210px] items-end gap-2 rounded-[14px] border border-border bg-muted/20 p-3 sm:h-[240px]">
        {[45, 72, 58, 86, 64, 76, 52].map((height, index) => (
          <Skeleton key={index} className="flex-1 rounded-t-md" style={{ height: `${height}%` }} />
        ))}
      </div>
    </div>
  );
}

export function CardListSkeleton({ count = 4, media = false }: { count?: number; media?: boolean }) {
  return (
    <div className="grid gap-3">
      {Array.from({ length: count }).map((_, index) => (
        <Card key={index}>
          <CardContent className="flex items-center gap-3 p-3.5 sm:gap-4 sm:p-4">
            <Skeleton className="h-9 w-9 flex-none rounded-md sm:h-10 sm:w-10" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-4 w-3/4 rounded-md" />
              <Skeleton className="h-3 w-1/2 rounded-md" />
              {media && <Skeleton className="h-3 w-2/3 rounded-md" />}
            </div>
            <div className="w-16 space-y-2">
              <Skeleton className="ml-auto h-4 w-14 rounded-md" />
              <Skeleton className="ml-auto h-3 w-10 rounded-md" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function TableRowsSkeleton({ rows = 5, columns = 4 }: { rows?: number; columns?: number }) {
  return (
    <div className="space-y-2 p-3.5 sm:p-4">
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div key={rowIndex} className="grid gap-3 rounded-md border border-border bg-card p-3" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
          {Array.from({ length: columns }).map((__, columnIndex) => (
            <Skeleton key={columnIndex} className="h-4 rounded-md" />
          ))}
        </div>
      ))}
    </div>
  );
}

export function DetailPageSkeleton() {
  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-col gap-4 p-3.5 sm:p-4 md:flex-row md:items-center md:justify-between">
          <div className="space-y-3">
            <Skeleton className="h-4 w-28 rounded-md" />
            <Skeleton className="h-6 w-64 max-w-full rounded-md" />
            <Skeleton className="h-3 w-48 max-w-full rounded-md" />
          </div>
          <Skeleton className="h-16 w-full rounded-lg md:w-48" />
        </CardContent>
      </Card>
      <div className="grid gap-3 sm:gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-32 rounded-md" />
          </CardHeader>
          <CardContent className="space-y-3">
            <Skeleton className="h-4 w-full rounded-md" />
            <Skeleton className="h-4 w-5/6 rounded-md" />
            <Skeleton className="h-24 w-full rounded-lg" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-36 rounded-md" />
          </CardHeader>
          <CardContent className="space-y-3">
            <Skeleton className="h-10 w-full rounded-md" />
            <Skeleton className="h-24 w-full rounded-lg" />
            <Skeleton className="h-9 w-full rounded-md" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
