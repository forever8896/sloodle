// Everything after the first screen, in its own chunk so the hero paints first.
import { Build } from "./sections/Build";
import { Compose } from "./sections/Compose";
import { Film } from "./sections/Film";
import { Get } from "./sections/Get";

export { Footer } from "./sections/Get";
import { Share } from "./sections/Share";
import { Teach } from "./sections/Teach";
import { Yours } from "./sections/Yours";

export default function Below() {
  return (
    <>
      <Compose />
      <Build />
      <Teach />
      <Share />
      <Yours />
      <Film />
      <Get />
    </>
  );
}
