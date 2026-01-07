import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { CreateGroupSchema, stringToGroupId } from "../schemas";

const IdParam = z.object({ id: stringToGroupId });

export async function groupsRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  const { groups } = app.services;

  app.get("/groups", () => groups.findAll());

  app.get("/groups/:id", {
    schema: { params: IdParam },
  }, (req) => {
    return groups.findById(req.params.id);
  });

  app.post("/groups", {
    schema: { body: CreateGroupSchema },
  }, async (req, reply) => {
    const group = await groups.create(req.body);
    return reply.status(201).send(group);
  });

  app.get("/groups/:id/members", {
    schema: { params: IdParam },
  }, (req) => {
    return groups.getMembers(req.params.id);
  });
}
