use base64::{engine::general_purpose::STANDARD, Engine as _};
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::process::Command;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenTargetInfo {
    pub label: String,
    pub open_with: String,
    pub icon: Option<String>,
}

#[derive(Clone, Copy)]
struct Candidate {
    label: &'static str,
    open_with: &'static str,
    probes: &'static [&'static str],
}

fn office_candidates(ext: &str) -> Vec<Candidate> {
    let wps = Candidate {
        label: "WPS Office",
        open_with: "wpsoffice",
        probes: &["wpsoffice", "WPS Office", "WPS Office for Mac", "Kingsoft Office", "wps"],
    };
    let libre = Candidate {
        label: "LibreOffice",
        open_with: "LibreOffice",
        probes: &["LibreOffice", "libreoffice"],
    };

    match ext {
        "doc" | "docx" => {
            let mut list = vec![
                Candidate {
                    label: "Microsoft Word",
                    open_with: "Microsoft Word",
                    probes: &["Microsoft Word", "MS Word", "winword"],
                },
                wps,
                libre,
            ];
            #[cfg(target_os = "macos")]
            list.push(Candidate {
                label: "Pages",
                open_with: "Pages",
                probes: &["Pages"],
            });
            list
        }
        "ppt" | "pptx" => {
            let mut list = vec![
                Candidate {
                    label: "Microsoft PowerPoint",
                    open_with: "Microsoft PowerPoint",
                    probes: &["Microsoft PowerPoint", "MS PowerPoint", "powerpnt"],
                },
                wps,
                libre,
            ];
            #[cfg(target_os = "macos")]
            list.push(Candidate {
                label: "Keynote",
                open_with: "Keynote",
                probes: &["Keynote"],
            });
            list
        }
        "xls" | "xlsx" => {
            let mut list = vec![
                Candidate {
                    label: "Microsoft Excel",
                    open_with: "Microsoft Excel",
                    probes: &["Microsoft Excel", "MS Excel", "excel"],
                },
                wps,
                libre,
            ];
            #[cfg(target_os = "macos")]
            list.push(Candidate {
                label: "Numbers",
                open_with: "Numbers",
                probes: &["Numbers"],
            });
            list
        }
        "pdf" => {
            #[cfg(target_os = "macos")]
            {
                vec![
                    Candidate {
                        label: "预览",
                        open_with: "Preview",
                        probes: &["Preview"],
                    },
                    Candidate {
                        label: "Adobe Acrobat",
                        open_with: "Adobe Acrobat",
                        probes: &["Adobe Acrobat", "Adobe Acrobat Reader"],
                    },
                ]
            }
            #[cfg(target_os = "windows")]
            {
                vec![Candidate {
                    label: "Adobe Acrobat Reader",
                    open_with: "Adobe Acrobat Reader",
                    probes: &["Adobe Acrobat", "Adobe Acrobat Reader", "AcroRd32"],
                }]
            }
            #[cfg(not(any(target_os = "macos", target_os = "windows")))]
            {
                vec![Candidate {
                    label: "Adobe Acrobat",
                    open_with: "Adobe Acrobat",
                    probes: &["Adobe Acrobat", "Adobe Acrobat Reader"],
                }]
            }
        }
        _ => vec![],
    }
}

pub fn installed_for_extension(ext: &str) -> Vec<OpenTargetInfo> {
    let ext = ext.trim_start_matches('.').to_ascii_lowercase();
    let mut out = Vec::new();
    let mut seen = std::collections::HashSet::new();

    for candidate in office_candidates(&ext) {
        if let Some(resolved) = resolve_candidate(candidate, &ext) {
            if seen.insert(resolved.open_with.clone()) {
                out.push(resolved);
            }
        }
    }

    out
}

struct ResolvedApp {
    open_with: String,
    icon_source: Option<PathBuf>,
}

fn resolve_candidate(candidate: Candidate, ext: &str) -> Option<OpenTargetInfo> {
    let resolved = resolve_app_paths(candidate, ext)?;
    let icon = resolved
        .icon_source
        .as_deref()
        .and_then(icon_data_url_from_path);

    Some(OpenTargetInfo {
        label: candidate.label.to_string(),
        open_with: resolved.open_with,
        icon,
    })
}

