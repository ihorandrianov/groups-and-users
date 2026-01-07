import type { Knex } from "knex";
import { createAccessService, type AccessService } from "./access";
import { createUsersService, type UsersService } from "./users";
import { createGroupsService, type GroupsService } from "./groups";
import { createResourcesService, type ResourcesService } from "./resources";

export interface Services {
  access: AccessService;
  users: UsersService;
  groups: GroupsService;
  resources: ResourcesService;
}

export function createServices(db: Knex): Services {
  return {
    access: createAccessService(db),
    users: createUsersService(db),
    groups: createGroupsService(db),
    resources: createResourcesService(db),
  };
}
