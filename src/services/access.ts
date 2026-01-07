import type { Knex } from "knex";
import type { UserId, ResourceId } from "../schemas";
import type { User } from "./users";
import type { Resource } from "./resources";

export interface ResourceWithUserCount extends Resource {
  user_count: number;
}

export interface UserWithResourceCount extends User {
  resource_count: number;
}

export function createAccessService(db: Knex) {
  return {
    checkAccess: async (userId: UserId, resourceId: ResourceId): Promise<boolean> => {
      const { rows } = await db.raw(
        `SELECT EXISTS (
          SELECT 1 FROM resource_shares WHERE resource_id = ? AND user_id IS NULL AND group_id IS NULL
          UNION ALL
          SELECT 1 FROM resource_shares WHERE resource_id = ? AND user_id = ?
          UNION ALL
          SELECT 1 FROM resource_shares rs
          JOIN user_groups ug ON ug.group_id = rs.group_id
          WHERE rs.resource_id = ? AND ug.user_id = ?
        ) as has_access`,
        [resourceId, resourceId, userId, resourceId, userId]
      );
      return rows[0].has_access;
    },

    getResourceAccessList: async (resourceId: ResourceId): Promise<User[]> => {
      const { rows } = await db.raw(
        `WITH ids AS (
          SELECT id FROM users WHERE EXISTS (
            SELECT 1 FROM resource_shares WHERE resource_id = ? AND user_id IS NULL AND group_id IS NULL
          )
          UNION
          SELECT user_id FROM resource_shares WHERE resource_id = ? AND user_id IS NOT NULL
          UNION
          SELECT ug.user_id FROM user_groups ug
          WHERE ug.group_id IN (SELECT group_id FROM resource_shares WHERE resource_id = ? AND group_id IS NOT NULL)
        )
        SELECT u.* FROM users u WHERE u.id IN (SELECT id FROM ids) ORDER BY u.id`,
        [resourceId, resourceId, resourceId]
      );
      return rows;
    },

    getUserResources: async (userId: UserId): Promise<Resource[]> => {
      const { rows } = await db.raw(
        `WITH ids AS (
          SELECT resource_id FROM resource_shares WHERE user_id IS NULL AND group_id IS NULL
          UNION
          SELECT resource_id FROM resource_shares WHERE user_id = ?
          UNION
          SELECT resource_id FROM resource_shares
          WHERE group_id IN (SELECT group_id FROM user_groups WHERE user_id = ?)
        )
        SELECT r.* FROM resources r WHERE r.id IN (SELECT resource_id FROM ids) ORDER BY r.id`,
        [userId, userId]
      );
      return rows;
    },

    getResourcesWithUserCount: async (): Promise<ResourceWithUserCount[]> => {
      const { rows } = await db.raw(
        `WITH
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
        ORDER BY r.id`
      );
      return rows;
    },

    getUsersWithResourceCount: async (): Promise<UserWithResourceCount[]> => {
      const { rows } = await db.raw(
        `WITH
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
        ORDER BY u.id`
      );
      return rows;
    },
  };
}

export type AccessService = ReturnType<typeof createAccessService>;
