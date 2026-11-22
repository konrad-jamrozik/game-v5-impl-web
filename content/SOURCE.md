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
- `leads-and-progression/leads.yaml`: patched unchanged from specification commit
  `ef44fdc642094f1b969d5e7ea048ccf6019bee60` on 2026-11-19, replacing each Lead's `requires` with the Condition
  `discovered_when`.
- `compendium/compendium_articles/`: the 63 CompendiumArticle files, one file per GDR, patched unchanged from
  specification commit `3fd37d181b3675d4ca0bef981cb8c3ab43b35ff4` on 2026-11-19; they replace
  `compendium/encyclopedia_articles.yaml`, which that commit deleted. The copy has 85 YAML files in all. The
  Placeholders of the articles show the values of this copy, e.g. those of `agents/agent_parameters.yaml` under
  DEC-038.
- Every file that changed between specification commits `b7c9e79b0c4856e37d8c37dc4b37038c5d304846` and
  `acf5e1365fc4039ddd861339ac47f4abbfcc4526`: patched unchanged from specification commit
  `acf5e1365fc4039ddd861339ac47f4abbfcc4526` on 2026-11-19. It renames the Mission growth parameters of
  `agents/agent_parameters.yaml` to Experience, adds six EnemyArchetypes, five Weapons, five Faction activity levels
  (among them `dormant`, without operations), four Faction operation levels, 47 Leads, 19 MissionSiteArchetypes, and
  78 CompendiumArticle files, and rewrites many others. The copy is now identical to the specification's `content/`
  directory, and has 163 YAML files holding 279 GDRs.
- `configuration/campaign_configurations.yaml`: patched unchanged from specification commit
  `890f1d38103fc5c1936772264d6dfc49d4948d88` on 2026-11-19, adding the preset's `name`. The copy is still identical
  to the specification's `content/` directory.
- `combat/combat_parameters.yaml` and `compendium/compendium_articles/mechanics_combat.yaml`: patched unchanged from
  specification commit `d1eb150c8977830c5e4db88871701f2a847b22fc` on 2026-11-19, adding `target_base_weight` and
  `target_preferred_hit_chance` and rewording the Combat article. The copy is still identical to the specification's
  `content/` directory.
- Every file that changed between specification commits `d2657623dc9db8a0a7b71e69810e636689ece3d6` and
  `f708abb52a62c8ddf4e43b938e15ca6c99d4afc9`: patched unchanged from specification commit
  `f708abb52a62c8ddf4e43b938e15ca6c99d4afc9` on 2026-11-19. It adds `combat/armors.yaml` with the Armors
  `service_armor` and `no_armor`, the Weapon `service_weapon`, and the articles `service_weapon_article`,
  `service_armor_article`, and `armor_article`; gives the AgentArchetype and every EnemyArchetype an `armor`; replaces
  the Upgrade `max_health` with `armor` (effect `agent_armor`) and deletes `max_health_article`; and rewords six
  other articles. The copy is still identical to the specification's `content/` directory, and has 166 YAML files
  holding 284 GDRs.
- `combat/combat_parameters.yaml` and `compendium/compendium_articles/mechanics_combat.yaml`: patched unchanged from
  specification commit `d1286d1cd52fca9f428f77e03c51ec59229fd781` on 2026-11-20, rewording the comments of
  `target_base_weight` and `target_preferred_hit_chance` and the Combat article's Chance to hit and Agent target for
  the rounded hit chance and the Selection weight's usefulness. The copy is still identical to the specification's
  `content/` directory.
- `combat/combat_parameters.yaml` and `compendium/compendium_articles/mechanics_combat.yaml`: patched unchanged from
  specification commit `72506c1f3c3149990ca324e42fb14f8417c2416c` on 2026-11-20, adding `rating_bonus_per_upgrade`
  and the Combat article's words on how Weapon damage and Armor Upgrades raise the Combat rating. The copy is still
  identical to the specification's `content/` directory.
- `compendium/compendium_articles/mechanics_assignments.yaml`, `mechanics_exhaustion.yaml`, and
  `mechanics_missions.yaml`: patched unchanged from specification commit `66d59d824adc4085f76b8ce1b5e825dfcab5f719`
  on 2026-11-20, saying that starting work needs full health and that deploying needs only that the Agent could still
  fight. The copy is still identical to the specification's `content/` directory.
- `missions/mission_site_archetypes.yaml`: patched unchanged from specification commit
  `629a98bbeed6b288c806ba0c7113e9e0a00b4608` on 2026-11-20, changing the `enemies` counts of `raid_outpost`,
  `raid_training_facility`, `raid_logistics_hub`, `raid_command_center`, `raid_regional_stronghold`, and `raid_hq`. The
  copy is still identical to the specification's `content/` directory.
