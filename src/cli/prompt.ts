/**
 * Eingaben im Terminal: maskiert, als Auswahl, als Ja-Nein-Frage — ohne Zusatzabhängigkeit
 * (Plan 8.2, AP15).
 *
 * **Warum die maskierte Eingabe selbst geschrieben ist.** Die bekannten Bibliotheken dafür
 * wären eine weitere Laufzeitabhängigkeit in einem Paket, das mit dreien auskommt (13.2),
 * und sie erledigen genau das, was hier in dreißig Zeilen steht: den Rohmodus einschalten,
 * jede Taste selbst verarbeiten und statt des Zeichens einen Stern ausgeben.
 *
 * **Warum kein `readline`.** Für eine maskierte Eingabe müsste man dessen internes
 * `_writeToOutput` überschreiben. Eine private Schnittstelle einer fremden Bibliothek zu
 * überschreiben ist kein Weg, auf dem man ein Geheimnis führen will. Die Zeileneingabe ist
 * deshalb ebenfalls selbst geschrieben; damit verhält sich beides gleich.
 *
 * Die Tastenverarbeitung steckt in {@link applyKeyChunk}, einer reinen Funktion ohne Terminal.
 * Sie ist der Teil, den ein Einheitstest prüft.
 */

/** Der Benutzer hat mit Strg+C abgebrochen. */
export class PromptAbortedError extends Error {
  constructor() {
    super("Abgebrochen.");
    this.name = "PromptAbortedError";
  }
}

/** Eine Eingabe ist nötig, aber es gibt kein Terminal (nicht interaktiver Betrieb). */
export class PromptUnavailableError extends Error {
  constructor(what: string) {
    super(
      `${what} lässt sich ohne Terminal nicht erfragen. Im nicht interaktiven Betrieb kommen ` +
        "die Zugangsdaten ausschließlich aus BB_API_CLIENT, BB_API_SECRET und BB_API_KEY.",
    );
    this.name = "PromptUnavailableError";
  }
}

export interface KeyState {
  /** Die bisher eingegebene Zeile. */
  readonly value: string;
  readonly done: boolean;
  readonly aborted: boolean;
  /** Was als Rückmeldung auszugeben ist. Bei maskierter Eingabe Sterne statt Zeichen. */
  readonly echo: string;
}

/** Der Anfangszustand einer Eingabe. */
export function initialKeyState(): KeyState {
  return { value: "", done: false, aborted: false, echo: "" };
}

const ETX = "\u0003"; // Strg+C
const EOT = "\u0004"; // Strg+D
const NAK = "\u0015"; // Strg+U, Zeile löschen
const BACKSPACE = new Set(["\u0008", "\u007f"]);

/**
 * Verarbeitet einen Block gelesener Zeichen.
 *
 * Steuerzeichen außer den behandelten werden verworfen, ebenso vollständige
 * Escape-Sequenzen: Ein Pfeiltastendruck darf weder in den Wert noch auf den Bildschirm.
 *
 * @param masked `true` gibt je Zeichen einen Stern aus statt des Zeichens.
 */
export function applyKeyChunk(state: KeyState, chunk: string, masked: boolean): KeyState {
  let value = state.value;
  let echo = "";
  let index = 0;

  while (index < chunk.length) {
    const char = chunk[index] ?? "";
    index += 1;

    if (char === "\u001b") {
      // Escape-Sequenz: bis zum ersten Buchstaben oder Tilde überspringen.
      while (index < chunk.length && !/[A-Za-z~]/.test(chunk[index] ?? "")) {
        index += 1;
      }
      index += 1;
      continue;
    }
    if (char === ETX) {
      return { value: "", done: false, aborted: true, echo };
    }
    if (char === "\r" || char === "\n") {
      return { value, done: true, aborted: false, echo };
    }
    if (char === EOT) {
      // Strg+D beendet die Eingabe; auf leerer Zeile ist es ein Abbruch.
      return value === ""
        ? { value: "", done: false, aborted: true, echo }
        : { value, done: true, aborted: false, echo };
    }
    if (BACKSPACE.has(char)) {
      if (value.length > 0) {
        value = value.slice(0, -1);
        echo += "\b \b";
      }
      continue;
    }
    if (char === NAK) {
      echo += "\b \b".repeat(value.length);
      value = "";
      continue;
    }
    if (char < " ") {
      continue;
    }
    value += char;
    echo += masked ? "*" : char;
  }

  return { value, done: false, aborted: false, echo };
}

export interface Choice<T> {
  readonly value: T;
  readonly label: string;
  /** Zweite Zeile, eingerückt. Für Pfade und Vorbehalte. */
  readonly detail?: string;
}

