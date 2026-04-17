import { useRef, useCallback, useEffect, useState } from 'react';
import { Bold, Italic, List, Link, Undo, Redo, Image as ImageIcon } from 'lucide-react';

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  rows?: number;
}

export default function RichTextEditor({ value, onChange, placeholder, rows = 6 }: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const initializedRef = useRef(false);
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  // Set initial content only once on mount
  useEffect(() => {
    if (editorRef.current && !initializedRef.current) {
      editorRef.current.innerHTML = value || '';
      initializedRef.current = true;
    }
  }, [value]);

  const exec = useCallback((command: string, val?: string) => {
    editorRef.current?.focus();
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

  const insertImageFromFile = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) return;
    if (file.size > 5 * 1024 * 1024) {
      alert('Bilden är för stor (max 5 MB)');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUri = reader.result as string;
      editorRef.current?.focus();
      const imgHtml = `<img src="${dataUri}" alt="${file.name}" style="max-width: 100%; height: auto;" />`;
      document.execCommand('insertHTML', false, imgHtml);
      if (editorRef.current) {
        onChange(editorRef.current.innerHTML);
      }
    };
    reader.readAsDataURL(file);
  }, [onChange]);

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    // Check for image in clipboard
    const items = e.clipboardData.items;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        e.preventDefault();
        const file = items[i].getAsFile();
        if (file) insertImageFromFile(file);
        return;
      }
    }

    // Otherwise paste HTML or text
    e.preventDefault();
    const html = e.clipboardData.getData('text/html');
    if (html) {
      document.execCommand('insertHTML', false, html);
    } else {
      const text = e.clipboardData.getData('text/plain');
      document.execCommand('insertText', false, text);
    }
    if (editorRef.current) {
      onChange(editorRef.current.innerHTML);
    }
  }, [onChange, insertImageFromFile]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);
    const files = Array.from(e.dataTransfer.files);
    files.forEach((file) => {
      if (file.type.startsWith('image/')) insertImageFromFile(file);
    });
  }, [insertImageFromFile]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(true);
  }, []);

  const handleDragLeave = useCallback(() => setIsDraggingOver(false), []);

  const handleImageUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) insertImageFromFile(file);
    if (imageInputRef.current) imageInputRef.current.value = '';
  }, [insertImageFromFile]);

  const insertVariable = useCallback((variable: string) => {
    editorRef.current?.focus();
    document.execCommand('insertText', false, `{{${variable}}}`);
    if (editorRef.current) {
      onChange(editorRef.current.innerHTML);
    }
  }, [onChange]);

  return (
    <div className={`border rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-brand-500 focus-within:border-transparent ${isDraggingOver ? 'border-brand-500 ring-2 ring-brand-500' : 'border-gray-300'}`}>
      {/* Toolbar */}
      <div className="flex items-center gap-1 px-2 py-1.5 bg-gray-50 border-b border-gray-200 flex-wrap">
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => exec('bold')} className="p-1.5 rounded hover:bg-gray-200 text-gray-600" title="Fet">
          <Bold size={15} />
        </button>
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => exec('italic')} className="p-1.5 rounded hover:bg-gray-200 text-gray-600" title="Kursiv">
          <Italic size={15} />
        </button>
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => exec('insertUnorderedList')} className="p-1.5 rounded hover:bg-gray-200 text-gray-600" title="Lista">
          <List size={15} />
        </button>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            const url = prompt('Ange URL:');
            if (url) exec('createLink', url);
          }}
          className="p-1.5 rounded hover:bg-gray-200 text-gray-600"
          title="Länk"
        >
          <Link size={15} />
        </button>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => imageInputRef.current?.click()}
          className="p-1.5 rounded hover:bg-gray-200 text-gray-600"
          title="Infoga bild"
        >
          <ImageIcon size={15} />
        </button>

        <div className="w-px h-5 bg-gray-300 mx-1" />

        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => exec('undo')} className="p-1.5 rounded hover:bg-gray-200 text-gray-400" title="Ångra">
          <Undo size={15} />
        </button>
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => exec('redo')} className="p-1.5 rounded hover:bg-gray-200 text-gray-400" title="Gör om">
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
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => insertVariable(v)}
              className="px-2 py-0.5 text-xs bg-brand-50 text-brand-700 rounded hover:bg-brand-100 font-medium"
            >
              {v === 'contact_name' ? 'Namn' : v === 'company' ? 'Företag' : 'Avsändare'}
            </button>
          ))}
        </div>
      </div>

      {/* Hidden file input for image upload */}
      <input
        ref={imageInputRef}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp"
        onChange={handleImageUpload}
        className="hidden"
      />

      {/* Editor area */}
      <div
        ref={editorRef}
        contentEditable
        onInput={handleInput}
        onPaste={handlePaste}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        data-placeholder={placeholder || 'Skriv ditt meddelande...'}
        className="px-3 py-2 text-sm min-h-[120px] max-h-[400px] overflow-y-auto focus:outline-none empty:before:content-[attr(data-placeholder)] empty:before:text-gray-400"
        style={{ minHeight: `${(rows || 6) * 24}px` }}
      />

      {isDraggingOver && (
        <div className="px-3 py-2 text-xs text-brand-700 bg-brand-50 border-t border-brand-200">
          Släpp bilden här för att infoga den
        </div>
      )}
    </div>
  );
}
