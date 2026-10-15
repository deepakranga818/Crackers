import config from "../sheet.config.json";

// The one connection setting. Everything else (products, prices, offers, shop name, WhatsApp
// number) is read from this spreadsheet at runtime. `export?format=csv` returns the first tab as
// one response with the full header text; both its redirect and final response allow cross-origin
// reads, so a static site can fetch it without credentials or a proxy.
export const SPREADSHEET_ID: string = config.spreadsheetId;
export const sheetUrl = (id = SPREADSHEET_ID) =>
  `https://docs.google.com/spreadsheets/d/${id}/export?format=csv`;
export const sheetViewUrl = (id = SPREADSHEET_ID) =>
  `https://docs.google.com/spreadsheets/d/${id}/edit`;
