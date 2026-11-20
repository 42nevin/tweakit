/* A presentation for host-owned inspection state. Rows have opaque keys, never
 * a document/runtime address. Only the caller interprets them or accepts edits. */
import { mountControl } from "./tweaks/core.js";
import type {
  ControlDraft,
  ControlGesturePhase,
  DraftInput,
  MountedControl,
  SchemaObject,
  Strings,
} from "./tweaks/types.js";

type Widget = Extract<SchemaObject, { type: "number" | "slider" | "color" }> & { label: string };
export type InspectorRow =
  | { kind: "action"; id: string; label: string; detail?: string; pressed?: boolean; disabled?: boolean }
  | { kind: "fact"; id: string; label: string; value: string }
  | { kind: "status"; id: string; text: string }
  | { kind: "control"; id: string; schema: Widget; draft?: DraftInput; holdValue?: boolean };
export interface InspectorModel {
  title: string;
  groups: readonly { id: string; label: string; rows: readonly InspectorRow[] }[];
  strings?: Strings;
}
export interface InspectorOptions {
  onAction(id: string): void;
  onChange(id: string, value: unknown): void;
  onDraft?(id: string, draft: ControlDraft | null): void;
  onGesture?(id: string, phase: ControlGesturePhase): void;
}
export interface InspectorView {
  el: HTMLElement;
  /** Render an authoritative presentation. Resolves when its controls are ready. */
  update(model: InspectorModel): Promise<void>;
  /** Finishes captured gestures and removes this view. The caller owns drafts. */
  destroy(): void;
}
type MountedRow = { kind: InspectorRow["kind"]; node: HTMLElement; control?: MountedControl; signature?: string };
type MountedGroup = { node: HTMLElement; heading: HTMLElement; rows: Map<string, MountedRow> };

const el = <T extends keyof HTMLElementTagNameMap>(tag: T, name?: string) => {
  const node = document.createElement(tag);
  if (name) node.className = name;
  return node;
};
const place = (parent: HTMLElement, node: HTMLElement, previous: HTMLElement | null) => {
  const position = previous ? previous.nextSibling : parent.firstChild;
  if (position !== node) parent.insertBefore(node, position);
};
const disposeRow = (row: MountedRow) => {
  row.control?.destroy();
  row.node.remove();
};
const disposeGroup = (group: MountedGroup) => {
  for (const row of group.rows.values()) disposeRow(row);
  group.node.remove();
};

export function mountInspector(host: Element, options: InspectorOptions): InspectorView {
  const view = el("section", "twk-panel twk-inspector");
  const title = el("h1", "twk-inspector-title");
  const body = el("div", "twk-inspector-groups");
  view.append(title, body);
  host.append(view);
  const groups = new Map<string, MountedGroup>();
  return {
    el: view,
    async update(model) {
      title.textContent = model.title;
      view.setAttribute("aria-label", model.title);
      const ready: Promise<MountedControl>[] = [];
      const wanted = new Set(model.groups.map(({ id }) => id));
      for (const [id, group] of groups) {
        if (wanted.has(id)) continue;
        disposeGroup(group);
        groups.delete(id);
      }
      let previousGroup: HTMLElement | null = null;
      for (const spec of model.groups) {
        let group = groups.get(spec.id);
        if (!group) {
          const node = el("section", "twk-inspector-group");
          const heading = el("h2", "twk-inspector-heading");
          node.append(heading);
          group = { node, heading, rows: new Map() };
          groups.set(spec.id, group);
        }
        group.heading.textContent = spec.label;
        group.node.setAttribute("aria-label", spec.label);
        place(body, group.node, previousGroup);
        previousGroup = group.node;
        const keys = new Set(spec.rows.map(({ id }) => id));
        for (const [id, row] of group.rows) {
          if (keys.has(id)) continue;
          disposeRow(row);
          group.rows.delete(id);
        }
        let previousRow = group.heading;
        for (const item of spec.rows) {
          let row = group.rows.get(item.id);
          if (row && row.kind !== item.kind) {
            disposeRow(row);
            row = undefined;
          }
          if (!row) {
            const node = item.kind === "action" ? el("button", "twk-inspector-action") : el("div", "twk-inspector-row");
            row = { kind: item.kind, node };
            group.rows.set(item.id, row);
            if (item.kind === "action") {
              (node as HTMLButtonElement).type = "button";
              node.onclick = () => options.onAction(item.id);
            }
            if (item.kind === "fact") node.append(el("span", "twk-inspector-term"), el("span"));
            if (item.kind === "status") node.setAttribute("role", "status");
          }
          place(group.node, row.node, previousRow);
          previousRow = row.node;
          switch (item.kind) {
            case "action": {
              const button = row.node as HTMLButtonElement;
              button.textContent = item.label;
              button.disabled = item.disabled === true;
              if (item.detail !== undefined) button.setAttribute("aria-description", item.detail);
              else button.removeAttribute("aria-description");
              if (item.pressed !== undefined) button.setAttribute("aria-pressed", String(item.pressed));
              else button.removeAttribute("aria-pressed");
              break;
            }
            case "fact":
              row.node.children[0].textContent = item.label;
              row.node.children[1].textContent = item.value;
              break;
            case "status":
              if (row.node.textContent !== item.text) row.node.textContent = item.text;
              break;
            case "control": {
              const { value, ...shape } = item.schema;
              const signature = JSON.stringify([shape, model.strings]);
              if (signature !== row.signature || !row.control) {
                row.control?.destroy();
                row.signature = signature;
                row.control = mountControl(row.node, item.schema, {
                  key: item.id,
                  strings: model.strings,
                  onChange: (value, id) => options.onChange(id, value),
                  onDraft: options.onDraft && ((draft, id) => options.onDraft(id, draft)),
                  onGesture: options.onGesture && ((phase, id) => options.onGesture(id, phase)),
                });
              } else if (!item.holdValue && !Object.is(row.control.get(), value)) {
                row.control.set(value, { silent: true });
              }
              row.control.setDraft(item.draft ?? null);
              ready.push(row.control.ready);
              break;
            }
          }
        }
      }
      await Promise.all(ready);
    },
    destroy() {
      for (const group of groups.values()) disposeGroup(group);
      groups.clear();
      view.remove();
    },
  };
}
