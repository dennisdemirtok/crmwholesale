import { useRef, useCallback } from 'react';
import { Bold, Italic, List, Link, Type, Undo, Redo } from 'lucide-react';

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  rows?: number;
}

export default function RichTextEditor({ value, onChange, placeholder, rows = 6 }: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);

  const exec = useCallback((command: string, val?: string) => {
    document.execCommand(command, false, val);
    if (editorRef.current) {
      onChange(editorRef.current.innerHTML);
    }
  }, [onChange]);

  const handleInput = useCallback(() => {
    if (editorRef.current) {
      onChange(editorRef.current.innerHTML);
    }
  }, [onChange]);

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    e.preventDefault();
    const text = e.clipboardData.getData('text/plain');
    document.execCommand('insertText', false, text);
  }, []);

  const insertVariable = useCallback((variable: string) => {
    exec('insertText', `{{${variable}}}`);
  }, [exec]);

  return (
    <div className="border border-gray-300 rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-brand-500 focus-within:border-transparent">
      {/* Toolbar */}
      <div className="flex items-center gap-1 px-2 py-1.5 bg-gray-50 border-b border-gray-200 flex-wrap">
        <button type="button" onClick={() => exec('bold')} className="p-1.5 rounded hover:bg-gray-200 text-gray-600" title="Fet">
          <Bold size={15} />
        </button>
        <button type="button" onClick={() => exec('italic')} className="p-1.5 rounded hover:bg-gray-200 text-gray-600" title="Kursiv">
          <Italic size={15} />
        </button>
        <button type="button" onClick={() => exec('insertUnorderedList')} className="p-1.5 rounded hover:bg-gray-200 text-gray-600" title="Lista">
          <List size={15} />
        </button>
        <button
          type="button"
          onClick={() => {
            const url = prompt('Ange URL:');
            if (url) exec('createLink', url);
          }}
          className="p-1.5 rounded hover:bg-gray-200 text-gray-600"
          title="Länk"
        >
          <Link size={15} />
        </button>

        <div className="w-px h-5 bg-gray-300 mx-1" />

        <button type="button" onClick={() => exec('undo')} className="p-1.5 rounded hover:bg-gray-200 text-gray-400" title="Ångra">
          <Undo size={15} />
        </button>
        <button type="button" onClick={() => exec('redo')} className="p-1.5 rounded hover:bg-gray-200 text-gray-400" title="Gör om">
          <Redo size={15} />
        </button>

        <div className="w-px h-5 bg-gray-300 mx-1" />

        {/* Variable buttons */}
        <div className="flex items-center gap-1">
          <span className="text-xs text-gray-400 mr-1">Infoga:</span>
          {['contact_name', 'company', 'sender_name'].map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => insertVariable(v)}
              className="px-2 py-0.5 text-xs bg-brand-50 text-brand-700 rounded hover:bg-brand-100 font-medium"
            >
              {v === 'contact_name' ? 'Namn' : v === 'company' ? 'Företag' : 'Avsändare'}
            </button>
          ))}
        </div>
      </div>

      {/* Editor area */}
      <div
        ref={editorRef}
        contentEditable
        onInput={handleInput}
        onPaste={handlePaste}
        dangerouslySetInnerHTML={{ __html: value }}
        data-placeholder={placeholder || 'Skriv ditt meddelande...'}
        className="px-3 py-2 text-sm min-h-[120px] max-h-[300px] overflow-y-auto focus:outline-none empty:before:content-[attr(data-placeholder)] empty:before:text-gray-400"
        style={{ minHeight: `${(rows || 6) * 24}px` }}
      />
    </div>
  );
}
