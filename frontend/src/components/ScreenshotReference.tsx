import React, { useCallback, useState } from 'react';
import { Upload, X, Image } from 'lucide-react';

interface ScreenshotReferenceProps {
  onImageLoad?: (imageData: string) => void;
}

export const ScreenshotReference: React.FC<ScreenshotReferenceProps> = ({
  onImageLoad,
}) => {
  const [preview, setPreview] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(true);

  const handleFile = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const imageData = e.target?.result as string;
      setPreview(imageData);
      onImageLoad?.(imageData);
    };
    reader.readAsDataURL(file);
  }, [onImageLoad]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files?.[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  }, [handleFile]);

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) handleFile(file);
        break;
      }
    }
  }, [handleFile]);

  const clearPreview = () => {
    setPreview(null);
  };

  return (
    <div className="bg-gray-800/30 rounded-xl p-4">
      <div
        className="flex justify-between items-center cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <h3 className="text-white font-medium flex items-center gap-2">
          <Image size={18} />
          Screenshot Reference
        </h3>
        <span className="text-gray-400 text-sm">
          {isExpanded ? '(click to collapse)' : '(click to expand)'}
        </span>
      </div>

      {isExpanded && (
        <div className="mt-4">
          {preview ? (
            <div className="relative">
              <img
                src={preview}
                alt="Screenshot reference"
                className="w-full rounded-lg max-h-48 object-contain bg-gray-900"
              />
              <button
                onClick={clearPreview}
                className="absolute top-2 right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600"
              >
                <X size={16} />
              </button>
              <p className="text-xs text-gray-400 mt-2 text-center">
                Use this as a reference while selecting cards below
              </p>
            </div>
          ) : (
            <div
              className="border-2 border-dashed border-gray-600 rounded-lg p-6 text-center cursor-pointer hover:border-gray-500 transition-colors"
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              onPaste={handlePaste}
              onClick={() => document.getElementById('screenshot-input')?.click()}
              tabIndex={0}
            >
              <Upload className="mx-auto text-gray-400 mb-2" size={24} />
              <p className="text-gray-300 text-sm">
                Drop screenshot, paste from clipboard, or click to upload
              </p>
              <p className="text-gray-500 text-xs mt-1">
                Use as visual reference while selecting cards
              </p>
              <input
                id="screenshot-input"
                type="file"
                accept="image/*"
                onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
                className="hidden"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ScreenshotReference;
