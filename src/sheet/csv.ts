export type CsvRow = { cells: string[]; line: number };

// RFC 4180 reader: quoted fields, "" escapes, commas and line breaks inside quotes, CRLF/LF/CR,
// BOM, and a last record without a trailing newline. `line` is the physical line where the record
// starts, which matches the spreadsheet row number for a Google Sheets export.
export function parseCsvRows(input: string): CsvRow[] {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const rows: CsvRow[] = [];
  let cells: string[] = [];
  let field = "";
  let quoted = false;
  let line = 1;
  let start = 1;
  let touched = false;
  const endField = () => {
    cells.push(field);
    field = "";
  };
  const endRow = () => {
    endField();
    rows.push({ cells, line: start });
    cells = [];
    touched = false;
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else {
        if (c === "\n") line++;
        field += c;
      }
      continue;
    }
    if (c === '"' && field === "") {
      quoted = true;
      touched = true;
    } else if (c === ",") {
      endField();
      touched = true;
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      endRow();
      line++;
      start = line;
    } else {
      field += c;
      touched = true;
    }
  }
  if (touched || field !== "" || cells.length) endRow();
  return rows;
}

export const parseCsv = (text: string): string[][] =>
  parseCsvRows(text).map((r) => r.cells);
