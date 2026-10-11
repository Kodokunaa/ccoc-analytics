"use client";
import dynamic from "next/dynamic";

const loading = () => (
  <div className="chart empty" role="status">
    Loading chart…
  </div>
);
export const TrendChart = dynamic(
  () => import("./charts").then((module) => module.TrendChart),
  { ssr: false, loading },
);
export const Breakdown = dynamic(
  () => import("./charts").then((module) => module.Breakdown),
  { ssr: false, loading },
);
