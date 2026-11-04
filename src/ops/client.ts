import { createClient } from '@supabase/supabase-js'

/*
 * Mars Ops' own database (Supabase project detfredqthepqdynmluf, Frankfurt; HANDOFF decision 246), separate from the
 * website's. The URL and the PUBLISHABLE key are safe in a browser: what a person may read or write is decided by the
 * database's row rules by their role (public.staff), never by this key.
 */
const URL = 'https://detfredqthepqdynmluf.supabase.co'
const KEY = 'sb_publishable_HXMyvAAXW4H0evjYmbQ8fQ_uqeWZROl'

export const ops = createClient(URL, KEY, { auth: { persistSession: true, autoRefreshToken: true, storageKey: 'mars-ops-auth' } })

export type Role = 'owner' | 'office' | 'warehouse' | 'manager' | 'cashier'
export type Staff = { user_id: string; name: string; role: Role; branch_id: string | null; active: boolean }
export type Unit = 'g' | 'ml' | 'pc'
export type Material = { id: string; name: string; unit: Unit; pack_name: string | null; pack_size: number | null; cost: number; min_stock: number; active: boolean }
export type Supplier = { id: string; name: string; phone: string | null; notes: string | null; active: boolean }

export const ROLE: Record<Role, string> = { owner: 'Owner', office: 'Office', warehouse: 'Warehouse keeper', manager: 'Branch manager', cashier: 'Cashier' }
/** who may add and change materials and suppliers (the database checks the same) */
export const keeps = (r?: Role) => r === 'owner' || r === 'office' || r === 'warehouse'
