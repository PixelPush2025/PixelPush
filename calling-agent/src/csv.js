// Minimal CSV parser: header row, comma-separated, double-quoted fields allowed.
export function parseCsv(text) {
  const rows = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const cells = [];
    let cur = '';
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (quoted && c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') quoted = !quoted;
      else if (c === ',' && !quoted) { cells.push(cur.trim()); cur = ''; }
      else cur += c;
    }
    cells.push(cur.trim());
    rows.push(cells);
  }
  const [header, ...body] = rows;
  return body.map((r) => Object.fromEntries(header.map((h, i) => [h.trim().toLowerCase(), r[i] ?? ''])));
}
