export type SettingsTab = "config" | "mcp" | "skills" | "plugins" | "motion";
export type SettingsNavIcon = "settings" | "plug" | "sparkles" | "puzzle" | "motion";

export interface SettingsNavItem {
  id: SettingsTab;
  label: string;
  icon: SettingsNavIcon;
}

export interface SettingsNavGroup {
  label: string;
  items: SettingsNavItem[];
}

export function buildSettingsNavGroups(
  isDev: boolean,
  labels: {
    connection: string;
    extensions: string;
    developer: string;
    provider: string;
    mcp: string;
    skills: string;
    plugins: string;
    motion: string;
  },
): SettingsNavGroup[] {
  const groups: SettingsNavGroup[] = [
    {
      label: labels.connection,
      items: [
        { id: "config", label: labels.provider, icon: "settings" },
      ],
    },
    {
      label: labels.extensions,
      items: [
        { id: "mcp", label: labels.mcp, icon: "plug" },
        { id: "skills", label: labels.skills, icon: "sparkles" },
        { id: "plugins", label: labels.plugins, icon: "puzzle" },
      ],
    },
  ];

  if (isDev) {
    groups.push({
      label: labels.developer,
      items: [
        { id: "motion", label: labels.motion, icon: "motion" },
      ],
    });
  }

  return groups;
}
