import { describe, expect, it } from "vitest";
import { errorText } from "../shared/utils/errorText";

describe("errorText", () => {
  it("never yields [object Object]", () => {
    expect(errorText({ message: "Acesso negado", code: "AUTH_REQUIRED" })).toBe("Acesso negado · AUTH_REQUIRED");
    expect(errorText({ foo: 1 })).toBe('{"foo":1}');
    expect(errorText(new Error("boom"))).toBe("boom");
    expect(errorText("texto")).toBe("texto");
    expect(errorText(undefined)).toBe("undefined");
  });
});
