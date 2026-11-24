"""Generate the test fixtures in this folder (no extra dependencies).

    python tests/fixtures/make_fixtures.py

- mietvertrag.pdf: fake German rental contract, 3 pages, text-based (all names/addresses are made up).
- not_a_pdf.txt: plain text file to test that non-PDF uploads are rejected.

Facts in the contract (handy for retrieval/answer tests):
  page 1: parties, § 1 Mietsache, § 2 Mietbeginn 01.03.2025, § 3 Kaltmiete 850,00 EUR + 180,00 EUR Nebenkosten = 1.030,00 EUR
  page 2: § 4 Kaution 2.550,00 EUR, § 5 Kündigungsfrist drei Monate, § 6 Tierhaltung
  page 3: § 7 Schönheitsreparaturen, § 8 Hausordnung (Ruhezeiten 22-6 Uhr), signatures
Not in the contract (for "not in the documents" tests): parking space, internet, garden.
"""

from pathlib import Path

HERE = Path(__file__).resolve().parent

PAGES = [
    [
        ("H", "Wohnraummietvertrag"),
        ("", ""),
        ("", "Zwischen"),
        ("", "Frau Erika Musterfrau, Beispielweg 7, 12345 Musterstadt"),
        ("", "- nachfolgend Vermieterin genannt -"),
        ("", "und"),
        ("", "Herrn Max Mustermann, Fantasiestraße 21, 54321 Beispielhausen"),
        ("", "- nachfolgend Mieter genannt -"),
        ("", "wird folgender Mietvertrag geschlossen:"),
        ("", ""),
        ("B", "§ 1 Mietsache"),
        ("", "(1) Vermietet wird die Wohnung im 2. Obergeschoss rechts des Hauses"),
        ("", "Musterstraße 12, 12345 Musterstadt."),
        ("", "(2) Die Wohnung besteht aus 3 Zimmern, Küche, Bad und Balkon."),
        ("", "Die Wohnfläche beträgt 78 Quadratmeter."),
        ("", "(3) Zur Wohnung gehört ein Kellerabteil (Nr. 4)."),
        ("", ""),
        ("B", "§ 2 Mietbeginn und Mietdauer"),
        ("", "(1) Das Mietverhältnis beginnt am 1. März 2025."),
        ("", "(2) Es wird auf unbestimmte Zeit geschlossen."),
        ("", ""),
        ("B", "§ 3 Miete und Nebenkosten"),
        ("", "(1) Die monatliche Kaltmiete (Nettokaltmiete) beträgt 850,00 €."),
        ("", "(2) Zusätzlich zahlt der Mieter eine monatliche Vorauszahlung auf die"),
        ("", "Betriebskosten in Höhe von 180,00 €."),
        ("", "(3) Die monatliche Gesamtmiete beträgt somit 1.030,00 €."),
        ("", "(4) Die Miete ist monatlich im Voraus, spätestens bis zum dritten Werktag"),
        ("", "eines Monats, auf das Konto der Vermieterin zu zahlen."),
    ],
    [
        ("B", "§ 4 Mietsicherheit (Kaution)"),
        ("", "(1) Der Mieter leistet eine Kaution in Höhe von 2.550,00 €."),
        ("", "Das entspricht drei Monatskaltmieten."),
        ("", "(2) Der Mieter ist berechtigt, die Kaution in drei gleichen monatlichen"),
        ("", "Teilzahlungen zu erbringen. Die erste Teilzahlung ist zu Beginn des"),
        ("", "Mietverhältnisses fällig."),
        ("", "(3) Die Vermieterin legt die Kaution getrennt von ihrem Vermögen bei einem"),
        ("", "Kreditinstitut zu dem für Spareinlagen üblichen Zinssatz an."),
        ("", ""),
        ("B", "§ 5 Kündigung"),
        ("", "(1) Der Mieter kann das Mietverhältnis mit einer Frist von drei Monaten"),
        ("", "kündigen. Die Kündigung ist spätestens am dritten Werktag eines"),
        ("", "Kalendermonats zum Ablauf des übernächsten Monats zulässig."),
        ("", "(2) Für die Kündigung durch die Vermieterin gelten die gesetzlichen Fristen."),
        ("", "(3) Die Kündigung bedarf der Schriftform."),
        ("", ""),
        ("B", "§ 6 Tierhaltung"),
        ("", "(1) Die Haltung von Kleintieren (z. B. Zierfische, Hamster) ist erlaubt."),
        ("", "(2) Die Haltung von Hunden und Katzen bedarf der vorherigen schriftlichen"),
        ("", "Zustimmung der Vermieterin."),
    ],
    [
        ("B", "§ 7 Schönheitsreparaturen"),
        ("", "(1) Die Wohnung wird in renoviertem Zustand übergeben."),
        ("", "(2) Der Mieter trägt die Schönheitsreparaturen während der Mietzeit,"),
        ("", "soweit sie durch seine Nutzung erforderlich werden."),
        ("", ""),
        ("B", "§ 8 Hausordnung"),
        ("", "(1) Die Hausordnung ist Bestandteil dieses Vertrages."),
        ("", "(2) Ruhezeiten gelten werktags von 22:00 Uhr bis 6:00 Uhr sowie"),
        ("", "ganztägig an Sonn- und Feiertagen."),
        ("", "(3) Das Treppenhaus wird im wöchentlichen Wechsel von den Mietern gereinigt."),
        ("", ""),
        ("B", "§ 9 Schlussbestimmungen"),
        ("", "Änderungen und Ergänzungen dieses Vertrages bedürfen der Schriftform."),
        ("", ""),
        ("", ""),
        ("", "Musterstadt, den 10. Februar 2025"),
        ("", ""),
        ("", "____________________________          ____________________________"),
        ("", "Erika Musterfrau (Vermieterin)            Max Mustermann (Mieter)"),
    ],
]


