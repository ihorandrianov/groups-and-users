import type { Knex } from "knex";
import { notFound } from "../errors";
import type { UserId, GroupId, CreateUser } from "../schemas";

export interface User {
  id: UserId;
  name: string;
  email: string;
  created_at: Date;
}

export interface Group {
  id: GroupId;
  name: string;
  created_at: Date;
}

export function createUsersService(db: Knex) {
  return {
    findAll: () => db("users").select("*").orderBy("id") as Promise<User[]>,

    findById: async (id: UserId) => {
      const user = await db("users").where({ id }).first<User>();
      if (!user) throw notFound(`User ${id}`);
      return user;
    },

    create: async (data: CreateUser) => {
      const [user] = await db("users").insert(data).returning("*");
      return user as User;
    },

    addToGroup: (userId: UserId, groupId: GroupId) =>
      db("user_groups").insert({ user_id: userId, group_id: groupId }).onConflict().ignore(),

    removeFromGroup: (userId: UserId, groupId: GroupId) =>
      db("user_groups").where({ user_id: userId, group_id: groupId }).delete(),

    getGroups: (userId: UserId) =>
      db("groups")
        .join("user_groups", "groups.id", "user_groups.group_id")
        .where("user_groups.user_id", userId)
        .select("groups.*") as Promise<Group[]>,
  };
}

export type UsersService = ReturnType<typeof createUsersService>;
