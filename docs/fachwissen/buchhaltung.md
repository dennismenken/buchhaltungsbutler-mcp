# Fachliche Grundlagen, deutsche Buchhaltung im Kontext von BuchhaltungsButler

Dieses Dossier richtet sich an einen KI-Agenten, der über den MCP-Server mit einer echten
BuchhaltungsButler-Buchhaltung arbeitet. Der Agent ist kein Buchhalter und darf keine
fachlichen Entscheidungen raten. Ziel dieses Dokuments ist es, die Begriffe der API korrekt
zu deuten, den typischen Arbeitsablauf zu verstehen und zu wissen, wann eine Rückfrage beim
Menschen zwingend ist.

Abrufdatum aller Web-Quellen in diesem Dokument: 2026-09-12. Alles, was nicht durch eine
Quelle oder die OpenAPI-Spezifikation belegt ist, wird ausdrücklich als "Annahme" oder
"nicht verifiziert" gekennzeichnet.

Quelle für alle API-Pfade und Parameter, sofern nicht anders angegeben:
`/Users/dennismenken/Projects/init4/buchhaltungsbutler-mcp/docs/openapi/buchhaltungsbutler-v1.json`
(Abruf/Stand der lokalen Kopie: 2026-09-12).

---

## 1. Glossar der Kernbegriffe

### Beleg (receipt / document)

Ein Beleg ist der Nachweis, dass ein Geschäftsvorfall stattgefunden hat: eine Rechnung, eine
Gutschrift, ein Kassenbon, ein Kontoauszug oder ein Lohnnachweis. In BuchhaltungsButler ist
der Beleg eine eigene Entität mit eigener Identität (`id_by_customer`), die unabhängig von
einer Zahlung existieren kann. Ein Beleg trägt Metadaten wie Gegenpartei, Rechnungsnummer,
Datum, Betrag und Umsatzsteuersatz, die entweder per API mitgegeben oder durch die
automatische Belegerkennung (OCR) ausgelesen werden. Ohne Beleg fehlt der GoBD-relevante
Nachweis für eine Buchung, auch wenn die Zahlung selbst bereits erfasst ist.
Quelle: `/receipts/add`, `/receipts/upload` in der OpenAPI-Spezifikation; Grundverständnis
Beleg allgemein (nicht BuchhaltungsButler-spezifisch).

### Eingangsbeleg (incoming document)

Ein Eingangsbeleg dokumentiert eine Leistung, die das Unternehmen empfangen hat, typischerweise
eine Eingangsrechnung eines Lieferanten. In der API entspricht das dem Typ `invoice inbound`
("Eingangsrechnung") oder `credit inbound` ("Eingangsgutschrift § 14 UStG"). Eingangsbelege
werden in der Regel mit Vorsteuer und, sofern Kreditorenbuchhaltung aktiv ist, einem Kreditor
verknüpft. Der Agent darf den Typ eines Belegs nicht selbst raten, wenn Gegenpartei und
Zahlungsrichtung nicht eindeutig sind.
Quelle: `/receipts/add`, Parameter `type` (OpenAPI).

### Ausgangsbeleg (outgoing document)

Ein Ausgangsbeleg dokumentiert eine Leistung, die das Unternehmen selbst erbracht und in
Rechnung gestellt hat. In der API entspricht das `invoice outbound` ("Ausgangsrechnung") oder
`credit outbound` ("Ausgangsgutschrift § 14 UStG"). Ausgangsbelege werden mit Umsatzsteuer
gebucht und, sofern Debitorenbuchhaltung aktiv ist, einem Debitor zugeordnet.
Quelle: `/receipts/add`, Parameter `type` (OpenAPI).

### Transaktion (transaction) / Bankumsatz

In BuchhaltungsButler bezeichnet "Transaktion" einen Zahlungsvorgang auf einem Zahlungskonto
(Bankkonto, Kasse, PayPal- oder Stripe-Konto): Geld fließt ein oder aus. Der deutsche Begriff
"Bankumsatz" wird umgangssprachlich synonym verwendet, meint aber im engeren Sinn nur
Bankkonten, während "Transaktion" in der API auch Kassen- und Zahlungsdienstleisterkonten
umfasst. Eine Transaktion hat einen Betrag (positiv für Eingang, negativ für Ausgang), ein
Buchungs- und ein Valutadatum sowie optional Kontodaten der Gegenseite. Eine Transaktion ist
zunächst nur ein Zahlungsfaktum, noch keine Buchung im Sinne der doppelten Buchführung.
Quelle: `/transactions/add`, `/transactions/get` (OpenAPI).

### Buchung (posting)

Eine Buchung ist der eigentliche verbuchte Geschäftsvorfall in der doppelten Buchführung: sie
weist einem Soll-Konto und einem Haben-Konto einen Betrag samt Steuerschlüssel zu.
BuchhaltungsButler kennt drei Arten von Buchungen über die API: die Buchung zu einer
Transaktion (`/postings/add/transaction`), die Buchung zu einem Beleg
(`/postings/add/receipt`) und die freie Buchung ohne Bezug zu Transaktion oder Beleg
(`/postings/add/free`). Erst durch die Buchung wird ein Vorgang steuerlich und handelsrechtlich
wirksam erfasst; Beleg und Transaktion allein reichen dafür nicht aus.
Quelle: `/postings/add/transaction`, `/postings/add/receipt`, `/postings/add/free` (OpenAPI).

### Buchungssatz (journal entry)

Der Buchungssatz ist die formale Notation einer Buchung nach dem Muster "Soll an Haben, Betrag,
Steuerschlüssel", z. B. "Bürobedarf 6815 an Bank 1200, 119,00 EUR, 19 % Vorsteuer". In den
Antwortdaten von `/postings/get` finden sich die Bestandteile eines Buchungssatzes als
`debit_postingaccount_number`, `credit_postingaccount_number`, `amount`, `vat`/`tax_key` und
`credit_type`. Beim Export im DATEV-Format enthält jede Zeile Datum, Betrag, Soll- und
Habenkonto, Steuerschlüssel, Buchungsnummer sowie den Beleglink.
Quelle: `/postings/get` (OpenAPI); Kontenrahmen-Artikel und GoBD-Artikel des Hilfecenters
(siehe Abschnitt 4), Abruf 2026-09-12.

### Soll (debit)

Soll ist die linke Seite eines Buchungssatzes bzw. eines Kontos. Auf Aktivkonten (z. B. Bank,
Kasse, Forderungen) bedeutet eine Buchung im Soll eine Zunahme, auf Passivkonten (z. B.
Verbindlichkeiten, Eigenkapital) eine Abnahme. Ob eine Buchung "richtig" im Soll oder Haben
steht, hängt vom Kontentyp ab, den ein Agent nicht selbst herleiten sollte, wenn er unsicher
ist. In der API entspricht das Sollkonto dem Parameter `postingaccount_debit` bzw. dem
Antwortfeld `debit_postingaccount_number`.
Annahme: Die kontentypbezogene Soll/Haben-Logik ist allgemeines Buchhaltungswissen, nicht aus
der BuchhaltungsButler-Dokumentation zitiert.

### Haben (credit)

Haben ist die rechte Seite eines Buchungssatzes bzw. eines Kontos. Auf Aktivkonten bedeutet
Haben eine Abnahme, auf Passivkonten eine Zunahme; auf Ertragskonten steht der laufende Umsatz
im Haben. In der API entspricht das Habenkonto dem Parameter `postingaccount_credit` bzw. dem
Antwortfeld `credit_postingaccount_number`; das Antwortfeld `credit_type` mit dem Wert `"H"`
markiert, welche Seite eines Postens Haben ist.
Quelle: `/postings/add/free`, `/postings/get` (OpenAPI).

### Gegenkonto (contra account / offsetting account)

Das Gegenkonto ist aus Sicht eines bestimmten Kontos das jeweils andere Konto eines
Buchungssatzes. Wird z. B. eine Banktransaktion für eine Bürobedarfsrechnung gebucht, ist aus
Sicht des Bankkontos 1200 das Konto "Bürobedarf" (z. B. 6815 in SKR03) das Gegenkonto, und
umgekehrt. Bei `/postings/add/transaction` und `/postings/add/receipt` gibt der Agent nur das
Gegenkonto zum bereits feststehenden Zahlungs- bzw. Kreditoren-/Debitorenkonto an
(`postingaccounts`); bei `/postings/add/free` müssen beide Seiten (`postingaccount_debit` und
`postingaccount_credit`) explizit angegeben werden.
Quelle: `/postings/add/transaction`, `/postings/add/receipt`, `/postings/add/free` (OpenAPI).

