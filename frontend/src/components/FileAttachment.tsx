import { useState, useRef } from 'react';
import { Paperclip, X, FileText, Image } from 'lucide-react';

export interface AttachmentFile {
  filename: string;
  mimeType: string;
  content: string; // base64 without prefix
  size: number;
}

interface FileAttachmentProps {
  attachments: AttachmentFile[];
  onChange: (attachments: AttachmentFile[]) => void;
}

export default function FileAttachment({ attachments, onChange }: FileAttachmentProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    for (const file of files) {
      if (file.size > 10 * 1024 * 1024) {
        alert(`${file.name} är för stor (max 10 MB)`);
        continue;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = (reader.result as string).split(',')[1]; // strip data:...;base64,
        onChange([...attachments, {
          filename: file.name,
          mimeType: file.type || 'application/octet-stream',
          content: base64,
          size: file.size,
        }]);
      };
      reader.readAsDataURL(file);
    }
    if (inputRef.current) inputRef.current.value = '';
  };

  const remove = (index: number) => {
    onChange(attachments.filter((_, i) => i !== index));
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getIcon = (mimeType: string) => {
    if (mimeType.startsWith('image/')) return <Image size={14} className="text-blue-500" />;
    return <FileText size={14} className="text-gray-500" />;
  };

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        multiple
        onChange={handleFiles}
        className="hidden"
        accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.png,.jpg,.jpeg,.gif,.txt"
      />

      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2">
          {attachments.map((att, i) => (
            <div key={i} className="flex items-center gap-1.5 px-2 py-1 bg-gray-100 rounded-lg text-xs">
              {getIcon(att.mimeType)}
              <span className="text-gray-700 max-w-[150px] truncate">{att.filename}</span>
              <span className="text-gray-400">({formatSize(att.size)})</span>
              <button onClick={() => remove(i)} className="text-gray-400 hover:text-red-500 ml-1">
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
      >
        <Paperclip size={14} />
        Bifoga fil
      </button>
    </div>
  );
}
