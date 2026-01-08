import type { preHandlerHookHandler } from "fastify";
import { forbidden } from "../errors";
import { stringToResourceId } from "../schemas";

export const resourceAccessGuard: preHandlerHookHandler = async (req) => {
  const { id } = req.params as { id: string };
  const resourceId = stringToResourceId.parse(id);
  const hasAccess = await req.server.services.access.checkAccess(req.userId, resourceId);
  if (!hasAccess) throw forbidden();
};
