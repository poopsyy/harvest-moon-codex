# Willowmere Acres story bible

All prose is original to this project. `src/data/strings/en.json` holds all localized content: its `narrative` section contains the main authored catalog, and its `supplemental` section contains additional individually authored married and situational conversations. `narrative.ts` validates both catalogs and exposes the story to the deterministic engine. `narrativeLineCount` counts distinct text, so shared wedding blessings count once rather than once per spouse.

## Premise and voice

The player leaves a city desk for Aunt Wren’s neglected farm. Wren is traveling, not deceased; her gift imposes no obligation to reproduce her life. Willowmere faces a land-acquisition proposal from a consortium represented by Cyprian Halverd. Restoring the Lantern Tree gives the village shared confidence, but ordinary work, fair agreements, rest, and relationships provide the practical reasons to preserve it.

Odalie speaks in brisk administrative observations with a warm second thought. Bram’s spare carpentry language makes room for silence. Greta’s direct instructions conceal careful tenderness. Pell worries in sociable inventories; Noor answers through practical fairness. Ivy thinks in experiments, recipes, and beginnings. Rosalind gives unsentimental care; Kip notices animals before crowds. Ansel learns to speak as a person beyond his profession. Marta makes welcome tangible through food; Dex treats staying and leaving as equally valid creative choices. Corran leaves room around painful memories; Lira pairs adventurous language with explicit preparation. Sable asks permission to observe and learns to occupy space. Fenwick finds people in the margins of records. Hollis notices uncredited labor; June combines gentleness with firm boundaries. Ilse uses ordinary practical humor alongside ritual. Pip’s curiosity is childlike, never romantic. Ozzie’s theatrical sales language is tempered by honesty. Halverd changes through evidence and accountability, not sudden villainous reversal. Wren admits mistakes without making the player responsible for repairing her life.

## Main story and playable gates

The intro includes Wren’s complete letter, Odalie’s honest warning about the vote, and Rosalind’s practical farming tutorial. `intro` is a seventeen-line script. The four chapter scripts are keyed by the command IDs below.

| Command           | Chapter                   | Engine requirements                                                                                                           | Completion flag            |
| ----------------- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| `spring`          | The Stone in the Roots    | Iron axe and hammer; clear orchard stump and boulder; three planted fruit trees; 50 spring crops shipped; Bram 300 friendship | `spring_stone`             |
| `boat`            | Repair Lira’s boat        | Deliver 30 wood and 2 iron bars                                                                                               | `boat_repaired`            |
| `summer`          | The Stone Under the Falls | Spring stone; 15 recorded fish species; Corran 400 friendship; boat repaired                                                  | `summer_stone`, horse gift |
| `autumn`          | The Stone in the Deep     | Summer stone; mine floor 50; Greta 400 friendship                                                                             | `autumn_stone`             |
| `winter`          | The Stone in the Hearth   | Autumn stone; ten villagers at 300 friendship; three arcs at their third scene; attend Longnight                              | `winter_stone`             |
| automatic morning | Lantern Bloom             | Winter stone and Year 2 or later                                                                                              | `bloom`                    |
| `vote`            | Council Vote              | Year 3 Spring 28 or later; bloom for the successful player-initiated revote                                                   | `evaluated`                |

The Spring stone recalls Wren and Bram building a workshop together. Summer revisits the cove where Wren and Corran saved one another during a storm; Lira’s repaired boat makes returning a choice rather than an ordeal. Autumn reveals Greta’s disagreement with Wren: staying was a chosen life, not a refusal of friendship. The letter finally says what Wren should have said sooner. Winter reveals that the last hearthstone is the village’s shared hearth, created through people bringing dishes, wood, chairs, and help.

The Bloom script gives all four lights a visible culmination and establishes the annual Lantern Bloom Vigil. The vote script gives every core resident an individual line, with Wren’s return supported by the journal collection. The tree is a living thing that still needs care after the spectacle.

## Nine village arcs

Each arc has five distinct scenes, increasing friendship thresholds of one through five hearts, an authored location, an independent permanent scene flag, a two-way choice at scene four, and an epilogue after scene five. The engine command uses the arc ID and advances the next unseen eligible scene. Scene flags are `<arc_id>_1` through `<arc_id>_5`; completion is `arc_<arc_id>`.

| Arc ID           | Beginning, conflict, turning point, resolution                                                                    | Choice flags               |
| ---------------- | ----------------------------------------------------------------------------------------------------------------- | -------------------------- |
| `marta_inn`      | Debt letter; ingredient fundraiser; public-service support; ownership decision; reopened inn                      | `_renovate`, `_coop`       |
| `dex_future`     | Hidden timetable; unfinished song; Marta’s permission; two good roads; a key that permits return                  | `_leave`, `_stay`          |
| `marrow_family`  | Spare gloves; two unsent letters; working hives together; family-honey stall; a shared plan                       | `_shared`, `_agreement`    |
| `ansel_rest`     | Cold tea and fatigue; unsustainable rota; substitute handover; chosen restful afternoon; sustainable clinic       | `_walk`, `_music`          |
| `sable_gallery`  | Drawing from the doorway; consent to portraiture; an offered wall; subjects’ voices; gallery opening              | `_memories`, `_interviews` |
| `ivy_bakery`     | Flour-marked plan; three trial loaves; family budget; independent naming decision; first paying customer          | `_family`, `_independent`  |
| `kip_confidence` | Offered announcement; practice; helping a nervous handler; choice of shared or solo introduction; successful show | `_lead`, `_share`          |
| `lira_boat`      | Hull inspection; material and seam tests; old tiller; route decision; deep-water launch                           | `_coast`, `_cove`          |
| `halverd_choice` | Hometown photograph; unmarked community path; revised recommendation; professional decision; useful local map     | `_stay`, `_leave`          |

