import { describe, expect, it } from "vitest";

import {
  applyKeyChunk,
  createScriptedTerminal,
  initialKeyState,
  parseSelection,
  PromptAbortedError,
  PromptUnavailableError,
} from "../../src/cli/prompt.js";

// Die selbst geschriebene maskierte Eingabe.
//
// Geprüft wird die reine Tastenverarbeitung: Sie ist der Teil, in dem ein Fehler dazu führen
// würde, dass ein Zeichen eines Geheimnisses auf dem Bildschirm landet.

function feed(chunks: readonly string[], masked: boolean): { value: string; echo: string } {
  let state = initialKeyState();
  let echo = "";
  for (const chunk of chunks) {
    state = applyKeyChunk(state, chunk, masked);
    echo += state.echo;
    if (state.done || state.aborted) {
      break;
    }
  }
  return { value: state.value, echo };
}

describe("applyKeyChunk", () => {
  it("gibt für jedes Zeichen genau einen Stern aus und behält den Wert", () => {
    const { value, echo } = feed(["geheim", "\r"], true);

    expect(value).toBe("geheim");
    expect(echo).toBe("******");
    expect(echo).not.toContain("g");
  });

  it("gibt ohne Maskierung das Zeichen selbst zurück", () => {
    expect(feed(["cursor", "\n"], false).echo).toBe("cursor");
  });

  it("nimmt mit der Rücktaste ein Zeichen zurück, auf dem Bildschirm und im Wert", () => {
    const { value, echo } = feed(["abc", "", "d", "\r"], true);

    expect(value).toBe("abd");
    expect(echo).toBe("***\b \b*");
  });

  it("überzählige Rücktasten löschen nichts und geben nichts aus", () => {
    const { value, echo } = feed(["", "\r"], true);

    expect(value).toBe("");
    expect(echo).toBe("");
  });

  it("löscht mit Strg+U die ganze Zeile", () => {
    const { value } = feed(["abc", "", "x", "\r"], true);

    expect(value).toBe("x");
  });

  it("meldet Strg+C als Abbruch und gibt den bisherigen Wert nicht zurück", () => {
    let state = applyKeyChunk(initialKeyState(), "geheim", true);
    state = applyKeyChunk(state, "", true);

    expect(state.aborted).toBe(true);
    expect(state.value).toBe("");
  });

  it("verwirft Escape-Sequenzen von Pfeiltasten vollständig", () => {
    const { value, echo } = feed(["a", "[A", "b", "\r"], true);

    expect(value).toBe("ab");
    expect(echo).toBe("**");
  });

  it("beendet bei Strg+D die Eingabe, auf leerer Zeile ist es ein Abbruch", () => {
    expect(feed(["abc", ""], true).value).toBe("abc");
    expect(applyKeyChunk(initialKeyState(), "", true).aborted).toBe(true);
  });

  it("nimmt eine Zeile auch aus einem einzigen Block entgegen", () => {
    const state = applyKeyChunk(initialKeyState(), "wert\r", true);

    expect(state.done).toBe(true);
    expect(state.value).toBe("wert");
  });
});

describe("parseSelection", () => {
  it("nimmt Komma und Leerzeichen, sortiert und entfernt Doppelte", () => {
    expect(parseSelection("3, 1 1", 5)).toEqual([0, 2]);
  });

  it("übergeht Angaben außerhalb des Bereichs", () => {
    expect(parseSelection("0, 9, 2", 3)).toEqual([1]);
  });
});

describe("createScriptedTerminal", () => {
  it("beantwortet Fragen aus der Liste und zeichnet die Ausgabe auf", async () => {
    const terminal = createScriptedTerminal(["j", "2"]);

    expect(await terminal.confirm("Weiter?", false)).toBe(true);
    expect(
      await terminal.chooseOne(
        "Welche?",
        [
          { value: "a", label: "A" },
          { value: "b", label: "B" },
        ],
        0,
      ),
    ).toBe("b");
    expect(terminal.text()).toContain("Weiter?");
  });

  it("verweigert im nicht interaktiven Betrieb jede Eingabe", async () => {
    const terminal = createScriptedTerminal([], { interactive: false });

    await expect(terminal.askSecret("API Client:")).rejects.toBeInstanceOf(PromptUnavailableError);
  });

  it("bildet einen Abbruch ab", async () => {
    const terminal = createScriptedTerminal([""]);

    await expect(terminal.ask("Name?")).rejects.toBeInstanceOf(PromptAbortedError);
  });
});
