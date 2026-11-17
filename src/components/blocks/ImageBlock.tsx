import { isTauri } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Dialog, DialogBackdrop, DialogClose, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@ui-sdk/react/dialog";
import { useRef, useState, type MouseEvent } from "react";
import type { ImageCredit, ShownImage } from "../../api";
import { Markdown } from "../Markdown";
import { BlockHeader, type BlockProps } from "./parts";
import { usePictureUrl } from "./pictures";

const providerName: Record<ImageCredit["provider"], string> = { commons: "Wikimedia Commons" };

function openOutside(event: MouseEvent<HTMLAnchorElement>) {
  event.preventDefault();
  const { href } = event.currentTarget;
  if (isTauri()) void openUrl(href);
  else window.open(href, "_blank", "noopener");
}

function Credit({ credit }: { credit: ImageCredit }) {
  return (
    <>
      “{credit.title}” by {credit.author},{" "}
      {credit.licenceUrl ? (
        <a href={credit.licenceUrl} onClick={openOutside}>
          {credit.licence}
        </a>
      ) : (
        credit.licence
      )}
      , via{" "}
      <a href={credit.sourceUrl} onClick={openOutside}>
        {providerName[credit.provider]}
      </a>
    </>
  );
}

function Missing({ image }: { image: ShownImage }) {
  return (
    <div className="block-image-missing" role="note">
      <p className="chip" data-tone="partial">
        This picture isn't available, so here it is in words
      </p>
      <p>{image.alt}</p>
    </div>
  );
}

function Picture({ image, title }: { image: ShownImage; title: string }) {
  const url = usePictureUrl(image.src);
  const [failed, setFailed] = useState(false);
  // React's autoFocus sets no attribute the dialog can see, so name the Close button as the first focus explicitly.
  const close = useRef<HTMLButtonElement>(null);
  if (url === null || failed) return <Missing image={image} />;
  if (url === undefined) return <div className="block-image-frame" aria-busy="true" />;
  return (
    <Dialog>
      <DialogTrigger className="block-image-open">
        <span className="block-image-frame">
          <img src={url} alt={image.alt} loading="lazy" decoding="async" onError={() => setFailed(true)} />
        </span>
        <span className="block-sr"> (enlarge)</span>
      </DialogTrigger>
      <DialogBackdrop />
      <DialogContent className="block-image-dialog" initialFocus={() => close.current}>
        <img src={url} alt={image.alt} />
        <div data-slot="stack">
          <DialogTitle>{image.caption ?? title}</DialogTitle>
          <DialogDescription>{image.alt}</DialogDescription>
          {image.credit && (
            <p className="block-image-credit">
              <Credit credit={image.credit} />
            </p>
          )}
        </div>
        <div data-slot="row">
          <DialogClose data-variant="solid" ref={close}>
            Close
          </DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ImageBlock({ component }: BlockProps<"image">) {
  const { images } = component;
  const title = component.title ?? "Picture";
  const credited = images.filter((i) => i.credit);
  return (
    <figure className="content-card block block-image">
      <BlockHeader component={component} />
      {images.length === 1 ? (
        <div className="block-image-single">
          <Picture image={images[0]!} title={title} />
          {images[0]!.caption && <p className="block-image-caption">{images[0]!.caption}</p>}
        </div>
      ) : (
        <ul className="block-image-grid" data-count={images.length}>
          {images.map((image) => (
            <li key={image.src}>
              <Picture image={image} title={title} />
              {image.caption && <p className="block-image-caption">{image.caption}</p>}
            </li>
          ))}
        </ul>
      )}
      {(component.caption || credited.length > 0) && (
        <figcaption>
          {component.caption && <Markdown text={component.caption} />}
          {credited.length === 1 ? (
            <p className="block-image-credit">
              <Credit credit={credited[0]!.credit!} />
            </p>
          ) : credited.length > 1 ? (
            <details className="block-describe block-image-credits">
              <summary>Picture credits</summary>
              <ul>
                {credited.map((image) => (
                  <li key={image.src} className="block-image-credit">
                    <Credit credit={image.credit!} />
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </figcaption>
      )}
    </figure>
  );
}

export { ImageBlock };
