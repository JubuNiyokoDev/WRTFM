import { customFetch } from './custom-fetch';
import type { ReputationDetail, User } from './generated/api.schemas';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { getGetMeQueryKey } from './generated/api';

export function getMyReputation() {
  return customFetch<ReputationDetail>('/api/users/me/reputation', {
    responseType: 'json',
  });
}

export function submitKyc(data: { idCardData: string; selfieData: string }) {
  return customFetch<{ message: string; user: User }>('/api/users/me/kyc', {
    method: 'POST',
    responseType: 'json',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export function useSubmitKyc() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: submitKyc,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
    },
  });
}
