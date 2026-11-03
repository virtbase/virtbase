// Renders the Markdown tree built by `src/markdown.ts` with the elements of
// `virtbase.typ`. The tree arrives as data through `json()`, so no text from a
// document is ever parsed as Typst markup: `#`, `*` or `]` print as they are.
#import "virtbase.typ": vb-table

// One function for blocks and inline nodes alike: Typst has no forward
// declarations, so a block renderer could not call an inline one defined after
// it, and list items hold blocks that hold inline nodes.
#let render(node) = {
  let t = node.type
  let inline() = node.children.map(render).join()
  // Blocks are separated the way Typst markup separates them, by paragraph
  // breaks, rather than wrapped in `par()`: a tight list item stays tight.
  let blocks() = node.children.map(render).join(parbreak())

  if t == "root" { blocks() }
  else if t == "blockquote" { quote(block: true, blocks()) }
  else if t == "heading" { heading(level: node.depth, inline()) }
  else if t == "paragraph" { inline() }
  else if t == "list" {
    let items = node.children.map(render)
    if node.ordered { enum(start: node.start, ..items) } else { list(..items) }
  }
  else if t == "listItem" { blocks() }
  else if t == "table" {
    let rows = node.children.map(row => row.children.map(cell => {
      let body = cell.children.map(render).join()
      if body == none { [] } else { body }
    }))
    let numeric = node.align.enumerate().filter(((_, a)) => a == "right").map(((i, _)) => i)
    // The layout sets text without hyphenation. In a table with four or five
    // columns, a German compound such as "Virtualisierungsplattform" is wider
    // than its column and would run into the next one.
    set text(hyphenate: true)
    vb-table(columns: rows.first().len(), head: rows.first(), numeric: numeric, ..rows.slice(1).flatten())
  }
  else if t == "code" { raw(node.value, block: true, lang: node.lang) }
  // A horizontal rule is a page break in print: on the website it separates,
  // say, a contract from its annexes, and in the PDF each annex then starts
  // on a page of its own. Weak, so a rule at the top of a page adds no blank one.
  else if t == "thematicBreak" { pagebreak(weak: true) }
  else if t == "text" { node.value }
  else if t == "strong" { strong(inline()) }
  else if t == "emphasis" { emph(inline()) }
  else if t == "delete" { strike(inline()) }
  else if t == "superscript" { super(inline()) }
  else if t == "subscript" { sub(inline()) }
  else if t == "inlineCode" { raw(node.value) }
  else if t == "break" { linebreak() }
  else if t == "link" { link(node.url, inline()) }
  else { panic("unsupported Markdown node: " + t) }
}

#let render-markdown(tree) = render(tree)
