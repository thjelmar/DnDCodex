import { useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { OVERVIEW_LAYOUT_ID, reconcile, type ResolvedLayout } from './overviewCards'

/**
 * The layout the campaign Overview renders (T-88): the saved one if the user has one,
 * otherwise the default, always passed through reconcile() so a stale, partial or newer
 * layout is repaired on read and never written back. Returns undefined for the first
 * few milliseconds while the local read runs, so the page can wait instead of showing
 * the default and then jumping.
 */
export function useOverviewLayout(): ResolvedLayout | undefined {
  // null (not undefined) means "read finished, nothing saved".
  const row = useLiveQuery(async () => (await db.overviewLayout.get(OVERVIEW_LAYOUT_ID)) ?? null, [])
  return useMemo(() => (row === undefined ? undefined : reconcile(row)), [row])
}
