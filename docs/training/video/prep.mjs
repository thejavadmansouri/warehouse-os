import { readFileSync, writeFileSync } from "node:fs";
const reg = readFileSync("C:/Windows/Fonts/Vazir Regular.ttf").toString("base64");
const bold = readFileSync("C:/Windows/Fonts/Vazir Bold.ttf").toString("base64");
let h = readFileSync("docs/training/video/kardo-motion.html", "utf8");
h = h.replace("__VAZIR_REG__", reg).replace("__VAZIR_BOLD__", bold);
writeFileSync("docs/training/video/kardo-motion.render.html", h);
console.log("ok", (h.length/1024).toFixed(0)+"KB");
