import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createManusTask,
  readManusTask,
  monthlyAssistantPayload,
  manusPrompt,
} from "../lib/manus";
import type { RecordData } from "../lib/analytics";
const records: RecordData[] = [
  {
    id: "private-id",
    serviceDate: "2026-01-04",
    serviceName: "Private name",
    serviceType: "SUNDAY_SERVICE",
    attendance: {
      totalAttendance: 30,
      adultCount: 20,
      childrenCount: 10,
      memberCount: 28,
      visitorCount: 2,
    },
    giving: [{ amount: "100.25" }],
  },
];
const payload = monthlyAssistantPayload(records, [], "2026-01", false);
const mock =
  (body: unknown): typeof fetch =>
  async () =>
    new Response(JSON.stringify(body));
test("Assistant payload excludes identifiers and names, and preserves missing data", () => {
  assert.equal(payload.current.totalAttendance, 30);
  assert.equal(payload.current.totalGivingPHP, 100.25);
  assert.equal(payload.current.completeSundays, 1);
  assert.equal(payload.current.expectedSundays, 4);
  assert.equal(payload.previousMonth.month, "2025-12");
  assert.equal(payload.previousYear.month, "2025-01");
  assert.equal(payload.previousYear.attendanceServicesRecorded, 0);
  assert.equal(payload.current.missingData.length, 3);
  assert.ok(!JSON.stringify(payload).includes("private-id"));
  assert.ok(!JSON.stringify(payload).includes("Private name"));
  assert.match(manusPrompt(payload), /Missing records are unknown/);
});
test("Manus creation uses private v2 structured output and keeps key in headers", async () => {
  const fetcher: typeof fetch = async (url, init) => {
    assert.equal(url, "https://api.manus.ai/v2/task.create");
    assert.equal(
      (init?.headers as Record<string, string>)["x-manus-api-key"],
      "test-key",
    );
    const body = JSON.parse(String(init?.body));
    assert.equal(body.share_visibility, "private");
    assert.equal(body.interactive_mode, false);
    assert.deepEqual(body.message.connectors, []);
    assert.equal(body.structured_output_schema.additionalProperties, false);
    assert.ok(!String(init?.body).includes("test-key"));
    return new Response(
      JSON.stringify({
        ok: true,
        task_id: "abc123",
        task_url: "https://untrusted.example",
      }),
    );
  };
  assert.deepEqual(await createManusTask(payload, "test-key", fetcher), {
    remoteId: "abc123",
    remoteUrl: "https://manus.im/app/abc123",
  });
  await assert.rejects(
    createManusTask(payload, "test-key", mock({ ok: true, task_id: "../bad" })),
  );
});
test("Stopped status does not finish a task before structured output arrives", async () => {
  assert.deepEqual(
    await readManusTask(
      "abc",
      "key",
      mock({
        ok: true,
        messages: [
          { type: "status_update", status_update: { agent_status: "stopped" } },
        ],
      }),
    ),
    { status: "RUNNING" },
  );
  assert.deepEqual(
    await readManusTask(
      "abc",
      "key",
      mock({
        ok: true,
        messages: [
          { type: "status_update", status_update: { agent_status: "waiting" } },
        ],
      }),
    ),
    { status: "WAITING" },
  );
});
test("Only validated structured commentary is accepted", async () => {
  const output = {
    summary: "Draft",
    attendance: "30 visits",
    giving: "PHP 100.25",
    dataQuality: "3 missing Sundays",
  };
  assert.deepEqual(
    await readManusTask(
      "abc",
      "key",
      mock({
        ok: true,
        messages: [
          {
            type: "structured_output_result",
            structured_output_result: { success: true, value: output },
          },
        ],
      }),
    ),
    { status: "COMPLETED", output },
  );
  await assert.rejects(
    readManusTask(
      "abc",
      "key",
      mock({
        ok: true,
        messages: [
          {
            type: "structured_output_result",
            structured_output_result: {
              success: true,
              value: { summary: "Partial" },
            },
          },
        ],
      }),
    ),
  );
  await assert.rejects(
    readManusTask(
      "abc",
      "key",
      async () =>
        new Response("Do not expose provider error contents", { status: 401 }),
    ),
  );
});
