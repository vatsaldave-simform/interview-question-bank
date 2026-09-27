import { setPasswordRequestSchema } from "@iqb/shared";
import { z } from "zod";

/** Typed twice because the Viewer cannot see it, and a typo would send them back to ask
 * for another link. */
export const setPasswordFormSchema = z
  .object({ password: setPasswordRequestSchema.shape.password, repeated: z.string() })
  .refine((form) => form.password === form.repeated, { path: ["repeated"] });
export type SetPasswordForm = z.infer<typeof setPasswordFormSchema>;

/** Anything else in the address is dropped rather than refused, so a mangled address
 * still opens the login screen. */
export const loginSearchSchema = z.object({
  password: z.literal("set").optional().catch(undefined),
});
