import type { Knex } from "knex";
import { notFound } from "../errors";
import type { GroupId, CreateGroup } from "../schemas";
import type { User, Group } from "./users";

export function createGroupsService(db: Knex) {
  return {
    findAll: () => db("groups").select("*").orderBy("id") as Promise<Group[]>,

    findById: async (id: GroupId) => {
      const group = await db("groups").where({ id }).first<Group>();
      if (!group) throw notFound(`Group ${id}`);
      return group;
    },

    create: async (data: CreateGroup) => {
      const [group] = await db("groups").insert(data).returning("*");
      return group as Group;
    },

    getMembers: (groupId: GroupId) =>
      db("users")
        .join("user_groups", "users.id", "user_groups.user_id")
        .where("user_groups.group_id", groupId)
        .select("users.*") as Promise<User[]>,
  };
}

export type GroupsService = ReturnType<typeof createGroupsService>;
