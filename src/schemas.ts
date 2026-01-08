import { z } from "zod";

export const UserId = z.number().int().positive().brand<"UserId">();
export const GroupId = z.number().int().positive().brand<"GroupId">();
export const ResourceId = z.number().int().positive().brand<"ResourceId">();

export type UserId = z.infer<typeof UserId>;
export type GroupId = z.infer<typeof GroupId>;
export type ResourceId = z.infer<typeof ResourceId>;

export const stringToUserId = z.string().min(1).transform((val, ctx) => {
  const parsed = UserId.safeParse(parseInt(val, 10));
  if (!parsed.success) {
    ctx.addIssue({ code: "custom", message: "Invalid user ID" });
    return z.NEVER;
  }
  return parsed.data;
});

export const stringToGroupId = z.string().min(1).transform((val, ctx) => {
  const parsed = GroupId.safeParse(parseInt(val, 10));
  if (!parsed.success) {
    ctx.addIssue({ code: "custom", message: "Invalid group ID" });
    return z.NEVER;
  }
  return parsed.data;
});

export const stringToResourceId = z.string().min(1).transform((val, ctx) => {
  const parsed = ResourceId.safeParse(parseInt(val, 10));
  if (!parsed.success) {
    ctx.addIssue({ code: "custom", message: "Invalid resource ID" });
    return z.NEVER;
  }
  return parsed.data;
});

export const CreateUserSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.email(),
});

export const CreateGroupSchema = z.object({
  name: z.string().min(1, "Name is required"),
});

export const CreateResourceSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
});

export const ShareTypeSchema = z.enum(["user", "group", "everyone"]);
export type ShareType = z.infer<typeof ShareTypeSchema>;

export const CreateShareSchema = z
  .object({
    share_type: ShareTypeSchema,
    target_id: z.number().int().positive().optional(),
  })
  .refine(
    (data) => data.share_type === "everyone" || data.target_id !== undefined,
    { message: "target_id is required for user/group shares" }
  );

export type CreateUser = z.infer<typeof CreateUserSchema>;
export type CreateGroup = z.infer<typeof CreateGroupSchema>;
export type CreateResource = z.infer<typeof CreateResourceSchema>;
export type CreateShare = z.infer<typeof CreateShareSchema>;


