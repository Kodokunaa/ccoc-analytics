import { test } from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import { presentationSlides } from "../lib/presentation-model";
import { publicPresentation } from "../lib/public-presentation";
import { monthReport } from "../lib/public-analytics";
import type { RecordData } from "../lib/analytics";
import type { TransparencyData } from "../lib/transparency";

const record = (
  date: string,
  attendance: number,
  giving: number,
): RecordData => ({
  id: date,
  serviceDate: date,
  serviceType: "SUNDAY_SERVICE",
  serviceName: "Sunday",
  attendance: {
    totalAttendance: attendance,
    adultCount: 0,
    childrenCount: 0,
    memberCount: 0,
    visitorCount: 0,
  },
  giving: [{ amount: giving }],
});
const records = [
  record("2025-12-28", 200, 12000),
  record("2026-01-04", 100, 10000),
  record("2026-01-11", 123, 3475.25),
];
const data: TransparencyData = {
  campaign: [],
  records,
  months: Array.from({ length: 12 }, (_, i) =>
    monthReport(records, `2026-${String(i + 1).padStart(2, "0")}`),
  ),
  years: [2026],
  latestMonth: "2026-01",
  churchName: "City Church of Christ",
  churchAddress: "",
  logo: "",
  lastUpdated: null,
};
test("Attendance and giving report models contain only their selected metric", () => {
  for (const metric of ["attendance", "giving"] as const) {
    const slides = presentationSlides(data, data, "2026-01", metric);
    const title = metric === "attendance" ? "Attendance" : "Giving";
    assert.deepEqual(
      slides.map((s) => s.title),
      [`${title} numbers`, `${title} graph`, `${title} comparison`],
    );
    assert.equal(slides[1].chart?.metric, metric);
    assert.deepEqual(
      slides[1].chart?.values,
      metric === "attendance" ? [100, 123] : [10000, 3475.25],
    );
    assert.ok(
      slides[0].rows![1][1].includes(
        metric === "attendance" ? "223" : "13,475.25",
      ),
    );
    assert.ok(
      !JSON.stringify(slides)
        .toLowerCase()
        .includes(metric === "attendance" ? "giving" : "attendance"),
    );
    assert.equal(
      slides[2].rows![2][2],
      metric === "attendance" ? "+11.5%" : "+12.29%",
    );
  }
});
test("Separate monthly PowerPoint files have three slides, editable tables and one selected chart", async () => {
  for (const metric of ["attendance", "giving"] as const) {
    const zip = await JSZip.loadAsync(
      await publicPresentation(data, data, "month", "2026-01", {}, metric),
    );
    const slides = Object.keys(zip.files).filter((n) =>
      /^ppt\/slides\/slide\d+\.xml$/.test(n),
    );
    assert.equal(slides.length, 3);
    assert.equal(
      Object.keys(zip.files).filter((n) =>
        /^ppt\/charts\/chart\d+\.xml$/.test(n),
      ).length,
      1,
    );
    for (const [i, kind] of ["numbers", "graph", "comparison"].entries()) {
      const xml = await zip
        .file(`ppt/slides/slide${i + 1}.xml`)!
        .async("string");
      assert.ok(
        xml.includes(
          `${metric === "attendance" ? "Attendance" : "Giving"} ${kind}`,
        ),
      );
      assert.ok(
        !xml.includes(metric === "attendance" ? "Giving" : "Attendance"),
      );
      if (i !== 1) assert.ok(xml.includes("<a:tbl>"));
    }
    const chartPath = Object.keys(zip.files).find((n) =>
      /^ppt\/charts\/chart\d+\.xml$/.test(n),
    )!;
    const chart = await zip.file(chartPath)!.async("string");
    assert.ok(chart.includes(metric === "attendance" ? "123" : "3475.25"));
  }
});
test("Annual PowerPoint keeps the selected report separate for all twelve months", async () => {
  const zip = await JSZip.loadAsync(
    await publicPresentation(data, data, "year", "2026-01", {}, "giving"),
  );
  const slides = Object.keys(zip.files).filter((n) =>
    /^ppt\/slides\/slide\d+\.xml$/.test(n),
  );
  assert.equal(slides.length, 36);
  for (const path of slides)
    assert.ok(!(await zip.file(path)!.async("string")).includes("Attendance"));
});
test("Combined monthly PowerPoint retains six separate metric slides and editable charts", async () => {
  const model = presentationSlides(data, data, "2026-01", "both");
  assert.deepEqual(model, [
    ...presentationSlides(data, data, "2026-01", "attendance"),
    ...presentationSlides(data, data, "2026-01", "giving"),
  ]);
  const zip = await JSZip.loadAsync(
    await publicPresentation(data, data, "month", "2026-01", {}, "both"),
  );
  assert.equal(
    Object.keys(zip.files).filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
      .length,
    6,
  );
  assert.equal(
    Object.keys(zip.files).filter((n) => /^ppt\/charts\/chart\d+\.xml$/.test(n))
      .length,
    2,
  );
  for (const [index, slide] of model.entries()) {
    const xml = await zip
      .file(`ppt/slides/slide${index + 1}.xml`)!
      .async("string");
    assert.ok(xml.includes(slide.title));
    assert.ok(!xml.includes(index < 3 ? "Giving" : "Attendance"));
    if (slide.rows) assert.ok(xml.includes("<a:tbl>"));
  }
});
test("Combined annual PowerPoint has 72 slides and uses approved monthly sources for both metrics", async () => {
  const approved = { ...data, records: [record("2026-01-04", 37, 123.45)] };
  const zip = await JSZip.loadAsync(
    await publicPresentation(
      data,
      data,
      "year",
      "2026-01",
      { "2026-01": { data: approved, previousYear: data } },
      "both",
    ),
  );
  assert.equal(
    Object.keys(zip.files).filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
      .length,
    72,
  );
  assert.ok(
    (await zip.file("ppt/slides/slide1.xml")!.async("string")).includes("37"),
  );
  assert.ok(
    (await zip.file("ppt/slides/slide4.xml")!.async("string")).includes(
      "123.45",
    ),
  );
  assert.ok(
    (await zip.file("ppt/slides/slide7.xml")!.async("string")).includes(
      "February 2026",
    ),
  );
  assert.ok(
    (await zip.file("ppt/slides/slide10.xml")!.async("string")).includes(
      "Giving numbers",
    ),
  );
});
