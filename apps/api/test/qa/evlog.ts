import * as fs from 'fs';
import * as path from 'path';
// NOTE: deliberately not `evidence.json` — that shares a basename with this module
// and NodeNext module resolution would try to load the JSON as the module, returning
// an object instead of the functions below ("note is not a function").
const FILE = path.resolve(__dirname, 'evidence-results.json');
export function note(id: string, data: any) {
  let all: any = {};
  try {
    all = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch {}
  all[id] = data;
  fs.writeFileSync(FILE, JSON.stringify(all, null, 2));
}
export function errBody(e: any) {
  if (!e) return null;
  return {
    name: e.name,
    status: e.status ?? null,
    body: e.response ?? e.getResponse?.() ?? e.message,
    code: e.code ?? null,
  };
}
