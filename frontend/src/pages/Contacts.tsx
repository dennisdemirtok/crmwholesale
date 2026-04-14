import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useContacts } from '../hooks/useContacts';
import { api } from '../utils/api';
import { Contact } from '../types';
import StatusBadge from '../components/StatusBadge';
import Modal from '../components/Modal';
import { Plus, Search, Upload, ChevronLeft, ChevronRight } from 'lucide-react';

export default function Contacts() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [country, setCountry] = useState('');
  const [category, setCategory] = useState('');
  const [page, setPage] = useState(1);
  const [showAdd, setShowAdd] = useState(false);
  const [showImport, setShowImport] = useState(false);

  const { contacts, total, totalPages, loading, refetch } = useContacts({
    search: search || undefined,
    status: status || undefined,
    country: country || undefined,
    category: category || undefined,
    page,
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Kontakter</h1>
        <div className="flex gap-2">
          <button
            onClick={() => setShowImport(true)}
            className="flex items-center gap-2 px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            <Upload size={16} />
            Importera
          </button>
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-2 px-3 py-2 text-sm bg-brand-600 text-white rounded-lg hover:bg-brand-700"
          >
            <Plus size={16} />
            Ny kontakt
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 bg-white p-4 rounded-xl border border-gray-200">
        <div className="flex-1 min-w-[200px] relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Sök företag, namn eller e-post..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
          />
        </div>
        <select
          value={status}
          onChange={(e) => { setStatus(e.target.value); setPage(1); }}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
        >
          <option value="">Alla statusar</option>
          <option value="active">Aktiv</option>
          <option value="prospect">Prospekt</option>
          <option value="churned">Churned</option>
        </select>
        <select
          value={category}
          onChange={(e) => { setCategory(e.target.value); setPage(1); }}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
        >
          <option value="">Alla kategorier</option>
          <option value="boutique">Boutique</option>
          <option value="department">Department Store</option>
          <option value="agent">Agent</option>
          <option value="online">Online</option>
        </select>
        <input
          type="text"
          placeholder="Land"
          value={country}
          onChange={(e) => { setCountry(e.target.value); setPage(1); }}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm w-32"
        />
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" />
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 bg-gray-50 border-b border-gray-200">
                    <th className="px-4 py-3 font-medium">Företag</th>
                    <th className="px-4 py-3 font-medium">Kontakt</th>
                    <th className="px-4 py-3 font-medium">E-post</th>
                    <th className="px-4 py-3 font-medium">Land</th>
                    <th className="px-4 py-3 font-medium">Kategori</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Taggar</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {contacts && contacts.length > 0 ? (
                    contacts.map((c) => (
                      <tr key={c.id} className="hover:bg-gray-50 cursor-pointer">
                        <td className="px-4 py-3">
                          <Link
                            to={`/contacts/${c.id}`}
                            className="font-medium text-gray-900 hover:text-brand-600"
                          >
                            {c.company}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-gray-700">{c.contact_name}</td>
                        <td className="px-4 py-3 text-gray-500">{c.email}</td>
                        <td className="px-4 py-3 text-gray-500">{c.country}</td>
                        <td className="px-4 py-3 text-gray-500 capitalize">{c.category}</td>
                        <td className="px-4 py-3">
                          <StatusBadge status={c.status} />
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-1 flex-wrap">
                            {c.tags?.map((t) => (
                              <span
                                key={t}
                                className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs"
                              >
                                {t}
                              </span>
                            ))}
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={7} className="px-4 py-12 text-center text-gray-500">
                        Inga kontakter hittades
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {(totalPages || 0) > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200">
                <p className="text-sm text-gray-500">
                  {total} kontakter totalt
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPage(Math.max(1, page - 1))}
                    disabled={page === 1}
                    className="p-1 rounded hover:bg-gray-100 disabled:opacity-50"
                  >
                    <ChevronLeft size={20} />
                  </button>
                  <span className="text-sm text-gray-700">
                    Sida {page} av {totalPages}
                  </span>
                  <button
                    onClick={() => setPage(Math.min(totalPages || 1, page + 1))}
                    disabled={page >= (totalPages || 1)}
                    className="p-1 rounded hover:bg-gray-100 disabled:opacity-50"
                  >
                    <ChevronRight size={20} />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Add Contact Modal */}
      <AddContactModal
        open={showAdd}
        onClose={() => setShowAdd(false)}
        onCreated={() => { setShowAdd(false); refetch(); }}
      />

      {/* Import Modal */}
      <ImportModal
        open={showImport}
        onClose={() => setShowImport(false)}
        onImported={() => { setShowImport(false); refetch(); }}
      />
    </div>
  );
}

function AddContactModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [form, setForm] = useState({
    company: '',
    contact_name: '',
    email: '',
    country: '',
    category: 'boutique',
    status: 'prospect',
    tags: '',
    notes: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api.post('/api/contacts', {
        ...form,
        tags: form.tags ? form.tags.split(',').map((t) => t.trim()) : [],
      });
      setForm({ company: '', contact_name: '', email: '', country: '', category: 'boutique', status: 'prospect', tags: '', notes: '' });
      onCreated();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Ny kontakt" size="lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Företag *</label>
            <input required value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Kontaktperson *</label>
            <input required value={form.contact_name} onChange={(e) => setForm({ ...form, contact_name: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">E-post *</label>
            <input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Land</label>
            <input value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Kategori</label>
            <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white">
              <option value="boutique">Boutique</option>
              <option value="department">Department Store</option>
              <option value="agent">Agent</option>
              <option value="online">Online</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
            <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white">
              <option value="prospect">Prospekt</option>
              <option value="active">Aktiv</option>
              <option value="churned">Churned</option>
            </select>
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Taggar (kommaseparerade)</label>
          <input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="SS27, FW27" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Anteckningar</label>
          <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
        </div>
        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50">Avbryt</button>
          <button type="submit" disabled={saving} className="px-4 py-2 text-sm bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50">
            {saving ? 'Sparar...' : 'Skapa kontakt'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ImportModal({
  open,
  onClose,
  onImported,
}: {
  open: boolean;
  onClose: () => void;
  onImported: () => void;
}) {
  const [csvText, setCsvText] = useState('');
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState('');

  const handleImport = async () => {
    setImporting(true);
    setResult('');
    try {
      const lines = csvText.trim().split('\n');
      const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
      const contacts = lines.slice(1).map((line) => {
        const values = line.split(',').map((v) => v.trim());
        const obj: Record<string, string> = {};
        headers.forEach((h, i) => {
          obj[h] = values[i] || '';
        });
        return {
          company: obj.company || obj.företag || '',
          contact_name: obj.contact_name || obj.namn || obj.name || '',
          email: obj.email || obj['e-post'] || '',
          country: obj.country || obj.land || '',
          category: obj.category || obj.kategori || null,
          status: obj.status || 'prospect',
        };
      }).filter((c) => c.company && c.email);

      const res = await api.post<{ imported: number }>('/api/contacts/import', { contacts });
      setResult(`${res.imported} kontakter importerade!`);
      setTimeout(onImported, 1500);
    } catch (err: any) {
      setResult(`Fel: ${err.message}`);
    } finally {
      setImporting(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Importera kontakter (CSV)" size="lg">
      <div className="space-y-4">
        <p className="text-sm text-gray-500">
          Klistra in CSV-data med kolumner: company, contact_name, email, country, category, status
        </p>
        <textarea
          value={csvText}
          onChange={(e) => setCsvText(e.target.value)}
          rows={10}
          placeholder={`company,contact_name,email,country,category\nBoutique Stockholm,Anna Svensson,anna@boutique.se,Sweden,boutique`}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono"
        />
        {result && (
          <p className={`text-sm ${result.startsWith('Fel') ? 'text-red-600' : 'text-green-600'}`}>
            {result}
          </p>
        )}
        <div className="flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50">Avbryt</button>
          <button onClick={handleImport} disabled={importing || !csvText.trim()} className="px-4 py-2 text-sm bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50">
            {importing ? 'Importerar...' : 'Importera'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
