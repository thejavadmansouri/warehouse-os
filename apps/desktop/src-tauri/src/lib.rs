mod config;
mod printer;

use config::{load_config, normalize_server_url, save_config, AppConfig};
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem, Submenu},
    AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder, WindowEvent,
};

/// وقتی صفحه اجازه‌ی بستن داد، دفعه‌ی بعد جلوی بسته شدن گرفته نمی‌شود.
/// بدون این، حلقه‌ی بی‌پایان می‌شد: بستن → جلوگیری → بستن → …
static CLOSE_APPROVED: AtomicBool = AtomicBool::new(false);

/// اسکریپتی که پیش از بارگذاری صفحه تزریق می‌شود.
///
/// F11 و Ctrl+R را اینجا می‌گیریم، نه با global shortcut — میانبر سراسری کلید را
/// از کل ویندوز می‌دزدد، حتی وقتی برنامه‌ی ما فوکوس ندارد.
const KEY_HANDLER: &str = r#"
document.addEventListener('keydown', function (e) {
  if (e.key === 'F11') {
    e.preventDefault();
    window.__TAURI__.core.invoke('toggle_fullscreen');
  } else if ((e.ctrlKey || e.metaKey) && (e.key === 'r' || e.key === 'R')) {
    e.preventDefault();
    location.reload();
  }
});
"#;

#[tauri::command]
fn get_server_url(app: AppHandle) -> String {
    load_config(&app).server_url
}

#[tauri::command]
fn get_config(app: AppHandle) -> AppConfig {
    load_config(&app)
}

/// ذخیره‌ی آدرس سرور و بارگذاری دوباره‌ی پنجره‌ی اصلی روی آدرس جدید.
#[tauri::command]
fn update_server_url(app: AppHandle, url: String) -> Result<String, String> {
    let normalized = normalize_server_url(&url)?;

    let mut cfg = load_config(&app);
    cfg.server_url = normalized.clone();
    save_config(&app, &cfg)?;

    // اگر پنجره‌ی اصلی باز است، همان‌جا به آدرس جدید برود؛ وگرنه ساخته شود.
    match app.get_webview_window("main") {
        Some(win) => {
            let parsed: tauri::Url = normalized
                .parse()
                .map_err(|_| "آدرس معتبر نیست".to_string())?;
            win.navigate(parsed)
                .map_err(|e| format!("بارگذاری آدرس جدید ناموفق بود: {e}"))?;
            let _ = win.set_focus();
        }
        None => {
            open_main_window(&app, &normalized)
                .map_err(|e| format!("باز کردن پنجره ناموفق بود: {e}"))?;
        }
    }

    // پنجره‌ی تنظیمات دیگر لازم نیست.
    if let Some(setup) = app.get_webview_window("setup") {
        let _ = setup.close();
    }

    Ok(normalized)
}

#[tauri::command]
fn set_printer_name(app: AppHandle, name: String) -> Result<(), String> {
    let mut cfg = load_config(&app);
    cfg.printer_name = name;
    save_config(&app, &cfg)
}

#[tauri::command]
fn toggle_fullscreen(app: AppHandle) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("main") {
        let now = win.is_fullscreen().unwrap_or(false);
        win.set_fullscreen(!now)
            .map_err(|e| format!("تغییر حالت تمام‌صفحه ناموفق بود: {e}"))?;
    }
    Ok(())
}

/// صفحه پس از تصمیم کاربر (بک‌آپ گرفت یا بی‌خیال شد) این را صدا می‌زند.
#[tauri::command]
fn approve_close(app: AppHandle) {
    CLOSE_APPROVED.store(true, Ordering::SeqCst);
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.close();
    }
}

#[tauri::command]
fn open_settings(app: AppHandle) -> Result<(), String> {
    open_setup_window(&app).map_err(|e| format!("باز کردن تنظیمات ناموفق بود: {e}"))
}

