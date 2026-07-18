// greenbutton.js
// Eversource Green Button usage CSV parser for the rate case calculator.
//
// PRIVACY RULES (do not weaken):
// - Parsing happens entirely in the browser. The file is never transmitted,
//   stored, or logged anywhere, and this file contains no network calls.
// - Only the Read Date and Usage columns are read, plus the Usage Unit
//   column when the file has one, solely to reject non-kWh files. Every
//   other column is ignored, because the export contains the customer's
//   account number, service address, and charges.
// - The returned object contains four fields only: annualKwh, monthsUsed,
//   newestReadDate, oldestReadDate. Never add account, address, charge, or
//   raw-row fields to it.
//
// FORMAT: the Eversource billed-usage export is a CSV with several preamble
// lines (name, address, account), then a header row:
//   Account,Read Date,Usage,Number of Days,Usage per day,Charge,Read Type,Average Temperature
// then one row per billing month, newest first. Columns are located BY
// HEADER NAME, not position, so column order and extra columns are fine.
// Some Green Button exports include a "Usage Unit" column instead; when it
// exists its value must be kWh. When it does not exist, the header must
// match the known Eversource electric schema above, so a non-electric or
// unknown export is rejected instead of guessed at.
//
// NO DOLLAR MATH HERE. The summed kWh goes to EversourceRates.calculate()
// as annualKwh; rates.js remains the only place bill arithmetic happens.
//
// If anything does not match (fewer than 12 distinct monthly periods, bad
// dates or usage, conflicting duplicate rows, non-monthly spacing), throw a
// plain error so the UI falls back to manual entry. Never guess.
//
// Loaded the same way as rates.js: classic script plus a globalThis
// namespace, so the page works from file://. See the LOADING note there.

const GREENBUTTON_HEADER_PREFIX = "Account,Read Date,Usage";
const GREENBUTTON_KNOWN_HEADER_WITHOUT_UNIT =
  "account,read date,usage,number of days,usage per day,charge,read type,average temperature";
const GREENBUTTON_MONTHS_REQUIRED = 12;

// Billing-period sanity bounds, in days. Individual reads land roughly a
// month apart (short and long cycles happen), and 12 of them cover roughly
// a year. Files outside these bounds are not a usable year of monthly data.
const GREENBUTTON_MIN_GAP_DAYS = 15;
const GREENBUTTON_MAX_GAP_DAYS = 62;
const GREENBUTTON_MIN_SPAN_DAYS = 300;
const GREENBUTTON_MAX_SPAN_DAYS = 430;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

// Minimal CSV field splitter with RFC 4180 quoting: quoted cells may contain
// commas, and a doubled quote inside a quoted cell is a literal quote. The
// export quotes cells like the service address, which contains commas, so
// splitting on every comma would misalign the columns.
function splitCsvLine(line) {
  const cells = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
    } else if (ch === '"' && cell === "") {
      inQuotes = true;
    } else if (ch === ",") {
      cells.push(cell);
      cell = "";
    } else {
      cell += ch;
    }
  }
  cells.push(cell);
  return cells;
}

