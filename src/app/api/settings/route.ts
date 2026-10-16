import { handler } from "@/lib/http";
import { getSettings } from "@/lib/settings";

/** Every settings group (defaults filled in). */
export const GET = handler({ permission: ["settings.view", "settings.manage"] }, async () => getSettings());
