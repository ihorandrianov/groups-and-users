import type { Knex } from "knex";
import { notFound } from "../errors";
import type { ResourceId, UserId, GroupId, CreateResource, ShareType } from "../schemas";

export interface Resource {
  id: ResourceId;
  name: string;
  description: string | null;
  created_at: Date;
}

export interface ResourceShare {
  id: number;
  resource_id: ResourceId;
  share_type: ShareType;
  user_id: UserId | null;
  group_id: GroupId | null;
  created_at: Date;
}

export function createResourcesService(db: Knex) {
  return {
    findAll: () => db("resources").select("*").orderBy("id") as Promise<Resource[]>,

    findById: async (id: ResourceId) => {
      const resource = await db("resources").where({ id }).first<Resource>();
      if (!resource) throw notFound(`Resource ${id}`);
      return resource;
    },

    create: async (data: CreateResource, creatorId?: UserId) => {
      return db.transaction(async (trx) => {
        const [resource] = await trx("resources").insert(data).returning("*");
        if (creatorId) {
          await trx("resource_shares").insert({
            resource_id: resource.id,
            share_type: "user",
            user_id: creatorId,
            group_id: null,
          });
        }
        return resource as Resource;
      });
    },

    share: async (resourceId: ResourceId, shareType: ShareType, targetId?: number) => {
      await db("resource_shares")
        .insert({
          resource_id: resourceId,
          share_type: shareType,
          user_id: shareType === "user" ? targetId : null,
          group_id: shareType === "group" ? targetId : null,
        })
        .onConflict()
        .ignore();
    },

    getShares: (resourceId: ResourceId) =>
      db("resource_shares").where({ resource_id: resourceId }) as Promise<ResourceShare[]>,
  };
}

export type ResourcesService = ReturnType<typeof createResourcesService>;
