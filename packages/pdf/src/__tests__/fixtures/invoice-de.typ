#import "/lib/virtbase.typ": *

#show: vb-letter.with(
  lang: "de",
  title: "Rechnung RE2026/0439",
  subject: "Rechnung RE2026/0439 vom 26.10.2026",
  recipient: ("Beispiel GmbH", "Erika Mustermann", "Musterstraße 1", "12345 Musterstadt"),
  info: (
    ("Rechnungsnr.", "RE2026/0439"),
    ("Kundennr.", "10012"),
    ("Datum", "26.10.2026"),
    ("Leistungsdatum", "26.10.2026"),
  ),
)

Wir stellen Ihnen die folgenden Leistungen in Rechnung.

#vb-table(
  columns: (12mm, 1fr, 18mm, 25mm, 25mm),
  head: ([Pos.], [Leistung], [Menge], [Einzel EUR], [Gesamt EUR]),
  numeric: (2, 3, 4),
  [1], [VPS EPYC-01: 1 vCore, 4 GB RAM, 50 GB NVMe SSD, 1× IPv4, 1× IPv6 /64], [1], [3,35], [3,35],
  [2], [Zusätzliche IPv4-Adresse], [2], [2,50], [5,00],
)
#totals(([Netto], [8,35]), ([USt. 19 %], [1,59]), ([Gesamt EUR], [9,94]))

#small[Die Rechnung ist bereits bezahlt, bitte nicht überweisen. Vielen Dank für Ihren Einkauf bei Virtbase.]
