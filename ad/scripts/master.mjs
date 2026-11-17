// Masters a mix to about -16 LUFS integrated with a true peak at or below -1.5 dBFS:
// gain plus a gentle peak limiter, then two-pass linear loudnorm (measure, then apply the measured values).
//   node scripts/master.mjs <in.wav> <out.wav> [target LUFS]
import { execFileSync } from "node:child_process";

const [input, output, target = "-16"] = process.argv.slice(2);
const measure = (file, filter = "") => {
  const log = execFileSync("ffmpeg", ["-hide_banner", "-nostats", "-i", file, "-af", `${filter}loudnorm=I=${target}:TP=-1.5:LRA=11:print_format=json`, "-f", "null", "-"], { stdio: ["ignore", "pipe", "pipe"] }).toString() || "";
  return log;
};
function loudness(file, filter = "") {
  const r = require_spawn(file, filter);
  return JSON.parse(r.slice(r.lastIndexOf("{"), r.lastIndexOf("}") + 1));
}
function require_spawn(file, filter) {
  try {
    execFileSync("ffmpeg", ["-hide_banner", "-nostats", "-i", file, "-af", `${filter}loudnorm=I=${target}:TP=-1.5:LRA=11:print_format=json`, "-f", "null", "-"], { stdio: ["ignore", "ignore", "pipe"] });
  } catch {}
  return execFileSync("bash", ["-c", `ffmpeg -hide_banner -nostats -i "${file}" -af "${filter}loudnorm=I=${target}:TP=-1.5:LRA=11:print_format=json" -f null - 2>&1`]).toString();
}
void measure;
const first = loudness(input);
const gain = Number(target) - Number(first.input_i) + 0.4;
const pre = `volume=${gain.toFixed(2)}dB,alimiter=limit=0.7:attack=4:release=60:level=false,`;
const second = loudness(input, pre);
const filter = `${pre}loudnorm=I=${target}:TP=-1.5:LRA=11:measured_I=${second.input_i}:measured_TP=${second.input_tp}:measured_LRA=${second.input_lra}:measured_thresh=${second.input_thresh}:offset=${second.target_offset}:linear=true:print_format=json`;
const log = execFileSync("bash", ["-c", `ffmpeg -hide_banner -nostats -y -i "${input}" -af "${filter}" -ar 48000 "${output}" 2>&1`]).toString();
const result = JSON.parse(log.slice(log.lastIndexOf("{"), log.lastIndexOf("}") + 1));
console.log(`${output}: input ${first.input_i} LUFS, gain ${gain.toFixed(2)} dB + limiter, out ${result.output_i} LUFS, TP ${result.output_tp}, mode ${result.normalization_type}`);
