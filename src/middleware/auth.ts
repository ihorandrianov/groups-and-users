import type { preHandlerHookHandler } from "fastify";
import { unauthorized } from "../errors";
import { parseUserId, type UserId } from "../schemas";

declare module "fastify" {
  interface FastifyRequest {
    userId: UserId;
  }
}

export const authMiddleware: preHandlerHookHandler = async (req) => {
  const header = req.headers["x-user-id"];
  if (!header || Array.isArray(header)) throw unauthorized();
  req.userId = parseUserId(header);
};
