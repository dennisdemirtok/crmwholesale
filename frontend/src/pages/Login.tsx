import { Mail } from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || '';

export default function Login() {
  const error = new URLSearchParams(window.location.search).get('error');

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">
            Flattered <span className="text-brand-600">CRM</span>
          </h1>
          <p className="mt-2 text-gray-500">Wholesale Team</p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
          {error && (
            <div className="mb-4 p-3 bg-red-50 text-red-700 text-sm rounded-lg">
              Inloggningen misslyckades. Kontrollera att du har ett @flattered.se-konto.
            </div>
          )}

          <a
            href={`${API_URL}/auth/google/start`}
            className="flex items-center justify-center gap-3 w-full px-4 py-3 bg-brand-600 text-white rounded-lg font-medium hover:bg-brand-700 transition-colors"
          >
            <Mail size={20} />
            Logga in med Google
          </a>

          <p className="mt-4 text-xs text-gray-400 text-center">
            Endast @flattered.se Google Workspace-konton
          </p>
        </div>
      </div>
    </div>
  );
}
