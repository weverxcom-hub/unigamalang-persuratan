import { describe, it, expect } from "vitest";
import { PASSWORD_REGEX, PASSWORD_HINT } from "@/lib/password-policy";

describe("PASSWORD_REGEX", () => {
  const valid = [
    "Password1",
    "Abcdef12",
    "MyP@ss123",
    "Str0ng!Pass",
    "HelloWorld9",
    "Password123!",
  ];

  const invalid = [
    "password1",   // no uppercase
    "PASSWORD1",   // no lowercase
    "Passwords",   // no digit
    "Pass1",       // too short
    "aaaa1111",    // no uppercase
    "AAAA1111",    // no lowercase
    "",            // empty
    "Ab1",         // too short
  ];

  for (const pw of valid) {
    it(`accepts "${pw}"`, () => {
      expect(PASSWORD_REGEX.test(pw)).toBe(true);
    });
  }

  for (const pw of invalid) {
    it(`rejects "${pw}"`, () => {
      expect(PASSWORD_REGEX.test(pw)).toBe(false);
    });
  }

  it("exports a user-friendly hint", () => {
    expect(PASSWORD_HINT).toBeTruthy();
    expect(typeof PASSWORD_HINT).toBe("string");
    expect(PASSWORD_HINT.length).toBeGreaterThan(10);
  });
});
