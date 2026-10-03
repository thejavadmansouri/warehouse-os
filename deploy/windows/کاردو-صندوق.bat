@echo off
REM ============================================================
REM  کاردو — صندوق فروش، حالت فروشگاهی
REM ------------------------------------------------------------
REM  چرا این فایل هست:
REM
REM  با F11 (تمام‌صفحه‌ی مرورگر) کلید Esc دستِ خودِ کروم است و طبق
REM  استانداردِ Fullscreen API هیچ صفحه‌ای نمی‌تواند جلویش را بگیرد —
REM  یعنی هر Esc در صندوق، از تمام‌صفحه بیرون می‌اندازد.
REM
REM  حالت --app اصلاً وارد Fullscreen API نمی‌شود: یک پنجره‌ی معمولیِ
REM  ویندوز است بدون تب و بدون نوار آدرس. پس Esc به خودِ برنامه می‌رسد،
REM  و همان ۱۲۰ پیکسلِ نوارِ مرورگر هم آزاد می‌شود (≈ سه ردیف کالای بیشتر).
REM
REM  پنجره را با کلیدِ بیشینه‌ی ویندوز یا Win+↑ تمام‌صفحه کنید — آن
REM  تمام‌صفحه‌ی سیستم‌عامل است و Esc رویش اثری ندارد.
REM ============================================================

REM آدرس سرور — اگر برنامه روی همین کامپیوتر است دست نزنید.
set KARDO_URL=http://localhost:3001/admin/pos

REM پروفایل جدا: افزونه‌ها، تاریخچه و تنظیماتِ مرورگرِ شخصی قاطی نشود.
set KARDO_PROFILE=%LOCALAPPDATA%\Kardo\browser

set CHROME=%ProgramFiles%\Google\Chrome\Application\chrome.exe
if not exist "%CHROME%" set CHROME=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe
if not exist "%CHROME%" set CHROME=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe
if not exist "%CHROME%" set CHROME=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe

if not exist "%CHROME%" (
  echo کروم یا اج پیدا نشد. یکی از این دو را نصب کنید.
  pause
  exit /b 1
)

start "" "%CHROME%" ^
  --app=%KARDO_URL% ^
  --user-data-dir="%KARDO_PROFILE%" ^
  --no-first-run ^
  --no-default-browser-check ^
  --disable-features=TranslateUI ^
  --disable-pinch ^
  --overscroll-history-navigation=0
