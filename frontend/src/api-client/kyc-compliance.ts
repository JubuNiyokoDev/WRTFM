import { customFetch } from './custom-fetch';

export type KycVerificationStatus = 'approved' | 'rejected' | 'manual_review';

export interface KycVerification {
  id: number;
  userId: number;
  status: KycVerificationStatus;
  confidence: number;
  reason: string;
  documentType: string;
  method: string;
  officialNumber?: string | null;
  duplicateSignals?: Record<string, unknown>;
  storageFiles?: Record<string, unknown> | null;
  fileAccess?: {
    direct: Array<{
      kind: string;
      label: string;
      mimeType?: string | null;
      size?: number | null;
      url: string;
    }>;
    livenessSegments: Array<{
      challenge: string;
      frames: Array<{
        index: number;
        label: string;
        mimeType?: string | null;
        size?: number | null;
        url: string;
      }>;
    }>;
  } | null;
  reviewedBy?: number | null;
  reviewReason?: string | null;
  createdAt: string;
  reviewedAt?: string | null;
  result?: Record<string, unknown>;
}

export interface KycVerificationList {
  items: KycVerification[];
  total?: number;
  page?: number;
  limit?: number;
}

export function listAdminKycVerifications(params: {
  status?: KycVerificationStatus;
  userId?: number;
  page?: number;
  limit?: number;
} = {}) {
  const search = new URLSearchParams();
  if (params.status) search.set('status', params.status);
  if (params.userId) search.set('userId', String(params.userId));
  if (params.page) search.set('page', String(params.page));
  if (params.limit) search.set('limit', String(params.limit));
  const query = search.toString();
  return customFetch<KycVerificationList>(`/api/admin/kyc-verifications${query ? `?${query}` : ''}`, {
    responseType: 'json',
  });
}

export function getAdminKycVerification(id: number) {
  return customFetch<KycVerification>(`/api/admin/kyc-verifications/${id}`, {
    responseType: 'json',
  });
}

export function decideAdminKycVerification(
  id: number,
  data: { decision: 'approved' | 'rejected'; reviewReason: string },
) {
  return customFetch<{ verification: KycVerification; user: unknown }>(`/api/admin/kyc-verifications/${id}/decision`, {
    method: 'POST',
    responseType: 'json',
    body: JSON.stringify(data),
  });
}

export function resetUserKyc(userId: number, reason: string) {
  return customFetch<{ message: string; user: unknown }>(`/api/admin/users/${userId}/kyc/reset`, {
    method: 'POST',
    responseType: 'json',
    body: JSON.stringify({ reason }),
  });
}

export function getAdminKycFileBlob(url: string) {
  return customFetch<Blob>(url, {
    responseType: 'blob',
  });
}
