/**
 * Normalizes Philippine mobile numbers into standard 12-digit format `639XXXXXXXXX`.
 * Accepts `09171234567`, `+639171234567`, `639171234567`, `9171234567`, or formatted strings with spaces/dashes.
 */
export function normalizePhilippinePhone(rawPhone?: string | null): string | null {
  if (!rawPhone) return null;
  const trimmed = rawPhone.trim();
  if (!trimmed) return null;

  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return null;

  if (digits.startsWith('09') && digits.length === 11) {
    return '63' + digits.slice(1);
  }
  if (digits.startsWith('639') && digits.length === 12) {
    return digits;
  }
  if (digits.startsWith('9') && digits.length === 10) {
    return '63' + digits;
  }
  return null;
}

export function isValidPhilippinePhone(rawPhone?: string | null): boolean {
  if (!rawPhone || !rawPhone.trim()) return true; // Optional field
  return normalizePhilippinePhone(rawPhone) !== null;
}

export function formatPhoneForDisplay(normalizedPhone?: string | null): string {
  if (!normalizedPhone) return 'No SMS phone';
  if (normalizedPhone.startsWith('639') && normalizedPhone.length === 12) {
    const p1 = normalizedPhone.slice(2, 5);
    const p2 = normalizedPhone.slice(5, 8);
    const p3 = normalizedPhone.slice(8, 12);
    return `+63 ${p1} ${p2} ${p3}`;
  }
  return normalizedPhone;
}
