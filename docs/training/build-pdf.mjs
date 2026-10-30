import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const tpl = join(here, "kardo-guide.html");
const outHtml = join(here, "kardo-guide.print.html");
const outPdf = join(here, "راهنمای-کاردو.pdf");

const reg = readFileSync("C:/Windows/Fonts/Vazir Regular.ttf").toString("base64");
const bold = readFileSync("C:/Windows/Fonts/Vazir Bold.ttf").toString("base64");

let html = readFileSync(tpl, "utf8");
html = html.replace("__VAZIR_REG__", reg).replace("__VAZIR_BOLD__", bold);
writeFileSync(outHtml, html, "utf8");
console.log("HTML ready:", outHtml, (html.length / 1024).toFixed(0) + " KB");

const candidates = [
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
];
const exe = candidates.find((p) => existsSync(p));
if (!exe) throw new Error("No Edge/Chrome found");

const profile = join(process.env.TEMP || ".", "kardo-pdf-profile");
mkdirSync(profile, { recursive: true });

const fileUrl = "file:///" + outHtml.replace(/\\/g, "/").replace(/ /g, "%20");

execFileSync(exe, [
  "--headless=new",
  "--disable-gpu",
  "--no-first-run",
  "--no-default-browser-check",
  `--user-data-dir=${profile}`,
  "--no-pdf-header-footer",
  "--print-to-pdf-no-header",
  `--print-to-pdf=${outPdf}`,
  "--virtual-time-budget=10000",
  fileUrl,
], { stdio: "inherit", timeout: 120000 });

console.log("PDF ready:", outPdf);