export interface Terminal {
  /** `false`, wenn keine Eingabe möglich ist: kein TTY oder `--non-interactive`. */
  readonly interactive: boolean;
  /** Eine Zeile auf stdout. */
  write(line?: string): void;
  /** Text ohne Zeilenumbruch auf stdout. */
  writeRaw(text: string): void;
  /** Eine Zeile auf stderr. Für Warnungen und Fehler. */
  writeError(line: string): void;
  ask(question: string, fallback?: string): Promise<string>;
  /** Maskierte Eingabe. Leere Eingabe bedeutet: Vorbelegung übernehmen. */
  askSecret(question: string): Promise<string>;
  confirm(question: string, defaultYes: boolean): Promise<boolean>;
  chooseOne<T>(question: string, choices: readonly Choice<T>[], defaultIndex: number): Promise<T>;
  chooseMany<T>(
    question: string,
    choices: readonly Choice<T>[],
    preselected: readonly number[],
  ): Promise<T[]>;
  close(): void;
}

export interface CreateTerminalOptions {
  readonly input?: NodeJS.ReadStream;
  readonly output?: NodeJS.WriteStream;
  readonly errorOutput?: NodeJS.WriteStream;
  /** `true` erzwingt den nicht interaktiven Betrieb, auch an einem Terminal. */
  readonly nonInteractive?: boolean;
}

function renderChoices<T>(
  terminal: Pick<Terminal, "write">,
  choices: readonly Choice<T>[],
  marked: ReadonlySet<number>,
  showMarks: boolean,
): void {
  choices.forEach((choice, index) => {
    const mark = showMarks ? (marked.has(index) ? "[x] " : "[ ] ") : "";
    terminal.write(`  ${String(index + 1).padStart(2, " ")}) ${mark}${choice.label}`);
    if (choice.detail !== undefined && choice.detail !== "") {
      terminal.write(`      ${choice.detail}`);
    }
  });
}

/** Zerlegt „1,3 5" in die Indizes 0, 2 und 4. Unbrauchbare Angaben werden übergangen. */
export function parseSelection(raw: string, count: number): number[] {
  const picked = new Set<number>();
  for (const part of raw.split(/[\s,]+/)) {
    if (part === "") {
      continue;
    }
    const number = Number.parseInt(part, 10);
    if (Number.isInteger(number) && number >= 1 && number <= count) {
      picked.add(number - 1);
    }
  }
  return [...picked].sort((a, b) => a - b);
}

/** Das Terminal des Prozesses. */
export function createTerminal(options: CreateTerminalOptions = {}): Terminal {
  const input = options.input ?? process.stdin;
  const output = options.output ?? process.stdout;
  const errorOutput = options.errorOutput ?? process.stderr;
  const interactive =
    options.nonInteractive !== true && input.isTTY === true && output.isTTY === true;

  const readLine = async (masked: boolean): Promise<string> => {
    if (!interactive) {
      throw new PromptUnavailableError("Diese Eingabe");
    }
    const previousRaw = input.isRaw === true;
    input.setRawMode(true);
    input.resume();
    input.setEncoding("utf8");

    return await new Promise<string>((resolve, reject) => {
      let state = initialKeyState();
      const finish = (): void => {
        input.off("data", onData);
        input.setRawMode(previousRaw);
        input.pause();
        output.write("\n");
      };
      const onData = (chunk: string): void => {
        state = applyKeyChunk(state, chunk, masked);
        if (state.echo !== "") {
          output.write(state.echo);
        }
        if (state.aborted) {
          finish();
          reject(new PromptAbortedError());
          return;
        }
        if (state.done) {
          finish();
          resolve(state.value);
        }
      };
      input.on("data", onData);
    });
  };

  const terminal: Terminal = {
    interactive,
    write(line = "") {
      output.write(`${line}\n`);
    },
    writeRaw(text) {
      output.write(text);
    },
    writeError(line) {
      errorOutput.write(`${line}\n`);
    },
    async ask(question, fallback) {
      terminal.writeRaw(
        fallback === undefined || fallback === "" ? `${question} ` : `${question} [${fallback}] `,
      );
      const answer = (await readLine(false)).trim();
      return answer === "" ? (fallback ?? "") : answer;
    },
    async askSecret(question) {
      terminal.writeRaw(`${question} `);
      return await readLine(true);
    },
    async confirm(question, defaultYes) {
      for (;;) {
        terminal.writeRaw(`${question} [${defaultYes ? "J/n" : "j/N"}] `);
        const answer = (await readLine(false)).trim().toLowerCase();
        if (answer === "") {
          return defaultYes;
        }
        if (answer === "j" || answer === "ja" || answer === "y" || answer === "yes") {
          return true;
        }
        if (answer === "n" || answer === "nein" || answer === "no") {
          return false;
        }
        terminal.write("Bitte j oder n eingeben.");
      }
    },
    async chooseOne(question, choices, defaultIndex) {
      terminal.write(question);
      renderChoices(terminal, choices, new Set(), false);
      for (;;) {
        terminal.writeRaw(`Nummer [${String(defaultIndex + 1)}] `);
        const answer = (await readLine(false)).trim();
        const index = answer === "" ? defaultIndex : Number.parseInt(answer, 10) - 1;
        const choice = choices[index];
        if (choice !== undefined) {
          return choice.value;
        }
        terminal.write(`Bitte eine Nummer zwischen 1 und ${String(choices.length)} eingeben.`);
      }
    },
    async chooseMany<T>(
      question: string,
      choices: readonly Choice<T>[],
      preselected: readonly number[],
    ): Promise<T[]> {
      terminal.write(question);
      renderChoices(terminal, choices, new Set(preselected), true);
      terminal.write(
        "Mehrere Nummern durch Komma trennen. Leere Eingabe übernimmt die Vorauswahl.",
      );
      terminal.writeRaw("Auswahl: ");
      const answer = (await readLine(false)).trim();
      const indices = answer === "" ? [...preselected] : parseSelection(answer, choices.length);
      const values: T[] = [];
      for (const index of indices) {
        const choice = choices[index];
        if (choice !== undefined) {
          values.push(choice.value);
        }
      }
      return values;
    },
    close() {
      if (interactive) {
        input.pause();
      }
    },
  };

  return terminal;
}

