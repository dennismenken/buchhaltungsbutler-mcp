import { createRequire } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { describe, expect, it } from "vitest";
import { z } from "zod";

// Belegt, dass zod aus src/ heraus auflöst. pnpm legt keine Phantomabhängigkeiten ins
// Wurzel-node_modules: Ein Paket, das nur eine Abhängigkeit des SDK wäre, ließe sich aus
// eigenem Code nicht importieren. Der Nachweis steht früh, damit der Fehler nicht erst
// dort auffällt, wo src/schema/build.ts darauf aufbaut.

describe("zod löst aus src/ auf", () => {
  it("findet das Paket vom Verzeichnis src/ aus", () => {
    // Die Datei muss nicht existieren; für die Auflösung zählt allein ihr Verzeichnis.
    const requireFromSrc = createRequire(
      pathToFileURL(resolve(process.cwd(), "src/aufloesungsprobe.ts")),
    );
    expect(() => requireFromSrc.resolve("zod")).not.toThrow();
  });

  it("liefert ein benutzbares Schema", () => {
    const schema = z.object({ id_by_customer: z.string() });
    expect(schema.parse({ id_by_customer: "1" })).toEqual({ id_by_customer: "1" });
    expect(schema.safeParse({ id_by_customer: 1 }).success).toBe(false);
  });
});