### Sachkonto (general ledger account)

Ein Sachkonto ist ein Konto der Finanzbuchhaltung, das sachliche Sachverhalte abbildet
(Aufwendungen, Erträge, Bestände) im Unterschied zu Personenkonten, die einzelne
Geschäftspartner abbilden. In BuchhaltungsButler heißen Sachkonten "Postingaccounts"; sie
werden über `/settings/get/postingaccounts` gelesen und über `/settings/add/postingaccount`
individuell angelegt, wobei ein neues Konto Eigenschaften von einem
`parent_postingaccount_number` erbt. Die Länge der Sachkontonummer (vier bis acht Stellen)
wird bei der initialen Einrichtung des Accounts festgelegt und ist nachträglich laut Angabe
des Hilfecenters nicht mehr änderbar.
Quelle: `/settings/add/postingaccount`, `/settings/get/postingaccounts` (OpenAPI); "Kontenrahmen
und Sachkontenlänge wählen", https://wissen.buchhaltungsbutler.de/hc/de/articles/11465983139101,
Abruf 2026-09-12.

### Personenkonto (subledger account for a business partner)

Ein Personenkonto ist ein Konto, das einen konkreten Geschäftspartner (Kunde oder Lieferant)
abbildet, technisch als Unterkonto der Sammelkonten "Forderungen" bzw.
"Verbindlichkeiten aus Lieferungen und Leistungen" geführt. In BuchhaltungsButler sind das die
Debitoren- und Kreditorenkonten. Laut Hilfecenter sind Debitoren-/Kreditorenkontonummern eine
Ziffer länger als Sachkonten, also fünf- bis neunstellig, je nach gewählter Sachkontenlänge.
Quelle: "Kontenrahmen und Sachkontenlänge wählen",
https://wissen.buchhaltungsbutler.de/hc/de/articles/11465983139101, Abruf 2026-09-12;
`/settings/add/creditor`, `/settings/add/debtor` (OpenAPI).

### Debitor (debtor / accounts receivable)

Ein Debitor ist ein Kunde, gegenüber dem eine Forderung besteht, weil er eine Leistung erhalten
und noch nicht (oder über ein Debitorenkonto verbucht) bezahlt hat. In der API wird ein Debitor
über `/settings/add/debtor` angelegt und über `/settings/get/debtors` gelesen; ein Ausgangsbeleg
kann direkt einem Debitorenkonto zugeordnet werden (Parameter `creditor_debtor` bei
`/receipts/add`, nur gültig für den passenden Belegtyp). Debitorenbuchhaltung muss laut
Fehlercode-Dokumentation von `/postings/add/receipt` für den Account aktiviert sein, bevor
Debitorenbuchungen möglich sind.
Quelle: `/settings/add/debtor`, `/receipts/add`, `/postings/add/receipt` (OpenAPI).

### Kreditor (creditor / accounts payable)

Ein Kreditor ist ein Lieferant, gegenüber dem eine Verbindlichkeit besteht, weil das Unternehmen
eine Leistung erhalten und noch nicht bezahlt hat. In der API wird ein Kreditor über
`/settings/add/creditor` angelegt und über `/settings/get/creditors` gelesen; ein Eingangsbeleg
kann direkt einem Kreditorenkonto zugeordnet werden. Auch hier gilt: Kreditorenbuchhaltung muss
für den Account aktiviert sein, sonst schlägt `/postings/add/receipt` mit dem Fehler "creditor
posting is not activated" fehl.
Quelle: `/settings/add/creditor`, `/receipts/add`, `/postings/add/receipt` (OpenAPI).

### Kontenrahmen (chart of accounts template)

Ein Kontenrahmen ordnet alle Geschäftsvorfallarten standardisierten Kontonummern zu und dient
als Vorlage für den betrieblichen Kontenplan. Laut Hilfecenter bietet BuchhaltungsButler die
Kontenrahmen SKR 03, SKR 03 Gastro, SKR 03 Ärzte, SKR 04, SKR 42, SKR 45 (soziale
Einrichtungen) und SKR 49 (Vereine) an. Der Kontenrahmen wird bei der Ersteinrichtung des
Accounts festgelegt.
Quelle: "Kontenrahmen und Sachkontenlänge wählen",
https://wissen.buchhaltungsbutler.de/hc/de/articles/11465983139101, Abruf 2026-09-12.

### SKR03

SKR 03 (Standardkontenrahmen 03 der DATEV e.G.) gliedert Konten nach Geschäftsprozessen von
Handel, Banken und Versicherungen. Er ist laut Hilfecenter der am häufigsten verwendete und von
den meisten Steuerberatern für Startups, Freiberufler und kleinere Unternehmen empfohlene
Kontenrahmen. Erkennungsmerkmal: Kasse liegt auf Konto 1000, Bank auf Konto 1200,
Umsatzerlöse 19 % auf Konto 8400. Details und Konsequenzen für die Kontenwahl siehe Abschnitt 3.
Quelle: "Kontenrahmen und Sachkontenlänge wählen",
https://wissen.buchhaltungsbutler.de/hc/de/articles/11465983139101, Abruf 2026-09-12.

### SKR04

SKR 04 gliedert Konten in Anlehnung an die Struktur des Jahresabschlusses (Bilanz und
Gewinn- und Verlustrechnung) und gilt laut Hilfecenter als moderner, weil er einen logischeren
Bezug zu BWA und Bilanz hat. Erkennungsmerkmal: Kasse liegt auf Konto 1600, Bank auf Konto 1800,
Umsatzerlöse 19 % auf Konto 4400. Details siehe Abschnitt 3.
Quelle: "Kontenrahmen und Sachkontenlänge wählen",
https://wissen.buchhaltungsbutler.de/hc/de/articles/11465983139101, Abruf 2026-09-12.

### Steuerschlüssel (tax key)

Der Steuerschlüssel legt fest, mit welchem Umsatzsteuer- oder Vorsteuersatz und in welchem
umsatzsteuerlichen Sachverhalt eine Buchung in die Umsatzsteuervoranmeldung einfließt. In der
API wird der Steuerschlüssel über den Parameter `vat` bzw. `vats` gesetzt; die zulässigen Werte
sind eine feste Liste von Codes wie `0_none`, `19_vat`, `7_vat`, `19_pre`, `7_pre` sowie diverse
`§13b`- und "i.g.E."-Varianten (vollständige Liste in Abschnitt 2 bzw. direkt in der
OpenAPI-Spezifikation bei `/postings/add/free`). Im DATEV-Exportformat wird zusätzlich ein
numerischer Steuerschlüssel (z. B. 94 für bestimmte §13b-Fälle) sowie ein "Sachverhalt L+L"
ausgegeben (API-Feld `circumstances_ll`).
Quelle: `/postings/add/transaction`, `/postings/add/free`, `/postings/get` (Parameter `vat`,
`vats`, Feld `circumstances_ll`, OpenAPI); "Logik der Steuerschlüssel, Sachverhalte §13b &
Automatikkonten", https://wissen.buchhaltungsbutler.de/hc/de/articles/11408521543581, Abruf
2026-09-12.

### Vorsteuer (input tax / VAT paid)

Vorsteuer ist laut Hilfecenter die "Mehrwertsteuer", die das Unternehmen selbst als Kunde bei
einer Eingangsrechnung bezahlt (Beispiel dort: eine Tankrechnung) und die es sich, sofern
vorsteuerabzugsberechtigt, vom Finanzamt erstatten lassen kann. Die zugehörigen Steuerschlüssel
in der API sind u. a. `19_pre` (19 % Vst.) und `7_pre` (7 % Vst.). Kleinunternehmer nach § 19
UStG sind laut Hilfecenter nicht zum Vorsteuerabzug berechtigt.
Quelle: "Logik der Steuerschlüssel, Sachverhalte §13b & Automatikkonten",
https://wissen.buchhaltungsbutler.de/hc/de/articles/11408521543581, Abruf 2026-09-12;
"Investitionsabzugsbetrag", https://wissen.buchhaltungsbutler.de/hc/de/articles/20068054846237,
Abruf 2026-09-12 (Aussage zur Kleinunternehmerregelung).

### Umsatzsteuer (output tax / VAT collected)

