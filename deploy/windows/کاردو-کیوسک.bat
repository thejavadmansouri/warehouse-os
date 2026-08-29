@echo off
REM ============================================================
REM  کاردو — حالت کیوسک (فقط برای کامپیوترِ اختصاصیِ صندوق)
REM ------------------------------------------------------------
REM  تمام‌صفحه‌ی کامل، بدون هیچ نوار و دکمه‌ای. Esc از آن بیرون
REM  نمی‌اندازد و به خودِ برنامه می‌رسد.
REM
REM  ⚠️ در این حالت کاربر عملاً نمی‌تواند از برنامه بیرون بیاید مگر با
REM  Alt+F4. اگر روی همان کامپیوتر کار دیگری هم می‌کنید، «کاردو-صندوق»
REM  را اجرا کنید نه این را.
REM ============================================================

set KARDO_URL=http://localhost:3000/admin/pos
set KARDO_PROFILE=%LOCALAPPDATA%\Kardo\browser

set CHROME=%ProgramFiles%\Google\Chrome\Application\chrome.exe
if not exist "%CHROME%" set CHROME=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe
if not exist "%CHROME%" set CHROME=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe
if not exist "%CHROME%" set CHROME=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe

if not exist "%CHROME%" (
  echo کروم یا اج پیدا نشد.
  pause
  exit /b 1
)

start "" "%CHROME%" ^
  --kiosk %KARDO_URL% ^
  --user-data-dir="%KARDO_PROFILE%" ^
  --no-first-run ^
  --no-default-browser-check ^
  --disable-pinch ^
  --overscroll-history-navigation=0
