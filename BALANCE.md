# Economy and balance

The tables below derive from `src/data/catalog.ts` and the implemented commands in `src/systems/engine.ts`. Values are normal-quality shipping prices, not optimistic maximum-quality yields. Taxes, spoilage, and animal death are absent. Players can continue after the story evaluation.

## Crop economics

A standard seed bag plants up to nine eligible, already-tilled tiles in a 3×3 area. Each bag opens a nine-seed pouch. Sowing consumes only the seeds used on eligible tiles, with unused seeds retained. Watered nights determine growth; missing water delays harvest. Shipping is paid at the next morning. Quality multipliers increase returns above the baseline below.

First-harvest net = `9 × normal crop price − seed bag price`. The daily figure divides this first harvest net by growth days; it excludes regrowth, fertilizer, work time, weather damage, and incomplete planting patterns. Precise sow uses one seed from the same nine-seed pouch. Its allocated first-harvest net per tile is `normal crop price − bag price / 9`; planting all nine seeds yields exactly the same seed economics in either mode. Fractional costs below allocate the bag price for comparison, not fractional gold charges.

| Crop         | Season | Bag cost | Watered nights | Regrow nights | Unit sale | Nine-tile first net | Net / watered night | Precise net / tile |
| ------------ | ------ | -------: | -------------: | ------------: | --------: | ------------------: | ------------------: | -----------------: |
| Turnip       | spring |      120 |              4 |             — |        60 |                 420 |               105.0 |              46.67 |
| Radish       | spring |      140 |              5 |             — |        70 |                 490 |                98.0 |              54.44 |
| Potato       | spring |      150 |              6 |             — |        80 |                 570 |                95.0 |              63.33 |
| Peas         | spring |      180 |              8 |             3 |        45 |                 225 |                28.1 |              25.00 |
| Strawberry   | spring |      250 |              9 |             3 |        40 |                 110 |                12.2 |              12.22 |
| Cabbage      | spring |      400 |             13 |             — |       250 |                1850 |               142.3 |             205.56 |
| Onion        | summer |      150 |              7 |             — |        80 |                 570 |                81.4 |              63.33 |
| Tomato       | summer |      200 |              9 |             3 |        60 |                 340 |                37.8 |              37.78 |
| Chili Pepper | summer |      220 |              8 |             3 |        55 |                 275 |                34.4 |              30.56 |
| Corn         | summer |      300 |             14 |             3 |       100 |                 600 |                42.9 |              66.67 |
| Sunflower    | summer |      250 |             10 |             — |       180 |                1370 |               137.0 |             152.22 |
| Melon        | summer |      450 |             12 |             — |       300 |                2250 |               187.5 |             250.00 |
| Carrot       | autumn |      150 |              7 |             — |        90 |                 660 |                94.3 |              73.33 |
| Spinach      | autumn |      160 |              6 |             — |        85 |                 605 |               100.8 |              67.22 |
| Sweet Potato | autumn |      250 |              8 |             2 |        60 |                 290 |                36.3 |              32.22 |
| Eggplant     | autumn |      220 |              9 |             3 |        70 |                 410 |                45.6 |              45.56 |
| Bell Pepper  | autumn |      280 |             10 |             3 |        75 |                 395 |                39.5 |              43.89 |
| Pumpkin      | autumn |      450 |             13 |             — |       320 |                2430 |               186.9 |             270.00 |
| Frostkale    | winter |      300 |             10 |             — |       220 |                1680 |               168.0 |             186.67 |
| Snowpea      | winter |      260 |              8 |             3 |        70 |                 370 |                46.3 |              41.11 |

Regrowing crops continue producing without another bag: each additional complete harvest adds nine times the crop’s unit shipping price in a full patch. For a crop planted on season day 1 and harvested after every required watered night, harvest opportunities are bounded by the thirty-day season and arrival of the next morning. Greenhouse crops are exempt from seasonal withering. Winter crops are principally greenhouse crops in the design.

Twenty-seven actively maintained plots are the short-simulation baseline. Enlarging the garden also increases watering workload and the food/tool budget. Rain frees energy for gathering, fishing, mining, or social visits. Selling at a shop yields less than overnight shipping; shipped quality is tracked separately in the collection totals.

## Tools and production

| Upgrade reached |   Gold | Bars               | Time unavailable |
| --------------- | -----: | ------------------ | ---------------: |
| Bronze          |  1,000 | 2 Bronze Bars      |           2 days |
| Iron            |  2,500 | 2 Iron Bars        |           2 days |
| Silversteel     |  5,000 | 2 Silversteel Bars |           2 days |
| Starglass       | 10,000 | 2 Starglass Bars   |           2 days |