Umsatzsteuer ist laut Hilfecenter die "Mehrwertsteuer", die das Unternehmen bei eigenen
Ausgangsrechnungen von seinen Kunden vereinnahmt und an das Finanzamt abführen muss. Die
zugehörigen Steuerschlüssel in der API sind u. a. `19_vat` (19 % Ust.) und `7_vat` (7 % Ust.).
Umsatzsteuer und Vorsteuer werden über die Umsatzsteuervoranmeldung gegeneinander verrechnet.
Quelle: "Logik der Steuerschlüssel, Sachverhalte §13b & Automatikkonten",
https://wissen.buchhaltungsbutler.de/hc/de/articles/11408521543581, Abruf 2026-09-12.

### Umsatzsteuervoranmeldung, USt-VA (advance VAT return)

Die Umsatzsteuervoranmeldung ist die periodische (monatliche oder quartalsweise) Meldung von
Umsatzsteuer und Vorsteuer an das Finanzamt. BuchhaltungsButler bietet dafür laut Hilfecenter
eine eigene Funktion mit Warn- und Fehlermeldungen zur Plausibilisierung. In der aktuellen
OpenAPI-Spezifikation ist kein dedizierter Endpunkt zur direkten Erstellung/Übermittlung der
USt-VA über die API sichtbar (nicht verifiziert, ob dies über andere, nicht dokumentierte
Wege möglich ist); die Zahlen ergeben sich aus den Steuerschlüsseln der gebuchten Postings.
Quelle: "Warn- und Fehlermeldungen bei der Umsatzsteuer-Voranmeldung (USt-VA)",
https://wissen.buchhaltungsbutler.de/hc/de/articles/11432104747677, Abruf 2026-09-12 (Titel
und Thema, Inhalt nicht im Volltext verifiziert); OpenAPI-Pfadliste (`.paths`), Abruf
2026-09-12.

### Kostenstelle (cost location)

Eine Kostenstelle ordnet eine Buchung einem betrieblichen Bereich zu (z. B. Abteilung, Projekt,
Standort), um Auswertungen jenseits der reinen Kontenlogik zu ermöglichen. BuchhaltungsButler
nennt das Feld in der API `cost_location` bzw. `cost_locations` (Plural bei Batch-Buchungen) und
zusätzlich eine zweite, unabhängige Dimension `cost_location_two`. Kostenstellen werden über
`/cost-locations/add`, `/cost-locations/get`, `/cost-locations/update` und
`/cost-locations/delete` verwaltet und müssen, wenn angegeben, gültig sein, sonst wird der
Buchungsversuch abgelehnt.
Quelle: `/postings/add/free`, `/postings/add/transaction`, `/cost-locations/*` (OpenAPI).

### BWA (betriebswirtschaftliche Auswertung, business analysis report)

Die BWA ist eine kurzfristige Erfolgsrechnung, die typischerweise monatlich Umsätze, Kosten und
Ergebnis eines Unternehmens zusammenfasst und häufig als Grundlage für Bankgespräche oder die
laufende Steuerung genutzt wird. In der API wird eine BWA über `/reports/create/bwa` für einen
Zeitraum (`date_from`, `date_to`) asynchron angestoßen und anschließend über
`/reports/get/bwa` abgerufen; eine neue BWA-Erstellung ist laut Beschreibung erst möglich, wenn
eine zuvor angeforderte BWA desselben Typs fertiggestellt ist.
Quelle: `/reports/create/bwa`, `/reports/get/bwa` (OpenAPI).

### Summen- und Saldenliste, SuSa (trial balance)

Die Summen- und Saldenliste listet für alle Konten eines Zeitraums die Soll- und Habensummen
sowie den daraus resultierenden Saldo auf und ist die zentrale Kontrollliste der
Finanzbuchhaltung. In der API wird sie über `/reports/create/sums` (Parameter `date_from`,
`date_to`, optional `base` für Buchungs- oder Leistungsdatum, sowie Export-Flags `file_pdf`,
`file_csv`, `archive_export`) erzeugt und über `/reports/get/sums` abgerufen. Die SuSa wird laut
Beschreibung immer für alle Postingaccounts des Kunden erstellt.
Quelle: `/reports/create/sums`, `/reports/get/sums` (OpenAPI).

### Kontenblatt (account ledger)

Das Kontenblatt zeigt alle Buchungen eines einzelnen Kontos in einem Zeitraum mit laufendem
Saldo. In der API wird es über `/reports/get/sums/ledger` abgerufen (Parameter
`postingaccount_number`, `date_from`, `date_to`, `base`); im Unterschied zur SuSa wird das
Kontenblatt laut Beschreibung "on the fly" erzeugt, ohne dass vorher ein Report erstellt werden
muss, was bei Konten mit vielen Buchungen aber dauern kann.
Quelle: `/reports/get/sums/ledger` (OpenAPI).

### Journal (posting journal)

Das Journal ist die chronologische Auflistung aller Buchungen in der Reihenfolge ihrer
Erfassung, im Unterschied zum Kontenblatt, das nach Konten sortiert. In der API entspricht dem
Journal am ehesten `/postings/get`, das Buchungen mit allen Buchungssatzfeldern zurückgibt;
ein separater, explizit "Journal" benannter Endpunkt existiert in der Pfadliste nicht (nicht
verifiziert, ob "Journal" nur ein alternativer Sichtname für dieselben Daten in der
Weboberfläche ist). Der GoBD-Artikel des Hilfecenters erwähnt eine "Buchhaltungssoftware mit
Journalfunktion" als Bestandteil der Anwendung.
Quelle: `/postings/get` (OpenAPI); "GoBD konformes Arbeiten mit BuchhaltungsButler",
https://wissen.buchhaltungsbutler.de/hc/de/articles/11432424987037, Abruf 2026-09-12.

### Geschäftsjahr (fiscal year)

Das Geschäftsjahr ist der Zeitraum, für den ein Unternehmen seinen Jahresabschluss erstellt; es
muss zwölf Monate umfassen, aber nicht zwingend mit dem Kalenderjahr identisch sein (abweichendes
Geschäftsjahr). In der BuchhaltungsButler-API wird kein Geschäftsjahr als eigenes Objekt
verwaltet; Berichte wie BWA und SuSa werden stattdessen für frei wählbare Zeiträume
(`date_from`/`date_to`) erzeugt. Annahme: Ob und wie ein abweichendes Geschäftsjahr in der
Kontenführung von BuchhaltungsButler abgebildet wird, ist anhand der OpenAPI-Spezifikation und
der eingesehenen Hilfeartikel nicht verifiziert.

### Wirtschaftsjahr (business year)

Wirtschaftsjahr ist der steuerrechtliche Begriff (§ 4a EStG) für denselben Zeitraum, den das
Handelsrecht Geschäftsjahr nennt; bei den meisten Unternehmen sind beide identisch mit dem
Kalenderjahr. Für die Arbeit mit der API ist die Unterscheidung selten relevant, da Berichte
zeitraumbasiert und nicht jahresgebunden abgerufen werden. Annahme/allgemeines Wissen, nicht
BuchhaltungsButler-spezifisch belegt.

### Eröffnungsbilanz (opening balance sheet)

Die Eröffnungsbilanz stellt die Vermögens- und Kapitalwerte zu Beginn eines Geschäftsjahres
bzw. bei Gründung dar und ist Ausgangspunkt der laufenden Buchführung. Das Hilfecenter führt
einen Artikel "Wie buche ich Anfangsbestände bzw. EB-Werte ein?", was auf eine manuelle
Erfassung von Eröffnungsbilanzwerten als Buchungen hindeutet; ein dedizierter API-Endpunkt dafür
ist in der Pfadliste nicht erkennbar (nicht verifiziert). Anfangsbestände werden vermutlich über
freie Buchungen (`/postings/add/free`) auf die betroffenen Bestandskonten eingebucht.
Quelle (Titel, Inhalt nicht im Volltext verifiziert): "Wie buche ich Anfangsbestände bzw.
EB-Werte ein?", https://wissen.buchhaltungsbutler.de/hc/de/articles/11409068699421, Abruf
2026-09-12.

### Jahresabschluss (annual financial statement)

Der Jahresabschluss (Bilanz und Gewinn- und Verlustrechnung, bei Kleinunternehmern/Freiberuflern
oft nur die Einnahmenüberschussrechnung, EÜR) ist der verpflichtende Abschluss des
Rechnungswesens für ein Geschäftsjahr. BuchhaltungsButler unterstützt laut Hilfecenter die
Erstellung des amtlichen Formulars "Anlage EÜR". Ein API-Endpunkt speziell zur Erstellung eines
Jahresabschlusses ist in der Pfadliste nicht erkennbar; der Jahresabschluss dürfte auf den über
`/reports/*` abrufbaren Auswertungen aufbauen (Annahme).
Quelle (Titel, Inhalt nicht im Volltext verifiziert): "Das amtliche Formular Anlage EÜR
erstellen", https://wissen.buchhaltungsbutler.de/hc/de/articles/29104969813277, Abruf
2026-09-12.

