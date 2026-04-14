import { useState, useEffect, useCallback } from 'react';
import { Contact } from '../types';
import { api } from '../utils/api';

interface ContactsResponse {
  contacts: Contact[];
  total: number;
  page: number;
  totalPages: number;
}

interface Filters {
  status?: string;
  country?: string;
  category?: string;
  tag?: string;
  search?: string;
  page?: number;
}

export function useContacts(filters: Filters = {}) {
  const [data, setData] = useState<ContactsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchContacts = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filters.status) params.set('status', filters.status);
    if (filters.country) params.set('country', filters.country);
    if (filters.category) params.set('category', filters.category);
    if (filters.tag) params.set('tag', filters.tag);
    if (filters.search) params.set('search', filters.search);
    if (filters.page) params.set('page', filters.page.toString());

    try {
      const result = await api.get<ContactsResponse>(`/api/contacts?${params}`);
      setData(result);
      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [filters.status, filters.country, filters.category, filters.tag, filters.search, filters.page]);

  useEffect(() => {
    fetchContacts();
  }, [fetchContacts]);

  return { ...data, loading, error, refetch: fetchContacts };
}
