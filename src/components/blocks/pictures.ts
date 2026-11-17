// Where a lesson picture is loaded from. A component names it by an engine path (/images/<course>/<id>); the window
// loads it from the engine's local server with the run's token, never from the internet. The gallery and demo have
// no engine and use the small copies in public/samples instead.
import { createContext, useContext, useEffect, useState } from "react";
import { demo, engineUrl } from "../../api";
import { samplePictures } from "./samples";

type PictureSource = (src: string) => Promise<string | undefined>;

const ENGINE_PATH = /^\/images\/[a-z0-9-]+\/img-[0-9a-f]{16}$/;

/** Anything that is not an engine picture path is refused rather than loaded. */
const fromEngine: PictureSource = async (src) => (ENGINE_PATH.test(src) ? engineUrl(src) : undefined);
const fromSamples: PictureSource = async (src) => samplePictures[src.split("/").pop() ?? ""];

const PictureSourceContext = createContext<PictureSource>(demo ? fromSamples : fromEngine);

/** The address to load, `undefined` while it is being worked out, or `null` when there is none. */
function usePictureUrl(src: string): string | null | undefined {
  const source = useContext(PictureSourceContext);
  const [url, setUrl] = useState<string | null>();
  useEffect(() => {
    let cancelled = false;
    setUrl(undefined);
    source(src).then(
      (resolved) => !cancelled && setUrl(resolved ?? null),
      () => !cancelled && setUrl(null),
    );
    return () => {
      cancelled = true;
    };
  }, [source, src]);
  return url;
}

export { fromSamples, PictureSourceContext, usePictureUrl };