### GoBD (Grundsätze zur ordnungsmäßigen Führung und Aufbewahrung von Büchern, Aufzeichnungen
und Unterlagen in elektronischer Form sowie zum Datenzugriff)

Die GoBD sind ein BMF-Schreiben, das die Anforderungen an eine ordnungsgemäße elektronische
Buchführung konkretisiert: Nachvollziehbarkeit, Vollständigkeit, Richtigkeit, zeitgerechte
Erfassung, Ordnung und vor allem Unveränderbarkeit einmal erfasster Daten. BuchhaltungsButler
beschreibt in einem eigenen Artikel, wie die Software diese Anforderungen technisch umsetzt
(u. a. unveränderbare Archivierung, Protokollierung von Upload- und Festschreibedatum,
GUID-basierte Belegverknüpfung). Details siehe Abschnitt 4.
Quelle: "GoBD konformes Arbeiten mit BuchhaltungsButler",
https://wissen.buchhaltungsbutler.de/hc/de/articles/11432424987037, Abruf 2026-09-12.

### DATEV

DATEV eG ist die Genossenschaft der steuerberatenden Berufe, deren Kontenrahmen (SKR03, SKR04
u. a.) und Datenformate (DATEV-Format für Buchungssätze, DATEV-XML-Schnittstelle für
Belegverknüpfung) als Quasi-Standard für den Datenaustausch zwischen Mandant und Steuerberater
in Deutschland gelten. BuchhaltungsButler kann Buchungssätze im DATEV-Format importieren und
exportieren (inklusive Belegbildern über die GUID-Verknüpfung) und referenziert die
DATEV-Kontenrahmenbeschreibung SKR03 als Grundlage für die Zuordnung von Automatikkonten zu
Positionen der Umsatzsteuervoranmeldung.
Quelle: `/reports/create/sums` (Exportformate, Annahme aus Kontext), "DATEV: Buchungssätze und
Belege importieren", https://wissen.buchhaltungsbutler.de/hc/de/articles/11445618180125, und
"Buchungssätze und Belegbilder in unterschiedlichen Formaten exportieren",
https://wissen.buchhaltungsbutler.de/hc/de/articles/11445407988637 (Titel/Auszug, nicht
vollständig im Volltext verifiziert), sowie "Logik der Steuerschlüssel, Sachverhalte §13b &
Automatikkonten", https://wissen.buchhaltungsbutler.de/hc/de/articles/11408521543581, Abruf
jeweils 2026-09-12.

### Kleinunternehmerregelung (small business VAT exemption, § 19 UStG)

Die Kleinunternehmerregelung befreit Unternehmer mit geringem Umsatz von der Pflicht, Umsatzsteuer
auszuweisen und abzuführen; im Gegenzug entfällt der Vorsteuerabzug. Laut Hilfecenter sind
Kleinunternehmer, die die Regelung in Anspruch nehmen, "nicht zum Vorsteuerabzug berechtigt" und
müssen deshalb Bruttobeträge als Anschaffungskosten ansetzen. Für die Buchung bedeutet das: Der
Steuerschlüssel `0_none` ("keine Ust.") ist regelmäßig einschlägig, nie ein `_pre`- oder
`_vat`-Schlüssel. Ein Agent muss vor jeder Buchung wissen, ob der Mandant Kleinunternehmer ist,
da sich sonst falsche Steuerschlüssel einschleichen.
Quelle: "Investitionsabzugsbetrag",
https://wissen.buchhaltungsbutler.de/hc/de/articles/20068054846237, Abruf 2026-09-12 (Aussage
zur Kleinunternehmerregelung im Kontext dieses Artikels; kein dedizierter
Kleinunternehmer-Artikel im Hilfecenter gefunden).

### Reverse Charge (§ 13b UStG)

Reverse Charge kehrt die Steuerschuldnerschaft um: Nicht der leistende Unternehmer, sondern der
Leistungsempfänger schuldet die Umsatzsteuer. Laut Hilfecenter wird in BuchhaltungsButler mit
dem Steuerschlüssel "§13b" der Fall abgebildet, dass der Empfänger einer sonstigen Leistung eines
EU-Unternehmens (Beispiel dort: Suchmaschinenmarketing aus Irland) die Umsatzsteuer schuldet;
dieser Fall wird automatisch als "Sachverhalt L+L = 7" im Export geführt. Andere §13b-Sachverhalte
(z. B. Bauleistungen) lassen sich laut Hilfecenter aktuell nur über spezielle, von DATEV
definierte "Automatikkonten" korrekt buchen, nicht über freie Kontenwahl mit §13b-Steuerschlüssel.
Quelle: "Logik der Steuerschlüssel, Sachverhalte §13b & Automatikkonten",
https://wissen.buchhaltungsbutler.de/hc/de/articles/11408521543581, Abruf 2026-09-12.

### Innergemeinschaftliche Lieferung / innergemeinschaftlicher Erwerb (intra-community
supply/acquisition)

Der innergemeinschaftliche Erwerb (i.g.E.) betrifft laut Hilfecenter Wareneinkäufe (ausdrücklich
nicht Dienstleistungen) im EU-Ausland, die dem Reverse-Charge-Verfahren unterliegen: Der Käufer
führt die Umsatzsteuer ab und zieht im selben Zug die Vorsteuer, sodass sich beide Beträge
saldenneutral verhalten (abgesehen von Rundungsdifferenzen). In der API existieren dafür eigene
Steuerschlüssel wie `19_both_2` ("I.g.E. 19% USt./VSt.") und `7_both`. Die spiegelbildliche
innergemeinschaftliche Lieferung (eigener Verkauf ins EU-Ausland) wird in den eingesehenen
Quellen nicht mit eigenem Namen behandelt; Annahme: Sie dürfte über den Steuerschlüssel
`0_none` bei entsprechendem Ausweis der Erwerber-USt-ID gebucht werden, dies ist jedoch nicht
verifiziert.
Quelle: `/postings/add/transaction` (Parameter `vats`, OpenAPI); "Logik der Steuerschlüssel,
Sachverhalte §13b & Automatikkonten",
https://wissen.buchhaltungsbutler.de/hc/de/articles/11408521543581, Abruf 2026-09-12.

### E-Rechnung (electronic invoice / e-invoice)

Eine E-Rechnung ist im Sinne des deutschen Umsatzsteuerrechts (seit dem Wachstumschancengesetz)
eine Rechnung in einem strukturierten elektronischen Format, das eine automatische elektronische
Verarbeitung ermöglicht, im Unterschied zu einer reinen PDF- oder Papierrechnung. In der API
existiert dafür der Endpunkt `/invoices/create/e-invoice`, der Rechnungstyp (`invoice`, `credit`,
`offer`), Positionsdaten und Steuertypen je Position (`S`, `Z`, `AE`, `K`, `G`, `E`) sowie einen
verpflichtenden `e_invoice_id` (Buyer Reference/Leitweg-ID, Pflichtfeld gegenüber öffentlichen
Auftraggebern) entgegennimmt. Rechtlicher Stand siehe Abschnitt 4.
Quelle: `/invoices/create/e-invoice` (OpenAPI).

### XRechnung

XRechnung ist ein rein strukturiertes, rein maschinenlesbares XML-Format für E-Rechnungen, das
in Deutschland insbesondere für Rechnungen an öffentliche Auftraggeber (B2G) verbindlich
vorgeschrieben ist. Annahme: Der Endpunkt `/invoices/create/e-invoice` dürfte XRechnung als
eines der unterstützten Ausgabeformate erzeugen können, da das Pflichtfeld `e_invoice_id`
("Buyer reference … für e-invoices to public contracting authorities") direkt auf den
B2G-Anwendungsfall verweist; welches konkrete Format (XRechnung vs. ZUGFeRD) dabei erzeugt wird,
ist in der OpenAPI-Spezifikation nicht spezifiziert und damit nicht verifiziert.
Quelle: `/invoices/create/e-invoice`, Parameter `e_invoice_id` (OpenAPI).

### ZUGFeRD

