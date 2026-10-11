import { z } from "zod";
const count = z.coerce.number().int().min(0).max(1000000);
export const calendarDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (v) =>
      !Number.isNaN(Date.parse(v)) &&
      new Date(v).toISOString().slice(0, 10) === v,
    "Invalid calendar date",
  )
  .refine(
    (v) => Number(v.slice(0, 4)) >= 1990 && Number(v.slice(0, 4)) <= 2100,
    "Use a year from 1990 to 2100",
  );
const date = calendarDateSchema;
const password = z
  .string()
  .min(12)
  .max(72)
  .refine(
    (value) => new TextEncoder().encode(value).length <= 72,
    "Password must be at most 72 UTF-8 bytes",
  );
export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  password: z.string().min(1).max(128),
});
export const attendanceSchema = z
  .object({
    totalAttendance: count,
    adultCount: count,
    childrenCount: count,
    visitorCount: count,
    memberCount: count,
  })
  .refine(
    (v) => v.adultCount + v.childrenCount <= v.totalAttendance,
    "Adults plus children cannot exceed total",
  )
  .refine(
    (v) => v.memberCount + v.visitorCount <= v.totalAttendance,
    "Members plus visitors cannot exceed total",
  );
export const givingSchema = z.object({
  amount: z.coerce
    .number()
    .min(0)
    .max(999999999999)
    .refine(
      (v) => Math.abs(v * 100 - Math.round(v * 100)) < 0.001,
      "Use at most two decimal places",
    ),
  notes: z.string().max(2000).optional(),
});
export const serviceSchema = z.object({
  serviceDate: date.refine(
    (v) => new Date(v).getUTCDay() === 0,
    "Choose a Sunday service date",
  ),
  serviceType: z.literal("SUNDAY_SERVICE").default("SUNDAY_SERVICE"),
  serviceName: z.string().trim().min(1).max(150),
  notes: z.string().max(4000).optional(),
  attendance: attendanceSchema.optional(),
  giving: z.array(givingSchema).max(30).optional(),
});
export const userSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().toLowerCase().pipe(z.email()),
  status: z.enum(["ACTIVE", "INACTIVE"]),
  password: password.optional(),
});
export const targetSchema = z
  .object({
    type: z.enum(["ATTENDANCE", "GIVING"]),
    periodType: z.enum(["WEEKLY", "MONTHLY", "QUARTERLY", "YEARLY"]),
    targetValue: z.coerce.number().positive().max(999999999999),
    startDate: date,
    endDate: date,
  })
  .refine((v) => v.endDate >= v.startDate, "End date must follow start date")
  .refine(
    (v) => v.type !== "ATTENDANCE" || Number.isInteger(v.targetValue),
    "Attendance targets must be whole numbers",
  )
  .refine(
    (v) =>
      Math.abs(v.targetValue * 100 - Math.round(v.targetValue * 100)) < 0.001,
    "Use at most two decimal places",
  );
export const settingsSchema = z.object({
  churchName: z.string().trim().min(1).max(150),
  churchAddress: z.string().max(300),
  currency: z.literal("PHP"),
  timezone: z.literal("Asia/Manila"),
  logo: z.union([
    z.literal(""),
    z.url().refine((v) => v.startsWith("https://"), "Use an HTTPS logo URL"),
  ]),
  defaultServiceType: z.literal("SUNDAY_SERVICE").default("SUNDAY_SERVICE"),
});
