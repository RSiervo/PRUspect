import {
  BarChart3,
  CalendarDays,
  ClipboardCheck,
  HeartHandshake,
  History,
  LayoutDashboard,
  Settings,
  ShieldCheck,
  UsersRound,
  SlidersHorizontal,
  Users,
  type LucideIcon,
} from 'lucide-react'

export interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  end?: boolean
  badge?: 'follow-ups'
  /** Only shown to administrator accounts. */
  staffOnly?: boolean
  /** Only shown to people who manage a team. */
  teamOnly?: boolean
}

export const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/prospects', label: 'Prospects', icon: Users },
  { to: '/clients', label: 'Clients', icon: HeartHandshake },
  { to: '/follow-ups', label: 'Follow-ups', icon: ClipboardCheck, badge: 'follow-ups' },
  { to: '/calendar', label: 'Calendar', icon: CalendarDays },
  { to: '/activities', label: 'Activities', icon: History },
  { to: '/pipeline', label: 'Sales Pipeline', icon: SlidersHorizontal },
  { to: '/reports', label: 'Reports', icon: BarChart3 },
  { to: '/settings', label: 'Settings', icon: Settings },
  { to: '/team', label: 'Team', icon: UsersRound, teamOnly: true },
  { to: '/admin/users', label: 'Users', icon: ShieldCheck, staffOnly: true },
]

export function navItemsFor(isStaff: boolean, hasTeam = false): NavItem[] {
  return NAV_ITEMS.filter((item) => (!item.staffOnly || isStaff) && (!item.teamOnly || hasTeam))
}
