fn main() {
    // دستورهای خودِ اپ باید اینجا اعلان شوند تا tauri-build برای هرکدام
    // permission خودکار (allow-<نام>) بسازد.
    //
    // چرا مهم است: صفحه از سرور (remote) بارگذاری می‌شود و طبق قاعدهٔ امنیتی
    // tauri، محتوای remote **هرگز** به دستورهای سفارشی نمی‌رسد مگر با
    // permission صریح. بدون این فهرست، پلِ دسکتاپ (بستن با بک‌آپ، چاپ فیش،
    // F11 و تنظیمات) در نصبِ واقعی با «Command ... not allowed by ACL» رد
    // می‌شود — هرچند در مرورگر عادی همه‌چیز کار می‌کند.
    tauri_build::try_build(
        tauri_build::Attributes::new().app_manifest(
            tauri_build::AppManifest::new().commands(&[
                "get_server_url",
                "get_config",
                "update_server_url",
                "set_printer_name",
                "set_label_printer_name",
                "toggle_fullscreen",
                "open_settings",
                "approve_close",
                "list_printers",
                "print_receipt",
                "print_tsp_label",
                "test_print",
            ]),
        ),
    )
    .expect("failed to run tauri-build");
}
