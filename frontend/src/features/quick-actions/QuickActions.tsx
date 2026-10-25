import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'

import { LogActivityDialog } from '@/features/activities/LogActivityDialog'
import { MessageDialog, OutcomeDialog, useContactTracker, type ContactKind, type ContactProspect } from '@/features/contact/ContactFlow'
import { FollowUpFormDialog } from '@/features/follow-ups/dialogs'
import type { ActivityType, ProspectBrief } from '@/types/api'

type ProspectRef = Pick<ProspectBrief, 'id' | 'full_name'> | null

interface QuickActionsValue {
  scheduleFollowUp: (options?: { prospect?: ProspectRef; date?: string; type?: ActivityType }) => void
  logActivity: (options?: { prospect?: ProspectRef }) => void
  /** Call this when the user taps a tel:/sms:/mailto: link; asks for the outcome when they return. */
  trackContact: (prospect: ContactProspect, kind: ContactKind) => void
  composeMessage: (prospect: ContactProspect) => void
}

const QuickActionsContext = createContext<QuickActionsValue | null>(null)

/** App-wide dialogs: schedule follow-up, log activity, compose message, and "how did it go?". */
export function QuickActionsProvider({ children }: { children: ReactNode }) {
  const [followUp, setFollowUp] = useState<{ prospect: ProspectRef; date?: string; type?: ActivityType } | null>(null)
  const [activity, setActivity] = useState<{ prospect: ProspectRef } | null>(null)
  const [messageTo, setMessageTo] = useState<ContactProspect | null>(null)
  const tracker = useContactTracker()
  const { track } = tracker

  const scheduleFollowUp = useCallback<QuickActionsValue['scheduleFollowUp']>(
    (options) => setFollowUp({ prospect: options?.prospect ?? null, date: options?.date, type: options?.type }),
    [],
  )
  const logActivity = useCallback<QuickActionsValue['logActivity']>((options) => setActivity({ prospect: options?.prospect ?? null }), [])
  const value = useMemo(
    () => ({ scheduleFollowUp, logActivity, trackContact: track, composeMessage: setMessageTo }),
    [scheduleFollowUp, logActivity, track],
  )

  return (
    <QuickActionsContext.Provider value={value}>
      {children}
      <FollowUpFormDialog
        open={followUp !== null}
        onOpenChange={(open) => !open && setFollowUp(null)}
        prospect={followUp?.prospect}
        defaultDate={followUp?.date}
        defaultType={followUp?.type}
      />
      <LogActivityDialog open={activity !== null} onOpenChange={(open) => !open && setActivity(null)} prospect={activity?.prospect} />
      <MessageDialog prospect={messageTo} onClose={() => setMessageTo(null)} onSent={track} />
      <OutcomeDialog contact={tracker.asking} onClose={tracker.close} />
    </QuickActionsContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useQuickActions(): QuickActionsValue {
  const context = useContext(QuickActionsContext)
  if (!context) throw new Error('useQuickActions must be used inside QuickActionsProvider')
  return context
}
