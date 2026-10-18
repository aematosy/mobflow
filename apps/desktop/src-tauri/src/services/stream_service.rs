use std::collections::HashMap;
use std::io::Read;
use std::net::TcpListener;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex, OnceLock};
use std::thread;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use crate::models::stream::DeviceStreamSession;
use crate::services::log_service;

const SCRCPY_VERSION: &str = "5.0.1";
const REMOTE_SERVER: &str = "/data/local/tmp/testflow-scrcpy-server.jar";

type LatestFrame = Arc<Mutex<Option<Vec<u8>>>>;

struct ActiveStream {
    session: DeviceStreamSession,
    server_process: Option<Child>,
    ffmpeg_process: Option<Child>,
    latest_frame: LatestFrame,
    local_port: u16,
}

static STREAMS: OnceLock<Mutex<HashMap<String, ActiveStream>>> = OnceLock::new();

fn streams() -> &'static Mutex<HashMap<String, ActiveStream>> {
    STREAMS.get_or_init(|| Mutex::new(HashMap::new()))
}

fn stream_id(platform: &str, device_id: &str) -> String {
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|value| value.as_millis())
        .unwrap_or(0);

    format!("{platform}:{device_id}:{timestamp}")
}

fn command_available(command: &str) -> bool {
    Command::new(command)
        .arg("-version")
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map(|status| status.success())
        .unwrap_or(false)
}

fn adb_available() -> bool {
    Command::new("adb")
        .arg("version")
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map(|status| status.success())
        .unwrap_or(false)
}

fn verify_android_device(device_id: &str) -> Result<(), String> {
    let output = Command::new("adb")
        .args(["-s", device_id, "get-state"])
        .output()
        .map_err(|error| format!("Unable to execute adb for {device_id}: {error}"))?;

    if !output.status.success() {
        return Err(format!("ADB device is not available: {device_id}"));
    }

    let state = String::from_utf8_lossy(&output.stdout).trim().to_string();

    if state != "device" {
        return Err(format!("ADB device {device_id} is not ready: {state}"));
    }

    Ok(())
}

fn find_scrcpy_server() -> Result<PathBuf, String> {
    /*
     * Never resolve runtime assets from process cwd.
     *
     * In development CARGO_MANIFEST_DIR points to:
     *   apps/desktop/src-tauri
     *
     * Therefore its parent is the desktop application root.
     */
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));

    let desktop_root = manifest_dir
        .parent()
        .ok_or_else(|| "Unable to resolve desktop application root".to_string())?;

    let server = desktop_root
        .join(".testflow")
        .join("tools")
        .join("scrcpy")
        .join("scrcpy-server-v5.0.1");

    if !server.is_file() {
        return Err(format!("scrcpy-server not found: {}", server.display(),));
    }

    Ok(server)
}

fn allocate_port() -> Result<u16, String> {
    let listener = TcpListener::bind("127.0.0.1:0")
        .map_err(|error| format!("Unable to allocate local stream port: {error}"))?;

    let port = listener
        .local_addr()
        .map_err(|error| format!("Unable to inspect local stream port: {error}"))?
        .port();

    drop(listener);

    Ok(port)
}

fn run_adb(device_id: &str, args: &[&str]) -> Result<(), String> {
    let mut full_args = vec!["-s", device_id];

    full_args.extend_from_slice(args);

    let output = Command::new("adb")
        .args(&full_args)
        .output()
        .map_err(|error| format!("Unable to execute adb: {error}"))?;

    if output.status.success() {
        return Ok(());
    }

    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();

    Err(if stderr.is_empty() {
        format!("ADB command failed for {device_id}")
    } else {
        stderr
    })
}

fn push_server(device_id: &str, server: &Path) -> Result<(), String> {
    let server = server
        .to_str()
        .ok_or_else(|| "Invalid scrcpy-server path".to_string())?;

    run_adb(device_id, &["push", server, REMOTE_SERVER])
}

fn create_forward(device_id: &str, port: u16) -> Result<(), String> {
    let local = format!("tcp:{port}");

    run_adb(device_id, &["forward", &local, "localabstract:scrcpy"])
}

fn remove_forward(device_id: &str, port: u16) {
    let local = format!("tcp:{port}");

    let _ = run_adb(device_id, &["forward", "--remove", &local]);
}

fn remove_remote_server(device_id: &str) {
    let _ = run_adb(device_id, &["shell", "rm", "-f", REMOTE_SERVER]);
}

fn start_scrcpy_server(device_id: &str) -> Result<Child, String> {
    Command::new("adb")
        .args([
            "-s",
            device_id,
            "shell",
            &format!(
                "CLASSPATH={REMOTE_SERVER} \
                 app_process / \
                 com.genymobile.scrcpy.Server \
                 {SCRCPY_VERSION} \
                 tunnel_forward=true \
                 audio=false \
                 control=false \
                 cleanup=false \
                 raw_stream=true \
                 max_size=1024 \
                 max_fps=30"
            ),
        ])
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|error| format!("Unable to start scrcpy-server for {device_id}: {error}"))
}