ZUGFeRD ist ein Hybridformat für E-Rechnungen: eine PDF/A-Datei mit eingebettetem strukturierten
XML-Datensatz, wodurch die Rechnung sowohl für Menschen lesbar als auch maschinell verarbeitbar
ist. In den eingesehenen Teilen der OpenAPI-Spezifikation und der Hilfecenter-Treffer wird
ZUGFeRD nicht ausdrücklich erwähnt; nicht verifiziert, ob und in welcher Version
BuchhaltungsButler ZUGFeRD aktiv erzeugt oder nur empfängt/verarbeitet (das Feld `file` bei
`/receipts/upload` akzeptiert laut Beschreibung u. a. `application/pdf` und `text/xml`/
`application/xml`, was mit dem Empfang von ZUGFeRD- oder XRechnung-Dateien vereinbar wäre).
Quelle: `/receipts/upload`, Parameter `file` (OpenAPI); allgemeines Wissen zu ZUGFeRD als
Format, nicht BuchhaltungsButler-spezifisch belegt.

---

## 2. Der typische Ablauf: von Beleg und Bankumsatz zur Buchung

BuchhaltungsButler modelliert drei voneinander unabhängige, aber verknüpfbare Objekte: Beleg,
Transaktion und Buchung. Der folgende Ablauf beschreibt den Regelfall der laufenden Buchhaltung
(Beleg + Bankzahlung → gemeinsame Buchung). Alternative Abläufe (freie Buchung ohne Beleg und
Transaktion, oder Beleg ohne Bankbezug bei Bar-/Auslagenbuchungen) werden im Anschluss
benannt.

1. **Ein Beleg entsteht.** Eine Rechnung, Gutschrift oder ein vergleichbares Dokument fällt an
   (Eingangsrechnung eines Lieferanten oder Ausgangsrechnung an einen Kunden). Der Beleg wird in
   BuchhaltungsButler entweder als reine Metadaten-Erfassung ohne Datei über `POST
   /receipts/add` angelegt, oder als Datei-Upload über `POST /receipts/upload`, wobei die
   Belegerkennung (OCR) Gegenpartei, Rechnungsnummer, Datum, Betrag und Umsatzsteuersatz
   automatisch ausliest. Alternativ kann eine strukturierte E-Rechnung direkt über `POST
   /invoices/create/e-invoice` erzeugt werden (für selbst ausgestellte Rechnungen).
   Batch-Verarbeitung mehrerer Belege ist über `POST /receipts/addBatch` möglich.

2. **Ein Bankumsatz (die Transaktion) kommt an.** Unabhängig vom Beleg wird eine Zahlung auf
   einem Zahlungskonto erfasst: entweder automatisch durch eine Bank-/PayPal-/Stripe-Anbindung
   (außerhalb der hier betrachteten API-Endpunkte) oder manuell/programmatisch über `POST
   /transactions/add` (bzw. `POST /transactions/addBatch` für mehrere Transaktionen auf einmal).
   Wichtige Felder sind `account` (Zahlungskonto), `to_from` (Zahlungspartner), `amount`
   (positiv = Eingang, negativ = Ausgang), `booking_date`/`value_date` und optional
   `payment_reference`.

3. **Beleg und Transaktion werden einander zugeordnet (Matching).** Damit aus zwei getrennten
   Fakten (Rechnung, Zahlung) ein gemeinsamer Geschäftsvorfall wird, müssen sie miteinander
   verknüpft werden. Das geschieht über `POST /transactions/assign/receipt` (bzw. äquivalent
   `POST /postings/assign/receipt-to-free-posting` bzw. `POST
   /transactions/assign-batch/receipt` für Massenzuordnung) mit `transaction_id_by_customer` und
   `receipt_id_by_customer`. Laut Hilfecenter-Artikel "Belegmatching verstehen und optimieren"
   versucht BuchhaltungsButler dieses Matching automatisch anhand von Betrag, Rechnungsnummer,
   Gegenpartei oder einer expliziten `payment_reference`; gelingt der automatische Abgleich
   nicht, muss die Zuordnung manuell bzw. per API erfolgen. Der aktuelle Zuordnungsstand eines
   Belegs lässt sich über `GET`-artige Aufrufe wie `POST /receipts/assigned-transactions/get`
   bzw. `POST /transactions/assigned-receipts/get` prüfen; eine bestehende Zuordnung kann über
   `POST /transactions/unassign/receipt` wieder aufgehoben werden.

4. **Aus der Verknüpfung entsteht eine Buchung.** Erst jetzt wird der Geschäftsvorfall
   buchhalterisch wirksam erfasst: `POST /postings/add/transaction` verbucht die Transaktion
   gegen ein oder mehrere Gegenkonten (`postingaccounts`, `postingtexts`, `vats`, `amounts`,
   optional `cost_locations`); ist die Transaktion bereits mit einem Beleg verknüpft, kann die
   Buchung stattdessen (oder zusätzlich, je nach Konfiguration) über `POST /postings/add/receipt`
   direkt am Beleg erfasst werden, unter Angabe von `creditor` oder `debtor`, falls Personenkonten
   aktiv sind. Für Geschäftsvorfälle ganz ohne Transaktions- oder Belegbezug (z. B. reine
   Umbuchungen, Abschreibungen, Rückstellungen) existiert `POST /postings/add/free` mit
   explizitem Soll- und Habenkonto (`postingaccount_debit`, `postingaccount_credit`). Für
   Massenverarbeitung stehen `POST /postings/add-batch/transactions`, `POST
   /postings/add-batch/receipts` und `POST /postings/add-batch/free` zur Verfügung.

5. **Buchungen können gelesen, aber nicht beliebig geändert werden.** Über `POST
   /postings/get` lassen sich Buchungen samt allen Buchungssatzfeldern (Konten, Beträge,
   Steuerschlüssel, verknüpfte Belege) abfragen. Eine Korrektur erfolgt nicht durch Bearbeiten,
   sondern durch Stornieren über `POST /postings/cancel`: nicht festgeschriebene Buchungen
   werden dabei laut Beschreibung gelöscht, festgeschriebene Buchungen durch eine
   Stornobuchung (Umkehrbuchung) storniert. Ergänzend existieren `POST
   /postings/unconfirm/transaction`, `POST /postings/unconfirm/receipt` und `POST
   /postings/unconfirm/free`, um eine Buchung in einen unbestätigten Zustand zurückzuversetzen
   (Details zur genauen fachlichen Wirkung dieser drei Endpunkte sind aus der
   OpenAPI-Kurzbeschreibung allein nicht abschließend verifizierbar und sollten vor produktivem
   Einsatz am Testaccount geprüft werden).

6. **Auswertungen bilden den Zustand der Buchhaltung ab.** BWA (`POST /reports/create/bwa` →
   `POST /reports/get/bwa`), Summen- und Saldenliste (`POST /reports/create/sums` → `POST
   /reports/get/sums`) und Kontenblatt (`POST /reports/get/sums/ledger`) fassen die gebuchten
   Postings periodenbezogen zusammen. Diese Berichte sind das, woran ein Steuerberater oder eine
   Bank die Zahlen des Unternehmens prüft; ein Agent, der Buchungsfehler vermutet, sollte sich an
   diesen Berichten orientieren, statt Rohdaten selbst zu aggregieren.

Kurzformel für den Regelfall: **Beleg + Transaktion → Zuordnung (Matching) → Buchung
(Postingsatz) → Bericht.** Nicht jeder Schritt ist in jedem Geschäftsvorfall zwingend in dieser
Reihenfolge nötig (z. B. kann eine freie Buchung ganz ohne Beleg und Transaktion entstehen, oder
ein Kassenbeleg kann laut Hilfecenter-Funktion "Beleg erzeugt Transaktion" direkt selbst eine
Zahlung erzeugen); der oben beschriebene Ablauf ist aber der von BuchhaltungsButler in der
Weboberfläche nahegelegte und API-seitig am besten dokumentierte Weg.
Quelle: `.paths` der OpenAPI-Spezifikation (alle in diesem Abschnitt genannten Endpunkte);
"Belegmatching verstehen und optimieren",
https://wissen.buchhaltungsbutler.de/hc/de/articles/11443781087389, Abruf 2026-09-12; "Buchhaltung
und Zahlungszuordnung am Beleg",
https://wissen.buchhaltungsbutler.de/hc/de/articles/16331531911837 (Titel, Kurzinhalt aus
Suchtreffer, nicht vollständig im Volltext verifiziert), Abruf 2026-09-12.

---

## 3. SKR03 gegen SKR04

### Erkennungsmerkmale

Der verwendete Kontenrahmen lässt sich laut Hilfecenter-Artikel "Kontenrahmen und
Sachkontenlänge wählen" am einfachsten anhand der Kontonummern von Kasse und Bank bestimmen:

