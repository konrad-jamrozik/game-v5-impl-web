# Source of the GDR copy

The YAML files in this directory are a copy of the Bootstrap GDR files of the specification repository, taken by hand
by the implementer, as Implementation Placement requires under "Game data in an Implementation".

- Specification commit: `438b909e6ef6bf0cd581856d790a318ac8879628`
- Copied on: 2026-11-16
- Files: 20 YAML files, unchanged apart from `agents/agent_parameters.yaml`, whose values follow DEC-038.
- `compendium/encyclopedia_articles.yaml`: copied unchanged from specification commit
  `e19a220aa261bbcbaecbe0725bedda08f655a2ee` on 2026-11-16; 21 YAML files in all.

No script of this implementation reads the specification repository. Refreshing this copy is a deliberate manual step:
copy the files again, update the commit above, run `npm run check`, and record what changed in
`feedback/implementation-decisions.md`.
