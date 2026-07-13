import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import {
  Activity,
  AlertTriangle,
  Check,
  Download,
  Eye,
  FileImage,
  FileCheck2,
  Maximize2,
  RotateCcw,
  ShieldCheck,
  UserCheck,
  UserRound,
  X,
} from 'lucide-react';
import {
  decideAdminKycVerification,
  getAdminKycFileBlob,
  getAdminKycVerification,
  listAdminKycVerifications,
  resetUserKyc,
  type KycVerification,
  type KycVerificationStatus,
} from '@/api-client/kyc-compliance';
import { getUser } from '@/api-client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { TableRowsSkeleton } from '@/components/ui/loading-states';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

const statusLabels: Record<KycVerificationStatus, string> = {
  approved: 'Approuvé',
  rejected: 'Rejeté',
  manual_review: 'Revue',
};

const statusClasses: Record<KycVerificationStatus, string> = {
  approved: 'border-green-500/25 bg-green-500/10 text-green-500',
  rejected: 'border-destructive/25 bg-destructive/10 text-destructive',
  manual_review: 'border-yellow-500/25 bg-yellow-500/10 text-yellow-500',
};

function formatDate(value: string | Date) {
  try {
    return format(new Date(value), 'MMM d, yyyy HH:mm');
  } catch {
    return '-';
  }
}

