// tests/check.js - the "test" step of the pipeline for the Skyline Air front-end.
// Plain Node.js, no npm packages needed. Exits with code 1 if anything fails,
// which makes the Jenkins "Build and Test" stage fail and stops the pipeline.
const fs = require('fs');
const vm = require('vm');

let failures = 0;
function check(name, ok, detail) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${!ok && detail ? '  ->  ' + detail : ''}`);
  if (!ok) failures++;
}

const html = fs.readFileSync('index.html', 'utf8');

// 1. Basic page structure
check('index.html is not empty', html.trim().length > 500);
check('starts with <!DOCTYPE html>', /^\s*<!DOCTYPE html>/i.test(html));
check('<html> has a lang attribute', /<html[^>]*\blang=/i.test(html));
check('has a <title>', /<title>[^<]+<\/title>/i.test(html));
check('has a viewport meta tag', /<meta[^>]+name="viewport"/i.test(html));

// 2. Important tags must be opened and closed the same number of times
for (const tag of ['html', 'head', 'body', 'header', 'main', 'form', 'dialog', 'style', 'script']) {
  const opened = (html.match(new RegExp(`<${tag}[\\s>]`, 'gi')) || []).length;
  const closed = (html.match(new RegExp(`</${tag}>`, 'gi')) || []).length;
  check(`<${tag}> tags are balanced (${opened} open / ${closed} close)`, opened === closed && opened > 0);
}

// 3. The inline JavaScript must have valid syntax
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/gi)].map(m => m[1]);
check('page contains inline JavaScript', scripts.length > 0);
scripts.forEach((code, i) => {
  try {
    new vm.Script(code, { filename: `inline-script-${i + 1}.js` });
    check(`inline script #${i + 1} has valid JavaScript syntax`, true);
  } catch (e) {
    check(`inline script #${i + 1} has valid JavaScript syntax`, false, e.message);
  }
});

// 4. Every element id the script looks up with $('...') must exist in the HTML
const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]));
const used = new Set();
scripts.forEach(code => { for (const m of code.matchAll(/\$\('([^']+)'\)/g)) used.add(m[1]); });
const missing = [...used].filter(id => !ids.has(id));
check(`all ${used.size} element ids used by the script exist in the HTML`, missing.length === 0, 'missing: ' + missing.join(', '));

// 5. Validate the flight data (AIRPORTS and FLIGHTS) embedded in the page
const m = scripts.join('\n').match(/const AIRPORTS = (\{[\s\S]*?\});[\s\S]*?const FLIGHTS = (\[[\s\S]*?\]);/);
check('AIRPORTS and FLIGHTS data found in the script', !!m);
if (m) {
  const { airports, flights } = vm.runInNewContext(`({ airports: ${m[1]}, flights: ${m[2]} })`);
  check(`FLIGHTS has entries (${flights.length})`, flights.length > 0);
  check('flight ids are unique', new Set(flights.map(f => f.id)).size === flights.length);
  check('every flight uses known airports and from != to',
    flights.every(f => airports[f.from] && airports[f.to] && f.from !== f.to));
  check('every flight has HH:MM times and a positive price',
    flights.every(f => /^\d{2}:\d{2}$/.test(f.dep) && /^\d{2}:\d{2}$/.test(f.arr) && f.price > 0));
}

console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
