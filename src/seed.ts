import { db } from "./db";

const USERS = 100_000;
const GROUPS = 500;
const RESOURCES = 10_000;
const USERS_PER_GROUP = 200;
const SHARES_PER_RESOURCE = 10;

const BATCH = 5000;

async function seedUsers() {
  console.log("  Users...");
  const chunks = Math.ceil(USERS / BATCH);

  for (let c = 0; c < chunks; c++) {
    const offset = c * BATCH;
    const size = Math.min(BATCH, USERS - offset);
    const rows = Array.from({ length: size }, (_, i) => ({
      name: `User ${offset + i}`,
      email: `user${offset + i}@test.com`,
    }));
    await db("users").insert(rows);
    if ((c + 1) % 20 === 0) console.log(`    ${((c + 1) * BATCH).toLocaleString()}`);
  }
}

async function seedGroups() {
  console.log("Groups");
  const rows = Array.from({ length: GROUPS }, (_, i) => ({ name: `Group ${i}` }));
  for (let i = 0; i < rows.length; i += BATCH) {
    await db("groups").insert(rows.slice(i, i + BATCH));
  }
}

async function seedUserGroups() {
  console.log("User-Groups");

  for (let g = 1; g <= GROUPS; g += 50) {
    const rows: { user_id: number; group_id: number }[] = [];

    for (let gOff = 0; gOff < 50 && g + gOff <= GROUPS; gOff++) {
      const gid = g + gOff;
      const start = ((gid - 1) * USERS_PER_GROUP) % USERS + 1;
      for (let i = 0; i < USERS_PER_GROUP; i++) {
        rows.push({ user_id: ((start + i - 1) % USERS) + 1, group_id: gid });
      }
    }

    for (let i = 0; i < rows.length; i += BATCH) {
      await db("user_groups").insert(rows.slice(i, i + BATCH));
    }
  }
}

async function seedResources() {
  console.log("Resources");

  for (let offset = 0; offset < RESOURCES; offset += BATCH) {
    const size = Math.min(BATCH, RESOURCES - offset);
    const rows = Array.from({ length: size }, (_, i) => ({
      name: `Resource ${offset + i}`,
      description: `Desc ${offset + i}`,
    }));
    await db("resources").insert(rows);
  }
}

async function seedShares() {
  console.log("Shares");

  for (let r = 1; r <= RESOURCES; r += 500) {
    const rows: { resource_id: number; share_type: string; user_id: number | null; group_id: number | null }[] = [];

    for (let rOff = 0; rOff < 500 && r + rOff <= RESOURCES; rOff++) {
      const rid = r + rOff;
      if (rid % 500 === 0) {
        rows.push({ resource_id: rid, share_type: "everyone", user_id: null, group_id: null });
      } else {
        for (let i = 0; i < SHARES_PER_RESOURCE; i++) {
          if (i % 2 === 0) {
            rows.push({ resource_id: rid, share_type: "user", user_id: (rid + i) % USERS + 1, group_id: null });
          } else {
            rows.push({ resource_id: rid, share_type: "group", user_id: null, group_id: (rid + i) % GROUPS + 1 });
          }
        }
      }
    }

    for (let i = 0; i < rows.length; i += BATCH) {
      await db("resource_shares").insert(rows.slice(i, i + BATCH));
    }
  }
}

async function main() {
  console.log("Seeding\n");
  const start = performance.now();

  await db.raw("TRUNCATE users, groups, resources, user_groups, resource_shares RESTART IDENTITY CASCADE");

  await Promise.all([
    seedUsers(),
    seedGroups(),
    seedResources(),
  ]);

  await seedUserGroups();
  await seedShares();

  const sec = ((performance.now() - start) / 1000).toFixed(1);

  console.log(`\nDone in ${sec}s`);
  console.log(`  ${USERS.toLocaleString()} users`);
  console.log(`  ${GROUPS.toLocaleString()} groups`);
  console.log(`  ${RESOURCES.toLocaleString()} resources`);
  console.log(`  ${(GROUPS * USERS_PER_GROUP).toLocaleString()} user_groups`);
  console.log(`  ~${(RESOURCES * SHARES_PER_RESOURCE).toLocaleString()} shares`);

  await db.destroy();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