fn open_main_window(app: &AppHandle, url: &str) -> tauri::Result<()> {
    let parsed: tauri::Url = url
        .parse()
        .unwrap_or_else(|_| "http://localhost:3001".parse().unwrap());

    let window = WebviewWindowBuilder::new(app, "main", WebviewUrl::External(parsed))
        .title("Warehouse OS — فروش")
        .inner_size(1280.0, 800.0)
        .min_inner_size(1024.0, 700.0)
        .center()
        .resizable(true)
        .initialization_script(KEY_HANDLER)
        .build()?;

    // پیش از بستن، از صفحه بپرس آیا بک‌آپ لازم است.
    //
    // چرا از صفحه و نه از خود Rust: توکن ورود فقط در صفحه‌ی وب هست، پس تنها
    // آنجاست که می‌شود وضعیت بک‌آپ را از سرور پرسید. Rust بستن را نگه می‌دارد
    // و تصمیم را به صفحه می‌سپارد.
    let handle = app.clone();
    window.on_window_event(move |event| {
        if let WindowEvent::CloseRequested { api, .. } = event {
            if CLOSE_APPROVED.load(Ordering::SeqCst) {
                return; // کاربر قبلاً تصمیم گرفته؛ بگذار بسته شود
            }
            api.prevent_close();
            if let Some(win) = handle.get_webview_window("main") {
                // اگر صفحه به هر دلیل پاسخ ندهد، کاربر در بن‌بست نمی‌ماند:
                // از منو می‌تواند خارج شود و emit شکست‌خورده نادیده گرفته می‌شود.
                let _ = win.emit("app-close-requested", ());
            }
        }
    });

    Ok(())
}

/// صفحه‌ی تنظیمات، از فایل‌های محلیِ بسته‌بندی‌شده بارگذاری می‌شود.
///
/// این پاسخِ مسئله‌ی «اولین اجرا» است: پیش از آنکه آدرس سرور معلوم باشد،
/// هیچ صفحه‌ای برای نمایش وجود ندارد. یک صفحه‌ی محلی کوچک این بن‌بست را باز می‌کند.
fn open_setup_window(app: &AppHandle) -> tauri::Result<()> {
    if let Some(win) = app.get_webview_window("setup") {
        let _ = win.set_focus();
        return Ok(());
    }

    WebviewWindowBuilder::new(app, "setup", WebviewUrl::App("setup.html".into()))
        .title("تنظیمات اتصال")
        .inner_size(560.0, 520.0)
        .resizable(false)
        .center()
        .build()?;

    Ok(())
}

fn build_menu(app: &AppHandle) -> tauri::Result<Menu<tauri::Wry>> {
    // منوی حداقلی — کاربر فروشنده است، نه توسعه‌دهنده.
    let settings = MenuItem::with_id(app, "settings", "تنظیمات اتصال و پرینتر", true, None::<&str>)?;
    let quit = PredefinedMenuItem::quit(app, Some("خروج"))?;
    let file = Submenu::with_items(app, "برنامه", true, &[&settings, &quit])?;
    Menu::with_items(app, &[&file])
}

pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let handle = app.handle().clone();

            let menu = build_menu(&handle)?;
            app.set_menu(menu)?;

            let cfg = load_config(&handle);

            // در حالت توسعه همیشه به سرور محلی Next.js وصل شو.
            // در حالت انتشار، آدرس تنظیم‌شده — و اگر تنظیم نشده، صفحه‌ی تنظیمات.
            if cfg!(debug_assertions) {
                open_main_window(&handle, "http://localhost:3001")?;
            } else if cfg.server_url.trim().is_empty() {
                open_setup_window(&handle)?;
            } else {
                open_main_window(&handle, &cfg.server_url)?;
            }

            Ok(())
        })
        .on_menu_event(|app, event| {
            if event.id() == "settings" {
                let _ = open_setup_window(app);
            }
        })
        .invoke_handler(tauri::generate_handler![
            get_server_url,
            get_config,
            update_server_url,
            set_printer_name,
            toggle_fullscreen,
            open_settings,
            approve_close,
            printer::list_printers,
            printer::print_receipt,
            printer::test_print,
        ])
        .run(tauri::generate_context!())
        .expect("اجرای برنامه‌ی Tauri با خطا مواجه شد");
}
