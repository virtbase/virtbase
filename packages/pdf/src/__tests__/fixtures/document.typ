#import "/lib/virtbase.typ": *
#show: vb-document.with(lang: "de", title: "Beispieldokument", subject: "Alle Elemente der Virtbase-Gestaltung", date: "Stand: Oktober 2026")

Vielen Dank für Ihren Auftrag. Wir stellen Ihnen die folgenden Leistungen in Rechnung.

= Leistungsumfang
#label[Ablauf]
- Aufzählung mit Halbgeviertstrich
- Einzug 5 mm
+ Nummerierung mit Punkt
+ Einzug 6 mm

== Positionen
#vb-table(columns: (10mm, 1fr, 18mm, 25mm, 25mm), head: ([\#], [Leistung], [Menge], [Einzel EUR], [Gesamt EUR]), numeric: (2, 3, 4),
  [01], [VPS Pro 8, Rechenzentrum Frankfurt], [1], [24,00], [24,00],
  [02], [Zusätzliche IPv4-Adresse], [2], [2,50], [5,00])
#totals(([Netto], [29,00]), ([USt. 19 %], [5,51]), ([Gesamt EUR], [34,51]))

=== Enthalten in allen Paketen
#vb-table(columns: (1fr, 1fr, 30mm), head: ([Dienst], [Standort], [Verfügbarkeit]), numeric: (2,), inverted: true,
  [Compute], [Frankfurt], [99,95 %])

#quote(block: true)[11 pt, Linie 1,5 pt links, Abstand 4 mm.]

```
ssh root@203.0.113.10
```
Inline `RE2026-0439` Mono.

#note[*Hinweis.* Haarlinie 0,5 pt, Innenabstand 3 mm.]
#note(contrast: true)[*Wichtig.* Kontrastfassung.]
#small[Alle Preise in EUR zuzüglich gesetzlicher Umsatzsteuer.]

#kv-table((([Name], [BeastHost]), ([IBAN], [DE54])))
#pagebreak()
= Zweite Seite
#lorem(80)