| Kontenrahmen | Kasse | Bank | Umsatzerlöse 19 % |
|---|---|---|---|
| SKR 03 | 1000 | 1200 | 8400 |
| SKR 04 | 1600 | 1800 | 4400 |
| SKR 45 (soziale Einrichtungen) | 1220 | 1260 | (nicht angegeben) |
| SKR 49 (Vereine) | 0920 | 0945 | (nicht angegeben) |

Quelle: "Kontenrahmen und Sachkontenlänge wählen",
https://wissen.buchhaltungsbutler.de/hc/de/articles/11465983139101, Abruf 2026-09-12.

### Strukturprinzip

- **SKR 03** ist nach Geschäftsprozessen von Handel, Banken und Versicherungen gegliedert
  (prozessorientiert): grob gesagt folgen die Kontenklassen dem Ablauf von Finanz- und
  Bestandskonten über Aufwands- zu Erlöskonten.
- **SKR 04** ist an die Struktur des Jahresabschlusses angelehnt (bilanzorientiert): Die
  Kontenklassen folgen der Gliederung von Bilanz (Aktiva/Passiva) und
  Gewinn- und Verlustrechnung.

Beide Kontenrahmen sind laut Hilfecenter DATEV-Publikationen; SKR03 gilt dort als der am
häufigsten verwendete und von den meisten Steuerberatern für Startups, Freiberufler und
kleinere Unternehmen empfohlene Kontenrahmen, SKR04 als "moderner" mit besserem Bezug zu BWA
und Bilanz.
Quelle: wie oben.

### Konsequenz für einen Agenten, der ein Gegenkonto wählt

1. **Der Agent darf niemals eine feste Kontonummer aus dem Gedächtnis oder aus einem Beispiel
   verwenden, ohne vorher den tatsächlich aktiven Kontenrahmen des Accounts geprüft zu haben.**
   Die Zahl "8400" bedeutet in SKR03 "Umsatzerlöse 19 %", könnte in SKR04 aber ein völlig anderes
   Konto sein (nicht verifiziert, welches genau, da hierzu keine vollständige SKR04-Kontenliste
   recherchiert wurde). Falsches Kontenraten führt zu falschen Steuerschlüsseln, falschen
   BWA-Positionen und im schlimmsten Fall zu einer falschen Umsatzsteuervoranmeldung.
2. **Der korrekte Weg ist, die tatsächlich existierenden Postingaccounts über `POST
   /settings/get/postingaccounts` abzufragen** und anhand von Name und Nummer das passende
   Gegenkonto zu identifizieren, statt eine Nummer zu raten oder aus einem Trainingsbeispiel zu
   übernehmen, das für einen anderen Kontenrahmen galt.
3. **Ein Kontenrahmenwechsel ist laut Hilfecenter nach der Ersteinrichtung nur in
   Ausnahmefällen und nur über den Support möglich, und ausschließlich solange noch keine
   Buchung festgeschrieben wurde.** Danach ist "kein Wechsel des Kontenrahmens mehr möglich".
   Ein Agent darf also niemals eigenständig vorschlagen oder versuchen, den Kontenrahmen eines
   produktiven Accounts zu wechseln; das ist ausschließlich eine Entscheidung des Menschen in
   Absprache mit dem Steuerberater, und selbst dann nur über den BuchhaltungsButler-Support.
4. **Die Sachkontenlänge (vier bis acht Stellen) ist laut Hilfecenter nachträglich nicht mehr
   änderbar.** Individuell angelegte Sachkonten (`POST /settings/add/postingaccount`) müssen sich
   an diese Länge halten; ein Agent, der ein neues Konto anlegt, sollte sich an bestehenden
   Kontonummern orientieren, statt eine Länge zu erraten.
5. **Individuell angelegte Konten erben laut Hilfecenter-Fehlercode-Beschreibung ihre
   Eigenschaften von einem `parent_postingaccount_number`.** Der Agent muss ein sinnvolles,
   fachlich passendes Elternkonto wählen (z. B. ein bestehendes Aufwandskonto derselben Art),
   sonst kann das neue Konto falsche Steuer- oder Buchungsregeln erben.

Quelle: "Kontenrahmen und Sachkontenlänge wählen",
https://wissen.buchhaltungsbutler.de/hc/de/articles/11465983139101, Abruf 2026-09-12;
`/settings/get/postingaccounts`, `/settings/add/postingaccount` (OpenAPI).

---

## 4. Rechtliche Leitplanken

### GoBD

Die GoBD verlangen von einer elektronischen Buchführung insbesondere: Nachvollziehbarkeit und
Nachprüfbarkeit, Vollständigkeit, Richtigkeit, zeitgerechte Buchung, Ordnung und
Unveränderbarkeit. BuchhaltungsButler beschreibt in seinem GoBD-Artikel die technische Umsetzung
wie folgt:

- Beim Beleg-Upload werden automatisiert unveränderliche Indexdaten erzeugt (`guid`,
  `receipts_id`, `date_uploaded`, `filename_original`).
- Bei der Verbuchung werden ebenfalls unveränderliche Indexdaten erzeugt, u. a. `postings_id`,
  `date_last_action` (Buchungsdatum) und `date_fixed` (Festschreibedatum).
- Zulässige Belegformate für die Übertragung sind PDF, JPEG, PNG, TIFF, BMP und GIF; für
  Recherche und Langzeitarchivierung werden Dokumente zusätzlich ins PDF-Format gewandelt.
- "Die archivierten Datenbestände sind grundsätzlich unveränderbar." Das gilt sowohl für die
  Dateien als auch für die intern generierten Indexmerkmale. Nutzer können nachträglich weitere
  Indexmerkmale ergänzen oder Erfassungsfehler in den Indexinformationen korrigieren (z. B.
  Gegenpartei, Rechnungsnummer), aber die ursprünglich archivierte Datei selbst bleibt
  unverändert.
- "Das Löschen einmal hochgeladener Dokumente ist grundsätzlich physisch nicht möglich."
  Gelöschte Dokumente werden nur als solche markiert und bleiben über einen Filter
  ("Gelöschte Dokumente anzeigen") sichtbar und wiederherstellbar.
- Die Archivierung erfolgt laut Artikel ausschließlich in deutschen Rechenzentren von AWS EMEA
  in Frankfurt am Main.
- Im Betriebsprüfungsfall exportiert BuchhaltungsButler laut Artikel innerhalb von 14
  Werktagen eine CSV-Datei mit u. a. den Spalten Datum, Buchungsdatum, Festschreibedatum,
  Betrag, Währung, Sollkonto, Habenkonto, Steuerschlüssel, Buchungsnummer, Beleglink,
  Festschreibekennzeichen, Kostenstelle, sowie eine DATEV-XML-Datei zur Belegzuordnung über die
  GUID.
- Nach Vertragsende werden Daten laut Artikel nach Ablauf einer 10-Jahresfrist gelöscht, sofern
  keine anderweitigen gesetzlichen Fristen entgegenstehen.

Für einen Agenten bedeutet das praktisch: Einmal festgeschriebene Buchungen und einmal
hochgeladene Belege sind aus GoBD-Gründen technisch nicht löschbar, sondern nur stornierbar bzw.
als gelöscht markierbar. Korrekturen erfolgen durch neue, gegenläufige Buchungssätze, nie durch
nachträgliches Verändern oder physisches Entfernen bestehender Daten.
Quelle: "GoBD konformes Arbeiten mit BuchhaltungsButler",
https://wissen.buchhaltungsbutler.de/hc/de/articles/11432424987037, Abruf 2026-09-12.

### Aufbewahrungsfristen

Nach § 147 AO und § 257 HGB müssen Buchungsbelege, Handelsbücher, Inventare, Jahresabschlüsse
und aufbewahrungspflichtige Geschäftsbriefe grundsätzlich aufbewahrt werden. Durch das Vierte
Bürokratieentlastungsgesetz wurde die Aufbewahrungsfrist für Buchungsbelege (z. B. Rechnungen,
Kassenbelege) von zehn auf acht Jahre verkürzt; die Verkürzung gilt für alle Belege, deren Frist
zu Jahresbeginn 2025 noch nicht abgelaufen war. Nicht verkürzt wurde die Zehn-Jahres-Frist für
Jahresabschlüsse, Handelsbücher und Inventare selbst. Für Kreditinstitute und Versicherungen gilt
die verkürzte Frist laut Quelle erst ab 2026.

