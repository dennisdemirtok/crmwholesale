const statusColors: Record<string, string> = {
  active: 'bg-green-100 text-green-800',
  prospect: 'bg-blue-100 text-blue-800',
  churned: 'bg-gray-100 text-gray-800',
  draft: 'bg-yellow-100 text-yellow-800',
  paused: 'bg-orange-100 text-orange-800',
  completed: 'bg-purple-100 text-purple-800',
  replied: 'bg-emerald-100 text-emerald-800',
  cancelled: 'bg-red-100 text-red-800',
  revoked: 'bg-red-100 text-red-800',
  pending: 'bg-yellow-100 text-yellow-800',
};

const statusLabels: Record<string, string> = {
  active: 'Aktiv',
  prospect: 'Prospekt',
  churned: 'Churned',
  draft: 'Utkast',
  paused: 'Pausad',
  completed: 'Klar',
  replied: 'Svarat',
  cancelled: 'Avbruten',
};

export default function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
        statusColors[status] || 'bg-gray-100 text-gray-800'
      }`}
    >
      {statusLabels[status] || status}
    </span>
  );
}
