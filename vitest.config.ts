import { defineConfig } from "vitest/config";

// Testlauf des Pakets. test/setup.ts läuft vor jeder Testdatei und sperrt das Netz
// (undici-MockAgent mit disableNetConnect, Plan 9.1).

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    setupFiles: ["test/setup.ts"],
    // Die Testumgebung zeigt auf eine nicht auflösbare Basis-URL. Ein Aufruf, der am
    // MockAgent vorbeiginge, könnte damit auch bei einem Fehler in der Sperre nichts
    // Echtes erreichen (Plan 9.1, zweite Sicherung).
    env: {
      BB_BASE_URL: "https://nicht-aufloesbar.invalid/api/v1",
    },
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/generated/**", "src/registry/index.generated.ts"],
      reporter: ["text", "lcov"],
      // Grundschwelle aus Plan 9.5, letzte Zeile („Rest"). Die dort genannten
      // Einzelziele je Modul (bis 100 Prozent Zweigabdeckung) sind strenger und werden
      // in den zuständigen Arbeitspaketen über eigene Tests erreicht, nicht hier.
      //
      // Geprüft wird die Schwelle ausschließlich in einem Lauf mit `--coverage`. Dafür gibt es
      // `pnpm test:coverage`, und genau dieses Skript läuft in ci.yml und publish.yml hinter
      // den Tests. Ohne diesen eigenen Schritt wären die Zahlen hier tote Konfiguration: Eine
      // Unterschreitung fiele in keinem Lauf des Projekts auf.
      //
      // Keine der vier Zahlen ist abgesenkt. Wird eine davon gesenkt, gehört die Begründung
      // als Kommentar an genau diese Stelle und nicht in eine Nebenbemerkung.
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
  },
});