BuchhaltungsButler selbst verspricht laut GoBD-Artikel, Datenbestände "über die … vertraglich
vereinbarte Aufbewahrungsdauer, mindestens jedoch für einen Zeitraum, der durch den Gesetzgeber …
vorgesehen ist" online verfügbar zu halten, und löscht Daten nach Vertragsende erst nach zehn
Jahren. Ein Agent darf niemals eigenständig veranlassen, Belege oder Buchungen vor Ablauf der
gesetzlichen Frist endgültig zu entfernen; ohnehin verhindert die Systemarchitektur laut GoBD-
Artikel das physische Löschen archivierter Dokumente.

Quellen: "Verkürzung der Aufbewahrungsfristen für Buchungsbelege auf 8 Jahre",
https://www.bbh-blog.de/allgemein/verkuerzung-der-aufbewahrungsfristen-fuer-buchungsbelege-auf-8-jahre-unternehmen-muessen-ihr-loeschkonzept-nach-ds-gvo-ueberpruefen-buerokratiebelastung-statt-buerokratieentlastung/,
Abruf 2026-09-12 (Sekundärquelle zu § 147 AO / § 257 HGB, Gesetzestext selbst nicht direkt
eingesehen); "GoBD konformes Arbeiten mit BuchhaltungsButler",
https://wissen.buchhaltungsbutler.de/hc/de/articles/11432424987037, Abruf 2026-09-12.

### Unveränderbarkeit von Buchungen, warum man storniert statt löscht

BuchhaltungsButler unterscheidet zwischen nicht festgeschriebenen und festgeschriebenen
Buchungen:

- **Nicht festgeschriebene Buchungen** können laut API-Beschreibung von `/postings/cancel`
  gelöscht werden.
- **Festgeschriebene Buchungen** werden laut derselben Beschreibung "durch Erstellung einer
  Stornobuchung" storniert, also durch eine gegenläufige Buchung ausgeglichen, nie durch
  Entfernen des ursprünglichen Satzes.

Der Hilfecenter-Artikel "Löschen von festgeschriebenen Zahlungen und Belegen" konkretisiert das
für die Weboberfläche: Zahlungen mit festgeschriebener Buchung können "aus technischen Gründen
nicht gelöscht werden". Als Weg wird u. a. genannt, die Zahlung mit leerem Buchungskonto zu
speichern, wodurch die ursprünglich festgeschriebene Buchung gelöscht und im Hintergrund
automatisch eine Stornobuchung erzeugt wird. Auch bei Belegen mit festgeschriebener
debitorischer/kreditorischer Buchung gilt: Erst wenn die zugehörige Buchung vollständig entfernt
ist (was ebenfalls automatisch eine Stornobuchung im Hintergrund erzeugt), kann der Beleg selbst
gelöscht werden – wobei auch gelöschte Belege laut Hinweis "aus Gründen der Revisionssicherheit
nie gänzlich gelöscht" werden, sondern nur über einen Filter ausgeblendet und bei Bedarf
wiederhergestellt werden können.

Für Reverse-Charge-/§13b-Stornierungen gibt es außerdem einen eigenen technischen
Steuerschlüssel "GU" (Generalumkehrschlüssel), der eine stornierte Buchung beim Export in ein
Drittsystem als Buchung mit negativem Betrag, aber gleicher Soll-/Haben-Position abbildet, damit
sich Werte in der Summen- und Saldenliste korrekt reduzieren, statt sich zu addieren.

Für einen Agenten folgt daraus zwingend: **Ein fehlerhafter, bereits festgeschriebener
Buchungssatz wird niemals durch erneutes Buchen "überschrieben" oder durch Löschversuche
korrigiert, sondern ausschließlich durch `/postings/cancel` bzw. die entsprechende
Stornologik.** Ein Löschversuch auf festgeschriebenen Daten wird entweder von der API
zurückgewiesen oder erzeugt intransparente Stornobuchungen, die der Agent nicht selbst
veranlassen sollte, ohne die Konsequenz (offene, ungebuchte Zahlung mit Warnmeldung in Exporten
und Auswertungen) verstanden zu haben.

Quelle: `/postings/cancel` (OpenAPI); "Löschen von festgeschriebenen Zahlungen und Belegen",
https://wissen.buchhaltungsbutler.de/hc/de/articles/11422252682781, Abruf 2026-09-12; "Logik der
Steuerschlüssel, Sachverhalte §13b & Automatikkonten" (Erwähnung des Generalumkehrschlüssels
"GU"), https://wissen.buchhaltungsbutler.de/hc/de/articles/11408521543581, Abruf 2026-09-12.

### E-Rechnungspflicht in Deutschland (Stand 2026-09-12)

Durch das Wachstumschancengesetz wurde § 14 UStG für Umsätze ab dem 1. Januar 2025 reformiert.
Der aktuelle Stand laut FAQ des Bundesfinanzministeriums:

- **Empfangspflicht seit 1. Januar 2025:** Alle inländischen Unternehmer müssen in der Lage
  sein, E-Rechnungen zu empfangen und GoBD-konform zu verarbeiten; ein einfaches E-Mail-Postfach
  genügt dafür technisch.
- **Übergangsfrist für die Ausstellung 2025–2026:** Bis Ende 2026 dürfen alle Unternehmen für
  inländische B2B-Umsätze weiterhin Papierrechnungen oder sonstige elektronische Formate
  (mit Zustimmung des Empfängers) ausstellen.
- **Verlängerte Übergangsfrist bis Ende 2027:** Für Unternehmen mit einem Vorjahresumsatz bis
  800.000 Euro verlängert sich die Möglichkeit, Papier- oder sonstige elektronische Rechnungen
  auszustellen, bis Ende 2027.
- **Ab 2027/2028 grundsätzliche Pflicht:** Ab 2027 müssen Unternehmen mit einem
  Vorjahresumsatz über 800.000 Euro E-Rechnungen ausstellen; ab 2028 entfällt diese
  Umsatzgrenze weitgehend, sodass grundsätzlich alle nicht begünstigten inländischen
  B2B-Umsätze per E-Rechnung abgerechnet werden müssen.
- **Ausnahmen** von der Ausstellungspflicht bestehen laut FAQ u. a. für Kleinbetragsrechnungen
  bis 250 Euro brutto, Fahrausweise, Leistungen von Kleinunternehmern sowie für
  Rechnungen an Endverbraucher (B2C) und viele steuerfreie Umsätze.
- Die Pflicht betrifft ausdrücklich nur Umsätze zwischen inländischen Unternehmern (B2B);
  private Endverbraucher sind nicht einbezogen.

Für einen Agenten bedeutet das: Ob eine ausgestellte Rechnung als E-Rechnung erzeugt werden
muss, hängt vom Umsatz des Vorjahres, vom Empfängertyp (Unternehmer vs. Endverbraucher) und vom
Rechnungsbetrag ab. Der Agent darf diese Einordnung nicht selbst pauschal annehmen, sondern muss
im Zweifel beim Menschen nachfragen, insbesondere solange Übergangsfristen laufen und die
konkrete Umsatzschwelle des Mandanten nicht sicher bekannt ist.

Quelle: "Fragen und Antworten zur Einführung der obligatorischen (verpflichtenden) E-Rechnung
zum 1. Januar 2025", Bundesfinanzministerium,
https://www.bundesfinanzministerium.de/Content/DE/FAQ/e-rechnung.html, Abruf 2026-09-12 (Inhalt
über ein Fetch-Tool automatisiert zusammengefasst; Originaltext des FAQ nicht Zeile für Zeile
manuell nachgeprüft, daher als "im Wesentlichen belegt, nicht wörtlich zitiert" zu verstehen).

---

## 5. Warnungen für autonome Agenten

Diese Warnungen gelten zusätzlich zu und unabhängig von allgemeinen Sicherheitsregeln des
MCP-Servers. Sie beschreiben fachliche Gefahren, die sich aus der Natur der Buchhaltung selbst
ergeben.

1. **Kontenrahmen niemals raten.** Kontonummern bedeuten in SKR03 und SKR04 (und erst recht in
   SKR03 Gastro, SKR03 Ärzte, SKR42, SKR45, SKR49) Unterschiedliches. Ein Agent, der eine
   Kontonummer aus einem Beispiel, einer anderen Firma oder dem Trainingswissen übernimmt, ohne
   sie über `/settings/get/postingaccounts` im Zielaccount zu verifizieren, riskiert
   systematisch falsche Buchungen. Bei Unsicherheit: erst abfragen, dann buchen.