function formatFileSize(value?: number | null) {
  if (!value || value <= 0) return '-';
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function StatusBadge({ status }: { status: KycVerificationStatus }) {
  return (
    <span className={cn('inline-flex items-center rounded-md border px-2 py-1 text-[11px] font-semibold', statusClasses[status])}>
      {statusLabels[status]}
    </span>
  );
}

type KycPreview = {
  objectUrl: string;
  label: string;
  filename: string;
};

function downloadObjectUrl(objectUrl: string, filename: string) {
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function buildDownloadName(label: string) {
  return `${label.toLowerCase().replace(/[^a-z0-9]+/gi, '-').replace(/(^-|-$)/g, '') || 'kyc-preuve'}.jpg`;
}

function SignalList({ verification }: { verification: KycVerification }) {
  const signals = verification.duplicateSignals ?? {};
  return (
    <div className="grid gap-2 text-xs sm:grid-cols-2">
      <div className="rounded-md bg-muted/40 p-2">
        <span className="text-muted-foreground">MIFPDI</span>
        <p className="truncate font-mono text-foreground">{verification.officialNumber || '-'}</p>
      </div>
      <div className="rounded-md bg-muted/40 p-2">
        <span className="text-muted-foreground">Face embedding</span>
        <p className="font-mono text-foreground">{signals.hasLiveFaceEmbedding ? 'présent' : '-'}</p>
      </div>
      <div className="rounded-md bg-muted/40 p-2">
        <span className="text-muted-foreground">Recto hash</span>
        <p className="truncate font-mono text-foreground">{String(signals.frontDocumentHash ?? '-')}</p>
      </div>
      <div className="rounded-md bg-muted/40 p-2">
        <span className="text-muted-foreground">Verso hash</span>
        <p className="truncate font-mono text-foreground">{String(signals.backDocumentHash ?? '-')}</p>
      </div>
    </div>
  );
}

function getLivenessEvidence(verification: KycVerification) {
  const result = verification.result as any;
  return result?.livenessEvidence ?? result?.result?.livenessEvidence ?? null;
}

function LivenessEvidenceSummary({ verification }: { verification: KycVerification }) {
  const evidence = getLivenessEvidence(verification);
  const order = Array.isArray(evidence?.order) ? evidence.order : [];
  const segments = evidence?.segments && typeof evidence.segments === 'object' ? evidence.segments : {};
  const hasRecordedSegments = ['blink', 'head_turn', 'mouth'].some((challenge) => (segments?.[challenge]?.frameCount ?? 0) > 0);

  return (
    <div className="rounded-lg border border-border bg-muted/20 p-3">
      <div className="mb-2 flex items-center gap-2">
        <Activity className="h-4 w-4 text-primary" />
        <p className="text-xs font-semibold uppercase text-muted-foreground">Liveness serveur</p>
      </div>
      <div className="grid gap-2 text-xs sm:grid-cols-2">
        <div className="rounded-md bg-background/50 p-2">
          <span className="text-muted-foreground">Source</span>
          <p className="truncate font-mono text-foreground">{evidence?.source ?? 'ancien dossier'}</p>
        </div>
        <div className="rounded-md bg-background/50 p-2">
          <span className="text-muted-foreground">Ordre des défis</span>
          <p className="truncate font-mono text-foreground">{order.length ? order.join(' > ') : 'non enregistré'}</p>
        </div>
      </div>
      {hasRecordedSegments ? (
        <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
          {['blink', 'head_turn', 'mouth'].map((challenge) => (
            <div key={challenge} className="rounded-md bg-background/50 p-2">
              <span className="block truncate text-muted-foreground">{challenge.replace('_', ' ')}</span>
              <p className="font-mono text-foreground">{segments?.[challenge]?.frameCount ?? 0} frames</p>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-2 rounded-md bg-background/50 p-2 text-xs leading-5 text-muted-foreground">
          Frames détaillées non enregistrées pour ce dossier. Les nouvelles vérifications garderont les segments
          yeux, tête et bouche.
        </p>
      )}
    </div>
  );
}

function SecureKycImage({
  url,
  label,
  onPreview,
}: {
  url: string;
  label: string;
  onPreview: (preview: KycPreview) => void;
}) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const filename = buildDownloadName(label);

  useEffect(() => {
    let active = true;
    let currentUrl: string | null = null;
    setObjectUrl(null);
    setError(null);

    getAdminKycFileBlob(url)
      .then((blob) => {
        if (!active) return;
        currentUrl = URL.createObjectURL(blob);
        setObjectUrl(currentUrl);
      })
      .catch((err: any) => {
        if (!active) return;
        setError(err?.data?.error || err?.message || 'Image indisponible');
      });

    return () => {
      active = false;
      if (currentUrl) URL.revokeObjectURL(currentUrl);
    };
  }, [url]);

  return (
    <div className="group overflow-hidden rounded-lg border border-border bg-muted/20">
      <button
        type="button"
        className="relative block aspect-[4/3] w-full bg-muted/30 text-left disabled:cursor-not-allowed"
        disabled={!objectUrl}
        onClick={() => objectUrl && onPreview({ objectUrl, label, filename })}
      >
        {objectUrl ? (
          <img src={objectUrl} alt={label} className="h-full w-full object-cover" />
        ) : (
          <div className="grid h-full place-items-center p-3 text-center text-[11px] text-muted-foreground">
            {error || 'Chargement...'}
          </div>
        )}
        {objectUrl && (
          <span className="absolute inset-0 grid place-items-center bg-black/0 opacity-0 transition group-hover:bg-black/35 group-hover:opacity-100">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-background/90 text-foreground shadow-sm">
              <Maximize2 className="h-4 w-4" />
            </span>
          </span>
        )}
      </button>
      <div className="flex items-center justify-between gap-2 px-2 py-1.5">
        <button
          type="button"
          className="min-w-0 truncate text-left text-[11px] font-medium hover:text-primary disabled:hover:text-foreground"
          disabled={!objectUrl}
          onClick={() => objectUrl && onPreview({ objectUrl, label, filename })}
        >
          {label}
        </button>
        <button
          type="button"
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40"
          disabled={!objectUrl}
          onClick={() => objectUrl && downloadObjectUrl(objectUrl, filename)}
          aria-label={`Télécharger ${label}`}
          title={`Télécharger ${label}`}
        >
          <Download className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

function KycEvidenceGallery({
  verification,
  onPreview,
}: {
  verification: KycVerification;
  onPreview: (preview: KycPreview) => void;
}) {
  const direct = verification.fileAccess?.direct ?? [];
  const segments = verification.fileAccess?.livenessSegments ?? [];
  const hasFrames = segments.some((segment) => segment.frames.length > 0);

  if (direct.length === 0 && !hasFrames) {
    return (
      <div className="rounded-lg border border-border bg-muted/20 p-3 text-xs text-muted-foreground">
        Aucune image privée disponible pour ce dossier ancien.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <FileImage className="h-4 w-4 text-primary" />
        <p className="text-xs font-semibold uppercase text-muted-foreground">Preuves privées stockées</p>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {direct.map((file) => (
          <div key={file.url} className="space-y-1">
            <SecureKycImage url={file.url} label={file.label} onPreview={onPreview} />
            <p className="px-1 text-[10px] text-muted-foreground">{formatFileSize(file.size)}</p>
          </div>
        ))}
      </div>

      {hasFrames && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase text-muted-foreground">Frames liveness serveur</p>
          {segments.map((segment) =>
            segment.frames.length > 0 ? (
              <details key={segment.challenge} className="rounded-lg border border-border bg-muted/20">
                <summary className="cursor-pointer px-3 py-2 text-xs font-semibold uppercase text-muted-foreground">
                  {segment.challenge.replace('_', ' ')} · {segment.frames.length} frames
                </summary>
                <div className="grid grid-cols-3 gap-2 border-t border-border p-2 sm:grid-cols-4">
                  {segment.frames.map((frame) => (
                    <SecureKycImage
                      key={frame.url}
                      url={frame.url}
                      label={`${segment.challenge.replace('_', ' ')} #${frame.index + 1}`}
                      onPreview={onPreview}
                    />
                  ))}
                </div>
              </details>
            ) : null,
          )}
        </div>
      )}

      {!hasFrames && (
        <div className="rounded-lg border border-border bg-muted/20 p-3 text-xs leading-5 text-muted-foreground">
          Les frames détaillées des défis seront visibles pour les nouvelles vérifications. Ce dossier garde seulement
          les preuves déjà stockées.
        </div>
      )}
    </div>
  );
}

export default function AdminKycCompliance() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<'all' | KycVerificationStatus>('manual_review');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [reviewReason, setReviewReason] = useState('');
  const [resetReason, setResetReason] = useState('');
  const [preview, setPreview] = useState<KycPreview | null>(null);

  const listQueryKey = ['admin-kyc-verifications', status];
  const { data, isLoading } = useQuery({
    queryKey: listQueryKey,
    queryFn: () =>
      listAdminKycVerifications({
        status: status === 'all' ? undefined : status,
        limit: 50,
      }),
  });

  const detailQuery = useQuery({
    queryKey: ['admin-kyc-verification', selectedId],
    queryFn: () => getAdminKycVerification(selectedId!),
    enabled: selectedId !== null,
  });

  const selected = detailQuery.data;
  const userQuery = useQuery({
    queryKey: ['admin-kyc-user', selected?.userId],
    queryFn: () => getUser(selected!.userId),
    enabled: Boolean(selected?.userId),
  });

  useEffect(() => {
    if (selectedId === null) setPreview(null);
  }, [selectedId]);

  const stats = useMemo(() => {
    const items = data?.items ?? [];
    return {
      total: data?.total ?? items.length,
      manual: items.filter((item) => item.status === 'manual_review').length,
      approved: items.filter((item) => item.status === 'approved').length,
      rejected: items.filter((item) => item.status === 'rejected').length,
    };
  }, [data]);

  const decisionMutation = useMutation({
    mutationFn: ({ id, decision }: { id: number; decision: 'approved' | 'rejected' }) =>
      decideAdminKycVerification(id, {
        decision,
        reviewReason: reviewReason.trim() || 'Décision compliance KYC',
      }),
    onSuccess: () => {
      toast({ title: 'Décision KYC enregistrée', description: 'Le statut utilisateur a été mis à jour.' });
      setSelectedId(null);
      setReviewReason('');
      queryClient.invalidateQueries({ queryKey: ['admin-kyc-verifications'] });
    },
    onError: (error: any) => {
      toast({
        title: 'Erreur compliance',
        description: error?.data?.error || error.message || 'Décision impossible.',
        variant: 'destructive',
      });
    },
  });

  const resetMutation = useMutation({
    mutationFn: (verification: KycVerification) =>
      resetUserKyc(verification.userId, resetReason.trim() || 'Reset KYC compliance'),
    onSuccess: () => {
      toast({ title: 'KYC réinitialisé', description: 'L’utilisateur devra refaire la vérification.' });
      setSelectedId(null);
      setResetReason('');
      queryClient.invalidateQueries({ queryKey: ['admin-kyc-verifications'] });
    },
    onError: (error: any) => {
      toast({
        title: 'Reset impossible',
        description: error?.data?.error || error.message || 'Reset KYC impossible.',
        variant: 'destructive',
      });
    },
  });

  return (
    <div className="space-y-4 sm:space-y-5">
      <div>
        <h1 className="page-title">KYC compliance</h1>
        <p className="page-subtitle">Historique, revues manuelles, doublons et reset KYC permanent.</p>
      </div>

      <div className="metric-grid">
        <Card>
          <CardContent className="flex items-center justify-between gap-3 p-3.5 sm:p-4">
            <div className="min-w-0">
              <p className="truncate text-[11px] font-semibold uppercase text-muted-foreground">Total</p>
              <p className="metric-value">{stats.total}</p>
            </div>
            <FileCheck2 className="h-5 w-5 text-primary" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-between gap-3 p-3.5 sm:p-4">
            <div className="min-w-0">
              <p className="truncate text-[11px] font-semibold uppercase text-muted-foreground">En revue</p>
              <p className="metric-value">{stats.manual}</p>
            </div>
            <AlertTriangle className="h-5 w-5 text-yellow-500" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-between gap-3 p-3.5 sm:p-4">
            <div className="min-w-0">
              <p className="truncate text-[11px] font-semibold uppercase text-muted-foreground">Approuvés</p>
              <p className="metric-value">{stats.approved}</p>
            </div>
            <ShieldCheck className="h-5 w-5 text-green-500" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-between gap-3 p-3.5 sm:p-4">
            <div className="min-w-0">
              <p className="truncate text-[11px] font-semibold uppercase text-muted-foreground">Rejetés</p>
              <p className="metric-value">{stats.rejected}</p>
            </div>
            <X className="h-5 w-5 text-destructive" />
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col gap-3 rounded-[18px] border border-border bg-card p-3.5 sm:flex-row sm:items-center sm:justify-between sm:p-4">
        <div className="min-w-0">
          <p className="text-sm font-semibold">File KYC</p>
          <p className="text-xs text-muted-foreground">Les fichiers restent privés; seuls les signaux masqués sont affichés.</p>
        </div>
        <Select value={status} onValueChange={(value) => setStatus(value as typeof status)}>
          <SelectTrigger className="w-full sm:w-[190px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="manual_review">Revue manuelle</SelectItem>
            <SelectItem value="approved">Approuvés</SelectItem>
            <SelectItem value="rejected">Rejetés</SelectItem>
            <SelectItem value="all">Tous</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <TableRowsSkeleton rows={6} columns={6} />
          ) : data === undefined ? (
            <div className="grid place-items-center gap-2 p-8 text-center text-muted-foreground">
              <AlertTriangle className="h-8 w-8 text-yellow-500" />
              <p className="text-sm font-medium text-foreground">Impossible de charger les dossiers KYC.</p>
              <p className="max-w-md text-xs leading-5">
                Vérifiez que le backend a été redémarré après l’ajout des routes compliance.
              </p>
            </div>
          ) : (data?.items?.length ?? 0) === 0 ? (
            <div className="grid place-items-center gap-2 p-8 text-center text-muted-foreground">
              <ShieldCheck className="h-8 w-8 text-green-500" />
              <p className="text-sm">Aucun dossier KYC dans ce filtre.</p>
            </div>
          ) : (
            <div className="responsive-table">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30 text-left">
                    <th className="px-3 py-2.5 font-medium text-muted-foreground sm:px-4">Utilisateur</th>
                    <th className="px-3 py-2.5 font-medium text-muted-foreground sm:px-4">Statut</th>
                    <th className="px-3 py-2.5 font-medium text-muted-foreground sm:px-4">Confiance</th>
                    <th className="px-3 py-2.5 font-medium text-muted-foreground sm:px-4">MIFPDI</th>
                    <th className="px-3 py-2.5 font-medium text-muted-foreground sm:px-4">Date</th>
                    <th className="px-3 py-2.5 text-right font-medium text-muted-foreground sm:px-4" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data?.items?.map((item) => (
                    <tr key={item.id} className="transition-colors hover:bg-muted/30">
                      <td className="px-3 py-2.5 sm:px-4">
                        <div className="flex items-center gap-2">
                          <UserRound className="h-4 w-4 text-muted-foreground" />
                          <span className="whitespace-nowrap font-mono">#{item.userId}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 sm:px-4"><StatusBadge status={item.status} /></td>
                      <td className="px-3 py-2.5 font-mono sm:px-4">{Math.round(item.confidence)}%</td>
                      <td className="px-3 py-2.5 font-mono text-xs sm:px-4">{item.officialNumber || '-'}</td>
                      <td className="px-3 py-2.5 text-xs text-muted-foreground sm:px-4">{formatDate(item.createdAt)}</td>
                      <td className="px-3 py-2.5 text-right sm:px-4">
                        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setSelectedId(item.id)}>
                          <Eye className="h-3.5 w-3.5" />
                          Ouvrir
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={selectedId !== null} onOpenChange={(open) => !open && setSelectedId(null)}>
        <DialogContent className="grid max-h-[92svh] w-[calc(100vw-0.75rem)] max-w-3xl grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden gap-0 p-0 sm:max-h-[90vh]">
          <div className="border-b border-border px-4 py-3 sm:px-5 sm:py-4">
            <DialogHeader className="space-y-1 pr-8 text-left">
              <DialogTitle className="flex min-w-0 items-center gap-2 text-base sm:text-lg">
                <ShieldCheck className="h-4 w-4 shrink-0 text-primary sm:h-5 sm:w-5" />
                <span className="truncate">Dossier KYC #{selectedId}</span>
              </DialogTitle>
              <DialogDescription className="text-xs leading-5 sm:text-sm">
                Signaux masqués pour compliance. Aucun document public.
              </DialogDescription>
            </DialogHeader>
          </div>

          <div className="min-h-0 overflow-y-auto">
            {detailQuery.isLoading || !selected ? (
              <div className="p-4 sm:p-5">
                <TableRowsSkeleton rows={4} columns={2} />
              </div>
            ) : (
              <div className="space-y-3 p-4 sm:space-y-4 sm:p-5">
                <div className="rounded-lg border border-border bg-card p-3">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <StatusBadge status={selected.status} />
                    <span className="whitespace-nowrap rounded-md bg-muted px-2 py-1 font-mono text-xs tabular-nums">{Math.round(selected.confidence)}%</span>
                    <span className="whitespace-nowrap rounded-md bg-muted px-2 py-1 font-mono text-xs">user #{selected.userId}</span>
                  </div>
                  <p className="text-xs leading-5 text-muted-foreground sm:text-sm">{selected.reason}</p>
                </div>

                <div className="rounded-lg border border-border bg-muted/20 p-3">
                  <div className="mb-2 flex items-center gap-2">
                    <UserCheck className="h-4 w-4 text-primary" />
                    <p className="text-xs font-semibold uppercase text-muted-foreground">Utilisateur</p>
                  </div>
                  <div className="grid gap-2 text-xs sm:grid-cols-2">
                    <div className="rounded-md bg-background/50 p-2">
                      <span className="text-muted-foreground">Nom</span>
                      <p className="truncate font-medium text-foreground">{(userQuery.data as any)?.name ?? '-'}</p>
                    </div>
                    <div className="rounded-md bg-background/50 p-2">
                      <span className="text-muted-foreground">Email</span>
                      <p className="truncate font-mono text-foreground">{(userQuery.data as any)?.email ?? '-'}</p>
                    </div>
                    <div className="rounded-md bg-background/50 p-2">
                      <span className="text-muted-foreground">Pays / rôle</span>
                      <p className="truncate text-foreground">
                        {[(userQuery.data as any)?.country, (userQuery.data as any)?.role].filter(Boolean).join(' · ') || '-'}
                      </p>
                    </div>
                    <div className="rounded-md bg-background/50 p-2">
                      <span className="text-muted-foreground">Statut KYC / réputation</span>
                      <p className="truncate text-foreground">
                        {[(userQuery.data as any)?.kycStatus, `rep ${(userQuery.data as any)?.reputationScore ?? 0}`].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                  </div>
                </div>

                <SignalList verification={selected} />

                <LivenessEvidenceSummary verification={selected} />

                <KycEvidenceGallery verification={selected} onPreview={setPreview} />

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-xs font-semibold uppercase text-muted-foreground">Note compliance</label>
                    <Textarea
                      value={reviewReason}
                      onChange={(event) => setReviewReason(event.target.value)}
                      placeholder="Raison de la décision..."
                      className="min-h-20 text-sm sm:min-h-24"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-semibold uppercase text-muted-foreground">Raison reset</label>
                    <Input
                      value={resetReason}
                      onChange={(event) => setResetReason(event.target.value)}
                      placeholder="Suspicion, fraude..."
                      className="text-sm"
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-9 w-full gap-1.5"
                      onClick={() => resetMutation.mutate(selected)}
                      disabled={resetMutation.isPending}
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      Reset KYC
                    </Button>
                  </div>
                </div>

                <details className="rounded-lg border border-border bg-muted/20">
                  <summary className="cursor-pointer px-3 py-2 text-xs font-semibold uppercase text-muted-foreground">
                    Résultat moteur masqué
                  </summary>
                  <pre className="max-h-48 overflow-auto border-t border-border p-3 text-[10px] leading-5 text-muted-foreground sm:max-h-64 sm:text-[11px]">
                    {JSON.stringify(selected.result ?? {}, null, 2)}
                  </pre>
                </details>
              </div>
            )}
          </div>

          {selected && (
            <div className="grid gap-2 border-t border-border bg-background/95 p-3 backdrop-blur sm:grid-cols-2 sm:bg-transparent sm:p-5 sm:pt-3">
              <Button
                variant="outline"
                className="h-10 gap-2 border-destructive/40 text-destructive hover:bg-destructive/10"
                onClick={() => decisionMutation.mutate({ id: selected.id, decision: 'rejected' })}
                disabled={decisionMutation.isPending}
              >
                <X className="h-4 w-4" />
                Rejeter
              </Button>
              <Button
                className="h-10 gap-2"
                onClick={() => decisionMutation.mutate({ id: selected.id, decision: 'approved' })}
                disabled={decisionMutation.isPending}
              >
                <Check className="h-4 w-4" />
                Approuver
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {preview && (
        <div className="fixed inset-0 z-[70] grid bg-black/90 p-3 sm:p-6" role="dialog" aria-modal="true">
          <div className="mx-auto grid min-h-0 w-full max-w-5xl grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden rounded-xl border border-white/10 bg-background shadow-2xl">
            <div className="flex items-center justify-between gap-3 border-b border-border px-3 py-2.5 sm:px-4">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{preview.label}</p>
                <p className="text-[11px] text-muted-foreground">Aperçu privé admin</p>
              </div>
              <button
                type="button"
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md hover:bg-muted"
                onClick={() => setPreview(null)}
                aria-label="Fermer aperçu"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="grid min-h-0 place-items-center overflow-auto bg-black p-2 sm:p-4">
              <img src={preview.objectUrl} alt={preview.label} className="max-h-full max-w-full object-contain" />
            </div>
            <div className="grid gap-2 border-t border-border p-3 sm:flex sm:items-center sm:justify-end">
              <Button
                variant="outline"
                className="h-10 gap-2"
                onClick={() => downloadObjectUrl(preview.objectUrl, preview.filename)}
              >
                <Download className="h-4 w-4" />
                Télécharger
              </Button>
              <Button className="h-10" onClick={() => setPreview(null)}>
                Fermer
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
