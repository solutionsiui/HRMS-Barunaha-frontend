"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BadgeIndianRupee,
  BellRing,
  BookOpenText,
  BriefcaseBusiness,
  Building2,
  CalendarCheck2,
  CalendarClock,
  CalendarRange,
  ClipboardCheck,
  ClipboardList,
  Clock3,
  DoorOpen,
  FileSpreadsheet,
  FolderKanban,
  FolderLock,
  LayoutDashboard,
  Logs,
  X,
  MessagesSquare,
  Settings2,
  ShieldCheck,
  Star,
  SunMedium,
  TrendingUp,
  UserCog,
  UserRound,
  Users,
  WalletCards,
} from "lucide-react";

import { useAuth } from "@/lib/auth-context";
import { NAV_ITEMS } from "@/lib/constants";
import { backendAssetUrl } from "@/lib/api";
import AppLogo from "@/components/AppLogo";
import ThemeToggle from "@/components/ui/ThemeToggle";

const ICON_MAP = {
  dashboard: LayoutDashboard,
  attendance_hr: CalendarClock,
  attendance: Clock3,
  my_leaves: CalendarCheck2,
  leaves: CalendarCheck2,
  leave_approvals: ClipboardCheck,
  staff: Users,
  departments: Building2,
  attendance_settings: Settings2,
  documents: FolderLock,
  performance: TrendingUp,
  sunday_work: SunMedium,
  resignations: DoorOpen,
  resignation: DoorOpen,
  tasks_hr: ClipboardList,
  mis: FileSpreadsheet,
  tasks: ClipboardList,
  tasks_assign: FolderKanban,
  tasks_review: Logs,
  grievances_hr: MessagesSquare,
  grievance: MessagesSquare,
  notices: BellRing,
  payslip: WalletCards,
  exports: FileSpreadsheet,
  bgv: ShieldCheck,
  policies: BookOpenText,
  profile: UserRound,
  payroll: BadgeIndianRupee,
  feedback: MessagesSquare,
  holidays: CalendarRange,
  approvals: ClipboardCheck,
  increments: BriefcaseBusiness,
  peer_ratings: Star,
  comp_off: SunMedium,
  appraisal: TrendingUp,
  team_setup: Settings2,
};

export default function Sidebar({ sidebarOpen, onClose }) {
  const { role, user, logout } = useAuth();
  const pathname = usePathname();

  const items = (NAV_ITEMS[role] || NAV_ITEMS.employee).filter((item) => {
    if (item.id === "payslip") {
      return user?.self_service_access?.can_view_my_payslip !== false;
    }
    if (item.id === "feedback") {
      return false;
    }
    return true;
  });

  const isActive = (item) => {
    if (item.href === "/dashboard") return pathname === "/dashboard";
    return pathname === item.href || pathname.startsWith(`${item.href}/`);
  };

  return (
    <aside className={`sidebar ${sidebarOpen ? "open" : ""}`}>
      <div className="sidebar-brand">
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
          <AppLogo compact size={46} subtitle={`${role?.toUpperCase()} PORTAL`} />
          <button className="sidebar-close" onClick={onClose} aria-label="Close navigation">
            <X size={18} />
          </button>
        </div>

        <div className="sidebar-user">
          {user?.profile_pic ? (
            <div className="sidebar-user__avatar sidebar-user__avatar--image">
              <img src={backendAssetUrl(user.profile_pic)} alt={user?.first_name || "Profile"} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            </div>
          ) : (
            <div className="sidebar-user__avatar">
              {(user?.first_name || user?.username || "?")[0].toUpperCase()}
            </div>
          )}
          <div style={{ overflow: "hidden" }}>
            <div className="sidebar-user__name">{[user?.first_name, user?.last_name].filter(Boolean).join(" ") || user?.username}</div>
            <div className="sidebar-user__meta">{user?.emp_id || ""}</div>
          </div>
        </div>
      </div>

      <nav className="sidebar-nav">
        {items.map((item) => {
          const Icon = ICON_MAP[item.id] || UserCog;
          return (
            <Link
              key={item.id}
              href={item.href}
              className={`nav-item ${isActive(item) ? "active" : ""}`}
              onClick={onClose}
            >
              <span className="nav-item__icon">
                <Icon size={18} strokeWidth={2.1} />
              </span>
              <span className="nav-item__label">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="sidebar-footer">
        <ThemeToggle />
        <button className="btn-danger" onClick={logout} style={{ width: "100%", justifyContent: "center" }}>
          <DoorOpen size={16} />
          Sign Out
        </button>
      </div>
    </aside>
  );
}
