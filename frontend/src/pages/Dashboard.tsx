import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../utils/api';
import { DashboardData } from '../types';
import StatusBadge from '../components/StatusBadge';
import {
  Send,
  Eye,
  MessageSquare,
  Users,
  Megaphone,
  ArrowRight,
  Clock,
} from 'lucide-react';

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<DashboardData>('/api/dashboard')
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" />
      </div>
    );
  }

  if (!data) return <p className="text-gray-500">Kunde inte ladda dashboard.</p>;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>

      {/* Stats cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={<Send size={20} />}
          label="Skickade (30d)"
          value={data.emailStats.sent}
          color="blue"
        />
        <StatCard
          icon={<Eye size={20} />}
          label="Öppningsgrad"
          value={`${data.emailStats.openRate}%`}
          sub={`${data.emailStats.opened} öppnade`}
          color="green"
        />
        <StatCard
          icon={<MessageSquare size={20} />}
          label="Svarsgrad"
          value={`${data.emailStats.replyRate}%`}
          sub={`${data.emailStats.replied} svar`}
          color="purple"
        />
        <StatCard
          icon={<Users size={20} />}
          label="Kontakter"
          value={data.contactStats.total}
          sub={`${data.contactStats.active} aktiva`}
          color="orange"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Active campaigns */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900 flex items-center gap-2">
              <Megaphone size={18} />
              Aktiva kampanjer
            </h2>
            <Link to="/campaigns" className="text-sm text-brand-600 hover:text-brand-700 flex items-center gap-1">
              Visa alla <ArrowRight size={14} />
            </Link>
          </div>
          {data.campaigns.length === 0 ? (
            <p className="text-sm text-gray-500">Inga aktiva kampanjer</p>
          ) : (
            <ul className="space-y-2">
              {data.campaigns.map((c) => (
                <li key={c.id}>
                  <Link
                    to={`/campaigns/${c.id}`}
                    className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    <span className="text-sm font-medium text-gray-900">{c.name}</span>
                    <StatusBadge status={c.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Needs attention */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold text-gray-900 flex items-center gap-2 mb-4">
            <MessageSquare size={18} />
            Svar att hantera
          </h2>
          {data.needsAttention.length === 0 ? (
            <p className="text-sm text-gray-500">Inga svar att hantera just nu</p>
          ) : (
            <ul className="space-y-2">
              {data.needsAttention.map((e) => (
                <li
                  key={e.id}
                  className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50"
                >
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {e.contacts?.contact_name}
                    </p>
                    <p className="text-xs text-gray-500">
                      {e.contacts?.company} — {e.campaigns?.name}
                    </p>
                  </div>
                  <StatusBadge status="replied" />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Recent activity */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="font-semibold text-gray-900 flex items-center gap-2 mb-4">
          <Clock size={18} />
          Senaste aktivitet
        </h2>
        {data.recentActivity.length === 0 ? (
          <p className="text-sm text-gray-500">Ingen aktivitet ännu</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b border-gray-100">
                  <th className="pb-2 font-medium">Kontakt</th>
                  <th className="pb-2 font-medium">Ämne</th>
                  <th className="pb-2 font-medium">Skickat</th>
                  <th className="pb-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {data.recentActivity.map((email) => (
                  <tr key={email.id} className="hover:bg-gray-50">
                    <td className="py-2.5">
                      <p className="font-medium text-gray-900">
                        {email.contacts?.contact_name}
                      </p>
                      <p className="text-xs text-gray-500">{email.contacts?.company}</p>
                    </td>
                    <td className="py-2.5 text-gray-700">{email.subject}</td>
                    <td className="py-2.5 text-gray-500">
                      {new Date(email.sent_at).toLocaleDateString('sv-SE')}
                    </td>
                    <td className="py-2.5">
                      {email.replied_at ? (
                        <StatusBadge status="replied" />
                      ) : email.opened_at ? (
                        <span className="text-xs text-green-600">Öppnat</span>
                      ) : (
                        <span className="text-xs text-gray-400">Skickat</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  sub,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  sub?: string;
  color: string;
}) {
  const colorClasses: Record<string, string> = {
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-green-50 text-green-600',
    purple: 'bg-purple-50 text-purple-600',
    orange: 'bg-orange-50 text-orange-600',
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-center gap-3 mb-3">
        <div className={`p-2 rounded-lg ${colorClasses[color]}`}>{icon}</div>
        <span className="text-sm text-gray-500">{label}</span>
      </div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      {sub && <p className="text-xs text-gray-500 mt-1">{sub}</p>}
    </div>
  );
}