export interface ScriptedTerminal extends Terminal {
  /** Alles, was auf stdout ging, Zeile für Zeile. */
  readonly lines: readonly string[];
  /** Alles, was auf stderr ging. */
  readonly errorLines: readonly string[];
  /** Der gesamte stdout-Text. */
  text(): string;
}

/**
 * Ein Terminal aus einer Liste vorbereiteter Antworten. Ausschließlich für Einheitstests;
 * es liest nie von stdin und schreibt nie auf stdout.
 */
export function createScriptedTerminal(
  answers: readonly string[],
  options: { readonly interactive?: boolean } = {},
): ScriptedTerminal {
  const queue = [...answers];
  const lines: string[] = [];
  const errorLines: string[] = [];
  let pending = "";
  const interactive = options.interactive ?? true;

  const push = (text: string): void => {
    pending += text;
    const parts = pending.split("\n");
    pending = parts.pop() ?? "";
    lines.push(...parts);
  };

  // Bewusst asynchron: Die Methoden des Terminals sind es ebenfalls, und ein Fehler muss
  // als abgelehntes Promise ankommen und nicht als synchroner Wurf.
  const next = async (): Promise<string> => {
    // Ein echter Lesevorgang gibt hier die Kontrolle ab; das vorbereitete Terminal tut es
    // auch, damit sich beide gleich verhalten und ein Fehler als abgelehntes Promise ankommt.
    await Promise.resolve();
    if (!interactive) {
      throw new PromptUnavailableError("Diese Eingabe");
    }
    const answer = queue.shift();
    if (answer === undefined) {
      throw new Error("Das vorbereitete Terminal hat keine Antwort mehr.");
    }
    if (answer === ETX) {
      throw new PromptAbortedError();
    }
    return answer;
  };

  const terminal: ScriptedTerminal = {
    interactive,
    lines,
    errorLines,
    text: () => [...lines, pending].join("\n"),
    write(line = "") {
      push(`${line}\n`);
    },
    writeRaw(text) {
      push(text);
    },
    writeError(line) {
      errorLines.push(line);
    },
    // Bewusst asynchron: Die Fehler dieser Methoden müssen als abgelehntes Promise
    // ankommen, genau wie beim echten Terminal.
    ask: async (question, fallback) => {
      push(`${question}\n`);
      const answer = (await next()).trim();
      return answer === "" ? (fallback ?? "") : answer;
    },
    askSecret: async (question) => {
      push(`${question}\n`);
      return await next();
    },
    confirm: async (question, defaultYes) => {
      push(`${question}\n`);
      const answer = (await next()).trim().toLowerCase();
      if (answer === "") {
        return defaultYes;
      }
      return answer === "j" || answer === "ja" || answer === "y";
    },
    chooseOne: async <T>(
      question: string,
      choices: readonly Choice<T>[],
      defaultIndex: number,
    ): Promise<T> => {
      push(`${question}\n`);
      renderChoices(terminal, choices, new Set(), false);
      const answer = (await next()).trim();
      const index = answer === "" ? defaultIndex : Number.parseInt(answer, 10) - 1;
      const choice = choices[index];
      if (choice === undefined) {
        throw new Error(`Die Auswahl "${answer}" gibt es nicht.`);
      }
      return choice.value;
    },
    chooseMany: async <T>(
      question: string,
      choices: readonly Choice<T>[],
      preselected: readonly number[],
    ): Promise<T[]> => {
      push(`${question}\n`);
      renderChoices(terminal, choices, new Set(preselected), true);
      const answer = (await next()).trim();
      const indices = answer === "" ? [...preselected] : parseSelection(answer, choices.length);
      const values: T[] = [];
      for (const index of indices) {
        const choice = choices[index];
        if (choice !== undefined) {
          values.push(choice.value);
        }
      }
      return values;
    },
    close() {
      // Nichts zu schließen.
    },
  };

  return terminal;
}
