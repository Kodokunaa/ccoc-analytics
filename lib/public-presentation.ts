import PptxGenJS from "pptxgenjs";
import {
  presentationSlides,
  type PresentationMetric,
} from "./presentation-model";
import { monthName } from "./public-analytics";
import type { TransparencyData } from "./transparency";

/** Three editable slides per metric per month; six when both are selected. */
export async function publicPresentation(
  data: TransparencyData,
  previousYear: TransparencyData,
  scope: "data" | "month" | "year",
  month: string,
  sources: Record<
    string,
    { data: TransparencyData; previousYear: TransparencyData }
  > = {},
  report: PresentationMetric = "attendance",
) {
  const ppt = new PptxGenJS();
  ppt.layout = "LAYOUT_WIDE";
  ppt.author = data.churchName;
  ppt.subject = `Public ${report} report`;
  ppt.title = `${data.churchName} — ${report === "both" ? "Attendance & giving" : report === "attendance" ? "Attendance" : "Giving"} — ${scope === "year" ? month.slice(0, 4) : monthName(month)}`;
  ppt.company = data.churchName;
  ppt.theme = {
    headFontFace: "Arial",
    bodyFontFace: "Arial",
  };
  const months = scope === "year" ? data.months.map((r) => r.month) : [month];
  let page = 0;
  function slide(title: string, period: string, note: string) {
    const s = ppt.addSlide();
    s.background = { color: "FFFFFF" };
    s.addText(title, {
      x: 0.65,
      y: 0.55,
      w: 12,
      h: 0.6,
      fontFace: "Arial",
      fontSize: 32,
      bold: true,
      color: "000000",
      margin: 0,
    });
    s.addText(period, {
      x: 0.65,
      y: 1.3,
      w: 12,
      h: 0.35,
      fontSize: 18,
      color: "000000",
      margin: 0,
    });
    s.addText(`${data.churchName}  ·  ${++page}`, {
      x: 0.65,
      y: 7.03,
      w: 12,
      h: 0.25,
      fontSize: 10,
      color: "000000",
      margin: 0,
    });
    s.addNotes(note);
    return s;
  }
  function table(
    s: PptxGenJS.Slide,
    rows: string[][],
    widths: number[],
    size = 20,
  ) {
    s.addTable(
      rows.map((row, i) =>
        row.map((text) => ({
          text,
          options:
            i === 0
              ? { bold: true, color: "FFFFFF", fill: { color: "007F78" } }
              : {},
        })),
      ),
      {
        x: 0.65,
        y: 1.95,
        w: 12,
        colW: widths,
        rowH: 0.55,
        fontFace: "Arial",
        fontSize: size,
        color: "000000",
        margin: 0.12,
        border: { type: "solid", color: "E5E5E5", pt: 0.5 },
        autoPage: false,
      },
    );
  }
  for (const selected of months) {
    const source = sources[selected] ?? { data, previousYear };
    for (const model of presentationSlides(
      source.data,
      source.previousYear,
      selected,
      report,
    )) {
      const s = slide(model.title, model.period, model.note);
      if (model.rows)
        table(s, model.rows, model.widths ?? [8, 4], model.caption ? 18 : 20);
      if (model.empty)
        s.addText(model.empty, {
          x: 0.65,
          y: 3,
          w: 12,
          h: 1,
          fontSize: 24,
          color: "000000",
        });
      if (model.chart)
        s.addChart(
          ppt.ChartType.bar,
          [
            {
              name:
                model.chart.metric === "attendance"
                  ? "Attendance"
                  : "Giving (PHP)",
              labels: model.chart.labels,
              values: model.chart.values,
            },
          ],
          {
            x: 0.65,
            y: 1.95,
            w: 12,
            h: 4.65,
            barDir: "col",
            catAxisLabelFontFace: "Arial",
            catAxisLabelFontSize: 14,
            valAxisLabelFontFace: "Arial",
            valAxisLabelFontSize: 14,
            valAxisMinVal: 0,
            valAxisLabelFormatCode: "#,##0",
            chartColors: [
              model.chart.metric === "attendance" ? "C44F00" : "007F78",
            ],
            showLegend: false,
            showValue: true,
            dataLabelFormatCode:
              model.chart.metric === "attendance" ? "#,##0" : "#,##0.00",
            dataLabelPosition: "outEnd",
            dataLabelColor: "000000",
            dataLabelFontFace: "Arial",
            dataLabelFontSize: 16,
            showTitle: false,
          },
        );
      if (model.caption)
        s.addText(model.caption, {
          x: 0.65,
          y: 5.15,
          w: 12,
          h: 0.8,
          fontSize: 17,
          color: "000000",
          margin: 0,
        });
    }
  }
  return (await ppt.write({
    outputType: "nodebuffer",
    compression: true,
  })) as Buffer;
}
