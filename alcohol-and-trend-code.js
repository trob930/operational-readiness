/* ============================================================
   OPERATIONAL READINESS — Alcohol Input + Trend Chart
   Standalone implementation matching FEATURE_SPEC_alcohol_trend_history.md

   This assumes a localStorage-based check-in log, since the live app
   says "Logs stored locally on device by default." Adjust the storage
   key names (CHECKIN_KEY, BODYCOMP_KEY, SETTINGS_KEY) to match your
   actual code once you compare.
   ============================================================ */

const CHECKIN_KEY = "or_daily_checkins";   // array of daily check-in objects
const BODYCOMP_KEY = "or_body_comp_logs";  // array of {date, weight, bodyFatPct}
const SETTINGS_KEY = "or_privacy_settings"; // { crewShared: bool, alcoholShared: bool }

/* ------------------------------------------------------------
   1. ALCOHOL INPUT — HTML to add to the Daily Log tab,
      placed near Caffeine (same visual pattern as existing fields)
   ------------------------------------------------------------ */
const alcoholInputHTML = `
<div class="input-section" id="alcohol-section">
  <h3>Alcohol <span class="lock-note">🔒 Private by default — see Privacy settings</span></h3>

  <label for="alcohol-drinks">Alcohol last night</label>
  <select id="alcohol-drinks">
    <option value="none">None</option>
    <option value="1-2">1–2 drinks</option>
    <option value="3+">3+ drinks</option>
  </select>

  <div id="alcohol-timing-wrap" style="display:none;">
    <label for="alcohol-timing">How close to bedtime?</label>
    <select id="alcohol-timing">
      <option value="more_than_3hr_before_bed">More than 3 hours before</option>
      <option value="within_3hr_of_bed">Within 3 hours</option>
    </select>
  </div>
</div>
`;

// Show/hide timing question based on drinks selection
function initAlcoholInput() {
  const drinksSelect = document.getElementById("alcohol-drinks");
  const timingWrap = document.getElementById("alcohol-timing-wrap");
  if (!drinksSelect || !timingWrap) return;

  drinksSelect.addEventListener("change", () => {
    timingWrap.style.display = drinksSelect.value === "none" ? "none" : "block";
  });
}

/* ------------------------------------------------------------
   2. SCORING LOGIC — alcohol as a Sleep Strain modifier
   ------------------------------------------------------------ */
function applyAlcoholModifier(baseSleepStrainScore, alcoholDrinks, alcoholTiming) {
  let penalty = 0;

  if (alcoholDrinks === "1-2") penalty = 4;
  else if (alcoholDrinks === "3+") penalty = 9;

  if (alcoholTiming === "within_3hr_of_bed") penalty *= 1.5;

  const adjusted = baseSleepStrainScore + penalty;
  return Math.max(0, Math.min(100, adjusted)); // clamp to 0-100
}

// Example integration point — call this wherever your existing
// sleep strain calculation currently returns its value:
//
//   const rawSleepStrain = calculateBaseSleepStrain(hoursSlept, sleepQuality);
//   const sleepStrain = applyAlcoholModifier(rawSleepStrain, alcoholDrinks, alcoholTiming);

/* ------------------------------------------------------------
   3. PRIVACY — independent alcohol-sharing toggle
   ------------------------------------------------------------ */
function getPrivacySettings() {
  const raw = localStorage.getItem(SETTINGS_KEY);
  return raw ? JSON.parse(raw) : { crewShared: false, alcoholShared: false };
}