function parseEversourceUsageCsv(text) {
  if (typeof text !== "string" || text.trim() === "") {
    throw new Error("The file is empty or unreadable.");
  }
  const lines = text.split(/\r\n|\r|\n/);
  const headerIndex = lines.findIndex((line) => line.startsWith(GREENBUTTON_HEADER_PREFIX));
  if (headerIndex === -1) {
    throw new Error(
      'This does not look like an Eversource usage file. Expected a header row starting with "Account,Read Date,Usage".'
    );
  }

  // Locate columns by header name, not position. Only these three names are
  // ever looked up; every other column stays unread.
  const headerCells = splitCsvLine(lines[headerIndex]).map((cell) => cell.trim().toLowerCase());
  const dateColumn = headerCells.indexOf("read date");
  const usageColumn = headerCells.indexOf("usage");
  const unitColumn = headerCells.indexOf("usage unit");
  if (dateColumn === -1 || usageColumn === -1) {
    throw new Error("The file header is missing the Read Date or Usage column.");
  }
  if (unitColumn === -1 && headerCells.join(",") !== GREENBUTTON_KNOWN_HEADER_WITHOUT_UNIT) {
    throw new Error(
      "This file does not match the Eversource electric usage export format, so the usage cannot be confirmed as kWh."
    );
  }
  const lastNeededColumn = Math.max(dateColumn, usageColumn, unitColumn);

  const rows = [];
  for (const line of lines.slice(headerIndex + 1)) {
    if (line.trim() === "") continue;
    const cells = splitCsvLine(line);
    if (cells.length <= lastNeededColumn) {
      throw new Error("A row under the header does not have the expected columns.");
    }
    const readDate = cells[dateColumn].trim();
    const usageKwh = Number(cells[usageColumn].trim().replace(/,/g, ""));
    const time = Date.parse(readDate);
    if (!Number.isFinite(time) || !Number.isFinite(usageKwh)) {
      throw new Error("A row under the header does not match the expected Read Date and Usage format.");
    }
    if (unitColumn !== -1 && cells[unitColumn].trim().toLowerCase() !== "kwh") {
      throw new Error("The usage unit in this file is not kWh.");
    }
    if (usageKwh < 0) {
      throw new Error(
        "The file shows negative usage for at least one period, which may represent solar or net metering. This calculator cannot reliably estimate those bills."
      );
    }
    rows.push({ readDate, usageKwh, time });
  }

  // Exact duplicate rows (same read date and same usage) collapse to one;
  // re-exports sometimes repeat rows. Two rows sharing a read date with
  // different usage are ambiguous and rejected outright.
  const byTime = new Map();
  const distinctRows = [];
  for (const row of rows) {
    const existing = byTime.get(row.time);
    if (existing === undefined) {
      byTime.set(row.time, row.usageKwh);
      distinctRows.push(row);
    } else if (existing !== row.usageKwh) {
      throw new Error(
        "The file lists the same read date twice with different usage values, so the months cannot be totaled reliably."
      );
    }
  }

  if (distinctRows.length < GREENBUTTON_MONTHS_REQUIRED) {
    throw new Error(
      `The file has ${distinctRows.length} monthly rows; a full year needs ${GREENBUTTON_MONTHS_REQUIRED}.`
    );
  }

  // Rows may arrive in any order; select the most recent 12 distinct
  // billing periods by read date.
  const newestFirst = distinctRows.slice().sort((a, b) => b.time - a.time);
  const used = newestFirst.slice(0, GREENBUTTON_MONTHS_REQUIRED);

  // The 12 selected reads must look like a year of consecutive monthly
  // billing periods: month-scale gaps and a year-scale span.
  for (let i = 0; i < used.length - 1; i += 1) {
    const gapDays = (used[i].time - used[i + 1].time) / MS_PER_DAY;
    if (gapDays < GREENBUTTON_MIN_GAP_DAYS || gapDays > GREENBUTTON_MAX_GAP_DAYS) {
      throw new Error("The 12 most recent readings are not consecutive monthly billing periods.");
    }
  }
  const spanDays = (used[0].time - used[used.length - 1].time) / MS_PER_DAY;
  if (spanDays < GREENBUTTON_MIN_SPAN_DAYS || spanDays > GREENBUTTON_MAX_SPAN_DAYS) {
    throw new Error(
      `The 12 most recent readings span about ${Math.round(spanDays)} days; about a year of monthly bills is needed.`
    );
  }

  const annualKwh = used.reduce((sum, row) => sum + row.usageKwh, 0);

  return {
    annualKwh,
    monthsUsed: GREENBUTTON_MONTHS_REQUIRED,
    newestReadDate: used[0].readDate,
    oldestReadDate: used[used.length - 1].readDate,
  };
}

globalThis.GreenButton = {
  parseEversourceUsageCsv,
};
