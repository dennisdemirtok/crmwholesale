import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../utils/api';
import { Contact, SentEmail } from '../types';
import StatusBadge from '../components/StatusBadge';
import Modal from '../components/Modal';
import {
  ArrowLeft,
  Mail,
  Edit2,
  Trash2,
  Send,
  Eye,
  MessageSquare,
  Clock,
} from 'lucide-react';
import RichTextEditor from '../components/RichTextEditor';

export default function ContactDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [contact, setContact] = useState<Contact | null>(null);
  const [emails, setEmails] = useState<SentEmail[]>([]);
  const [loading, setLoading] = useState(true);
  const [showEdit, setShowEdit] = useState(false);
  const [showSendEmail, setShowSendEmail] = useState(false);

  useEffect(() => {
    if (!id) return;
    Promise.all([
      api.get<Contact>(`/api/contacts/${id}`),
      api.get<SentEmail[]>(`/api/emails/contact/${id}`),
    ])
      .then(([c, e]) => {
        setContact(c);
        setEmails(e);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [id]);

  const handleDelete = async () => {
    if (!confirm('Vill du ta bort denna kontakt?')) return;
    await api.delete(`/api/contacts/${id}`);
    navigate('/contacts');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" />
      </div>
    );
  }

  if (!contact) return <p>Kontakt hittades inte.</p>;

  return (
    <div className="space-y-6">
      <button
        onClick={() => navigate('/contacts')}
        className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700"
      >
        <ArrowLeft size={16} />
        Tillbaka till kontakter
      </button>

      {/* Header */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{contact.company}</h1>
            <p className="text-gray-600 mt-1">{contact.contact_name}</p>
            <p className="text-sm text-gray-500">{contact.email}</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setShowSendEmail(true)}
              className="flex items-center gap-2 px-3 py-2 text-sm bg-brand-600 text-white rounded-lg hover:bg-brand-700"
            >
              <Mail size={16} />
              Skicka mail
            </button>
            <button
              onClick={() => setShowEdit(true)}
              className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
            >
              <Edit2 size={18} />
            </button>
            <button
              onClick={handleDelete}
              className="p-2 text-gray-400 hover:text-red-600 rounded-lg hover:bg-gray-100"
            >
              <Trash2 size={18} />
            </button>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div>
            <p className="text-xs text-gray-500">Status</p>
            <StatusBadge status={contact.status} />
          </div>
          <div>
            <p className="text-xs text-gray-500">Kategori</p>
            <p className="text-sm font-medium text-gray-900 capitalize">{contact.category}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Land</p>
            <p className="text-sm font-medium text-gray-900">{contact.country}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Säljare</p>
            <p className="text-sm font-medium text-gray-900">{contact.users?.name}</p>
          </div>
        </div>

        {contact.tags && contact.tags.length > 0 && (
          <div className="mt-4 flex gap-2 flex-wrap">
            {contact.tags.map((t) => (
              <span key={t} className="px-2 py-1 bg-brand-50 text-brand-700 rounded text-xs font-medium">
                {t}
              </span>
            ))}
          </div>
        )}

        {contact.notes && (
          <div className="mt-4 p-3 bg-gray-50 rounded-lg">
            <p className="text-xs text-gray-500 mb-1">Anteckningar</p>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{contact.notes}</p>
          </div>
        )}
      </div>

      {/* Email timeline */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <Clock size={18} />
          E-posthistorik
        </h2>

        {emails.length === 0 ? (
          <p className="text-sm text-gray-500">Inga mail skickade ännu</p>
        ) : (
          <div className="space-y-3">
            {emails.map((email) => (
              <EmailThreadItem
                key={email.id}
                email={email}
                contact={contact}
                onReplySent={(newEmail) => setEmails([newEmail, ...emails])}
              />
            ))}
          </div>
        )}
      </div>

      {/* Edit Modal */}
      <EditContactModal
        open={showEdit}
        onClose={() => setShowEdit(false)}
        contact={contact}
        onUpdated={(updated) => {
          setContact(updated);
          setShowEdit(false);
        }}
      />

      {/* Send Email Modal */}
      <SendEmailModal
        open={showSendEmail}
        onClose={() => setShowSendEmail(false)}
        contact={contact}
        onSent={(email) => {
          setEmails([email, ...emails]);
          setShowSendEmail(false);
        }}
      />
    </div>
  );
}

function EmailThreadItem({
  email,
  contact,
  onReplySent,
}: {
  email: SentEmail;
  contact: Contact;
  onReplySent: (email: SentEmail) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [thread, setThread] = useState<any[]>([]);
  const [loadingThread, setLoadingThread] = useState(false);
  const [showReply, setShowReply] = useState(false);
  const [replyBody, setReplyBody] = useState('');
  const [sending, setSending] = useState(false);

  const loadThread = async () => {
    if (!email.gmail_thread_id || thread.length > 0) {
      setExpanded(!expanded);
      return;
    }
    setLoadingThread(true);
    try {
      const data = await api.get<{ messages: any[] }>(`/api/emails/thread/${email.gmail_thread_id}`);
      setThread(data.messages || []);
      setExpanded(true);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingThread(false);
    }
  };

  const handleReply = async () => {
    if (!replyBody.trim()) return;
    setSending(true);
    try {
      const lastMessage = thread[thread.length - 1];
      const newEmail = await api.post<SentEmail>('/api/emails/send', {
        contact_id: contact.id,
        subject: `Re: ${email.subject}`,
        body: replyBody,
        thread_id: email.gmail_thread_id,
        reply_to_message_id: lastMessage?.id || email.gmail_message_id,
      });
      setReplyBody('');
      setShowReply(false);
      // Reload thread
      if (email.gmail_thread_id) {
        const data = await api.get<{ messages: any[] }>(`/api/emails/thread/${email.gmail_thread_id}`);
        setThread(data.messages || []);
      }
      onReplySent(newEmail);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      {/* Summary row */}
      <div
        onClick={loadThread}
        className="flex items-start gap-4 p-4 hover:bg-gray-50 cursor-pointer"
      >
        <div className="pt-1">
          <Send size={16} className="text-gray-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900">{email.subject}</p>
          <p className="text-xs text-gray-500 mt-1">
            {new Date(email.sent_at).toLocaleString('sv-SE')}
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs">
          {email.opened_at && (
            <span className="flex items-center gap-1 text-green-600">
              <Eye size={12} /> Öppnat ({email.open_count}x)
            </span>
          )}
          {email.replied_at && (
            <span className="flex items-center gap-1 text-emerald-600">
              <MessageSquare size={12} /> Svarat
            </span>
          )}
          {!email.opened_at && !email.replied_at && (
            <span className="text-gray-400">Skickat</span>
          )}
          {email.gmail_thread_id && (
            <span className="text-brand-600">{expanded ? '▲' : '▼'}</span>
          )}
        </div>
      </div>

      {/* Expanded thread */}
      {expanded && (
        <div className="border-t border-gray-100 bg-gray-50">
          {loadingThread ? (
            <div className="p-4 flex justify-center">
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-brand-600" />
            </div>
          ) : (
            <>
              <div className="divide-y divide-gray-100 max-h-96 overflow-y-auto">
                {thread.map((msg, i) => {
                  const isFromMe = msg.labelIds?.includes('SENT');
                  return (
                    <div key={msg.id || i} className={`p-4 ${isFromMe ? 'bg-blue-50/50' : 'bg-white'}`}>
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs font-medium text-gray-700">
                          {isFromMe ? '↗ Du' : `↙ ${msg.from?.split('<')[0]?.trim() || 'Okänd'}`}
                        </p>
                        <p className="text-xs text-gray-400">{msg.date ? new Date(msg.date).toLocaleString('sv-SE') : ''}</p>
                      </div>
                      {msg.body ? (
                        <div className="text-sm text-gray-700 prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: msg.body }} />
                      ) : (
                        <p className="text-sm text-gray-500">{msg.snippet}</p>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Reply section */}
              {showReply ? (
                <div className="p-4 border-t border-gray-200 bg-white">
                  <RichTextEditor
                    value={replyBody}
                    onChange={setReplyBody}
                    placeholder="Skriv ditt svar..."
                    rows={4}
                  />
                  <div className="flex justify-end gap-2 mt-3">
                    <button onClick={() => setShowReply(false)} className="px-3 py-1.5 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">Avbryt</button>
                    <button onClick={handleReply} disabled={sending} className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50">
                      <Send size={14} />
                      {sending ? 'Skickar...' : 'Skicka svar'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="p-3 border-t border-gray-200 bg-white">
                  <button
                    onClick={() => setShowReply(true)}
                    className="flex items-center gap-2 px-3 py-1.5 text-sm text-brand-600 border border-brand-200 rounded-lg hover:bg-brand-50"
                  >
                    <MessageSquare size={14} />
                    Svara
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function EditContactModal({
  open,
  onClose,
  contact,
  onUpdated,
}: {
  open: boolean;
  onClose: () => void;
  contact: Contact;
  onUpdated: (c: Contact) => void;
}) {
  const [form, setForm] = useState({
    company: contact.company,
    contact_name: contact.contact_name,
    email: contact.email,
    country: contact.country,
    category: contact.category,
    status: contact.status,
    tags: contact.tags?.join(', ') || '',
    notes: contact.notes || '',
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm({
      company: contact.company,
      contact_name: contact.contact_name,
      email: contact.email,
      country: contact.country,
      category: contact.category,
      status: contact.status,
      tags: contact.tags?.join(', ') || '',
      notes: contact.notes || '',
    });
  }, [contact]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const updated = await api.put<Contact>(`/api/contacts/${contact.id}`, {
        ...form,
        tags: form.tags ? form.tags.split(',').map((t) => t.trim()) : [],
      });
      onUpdated(updated);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Redigera kontakt" size="lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Företag</label>
            <input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Kontaktperson</label>
            <input value={form.contact_name} onChange={(e) => setForm({ ...form, contact_name: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">E-post</label>
            <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Land</label>
            <input value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Kategori</label>
            <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as any })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white">
              <option value="boutique">Boutique</option>
              <option value="department">Department Store</option>
              <option value="agent">Agent</option>
              <option value="online">Online</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
            <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as any })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white">
              <option value="prospect">Prospekt</option>
              <option value="active">Aktiv</option>
              <option value="churned">Churned</option>
            </select>
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Taggar</label>
          <input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Anteckningar</label>
          <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
        </div>
        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50">Avbryt</button>
          <button type="submit" disabled={saving} className="px-4 py-2 text-sm bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50">
            {saving ? 'Sparar...' : 'Spara'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function SendEmailModal({
  open,
  onClose,
  contact,
  onSent,
}: {
  open: boolean;
  onClose: () => void;
  contact: Contact;
  onSent: (email: SentEmail) => void;
}) {
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    try {
      const email = await api.post<SentEmail>('/api/emails/send', {
        contact_id: contact.id,
        subject,
        body,
      });
      setSubject('');
      setBody('');
      onSent(email);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={`Skicka mail till ${contact.contact_name}`} size="lg">
      <form onSubmit={handleSend} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Till</label>
          <p className="text-sm text-gray-500">{contact.email}</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Ämne *</label>
          <input
            required
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Meddelande</label>
          <RichTextEditor
            value={body}
            onChange={setBody}
            placeholder="Skriv ditt meddelande..."
            rows={8}
          />
        </div>
        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50">Avbryt</button>
          <button type="submit" disabled={sending} className="flex items-center gap-2 px-4 py-2 text-sm bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50">
            <Send size={16} />
            {sending ? 'Skickar...' : 'Skicka'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