function setAlcoholShared(value) {
  const settings = getPrivacySettings();
  settings.alcoholShared = value;
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

// Privacy settings row HTML (add to Profile tab, separate from
// the general crew-sharing toggle):
const alcoholPrivacyToggleHTML = `
<div class="privacy-row">
  <label for="alcohol-shared-toggle">Share alcohol data with agency view</label>
  <input type="checkbox" id="alcohol-shared-toggle" />
  <p class="privacy-note">
    Off by default. Your sleep, stress, and readiness trends can be shared
    separately from this — alcohol always requires its own explicit opt-in.
  </p>
</div>
`;

function initAlcoholPrivacyToggle() {
  const toggle = document.getElementById("alcohol-shared-toggle");
  if (!toggle) return;
  toggle.checked = getPrivacySettings().alcoholShared;
  toggle.addEventListener("change", () => setAlcoholShared(toggle.checked));
}

/* ------------------------------------------------------------
   4. SAVING A CHECK-IN — include the new alcohol fields
   ------------------------------------------------------------ */
function saveDailyCheckin(existingCheckinData) {
  const alcoholDrinks = document.getElementById("alcohol-drinks")?.value || "none";
  const alcoholTiming = alcoholDrinks !== "none"
    ? document.getElementById("alcohol-timing")?.value || "more_than_3hr_before_bed"
    : "none";

  const checkin = {
    ...existingCheckinData,
    date: new Date().toISOString().slice(0, 10),
    alcoholDrinks,
    alcoholTiming,
  };

  const logs = JSON.parse(localStorage.getItem(CHECKIN_KEY) || "[]");
  logs.push(checkin);
  localStorage.setItem(CHECKIN_KEY, JSON.stringify(logs));
  return checkin;
}

/* ------------------------------------------------------------
   5. HISTORY TAB — indexed, inverted trend chart
      Requires Chart.js loaded on the page:
      <script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js"></script>
   ------------------------------------------------------------ */
function indexToPercentChange(values) {
  const base = values[0];
  if (!base) return values.map(() => 0);
  return values.map(v => Math.round(((v - base) / Math.abs(base)) * 1000) / 10);
}

function renderTrendChart(canvasId, days = 30) {
  const checkins = JSON.parse(localStorage.getItem(CHECKIN_KEY) || "[]").slice(-days);
  const bodyComp = JSON.parse(localStorage.getItem(BODYCOMP_KEY) || "[]").slice(-days);

  if (checkins.length < 2) {
    console.warn("Not enough check-in data yet to render a trend.");
    return;
  }

  const labels = checkins.map(c => c.date);

  const weight = indexToPercentChange(bodyComp.map(b => b.weight));
  const bodyFat = indexToPercentChange(bodyComp.map(b => b.bodyFatPct));
  const sleepStrain = indexToPercentChange(checkins.map(c => c.sleepStrainScore));
  const alcoholScore = indexToPercentChange(
    checkins.map(c => (c.alcoholDrinks === "3+" ? 9 : c.alcoholDrinks === "1-2" ? 4 : 0))
  );
  const stress = indexToPercentChange(checkins.map(c => c.stressLevel));

  // Invert self-reported readiness so "up" always means "worse"
  const readinessInverted = indexToPercentChange(checkins.map(c => -c.selfReadiness));

  const caffeine = indexToPercentChange(checkins.map(c => c.caffeineMg));

  new Chart(document.getElementById(canvasId), {
    type: "line",
    data: {
      labels,
      datasets: [
        { label: "Weight", data: weight, borderColor: "#2a78d6", borderWidth: 2, pointRadius: 0, tension: 0.3 },
        { label: "Body fat %", data: bodyFat, borderColor: "#1baf7a", borderWidth: 2, pointRadius: 0, tension: 0.3 },
        { label: "Sleep strain", data: sleepStrain, borderColor: "#eda100", borderWidth: 2, pointRadius: 0, tension: 0.3 },
        { label: "Alcohol", data: alcoholScore, borderColor: "#e34948", borderWidth: 2, pointRadius: 0, tension: 0.3, borderDash: [5, 3] },
        { label: "Stress", data: stress, borderColor: "#4a3aa7", borderWidth: 2, pointRadius: 0, tension: 0.3 },
        { label: "Self-reported readiness (inverted)", data: readinessInverted, borderColor: "#008300", borderWidth: 2, pointRadius: 0, tension: 0.3 },
        { label: "Caffeine", data: caffeine, borderColor: "#eb6834", borderWidth: 2, pointRadius: 0, tension: 0.3, borderDash: [5, 3] },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { display: false }, // build your own HTML legend to match app styling
        tooltip: {
          callbacks: {
            label: (ctx) => `${ctx.dataset.label}: ${ctx.parsed.y > 0 ? "+" : ""}${ctx.parsed.y}%`,
          },
        },
      },
      scales: {
        x: { grid: { display: false } },
        y: {
          title: { display: true, text: "% change from baseline (higher = more strain)" },
        },
      },
    },
  });
}

/* ------------------------------------------------------------
   INIT — call these once your DOM is ready
   ------------------------------------------------------------ */
document.addEventListener("DOMContentLoaded", () => {
  initAlcoholInput();
  initAlcoholPrivacyToggle();
  // renderTrendChart("trend-canvas-id", 30); // call when History tab opens
});
