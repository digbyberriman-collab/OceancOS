import {
  LayoutDashboard,
  FileDiff,
  Users,
  CheckSquare,
  CalendarRange,
  Wallet,
  Truck,
  Boxes,
  Ruler,
  FileText,
  Presentation,
  ShieldAlert,
  Building2,
  Factory,
  Bell,
  Search,
  Settings,
  Ship,
  ReceiptText,
  type LucideIcon,
} from "lucide-react";

export type NavItem = { label: string; href: string; section?: string; icon: LucideIcon };

/**
 * The single list of app destinations, shared by the desktop Sidebar and the
 * mobile drawer (MobileNav) so the two never drift apart the way the
 * crew-request transition table used to before G2.4 moved it into
 * lib/workflow/crewRequest.ts.
 */
export const NAV: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Quotes & requests", href: "/jobs", icon: ReceiptText },
  { label: "Change orders", href: "/change-orders", icon: FileDiff },
  { label: "Crew requests", href: "/crew-requests", icon: Users },
  { label: "Approvals", href: "/approvals", icon: CheckSquare },
  { section: "Project", label: "Schedule", href: "/schedule", icon: CalendarRange },
  { label: "Financials", href: "/financials", icon: Wallet },
  { label: "Logistics", href: "/logistics", icon: Truck },
  { label: "Inventory", href: "/inventory", icon: Boxes },
  { section: "Knowledge", label: "Drawings", href: "/drawings", icon: Ruler },
  { label: "Documents", href: "/documents", icon: FileText },
  { label: "Meetings", href: "/meetings", icon: Presentation },
  { label: "Risks", href: "/risks", icon: ShieldAlert },
  { section: "Network", label: "Contractors", href: "/contractors", icon: Building2 },
  { label: "Suppliers", href: "/suppliers", icon: Factory },
  { section: "System", label: "Notifications", href: "/notifications", icon: Bell },
  { label: "Search", href: "/search", icon: Search },
  { label: "Admin", href: "/admin", icon: Settings },
  { label: "Projects", href: "/admin/projects", icon: Ship },
];
