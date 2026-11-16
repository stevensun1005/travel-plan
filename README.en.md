# travel-plan

**Turn scattered travel notes into a page you can plan together.**

[Live demo: Toronto → Oʻahu](https://stevensun1005.github.io/travel-plan/demo/) · [Costa Rica demo](https://stevensun1005.github.io/travel-plan/costa-rica/) · [Install in one message](#install-in-one-message) · [中文 README](README.md) · [Skill instructions](SKILL.md)

![Interactive budget](docs/assets/budget.png)

A Codex skill with a buildless website starter. Merge PDFs and previous plans, research date-specific flight/hotel/car options, build realistic daily schedules, and let travelers compare choices with a live budget and spending chart.

- **Real geography:** Leaflet, OpenStreetMap, cached OSRM road geometry, daily filters and directions — plus an offline OSM base map (land, forests, lakes, road classes down to tertiary roads, route shields, place names) so the map still reads when a host blocks map tiles.
- **Chinese / English switch:** an "EN / ZH" button in the top bar flips the whole page; Chinese is the default. English content lives in `trip-data.en.json` (same ids, amounts and dates), interface strings in `i18n.mjs`, and the validator rejects any Chinese character left in the English file.
- **Where in the world:** a bundled world outline (Natural Earth 1:110m, public domain) with country names stays visible when you zoom out. Set `map.home` to mark the departure city and add a button that frames home and the trip together.
- **Share a route poster:** one button draws a hand-drawn poster of every day's route, place stickers and highlights, with a save-image button.
- **Link preview card:** `make_card.py` captures a 1200×630 card the page draws itself (title, dates, travelers, budget and the route map) and writes the Open Graph / Twitter tags, so a shared link shows up as a picture card in iMessage, WhatsApp, Telegram, Slack and X. claude.ai Artifact links get the same card: the page shows `og.png` full-screen when claude.ai captures its preview.
- **Hand-drawn look:** graph-paper and chalkboard themes, handwriting headings, highlighter marks, boarding-pass flight cards and a little travelling alpaca.
- **Make your own:** a 「做同款攻略」 button in the top bar (and 「复制提示词」 at the bottom) copies a ready-to-paste prompt that installs travel-plan in Claude Code or Codex and starts a new plan.
- **Pre-departure checklist:** travel documents for each traveler's passport and residency (visas, electronic travel authorisations, passport validity, return documents) and bookings with release windows, sorted by deadline with countdowns.
- **Phone-friendly:** a two-row top bar on phones, swipeable day filters and map stops (tap a stop to jump to it on the map), and route legs folded away until needed.
- **Multi-platform prices:** the agent first asks about nonstop and airline preferences, then prices the same flight or room on the airline site, Trip.com/Ctrip, Booking.com, Expedia and Vio. Foreign-currency quotes are converted at central-bank rates (`apply_quotes.py --fetch-fx`), each option takes the cheapest platform and names it, and every card lists the comparison. Flights are always compared with one carry-on bag per traveler.
- **Ledger breakdown:** under the spending chart each category is a row with its share and a progress bar; tap 「+」 to expand every line item, like an expense app. Items must add up to the option amount (the validator checks), and scale with package splits and baggage counts. With `chartGroups`, related categories that are chosen separately (two hotels, car and fuel) share one slice and expand into their parts; totals are unchanged.
- **Cash to bring:** an optional section under the budget says how much US dollars and local currency to carry, where to get each (before departure or an ATM on arrival), which bills, and the cash-only uses — entry fees, tips, stalls, parking attendants. It is advice, not another expense, and stays out of the chart.
- **Useful choices:** compare whole-trip options, edit custom amounts and budget limits, see percentages, save locally. Flight+hotel packages lock the included hotel (and transfers) automatically, so nothing is counted twice.
- **Research that keeps its limits:** price records, estimates and bookings remain distinct; taxes, luggage, age restrictions and rental periods matter.
- **Coverage you can inspect:** every requested source item is scheduled, replaced, optional or explicitly excluded.
- **Shareable output:** validate, package only required files, publish through available authorized hosting tools.

The live demo is a real plan made with travel-plan: Toronto to Oʻahu for five nights in January, with a nonstop flight or an Expedia flight+hotel package, one rental-car day, tours instead of a second car day, and a pre-departure checklist for two different passports. Prices are records and estimates from 2026-11-15; **nothing is booked**. `create_trip.py --demo` still creates a fictional Vancouver sample.

A second real plan: [Toronto → Costa Rica, Jan 6–11](https://stevensun1005.github.io/travel-plan/costa-rica/) — two beach nights and three nights by Arenal volcano by rental car, with flights, two hotels and car/fuel/parking chosen separately but grouped in the chart, a night rainforest walk, horseback riding, hot springs and stargazing, no long mountain drives after dark, and how many US dollars and colones to bring. Also records and estimates only; nothing is booked. Add `?lang=en` to any demo URL to open it in English.

| Offline base map | Share route poster |
| :---: | :---: |
| [![Land, forests, road classes, route shields and place names](docs/assets/map.png)](docs/assets/map.png) | [![Hand-drawn poster with each day's route, place stickers and highlights](docs/assets/share-poster.png)](docs/assets/share-poster.png) |

For multi-city requests, the agent can extend the starter with city/night/order choices, rail-versus-flight options, event-anchored scheduling, and linked dates, lodging, maps and costs. Attraction details include photos, reasons to visit, duration and ticket information across every route. Expedia research follows the requested itinerary; mismatched quotes become estimates again while manual budgets survive. See [multi-city workflow](references/multi-city.md). These extensions are task-specific; the Oʻahu demo uses the single-city starter.

## Install in one message

Copy this whole block and send it to the Claude Code or Codex session you already use; it will install the skill for you:

```text
Please install the travel-plan skill: https://github.com/stevensun1005/travel-plan
- If you are Claude Code: run git clone https://github.com/stevensun1005/travel-plan ~/.claude/skills/travel-plan
- If you are Codex: git clone the repository into a temporary folder, then run python scripts/install.py inside it
- If it is already installed, git pull in the installed folder to update it
Then read its SKILL.md and tell me how to start my first trip plan.
```

For claude.ai or the Claude desktop app, upload the skill as described below.

## Install

**Claude:** upload the `claude-skill/travel-plan` folder (zipped, containing `travel-plan/SKILL.md`) in Claude's skills settings. It is a small bootstrap that clones or pulls this repository into `.skills/travel-plan` on every run and then follows the full `SKILL.md`, so later updates apply automatically.

**Codex:**

Requires Python 3.10+ and a skill-enabled Codex environment. No npm install or API key is needed for the starter demo.

```bash
git clone https://github.com/stevensun1005/travel-plan.git
cd travel-plan
python scripts/install.py
```

Then invoke `$travel-plan`. The installer preserves an existing skill directory instead of overwriting it.

## Try it

```bash
python scripts/create_trip.py ./my-trip --demo
python scripts/validate_trip.py ./my-trip
python scripts/serve.py ./my-trip
```

Open the actual URL printed by the server. The demo includes cached roads and an offline base map; online tiles require internet access. Omit `--demo` for a blank trip.

```bash
python scripts/fetch_routes.py ./my-trip
python scripts/fetch_basemap.py ./my-trip   # offline base map; shapely optional for mainland coastlines
                                            # --detail full adds tertiary roads; widen --bbox for long coastal routes
python scripts/package_site.py ./my-trip ./site-output
```

Edit one `trip-data.json`. See [data contract](references/data.md), [research rules](references/research.md), and [sharing workflow](references/sharing.md).

“Live budget” means immediate local calculation, not continuous provider repricing. Choices are saved in each browser and do not automatically sync between travelers. Publishing requires an available hosting service and the appropriate authorization; localhost is not a remote sharing link.

## Checks

```bash
python -m unittest discover -s tests -p "test_*.py"
node --test tests/budget.test.mjs
node --check assets/starter/app.mjs
node --check assets/starter/share-map.mjs
```

## License

[Apache-2.0](LICENSE) with an attribution [NOTICE](NOTICE). You may use, modify and redistribute it, commercially too; **any copy, fork, port or rewrite (including versions regenerated with an AI assistant) must keep `LICENSE`, `NOTICE` and the header comment in each source file, and credit:**

> Based on travel-plan by Steven Sun — https://github.com/stevensun1005/travel-plan

Every source file starts with that credit, and [AGENTS.md](AGENTS.md) (read by Claude Code through `CLAUDE.md`) tells AI assistants that copy the project to keep it and add it to the new project. Making your own trip page with the skill needs nothing extra: generated pages carry the header, a footer GitHub link and the poster QR code.

Versions published before 2026-11-16 were MIT licensed, and copies of those versions stay under MIT (which also requires keeping the copyright notice). Component and map licenses are retained in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
