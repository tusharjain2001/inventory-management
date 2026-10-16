import { transaction } from "@/lib/db";
import { badRequest, handler } from "@/lib/http";
import { audit, diff } from "@/lib/audit";
import { getSettingsGroup, saveSettingsGroup } from "@/lib/settings";
import { SETTINGS_GROUPS, type SettingsGroup } from "@/lib/settings-schema";

const GROUP_LABELS: Record<SettingsGroup, string> = {
  company: "company",
  tax: "tax",
  inventory: "inventory",
  invoice: "invoice",
  numbering: "document numbering",
  general: "general",
  analysis: "stock analysis",
  security: "security",
};

export const GET = handler<{ group: string }>({ permission: ["settings.view", "settings.manage"] }, async ({ params }) => {
  const group = params.group as SettingsGroup;
  if (!SETTINGS_GROUPS.includes(group)) throw badRequest("Unknown settings group");
  return getSettingsGroup(group);
});

/** Replaces one settings group (validated by settingsSchemas[group]). */
export const PUT = handler<{ group: string }>({ permission: "settings.manage" }, async ({ req, user, params, ip }) => {
  const group = params.group as SettingsGroup;
  if (!SETTINGS_GROUPS.includes(group)) throw badRequest("Unknown settings group");
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw badRequest("Request body must be JSON");
  }
  return transaction(async (tx) => {
    const before = await getSettingsGroup(group, tx);
    const saved = await saveSettingsGroup(group, raw, user.id, tx);
    const d = diff(before, saved);
    if (d.changed) {
      await audit(tx, {
        userId: user.id,
        action: "SETTINGS",
        entity: "Settings",
        entityId: group,
        summary: `Changed ${GROUP_LABELS[group]} settings: ${Object.keys(d.after).join(", ")}`,
        before: d.before,
        after: d.after,
        ip,
      });
    }
    return saved;
  });
});
