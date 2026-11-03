#let company = yaml("/data/company.yaml")

#let black = rgb("#000000")
#let white = rgb("#ffffff")
#let gray-rule = rgb("#bdbdbd")
#let gray-fill = rgb("#f2f2f2")
#let hair = 0.25pt
#let rule = 0.75pt
#let strong-rule = 1.5pt

#let regions = (de: "DE", en: "GB", fr: "FR", nl: "NL")

#let localized(value, lang) = if type(value) == dictionary and lang in value { value.at(lang) } else { value }

#let company-text(template, lang) = template.replace(regex("\{([a-z.-]+)\}"), m => {
  let value = m.captures.first().split(".").fold(company, (v, key) => v.at(key))
  str(localized(value, lang))
})

#let lines(height) = {
  let half = (height - 1.3) / 2
  (top-edge: (1.005 + half) * 1em, bottom-edge: -(0.295 + half) * 1em)
}

#let at(x, y, body, ..args) = place(top + left, dx: x, dy: y, text(
  top-edge: "baseline",
  bottom-edge: "baseline",
  ..args,
  body,
))

#let letterhead(first, letter, lang) = {
  let c = company
  let band = if first { 22mm } else { 12mm }
  let band-top = 297mm - band
  set text(font: "Geist", fill: black, hyphenate: false, features: ("tnum",))

  place(top + left, dy: band-top, rect(width: 100%, height: band, fill: black))
  place(top + left, dx: 154mm, dy: 297mm + 4mm - 100mm * 874.83 / 1348.13, image(
    "/assets/signet-" + if first { "first" } else { "follow" } + ".svg",
    width: 56mm,
  ))

  if not first {
    place(top + left, dx: 25mm, dy: 8mm, image("/assets/wordmark.svg", width: 26mm))
    let legal = (c.name, c.register.number, "VAT " + c.vat, c.web).join(" · ")
    at(25mm, band-top + band / 2 + 0.8mm, size: 6.5pt, fill: white, legal)
    return
  }

  place(top + left, dx: 25mm, dy: 8mm, image("/assets/wordmark.svg", width: 40mm))
  at(25mm, 19.6mm, size: 7pt, c.web + " · " + c.email)

  if letter {
    for (y, length) in ((105mm, 5mm), (148.5mm, 8mm), (210mm, 5mm)) {
      place(top + left, dy: y, line(length: length, stroke: hair + black))
    }
    at(25mm, 53mm, size: 6pt, (c.name, c.street, c.postcode + " " + c.city, c.country.code).join(" · "))
    place(top + left, dx: 25mm, dy: 54.4mm, line(length: 85mm, stroke: hair + black))
  }

  let columns = (
    (25mm, (text(weight: 600, c.name), c.street, c.postcode + " " + c.city + ", " + c.country.code)),
    (77mm, (
      c.register.number + " · AG " + c.register.court,
      "VAT " + c.vat,
      c.managing-director.at(lang) + " " + c.managing-director.name,
    )),
    (123mm, (c.bank.short, "IBAN " + c.bank.iban, "BIC " + c.bank.bic)),
  )
  for (x, lines) in columns {
    for (i, body) in lines.enumerate() {
      at(x, band-top + 6.6mm + i * 6.5pt * 1.55, size: 6.5pt, fill: white, body)
    }
  }
}

#let label(body) = block(above: 3mm, below: 1mm, sticky: true, par(text(size: 8pt, weight: 500, body)))

#let small(body) = block(below: 1.5mm, {
  set text(size: 7.5pt)
  set text(..lines(1.4))
  par(body)
})

#let footnote-text(body) = text(size: 6.5pt, body)

#let note(body, contrast: false) = block(
  width: 100%,
  inset: 3mm,
  above: 3mm,
  below: 3mm,
  stroke: if contrast { none } else { 0.5pt + black },
  fill: if contrast { black } else { none },
  text(fill: if contrast { white } else { black }, body),
)

#let vb-table(columns: auto, head: (), numeric: (), inverted: false, ..cells) = {
  table(
    columns: columns,
    align: (x, _) => if x in numeric { right } else { left },
    stroke: (_, y) => if y == 0 and head != () {
      if inverted { none } else { (bottom: rule + black) }
    } else { (bottom: hair + gray-rule) },
    fill: (_, y) => if inverted and y == 0 and head != () { black },
    ..if head != () {
      (table.header(..head.map(h => text(size: 7.5pt, weight: 500, fill: if inverted { white } else { black }, h))),)
    },
    ..cells.pos(),
  )
}

