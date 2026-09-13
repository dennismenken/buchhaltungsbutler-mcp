import { defineConfig } from "vitest/config";

// Testlauf des Pakets. test/setup.ts läuft vor jeder Testdatei und sperrt das Netz
// (undici-MockAgent mit disableNetConnect).

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    setupFiles: ["test/setup.ts"],
    // Die Testumgebung zeigt auf eine nicht auflösbare Basis-URL. Ein Aufruf, der am
    // MockAgent vorbeiginge, könnte damit auch bei einem Fehler in der Sperre nichts
    // Echtes erreichen. Das ist die zweite Sicherung hinter der Netzsperre in test/setup.ts.
    env: {
      BB_BASE_URL: "https://nicht-aufloesbar.invalid/api/v1",
    },
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/generated/**", "src/registry/index.generated.ts"],
      reporter: ["text", "lcov"],
      // Projektweite Untergrenze für alle vier Maße, gemessen über src/** als Ganzes. Sie ist
      // ein Boden und kein Ziel: Der ausgelieferte Stand liegt deutlich darüber. Gemessen mit
      // `pnpm test:coverage` am 2026-09-13 über 1577 Tests: 91,77 Prozent Anweisungen
      // (6034/6575), 81,01 Prozent Zweige (4003/4941), 94,19 Prozent Funktionen (1071/1137),
      // 91,95 Prozent Zeilen (5894/6410). Strengere Einzelziele je Modul, bis hin zur
      // vollständigen Zweigabdeckung, werden über eigene Testdateien erreicht und nicht über
      // zusätzliche Schwellen an dieser Stelle.
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
