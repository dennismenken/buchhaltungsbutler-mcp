# Sicherheit

## Warum das hier besonders wichtig ist

Dieser Server arbeitet auf **echten Buchhaltungsdaten eines echten Mandanten**. Er hält die
Zugangsdaten zu einer Finanzbuchhaltung im Prozess, und 40 seiner 59 Werkzeuge schreiben. Eine
Lücke in diesem Programm ist deshalb keine Unannehmlichkeit, sondern kann Belege, Zahlungen,
Buchungen und Stammdaten eines fremden Unternehmens betreffen. Buchungen und Rechnungen lassen
sich über die Schnittstelle nicht löschen; ein Schaden ist also nicht immer rückgängig zu machen.

Behandeln Sie einen Fund entsprechend: **nicht öffentlich, nicht an einem Produktivmandanten
ausprobiert.**

## Eine Lücke melden

**Melden Sie nichts über ein öffentliches Issue und über keinen öffentlichen Kanal.**

Der private Meldeweg ist die vertrauliche Sicherheitsmeldung von GitHub:

1. Öffnen Sie `https://github.com/dennismenken/buchhaltungsbutler-mcp/security/advisories/new`.
2. Beschreiben Sie den Fund. Wenn Sie den Weg dorthin nicht öffentlich beschreiben wollen,
   genügt zunächst die Art der Lücke und die betroffene Stelle im Quelltext.
3. Sie bekommen eine Rückmeldung, sobald der Fund gesichtet ist. Die Bearbeitung findet in
   demselben privaten Vorgang statt, bis eine korrigierte Fassung veröffentlicht ist.

Ist der private Meldeweg für Sie nicht erreichbar, öffnen Sie ein Issue **ohne** technische
Einzelheiten, mit der Bitte um einen privaten Kanal, und warten Sie die Antwort ab.

## Was in eine Meldung gehört

- Was passiert, und warum es ein Sicherheitsproblem ist.
- Die betroffene Fassung des Pakets sowie Node-Version und Betriebssystem. Die Ausgabe von
  `bbutler-mcp doctor` enthält genau das und **kein Geheimnis**.
- Eine möglichst kleine Abfolge, die den Fund zeigt.

## Was niemals in eine Meldung gehört

- **Keine echten Zugangsdaten.** Weder API Client noch API Secret noch API Key, auch nicht
  gekürzt, auch nicht in einem Bildschirmfoto, auch nicht in einer Protokolldatei, die Sie
  anhängen.
- **Keine echten Geschäftsdaten.** Kein Belegbestand, keine Kontoauszüge, keine Namen von
  Geschäftspartnern. Anonymisieren Sie Beispiele; Feldnamen und Typen genügen.
- Kein fertiger Angriffsweg, der ohne Not öffentlich wird.

## Was in dieses Projekt gehört und was nicht

| Fund | Zuständig |
| --- | --- |
| Der Server gibt Zugangsdaten in einer Antwort, einer Fehlermeldung oder auf stderr aus | **dieses Projekt** |
| Der Server schreibt auf stdout und zerstört damit die Protokollverbindung | **dieses Projekt** |
| `BB_MCP_READ_ONLY=true` lässt einen schreibenden Aufruf durch | **dieses Projekt** |
| Eine Eingabe umgeht die Schema- oder Grenzprüfung und erreicht die Schnittstelle unverändert | **dieses Projekt** |
| `file://` oder `https://` als Belegquelle erreicht etwas, das nicht freigegeben ist | **dieses Projekt** |
| Eine Lücke in der BuchhaltungsButler-Anwendung oder ihrer Schnittstelle selbst | **der Anbieter**, siehe [NOTICE.md](NOTICE.md) |
| Eine Lücke in einem MCP-Client | dessen Hersteller |

## Bekannte, bewusst in Kauf genommene Risiken

Diese Punkte sind keine Lücken, sondern benannte Eigenschaften. Eine Meldung dazu ist willkommen,
wenn sie einen konkreten Verbesserungsvorschlag enthält, aber keine Überraschung.

- **Der Server erzwingt keine Bestätigung vor einem Schreibvorgang.** Das ist eine bewusste
  Entscheidung des Projektinhabers. Der Schutz liegt bei den Annotationen, der Freigabe im
  Client, dem Nur-Lesen-Schalter und den Betrags- und Mengengrenzen. Ein Client, der jede
  Freigabe pauschal erteilt, kann mit diesem Server löschen, stornieren und buchen.
- **Prompt-Injection über Freitextfelder der Schnittstelle** (Verwendungszweck, Gegenpartei,
  Buchungstext, Kommentare, Dateinamen) lässt sich nicht vollständig verhindern. Der Server gibt
  solche Inhalte neutralisiert aus und formatiert sie nie als Anweisung; die Kette endet aber
  beim Modell, nicht beim Server.
- **`BB_MCP_UPLOAD_DIRS` und `BB_MCP_UPLOAD_FROM_URL` erweitern die Angriffsfläche**, und zwar
  genau deshalb sind beide standardmäßig aus.
- **Die Drosselung ist prozesslokal.** Mehrere gleichzeitig laufende Server auf demselben
  Mandanten teilen sich den Zähler nicht.

## Unterstützte Fassungen

Sicherheitskorrekturen erscheinen ausschließlich für die **jeweils neueste veröffentlichte
Fassung**. Ältere Fassungen werden nicht nachgepflegt. Bis zur ersten Veröffentlichung gibt es
keine unterstützte Fassung; gemeldet werden kann trotzdem.
