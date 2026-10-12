#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::ffi::OsString;
use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;
use std::process::{Child, ChildStdin, ChildStdout, Command, Stdio};
use std::sync::Mutex;

struct Sidecar {
    _process: Child,
    input: ChildStdin,
    output: BufReader<ChildStdout>,
}

struct SidecarState(Mutex<Sidecar>);

fn sidecar_entry() -> PathBuf {
    std::env::var_os("ARCHMAP_SIDECAR")
        .map(PathBuf::from)
        .unwrap_or_else(|| {
            PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../sidecar/src/main.ts")
        })
}

fn node_binary() -> OsString {
    std::env::var_os("ARCHMAP_NODE").unwrap_or_else(|| OsString::from("node"))
}

// The sidecar exits on its own when its standard input closes, so the shell never has to stop it:
// when the app process ends, the pipe closes with it.
fn start_sidecar() -> std::io::Result<Sidecar> {
    let mut process = Command::new(node_binary())
        .arg(sidecar_entry())
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::inherit())
        .spawn()?;
    let input = process.stdin.take().expect("the sidecar input is piped");
    let output = BufReader::new(process.stdout.take().expect("the sidecar output is piped"));
    Ok(Sidecar {
        _process: process,
        input,
        output,
    })
}

#[tauri::command]
async fn sidecar(request: String, state: tauri::State<'_, SidecarState>) -> Result<String, String> {
    if request.contains('\n') {
        return Err("a sidecar request must be one line".into());
    }
    let mut sidecar = state
        .0
        .lock()
        .map_err(|_| "the sidecar is unusable after an earlier failure".to_string())?;
    writeln!(sidecar.input, "{request}").map_err(|error| error.to_string())?;
    sidecar.input.flush().map_err(|error| error.to_string())?;
    let mut line = String::new();
    let read = sidecar
        .output
        .read_line(&mut line)
        .map_err(|error| error.to_string())?;
    if read == 0 {
        return Err("the sidecar exited".into());
    }
    Ok(line.trim_end().to_string())
}

fn main() {
    let sidecar_process = start_sidecar().expect("the Node sidecar could not start");
    tauri::Builder::default()
        .manage(SidecarState(Mutex::new(sidecar_process)))
        .invoke_handler(tauri::generate_handler![sidecar])
        .run(tauri::generate_context!())
        .expect("the app could not run");
}
