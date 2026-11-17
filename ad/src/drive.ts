// Drives real components from the frame clock, the way a person would: by typing into their fields.
import { useLayoutEffect, type RefObject } from "react";

const setters = {
  input: Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!,
  textarea: Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!,
};

/** Puts `text` in a field and fires the input event React listens for, so controlled components update their state. */
export function typeInto(el: HTMLInputElement | HTMLTextAreaElement, text: string): void {
  if (el.value === text) return;
  (el instanceof HTMLTextAreaElement ? setters.textarea : setters.input).call(el, text);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

export function useTyped(ref: RefObject<HTMLInputElement | HTMLTextAreaElement | null>, text: string): void {
  useLayoutEffect(() => {
    if (ref.current) typeInto(ref.current, text);
  });
}

/** Types into the n-th field matching `selector` inside a container. */
export function useTypedIn(ref: RefObject<HTMLElement | null>, selector: string, texts: string[]): void {
  useLayoutEffect(() => {
    const fields = ref.current?.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(selector);
    fields?.forEach((field, i) => typeInto(field, texts[i] ?? ""));
  });
}
