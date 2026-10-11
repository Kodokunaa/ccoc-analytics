"use client";
import { useState } from "react";
import type { z } from "zod";
import type { importRecordsSchema } from "@/lib/import-data";
import { currency, givingTotal } from "@/lib/analytics";
type Preview = {
  records: z.infer<typeof importRecordsSchema>;
  conflicts: string[];
  locked: string[];
};
export default function ServiceImport({
  onChange,
}: {
  onChange: () => Promise<void>;
}) {
  const [preview, setPreview] = useState<Preview | null>(null),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <section className="panel operations-panel">
      <h2>Import historical Sunday records</h2>
      <p>
        Preview an XLSX workbook before importing. Existing dates are preserved;
        all rows succeed together or none are imported.
      </p>
      <button
        className="secondary"
        disabled={busy}
        onClick={async () => {
          setError("");
          try {
            const res = await fetch("/api/import-services");
            if (res.status === 401) {
              window.location.assign("/signin?next=%2Fadmin%2Freports");
              return;
            }
            if (!res.ok) throw new Error((await res.json()).error);
            const url = URL.createObjectURL(await res.blob());
            const a = document.createElement("a");
            a.href = url;
            a.download = "church-sunday-import-template.xlsx";
            a.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
          } catch (e) {
            setError(e instanceof Error ? e.message : "Unable to download");
          }
        }}
      >
        Download XLSX import template
      </button>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const form = new FormData(e.currentTarget);
          setBusy(true);
          setPreview(null);
          setMessage("");
          setError("");
          try {
            const res = await fetch("/api/import-services", {
              method: "POST",
              body: form,
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            setPreview(data);
          } catch (e) {
            setError(e instanceof Error ? e.message : "Unable to preview");
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          XLSX file (up to 4 MB / 1,000 rows)
          <input
            name="file"
            type="file"
            accept=".xlsx"
            required
            onChange={() => {
              setPreview(null);
              setMessage("");
            }}
          />
        </label>
        <button className="secondary" disabled={busy}>
          Validate and preview import
        </button>
      </form>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {message && <p role="status">{message}</p>}
      {preview && (
        <>
          <p>{preview.records.length} Sunday records ready for review.</p>
          {preview.conflicts.length > 0 && (
            <p role="alert">Existing dates: {preview.conflicts.join(", ")}</p>
          )}
          {preview.locked.length > 0 && (
            <p role="alert">Approved months: {preview.locked.join(", ")}</p>
          )}
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Service</th>
                  <th>Attendance</th>
                  <th>Giving</th>
                </tr>
              </thead>
              <tbody>
                {preview.records.map((r) => (
                  <tr key={r.serviceDate}>
                    <td>{r.serviceDate}</td>
                    <td>{r.serviceName}</td>
                    <td>{r.attendance?.totalAttendance ?? "Not recorded"}</td>
                    <td>
                      {r.giving?.length
                        ? currency(givingTotal(r.giving))
                        : "Not recorded"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            className="primary"
            disabled={
              busy || preview.conflicts.length > 0 || preview.locked.length > 0
            }
            onClick={async () => {
              if (!confirm(`Import ${preview.records.length} Sunday records?`))
                return;
              setBusy(true);
              setError("");
              try {
                const res = await fetch("/api/import-services", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ records: preview.records }),
                });
                const result = await res.json();
                if (!res.ok) throw new Error(result.error);
                setMessage(`Imported ${result.count} Sunday records.`);
                setPreview(null);
                await onChange();
              } catch (e) {
                setError(e instanceof Error ? e.message : "Unable to import");
              } finally {
                setBusy(false);
              }
            }}
          >
            Import reviewed records
          </button>
        </>
      )}
    </section>
  );
}
