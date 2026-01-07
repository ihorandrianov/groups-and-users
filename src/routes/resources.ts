import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { CreateResourceSchema, CreateShareSchema, stringToResourceId } from "../schemas";
import { authMiddleware } from "../middleware/auth";
import { resourceAccessGuard } from "../middleware/access-guard";

const IdParam = z.object({ id: stringToResourceId });

export async function resourcesRoutes(fastify: FastifyInstance) {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  const { resources, access } = app.services;

  app.get("/resources", () => resources.findAll());

  app.get("/resources/with-user-count", () => access.getResourcesWithUserCount());

  app.get("/resources/:id", {
    schema: { params: IdParam },
    preHandler: [authMiddleware, resourceAccessGuard],
  }, (req) => {
    return resources.findById(req.params.id);
  });

  app.post("/resources", {
    schema: { body: CreateResourceSchema },
    preHandler: [authMiddleware],
  }, async (req, reply) => {
    const resource = await resources.create(req.body, req.userId);
    return reply.status(201).send(resource);
  });

  app.get("/resources/:id/access-list", {
    schema: { params: IdParam },
    preHandler: [authMiddleware, resourceAccessGuard],
  }, (req) => {
    return access.getResourceAccessList(req.params.id);
  });

  app.get("/resources/:id/shares", {
    schema: { params: IdParam },
    preHandler: [authMiddleware, resourceAccessGuard],
  }, (req) => {
    return resources.getShares(req.params.id);
  });

  app.post("/resources/:id/shares", {
    schema: { params: IdParam, body: CreateShareSchema },
    preHandler: [authMiddleware, resourceAccessGuard],
  }, async (req, reply) => {
    await resources.share(req.params.id, req.body.share_type, req.body.target_id);
    return reply.status(204).send();
  });
}
