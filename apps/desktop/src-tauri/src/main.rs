// روی ویندوز در حالت انتشار، پنجره‌ی کنسول باز نشود.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    warehouse_seller_lib::run();
}
