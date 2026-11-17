import { Field, FieldDescription, FieldLabel } from "@ui-sdk/react/field";
import { Slider, SliderControl, SliderIndicator, SliderThumb, SliderTrack, SliderValue } from "@ui-sdk/react/slider";
import { Switch, SwitchThumb } from "@ui-sdk/react/switch";
import { useEffect, useState } from "react";
import { sfx, type SoundSettings as Settings } from "../sound";

function SoundSettings() {
  const [settings, setSettings] = useState<Settings>({ volume: sfx.volume, muted: sfx.muted });
  useEffect(() => sfx.subscribe(setSettings), []);

  return (
    <>
      <label data-slot="label">
        <Switch checked={!settings.muted} onCheckedChange={(on) => sfx.setMuted(!on)}>
          <SwitchThumb />
        </Switch>
        Play sounds
      </label>
      <Field>
        <Slider<number>
          value={settings.volume}
          min={0}
          max={1}
          step={0.05}
          format={{ style: "percent" }}
          disabled={settings.muted}
          onValueChange={(volume) => sfx.setVolume(volume)}
          onValueCommit={() => sfx.play("select", { index: 2 })}
        >
          <div data-slot="row">
            <FieldLabel>Sound volume</FieldLabel>
            <SliderValue />
          </div>
          <SliderControl>
            <SliderTrack>
              <SliderIndicator />
              <SliderThumb />
            </SliderTrack>
          </SliderControl>
        </Slider>
        <FieldDescription>
          Sounds get quieter while Sloo is speaking.
          {import.meta.env.DEV && (
            <>
              {" "}
              <a href="?sounds">Audition every sound</a>
            </>
          )}
        </FieldDescription>
      </Field>
    </>
  );
}

export { SoundSettings };