- `combat/combat_parameters.yaml`: patched unchanged from specification commit
  `4ecfa26dfb61b47738dc148191fd9a9e67fec52d` on 2026-11-20, raising `rating_bonus_per_upgrade` from 0.01 to 0.02. The
  copy is still identical to the specification's `content/` directory.
- `combat/combat_parameters.yaml` and `compendium/compendium_articles/mechanics_combat.yaml`: patched unchanged from
  specification commit `2bcd50764ec95431f83ba963e79d0efe469ef253` on 2026-11-20, replacing `rating_bonus_per_upgrade`
  with `rating_bonus_per_weapon_damage_upgrade` 0.02 and `rating_bonus_per_armor_upgrade` 0.01, and rewording the
  Combat article's Combat rating to match. The copy is still identical to the specification's `content/` directory.
- Every file that changed between specification commits `2bcd50764ec95431f83ba963e79d0efe469ef253` and
  `47755c145388d4f1933f0499e28407d005a14697`, outside the Cut content under `content/cut/`: patched unchanged from
  specification commit `47755c145388d4f1933f0499e28407d005a14697` on 2026-11-20. It shortens each Faction's chain to
  six tiers, deleting `raid_training_facility`, `raid_command_center`, and 12 Leads; replaces five Response
  MissionSiteArchetypes with `foil_infrastructure_attack`, `foil_prison_break`, `foil_bioweapon_release`, and
  `foil_warhead_launch`; deletes `operation_level_6` and makes `operation_level_5` the existential level; deletes 19
  CompendiumArticle files, adds four, and rewords seven. The Cut content is not copied, under Implementation
  Placement. The copy is still identical to the specification's `content/` directory outside `content/cut/`, and has
  151 YAML files holding 253 GDRs.
- Every file that changed between specification commits `47755c145388d4f1933f0499e28407d005a14697` and
  `ad21119f69038c17c84c41cf38093db5c2f5cf20`, outside the Cut content under `content/cut/`: patched unchanged from
  specification commit `ad21119f69038c17c84c41cf38093db5c2f5cf20` on 2026-11-20. It gives every EnemyArchetype from `handler` up
  an Armor of its own, adding seven Armors and their seven CompendiumArticle files; makes the `weapon_damage` Upgrade
  +2 for 2000 and the `armor` Upgrade +5 for 1000; replaces the two rating bonuses of
  `combat/combat_parameters.yaml` with the seven rating values; and rewords the Combat article's Combat rating. The
  copy is still identical to the specification's `content/` directory outside `content/cut/`, and has 158 YAML
  files holding 267 GDRs.
- `combat/combat_parameters.yaml` and `compendium/compendium_articles/mechanics_combat.yaml`: patched unchanged from
  specification commit `d846af54dbc650426c46a02509eca86208e65f03` on 2026-11-21, removing `rating_bonus_per_health`,
  `rating_bonus_per_armor`, and `rating_bonus_per_weapon_damage`, rewording the comments of the rating bases, and
  rewording the Combat article's Combat rating as the mean of an attack half and a toughness half. The copy is still
  identical to the specification's `content/` directory outside `content/cut/`.
- `economy-and-upgrades/upgrades.yaml`: patched unchanged from specification commit
  `5d51a48d7a5395467b2f3e3af53a1df015780c68` on 2026-11-21, repricing six Upgrades: `agent_cap` and `training_cap`
  +4 for 500, `transport_cap` +4 for 2000, `training_skill_gain` +0.2 for 1000, `exhaustion_recovery` +1 for 1000, and
  `health_recovery` +1 for 1000. The copy is still identical to the specification's `content/` directory outside
  `content/cut/`.
- `combat/`, `compendium/compendium_articles/`, and `economy-and-upgrades/`: patched unchanged from specification
  commit `98566f6241b8296fdefa50917f488108804c9c8f` on 2026-11-21. The Weapons `pistol` and `sidearm` become
  `basic_pistol` and `combat_pistol`, with their Compendium articles, from commit
  `f550a03b2502bc67d1d3900a93b566bd0667eb8d`; `rating_base_armor` becomes 20 and the Combat article states the
  three-term rating factor; `agent_cap` gives +20 for 2000, `training_cap` +10 for 1000, and `base_training_cap` is 10.
  The copy is still identical to the specification's `content/` directory outside `content/cut/`.

No script of this implementation reads the specification repository. Refreshing this copy is a deliberate manual step:
copy the files again, update the commit above, run `npm run check`, and record what changed in
`feedback/implementation-decisions.md`.
