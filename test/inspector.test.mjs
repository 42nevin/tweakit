import test from "node:test";
import assert from "node:assert/strict";
import "./_setup-dom.mjs";
import { key, loadSingle, loadSplit, ptr } from "./_helpers.mjs";

const single = await loadSingle();

test("inspector reconciles observations without replacing interactive rows or emitting edits", async () => {
  const actions = [],
    changes = [];
  const view = single.mountInspector(document.body, {
    onAction: (id) => actions.push(id),
    onChange: (id, value) => changes.push([id, value]),
  });
  const card = (measured, value) => ({
    title: "Live styles",
    groups: [
      {
        id: "geometry",
        label: "Geometry",
        rows: [
          { kind: "action", id: "a", label: "Select card", pressed: true },
          { kind: "control", id: "width:A", schema: { type: "number", label: "Width", value, step: 1, snap: false } },
          { kind: "fact", id: "mounted", label: "Measured", value: measured },
        ],
      },
    ],
  });
  await view.update(card("150 pt", 149.375));
  const button = view.el.querySelector('button[aria-pressed="true"]');
  const input = view.el.querySelector('input[aria-label="Width"]');
  input.focus();
  await view.update(card("180 pt", 179.375));
  assert.equal(document.activeElement, input);
  assert.equal(input.value, "179.375");
  assert.match(view.el.textContent, /180 pt/);
  assert.deepEqual(changes, []);
  button.click();
  assert.deepEqual(actions, ["a"]);
  key(input, { key: "ArrowUp" });
  assert.deepEqual(changes, [["width:A", 180.375]]);
  view.destroy();
  assert.equal(view.el.isConnected, false);
});

for (const [name, load] of [
  ["single", loadSingle],
  ["split", loadSplit],
]) {
  test(`managed numeric drafts survive silent host values and remount without emitting changes (${name})`, async () => {
    const { mountControl } = await load();
    const host = document.createElement("div");
    document.body.append(host);
    const drafts = [],
      values = [];
    const config = { type: "number", value: 3.375, min: 0, max: 30, step: 1, snap: false };
    const control = () =>
      mountControl(host, config, {
        onDraft: (d) => drafts.push(d),
        onChange: (v) => values.push(v),
      });
    const a = control();
    await a.ready;
    const field = host.querySelector("input");
    field.focus();
    field.value = "-";
    field.dispatchEvent(new Event("input", { bubbles: true }));
    field.dispatchEvent(new Event("change", { bubbles: true }));
    a.set(11.625, { silent: true });
    assert.deepEqual(drafts.at(-1), { text: "-", valid: false });
    assert.equal(field.getAttribute("aria-invalid"), "true");
    assert.equal(field.value, "-");
    assert.equal(a.get(), 11.625);
    assert.deepEqual(values, []);
    a.destroy();
    const b = control();
    b.setDraft("-");
    await b.ready;
    const resumed = host.querySelector("input");
    assert.equal(resumed.value, "-");
    assert.equal(resumed.getAttribute("aria-invalid"), "true");
    resumed.focus();
    key(resumed, { key: "Escape" });
    assert.equal(resumed.value, "3.375");
    assert.equal(drafts.at(-1), null);
    assert.deepEqual(values, []);
    b.destroy();
    host.remove();
  });

  test(`managed color drafts restore Hex and channel text without changing the accepted color (${name})`, async (t) => {
    const { mountControl } = await load();
    const host = document.body.appendChild(document.createElement("div"));
    const drafts = [],
      changes = [];
    const mount = () =>
      mountControl(
        host,
        { type: "color", value: "#336699" },
        {
          onDraft: (draft) => drafts.push(draft),
          onChange: (value) => changes.push(value),
        },
      );
    const toggle = () => host.querySelector("button").click();
    // jsdom supports the toolkit's inert property as an expando, not a reflected attribute.
    const picker = () => [...document.querySelectorAll(".twk-color-pop")].find((pop) => !pop.inert);
    t.after(() => {
      if (host.querySelector('button[aria-expanded="true"]')) toggle();
      host.remove();
    });
    const field = (label) => picker().querySelector(`input[aria-label="${label}"]`);
    const type = (input, value) => {
      input.focus();
      input.value = value;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    };
    const mode = (value) => {
      const select = picker().querySelector("select");
      select.value = value;
      select.dispatchEvent(new Event("change", { bubbles: true }));
    };
    const a = mount();
    await a.ready;
    toggle();
    type(field("Hex color"), "#12345");
    assert.equal(drafts.at(-1)?.valid, false);
    a.set("#4080C0", { silent: true });
    assert.equal(a.get(), "#4080C0");
    assert.equal(field("Hex color").value, "#12345");

    mode("srgb");
    type(field("R"), "-");
    type(field("G"), ".");
    const saved = drafts.at(-1);
    assert.deepEqual(changes, []);
    toggle();
    a.destroy();
    const b = mount();
    b.setDraft(saved);
    await b.ready;
    toggle();
    assert.equal(b.get(), "#336699", "restoring a notation and its text is not a color change");
    assert.equal(field("R").value, "-");
    assert.equal(field("G").value, ".");
    assert.equal(field("R").getAttribute("aria-invalid"), "true");
    mode("hex");
    assert.equal(field("Hex color").value, "#12345", "formatting does not discard another field's draft");
    key(field("Hex color"), { key: "Escape" });
    assert.equal(field("Hex color").value, "#336699");
    mode("srgb");
    assert.equal(field("G").value, ".");
    type(field("G"), "120");
    assert.equal(drafts.at(-1), null, "an applied color replaces all of this color's draft text");
    assert.deepEqual(changes, ["rgb(51 120 153)"]);
    assert.equal(field("R").value, "51");
    toggle();
    b.destroy();
  });
}

test("a captured slider delivers updates and one terminal event, even when detached", async () => {
  const host = document.createElement("div");
  document.body.append(host);
  const result = [];
  const slider = single.mountControl(
    host,
    { type: "slider", value: 2.375, min: 0, max: 10, snap: false },
    {
      onChange: (v) => result.push(v),
      onGesture: (phase) => result.push(phase),
    },
  );
  await slider.ready;
  const track = host.querySelector('[role="slider"]');
  track.parentElement.getBoundingClientRect = () => ({ left: 0, right: 100, width: 100 });
  track.dispatchEvent(ptr("pointerdown", { clientX: 20, clientY: 0 }));
  track.dispatchEvent(ptr("pointermove", { clientX: 60, clientY: 0 }));
  assert.equal(result[0], "start");
  assert.equal(result.at(-1), 6);
  slider.destroy();
  track.dispatchEvent(ptr("lostpointercapture", { clientX: 60, clientY: 0 }));
  assert.equal(result.at(-1), "end");
  assert.equal(result.filter((x) => x === "end").length, 1);
  host.remove();
});
