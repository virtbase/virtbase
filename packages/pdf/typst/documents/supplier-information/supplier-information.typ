// The supplier information (Lieferantenselbstauskunft): company, registration
// and payment details for a customer's purchasing department, in place of the
// individual questionnaires we do not fill in. Every value comes from
// /data/company.yaml; data.yaml holds only the wording, one entry per language.
#import "/lib/virtbase.typ": *

#let lang = sys.inputs.at("lang", default: "de")
#let t = yaml("data.yaml").at(lang)
#let fill(s) = company-text(s, lang)

#let value(v) = if type(v) == array { v.map(value).join() } else if type(v) == dictionary {
  link(fill(v.url), fill(v.at("text", default: v.url)))
} else { fill(v) }

#show: vb-document.with(lang: lang, title: t.title, subject: fill(t.subject), date: sys.inputs.at("date", default: none))

#for s in t.sections {
  if s.at("page-break", default: false) { pagebreak(weak: true) }
  heading(s.heading)
  if "text" in s { par(fill(s.text)) }
  if "rows" in s { kv-table(s.rows.map(((k, v)) => (k, value(v)))) }
  if "note" in s { note[*#s.note.lead* #fill(s.note.text)] }
}
