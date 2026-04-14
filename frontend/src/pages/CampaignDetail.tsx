import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../utils/api';
import { Campaign, SequenceStep, Enrollment, Contact } from '../types';
import StatusBadge from '../components/StatusBadge';
import Modal from '../components/Modal';
import {
  ArrowLeft,
  Plus,
  Trash2,
  Play,
  Pause,
  Users,
  Send,
  Eye,
  MessageSquare,
  GripVertical,
} from 'lucide-react';
import RichTextEditor from '../components/RichTextEditor';

export default function CampaignDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [loading, setLoading] = useState(true);
  const [showEnroll, setShowEnroll] = useState(false);
  const [editingSteps, setEditingSteps] = useState(false);
  const [steps, setSteps] = useState<SequenceStep[]>([]);

  const fetchData = () => {
    if (!id) return;
    Promise.all([
      api.get<Campaign>(`/api/campaigns/${id}`),
      api.get<Enrollment[]>(`/api/campaigns/${id}/enrollments`),
    ])
      .then(([c, e]) => {
        setCampaign(c);
        setEnrollments(e);
        setSteps(c.sequence_steps || []);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(fetchData, [id]);

  const handleStatusChange = async (newStatus: string) => {
    await api.put(`/api/campaigns/${id}`, { status: newStatus });
    fetchData();
  };

  const handleSaveSteps = async () => {
    await api.put(`/api/campaigns/${id}/steps`, { steps });
    setEditingSteps(false);
    fetchData();
  };

  const handleDelete = async () => {
    if (!confirm('Vill du ta bort denna kampanj?')) return;
    await api.delete(`/api/campaigns/${id}`);
    navigate('/campaigns');
  };

  const addStep = () => {
    setSteps([
      ...steps,
      {
        step_order: steps.length + 1,
        delay_hours: steps.length === 0 ? 0 : 72,
        subject_template: '',
        body_template: '',
        condition: steps.length === 0 ? 'always' : 'not_replied',
      },
    ]);
    setEditingSteps(true);
  };

  const removeStep = (index: number) => {
    setSteps(steps.filter((_, i) => i !== index).map((s, i) => ({ ...s, step_order: i + 1 })));
  };

  const updateStep = (index: number, field: string, value: any) => {
    setSteps(steps.map((s, i) => (i === index ? { ...s, [field]: value } : s)));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" />
      </div>
    );
  }

  if (!campaign) return <p>Kampanj hittades inte.</p>;

  return (
    <div className="space-y-6">
      <button
        onClick={() => navigate('/campaigns')}
        className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700"
      >
        <ArrowLeft size={16} />
        Tillbaka till kampanjer
      </button>

      {/* Header */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{campaign.name}</h1>
            <div className="flex items-center gap-3 mt-2">
              <StatusBadge status={campaign.status} />
              <span className="text-sm text-gray-500">
                Skapad {new Date(campaign.created_at).toLocaleDateString('sv-SE')}
              </span>
            </div>
          </div>
          <div className="flex gap-2">
            {campaign.status === 'draft' || campaign.status === 'paused' ? (
              <button
                onClick={() => handleStatusChange('active')}
                className="flex items-center gap-2 px-3 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700"
              >
                <Play size={16} />
                Aktivera
              </button>
            ) : campaign.status === 'active' ? (
              <button
                onClick={() => handleStatusChange('paused')}
                className="flex items-center gap-2 px-3 py-2 text-sm bg-orange-600 text-white rounded-lg hover:bg-orange-700"
              >
                <Pause size={16} />
                Pausa
              </button>
            ) : null}
            <button
              onClick={() => setShowEnroll(true)}
              className="flex items-center gap-2 px-3 py-2 text-sm bg-brand-600 text-white rounded-lg hover:bg-brand-700"
            >
              <Users size={16} />
              Enrolla kontakter
            </button>
            <button
              onClick={handleDelete}
              className="p-2 text-gray-400 hover:text-red-600 rounded-lg hover:bg-gray-100"
            >
              <Trash2 size={18} />
            </button>
          </div>
        </div>

        {/* Stats */}
        {campaign.emailStats && (
          <div className="mt-6 grid grid-cols-2 sm:grid-cols-5 gap-4">
            <div className="text-center p-3 bg-gray-50 rounded-lg">
              <p className="text-2xl font-bold text-gray-900">{campaign.enrollmentStats?.total || 0}</p>
              <p className="text-xs text-gray-500 mt-1">Enrollade</p>
            </div>
            <div className="text-center p-3 bg-blue-50 rounded-lg">
              <p className="text-2xl font-bold text-blue-700 flex items-center justify-center gap-1"><Send size={16} />{campaign.emailStats.sent}</p>
              <p className="text-xs text-gray-500 mt-1">Skickade</p>
            </div>
            <div className="text-center p-3 bg-green-50 rounded-lg">
              <p className="text-2xl font-bold text-green-700 flex items-center justify-center gap-1"><Eye size={16} />{campaign.emailStats.openRate}%</p>
              <p className="text-xs text-gray-500 mt-1">Öppningsgrad</p>
            </div>
            <div className="text-center p-3 bg-emerald-50 rounded-lg">
              <p className="text-2xl font-bold text-emerald-700 flex items-center justify-center gap-1"><MessageSquare size={16} />{campaign.emailStats.replyRate}%</p>
              <p className="text-xs text-gray-500 mt-1">Svarsgrad</p>
            </div>
            <div className="text-center p-3 bg-purple-50 rounded-lg">
              <p className="text-2xl font-bold text-purple-700">{campaign.enrollmentStats?.active || 0}</p>
              <p className="text-xs text-gray-500 mt-1">Aktiva</p>
            </div>
          </div>
        )}
      </div>

      {/* Sequence Steps */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Flödessteg</h2>
          <div className="flex gap-2">
            {editingSteps && (
              <button
                onClick={handleSaveSteps}
                className="px-3 py-2 text-sm bg-brand-600 text-white rounded-lg hover:bg-brand-700"
              >
                Spara steg
              </button>
            )}
            <button
              onClick={addStep}
              className="flex items-center gap-2 px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              <Plus size={16} />
              Lägg till steg
            </button>
          </div>
        </div>

        {steps.length === 0 ? (
          <p className="text-sm text-gray-500">Inga steg konfigurerade. Lägg till steg för att bygga ditt flöde.</p>
        ) : (
          <div className="space-y-3">
            {steps.map((step, index) => (
              <div key={index} className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <GripVertical size={16} className="text-gray-300" />
                    <span className="text-sm font-medium text-gray-900">Steg {step.step_order}</span>
                    {step.delay_hours > 0 && (
                      <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                        +{step.delay_hours}h delay
                      </span>
                    )}
                  </div>
                  <button onClick={() => removeStep(index)} className="text-gray-400 hover:text-red-500">
                    <Trash2 size={16} />
                  </button>
                </div>

                {editingSteps ? (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Fördröjning (timmar)</label>
                        <input
                          type="number"
                          min="0"
                          value={step.delay_hours}
                          onChange={(e) => updateStep(index, 'delay_hours', parseInt(e.target.value))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Villkor</label>
                        <select
                          value={step.condition}
                          onChange={(e) => updateStep(index, 'condition', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
                        >
                          <option value="always">Alltid</option>
                          <option value="not_opened">Om ej öppnat</option>
                          <option value="opened_not_replied">Om öppnat men ej svarat</option>
                          <option value="not_replied">Om ej svarat</option>
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Ämne</label>
                      <input
                        value={step.subject_template}
                        onChange={(e) => updateStep(index, 'subject_template', e.target.value)}
                        placeholder="Hej {{contact_name}} — SS27 Preview"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Innehåll</label>
                      <RichTextEditor
                        value={step.body_template}
                        onChange={(html) => updateStep(index, 'body_template', html)}
                        placeholder="Hej, vi vill bjuda in er till vår SS27 preview..."
                        rows={5}
                      />
                    </div>
                  </div>
                ) : (
                  <div>
                    <p className="text-sm text-gray-900">{step.subject_template || '(inget ämne)'}</p>
                    <div className="flex gap-2 mt-1">
                      <span className="text-xs text-gray-500">
                        Villkor: {step.condition === 'always' ? 'Alltid' : step.condition === 'not_opened' ? 'Ej öppnat' : step.condition === 'opened_not_replied' ? 'Öppnat, ej svarat' : 'Ej svarat'}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {!editingSteps && steps.length > 0 && (
          <button
            onClick={() => setEditingSteps(true)}
            className="mt-3 text-sm text-brand-600 hover:text-brand-700"
          >
            Redigera steg
          </button>
        )}
      </div>

      {/* Enrollments */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Enrollade kontakter</h2>
        {enrollments.length === 0 ? (
          <p className="text-sm text-gray-500">Inga kontakter enrollade ännu</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b border-gray-100">
                <th className="pb-2 font-medium">Kontakt</th>
                <th className="pb-2 font-medium">Företag</th>
                <th className="pb-2 font-medium">Steg</th>
                <th className="pb-2 font-medium">Status</th>
                <th className="pb-2 font-medium">Enrollad</th>
                <th className="pb-2 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {enrollments.map((e) => (
                <tr key={e.id} className="hover:bg-gray-50">
                  <td className="py-2.5 font-medium text-gray-900">{e.contacts?.contact_name}</td>
                  <td className="py-2.5 text-gray-500">{e.contacts?.company}</td>
                  <td className="py-2.5 text-gray-500">{e.current_step}/{steps.length}</td>
                  <td className="py-2.5"><StatusBadge status={e.status} /></td>
                  <td className="py-2.5 text-gray-500">{new Date(e.enrolled_at).toLocaleDateString('sv-SE')}</td>
                  <td className="py-2.5">
                    {e.status === 'active' && (
                      <button
                        onClick={() => api.post(`/api/enrollments/${e.id}/pause`).then(fetchData)}
                        className="text-xs text-orange-600 hover:text-orange-700"
                      >
                        Pausa
                      </button>
                    )}
                    {e.status === 'paused' && (
                      <button
                        onClick={() => api.post(`/api/enrollments/${e.id}/resume`).then(fetchData)}
                        className="text-xs text-green-600 hover:text-green-700"
                      >
                        Återuppta
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <EnrollModal
        open={showEnroll}
        onClose={() => setShowEnroll(false)}
        campaignId={id!}
        onEnrolled={() => {
          setShowEnroll(false);
          fetchData();
        }}
      />
    </div>
  );
}

function EnrollModal({
  open,
  onClose,
  campaignId,
  onEnrolled,
}: {
  open: boolean;
  onClose: () => void;
  campaignId: string;
  onEnrolled: () => void;
}) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [enrolling, setEnrolling] = useState(false);

  useEffect(() => {
    if (open) {
      api
        .get<{ contacts: Contact[] }>(`/api/contacts?limit=200&search=${search}`)
        .then((res) => setContacts(res.contacts));
    }
  }, [open, search]);

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const handleEnroll = async () => {
    setEnrolling(true);
    try {
      await api.post('/api/enrollments', {
        campaign_id: campaignId,
        contact_ids: Array.from(selected),
      });
      onEnrolled();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setEnrolling(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Enrolla kontakter i kampanj" size="lg">
      <div className="space-y-4">
        <input
          type="text"
          placeholder="Sök kontakter..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
        />
        <div className="max-h-64 overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-100">
          {contacts.map((c) => (
            <label
              key={c.id}
              className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 cursor-pointer"
            >
              <input
                type="checkbox"
                checked={selected.has(c.id)}
                onChange={() => toggle(c.id)}
                className="rounded border-gray-300"
              />
              <div>
                <p className="text-sm font-medium text-gray-900">{c.contact_name}</p>
                <p className="text-xs text-gray-500">{c.company} — {c.email}</p>
              </div>
            </label>
          ))}
        </div>
        <p className="text-sm text-gray-500">{selected.size} kontakter valda</p>
        <div className="flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50">Avbryt</button>
          <button
            onClick={handleEnroll}
            disabled={enrolling || selected.size === 0}
            className="px-4 py-2 text-sm bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50"
          >
            {enrolling ? 'Enrollar...' : `Enrolla ${selected.size} kontakter`}
          </button>
        </div>
      </div>
    </Modal>
  );
}
