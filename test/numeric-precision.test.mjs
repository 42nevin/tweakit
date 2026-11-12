/* The public numeric controls' `snap: false` opt-out: a finite value inside the
 * authored bounds keeps its exact number instead of landing on the step grid,
 * while `step` stays the keyboard/scrub increment. These are preimplementation
 * rows: without the option the grid rows below fail with the snapped value; the
 * default and snap:true rows pin the behavior the opt-out must leave unchanged.
 * Runs against the built single-file bundle under jsdom. */
import test from "node:test";
import assert from "node:assert/strict";
import "./_setup-dom.mjs";
import { loadSingle, key, warnings } from "./_helpers.mjs";

const { tweaks, enhance } = await loadSingle();
const f32 = Math.fround;

// Seeds the step grid would move: off-step values, f32 projections, and an
// integer that already sits on the grid.
const SEEDS = [
  ["slider off-step", { type: "slider", value: 576.5, min: 1, max: 2000, step: 1 }, 576.5],
  ["number off-step", { type: "number", value: 576.5, min: 1, max: 2000, step: 1 }, 576.5],
  ["slider f32", { type: "slider", value: f32(0.1), min: 0, max: 1, step: 0.01 }, f32(0.1)],
  ["number f32", { type: "number", value: f32(0.1), min: 0, max: 1, step: 0.01 }, f32(0.1)],
  ["number f32 at step 0.1", { type: "number", value: f32(13.37), min: 1, max: 96, step: 0.1 }, f32(13.37)],
  ["number f32 at step 1", { type: "number", value: f32(300.1), min: 1, max: 4000, step: 1 }, f32(300.1)],
  ["integer on the grid", { type: "number", value: 1100, min: 1, max: 4000, step: 1 }, 1100],
];

for (const [name, spec, expected] of SEEDS) {
  test(`snap:false keeps an exact ${name} seed`, () => {
    const p = tweaks("Seed", { v: { ...spec, snap: false } });
    assert.equal(p.params.v, expected);
    const shown =
      spec.type === "slider"
        ? p.el.querySelector(".twk-slider-value").textContent
        : p.el.querySelector(".twk-num").value;
    assert.equal(shown, String(expected), `${name} readout keeps its exact number`);
    p.destroy();
  });
}

test("snap:false clamps only the authored bounds, not the step grid's ends", async () => {
  const spec = { type: "slider", value: 4.75, min: 0.25, max: 4.75, step: 1, snap: false };
  const p = tweaks("Bounds", {
    sliderLow: spec,
    sliderHigh: spec,
    numberLow: { ...spec, type: "number" },
    numberHigh: { ...spec, type: "number" },
  });
  for (const key of ["sliderLow", "sliderHigh", "numberLow", "numberHigh"])
    assert.equal(p.params[key], 4.75, `${key} starts at the authored max`);

  await warnings(async () => {
    p.set("sliderLow", 0.1);
    p.set("sliderHigh", 9);
    p.set("numberLow", 0.1);
    p.set("numberHigh", 9);
  });
  assert.deepEqual(
    [p.params.sliderLow, p.params.sliderHigh, p.params.numberLow, p.params.numberHigh],
    [0.25, 4.75, 0.25, 4.75],
  );
  p.destroy();
});

test("snap:false keeps programmatic and typed values exact", async () => {
  const p = tweaks("Writes", {
    n: { type: "number", value: 0, min: 0, max: 1, step: 0.01, snap: false },
    s: { type: "slider", value: 0, min: 0, max: 1, step: 0.01, snap: false },
  });
  await p.ready;
  p.set("n", f32(0.1));
  p.set("s", f32(0.1));
  assert.equal(p.params.n, f32(0.1));
  assert.equal(p.params.s, f32(0.1));

  const field = p.el.querySelector(".twk-num");
  field.value = "0.503";
  field.dispatchEvent(new window.Event("change", { bubbles: true }));
  assert.equal(p.params.n, 0.503, "a typed off-step value commits exactly");
  assert.equal(field.value, "0.503", "the typed field keeps the exact number");
  p.destroy();
});

test("snap:false keeps step as the keyboard increment from the exact value", async () => {
  const p = tweaks("Keys", {
    s: { type: "slider", value: 576.5, min: 1, max: 2000, step: 1, snap: false },
    n: { type: "number", value: 576.5, min: 1, max: 2000, step: 1, snap: false },
  });
  await p.ready;
  key(p.el.querySelector(".twk-slider"), { key: "ArrowRight" });
  assert.equal(p.params.s, 577.5, "one slider step adds one to 576.5");

  const field = p.el.querySelector(".twk-num");
  field.focus();
  key(field, { key: "ArrowUp" });
  assert.equal(p.params.n, 577.5, "one number step adds one to 576.5");
  assert.equal(field.value, "577.5", "the field shows the incremented exact number");
  p.destroy();
});

test("snap:false setMany({ silent: true }) writes exact values without an event", async () => {
  const p = tweaks("Silent", {
    s: { type: "slider", value: 0, min: 0, max: 2000, step: 1, snap: false },
    n: { type: "number", value: 0, min: 0, max: 1, step: 0.01, snap: false },
  });
  await p.ready;
  const heard = [];
  p.on((_, changed) => heard.push(changed));
  p.setMany({ s: 576.5, n: f32(0.1) }, { silent: true });
  assert.equal(p.params.s, 576.5);
  assert.equal(p.params.n, f32(0.1));
  assert.deepEqual(heard, [], "a silent batch does not echo");
  p.destroy();
});

test("the numeric controls still snap to the step grid by default and with snap:true", () => {
  for (const snap of [undefined, true]) {
    const p = tweaks("Default", {
      s: { type: "slider", value: 576.5, min: 1, max: 2000, step: 1, snap },
      n: { type: "number", value: 576.5, min: 1, max: 2000, step: 1, snap },
    });
    assert.equal(p.params.s, 577, `slider default (snap: ${snap})`);
    assert.equal(p.params.n, 577, `number default (snap: ${snap})`);
    p.destroy();
  }
  const soft = tweaks("SoftDefault", {
    d: { type: "slider", value: 576.5, min: 1, max: 2000, step: 1, soft: true },
  });
  assert.equal(soft.params.d, 577, "soft keeps its published grid behavior without the opt-out");
  soft.destroy();
});

test("markup data-snap=false reaches the same control as the schema option", async () => {
  const host = document.createElement("div");
  host.innerHTML =
    '<div data-twk="slider" data-value="576.5" data-min="1" data-max="2000" data-step="1"></div>' +
    '<div data-twk="slider" data-value="4.75" data-min="0.25" data-max="4.75" data-step="1" data-snap="false"></div>' +
    '<div data-twk="number" data-value="13.37" data-min="1" data-max="96" data-step="0.1" data-snap="false"></div>';
  document.body.append(host);
  await enhance(host);

  const [plain, slider] = host.querySelectorAll("[role=slider]");
  assert.equal(plain.getAttribute("aria-valuenow"), "577", "markup without data-snap keeps the step grid");
  assert.equal(slider.getAttribute("aria-valuenow"), "4.75", "the markup seed keeps its exact value");
  assert.deepEqual(
    [slider.getAttribute("aria-valuemin"), slider.getAttribute("aria-valuemax")],
    ["0.25", "4.75"],
    "the markup bounds stay as authored",
  );
  assert.equal(host.querySelector(".twk-num").value, "13.37", "the number field keeps its exact seed");
  host.remove();
});
