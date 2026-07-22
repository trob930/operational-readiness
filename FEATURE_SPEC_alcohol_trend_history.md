# Feature Spec: Alcohol Input + Body Comp / Strain Trend Chart

Status: Proposed
Target: History tab + Daily Check-in + Profile
Depends on: Supabase backend (users, daily_checkins tables)

---

## 1. Alcohol Input

### 1.1 Rationale

Alcohol disrupts sleep architecture and circadian regulation through a
distinct mechanism from sleep duration alone — it reduces sleep onset
latency but suppresses REM sleep, increases fragmentation, and impairs
breathing during sleep, with timing relative to the sleep window
modifying the effect (earlier consumption = less disruption). It belongs
in the Sleep Strain calculation as a modifier, not as sleep quality
itself.

### 1.2 Data model

New fields on the daily check-in record:

| Field | Type | Values | Notes |
|---|---|---|---|
| `alcohol_drinks` | enum | `none`, `1-2`, `3+` | Ranges, not exact counts — reduces stigma, still enough resolution for scoring |
| `alcohol_timing` | enum | `none`, `more_than_3hr_before_bed`, `within_3hr_of_bed` | Only shown if `alcohol_drinks != none` |
| `alcohol_shared` | boolean | default `false` | Independent consent flag — see 1.4 |

### 1.3 Scoring logic

Alcohol is a **modifier on Sleep Strain**, not a standalone factor:

```
alcohol_penalty = 0
if alcohol_drinks == "1-2":
    alcohol_penalty = 4
elif alcohol_drinks == "3+":
    alcohol_penalty = 9

if alcohol_timing == "within_3hr_of_bed":
    alcohol_penalty *= 1.5  # late consumption compounds the effect

sleep_strain_score = base_sleep_strain_score + alcohol_penalty
# clamp to existing 0-100 sleep strain scale
```

Tune the exact constants (`4`, `9`, `1.5x`) against your reference
sleep-debt weighting doc once alcohol is added there — the shape (range >
0, timing multiplies rather than adds) matters more than the exact
numbers at this stage.

### 1.4 Privacy — independent consent toggle

This is the part that matters most. Alcohol data does **not** inherit
the general crew-visibility consent setting. It gets its own toggle:

- New setting: `alcohol_shared` (boolean, default `false`, i.e. private)
- Location: Profile → Privacy → "Share alcohol data with agency view"
  as a separate row, visually distinct from the general sharing toggle
- Even if a user has opted into full crew/command visibility for
  everything else, alcohol stays private unless this specific toggle is
  turned on
- The daily check-in screen should show a small lock icon next to the
  alcohol field with a one-line note (see UI copy below) so this is
  visible in the moment of entry, not just buried in settings

### 1.5 UI copy

**Check-in field (only asks quantity + timing, not type of drink):**

> **Alcohol last night**
> This is private by default — see Privacy settings to change that.
>
> ○ None &nbsp; ○ 1–2 drinks &nbsp; ○ 3+ drinks
>
> *(if not "None")* How close to bedtime?
> ○ More than 3 hours before &nbsp; ○ Within 3 hours

**Privacy settings row:**

> **Share alcohol data with agency view**
> Off by default. Your sleep, stress, and readiness trends can be shared
> separately from this — alcohol always requires its own explicit opt-in.
> [ Toggle: Off ]

---

## 2. Body Composition Trend Data

### 2.1 Rationale

Body fat % and weight are already collected in Profile. This section
just formalizes how they feed the new trend chart (Section 3) — no new
input UI required here.

### 2.2 Data model

Existing Profile fields, confirm these are timestamped on each update
(not just current-value overwrite) so a history exists to chart:

| Field | Type | Notes |
|---|---|---|
| `weight` | number (lbs) | Timestamped log, not single current value |
| `body_fat_pct` | number | Timestamped log |
| `goal_weight` | number | Single current value, no history needed |

If these are currently stored as single overwritten values rather than
a log, that's the one schema change needed here: convert to a
`body_comp_logs` table (`user_id`, `date`, `weight`, `body_fat_pct`).

---

## 3. History Tab — Indexed Trend Chart

### 3.1 Rationale

Show body composition and the five (now including alcohol-adjusted
sleep) strain inputs on one chart so a first responder can see whether
their own patterns move together. This is explicitly correlational and
anecdotal, not diagnostic — the UI copy should say so.

### 3.2 Design rules

- **One y-axis.** All series indexed to percent change from a personal
  baseline (first value in the selected date range = 0%), because raw
  units (lbs, 0–100 score, drink count) aren't comparable on one scale.
- **Invert self-reported readiness** so all lines read in the same
  direction: "up = more strain" for every series, including readiness
  (a drop in readiness is plotted as a rise). Label this explicitly —
  see UI copy.
- **Dashed lines for alcohol and caffeine** — both are self-report
  fields with the highest under-reporting risk; the dashed style is a
  quiet visual flag distinguishing them from directly-measured/derived
  series.
- Default range: 30 days. Allow toggle to 7 / 30 / 90.

### 3.3 Series list

| Series | Source | Direction shown |
|---|---|---|
| Weight | body_comp_logs | raw % change |
| Body fat % | body_comp_logs | raw % change |
| Sleep strain (incl. alcohol modifier) | daily_checkins | raw — higher = worse |
| Alcohol | daily_checkins | raw — higher = worse (dashed) |
| Stress | daily_checkins | raw — higher = worse |
| Self-reported readiness | daily_checkins | **inverted** — higher = worse |
| Caffeine | daily_checkins | raw — higher = worse (dashed) |

### 3.4 UI copy

**Chart header:**

> **30-day trend, indexed to your baseline**
> Higher = more strain, on every line — including readiness, which is
> flipped so it reads the same direction as the rest.

**Footer note (always visible under the chart):**

> Correlational, not causal. This shows how your own patterns move
> together over time — it isn't a diagnosis.

### 3.5 Chart implementation notes

- Use a single-axis multi-line chart (Chart.js or similar), 7 series,
  fixed categorical color order so a given metric always gets the same
  color across sessions.
- Legend as custom HTML/UI, not the charting library's default — include
  the metric name only (no values in legend; values live in tooltip on
  hover/tap).
- Tooltip on hover/tap shows exact % change and, ideally, the underlying
  raw value (e.g. "Sleep strain: +14% (score 52)") so the indexed number
  isn't the only thing visible.

---

## 4. Build order

1. Convert `weight` / `body_fat_pct` in Profile to timestamped logs if
   not already (schema change, no UI change).
2. Add `alcohol_drinks`, `alcohol_timing`, `alcohol_shared` to daily
   check-in schema + form.
3. Add `alcohol_shared` toggle to Privacy settings, independent of the
   general sharing consent flag.
4. Update Sleep Strain scoring function to apply the alcohol modifier.
5. Build the History tab trend chart against the combined data (body
   comp logs + daily check-ins), with inversion and indexing as
   described in Section 3.
