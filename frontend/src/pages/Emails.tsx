import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../utils/api';
import { SentEmail } from '../types';
import { Eye, MessageSquare, Send, Mail } from 'lucide-react';

export default function Emails() {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get('/api/emails/stats?period=30d')
      .then(setStats)
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

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">E-post</h1>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center gap-2 text-blue-600 mb-2">
              <Send size={18} />
              <span className="text-sm text-gray-500">Skickade</span>
            </div>
            <p className="text-2xl font-bold text-gray-900">{stats.sent}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center gap-2 text-green-600 mb-2">
              <Eye size={18} />
              <span className="text-sm text-gray-500">Öppnade</span>
            </div>
            <p className="text-2xl font-bold text-gray-900">{stats.opened}</p>
            <p className="text-xs text-gray-500 mt-1">{stats.openRate}% öppningsgrad</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center gap-2 text-emerald-600 mb-2">
              <MessageSquare size={18} />
              <span className="text-sm text-gray-500">Svar</span>
            </div>
            <p className="text-2xl font-bold text-gray-900">{stats.replied}</p>
            <p className="text-xs text-gray-500 mt-1">{stats.replyRate}% svarsgrad</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center gap-2 text-purple-600 mb-2">
              <Mail size={18} />
              <span className="text-sm text-gray-500">Period</span>
            </div>
            <p className="text-lg font-bold text-gray-900">Senaste 30 dagar</p>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Skicka e-post</h2>
        <p className="text-sm text-gray-500 mb-4">
          Du kan skicka e-post direkt till en kontakt via deras profil, eller via en kampanj.
        </p>
        <div className="flex gap-3">
          <Link
            to="/contacts"
            className="px-4 py-2 text-sm bg-brand-600 text-white rounded-lg hover:bg-brand-700"
          >
            Gå till kontakter
          </Link>
          <Link
            to="/campaigns"
            className="px-4 py-2 text-sm border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
          >
            Gå till kampanjer
          </Link>
        </div>
      </div>
    </div>
  );
}