fn start_ffmpeg(port: u16) -> Result<Child, String> {
    let input = format!("tcp://127.0.0.1:{port}?timeout=10000000");

    /*
     * H.264 comes directly from Android MediaCodec via
     * scrcpy-server.
     *
     * FFmpeg decodes continuously and writes independent
     * JPEG frames to stdout. Rust retains only the newest
     * complete frame.
     */
    Command::new("ffmpeg")
        .args([
            "-hide_banner",
            "-loglevel",
            "error",
            "-fflags",
            "nobuffer",
            "-flags",
            "low_delay",
            "-f",
            "h264",
            "-i",
            &input,
            "-an",
            "-vf",
            "fps=30",
            "-q:v",
            "4",
            "-f",
            "image2pipe",
            "-vcodec",
            "mjpeg",
            "pipe:1",
        ])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|error| format!("Unable to start FFmpeg stream decoder: {error}"))
}

fn spawn_frame_reader(stdout: impl Read + Send + 'static, latest_frame: LatestFrame) {
    thread::spawn(move || {
        let mut reader = stdout;
        let mut buffer = Vec::<u8>::with_capacity(256 * 1024);

        let mut chunk = [0u8; 64 * 1024];

        loop {
            let read = match reader.read(&mut chunk) {
                Ok(0) => break,
                Ok(value) => value,
                Err(_) => break,
            };

            buffer.extend_from_slice(&chunk[..read]);

            /*
             * JPEG boundaries:
             *
             * SOI = FF D8
             * EOI = FF D9
             *
             * Keep only complete frames and retain the
             * newest one in shared memory.
             */
            loop {
                let start = buffer.windows(2).position(|window| window == [0xff, 0xd8]);

                let Some(start) = start else {
                    if buffer.len() > 2 * 1024 * 1024 {
                        buffer.clear();
                    }

                    break;
                };

                if start > 0 {
                    buffer.drain(..start);
                }

                let end = buffer
                    .windows(2)
                    .skip(2)
                    .position(|window| window == [0xff, 0xd9])
                    .map(|position| position + 2);

                let Some(end) = end else {
                    break;
                };

                let frame_end = end + 2;

                if frame_end > buffer.len() {
                    break;
                }

                let frame = buffer[..frame_end].to_vec();

                buffer.drain(..frame_end);

                if let Ok(mut latest) = latest_frame.lock() {
                    *latest = Some(frame);
                }
            }
        }
    });
}

fn wait_for_first_frame(latest_frame: &LatestFrame, timeout: Duration) -> bool {
    let started = Instant::now();

    while started.elapsed() < timeout {
        if latest_frame
            .lock()
            .ok()
            .and_then(|frame| frame.as_ref().map(|value| !value.is_empty()))
            .unwrap_or(false)
        {
            return true;
        }

        thread::sleep(Duration::from_millis(50));
    }

    false
}

fn start_android(id: &str, device_id: &str) -> Result<ActiveStream, String> {
    if !adb_available() {
        return Err("adb is not available in PATH".to_string());
    }

    if !command_available("ffmpeg") {
        return Err("ffmpeg is not available in PATH".to_string());
    }

    verify_android_device(device_id)?;

    let server_path = find_scrcpy_server()?;

    let port = allocate_port()?;

    push_server(device_id, &server_path)?;

    if let Err(error) = create_forward(device_id, port) {
        remove_remote_server(device_id);

        return Err(error);
    }

    let mut server_process = match start_scrcpy_server(device_id) {
        Ok(process) => process,
        Err(error) => {
            remove_forward(device_id, port);

            remove_remote_server(device_id);

            return Err(error);
        }
    };

    /*
     * Give app_process a short opportunity to bind the
     * scrcpy abstract socket before FFmpeg connects.
     */
    thread::sleep(Duration::from_millis(250));

    if let Ok(Some(status)) = server_process.try_wait() {
        remove_forward(device_id, port);

        remove_remote_server(device_id);

        return Err(format!("scrcpy-server exited before streaming: {status}"));
    }

    let mut ffmpeg_process = match start_ffmpeg(port) {
        Ok(process) => process,
        Err(error) => {
            let _ = server_process.kill();

            let _ = server_process.wait();

            remove_forward(device_id, port);

            remove_remote_server(device_id);

            return Err(error);
        }
    };

    let stdout = match ffmpeg_process.stdout.take() {
        Some(stdout) => stdout,
        None => {
            let _ = ffmpeg_process.kill();

            let _ = ffmpeg_process.wait();

            let _ = server_process.kill();

            let _ = server_process.wait();

            remove_forward(device_id, port);

            remove_remote_server(device_id);

            return Err("FFmpeg stdout unavailable".to_string());
        }
    };

    let latest_frame: LatestFrame = Arc::new(Mutex::new(None));

    spawn_frame_reader(stdout, Arc::clone(&latest_frame));

    /*
     * First-frame gate:
     * do not claim STREAMING merely because processes
     * were spawned.
     */
    if !wait_for_first_frame(&latest_frame, Duration::from_secs(5)) {
        let _ = ffmpeg_process.kill();

        let _ = ffmpeg_process.wait();

        let _ = server_process.kill();

        let _ = server_process.wait();

        remove_forward(device_id, port);

        remove_remote_server(device_id);

        return Err("Timed out waiting for first scrcpy video frame".to_string());
    }

    let session = DeviceStreamSession {
        id: id.to_string(),
        device_id: device_id.to_string(),
        platform: "android".to_string(),
        provider: "scrcpy-h264".to_string(),
        state: "streaming".to_string(),
        message: None,
    };

    log_service::info(
        "stream",
        format!("Android H264 stream started: device={device_id}, stream={id}, port={port}"),
    );

    Ok(ActiveStream {
        session,
        server_process: Some(server_process),
        ffmpeg_process: Some(ffmpeg_process),
        latest_frame,
        local_port: port,
    })
}

