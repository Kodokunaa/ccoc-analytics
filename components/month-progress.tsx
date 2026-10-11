"use client";
import { Gauge } from "./bklit/gauge";
import { useReducedMotion } from "motion/react";
export default function MonthProgress({
  complete,
  total,
}: {
  complete: number;
  total: number;
}) {
  const reduced = useReducedMotion();
  const value = total ? (complete / total) * 100 : 0;
  return (
    <div className="month-progress">
      <p>
        {complete} of {total} Sundays have complete attendance and giving.
      </p>
      <div
        role="progressbar"
        aria-label="Monthly data completeness"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(value)}
        aria-valuetext={`${complete} of ${total} Sundays complete`}
      >
        <Gauge
          value={value}
          orientation="linear"
          totalNotches={30}
          minWidth={0}
          activeFill="#007F78"
          inactiveFill="#CBD5D4"
          inactiveFillOpacity={1}
          useGradient={false}
          geometryScrubbing={reduced ?? true}
        />
      </div>
    </div>
  );
}
