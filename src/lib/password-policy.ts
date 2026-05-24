// Shared password complexity rules used by registration, user creation, and
// password change endpoints. Keep in sync with frontend hints.

/**
 * Requires at least:
 * - 8 characters (enforced by Zod `.min(8)` separately)
 * - 1 uppercase letter
 * - 1 lowercase letter
 * - 1 digit
 *
 * Symbols are encouraged but not required to keep UX friendly for campus users.
 */
export const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;

export const PASSWORD_HINT =
  "Kata sandi harus minimal 8 karakter, mengandung huruf besar, huruf kecil, dan angka";
