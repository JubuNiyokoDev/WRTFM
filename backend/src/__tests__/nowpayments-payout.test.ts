import { afterEach, describe, expect, it } from "vitest";
import {
  assertValidNowPaymentsCallbackUrl,
  createNowPaymentsPayout,
} from "../lib/nowpayments-payout";

const originalEnv = { ...process.env };

describe("nowpayments-payout", () => {
  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("refuses to create payouts when payout credentials are missing", async () => {
    process.env.NOWPAYMENTS_API_KEY = "test-api-key";
    delete process.env.NOWPAYMENTS_PAYOUT_EMAIL;
    delete process.env.NOWPAYMENTS_PAYOUT_PASSWORD;

    await expect(
      createNowPaymentsPayout({
        transactionId: 1,
        amountUsd: 10,
        payoutCurrency: "trx",
        payoutAddress: "example@example.com",
      }),
    ).rejects.toThrow("NOWPayments payouts are not configured");
  });

  it("rejects callback URLs that point back to NOWPayments or localhost", () => {
    expect(() =>
      assertValidNowPaymentsCallbackUrl("https://api.nowpayments.io/v1/payouts/ipn"),
    ).toThrow("must point to this backend");

    expect(() =>
      assertValidNowPaymentsCallbackUrl("http://localhost:3001/api/payments/nowpayments/payout-ipn"),
    ).toThrow("must be public");
  });
});