fn resolve_app_paths(candidate: Candidate, ext: &str) -> Option<ResolvedApp> {
    for probe in candidate.probes {
        if let Some(path) = resolve_probe_path(probe, ext) {
            return Some(ResolvedApp {
                open_with: open_with_for_path(&path, candidate),
                icon_source: Some(path),
            });
        }
    }
    None
}

/// macOS/Linux: bundle or app name for `open -a`. Windows: full path to `.exe` for ShellExecute.
fn open_with_for_path(path: &Path, candidate: Candidate) -> String {
    #[cfg(target_os = "windows")]
    {
        let _ = candidate;
        return path.to_string_lossy().into_owned();
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = path;
        candidate.open_with.to_string()
    }
}

fn resolve_probe_path(probe: &str, ext: &str) -> Option<PathBuf> {
    #[cfg(target_os = "macos")]
    {
        if let Some(bundle) = macos_find_bundle(probe) {
            return Some(bundle);
        }
    }

    #[cfg(target_os = "windows")]
    {
        if let Some(exe) = windows_find_executable(probe, ext) {
            return Some(exe);
        }
    }

    #[cfg(target_os = "linux")]
    {
        if let Some(path) = linux_find_executable(probe) {
            return Some(path);
        }
    }

    let _ = (probe, ext);
    None
}

#[cfg(target_os = "macos")]
fn macos_find_bundle(probe: &str) -> Option<PathBuf> {
    if macos_open_registered(probe) {
        if let Some(bundle) = macos_bundle_path(probe) {
            return Some(bundle);
        }
    }
    macos_bundle_path(probe)
}

