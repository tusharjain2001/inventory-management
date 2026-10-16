import { db, type DbOrTx } from "@/lib/db";
import { DEFAULT_SETTINGS, SETTINGS_GROUPS, settingsSchemas, type Settings, type SettingsGroup } from "@/lib/settings-schema";

/** Loads every settings group, filling gaps with defaults (also for keys added in later versions). */
export async function getSettings(client: DbOrTx = db): Promise<Settings> {
  const rows = await client.setting.findMany();
  const byKey = new Map(rows.map((r) => [r.key, r.value]));
  const out = {} as Record<SettingsGroup, unknown>;
  for (const group of SETTINGS_GROUPS) {
    const stored = byKey.get(group);
    const merged = mergeDeep(DEFAULT_SETTINGS[group], stored);
    const parsed = settingsSchemas[group].safeParse(merged);
    out[group] = parsed.success ? parsed.data : DEFAULT_SETTINGS[group];
  }
  return out as Settings;
}

export async function getSettingsGroup<K extends SettingsGroup>(group: K, client: DbOrTx = db): Promise<Settings[K]> {
  const row = await client.setting.findUnique({ where: { key: group } });
  const merged = mergeDeep(DEFAULT_SETTINGS[group], row?.value);
  const parsed = settingsSchemas[group].safeParse(merged);
  return (parsed.success ? parsed.data : DEFAULT_SETTINGS[group]) as Settings[K];
}

export async function saveSettingsGroup<K extends SettingsGroup>(
  group: K,
  value: unknown,
  userId: number | null,
  client: DbOrTx = db,
): Promise<Settings[K]> {
  const parsed = settingsSchemas[group].parse(value) as Settings[K];
  await client.setting.upsert({
    where: { key: group },
    create: { key: group, value: parsed as object, updatedById: userId },
    update: { value: parsed as object, updatedById: userId },
  });
  return parsed;
}

function mergeDeep(base: unknown, override: unknown): unknown {
  if (override === undefined || override === null) return base;
  if (Array.isArray(base) || Array.isArray(override)) return override;
  if (typeof base === "object" && base && typeof override === "object") {
    const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
    for (const [k, v] of Object.entries(override as Record<string, unknown>)) {
      out[k] = mergeDeep((base as Record<string, unknown>)[k], v);
    }
    return out;
  }
  return override;
}
