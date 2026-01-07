import type { preHandlerHookHandler } from "fastify";
import { forbidden } from "../errors";
import { parseResourceId } from "../schemas";

export const resourceAccessGuard: preHandlerHookHandler = async (req) => {
  const { id } = req.params as { id: string };
  const resourceId = parseResourceId(id);
  const hasAccess = await req.server.services.access.checkAccess(req.userId, resourceId);
  if (!hasAccess) throw forbidden();
};