#[cfg(target_os = "macos")]
fn macos_open_registered(name: &str) -> bool {
    Command::new("/usr/bin/open")
        .args(["-Ra", name])
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

#[cfg(target_os = "macos")]
fn macos_bundle_path(name: &str) -> Option<PathBuf> {
    let direct = PathBuf::from(format!("/Applications/{}.app", name));
    if direct.is_dir() {
        return Some(direct);
    }

    let lower = name.to_ascii_lowercase();
    let entries = std::fs::read_dir("/Applications").ok()?;
    for entry in entries.flatten() {
        let fname = entry.file_name().to_string_lossy().to_lowercase();
        if fname == format!("{}.app", lower) {
            return Some(entry.path());
        }
    }

    if lower.contains("wps") || lower.contains("kingsoft") {
        return macos_bundle_path("wpsoffice");
    }

    None
}

#[cfg(target_os = "windows")]
fn windows_find_executable(probe: &str, ext: &str) -> Option<PathBuf> {
    let lower = probe.to_ascii_lowercase();

    if lower.contains("wps") || lower.contains("kingsoft") || lower == "wpsoffice" {
        return windows_wps_for_ext(ext);
    }

    if lower.contains("libreoffice") || lower == "libreoffice" {
        for root in windows_program_roots() {
            let path: PathBuf = [&root, "LibreOffice", "program", "soffice.exe"].iter().collect();
            if path.exists() {
                return Some(path);
            }
        }
    }

    if lower.contains("word") || probe == "winword" {
        return windows_office_exe("WINWORD.EXE");
    }
    if lower.contains("powerpoint") || probe == "powerpnt" {
        return windows_office_exe("POWERPNT.EXE");
    }
    if lower.contains("excel") || probe == "excel" {
        return windows_office_exe("EXCEL.EXE");
    }

    if lower.contains("acrobat") || lower.contains("acrord") {
        return windows_acrobat_exe();
    }

    None
}

#[cfg(target_os = "windows")]
fn windows_program_roots() -> Vec<String> {
    [
        std::env::var("ProgramFiles").ok(),
        std::env::var("ProgramFiles(x86)").ok(),
        std::env::var("LOCALAPPDATA").ok(),
    ]
    .into_iter()
    .flatten()
    .collect()
}

#[cfg(target_os = "windows")]
fn windows_wps_for_ext(ext: &str) -> Option<PathBuf> {
    let preferred: &[&str] = match ext {
        "ppt" | "pptx" => &["wpp.exe", "ksolaunch.exe", "wps.exe"],
        "doc" | "docx" => &["wps.exe", "ksolaunch.exe", "wpp.exe"],
        "xls" | "xlsx" => &["et.exe", "ksolaunch.exe", "wps.exe"],
        _ => &["ksolaunch.exe", "wps.exe", "wpp.exe", "et.exe"],
    };

    for exe in preferred {
        for path in windows_wps_paths_for(exe) {
            if path.exists() {
                return Some(path);
            }
        }
    }
    None
}

#[cfg(target_os = "windows")]
fn windows_wps_paths_for(exe_name: &str) -> Vec<PathBuf> {
    let mut paths = Vec::new();
    for root in windows_program_roots() {
        paths.push(
            [&root, "Kingsoft", "WPS Office", "office6", exe_name]
                .iter()
                .collect(),
        );
        if exe_name == "ksolaunch.exe" {
            paths.push(
                [&root, "Kingsoft", "WPS Office", exe_name]
                    .iter()
                    .collect(),
            );
        }
    }
    paths
}

#[cfg(target_os = "windows")]
fn windows_office_exe(filename: &str) -> Option<PathBuf> {
    for root in windows_program_roots() {
        for parts in [
            ["Microsoft Office", "root", "Office16", filename],
            ["Microsoft Office", "Root", "Office16", filename],
            ["Microsoft Office", "Office16", filename],
            ["Microsoft Office", "root", "Office15", filename],
        ] {
            let path: PathBuf = std::iter::once(root.as_str())
                .chain(parts.iter().copied())
                .collect();
            if path.exists() {
                return Some(path);
            }
        }
    }
    None
}

#[cfg(target_os = "windows")]
fn windows_acrobat_exe() -> Option<PathBuf> {
    for root in windows_program_roots() {
        for parts in [
            ["Adobe", "Acrobat DC", "Acrobat", "Acrobat.exe"],
            ["Adobe", "Acrobat Reader DC", "Reader", "AcroRd32.exe"],
            ["Adobe", "Acrobat Reader", "Reader", "AcroRd32.exe"],
        ] {
            let path: PathBuf = std::iter::once(root.as_str())
                .chain(parts.iter().copied())
                .collect();
            if path.exists() {
                return Some(path);
            }
        }
    }
    None
}

#[cfg(target_os = "linux")]
fn linux_find_executable(probe: &str) -> Option<PathBuf> {
    let lower = probe.to_ascii_lowercase();
    let names: &[&str] = if lower.contains("libreoffice") || lower == "libreoffice" {
        &["libreoffice", "soffice"]
    } else if lower.contains("wps") || lower.contains("kingsoft") || lower == "wpsoffice" {
        &["wps", "wpp", "et", "kingsoft"]
    } else {
        &[probe]
    };

    for name in names {
        if let Ok(output) = Command::new("which").arg(name).output() {
            if output.status.success() {
                let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
                if !path.is_empty() {
                    return Some(PathBuf::from(path));
                }
            }
        }
    }

    for path in [
        "/usr/bin/libreoffice",
        "/opt/kingsoft/wps-office/office6/wps",
        "/opt/apps/cn.wps.wps-office-pro/files/kingsoft/wps-office/office6/wps",
    ] {
        let p = PathBuf::from(path);
        if p.exists() {
            return Some(p);
        }
    }

    None
}

fn icon_data_url_from_path(path: &Path) -> Option<String> {
    #[cfg(target_os = "macos")]
    {
        if path.extension().and_then(|e| e.to_str()) == Some("app") {
            return macos_icon_from_bundle(path);
        }
    }

    #[cfg(target_os = "windows")]
    {
        if path.is_file() {
            return windows_icon_from_exe(path);
        }
    }

    #[cfg(target_os = "linux")]
    {
        if path.is_file() {
            return linux_icon_from_desktop(path);
        }
    }

    let _ = path;
    None
}

#[cfg(target_os = "macos")]
fn macos_icon_from_bundle(bundle: &Path) -> Option<String> {
    let resources = bundle.join("Contents/Resources");
    let icns = std::fs::read_dir(&resources)
        .ok()?
        .flatten()
        .map(|e| e.path())
        .find(|p| p.extension().and_then(|e| e.to_str()) == Some("icns"))?;

    let tmp = std::env::temp_dir().join(format!(
        "hive-icon-{}-{}.png",
        std::process::id(),
        icns.file_name()?.to_string_lossy()
    ));

    let status = Command::new("/usr/bin/sips")
        .args([
            "-s",
            "format",
            "png",
            &icns.to_string_lossy(),
            "--out",
            &tmp.to_string_lossy(),
        ])
        .status()
        .ok()?;

    if !status.success() {
        return None;
    }

    let bytes = std::fs::read(&tmp).ok()?;
    let _ = std::fs::remove_file(&tmp);
    Some(png_data_url(&bytes))
}

#[cfg(target_os = "windows")]
fn windows_icon_from_exe(exe: &Path) -> Option<String> {
    let tmp = std::env::temp_dir().join(format!("hive-icon-{}.png", std::process::id()));
    let script = format!(
        r#"
Add-Type -AssemblyName System.Drawing
$icon = [System.Drawing.Icon]::ExtractAssociatedIcon('{}')
if ($null -eq $icon) {{ exit 1 }}
$bmp = $icon.ToBitmap()
$bmp.Save('{}', [System.Drawing.Imaging.ImageFormat]::Png)
exit 0
"#,
        exe.to_string_lossy().replace('\'', "''"),
        tmp.to_string_lossy().replace('\'', "''")
    );

    let status = Command::new("powershell")
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            &script,
        ])
        .status()
        .ok()?;

    if !status.success() {
        return None;
    }

    let bytes = std::fs::read(&tmp).ok()?;
    let _ = std::fs::remove_file(&tmp);
    Some(png_data_url(&bytes))
}

