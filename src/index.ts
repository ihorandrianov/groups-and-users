import Fastify from "fastify";
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from "fastify-type-provider-zod";
import { ZodError } from "zod";
import { db } from "./db";
import { createServices, type Services } from "./services";
import { AppError } from "./errors";
import { usersRoutes } from "./routes/users";
import { groupsRoutes } from "./routes/groups";
import { resourcesRoutes } from "./routes/resources";

declare module "fastify" {
  interface FastifyInstance {
    services: Services;
  }
}

const fastify = Fastify({
  logger: true,
}).withTypeProvider<ZodTypeProvider>();

fastify.setValidatorCompiler(validatorCompiler);
fastify.setSerializerCompiler(serializerCompiler);
fastify.decorate("services", createServices(db));

fastify.setErrorHandler((err: Error, req, reply) => {
  req.log.error(err);

  if (err instanceof AppError) {
    return reply.status(err.status).send({ error: err.message });
  }

  if (err instanceof ZodError) {
    return reply.status(400).send({ error: "Validation failed", details: err.issues });
  }

  const status = "statusCode" in err ? (err as any).statusCode : 500;
  reply.status(status).send({ error: err.message || "Something went wrong" });
});


fastify.get("/health", () => ({ status: "ok" }));

fastify.register(usersRoutes);
fastify.register(groupsRoutes);
fastify.register(resourcesRoutes);

const start = async () => {
  try {
    await fastify.listen({ port: 3000, host: "0.0.0.0" });
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
