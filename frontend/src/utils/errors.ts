import axios from 'axios';

export function extractApiError(err: unknown, fallback = 'Something went wrong'): string {
  if (axios.isAxiosError(err)) {
    const payload = err.response?.data;
    const envelopeError = payload?.error;
    if (typeof envelopeError === 'string') return envelopeError;
    if (envelopeError && typeof envelopeError === 'object') {
      const firstKey = Object.keys(envelopeError)[0];
      const value = envelopeError[firstKey];
      if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
      if (typeof value === 'string') return value;
    }
    if (typeof payload?.detail === 'string') return payload.detail;
    return err.message || fallback;
  }
  if (err instanceof Error) return err.message;
  return fallback;
}
