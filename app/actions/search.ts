'use server'

import { globalSearch, type SearchResult } from '@/lib/services/search'

export async function searchCrmAction(query: string): Promise<SearchResult[]> {
  return globalSearch(query)
}
