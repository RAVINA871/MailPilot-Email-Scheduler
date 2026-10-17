import { describe, it, expect } from "vitest";
import { parseRecipients } from "../src/recipients";
import { encrypt, decrypt } from "../src/crypto";
import { campaignSchema } from "../src/validation";

describe("recipient parsing", () => {
  it("accepts valid, flags malformed and duplicates (case-insensitive)", () => {
    const r = parseRecipients("email\na@x.com\nbad@\nA@x.com\nb@y.io,c@z.org");
    expect(r.valid).toEqual(["a@x.com", "b@y.io", "c@z.org"]);
    expect(r.invalid.map((i) => [i.row, i.reason])).toEqual([[3, "Malformed email address"], [4, "Duplicate"]]);
  });
  it("handles TXT one-per-line, CRLF, BOM and blank lines", () => {
    expect(parseRecipients("\uFEFFa@x.com\r\n\r\nb@x.com\r\n").valid).toEqual(["a@x.com", "b@x.com"]);
  });
  it("rejects garbage", () => { expect(parseRecipients("not an email\n@x.com\na@b").valid).toEqual([]); });
});
describe("token encryption", () => {
  it("round-trips and uses random IV", () => {
    const a = encrypt("xoxb-secret"); expect(a).not.toContain("xoxb"); expect(decrypt(a)).toBe("xoxb-secret"); expect(encrypt("xoxb-secret")).not.toBe(a);
  });
  it("detects tampering", () => { const [iv, tag, ct] = encrypt("x").split("."); expect(() => decrypt([iv, tag, Buffer.from("zz").toString("base64")].join("."))).toThrow(); void ct; });
});
describe("campaign validation", () => {
  const ok = { name: "n", subject: "s", body: "b", startAt: "2030-01-01T10:00:00Z", delaySeconds: "5", hourlyLimit: "10" };
  it("accepts valid input and coerces numbers", () => { const v = campaignSchema.parse(ok); expect(v.delaySeconds).toBe(5); expect(v.startAt).toBeInstanceOf(Date); });
  it.each([[{ subject: "" }], [{ hourlyLimit: "0" }], [{ delaySeconds: "-1" }], [{ startAt: "nope" }], [{ hourlyLimit: "1.5" }]])("rejects %j", (patch) => {
    expect(campaignSchema.safeParse({ ...ok, ...patch }).success).toBe(false);
  });
});