Each bar consumes three matching ore pieces. Smelting costs 50G per bar without an owned furnace; the furnace removes the service fee. All upgrades together cost 18,500G per tool, plus eight bars and eight days of unavailability. The first two tiers cost 3,500G and four bars per tool, making orchard clearance an appreciable early project.

The watering can holds 30/50/80/120/160 uses across base through Starglass tiers. Charging the hoe or watering can expands the worked area to 1×3, 3×3, 3×5, or 5×5. Tilling and watering each worked tile cost energy; an upgraded tool improves convenience and reach rather than making all work free.

Processing recipes specify a machine and an hour count. They convert farm products into mayonnaise, cheese, yarn, preserves, pickles, butter, yogurt, or bars. Recipe inputs and outputs are cross-validated against the item catalog.

## Livestock return on investment

Animals arrive as adults and can produce after a fed night. Chickens and cows produce daily; sheep produce on every third absolute game day. Baseline calculations use normal products and purchased fodder at 15G per animal per day. Feeding, petting, and brushing raise affection and improve product quality, so consistent care can shorten the actual payback. Outdoor grazing consumes a mature planted grass patch on eligible sunny/cloudy days. Perennial patches regrow in three days. Silo capacity is 200/500/999; fodder harvest falls back to the bag when storage is full, and refuses harvest if neither has room.

| Animal  | Purchase | Normal output           | Approx. daily gross | Daily feed | Operating net/day | Animal-only payback |                First animal plus basic building |
| ------- | -------: | ----------------------- | ------------------: | ---------: | ----------------: | ------------------: | ----------------------------------------------: |
| Chicken |   1,500G | Egg, 60G daily          |                 60G |        15G |               45G |  34 productive days |  89 productive days, plus 3 construction nights |
| Cow     |   6,000G | Milk, 100G daily        |                100G |        15G |               85G |  71 productive days | 142 productive days, plus 3 construction nights |
| Sheep   |   4,500G | Wool, 120G every 3 days |                 40G |        15G |               25G |            180 days |            420 days, plus 3 construction nights |

The basic coop costs 2,500G, 80 wood, and 30 stone; the barn costs 6,000G, 140 wood, and 80 stone. Building costs are shared by up to four initial animals, making the first animal’s payback the slowest. Wood and stone labor, illness, breeding, gifts, and processing are not monetized in this simple table. Wool’s relatively slow baseline return is a known balance pressure; affection, yarn production, and grazing matter substantially.

Neglect reduces affection, may cause sickness, and can cause an animal to leave temporarily. Animal tonic costs 500G; recovery is possible. Products are not generated by sick or absent animals. The sheep’s calendar-based production interval may place the first wool collection earlier than three nights after purchase.

## Simulation evidence and targets

These are the final-mechanics runs reported by the systems suite: seed pouches preserve unused seeds; travel follows connected maps; the bot physically clears the orchard; fishing enforces rod tier, season, time, and weather; upgrades consume earned ore and gold. The strategy uses ordinary commands rather than debug rewards.

| Run             | Seed | Duration |   Earned | End cash | Crops shipped | Fish species | Result                                  |
| --------------- | ---: | -------: | -------: | -------: | ------------: | -----------: | --------------------------------------- |
| Spring baseline | 1739 |  30 days |  21,216G |   3,841G |           207 |            3 | Within the 15,000–25,000G Spring target |
| Full story      | 1739 | 300 days | 469,029G | 368,914G |         1,800 |           24 | Thriving Willowmere                     |
| Full story      |   42 | 300 days | 467,240G | 367,995G |         1,800 |           24 | Thriving Willowmere                     |
| Full story      |  808 | 300 days | 461,432G | 359,987G |         1,784 |           24 | Thriving Willowmere                     |
| Full story      | 2026 | 300 days | 455,730G | 352,795G |         1,777 |           24 | Thriving Willowmere                     |
| Full story      |  991 | 300 days | 461,748G | 359,533G |         1,800 |           24 | Thriving Willowmere                     |

All five full runs restore the four Hearthstones, complete nine arcs through forty-five sequential scenes, find ten distinct Sunroots, catch all twenty-four fish species, attend all nine festivals, marry Ivy on day 126, adopt a child on day 246, and reach the Thriving ending. Deterministic replay passed. The bot gathers, farms, cares for a chicken, visits neighbors with connected-map travel, gifts, fishes at valid hours, and mines to earn upgrade materials. This establishes command-level reachability and economic solvency; it does not measure a human player’s 25–35-hour completion time or replace browser journeys through every story scene.

Full-run income spans 455,730–469,029G, a range of about 3% around the middle. Substantial end cash reflects the bot’s focus on story and collections rather than buying every furnishing and building upgrade. It is not evidence that every late-game spending path has been equally balanced.
