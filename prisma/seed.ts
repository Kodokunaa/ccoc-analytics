import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";
const db = new PrismaClient();
async function main() {
  const email = process.env.ADMIN_EMAIL,
    password = process.env.ADMIN_PASSWORD;
  if (!email || !password || password.length < 12)
    throw new Error(
      "Set ADMIN_EMAIL and ADMIN_PASSWORD (at least 12 characters) before seeding",
    );
  for (const name of ["SUPER_ADMIN", "ENCODER", "VIEWER"])
    await db.role.upsert({ where: { name }, create: { name }, update: {} });
  const role = await db.role.findUniqueOrThrow({
    where: { name: "SUPER_ADMIN" },
  });
  const admin = await db.user.upsert({
    where: { email },
    create: {
      name: "Church Administrator",
      email,
      passwordHash: await hash(password, 12),
      roleId: role.id,
    },
    update: {},
  });
  for (const [key, value] of Object.entries({
    churchName: "City Church of Christ",
    churchAddress: "",
    currency: "PHP",
    timezone: "Asia/Manila",
    logo: "",
    defaultServiceType: "SUNDAY_SERVICE",
  }))
    await db.appSetting.upsert({
      where: { key },
      create: { key, value },
      update: {},
    });
  if (process.env.SEED_SAMPLE_DATA === "false") {
    console.log(
      "Roles, admin, and church settings seeded. Sample records skipped.",
    );
    return;
  }
  const examples = [
    {
      year: 2025,
      days: [5, 12, 19, 26],
      attendance: [53, 47, 50, 50],
      giving: [2860, 2748, 3505, 7165],
    },
    {
      year: 2026,
      days: [4, 11, 18, 25],
      attendance: [41, 52, 67, 63],
      giving: [4320, 2190, 2765, 4200],
    },
  ];
  for (const example of examples)
    for (let i = 0; i < 4; i++) {
      const id = `sample-${example.year}-${i + 1}`;
      await db.service.upsert({
        where: { id },
        create: {
          id,
          serviceDate: new Date(Date.UTC(example.year, 0, example.days[i])),
          serviceName: "Sunday Worship",
          serviceType: "SUNDAY_SERVICE",
          createdBy: admin.id,
          notes: "Development sample from supplied requirements",
          attendance: {
            create: {
              totalAttendance: example.attendance[i],
              createdBy: admin.id,
            },
          },
          giving: {
            create: {
              amount: example.giving[i],
              createdBy: admin.id,
            },
          },
        },
        update: {},
      });
    }
  console.log(
    "Seed complete: City Church of Christ; 8 sample services. Existing data preserved.",
  );
}
main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
