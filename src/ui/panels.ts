import type { GameState } from "../state/game";
import {
  achievements,
  buildings,
  crops,
  decor,
  festivals,
  fish,
  floors,
  flowers,
  itemById,
  items,
  maps,
  minerals,
  npcs,
  processedGoods,
  recipes,
  shops,
  trees,
  wallpapers,
} from "../data/catalog";
import {
  chapters,
  arcs,
  heartEvents,
  marriageEvents,
  journalPages,
  letters,
  tv,
} from "../data/narrative";
import { sunrootDiscoveries } from "../data/sunroots";
import { siloCapacity, siloFodder } from "../systems/pasture";
import { resolveSchedule } from "../systems/engine";
import { t, esc, button, money, dateParts } from "./i18n";
import { sprite } from "./sprites";
const qty = (s: GameState, id: string) =>
  s.inventory
    .filter((row) => row.id === id)
    .reduce((sum, row) => sum + row.quantity, 0);
const tabs = (selected: string, rows: [string, string][]) =>
  `<nav class="tabs">${rows.map(([id, key]) => button(t(key), "tab", { tab: id }, selected === id ? "active" : "")).join("")}</nav>`;
const empty = (key = "app.empty") => `<p class="muted">${t(key)}</p>`;
const price = (value: number) => t("shop.price", { n: money(value) });
const itemName = (id: string) => esc(itemById(id)?.name ?? id);
const hearts = (value: number) =>
  `<div class="heart-bar" aria-label="${esc(t("people.hearts", { n: Math.floor(value / 100) }))}">${Array.from({ length: 10 }, (_, i) => `<i class="heart ${value >= (i + 1) * 100 ? "full" : ""}" aria-hidden="true"></i>`).join("")}</div>`;