#let kv-table(rows) = table(
  columns: (55mm, 1fr),
  stroke: (_, _) => (bottom: hair + gray-rule),
  ..rows.map(((k, v)) => (text(weight: 500, k), v)).flatten(),
)

#let totals(..rows) = {
  let rows = rows.pos()
  let last = rows.len() - 1
  align(right, block(width: 70mm, above: 0mm, below: 4mm, breakable: false, table(
    columns: (1fr, 1fr),
    stroke: (_, y) => if y == last { (top: rule + black) },
    align: (x, _) => if x == 1 { right } else { left },
    ..rows
      .enumerate()
      .map(((i, (k, v))) => {
        let style = if i == last { (size: 11pt, weight: 600) } else { (:) }
        (text(..style, k), text(..style, v))
      })
      .flatten(),
  )))
}

#let base(lang, title, subject, keywords, letter, top-space, front, body) = {
  assert(lang in regions, message: "lang must be one of " + regions.keys().join(", "))
  set document(title: "Virtbase – " + title, author: company.name, description: subject, keywords: keywords)
  set page(
    paper: "a4",
    margin: (left: 25mm, right: 20mm, top: 24mm, bottom: 64mm),
    background: context letterhead(here().page() == 1, letter, lang),
  )
  set text(
    font: "Geist",
    size: 9.5pt,
    lang: lang,
    region: regions.at(lang),
    hyphenate: false,
    features: ("tnum",),
  )
  set text(..lines(1.45))
  set par(leading: 0mm, spacing: 2.2mm)
  set strong(delta: 200)

  show heading: set text(weight: 600, ..lines(1.15))
  show heading.where(level: 1): set text(size: 20pt, tracking: -0.18mm)
  show heading.where(level: 1): set block(above: 8mm, below: 3mm)
  show heading.where(level: 2): set text(size: 14pt, tracking: -0.08mm)
  show heading.where(level: 2): set block(above: 6mm, below: 2mm)
  show heading.where(level: 3): set text(size: 11pt, tracking: -0.02mm)
  show heading.where(level: 3): set block(above: 4.5mm, below: 1.5mm)
  show <title>: set text(size: 28pt, tracking: -0.35mm, ..lines(1.05))
  show <title>: set block(above: 0mm, below: 6mm)

  set list(marker: [–], body-indent: 5mm - 0.5em, spacing: 1.2mm)
  set enum(body-indent: 2mm, spacing: 1.2mm)

  set table(inset: (x: 1mm, y: 1.6mm))
  show table: set text(size: 9pt)
  show table: set text(..lines(1.35))
  show table: set block(above: 3mm, below: 3mm)

  show quote.where(block: true): it => block(
    above: 3mm,
    below: 3mm,
    inset: (left: 4mm),
    stroke: (left: strong-rule + black),
    text(size: 11pt, ..lines(1.35), it.body),
  )

  show raw: set text(font: "Geist Mono", size: 0.88em)
  show raw.where(block: true): set text(size: 8.5pt / 0.88)
  show raw.where(block: true): set text(..lines(1.4))
  show raw.where(block: true): block.with(width: 100%, fill: gray-fill, inset: 2mm, above: 2mm, below: 2mm)

  front
  v(top-space)
  [#heading(title) <title>]
  body
}

#let vb-document(lang: "de", title: "", subject: none, keywords: (), date: none, body) = base(
  lang,
  title,
  subject,
  keywords,
  false,
  10mm,
  none,
  {
    if date != none { small(date) }
    body
  },
)

#let vb-letter(lang: "de", title: "", subject: none, keywords: (), recipient: (), info: (), body) = base(
  lang,
  title,
  subject,
  keywords,
  true,
  74mm,
  {
    place(top + left, dy: 34mm, block(width: 85mm, height: 30mm, {
      set text(..lines(1.4))
      recipient.join(linebreak())
    }))
    place(top + left, dx: 100mm, dy: 26mm, block(width: 65mm, height: 24mm, {
      set text(size: 8.5pt)
      set text(..lines(1.5))
      info.map(((k, v)) => k + h(1fr) + v).join(linebreak())
    }))
  },
  body,
)
