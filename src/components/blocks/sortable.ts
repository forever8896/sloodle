// A list the learner sorts by dragging or with the keyboard: focus an item, Space or Enter picks it up, the arrows,
// Home and End move it, Space or Enter drops it, Escape puts it back. Built from ui-sdk's reorder and roving focus.
import { createChange, createReorder, createRovingFocus, definePrimitive, type ChangeDetails, type ReorderDraft, type ReorderReason } from "@ui-sdk/core";
import { createParts } from "@ui-sdk/react/primitive";

type SortableOptions = {
  value?: string[];
  defaultValue?: string[];
  onValueChange?: (value: string[], details: ChangeDetails<ReorderReason>) => void;
  /** The name screen readers hear for an item. */
  itemLabel?: (key: string) => string | undefined;
};

const sortable = definePrimitive({
  name: "sortable-list",
  options: { value: "list", defaultValue: "list", onValueChange: "callback", itemLabel: "value" },
  controlled: ["value"],
  state: (options: SortableOptions) => ({
    value: options.value ?? options.defaultValue ?? [],
    moving: null as ReorderDraft | null,
    focused: null as string | null,
  }),
  sync: (options) => (options.value === undefined ? {} : { value: options.value }),
  api: (context) => {
    const change = createChange(context);
    const roving = createRovingFocus(context, { slot: "item", key: "focused" });
    const reorder = createReorder(context, {
      slot: "item",
      key: "value",
      draft: "moving",
      set: (value, details) => change("value", value, details),
      label: (key) => context.options().itemLabel?.(key),
    });
    return { roving, reorder };
  },
  slots: (slot) => ({
    root: slot<{}, { order: string[] }>({
      role: "listbox",
      keys: { none: "Each option handles its own keys, so a picked-up item can move." },
      state: (state, { api }) => ({ order: api.reorder.order(state) }),
      attrs: () => ({ "aria-roledescription": "sortable list" }),
    }),
    item: slot<{ value: string }, { grabbed: boolean; moving: boolean; position: number }>({
      props: { value: "string" },
      role: "option",
      focus: "roving",
      press: { none: "Space and Enter pick an item up and drop it, through the reorder keydown handler." },
      state: (state, { api, key }) => ({ grabbed: api.reorder.dragging(state, key), moving: api.reorder.moving(state, key), position: api.reorder.order(state).indexOf(key) + 1 }),
      attrs: (state, part) => ({
        tabindex: part.api.roving.tabIndex(state, part),
        "aria-selected": String(part.api.reorder.moving(state, part.key)),
        "aria-roledescription": "sortable item",
        "data-grabbed": part.api.reorder.dragging(state, part.key) ? "" : undefined,
        "data-moving": part.api.reorder.moving(state, part.key) ? "" : undefined,
      }),
      on: {
        keydown: (event, { el, api, key }) => {
          if (!api.reorder.keydown(event, key) && el) api.roving.keydown(event, el);
        },
        pointerdown: (event, { api, key }) => api.reorder.pointerdown(event, key),
      },
      bind: (el, part) => {
        const cleanups = [part.api.roving.bind(el, part), part.api.reorder.bind(el, part)];
        return () => cleanups.forEach((cleanup) => cleanup());
      },
    }),
  }),
});

const { Root: SortableList, Item: SortableItem } = createParts(sortable, { root: "ol", item: "li" });

export { SortableItem, SortableList };