pub fn start(device_id: &str, platform: &str) -> Result<DeviceStreamSession, String> {
    let device_id = device_id.trim();

    if device_id.is_empty() {
        return Err("Stream deviceId is required".to_string());
    }

    let platform = platform.trim().to_ascii_lowercase();

    stop_for_device(device_id)?;

    let id = stream_id(&platform, device_id);

    let active = match platform.as_str() {
        "android" => start_android(&id, device_id)?,

        "ios" => {
            return Err("iOS live stream provider is not implemented yet".to_string());
        }

        _ => {
            return Err(format!("Unsupported stream platform: {platform}"));
        }
    };

    let session = active.session.clone();

    streams()
        .lock()
        .map_err(|_| "Unable to lock stream registry".to_string())?
        .insert(id, active);

    Ok(session)
}

pub fn stop(stream_id: &str) -> Result<(), String> {
    let active = streams()
        .lock()
        .map_err(|_| "Unable to lock stream registry".to_string())?
        .remove(stream_id);

    let Some(mut active) = active else {
        return Ok(());
    };

    if let Some(mut ffmpeg) = active.ffmpeg_process.take() {
        let _ = ffmpeg.kill();
        let _ = ffmpeg.wait();
    }

    if let Some(mut server) = active.server_process.take() {
        let _ = server.kill();
        let _ = server.wait();
    }

    remove_forward(&active.session.device_id, active.local_port);

    remove_remote_server(&active.session.device_id);

    log_service::info(
        "stream",
        format!(
            "Android H264 stream stopped: stream={stream_id}, device={}",
            active.session.device_id,
        ),
    );

    Ok(())
}

pub fn stop_for_device(device_id: &str) -> Result<(), String> {
    let ids = {
        let registry = streams()
            .lock()
            .map_err(|_| "Unable to lock stream registry".to_string())?;

        registry
            .iter()
            .filter_map(|(id, active)| {
                if active.session.device_id == device_id {
                    Some(id.clone())
                } else {
                    None
                }
            })
            .collect::<Vec<_>>()
    };

    for id in ids {
        stop(&id)?;
    }

    Ok(())
}

pub fn android_frame(device_id: &str) -> Result<String, String> {
    /*
     * Fast path:
     * return the newest already-decoded video frame.
     *
     * No ADB request.
     * No Appium request.
     * No screenshot capture.
     */
    let frame = {
        let registry = streams()
            .lock()
            .map_err(|_| "Unable to lock stream registry".to_string())?;

        let active = registry
            .values()
            .find(|active| {
                active.session.device_id == device_id && active.session.platform == "android"
            })
            .ok_or_else(|| format!("No active Android stream for {device_id}"))?;

        active
            .latest_frame
            .lock()
            .map_err(|_| "Unable to lock latest video frame".to_string())?
            .clone()
    };

    let frame = frame.ok_or_else(|| "Android stream has no decoded frame yet".to_string())?;

    Ok(base64_encode(&frame))
}

fn base64_encode(bytes: &[u8]) -> String {
    const TABLE: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

    let mut result = String::with_capacity(bytes.len().div_ceil(3) * 4);

    for chunk in bytes.chunks(3) {
        let a = chunk[0];

        let b = chunk.get(1).copied().unwrap_or(0);

        let c = chunk.get(2).copied().unwrap_or(0);

        result.push(TABLE[(a >> 2) as usize] as char);

        result.push(TABLE[(((a & 0x03) << 4) | (b >> 4)) as usize] as char);

        if chunk.len() > 1 {
            result.push(TABLE[(((b & 0x0f) << 2) | (c >> 6)) as usize] as char);
        } else {
            result.push('=');
        }

        if chunk.len() > 2 {
            result.push(TABLE[(c & 0x3f) as usize] as char);
        } else {
            result.push('=');
        }
    }

    result
}
