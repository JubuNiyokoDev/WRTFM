#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="${1:-.env}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: env file not found: $ENV_FILE" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

errors=0
warnings=0

fail() {
  echo "ERROR: $1" >&2
  errors=$((errors + 1))
}

warn() {
  echo "WARN: $1" >&2
  warnings=$((warnings + 1))
}

require_var() {
  local name="$1"
  local value="${!name:-}"
  if [[ -z "$value" ]]; then
    fail "$name is required"
  fi
}

reject_placeholder() {
  local name="$1"
  local value="${!name:-}"
  if [[ "$value" == replace_with_* || "$value" == change_this_* || "$value" == *"example"* ]]; then
    fail "$name still contains a placeholder value"
  fi
}

require_https_url() {
  local name="$1"
  local value="${!name:-}"
  if [[ -n "$value" && "$value" != https://* ]]; then
    fail "$name must use https:// in public/staging deployment"
  fi
}

required_vars=(
  POSTGRES_PASSWORD
  PUBLIC_API_URL
  CORS_ORIGIN
  APP_AUTH_SECRET
  KYC_ENCRYPTION_KEY
  ADMIN_EMAIL
  ADMIN_PASSWORD
  APPWRITE_ENDPOINT
  APPWRITE_PROJECT_ID
  APPWRITE_API_KEY
  APPWRITE_PROOFS_BUCKET_ID
  NOWPAYMENTS_API_URL
  NOWPAYMENTS_API_KEY
  NOWPAYMENTS_IPN_SECRET
  NOWPAYMENTS_IPN_URL
  NOWPAYMENTS_PAYOUT_EMAIL
  NOWPAYMENTS_PAYOUT_PASSWORD
  NOWPAYMENTS_PAYOUT_IPN_URL
)

for var_name in "${required_vars[@]}"; do
  require_var "$var_name"
  reject_placeholder "$var_name"
done

require_https_url PUBLIC_API_URL
require_https_url CORS_ORIGIN
require_https_url NOWPAYMENTS_IPN_URL
require_https_url NOWPAYMENTS_PAYOUT_IPN_URL
require_https_url APPWRITE_ENDPOINT

if [[ "${PUBLIC_API_URL:-}" =~ localhost|127\.0\.0\.1|0\.0\.0\.0 ]]; then
  fail "PUBLIC_API_URL must not point to localhost in staging/production"
fi

if [[ "${CORS_ORIGIN:-}" =~ localhost|127\.0\.0\.1|0\.0\.0\.0 ]]; then
  fail "CORS_ORIGIN must not include localhost in staging/production"
fi

if [[ "${NOWPAYMENTS_IPN_URL:-}" =~ localhost|127\.0\.0\.1|0\.0\.0\.0|api\.nowpayments\.io ]]; then
  fail "NOWPAYMENTS_IPN_URL must point to this backend, not localhost or NOWPayments API"
fi

if [[ "${NOWPAYMENTS_PAYOUT_IPN_URL:-}" =~ localhost|127\.0\.0\.1|0\.0\.0\.0|api\.nowpayments\.io ]]; then
  fail "NOWPAYMENTS_PAYOUT_IPN_URL must point to this backend, not localhost or NOWPayments API"
fi

if [[ "${NOWPAYMENTS_API_URL:-}" != "https://api.nowpayments.io/v1" ]]; then
  warn "NOWPAYMENTS_API_URL is not the standard production endpoint"
fi

if [[ -n "${NOWPAYMENTS_PAYOUT_TOTP_SECRET:-}" && ! "${NOWPAYMENTS_PAYOUT_TOTP_SECRET}" =~ ^[A-Z2-7=[:space:]]+$ ]]; then
  warn "NOWPAYMENTS_PAYOUT_TOTP_SECRET does not look like a Base32 TOTP secret"
fi

if [[ ${#APP_AUTH_SECRET} -lt 48 ]]; then
  fail "APP_AUTH_SECRET is too short; generate it with: openssl rand -hex 64"
fi

if [[ ${#KYC_ENCRYPTION_KEY} -lt 32 ]]; then
  fail "KYC_ENCRYPTION_KEY is too short; generate it with: openssl rand -hex 32"
fi

model_files=(
  backend/models/face_detection_yunet_2023mar.onnx
  backend/models/face_recognition_sface_2021dec.onnx
  backend/models/minifasnet_v2.onnx
)

for model_file in "${model_files[@]}"; do
  if [[ ! -s "$model_file" ]]; then
    fail "required KYC model missing or empty: $model_file"
  fi
done

if [[ $errors -gt 0 ]]; then
  echo "Preflight failed: $errors error(s), $warnings warning(s)." >&2
  exit 1
fi

echo "Preflight passed: 0 error(s), $warnings warning(s)."
