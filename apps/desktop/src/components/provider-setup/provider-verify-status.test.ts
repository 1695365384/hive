import { describe, expect, it } from "vitest";
import {
  canTestApiKey,
  heroVerifyBadge,
  looksMaskedApiKey,
} from "./provider-verify-status";

describe("looksMaskedApiKey", () => {
  it("detects masked secrets", () => {
    expect(looksMaskedApiKey("***abcd")).toBe(true);
    expect(looksMaskedApiKey("sk-****")).toBe(true);
  });

  it("allows plaintext keys", () => {
    expect(looksMaskedApiKey("sk-live-real-key")).toBe(false);
    expect(looksMaskedApiKey("")).toBe(false);
  });
});

describe("canTestApiKey", () => {
  it("blocks when key unchanged (saved/masked)", () => {
    expect(
      canTestApiKey({
        value: "***xyz",
        apiKeyChanged: false,
        providerId: "openai",
      }),
    ).toBe(false);
  });

  it("blocks masked value even if marked changed", () => {
    expect(
      canTestApiKey({
        value: "***xyz",
        apiKeyChanged: true,
        providerId: "openai",
      }),
    ).toBe(false);
  });

  it("allows plaintext new key", () => {
    expect(
      canTestApiKey({
        value: "sk-new-key",
        apiKeyChanged: true,
        providerId: "openai",
      }),
    ).toBe(true);
  });

  it("requires provider id and value", () => {
    expect(
      canTestApiKey({
        value: "sk-new",
        apiKeyChanged: true,
        providerId: "",
      }),
    ).toBe(false);
  });
});

describe("heroVerifyBadge", () => {
  it("never upgrades unknown to verified", () => {
    expect(heroVerifyBadge("unknown", false)).toBe("unknown");
    expect(heroVerifyBadge("unknown", true)).toBe("unverified");
  });

  it("passes through session test states", () => {
    expect(heroVerifyBadge("verified", true)).toBe("verified");
    expect(heroVerifyBadge("failed", false)).toBe("failed");
    expect(heroVerifyBadge("testing", false)).toBe("testing");
  });
});
