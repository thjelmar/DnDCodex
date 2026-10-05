import { useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { overridesFromGenTables, type GenOverrides } from './genTables'

/** The live generator overrides from the global generator tables. Every
 *  one-click generator (settlement, tavern name, plot hook, NPC name) reads
 *  this so the same per-world lists apply across all campaigns. */
export function useGenOverrides(): GenOverrides {
  const rows = useLiveQuery(() => db.genTables.toArray(), [])
  return useMemo(() => overridesFromGenTables(rows), [rows])
}
