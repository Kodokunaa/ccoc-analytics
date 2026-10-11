import { z } from "zod";
import { serviceSchema } from "./validation";
export const importHeaders = [
  "Date",
  "Service",
  "Attendance",
  "Adults",
  "Children",
  "Members",
  "Visitors",
  "Giving (PHP)",
  "Private notes",
];
export const importRecordsSchema = z
  .array(serviceSchema)
  .min(1)
  .max(1000)
  .superRefine((rows, ctx) => {
    const seen = new Set<string>();
    rows.forEach((row, i) => {
      if (seen.has(row.serviceDate))
        ctx.addIssue({
          code: "custom",
          path: [i, "serviceDate"],
          message: "Duplicate Sunday date in import",
        });
      seen.add(row.serviceDate);
    });
  });
// Reject oversized ZIP expansion before ExcelJS allocates workbook content.
export function checkWorkbookZip(buffer: Buffer) {
  let eocd = -1;
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 65557); i--)
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  if (eocd < 0) throw new Error("Use a valid XLSX workbook.");
  const count = buffer.readUInt16LE(eocd + 10),
    offset = buffer.readUInt32LE(eocd + 16);
  if (count > 1000 || count === 65535)
    throw new Error("Workbook has too many entries.");
  let pos = offset,
    total = 0;
  for (let i = 0; i < count; i++) {
    if (pos + 46 > buffer.length || buffer.readUInt32LE(pos) !== 0x02014b50)
      throw new Error("Invalid workbook archive.");
    total += buffer.readUInt32LE(pos + 24);
    if (total > 20 * 1024 * 1024)
      throw new Error("Expanded workbook must be under 20 MB.");
    pos +=
      46 +
      buffer.readUInt16LE(pos + 28) +
      buffer.readUInt16LE(pos + 30) +
      buffer.readUInt16LE(pos + 32);
  }
}
