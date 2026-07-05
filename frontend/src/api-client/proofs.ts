import { customFetch } from './custom-fetch';
import type { VerificationResult } from './generated/api.schemas';

export type SubmitProofFormInput = {
  assignmentId: number;
  proofType: 'screenshot' | 'link' | 'username' | 'code' | 'text' | 'combined';
  username?: string;
  link?: string;
  code?: string;
  description?: string;
  screenshot?: File | null;
};

export function submitProofForm(input: SubmitProofFormInput) {
  const form = new FormData();
  form.set('proofType', input.proofType);
  if (input.username) form.set('username', input.username);
  if (input.link) form.set('link', input.link);
  if (input.code) form.set('code', input.code);
  if (input.description) form.set('description', input.description);
  if (input.screenshot) form.set('screenshot', input.screenshot);

  return customFetch<VerificationResult>(`/api/assignments/${input.assignmentId}/submit`, {
    method: 'POST',
    responseType: 'json',
    body: form,
  });
}
