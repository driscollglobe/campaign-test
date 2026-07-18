// greenbutton.js
// Eversource Green Button usage CSV parser for the rate case calculator.
//
// PRIVACY RULES (do not weaken):
// - Parsing happens entirely in the browser. The file is never transmitted,
//   stored, or logged anywhere, and this file contains no network calls.
// - Only the Read Date, Usage, and Usage Unit columns are read. Every other
//   column is ignored, because the export contains the customer's name,
//   service address, and account number. (The unit column is read solely to
//   reject files that are not measured in kWh; it carries no personal data.)
// - The returned object contains kWh totals and read dates only. Never add
//   account or address fields to it.
//
// FORMAT: the Eversource billed-usage export is a CSV with several preamble
// lines (name, address, account), then a header row beginning with
// "Account,Read Date,Usage", then one row per billing month, newest first.
//
// NO DOLLAR MATH HERE. The summed kWh goes to EversourceRates.calculate()
// as annualKwh; rates.js remains the only place bill arithmetic happens.
//
// If the file has fewer than 12 monthly rows, is not measured in kWh, or
// does not read like a year of consecutive monthly billing periods, throw a
// plain error so the UI falls back to manual entry. Never guess.
//
// Loaded the same way as rates.js: classic script plus a globalThis
// namespace, so the page works from file://. See the LOADING note there.

const GREENBUTTON_HEADER = "Account,Read Date,Usage";
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
  const headerIndex = lines.findIndex((line) => line.startsWith(GREENBUTTON_HEADER));
  if (headerIndex === -1) {
    throw new Error(
      'This does not look like an Eversource usage file. Expected a header row starting with "Account,Read Date,Usage".'
    );
  }

  const rows = [];
  for (const line of lines.slice(headerIndex + 1)) {
    if (line.trim() === "") continue;
    const cells = splitCsvLine(line);
    if (cells.length < 4) {
      throw new Error("A row under the header does not have the expected columns.");
    }
    // Read only these three cells. cells[0] is the account number; skip it.
    const readDate = cells[1].trim();
    const usageKwh = Number(cells[2].trim().replace(/,/g, ""));
    const unit = cells[3].trim().toLowerCase();
    const time = Date.parse(readDate);
    if (!Number.isFinite(time) || !Number.isFinite(usageKwh)) {
      throw new Error("A row under the header does not match the expected Read Date and Usage format.");
    }
    if (unit !== "kwh") {
      throw new Error("The usage unit in this file is not kWh.");
    }
    if (usageKwh < 0) {
      throw new Error(
        "The file shows negative usage for at least one period, which usually means solar or net metering. This calculator cannot estimate solar bills."
      );
    }
    rows.push({ readDate, usageKwh, time });
  }

  // Exact duplicate rows (same read date and same usage) collapse to one;
  // re-exports sometimes repeat rows. Rows sharing a read date with
  // different usage are ambiguous, stay separate, and fail the
  // distinct-periods check below.
  const seen = new Set();
  const distinctRows = rows.filter((row) => {
    const key = row.time + ":" + row.usageKwh;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  if (distinctRows.length < GREENBUTTON_MONTHS_REQUIRED) {
    throw new Error(
      `The file has ${distinctRows.length} monthly rows; a full year needs ${GREENBUTTON_MONTHS_REQUIRED}.`
    );
  }

  // The export is documented newest first, but select by read date so the
  // most recent 12 billing periods are used even if the order ever changes.
  const newestFirst = distinctRows.slice().sort((a, b) => b.time - a.time);
  const used = newestFirst.slice(0, GREENBUTTON_MONTHS_REQUIRED);

  // The 12 selected reads must look like a year of consecutive monthly
  // billing periods: distinct dates, month-scale gaps, year-scale span.
  if (new Set(used.map((row) => row.time)).size !== GREENBUTTON_MONTHS_REQUIRED) {
    throw new Error(`The file does not contain ${GREENBUTTON_MONTHS_REQUIRED} distinct billing periods.`);
  }
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
