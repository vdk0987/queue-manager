import { BarChart3, LayoutDashboard, ListOrdered, type LucideIcon } from "lucide-react";

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
}

export const navItems: NavItem[] = [
  { to: "/", label: "Overview", icon: LayoutDashboard, end: true },
  { to: "/queues", label: "Queues", icon: ListOrdered },
  { to: "/analytics", label: "Analytics", icon: BarChart3 },
];

export function getPageTitle(pathname: string): string {
  const item = navItems.find((navItem) =>
    navItem.end ? pathname === navItem.to : pathname.startsWith(navItem.to),
  );

  return item?.label ?? "Not found";
}
