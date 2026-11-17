import { Button } from "@ui-sdk/react/button";
import { Switch, SwitchThumb } from "@ui-sdk/react/switch";
import { useEffect, useState } from "react";
import { sfx, type PlayOptions, type SoundName, type Tier } from "../sound";
import "./SoundAudition.css";

interface Measurement {
  name: SoundName;
  variant: string;
  peakDb: number;
  peakUnlimitedDb: number;
  loudestDb: number;
  rmsDb: number;
  seconds: number;
  audibleSeconds: number;
  tailDb: number;
}

const tiers: { tier: Tier; title: string }[] = [
  { tier: "tick", title: "Ticks" },
  { tier: "small", title: "Small" },
  { tier: "medium", title: "Moments" },
  { tier: "large", title: "Good news" },
  { tier: "flourish", title: "Flourishes" },
];

const variants: Partial<Record<SoundName, { label: string; options: PlayOptions }[]>> = {
  correct: [1, 2, 3, 4, 5].map((streak) => ({ label: `Streak ${streak}`, options: { streak } })),
  select: [0, 1, 2, 3].map((index) => ({ label: `Option ${index + 1}`, options: { index } })),
  confidence: [1, 2, 3].map((index) => ({ label: `Sure ${index}`, options: { index } })),
};

const db = (value: number) => Math.round(20 * Math.log10(Math.max(value, 1e-6)) * 10) / 10;

function measure(buffer: AudioBuffer): Omit<Measurement, "name" | "variant" | "peakUnlimitedDb"> {
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, i) => buffer.getChannelData(i));
  const length = buffer.length;
  let peak = 0;
  for (const data of channels) for (let i = 0; i < length; i++) peak = Math.max(peak, Math.abs(data[i]!));

  // Loudness in 50 ms windows: the loudest window, the RMS while sounding, and where it fades 60 dB under the peak.
  const window = Math.round(buffer.sampleRate * 0.05);
  let loudest = 0;
  let energy = 0;
  let counted = 0;
  let lastAudible = 0;
  let lastLoud = 0;
  const windows: number[] = [];
  for (let start = 0; start < length; start += window) {
    let sum = 0;
    const end = Math.min(length, start + window);
    for (const data of channels) for (let i = start; i < end; i++) sum += data[i]! * data[i]!;
    const rms = Math.sqrt(sum / ((end - start) * channels.length));
    loudest = Math.max(loudest, rms);
    windows.push(rms);
    if (rms > peak * 0.001) lastAudible = end;
    if (rms > peak * 0.01) {
      energy += sum;
      counted += (end - start) * channels.length;
    }
  }
  windows.forEach((rms, i) => {
    if (rms > loudest * 0.0316) lastLoud = (i + 1) * window;
  });
  let tail = 0;
  for (const data of channels) for (let i = Math.max(0, length - Math.round(buffer.sampleRate * 0.01)); i < length; i++) tail = Math.max(tail, Math.abs(data[i]!));

  return {
    peakDb: db(peak),
    loudestDb: db(loudest),
    rmsDb: db(Math.sqrt(energy / Math.max(1, counted))),
    seconds: Math.round((lastAudible / buffer.sampleRate) * 100) / 100,
    audibleSeconds: Math.round((lastLoud / buffer.sampleRate) * 100) / 100,
    tailDb: db(tail),
  };
}

async function measureAll(gentle: boolean): Promise<Measurement[]> {
  const rows: Measurement[] = [];
  for (const name of sfx.names) {
    for (const { label, options } of variants[name] ?? [{ label: "", options: {} }]) {
      const limited = await sfx.render(name, options, { gentle });
      const raw = await sfx.render(name, options, { gentle, limit: false });
      rows.push({ name, variant: label, ...measure(limited), peakUnlimitedDb: measure(raw).peakDb });
    }
  }
  return rows;
}

function SoundAudition() {
  const [gentle, setGentle] = useState(false);
  const [rows, setRows] = useState<Measurement[]>();
  const [measuring, setMeasuring] = useState(false);

  // ?sounds&measure measures on load, so a headless browser can read the table.
  useEffect(() => {
    if (new URLSearchParams(location.search).has("measure")) void runMeasurements();
  }, []);

  async function runMeasurements() {
    setMeasuring(true);
    try {
      setRows(await measureAll(gentle));
    } finally {
      setMeasuring(false);
    }
  }

  function play(name: SoundName, options: PlayOptions = {}) {
    sfx.unlock();
    // The first press may only unlock audio; play once the context is running.
    if (sfx.running) sfx.play(name, { gentle, ...options });
    else setTimeout(() => sfx.play(name, { gentle, ...options }), 80);
  }

  return (
    <main className="audition" data-sound="off">
      <header>
        <h1>Sloodle sounds</h1>
        <p>Every sound in the app, in order of size. Volume and mute from Settings apply here too.</p>
        <label data-slot="label">
          <Switch checked={gentle} onCheckedChange={setGentle}>
            <SwitchThumb />
          </Switch>
          Reduced motion version
        </label>
        <div data-slot="row">
          <Button onClick={() => void runMeasurements()} disabled={measuring}>
            {measuring ? "Measuring…" : "Measure loudness"}
          </Button>
          <Button render={<a href="./" />}>Back to the app</Button>
        </div>
      </header>

      {tiers.map(({ tier, title }) => (
        <section key={tier}>
          <h2>{title}</h2>
          <ul>
            {sfx.names
              .filter((name) => sfx.tier(name) === tier)
              .map((name) => (
                <li key={name}>
                  <Button data-variant="solid" onClick={() => play(name)}>
                    {name}
                  </Button>
                  <span>{sfx.label(name)}</span>
                  {variants[name]?.map(({ label, options }) => (
                    <Button key={label} onClick={() => play(name, options)}>
                      {label}
                    </Button>
                  ))}
                </li>
              ))}
          </ul>
        </section>
      ))}

      {rows && (
        <section>
          <h2>Measurements</h2>
          <p>
            Rendered offline at 48 kHz through the same chain, volume at 100%. Loudest is the loudest 50 ms window; lengths are
            where it falls 60 dB under the peak and 30 dB under the loudest window.
          </p>
          <table>
            <thead>
              <tr>
                <th>Sound</th>
                <th>Peak dBFS</th>
                <th>Peak before limiter</th>
                <th>Loudest 50 ms</th>
                <th>RMS while sounding</th>
                <th>Length to -60 dB</th>
                <th>Length to -30 dB</th>
                <th>Last 10 ms</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.name + row.variant}>
                  <td>
                    {row.name} {row.variant}
                  </td>
                  <td>{row.peakDb}</td>
                  <td>{row.peakUnlimitedDb}</td>
                  <td>{row.loudestDb}</td>
                  <td>{row.rmsDb}</td>
                  <td>{row.seconds}</td>
                  <td>{row.audibleSeconds}</td>
                  <td>{row.tailDb}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <pre id="sound-measurements" hidden>
            {JSON.stringify(rows)}
          </pre>
        </section>
      )}
    </main>
  );
}

export { measureAll, SoundAudition };
