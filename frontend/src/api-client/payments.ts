import { customFetch } from './custom-fetch';

export type CryptoDepositInput = {
  amount: number;
  priceCurrency?: string;
  payCurrency?: string;
};

export type CryptoDepositResponse = {
  transactionId: number;
  provider: 'nowpayments';
  paymentId: string | null;
  status: string;
  priceAmount: number | string;
  priceCurrency: string;
  payAmount: number | string | null;
  payCurrency: string | null;
  payAddress: string | null;
  paymentUrl: string | null;
  raw: unknown;
};

export function createCryptoDeposit(data: CryptoDepositInput) {
  return customFetch<CryptoDepositResponse>('/api/payments/crypto/deposit', {
    method: 'POST',
    responseType: 'json',
    body: JSON.stringify(data),
  });
}
