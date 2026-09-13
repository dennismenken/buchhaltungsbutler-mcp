import tseslint from "typescript-eslint";

// Flat Config, typgestützt. Biome formatiert, ESLint prüft ausschließlich Korrektheit;
// Stilregeln bleiben hier bewusst aus, damit sich beide Werkzeuge nicht widersprechen.

export default tseslint.config(
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      "coverage/**",
      "docs/**",
      "src/generated/**",
      "src/registry/index.generated.ts",
    ],
  },
  {
    files: ["**/*.ts"],
    extends: [...tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        project: ["./tsconfig.json", "./tsconfig.test.json"],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // stdout gehört dem MCP-Protokoll. Jede andere Ausgabe des Servers geht nach stderr
      // (Plan 1.3, src/logging/stderr.ts); eine Zeile auf stdout zerstört die JSON-RPC-Sitzung.
      "no-console": ["error", { allow: ["error"] }],
      "no-restricted-properties": [
        "error",
        {
          object: "process",
          property: "stdout",
          message:
            "stdout ist dem MCP-Protokoll vorbehalten. Ausgaben des Servers gehen über src/logging/stderr.ts nach stderr.",
        },
      ],
    },
  },
  {
    // Die Unterbefehle laufen in einem Terminal und nie in einer MCP-Verbindung (Plan 8.1).
    // Für sie ist stdout der richtige Weg.
    files: ["src/cli.ts", "src/cli/**/*.ts"],
    rules: {
      "no-console": "off",
      "no-restricted-properties": "off",
    },
  },
  {
    // Bau- und Wartungsskripte laufen ausschließlich in der Entwicklung.
    files: ["scripts/**/*.ts", "*.config.ts"],
    rules: {
      "no-console": "off",
      "no-restricted-properties": "off",
    },
  },
);
