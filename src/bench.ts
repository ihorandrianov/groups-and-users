import { db } from "./db";

async function bench(name: string, fn: () => Promise<any>, runs = 5) {
  const times: number[] = [];
  let result: any;

  for (let i = 0; i < runs; i++) {
    const start = performance.now();
    result = await fn();
    times.push(performance.now() - start);
  }

  const avg = times.reduce((a, b) => a + b) / times.length;
  const min = Math.min(...times);
  const max = Math.max(...times);
  const rows = result?.rows?.length ?? result?.length ?? 1;

  console.log(`${name}`);
  console.log(`  ${avg.toFixed(1)}ms avg | ${min.toFixed(1)}ms min | ${max.toFixed(1)}ms max | ${rows} rows\n`);
}

async function explain(name: string, sql: string, params: any[] = []) {
  console.log(`${name}`);
  const { rows } = await db.raw(`EXPLAIN ANALYZE ${sql}`, params);
  console.log(rows.map((r: any) => r["QUERY PLAN"]).join("\n") + "\n");
}

const Q = {
  checkAccess_original: `
    SELECT EXISTS (
      SELECT 1 FROM resource_shares
      WHERE resource_id = ? AND (
        (user_id IS NULL AND group_id IS NULL)
        OR user_id = ?
        OR group_id IN (SELECT group_id FROM user_groups WHERE user_id = ?)
      )
    ) as has_access
  `,

  checkAccess_union: `
    SELECT EXISTS (
      SELECT 1 FROM resource_shares WHERE resource_id = ? AND user_id IS NULL AND group_id IS NULL
      UNION ALL
      SELECT 1 FROM resource_shares WHERE resource_id = ? AND user_id = ?
      UNION ALL
      SELECT 1 FROM resource_shares rs
      JOIN user_groups ug ON ug.group_id = rs.group_id
      WHERE rs.resource_id = ? AND ug.user_id = ?
    ) as has_access
  `,

  checkAccess_coalesce: `
    SELECT COALESCE(
      (SELECT true FROM resource_shares WHERE resource_id = ? AND user_id IS NULL AND group_id IS NULL LIMIT 1),
      (SELECT true FROM resource_shares WHERE resource_id = ? AND user_id = ? LIMIT 1),
      (SELECT true FROM resource_shares rs JOIN user_groups ug ON ug.group_id = rs.group_id WHERE rs.resource_id = ? AND ug.user_id = ? LIMIT 1),
      false
    ) as has_access
  `,

  checkAccess_count: `
    SELECT (
      SELECT COUNT(*) FROM resource_shares WHERE resource_id = ? AND user_id IS NULL AND group_id IS NULL
    ) + (
      SELECT COUNT(*) FROM resource_shares WHERE resource_id = ? AND user_id = ?
    ) + (
      SELECT COUNT(*) FROM resource_shares rs JOIN user_groups ug ON ug.group_id = rs.group_id WHERE rs.resource_id = ? AND ug.user_id = ?
    ) > 0 as has_access
  `,

  accessList_original: `
    SELECT DISTINCT u.* FROM users u
    WHERE EXISTS (SELECT 1 FROM resource_shares rs WHERE rs.resource_id = ? AND rs.user_id IS NULL AND rs.group_id IS NULL)
    OR u.id IN (SELECT user_id FROM resource_shares WHERE resource_id = ? AND user_id IS NOT NULL)
    OR u.id IN (SELECT ug.user_id FROM user_groups ug WHERE ug.group_id IN (SELECT group_id FROM resource_shares WHERE resource_id = ? AND group_id IS NOT NULL))
    ORDER BY u.id
  `,

  accessList_union: `
    SELECT * FROM (
      SELECT u.* FROM users u WHERE EXISTS (SELECT 1 FROM resource_shares WHERE resource_id = ? AND user_id IS NULL AND group_id IS NULL)
      UNION
      SELECT u.* FROM users u JOIN resource_shares rs ON rs.user_id = u.id WHERE rs.resource_id = ?
      UNION
      SELECT u.* FROM users u JOIN user_groups ug ON ug.user_id = u.id JOIN resource_shares rs ON rs.group_id = ug.group_id WHERE rs.resource_id = ?
    ) t ORDER BY id
  `,

  accessList_cte: `
    WITH ids AS (
      SELECT u.id FROM users u WHERE EXISTS (SELECT 1 FROM resource_shares WHERE resource_id = ? AND user_id IS NULL AND group_id IS NULL)
      UNION
      SELECT user_id FROM resource_shares WHERE resource_id = ? AND user_id IS NOT NULL
      UNION
      SELECT ug.user_id FROM user_groups ug WHERE ug.group_id IN (SELECT group_id FROM resource_shares WHERE resource_id = ? AND group_id IS NOT NULL)
    )
    SELECT u.* FROM users u WHERE u.id IN (SELECT id FROM ids) ORDER BY u.id
  `,

  accessList_lateral: `
    SELECT DISTINCT u.* FROM resource_shares rs
    CROSS JOIN LATERAL (
      SELECT * FROM users WHERE (rs.user_id IS NULL AND rs.group_id IS NULL) OR id = rs.user_id OR id IN (SELECT user_id FROM user_groups WHERE group_id = rs.group_id)
    ) u
    WHERE rs.resource_id = ?
    ORDER BY u.id
  `,

  userResources: `
    SELECT DISTINCT r.* FROM resources r
    WHERE r.id IN (
      SELECT resource_id FROM resource_shares WHERE user_id IS NULL AND group_id IS NULL
      UNION
      SELECT resource_id FROM resource_shares WHERE user_id = ?
      UNION
      SELECT resource_id FROM resource_shares WHERE group_id IN (SELECT group_id FROM user_groups WHERE user_id = ?)
    )
    ORDER BY r.id
  `,

  resourcesWithUserCount_original: `
    SELECT r.*,
      CASE WHEN EXISTS (SELECT 1 FROM resource_shares WHERE resource_id = r.id AND user_id IS NULL AND group_id IS NULL)
        THEN (SELECT COUNT(*) FROM users)
        ELSE (
          SELECT COUNT(DISTINCT u.id) FROM users u
          WHERE u.id IN (SELECT user_id FROM resource_shares WHERE resource_id = r.id AND user_id IS NOT NULL)
          OR u.id IN (SELECT ug.user_id FROM user_groups ug WHERE ug.group_id IN (SELECT group_id FROM resource_shares WHERE resource_id = r.id AND group_id IS NOT NULL))
        )
      END as user_count
    FROM resources r ORDER BY r.id
  `,

  resourcesWithUserCount_split: `
    WITH
      total_users AS (SELECT COUNT(*) as cnt FROM users),
      global_resources AS (
        SELECT DISTINCT resource_id FROM resource_shares
        WHERE user_id IS NULL AND group_id IS NULL
      ),
      user_shares AS (
        SELECT resource_id, COUNT(DISTINCT user_id) as cnt
        FROM resource_shares WHERE user_id IS NOT NULL
        GROUP BY resource_id
      ),
      group_shares AS (
        SELECT rs.resource_id, COUNT(DISTINCT ug.user_id) as cnt
        FROM resource_shares rs
        JOIN user_groups ug ON ug.group_id = rs.group_id
        GROUP BY rs.resource_id
      )
    SELECT r.*,
      CASE WHEN gr.resource_id IS NOT NULL
        THEN (SELECT cnt FROM total_users)
        ELSE COALESCE(us.cnt, 0) + COALESCE(gs.cnt, 0)
      END as user_count
    FROM resources r
    LEFT JOIN global_resources gr ON gr.resource_id = r.id
    LEFT JOIN user_shares us ON us.resource_id = r.id
    LEFT JOIN group_shares gs ON gs.resource_id = r.id
    ORDER BY r.id
  `,

  resourcesWithUserCount_union: `
    WITH
      total_users AS (SELECT COUNT(*) as cnt FROM users),
      global_resources AS (
        SELECT DISTINCT resource_id FROM resource_shares
        WHERE user_id IS NULL AND group_id IS NULL
      ),
      per_resource_users AS (
        SELECT resource_id, user_id FROM resource_shares WHERE user_id IS NOT NULL
        UNION
        SELECT rs.resource_id, ug.user_id
        FROM resource_shares rs
        JOIN user_groups ug ON ug.group_id = rs.group_id
      ),
      user_counts AS (
        SELECT resource_id, COUNT(*) as cnt FROM per_resource_users GROUP BY resource_id
      )
    SELECT r.*,
      CASE WHEN gr.resource_id IS NOT NULL
        THEN (SELECT cnt FROM total_users)
        ELSE COALESCE(uc.cnt, 0)
      END as user_count
    FROM resources r
    LEFT JOIN global_resources gr ON gr.resource_id = r.id
    LEFT JOIN user_counts uc ON uc.resource_id = r.id
    ORDER BY r.id
  `,

  usersWithCount_original: `
    SELECT u.*, (
      SELECT COUNT(DISTINCT rs.resource_id) FROM resource_shares rs
      WHERE (rs.user_id IS NULL AND rs.group_id IS NULL) OR rs.user_id = u.id OR rs.group_id IN (SELECT group_id FROM user_groups WHERE user_id = u.id)
    ) as resource_count
    FROM users u ORDER BY u.id
  `,

  usersWithCount_split: `
    WITH
      global_cnt AS (SELECT COUNT(*) as cnt FROM resource_shares WHERE user_id IS NULL AND group_id IS NULL),
      user_direct AS (SELECT user_id, COUNT(DISTINCT resource_id) as cnt FROM resource_shares WHERE user_id IS NOT NULL GROUP BY user_id),
      user_group AS (SELECT ug.user_id, COUNT(DISTINCT rs.resource_id) as cnt FROM resource_shares rs JOIN user_groups ug ON ug.group_id = rs.group_id GROUP BY ug.user_id)
    SELECT u.*, (SELECT cnt FROM global_cnt) + COALESCE(ud.cnt, 0) + COALESCE(ugr.cnt, 0) as resource_count
    FROM users u
    LEFT JOIN user_direct ud ON ud.user_id = u.id
    LEFT JOIN user_group ugr ON ugr.user_id = u.id
    ORDER BY u.id
  `,

  usersWithCount_union: `
    WITH
      global_resources AS (
        SELECT resource_id FROM resource_shares
        WHERE user_id IS NULL AND group_id IS NULL
      ),
      per_user_resources AS (
        SELECT user_id, resource_id FROM resource_shares WHERE user_id IS NOT NULL
        UNION
        SELECT ug.user_id, rs.resource_id
        FROM resource_shares rs
        JOIN user_groups ug ON ug.group_id = rs.group_id
      ),
      resource_counts AS (
        SELECT user_id, COUNT(*) as cnt FROM per_user_resources GROUP BY user_id
      ),
      global_cnt AS (SELECT COUNT(*) as cnt FROM global_resources)
    SELECT u.*,
      (SELECT cnt FROM global_cnt) + COALESCE(rc.cnt, 0) as resource_count
    FROM users u
    LEFT JOIN resource_counts rc ON rc.user_id = u.id
    ORDER BY u.id
  `,

  usersWithCount_union_full: `
    WITH
      global_resources AS (
        SELECT resource_id FROM resource_shares
        WHERE user_id IS NULL AND group_id IS NULL
      ),
      user_specific_resources AS (
        SELECT user_id, resource_id FROM resource_shares WHERE user_id IS NOT NULL
        UNION
        SELECT ug.user_id, rs.resource_id
        FROM resource_shares rs
        JOIN user_groups ug ON ug.group_id = rs.group_id
      ),
      all_user_resources AS (
        SELECT usr.user_id, usr.resource_id FROM user_specific_resources usr
        UNION
        SELECT u.id as user_id, gr.resource_id
        FROM users u
        CROSS JOIN global_resources gr
      ),
      resource_counts AS (
        SELECT user_id, COUNT(*) as cnt FROM all_user_resources GROUP BY user_id
      )
    SELECT u.*, COALESCE(rc.cnt, 0) as resource_count
    FROM users u
    LEFT JOIN resource_counts rc ON rc.user_id = u.id
    ORDER BY u.id
  `,
};

