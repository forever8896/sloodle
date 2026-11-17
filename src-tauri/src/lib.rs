use std::io::{BufRead, BufReader};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::{Manager, RunEvent, State};

#[derive(Clone, Serialize, Deserialize)]
struct SidecarInfo {
    port: u16,
    token: String,
}

struct Sidecar {
    info: Result<SidecarInfo, String>,
    child: Mutex<Option<Child>>,
}

/// Development runs the TypeScript source with Bun. A packaged app runs the
/// compiled sidecar that sits next to the main executable.
fn sidecar_command() -> Result<Command, String> {
    if cfg!(debug_assertions) {
        let mut command = Command::new("bun");
        command
            .arg("run")
            .arg(concat!(env!("CARGO_MANIFEST_DIR"), "/../sidecar/src/main.ts"));
        return Ok(command);
    }
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let name = if cfg!(windows) { "sloodle-sidecar.exe" } else { "sloodle-sidecar" };
    let path = exe.parent().ok_or("The app has no install folder.")?.join(name);
    Ok(Command::new(path))
}

fn start_sidecar() -> Result<(Child, SidecarInfo), String> {
    let mut child = sidecar_command()?
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Could not start the sloodle engine: {e}"))?;

    let stdout = child.stdout.take().ok_or("The engine has no output pipe.")?;
    let mut reader = BufReader::new(stdout);
    let mut line = String::new();
    let info = loop {
        line.clear();
        let read = reader.read_line(&mut line).map_err(|e| e.to_string())?;
        if read == 0 {
            return Err("The sloodle engine stopped before it was ready.".into());
        }
        if let Some(json) = line.trim().strip_prefix("SLOODLE_READY ") {
            break serde_json::from_str::<SidecarInfo>(json).map_err(|e| e.to_string())?;
        }
    };

    // Keep reading so the engine never blocks on a full pipe.
    std::thread::spawn(move || for _ in reader.lines() {});
    Ok((child, info))
}

#[tauri::command]
fn sidecar_info(sidecar: State<'_, Sidecar>) -> Result<SidecarInfo, String> {
    sidecar.info.clone()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let sidecar = match start_sidecar() {
        Ok((child, info)) => Sidecar { info: Ok(info), child: Mutex::new(Some(child)) },
        Err(error) => Sidecar { info: Err(error), child: Mutex::new(None) },
    };

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(sidecar)
        .invoke_handler(tauri::generate_handler![sidecar_info])
        .build(tauri::generate_context!())
        .expect("error while building sloodle")
        .run(|app, event| {
            if let RunEvent::Exit = event {
                if let Some(mut child) = app.state::<Sidecar>().child.lock().unwrap().take() {
                    let _ = child.kill();
                    let _ = child.wait();
                }
            }
        });
}
