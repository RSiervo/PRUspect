import {
  BarChart3,
  CalendarDays,
  ClipboardCheck,
  History,
  LayoutDashboard,
  Settings,
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
}

export const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/prospects', label: 'Prospects', icon: Users },
  { to: '/follow-ups', label: 'Follow-ups', icon: ClipboardCheck, badge: 'follow-ups' },
  { to: '/calendar', label: 'Calendar', icon: CalendarDays },
  { to: '/activities', label: 'Activities', icon: History },
  { to: '/pipeline', label: 'Sales Pipeline', icon: SlidersHorizontal },
  { to: '/reports', label: 'Reports', icon: BarChart3 },
  { to: '/settings', label: 'Settings', icon: Settings },
]