export function renderCalendar(s: GameState): string {
  const d = dateParts(s.day),
    start = s.day - d.day + 1;
  return `<p>${t("hud.day", { ...d, season: t(`hud.season.${d.season}`) })}</p><div class="calendar-grid">${["mon", "tue", "wed", "thu", "fri", "sat", "sun"].map((day) => `<div class="calendar-weekday">${t(`calendar.${day}`)}</div>`).join("")}${Array.from({ length: start % 7 }, () => "<div></div>").join("")}${Array.from(
    { length: 30 },
    (_, i) => {
      const day = i + 1;
      const events = festivals.filter(
        (f) =>
          f.season === d.season &&
          f.day === day &&
          (f.id !== "lantern_bloom_vigil" || s.flags.bloom),
      );
      return `<div class="calendar-cell ${day === d.day ? "today" : ""} ${events.length ? "event" : ""}"><span>${day}</span>${events.map((f) => `<small>${esc(f.name)}</small>`).join("")}${npcs
        .filter((n) => n.birthday.season === d.season && n.birthday.day === day)
        .map(
          (n) =>
            `<small>${esc(t("calendar.birthday", { name: n.name }))}</small>`,
        )
        .join("")}${s.markers
        .filter((m) => m.day === start + i)
        .map((m) => `<small>${esc(m.label)}</small>`)
        .join("")}</div>`;
    },
  ).join(
    "",
  )}</div><div class="divider"></div><div class="row wrap"><label class="field"><span>${t("calendar.marker")}</span><input id="marker-label" maxlength="60"></label><label class="field"><span>${t("new.day")}</span><input id="marker-day" type="number" min="1" max="30" value="${d.day}"></label>${button(t("calendar.add"), "marker")}</div>`;
}
export function renderPeople(s: GameState): string {
  return `<p class="muted">${t("people.desc")}</p><div class="neighbors">${npcs
    .map((n) => {
      const schedule = resolveSchedule(s, n.id),
        here = schedule?.map === s.player.map;
      return `<article class="neighbor-card"><div class="portrait">${sprite(`portrait_${n.id}_neutral`, 1.4)}</div><div><h3>${esc(n.name)}</h3><p>${esc(n.role)} · ${t("people.age", { n: n.age })}</p>${hearts(s.friendship[n.id] ?? 0)}<p>${t("people.birthday", { season: t(`hud.season.${n.birthday.season}`), day: n.birthday.day })}</p><p>${t("people.where", { map: esc(maps.find((m) => m.id === schedule?.map)?.name ?? n.home) })}</p>${s.relationships.spouse === n.id ? `<p>${t("people.married")}</p>` : s.relationships.dating === n.id ? `<p>${t("people.dating")}</p>` : ""}<div class="row wrap">${here ? button(t("people.talk"), "talk", { npc: n.id }, "small") + button(t("people.gift"), "giftChoose", { npc: n.id }, "small") : `<p>${t("people.far")}</p>`}${n.romanceable && here ? button(t("people.date"), "date", { npc: n.id }, "small") + button(t("people.propose"), "propose", { npc: n.id }, "small") : ""}</div></div></article>`;
    })
    .join("")}</div>`;
}
export function renderMap(s: GameState): string {
  const current = maps.find((m) => m.id === s.player.map);
  return `<p class="muted">${t("map.desc")}</p><div class="map-grid">${maps
    .map((m) => {
      const connected = current?.connections.includes(m.id),
        here = m.id === s.player.map;
      return `<article class="story-card ${here ? "active" : ""}"><h3>${esc(m.name)}</h3><p>${here ? t("map.current") : connected ? t("map.connected") : t("map.locked")}</p>${connected ? button(t("map.visit"), "travel", { map: m.id }, "small") : ""}</article>`;
    })
    .join("")}</div>`;
}
export function renderCollections(s: GameState, tab = "shipped"): string {
  const nav = tabs(
    tab,
    ["shipped", "fish", "minerals", "recipes", "achievements"].map((id) => [
      id,
      `collection.${id}`,
    ]),
  );
  if (tab === "achievements")
    return (
      nav +
      `<div class="grid-two">${achievements.map((a) => `<article class="achievement-card"><h3>${s.achievements.includes(a.id) ? "✦" : "◇"} ${esc(a.name)}</h3><p class="muted">${esc(a.description)}</p></article>`).join("")}</div>`
    );
  const rows =
    tab === "fish"
      ? fish
      : tab === "minerals"
        ? minerals
        : tab === "recipes"
          ? recipes
          : items.filter((i) =>
              [
                "crop",
                "fruit",
                "flower",
                "animal",
                "processed",
                "forage",
              ].includes(i.category),
            );
  return (
    nav +
    `<div class="shop-grid">${rows
      .map((row) => {
        const found =
          tab === "fish"
            ? (s.fishRecords[row.id] ?? 0) > 0
            : tab === "recipes"
              ? s.knownRecipes.includes(row.id)
              : (s.collections[row.id] ?? 0) > 0;
        return `<article class="shop-card">${sprite(`item_${row.id}`, 1.5)}<div class="shop-info"><h3>${found ? esc(row.name) : t("collection.unknown")}</h3><p>${tab === "fish" && found ? t("collection.record", { n: s.fishRecords[row.id] ?? 0 }) : t("collection.progress", { n: s.collections[row.id] ?? 0 })}</p></div></article>`;
      })
      .join("")}</div>`
  );
}
export function renderShop(s: GameState, tab = "seeds"): string {
  const d = dateParts(s.day);
  const ids = new Set(
    tab === "seeds"
      ? [...crops, ...flowers]
          .filter((c) => c.season === d.season)
          .map((c) => `${c.id}_seed`)
          .concat(trees.map((tree) => `${tree.id}_sapling`))
      : tab === "decor"
        ? [...decor, ...wallpapers, ...floors].map((i) => i.id)
        : items
            .filter((i) =>
              (tab === "materials"
                ? ["material", "mineral"]
                : [
                    "feed",
                    "care",
                    "ingredient",
                    "fertilizer",
                    "gift",
                    "upgrade",
                  ]
              ).includes(i.category),
            )
            .map((i) => i.id),
  );
  const stock = [...shops]
    .sort(
      (a, b) => Number(b.map === s.player.map) - Number(a.map === s.player.map),
    )
    .flatMap((shop) => shop.stock)
    .filter(
      (row, index, all) =>
        ids.has(row.item) &&
        all.findIndex((other) => other.item === row.item) === index,
    );
  return (
    tabs(
      tab,
      ["seeds", "supplies", "decor", "materials"].map((id) => [
        id,
        `shop.${id}`,
      ]),
    ) +
    `<div class="row between"><p class="muted">${t("shop.desc")}</p><label class="field"><span>${t("shop.quantity")}</span><input id="buy-quantity" type="number" min="1" max="99" value="1"></label></div><div class="divider"></div><div class="shop-grid">${stock.map((row) => `<article class="shop-card">${sprite(`item_${row.item}`, 1.5)}<div class="shop-info"><h3>${itemName(row.item)}</h3><p>${esc(itemById(row.item)?.description ?? "")}</p><p>${t("shop.owned", { n: qty(s, row.item) })}</p>${button(t("shop.sale", { n: money(row.price) }), "buy", { item: row.item })}</div></article>`).join("")}</div>`
  );
}
export function renderAnimals(s: GameState): string {
  return `<p class="muted">${t("animals.desc")}</p><p>${t("animals.silo", { stored: siloFodder(s), capacity: siloCapacity(s) })}</p>${
    s.buildings.coop
      ? `<article class="story-card"><h3>${t("animals.incubator")}</h3>${
          s.animals
            .filter((a) => a.kind === "chicken" && a.pregnant !== null)
            .map(
              (a) =>
                `<p>${sprite("item_egg")} ${t("animals.hatching", { n: Math.max(0, a.pregnant! - s.day) })}</p>`,
            )
            .join("") || `<p>${t("animals.incubatorHelp")}</p>`
        }</article>`
      : ""
  }<div class="stack">${s.animals.length ? s.animals.map((a) => `<article class="story-card"><div class="row between"><h3>${sprite(`animal_${a.kind}_down_0`, 1.5)} ${esc(a.name)}</h3><span>${t(`animals.${a.kind}`)}</span></div>${hearts(Math.floor((a.affection / 255) * 1000))}<p>${t(a.sick ? "animals.sick" : a.fed ? "animals.fed" : "animals.hungry")}</p><div class="row wrap">${(["feed", "pet", "brush", "outside"] as const).map((kind) => button(t(kind === "outside" && a.outside ? "animals.inside" : `animals.${kind}`), "care", { animal: a.id, kind }, "small")).join("")}${a.away ? button(t("animals.recover"), "care", { animal: a.id, kind: "recover" }, "small") : ""}${a.sick ? button(t("animals.tonic"), "care", { animal: a.id, kind: "cure" }, "small") : ""}${a.product ? button(t("animals.collect"), "collect", { animal: a.id }, "small") : ""}${button(t(a.kind === "chicken" ? "animals.incubate" : "animals.breed"), "breed", { animal: a.id }, "small")}</div></article>`).join("") : empty("animals.empty")}</div><div class="divider"></div>${button(t("animals.petCare", { name: esc(s.player.petName) }), "care", { animal: "pet", kind: "pet" })}<div class="divider"></div><label class="field"><span>${t("animals.name")}</span><input id="animal-name" maxlength="16" value=""></label><div class="row wrap">${(["chicken", "cow", "sheep"] as const).map((kind) => button(`${t("animals.buy")} · ${t(`animals.${kind}`)} · ${price(kind === "chicken" ? 1500 : kind === "cow" ? 6000 : 4500)}`, "buyAnimal", { kind })).join("")}</div>`;
}
export function renderCraft(s: GameState, tab = "buildings"): string {
  const nav = tabs(tab, [
    ["buildings", "craft.buildings"],
    ["tools", "craft.tools"],
    ["smelt", "craft.smelt"],
    ["cook", "craft.cook"],
    ["process", "craft.process"],
  ]);
  if (tab === "tools")
    return (
      nav +
      `<div class="shop-grid">${Object.entries(s.tools)
        .filter(([id]) => !["milker", "brush", "shears"].includes(id))
        .map(
          ([id, tool]) =>
            `<article class="shop-card">${sprite(`tool_${id}`, 2)}<div class="shop-info"><h3>${t(`hud.tool.${id}`)}</h3><p>${t("craft.tier", { n: tool.tier })}</p>${tool.readyDay !== undefined ? `<p>${t("craft.duration", { n: Math.max(0, tool.readyDay - s.day) })}</p>` : button(t("craft.upgrade"), "upgrade", { tool: id })}</div></article>`,
        )
        .join("")}</div>`
    );
  if (tab === "smelt")
    return (
      nav +
      `<div class="shop-grid">${minerals
        .slice(0, 4)
        .map(
          (ore) =>
            `<article class="shop-card">${sprite(`item_${ore.id}`, 1.5)}<div><h3>${esc(ore.name)}</h3><p>${t("shop.owned", { n: qty(s, ore.id) })}</p>${button(t("craft.smelt"), "smelt", { item: ore.id })}</div></article>`,
        )
        .join("")}</div>`
    );
  if (tab === "cook" || tab === "process") {
    const rows = tab === "cook" ? recipes : processedGoods;
    return (
      nav +
      `<p class="muted">${tab === "cook" ? t("craft.recipe", { n: s.knownRecipes.length }) : t("craft.process")}</p><div class="shop-grid">${rows.map((row) => `<article class="shop-card">${sprite(`item_${row.id}`, 1.5)}<div class="shop-info"><h3>${esc(row.name)}</h3><p>${row.ingredients.map((part) => `${itemName(part.item)} ${qty(s, part.item)}/${part.count}`).join(" · ")}</p>${button(t(tab === "cook" ? "craft.cook" : "craft.beginProcess"), tab, { id: row.id })}</div></article>`).join("")}</div>`
    );
  }
  return (
    nav +
    `<div class="shop-grid">${buildings.map((b) => `<article class="story-card"><h3>${esc(b.name)}</h3><p>${t("craft.cost", { gold: money(b.cost), wood: b.wood, stone: b.stone })}</p><p>${t("craft.duration", { n: b.days })}</p>${s.construction[b.id] !== undefined ? `<p>${t("craft.constructing")}</p>` : button(t("craft.build"), "build", { id: b.id })}</article>`).join("")}</div>`
  );
}
export function renderJournal(s: GameState, tab = "story"): string {
  const nav = tabs(
    tab,
    ["story", "pages", "arcs", "memories", "sunroots", "requests"].map((id) => [
      id,
      `journal.${id}`,
    ]),
  );
  if (tab === "pages")
    return (
      nav +
      `<div class="stack">${journalPages.map((page) => `<article class="story-card"><h3>${esc(page.title)}</h3><p>${esc(page.hint)}</p>${s.flags[`page_${page.id}`] ? button(t("journal.read"), "readPage", { id: page.id }) : button(t("journal.discover"), "discover", { id: page.id })}</article>`).join("")}</div>`
    );
  if (tab === "arcs")
    return (
      nav +
      `<div class="stack">${arcs.map((arc) => `<article class="story-card"><h3>${esc(arc.name)}</h3><p>${arc.npcs.map((id) => esc(npcs.find((npc) => npc.id === id)?.name ?? id)).join(" · ")}</p><p>${arc.events.filter((id) => s.flags[id]).length} / ${arc.events.length}</p>${s.flags[`arc_${arc.id}`] ? `<p>${esc(arc.epilogue)}</p>` : `<p>${t("journal.inProgress")}</p>${button(t("journal.inspect"), "story", { id: arc.id })}`}</article>`).join("")}</div>`
    );
  if (tab === "memories") {
    const available = [...heartEvents, ...marriageEvents].filter(
      (e) =>
        (s.friendship[e.npc] ?? 0) >= e.hearts * 100 &&
        (!marriageEvents.includes(e) || s.relationships.spouse === e.npc),
    );
    return (
      nav +
      `<p>${t("journal.memoryHelp")}</p><div class="stack">${available.map((e) => `<article class="story-card"><h3>${esc(e.title)}</h3><p>${esc(npcs.find((n) => n.id === e.npc)?.name ?? e.npc)} · ${esc(maps.find((m) => m.id === e.location)?.name ?? e.location)}</p>${button(t(s.flags[e.flag] ? "journal.replay" : "journal.inspect"), s.flags[e.flag] ? "replayScene" : "story", { id: e.id })}</article>`).join("")}</div>${available.length ? "" : empty("journal.noMemories")}`
    );
  }
  if (tab === "sunroots")
    return (
      nav +
      `<div class="stack">${sunrootDiscoveries.map((root) => `<article class="story-card"><h3>${esc(root.name)}</h3><p>${esc(root.hint)}</p><p>${esc(maps.find((map) => map.id === root.map)?.name ?? root.map)}</p>${s.flags[root.id] ? t("journal.complete") : button(t("journal.discover"), "story", { id: root.id })}</article>`).join("")}</div>`
    );
  if (tab === "requests") {
    const season = dateParts(s.day).season;
    const requests = crops.filter((crop) => crop.season === season).slice(0, 3);
    return (
      nav +
      `<p>${t("journal.notices")}</p><div class="stack">${requests.map((crop) => `<article class="story-card"><h3>${t("journal.request", { item: esc(crop.name) })}</h3><p>${t("shop.owned", { n: qty(s, crop.id) })} / 3</p><p>${t("journal.reward")}</p>${s.flags[`quest_${Math.floor(s.day / 7)}_${crop.id}`] ? t("journal.complete") : button(t("journal.deliver"), "quest", { id: crop.id })}</article>`).join("")}</div>`
    );
  }
  return (
    nav +
    `<p>${t("journal.tree")}</p><div class="stack">${chapters.map((chapter) => `<article class="story-card"><h3>${esc(chapter.title)}</h3><p>${esc(chapter.objective)}</p>${button(t("journal.inspect"), "story", { id: chapter.id })}</article>`).join("")}<article class="story-card"><h3>${t("journal.boat")}</h3><p>${t("journal.boatMaterials", { wood: qty(s, "wood"), iron: qty(s, "iron_bar") })}</p>${s.flags.boat_repaired ? t("journal.complete") : button(t("journal.boatDeliver"), "story", { id: "boat" })}</article><article class="story-card"><h3>${t("journal.restore")}</h3><div class="row wrap">${button(t("evaluation.title"), "story", { id: "vote" })}</div></article></div>`
  );
}
export function renderMail(s: GameState, tab = "letters"): string {
  const nav = tabs(tab, [
    ["letters", "mail.letters"],
    ["tv", "mail.tv"],
  ]);
  if (tab === "tv")
    return (
      nav +
      `<div class="stack"><article class="story-card"><h3>${t("mail.weather")}</h3><p>${t("mail.forecast", { weather: t(`hud.weather.${s.forecast}`) })}</p></article>${tv
        .filter((program, index) => {
          const channelPrograms = tv.filter(
            (row) => row.channel === program.channel,
          );
          return (
            channelPrograms[s.day % channelPrograms.length]?.id ===
            tv[index]?.id
          );
        })
        .map(
          (program) =>
            `<article class="story-card"><h3>${esc(program.title)}</h3><p>${esc(program.text)}</p></article>`,
        )
        .join("")}${button(t("mail.tv"), "tv")}</div>`
    );
  const received = letters.filter((letter) => s.mail.includes(letter.id));
  return (
    nav +
    (received.length
      ? `<div class="stack">${received.map((letter) => `<article class="book-page"><h3>${esc(letter.title)}</h3><p>${esc(letter.text)}</p></article>`).join("")}</div>`
      : empty("mail.empty"))
  );
}
export function renderDecor(s: GameState): string {
  const owned = [...decor, ...wallpapers, ...floors].filter(
    (item) => qty(s, item.id) > 0,
  );
  return `<p>${t("craft.coordinates")}</p><label class="field"><span>${t("craft.place")}</span><select id="decor-item">${owned.map((item) => `<option value="${item.id}">${esc(item.name)} (${qty(s, item.id)})</option>`).join("")}</select></label>${owned.length ? "" : empty()}<div class="decor-board">${Array.from(
    { length: 96 },
    (_, i) => {
      const x = i % 12,
        y = Math.floor(i / 12),
        placed = s.decorations.find((item) => item.x === x && item.y === y);
      return button(
        placed ? sprite(`item_${placed.id}`) : `${x + 1},${y + 1}`,
        "decorate",
        { x, y },
      );
    },
  ).join("")}</div>${button(t("shop.decor"), "open", { panel: "shop" })}`;
}