2. **Steuerschlüssel falsch wählen ist ein Steuerdelikt-Risiko, kein rein technischer Fehler.**
   Ein falscher Steuerschlüssel (z. B. `19_vat` statt `0_none` bei einem Kleinunternehmer, oder
   ein fehlender `§13b`-Schlüssel bei einer reverse-charge-pflichtigen Leistung) wirkt sich
   direkt auf die Umsatzsteuervoranmeldung aus und kann zu einer falschen Steuererklärung
   gegenüber dem Finanzamt führen. Ist die steuerliche Einordnung eines Belegs nicht eindeutig
   (unklarer Leistungsort, unklare Unternehmereigenschaft der Gegenpartei, gemischte
   Steuersätze), muss der Agent beim Menschen rückfragen statt zu buchen.

3. **Festgeschriebene Buchungen sind faktisch unumkehrbar außer durch Storno.** Wie in Abschnitt
   4 beschrieben, lässt sich eine festgeschriebene Buchung nicht löschen, sondern nur über
   `/postings/cancel` stornieren, was eine zusätzliche, für Dritte sichtbare Gegenbuchung
   erzeugt. Ein Agent darf `/postings/cancel` nicht routinemäßig als "Rückgängig"-Funktion
   behandeln; jede Stornierung hinterlässt eine dauerhafte Spur im Journal und in Exporten, die
   ein Steuerberater erklären muss. Vor einer Stornierung sollte im Zweifel Rücksprache mit dem
   Menschen erfolgen, insbesondere wenn die betroffene Buchung bereits in einer abgeschlossenen
   Periode liegt oder bereits Teil eines eingereichten Berichts (z. B. USt-VA) war.

4. **Kontenrahmenwechsel ist tabu.** Ein Agent darf niemals versuchen, den Kontenrahmen eines
   produktiven Accounts zu ändern oder einen entsprechenden Support-Kontakt im Namen des Nutzers
   auszulösen, ohne dass der Mensch dies explizit angeordnet hat – ein Wechsel löscht laut
   Hilfecenter Konten, Zahlungen, Buchungen, individuelle Buchungskonten, Kreditoren/Debitoren
   und gespeicherte Buchungsvorschläge.

5. **Debitoren-/Kreditorenbuchungen ohne aktivierte Personenkontenführung schlagen fehl und
   dürfen nicht "umgangen" werden.** Wenn `/postings/add/receipt` mit dem Fehler "creditor
   posting is not activated" oder "debtor posting is not activated" antwortet, ist das ein
   Hinweis auf eine bewusste Kontoeinstellung, kein Bug, den man mit einem Workaround (z. B.
   freie Buchung mit geratenem Personenkonto) umgehen sollte, ohne den Menschen zu informieren.

6. **Beleg- und Buchungsbeträge sind rechtlich bindende Zahlen, keine Schätzwerte.** Werden
   Belegdaten durch OCR ausgelesen (`/receipts/upload`), können Erkennungsfehler auftreten. Ein
   Agent darf von der OCR gelieferte Beträge, Daten oder Steuersätze nicht ungeprüft in eine
   Buchung übernehmen, wenn ein Widerspruch zur Ursprungsdatei erkennbar ist oder wenn
   Pflichtfelder (z. B. `vat_rate` bei Fremdwährungsbelegen) fehlen.

7. **Fremdwährungsbelege erfordern zusätzliche Vorsicht.** Laut API-Beschreibung von
   `/postings/add/receipt` muss bei Belegen mit Fremdwährung vor dem Buchen der Beleg über
   `/receipts/get/id_by_customer` erneut abgerufen werden, um den bereits umgerechneten Betrag zu
   ermitteln — ein Agent darf den Umrechnungskurs nicht selbst berechnen oder annehmen.

8. **E-Rechnungspflicht und Fristen sind bewegliche Ziele.** Die in Abschnitt 4 beschriebenen
   Übergangsfristen (2026, 2027, 2028) und Umsatzschwellen (800.000 Euro) hängen vom
   Vorjahresumsatz des jeweiligen Mandanten ab, den der Agent in der Regel nicht sicher kennt.
   Ob eine konkrete Ausgangsrechnung zwingend als E-Rechnung erstellt werden muss, ist daher im
   Zweifel eine Rückfrage an den Menschen wert, insbesondere bei Rechnungen an öffentliche
   Auftraggeber (dort ist die `e_invoice_id`/Leitweg-ID ohnehin zwingend und muss vom Empfänger
   stammen, darf also nicht vom Agenten erfunden werden).

9. **Massenoperationen (Batch-Endpunkte) vervielfachen jeden Fehler.** `/postings/add-batch/*`,
   `/receipts/addBatch`, `/transactions/addBatch` und `/transactions/assign-batch/receipt`
   wenden dieselbe Logik auf viele Datensätze gleichzeitig an. Ein systematischer Fehler (falsches
   Konto, falscher Steuerschlüssel, falsche Kostenstelle) betrifft dann nicht einen, sondern
   potenziell hunderte Buchungssätze und lässt sich anschließend nur durch ebenso viele
   Stornobuchungen korrigieren. Vor einem Batch-Aufruf mit mehr als einer Handvoll Datensätzen
   sollte der Agent, wenn möglich, zunächst einen einzelnen Datensatz testweise buchen und
   verifizieren.

10. **Wann ein Agent zwingend beim Menschen rückfragen muss** (nicht abschließend, aber
    Mindestkatalog):
    - der Kontenrahmen oder Kontentyp (SKR-Variante, Sachkontenlänge) ist nicht sicher bekannt;
    - der korrekte Steuerschlüssel ist nicht eindeutig aus Beleg und bekanntem Sachverhalt
      ableitbar (insbesondere bei Auslandssachverhalten, §13b, i.g.E., gemischten Steuersätzen);
    - eine bereits festgeschriebene Buchung müsste storniert werden;
    - eine Kleinunternehmereigenschaft, Umsatzschwelle oder sonstige Statusfrage (z. B.
      Ist-Versteuerer vs. Soll-Versteuerer) des Mandanten ist für die anstehende Buchung
      entscheidungsrelevant, aber nicht dokumentiert bekannt;
    - ein Beleg lässt sich nicht eindeutig einer Transaktion zuordnen und mehrere Kandidaten mit
      ähnlichem Betrag/Datum kommen infrage;
    - eine Operation soll einen Kontenrahmenwechsel, eine endgültige Löschung oder eine
      Massenkorrektur bereits festgeschriebener Buchungen auslösen.

---

## Offene Punkte / nicht abschließend verifiziert

- Ob und wie ein abweichendes Geschäftsjahr in BuchhaltungsButler abgebildet wird, konnte nicht
  verifiziert werden.
- Der genaue fachliche Unterschied zwischen `/postings/unconfirm/transaction`,
  `/postings/unconfirm/receipt` und `/postings/unconfirm/free` gegenüber `/postings/cancel` ist
  aus der OpenAPI-Kurzbeschreibung allein nicht abschließend klar und sollte vor produktivem
  Einsatz am Testaccount geprüft werden.
- Ob `/invoices/create/e-invoice` wahlweise XRechnung und/oder ZUGFeRD erzeugt, welches Format
  Standard ist und ob eine Formatwahl über die API möglich ist, ist nicht verifiziert.
- Der vollständige Wortlaut einiger Hilfecenter-Artikel (u. a. "Buchhaltung und
  Zahlungszuordnung am Beleg", "Wie buche ich Anfangsbestände bzw. EB-Werte ein?", "Das amtliche
  Formular Anlage EÜR erstellen", "DATEV: Buchungssätze und Belege importieren",
  "Buchungssätze und Belegbilder in unterschiedlichen Formaten exportieren", "Warn- und
  Fehlermeldungen bei der Umsatzsteuer-Voranmeldung") wurde nicht per Volltext-Abruf, sondern nur
  über Suchtreffer-Zusammenfassungen eingesehen; die daraus zitierten Aussagen sind entsprechend
  gekennzeichnet.
- Es wurde keine vollständige SKR04-Kontenliste recherchiert; die Aussage, dass eine SKR03-Nummer
  in SKR04 "etwas anderes" bedeutet, ist ein allgemeiner, aus dem Strukturunterschied
  abgeleiteter Grundsatz, nicht anhand einer vollständigen Gegenüberstellung beider Kontenrahmen
  geprüft.
- Ob BuchhaltungsButler eine eigene, von § 147 AO/§ 257 HGB losgelöste vertragliche
  Mindestaufbewahrungsfrist definiert (der GoBD-Artikel spricht von "mindestens" der gesetzlichen
  Frist, ohne die vertragliche Frist selbst zu beziffern), ist nicht verifiziert.
