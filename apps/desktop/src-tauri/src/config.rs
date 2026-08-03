use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct AppConfig {
    /// آدرس سرور on-prem. مثال: http://192.168.1.50:3000
    pub server_url: String,
    /// نام پرینتر فیش. خالی یعنی «پرینتر پیش‌فرض ویندوز».
    #[serde(default)]
    pub printer_name: String,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            server_url: String::new(), // خالی = هنوز تنظیم نشده → صفحه‌ی تنظیمات باز می‌شود
            printer_name: String::new(),
        }
    }
}

/// مسیر فایل تنظیمات.
///
/// **کنار فایل exe ذخیره نمی‌شود.** اگر برنامه در Program Files نصب شود، آن مسیر
/// بدون دسترسی ادمین نوشتنی نیست و ذخیره‌ی تنظیمات بی‌صدا شکست می‌خورد.
/// به‌جایش از پوشه‌ی تنظیمات کاربر استفاده می‌شود که همیشه نوشتنی است.
fn config_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("مسیر تنظیمات پیدا نشد: {e}"))?;

    fs::create_dir_all(&dir).map_err(|e| format!("ساخت پوشه‌ی تنظیمات ناموفق بود: {e}"))?;

    Ok(dir.join("config.json"))
}

pub fn load_config(app: &AppHandle) -> AppConfig {
    match config_path(app) {
        Ok(path) if path.exists() => fs::read_to_string(&path)
            .ok()
            .and_then(|c| serde_json::from_str(&c).ok())
            .unwrap_or_default(),
        _ => AppConfig::default(),
    }
}

pub fn save_config(app: &AppHandle, config: &AppConfig) -> Result<(), String> {
    let path = config_path(app)?;
    let content =
        serde_json::to_string_pretty(config).map_err(|e| format!("تبدیل تنظیمات ناموفق: {e}"))?;
    fs::write(&path, content).map_err(|e| format!("ذخیره‌ی تنظیمات ناموفق: {e}"))
}

/// نرمال‌سازی آدرس سرور: پروتکل اگر نبود اضافه شود، اسلش انتهایی حذف شود.
/// کاربر معمولاً فقط «192.168.1.50:3000» را تایپ می‌کند.
pub fn normalize_server_url(input: &str) -> Result<String, String> {
    let trimmed = input.trim().trim_end_matches('/');

    if trimmed.is_empty() {
        return Err("آدرس سرور خالی است".to_string());
    }

    let with_scheme = if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
        trimmed.to_string()
    } else {
        format!("http://{trimmed}")
    };

    // اعتبارسنجی واقعی، تا آدرس خراب ذخیره نشود و پنجره سفید بالا نیاید.
    with_scheme
        .parse::<tauri::Url>()
        .map_err(|_| format!("آدرس معتبر نیست: {input}"))?;

    Ok(with_scheme)
}
