# Source of the GDR copy

The YAML files in this directory are a copy of the Bootstrap GDR files of the specification repository, taken by hand
by the implementer, as Implementation Placement requires under "Game data in an Implementation".

- Specification commit: `438b909e6ef6bf0cd581856d790a318ac8879628`
- Copied on: 2026-11-16
- Files: 20 YAML files, unchanged apart from `agents/agent_parameters.yaml`, whose values follow DEC-038.
- `compendium/encyclopedia_articles.yaml`: copied unchanged from specification commit
  `e19a220aa261bbcbaecbe0725bedda08f655a2ee` on 2026-11-16.
- `visual-design/background_artworks.yaml`: copied unchanged from specification commit
  `b73e0683afd500a3e7f4decbc1b141969195a083` on 2026-11-17.
- `music/music_parameters.yaml`: copied unchanged from specification commit
  `c1ad3ed71949da59ac10f90795e852b2e0f27b2d` on 2026-11-18; 23 YAML files in all.
- `economy-and-upgrades/upgrades.yaml` and `compendium/encyclopedia_articles.yaml`: patched unchanged from specification
  commit `a07cdfad11eadb7df9767613de98508cbe4da855` on 2026-11-18.
- `music/music_parameters.yaml`: patched unchanged from specification commit
  `1431954675e589453268587817cb242e1823e2cb` on 2026-11-18, naming the excluded tracks under the music README's
  naming scheme.

No script of this implementation reads the specification repository. Refreshing this copy is a deliberate manual step:
copy the files again, update the commit above, run `npm run check`, and record what changed in
`feedback/implementation-decisions.md`.