def pdf_string(text: str) -> bytes:
    raw = text.encode("cp1252")  # WinAnsiEncoding: umlauts, §, € and „“ are covered
    return b"(" + raw.replace(b"\\", b"\\\\").replace(b"(", b"\\(").replace(b")", b"\\)") + b")"


def page_stream(lines: list[tuple[str, str]], page_no: int) -> bytes:
    sizes = {"H": (b"/F2", 18), "B": (b"/F2", 12), "": (b"/F1", 11)}
    out = [b"BT", b"72 760 Td"]
    for style, text in lines:
        font, size = sizes[style]
        out.append(font + b" %d Tf" % size)
        out.append(pdf_string(text) + b" Tj")
        out.append(b"0 -%d Td" % (26 if style == "H" else 17))
    out.append(b"ET")
    out.append(b"BT /F1 9 Tf 290 40 Td " + pdf_string(f"Seite {page_no} von {len(PAGES)}") + b" Tj ET")
    return b"\n".join(out)


def build_pdf() -> bytes:
    n = len(PAGES)
    # object numbers: 1 catalog, 2 pages, 3 font regular, 4 font bold, then (page, content) pairs
    page_ids = [5 + 2 * i for i in range(n)]
    objects: dict[int, bytes] = {
        1: b"<< /Type /Catalog /Pages 2 0 R >>",
        2: b"<< /Type /Pages /Kids [" + b" ".join(b"%d 0 R" % p for p in page_ids) + b"] /Count %d >>" % n,
        3: b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
        4: b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
    }
    for i, lines in enumerate(PAGES):
        content = page_stream(lines, i + 1)
        objects[page_ids[i]] = (
            b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents %d 0 R "
            b"/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> >>" % (page_ids[i] + 1)
        )
        objects[page_ids[i] + 1] = b"<< /Length %d >>\nstream\n" % len(content) + content + b"\nendstream"

    out = bytearray(b"%PDF-1.4\n")
    offsets = {}
    for num in sorted(objects):
        offsets[num] = len(out)
        out += b"%d 0 obj\n" % num + objects[num] + b"\nendobj\n"
    xref = len(out)
    size = max(objects) + 1
    out += b"xref\n0 %d\n0000000000 65535 f \n" % size
    out += b"".join(b"%010d 00000 n \n" % offsets[i] for i in range(1, size))
    out += b"trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n" % (size, xref)
    return bytes(out)


if __name__ == "__main__":
    (HERE / "mietvertrag.pdf").write_bytes(build_pdf())
    (HERE / "not_a_pdf.txt").write_text(
        "Das ist keine PDF-Datei, sondern eine einfache Textdatei.\n"
        "Der Upload muss mit einer Fehlermeldung abgelehnt werden.\n",
        encoding="utf-8",
    )
    print("wrote mietvertrag.pdf and not_a_pdf.txt")
