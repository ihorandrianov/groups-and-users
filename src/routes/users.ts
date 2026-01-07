import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { CreateUserSchema, stringToUserId, stringToGroupId } from "../schemas";

const IdParam = z.object({ id: stringToUserId });
const UserGroupParams = z.object({ id: stringToUserId, groupId: stringToGroupId });

export async function usersRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  const { users, access } = app.services;

  app.get("/users", () => users.findAll());

  app.get("/users/with-resource-count", () => access.getUsersWithResourceCount());

  app.get("/users/:id", {
    schema: { params: IdParam },
  }, (req) => {
    return users.findById(req.params.id);
  });

  app.post("/users", {
    schema: { body: CreateUserSchema },
  }, async (req, reply) => {
    const user = await users.create(req.body);
    return reply.status(201).send(user);
  });

  app.get("/users/:id/resources", {
    schema: { params: IdParam },
  }, (req) => {
    return access.getUserResources(req.params.id);
  });

  app.get("/users/:id/groups", {
    schema: { params: IdParam },
  }, (req) => {
    return users.getGroups(req.params.id);
  });

  app.post("/users/:id/groups/:groupId", {
    schema: { params: UserGroupParams },
  }, async (req, reply) => {
    await users.addToGroup(req.params.id, req.params.groupId);
    return reply.status(204).send();
  });

  app.delete("/users/:id/groups/:groupId", {
    schema: { params: UserGroupParams },
  }, async (req, reply) => {
    await users.removeFromGroup(req.params.id, req.params.groupId);
    return reply.status(204).send();
  });
}