Choice flags use the complete prefix, for example `dex_future_leave`. Positive alternatives are not scored as moral failures. Dex’s city route includes correspondence and winter return; the local route includes music nights. Marta’s co-op and renovated inn preserve her role and the village welcome. Halverd may open a local surveying office or leave with a changed recommendation on record.

## Friendship, courtship, and family

There are 81 non-marriage heart events: three for each of 22 villagers (including returning Wren), plus three additional scenes for each of the five romanceable adults. The ordinary scenes unlock at two, four, and six hearts; extra romance scenes use seven, eight, and nine. Every scene has six authored lines and an individual flag.

Ivy, Kip, Ansel, Lira, and Sable each have a separate four-line proposal script, a complete wedding script with their own vow and the village’s blessings, sixty or more individually authored married conversations, and four five-line post-marriage events. Post-marriage scenes address shared space, fair work, ordinary affection, and a thoughtful conversation about a possible child. Birth and adoption are presented as equally welcome choices. There is no jealousy, coercion, punishment for waiting, or romance involving children. Proposals and weddings are separate exports from `marriageEvents`, so anniversary gates apply only to the twenty post-marriage scenes.

## Wren’s sixteen journal pages

Every page is a complete handwritten-style passage of 102–109 words, with a title, source, and actionable hint. The catalog order deliberately matches the engine’s discovery gates.

| Page ID         | Source                     | Discovery gate                |
| --------------- | -------------------------- | ----------------------------- |
| `floorboard`    | Farmhouse loose floorboard | Spring 3 onward               |
| `stump`         | Old orchard stump          | Spring Hearthstone            |
| `archive`       | Library archives           | Fenwick four hearts           |
| `chest`         | Corran’s chest             | Corran four hearts            |
| `cove`          | Hidden cove dry ledge      | Summer Hearthstone            |
| `mine20`        | Mine floor 20              | Reach floor 20                |
| `mine40`        | Mine floor 40              | Reach floor 40                |
| `mine60`        | Mine floor 60              | Reach floor 60                |
| `forge`         | Wren’s unsent forge letter | Autumn Hearthstone            |
| `ember`         | Ember Walk memory          | Three festival participations |
| `longnight`     | Longnight hearth           | Attend Longnight              |
| `ozzie_page`    | Merchant’s rare recipe box | Winter Year 1 onward          |
| `letter_spring` | Wren’s first travel letter | Summer Year 1 onward          |
| `letter_autumn` | Wren’s delayed postcard    | Year 2 onward                 |
| `ilse_page`     | Keeper Ilse                | Ilse six hearts               |
| `summit`        | Summit at winter dawn      | Winter, 08:00 or earlier      |

Twelve pages qualify Wren’s return for the vote. The full collection reveals a fallible traveler learning that independence need not mean refusing help, and that inheriting a home must leave room to change it.

## Festivals, mail, and television

All 22 NPCs have two unique responses to each of the nine catalog festivals: Seedling Parade, Kite Day, Tide Lantern Night, Fishing Derby, Harvest Scales, Ember Walk, Frostglass Fair, Longnight Gathering, and Lantern Bloom Vigil. Kite Day dialogue concerns handmade kites and coastal wind, not a substituted dance festival. Four seasonal pools contribute three additional lines per villager per season.

Twenty letters include four seasonal Wren letters, tool and story guidance, relationship milestones, branching Dex correspondence, clinic and gallery notices, a changed Halverd recommendation, and Wren’s return. Sixty TV segments span weather advice, practical cooking, village news, and original folk tales. Weather prose complements the engine forecast rather than inventing a random forecast independently.

## Endings and continuation

`thriving` is a unanimous vote after a high evaluation score and the restored tree; the player receives an honorary council place and scenes of shared local progress. `steady` preserves the village by a narrow vote and acknowledges work still to do. `uncertain` delays sale for one year, leaves the chapter goals active, and explicitly promises a later council meeting after restoration. There is no permanent lost-farm ending. Every ending returns to the possibility of an ordinary farming morning and continued play.

## Verification

`tests/unit/narrative.test.ts` verifies all schemas and references, distinct localized dialogue, 2,500+ unique text units, all festival speaker pairs, everyday and married pools, 81 friendship events, twenty marriage events, five-scene arcs and choice flags, chapter order, page word limits, all television channels, and malformed-data rejection. A text unit is an authored displayed dialogue line, scene beat, full journal page, letter, broadcast, or epilogue; words inside prose are never counted as separate lines. Wedding text repeated among partner scripts counts only once.