async function main() {
  console.log("--- Benchmarks ---\n");

  console.log("-- checkAccess variants (hit) --\n");
  await bench("checkAccess: original", () => db.raw(Q.checkAccess_original, [1, 1, 1]));
  await bench("checkAccess: union", () => db.raw(Q.checkAccess_union, [1, 1, 1, 1, 1]));
  await bench("checkAccess: coalesce", () => db.raw(Q.checkAccess_coalesce, [1, 1, 1, 1, 1]));
  await bench("checkAccess: count", () => db.raw(Q.checkAccess_count, [1, 1, 1, 1, 1]));

  console.log("-- checkAccess variants (miss) --\n");
  await bench("checkAccess: original", () => db.raw(Q.checkAccess_original, [2, 999999, 999999]));
  await bench("checkAccess: union", () => db.raw(Q.checkAccess_union, [2, 999999, 999999, 2, 999999]));
  await bench("checkAccess: coalesce", () => db.raw(Q.checkAccess_coalesce, [2, 999999, 999999, 2, 999999]));
  await bench("checkAccess: count", () => db.raw(Q.checkAccess_count, [2, 999999, 999999, 2, 999999]));

  console.log("-- accessList variants --\n");
  await bench("accessList: original", () => db.raw(Q.accessList_original, [1, 1, 1]));
  await bench("accessList: union", () => db.raw(Q.accessList_union, [1, 1, 1]));
  await bench("accessList: cte", () => db.raw(Q.accessList_cte, [1, 1, 1]));

  console.log("-- other --\n");
  await bench("userResources", () => db.raw(Q.userResources, [1, 1]));

  console.log("-- resourcesWithUserCount variants (LIMIT 100) --\n");
  await bench("resourcesWithUserCount: original", () => db.raw(Q.resourcesWithUserCount_original + " LIMIT 100"));
  await bench("resourcesWithUserCount: split", () => db.raw(Q.resourcesWithUserCount_split + " LIMIT 100"));
  await bench("resourcesWithUserCount: union", () => db.raw(Q.resourcesWithUserCount_union + " LIMIT 100"));

  console.log("-- usersWithCount variants (LIMIT 1000) --\n");
  await bench("usersWithCount: original", () => db.raw(Q.usersWithCount_original + " LIMIT 1000"));
  await bench("usersWithCount: split (has double-count bug)", () => db.raw(Q.usersWithCount_split + " LIMIT 1000"));
  await bench("usersWithCount: union (dedupes direct+group)", () => db.raw(Q.usersWithCount_union + " LIMIT 1000"));
  await bench("usersWithCount: union_full (dedupes all)", () => db.raw(Q.usersWithCount_union_full + " LIMIT 1000"));

  console.log("--- Query Plans ---\n");
  await explain("checkAccess: union", Q.checkAccess_union, [1, 1, 1, 1, 1]);
  await explain("resourcesWithUserCount: union (correct)", Q.resourcesWithUserCount_union + " LIMIT 100", []);
  await explain("usersWithCount: union (dedupes direct+group)", Q.usersWithCount_union + " LIMIT 1000", []);
  await explain("usersWithCount: union_full (dedupes all)", Q.usersWithCount_union_full + " LIMIT 1000", []);

  await db.destroy();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
