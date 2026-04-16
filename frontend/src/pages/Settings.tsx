import { useEffect, useState, useRef } from 'react';
import { api } from '../utils/api';
import RichTextEditor from '../components/RichTextEditor';
import { Settings as SettingsIcon, Save, Check, ImagePlus } from 'lucide-react';

export default function Settings() {
  const [signature, setSignature] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const imageInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api.get<any>('/api/settings')
      .then((data) => setSignature(data.signature || ''))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      await api.put('/api/settings/signature', { signature });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      alert('Bilden är för stor (max 2 MB)');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUri = reader.result as string;
      // Insert image into signature via execCommand on the active editor
      // We'll append it to the signature HTML
      const img = `<img src="${dataUri}" alt="Logo" style="max-width: 200px; max-height: 80px;" />`;
      setSignature((prev) => prev + '<br/>' + img);
    };
    reader.readAsDataURL(file);
    if (imageInputRef.current) imageInputRef.current.value = '';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
        <SettingsIcon size={24} />
        Inställningar
      </h1>

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-1">E-postsignatur</h2>
        <p className="text-sm text-gray-500 mb-4">
          Den här signaturen läggs till automatiskt i slutet av alla mail du skickar.
        </p>

        <RichTextEditor
          value={signature}
          onChange={setSignature}
          placeholder="T.ex: Med vänliga hälsningar, Dennis Demirtok — Flattered AB"
          rows={5}
        />

        <input
          ref={imageInputRef}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp"
          onChange={handleImageUpload}
          className="hidden"
        />

        <div className="flex items-center gap-3 mt-4">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 text-sm bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50"
          >
            {saved ? <Check size={16} /> : <Save size={16} />}
            {saving ? 'Sparar...' : saved ? 'Sparat!' : 'Spara signatur'}
          </button>
          <button
            onClick={() => imageInputRef.current?.click()}
            className="flex items-center gap-2 px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-700"
          >
            <ImagePlus size={16} />
            Lägg till logga/bild
          </button>
          {saved && <span className="text-sm text-green-600">Signaturen är sparad</span>}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-1">Förhandsgranskning</h2>
        <p className="text-sm text-gray-500 mb-4">Så här ser din signatur ut i ett mail:</p>
        <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
          <p className="text-sm text-gray-700 mb-3">Hej Anna,</p>
          <p className="text-sm text-gray-700 mb-3">Tack för ditt intresse...</p>
          {signature ? (
            <div className="border-t border-gray-300 pt-3 mt-3">
              <div className="text-sm text-gray-600" dangerouslySetInnerHTML={{ __html: signature }} />
            </div>
          ) : (
            <p className="text-xs text-gray-400 italic mt-3">Ingen signatur inställd</p>
          )}
        </div>
      </div>
    </div>
  );
}
