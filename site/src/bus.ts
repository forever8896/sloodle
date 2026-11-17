// Small cross-section signals: the hero's "Watch the ad" asks the film to play, whenever the film is mounted.
let wantsAd = false;
const listeners = new Set<() => void>();

export function requestAdPlay(): void {
  wantsAd = true;
  for (const listener of listeners) listener();
}

export function onAdRequest(listener: () => void): () => void {
  listeners.add(listener);
  if (wantsAd) listener();
  return () => listeners.delete(listener);
}

export function takeAdRequest(): boolean {
  const wanted = wantsAd;
  wantsAd = false;
  return wanted;
}
