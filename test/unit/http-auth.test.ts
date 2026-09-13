import { afterEach, describe, expect, it } from "vitest";

import {
  AUTHORIZATION_HEADER,
  basicAuthHeader,
  checkBasicCredentials,
  tenantKey,
} from "../../src/http/auth.js";
import { clearSecrets, redact } from "../../src/config/redact.js";

// Der Header ist die einzige Stelle, an der das Anmeldepaar den Prozess verlässt. Geprüft
// wird deshalb beides: dass er richtig gebaut wird, und dass er nirgends lesbar bleibt.

afterEach(() => {
  clearSecrets();
});

describe("basicAuthHeader", () => {
  it("kodiert client:secret nach RFC 7617", () => {
    const header = basicAuthHeader("api-client", "api-secret");
    expect(header).toBe(`Basic ${Buffer.from("api-client:api-secret", "utf8").toString("base64")}`);
  });

  it("verträgt Zeichen außerhalb von Latin-1, an denen btoa scheitern würde", () => {
    // Genau der Grund für Buffer.from statt btoa.
    const header = basicAuthHeader("büro", "schlüssel€");
    const encoded = header.slice("Basic ".length);
    expect(Buffer.from(encoded, "base64").toString("utf8")).toBe("büro:schlüssel€");
  });

  it("meldet den erzeugten Wert zur Schwärzung an", () => {
    const header = basicAuthHeader("api-client", "api-secret");
    const encoded = header.slice("Basic ".length);
    expect(redact(`Authorization: ${header}`)).not.toContain(encoded);
    expect(redact(`Authorization: ${header}`)).toContain("[redacted]");
  });

  it("schreibt den Headernamen klein, damit es nur eine Schreibweise gibt", () => {
    expect(AUTHORIZATION_HEADER).toBe("authorization");
  });
});

describe("checkBasicCredentials", () => {
  it("nimmt ein gewöhnliches Paar an", () => {
    expect(checkBasicCredentials("client", "secret")).toBe("");
  });

  it("lehnt einen Doppelpunkt im API Client ab", () => {
    // Ohne diese Prüfung läse die Gegenstelle ein verkürztes Secret und antwortete mit
    // HTTP 401, ohne dass die Ursache irgendwo sichtbar wäre.
    const problem = checkBasicCredentials("cli:ent", "secret");
    expect(problem).toContain("Doppelpunkt");
    expect(() => basicAuthHeader("cli:ent", "secret")).toThrow(/Doppelpunkt/);
  });

  it("lehnt Steuerzeichen ab", () => {
    expect(checkBasicCredentials("client", "sec\nret")).toContain("Steuerzeichen");
  });

  it("lehnt leere Werte ab", () => {
    expect(checkBasicCredentials("", "secret")).toContain("API Client");
    expect(checkBasicCredentials("client", "")).toContain("API Secret");
  });

  it("nennt in keiner Meldung einen der beiden Werte", () => {
    for (const problem of [
      checkBasicCredentials("gehe:im", "streng-geheim"),
      // Das Steuerzeichen wird aus Codepunkten gebaut; wörtlich in der Quelle wäre es
      // unsichtbar.
      checkBasicCredentials("client", `streng${String.fromCodePoint(0)}geheim`),
    ]) {
      expect(problem).not.toContain("streng-geheim");
      expect(problem).not.toContain("gehe:im");
    }
  });
});

describe("tenantKey", () => {
  it("gibt den api_key nicht preis", () => {
    const key = tenantKey("streng-geheimer-api-key");
    expect(key).not.toContain("streng");
    expect(key).toMatch(/^[0-9a-f]{16}$/);
  });

  it("ist für denselben Mandanten stabil und für verschiedene verschieden", () => {
    expect(tenantKey("mandant-a")).toBe(tenantKey("mandant-a"));
    expect(tenantKey("mandant-a")).not.toBe(tenantKey("mandant-b"));
  });
});