#[cfg(target_os = "linux")]
fn linux_icon_from_desktop(exe: &Path) -> Option<String> {
    let name = exe.file_name()?.to_string_lossy();
    let desktop_dirs = ["/usr/share/applications", "/var/lib/snapd/desktop/applications"];

    for dir in desktop_dirs {
        let desktop_dir = PathBuf::from(dir);
        if !desktop_dir.is_dir() {
            continue;
        }
        let entries = std::fs::read_dir(&desktop_dir).ok()?;
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) != Some("desktop") {
                continue;
            }
            let content = std::fs::read_to_string(&path).ok()?;
            if !content.contains(&format!("Name={}", name)) && !content.contains(&*name) {
                continue;
            }
            if let Some(icon_name) = parse_desktop_icon(&content) {
                if let Some(icon_path) = linux_resolve_icon(&icon_name) {
                    let bytes = std::fs::read(&icon_path).ok()?;
                    return Some(png_data_url(&bytes));
                }
            }
        }
    }
    None
}

#[cfg(target_os = "linux")]
fn parse_desktop_icon(content: &str) -> Option<String> {
    for line in content.lines() {
        if let Some(rest) = line.strip_prefix("Icon=") {
            let icon = rest.trim();
            if !icon.is_empty() {
                return Some(icon.to_string());
            }
        }
    }
    None
}

#[cfg(target_os = "linux")]
fn linux_resolve_icon(name: &str) -> Option<PathBuf> {
    let candidates = [
        format!("/usr/share/pixmaps/{}.png", name),
        format!("/usr/share/pixmaps/{}.svg", name),
        format!("/usr/share/icons/hicolor/48x48/apps/{}.png", name),
        format!("/usr/share/icons/hicolor/scalable/apps/{}.svg", name),
    ];
    for path in candidates {
        let p = PathBuf::from(path);
        if p.exists() {
            return Some(p);
        }
    }
    None
}

fn png_data_url(bytes: &[u8]) -> String {
    format!("data:image/png;base64,{}", STANDARD.encode(bytes))
}
