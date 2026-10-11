"use client";
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
} from "recharts";
const colors = [
  "#c44f00",
  "#007f78",
  "#a84400",
  "#006b65",
  "#9a4000",
  "#005a56",
  "#803500",
];
export function TrendChart({
  data,
  mode = "combined",
  monthly = false,
}: {
  data: {
    name: string;
    attendance: number;
    giving: number;
    previousAttendance?: number;
    previousGiving?: number;
    perAttendee?: number;
  }[];
  mode?: "attendance" | "financial" | "combined" | "perAttendee";
  monthly?: boolean;
}) {
  if (!data.length)
    return (
      <div className="chart empty">
        <h3>No trend data</h3>
        <p>No records for this period. Select another period to view trends.</p>
      </div>
    );
  return (
    <div className="chart">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
          data={data}
          margin={{ top: 10, right: 5, bottom: 0, left: 0 }}
        >
          <CartesianGrid
            strokeDasharray="4 4"
            vertical={false}
            stroke="#eaeaea"
          />
          <XAxis
            dataKey="name"
            tick={{ fontSize: 11, fill: "#000000" }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) =>
              String(v).length === 10 ? String(v).slice(5) : String(v)
            }
          />
          <YAxis
            yAxisId="attendance"
            tick={{ fontSize: 11, fill: "#000000" }}
            tickLine={false}
            axisLine={false}
          />
          {mode === "combined" && (
            <YAxis
              yAxisId="giving"
              orientation="right"
              tick={{ fontSize: 11, fill: "#000000" }}
              tickLine={false}
              axisLine={false}
            />
          )}
          <Tooltip
            contentStyle={{ borderRadius: 12, border: "1px solid #e8e8e8" }}
          />
          <Legend
            formatter={(value) => (
              <span style={{ color: "#000000" }}>{value}</span>
            )}
            iconType="circle"
            wrapperStyle={{ fontSize: 12, paddingTop: 15 }}
          />
          {(mode === "attendance" || mode === "combined") && !monthly && (
            <Bar
              isAnimationActive={false}
              yAxisId="attendance"
              dataKey="attendance"
              name="Attendance"
              fill="#c44f00"
              radius={[5, 5, 0, 0]}
              maxBarSize={38}
            />
          )}{" "}
          {mode === "attendance" && !monthly && (
            <Bar
              isAnimationActive={false}
              yAxisId="attendance"
              dataKey="previousAttendance"
              name="Comparison attendance"
              fill="#007f78"
              radius={[5, 5, 0, 0]}
              maxBarSize={38}
            />
          )}{" "}
          {mode === "attendance" && monthly && (
            <>
              <Line
                isAnimationActive={false}
                yAxisId="attendance"
                dataKey="attendance"
                name="Attendance"
                type="monotone"
                stroke="#c44f00"
                strokeWidth={3}
              />
              <Line
                isAnimationActive={false}
                yAxisId="attendance"
                dataKey="previousAttendance"
                name="Comparison attendance"
                strokeDasharray="6 4"
                type="monotone"
                stroke="#007f78"
                strokeWidth={2}
              />
            </>
          )}
          {(mode === "combined" || (mode === "financial" && monthly)) && (
            <Line
              isAnimationActive={false}
              yAxisId={mode === "combined" ? "giving" : "attendance"}
              type="monotone"
              dataKey="giving"
              name="Giving (PHP)"
              stroke="#007f78"
              strokeWidth={3}
              dot={{ r: 4 }}
            />
          )}
          {mode === "financial" && !monthly && (
            <>
              <Bar
                isAnimationActive={false}
                yAxisId="attendance"
                dataKey="giving"
                name="Giving (PHP)"
                fill="#007f78"
                radius={[5, 5, 0, 0]}
                maxBarSize={38}
              />
              <Bar
                isAnimationActive={false}
                yAxisId="attendance"
                dataKey="previousGiving"
                name="Comparison giving (PHP)"
                fill="#c44f00"
                radius={[5, 5, 0, 0]}
                maxBarSize={38}
              />
            </>
          )}
          {mode === "financial" && monthly && (
            <Line
              isAnimationActive={false}
              yAxisId="attendance"
              type="monotone"
              dataKey="previousGiving"
              name="Comparison giving (PHP)"
              strokeDasharray="6 4"
              stroke="#c44f00"
              strokeWidth={2}
            />
          )}{" "}
          {mode === "perAttendee" && (
            <Line
              isAnimationActive={false}
              yAxisId="attendance"
              dataKey="perAttendee"
              name="PHP per attendee"
              stroke="#c44f00"
              strokeWidth={3}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
export function Breakdown({
  data,
}: {
  data: { name: string; value: number }[];
}) {
  if (!data.some((p) => p.value > 0))
    return (
      <div className="chart empty">
        <h3>No breakdown recorded</h3>
        <p>Enter a breakdown to see it here.</p>
      </div>
    );
  return (
    <div className="chart">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            isAnimationActive={false}
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius={68}
            outerRadius={96}
            paddingAngle={3}
          >
            {data.map((d, i) => (
              <Cell key={d.name} fill={colors[i % colors.length]} />
            ))}
          </Pie>
          <Tooltip />
          <Legend
            formatter={(value) => (
              <span style={{ color: "#000000" }}>{value}</span>
            )}
            iconType="circle"
            wrapperStyle={{ fontSize: 12 }}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
