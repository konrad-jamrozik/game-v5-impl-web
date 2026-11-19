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
- `factions/faction_archetypes.yaml`, `leads-and-progression/leads.yaml`, and `compendium/encyclopedia_articles.yaml`:
  patched unchanged from specification commit `e8c0df392d633573975c72dd71f2dc4be1447718` on 2026-11-18, adding the
  Factions Exalt and Black Lotus with their Leads and articles.
- `economy-and-upgrades/upgrades.yaml`: patched unchanged from specification commit
  `65072469818922438808a40b1d4403c4a5c5a7f9` on 2026-11-18, giving the three Rate Upgrades their decimal increments
  and prices.
- `agents/agent_parameters.yaml` and `compendium/encyclopedia_articles.yaml`: patched unchanged from specification
  commit `7985a451a43f4fcaba960b80ca50d8d888cc9cd0` on 2026-11-19, adding the Mission growth parameters and the
  articles' words on Mission growth.
- `factions/faction_operation_levels.yaml`, `leads-and-progression/leads.yaml`, and
  `missions/mission_site_archetypes.yaml`: patched unchanged from specification commit
  `1d687e0d80958e13831a8689e2db9c14ceb66143` on 2026-11-19, writing `on_win`, `on_ignored_or_lost`, and
  `on_completion` as Effect lists.
- `agent-recovery/recovery_parameters.yaml`, `agents/agent_archetypes.yaml`, `compendium/encyclopedia_articles.yaml`,
  and `economy-and-upgrades/upgrades.yaml`: patched unchanged from specification commit
  `9f17570197ece7aad7cfed35c432f25f581d8a2b` on 2026-11-19, renaming the Base health Upgrade to the Max health Upgrade
  (`max_health`, effect `agent_max_health`) and its article to `max_health_article`, and rewording health comments.

No script of this implementation reads the specification repository. Refreshing this copy is a deliberate manual step:
copy the files again, update the commit above, run `npm run check`, and record what changed in
`feedback/implementation-decisions.md`.
