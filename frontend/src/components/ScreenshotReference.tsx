import { useCallback, useState } from 'react';
import { Upload, X, Image, Scan, Loader } from 'lucide-react';
import { Card } from '../types';
import { detectCardsFromImage } from '../utils/cardDetection';

interface DetectionResult {
  playerCards: Card[][];
  boardCards: Card[];
}

interface ScreenshotReferenceProps {
  onCardsDetected?: (result: DetectionResult) => void;
  numPlayers?: number;
}

export const ScreenshotReference: React.FC<ScreenshotReferenceProps> = ({
  onCardsDetected,
  numPlayers = 2,
}) => {
  const [preview, setPreview] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(true);
  const [isDetecting, setIsDetecting] = useState(false);
  const [detectionMessage, setDetectionMessage] = useState<string | null>(null);

  const handleFile = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const imageData = e.target?.result as string;
      setPreview(imageData);
      setDetectionMessage(null);
      // Auto-detect when image is loaded
      runDetection(imageData);
    };
    reader.readAsDataURL(file);
  }, [numPlayers]);

  const runDetection = async (imageData: string) => {
    setIsDetecting(true);
    setDetectionMessage('Analyzing screenshot...');

    try {
      const result = await detectCardsFromImage(imageData, numPlayers);

      if (result.success) {
        setDetectionMessage(result.message || 'Detection complete');

        // Convert detected cards to the format expected by parent
        const playerCards: Card[][] = result.playerCards.map(hand =>
          hand.map(dc => dc.card)
        );
        const boardCards: Card[] = result.boardCards.map(dc => dc.card);

        onCardsDetected?.({ playerCards, boardCards });
      } else {
        setDetectionMessage(result.message || 'No cards detected');
      }
    } catch (error) {
      setDetectionMessage('Detection failed. Try a clearer screenshot.');
    } finally {
      setIsDetecting(false);
    }
  };

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
    setDetectionMessage(null);
  };

  const handleRetryDetection = () => {
    if (preview) {
      runDetection(preview);
    }
  };

  return (
    <div className="bg-gray-800/30 rounded-xl p-4">
      <div
        className="flex justify-between items-center cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <h3 className="text-white font-medium flex items-center gap-2">
          <Image size={18} />
          Screenshot Detection
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
                alt="Screenshot"
                className="w-full rounded-lg max-h-64 object-contain bg-gray-900"
              />
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  clearPreview();
                }}
                className="absolute top-2 right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600"
              >
                <X size={16} />
              </button>

              {/* Detection status */}
              <div className="mt-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {isDetecting ? (
                    <Loader className="animate-spin text-blue-400" size={16} />
                  ) : (
                    <Scan className="text-green-400" size={16} />
                  )}
                  <span className="text-sm text-gray-300">
                    {detectionMessage || 'Ready to detect'}
                  </span>
                </div>
                <button
                  onClick={handleRetryDetection}
                  disabled={isDetecting}
                  className="text-sm px-3 py-1 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white rounded transition-colors"
                >
                  {isDetecting ? 'Detecting...' : 'Re-detect'}
                </button>
              </div>

              <p className="text-xs text-gray-500 mt-2">
                Cards will auto-fill below. Adjust any incorrect detections manually.
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
                Drop screenshot, paste (Ctrl+V), or click to upload
              </p>
              <p className="text-gray-500 text-xs mt-1">
                Cards will be auto-detected from your poker screenshot
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
