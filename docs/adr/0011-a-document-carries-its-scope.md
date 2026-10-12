# A reference graph document carries the scope it was built under

An extractor takes scope globs (ADR-0009), so what it emits is a claim about one subtree and not about the repo. The globs travel in the document, alongside its files, its reference edges and its language tag. A reader that does not know the scope cannot tell a file the extractor left out from a file the repo does not hold, and those are two different statements: the first says nothing about the file, the second says it is not there. The core owns the contract, so a document that names no scope is refused rather than read as none. A scope of no globs is a document built over the whole repo, which is a claim the extractor makes, not a field it left out.

The alternative was to keep the scope on the host that ran the extractor, out of the document, which holds the contract at three fields. It fails as soon as a document is written to a file or merged with another one: the run that knew the globs is gone, and the merged graph cannot say which of its silences were narrowed by a glob and which are the repo. A field that has to be remembered next to a document belongs in the document.

This supersedes the wording of ADR-0009 that lists what an extractor emits as files, reference edges, and a language tag, and nothing else, and its first consequence that reads the contract as the reference graph only. The rule of ADR-0009 stands: the contract is narrow and the core is language-blind. Scope is the one field added to it, and it is added because it is what the reference graph the extractor emitted was read under.

## Consequences

- A document that names no scope is refused, so a reader never infers the scope a document was built under.
- One merged graph holds documents built under different scopes, and each document keeps its own, which is how a monorepo is mapped one subtree at a time and still read as one graph.
- Every extractor emits the field, whatever its host language, because the core reads the scope off the document and nowhere else.
- Entry-point hints stay out of the contract, as optional plugins. See ADR-0010.
