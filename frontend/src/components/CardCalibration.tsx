import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, Crosshair, RotateCcw, Upload, X } from 'lucide-react';
import { Rank, Suit } from '../types';
import { RANKS, SUITS, SUIT_SYMBOLS } from '../utils/cards';
import { inspectRegion, loadImageData } from '../utils/cardDetection';
import {
  Bounds,
  CardSlot,
  GlyphTemplate,
  SLOT_COUNTS,
  Signature,
  SlotRole,
  SuitSample,
  addSlot,
  addSuitSample,
  addTemplate,
  clearSlots,
  clearSuitSamples,
  clearTemplates,
  extractBackgroundColor,
  loadSlots,
  loadSuitSamples,
  loadTemplates,
  signatureToDataUrl,
} from '../utils/glyphTemplates';

interface CardCalibrationProps {
  onDone?: (
    slots: CardSlot[],
    templates: GlyphTemplate[],
    suitSamples: SuitSample[]
  ) => void;
  onClose?: () => void;
}

const ROLE_ORDER: SlotRole[] = ['hero', 'villain', 'board'];

const ROLE_LABEL: Record<SlotRole, string> = {
  hero: 'Your hand',
  villain: "Opponent's hand",
  board: 'Board',
};

interface PendingRegion {
  bounds: Bounds;
  signature: Signature | null;
  suit: Suit | null;
}

interface DragState {
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
}

export const CardCalibration: React.FC<CardCalibrationProps> = ({ onDone, onClose }) => {
  const [preview, setPreview] = useState<string | null>(null);
  const [imageData, setImageData] = useState<ImageData | null>(null);
  const [slots, setSlots] = useState<CardSlot[]>(() => loadSlots());
  const [templates, setTemplates] = useState<GlyphTemplate[]>(() => loadTemplates());
  const [suitSamples, setSuitSamples] = useState<SuitSample[]>(() => loadSuitSamples());
  const [target, setTarget] = useState<{ role: SlotRole; index: number }>({
    role: 'hero',
    index: 0,
  });
  const [drag, setDrag] = useState<DragState | null>(null);
  const [pending, setPending] = useState<PendingRegion | null>(null);
  const [error, setError] = useState<string | null>(null);

  const imageRef = useRef<HTMLImageElement>(null);

  const handleFile = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = async e => {
      const src = e.target?.result as string;
      setPreview(src);
      setPending(null);
      setError(null);
      try {
        setImageData(await loadImageData(src));
      } catch {
        setError('Could not read that image.');
      }
    };
    reader.readAsDataURL(file);
  }, []);

  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      for (const item of e.clipboardData.items) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) handleFile(file);
          break;
        }
      }
    },
    [handleFile]
  );

  /** Map a pointer event to coordinates in the image's own pixel space. */
  const toImageCoords = useCallback((clientX: number, clientY: number) => {
    const img = imageRef.current;
    if (!img) return null;
    const rect = img.getBoundingClientRect();
    const scaleX = img.naturalWidth / rect.width;
    const scaleY = img.naturalHeight / rect.height;
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
      displayX: clientX - rect.left,
      displayY: clientY - rect.top,
    };
  }, []);

  const handleMouseDown = (e: React.MouseEvent) => {
    const pos = toImageCoords(e.clientX, e.clientY);
    if (!pos) return;
    e.preventDefault();
    setPending(null);
    setDrag({
      startX: pos.displayX,
      startY: pos.displayY,
      currentX: pos.displayX,
      currentY: pos.displayY,
    });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!drag) return;
    const pos = toImageCoords(e.clientX, e.clientY);
    if (!pos) return;
    setDrag({ ...drag, currentX: pos.displayX, currentY: pos.displayY });
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    if (!drag || !imageData) {
      setDrag(null);
      return;
    }

    const img = imageRef.current;
    const pos = toImageCoords(e.clientX, e.clientY);
    if (!img || !pos) {
      setDrag(null);
      return;
    }

    const rect = img.getBoundingClientRect();
    const scaleX = img.naturalWidth / rect.width;
    const scaleY = img.naturalHeight / rect.height;

    const bounds: Bounds = {
      x: Math.min(drag.startX, pos.displayX) * scaleX,
      y: Math.min(drag.startY, pos.displayY) * scaleY,
      width: Math.abs(pos.displayX - drag.startX) * scaleX,
      height: Math.abs(pos.displayY - drag.startY) * scaleY,
    };

    setDrag(null);

    if (bounds.width < 4 || bounds.height < 4) {
      setError('That box was too small — drag around the rank character.');
      return;
    }

    const { signature, suit } = inspectRegion(imageData, bounds, suitSamples);
    if (!signature) {
      setError('No glyph found in that box. Try a tighter box around the rank.');
      return;
    }

    setError(null);
    setPending({ bounds, signature, suit });
  };

  /**
   * Commit the pending region as a slot, a rank template, and a suit colour.
   *
   * The suit the user picks is ground truth, so we record what that suit's ink
   * actually looks like here rather than relying on a guessed colour rule.
   */
  const commit = (rank: Rank, suit: Suit) => {
    if (!pending || !pending.signature || !imageData) return;

    const slot: CardSlot = {
      role: target.role,
      index: target.index,
      x: pending.bounds.x / imageData.width,
      y: pending.bounds.y / imageData.height,
      width: pending.bounds.width / imageData.width,
      height: pending.bounds.height / imageData.height,
    };

    setSlots(addSlot(slots, slot));
    setTemplates(addTemplate(templates, { rank, suit, signature: pending.signature }));

    // The card face carries the suit, so sample that rather than the white ink.
    const face = extractBackgroundColor(imageData, pending.bounds);
    if (face) {
      setSuitSamples(addSuitSample(suitSamples, { suit, ...face }));
    }

    setPending(null);
    advance();
  };

  /** Move to the next slot that still needs capturing. */
  const advance = () => {
    const next = nextTarget(target, slots);
    if (next) setTarget(next);
  };

  const skip = () => {
    setPending(null);
    advance();
  };

  const reset = () => {
    clearSlots();
    clearTemplates();
    clearSuitSamples();
    setSlots([]);
    setTemplates([]);
    setSuitSamples([]);
    setTarget({ role: 'hero', index: 0 });
    setPending(null);
  };

  const captured = useMemo(
    () => new Set(slots.map(s => `${s.role}:${s.index}`)),
    [slots]
  );

  const taughtRanks = useMemo(
    () => new Set(templates.map(t => t.rank)),
    [templates]
  );

  // Cancel an in-progress drag if the pointer leaves the window.
  useEffect(() => {
    const cancel = () => setDrag(null);
    window.addEventListener('mouseup', cancel);
    return () => window.removeEventListener('mouseup', cancel);
  }, []);

  const dragRect = drag
    ? {
        left: Math.min(drag.startX, drag.currentX),
        top: Math.min(drag.startY, drag.currentY),
        width: Math.abs(drag.currentX - drag.startX),
        height: Math.abs(drag.currentY - drag.startY),
      }
    : null;

  return (
    <div className="bg-gray-800/40 rounded-xl p-4 space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-white font-medium flex items-center gap-2">
          <Crosshair size={18} />
          Teach the detector
        </h3>
        <div className="flex items-center gap-2">
          <button
            onClick={reset}
            className="text-gray-400 hover:text-white p-1"
            title="Clear all calibration"
          >
            <RotateCcw size={16} />
          </button>
          {onClose && (
            <button onClick={onClose} className="text-gray-400 hover:text-white p-1">
              <X size={18} />
            </button>
          )}
        </div>
      </div>

      <p className="text-gray-400 text-sm">
        Drag a box around the <strong className="text-gray-200">rank character</strong> of each
        card — the A, K, 7 and so on. Keep the box{' '}
        <strong className="text-gray-200">inside the card</strong>: its edges sample the card
        colour, which is how the suit is read. You only do this once.
      </p>

      {!preview ? (
        <div
          className="border-2 border-dashed border-gray-600 rounded-lg p-6 text-center cursor-pointer hover:border-gray-500 transition-colors"
          onDragOver={e => e.preventDefault()}
          onDrop={e => {
            e.preventDefault();
            if (e.dataTransfer.files?.[0]) handleFile(e.dataTransfer.files[0]);
          }}
          onPaste={handlePaste}
          onClick={() => document.getElementById('calibration-input')?.click()}
          tabIndex={0}
        >
          <Upload className="mx-auto text-gray-400 mb-2" size={24} />
          <p className="text-gray-300 text-sm">
            Drop a screenshot, paste (Ctrl+V), or click to upload
          </p>
          <p className="text-gray-500 text-xs mt-1">
            Pick one showing as many cards as possible
          </p>
          <input
            id="calibration-input"
            type="file"
            accept="image/*"
            onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])}
            className="hidden"
          />
        </div>
      ) : (
        <>
          <div className="bg-blue-900/30 border border-blue-700 rounded-lg px-3 py-2 text-sm">
            <span className="text-blue-300">Now marking: </span>
            <span className="text-white font-medium">
              {ROLE_LABEL[target.role]} — card {target.index + 1}
            </span>
            <span className="text-gray-400"> of {SLOT_COUNTS[target.role]}</span>
          </div>

          <div className="relative inline-block w-full select-none">
            <img
              ref={imageRef}
              src={preview}
              alt="Calibration screenshot"
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              className="w-full rounded-lg cursor-crosshair"
              draggable={false}
            />
            {dragRect && (
              <div
                className="absolute border-2 border-green-400 bg-green-400/20 pointer-events-none"
                style={{
                  left: dragRect.left,
                  top: dragRect.top,
                  width: dragRect.width,
                  height: dragRect.height,
                }}
              />
            )}
          </div>

          {error && (
            <div className="text-red-300 text-sm bg-red-900/30 rounded p-2">{error}</div>
          )}

          {pending && pending.signature && (
            <div className="bg-gray-900/60 rounded-lg p-3 space-y-3">
              <div className="flex items-center gap-3">
                <img
                  src={signatureToDataUrl(pending.signature)}
                  alt="Extracted glyph"
                  className="rounded border border-gray-600"
                />
                <div className="text-sm">
                  <div className="text-gray-300">This is what the detector sees.</div>
                  <div className="text-gray-400">
                    Suit read as:{' '}
                    {pending.suit ? (
                      <span className={suitClass(pending.suit)}>
                        {SUIT_SYMBOLS[pending.suit]} {suitName(pending.suit)}
                      </span>
                    ) : (
                      <span className="text-yellow-400">unclear</span>
                    )}
                  </div>
                </div>
              </div>

              <div>
                <div className="text-gray-400 text-xs mb-2">
                  Which card is this? Pick the rank, then the suit.
                </div>
                <RankSuitPicker
                  detectedSuit={pending.suit}
                  onPick={commit}
                  taughtRanks={taughtRanks}
                />
              </div>
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={skip}
              className="flex-1 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm"
            >
              Skip this card
            </button>
            <button
              onClick={() => onDone?.(slots, templates, suitSamples)}
              className="flex-1 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm flex items-center justify-center gap-2"
            >
              <Check size={16} />
              Done
            </button>
          </div>

          <Progress
            captured={captured}
            taughtRanks={taughtRanks}
            suitSamples={suitSamples}
            onJump={setTarget}
          />
        </>
      )}
    </div>
  );
};

/** Rank buttons, then suit buttons — two clicks to label a card. */
const RankSuitPicker: React.FC<{
  detectedSuit: Suit | null;
  taughtRanks: Set<Rank>;
  onPick: (rank: Rank, suit: Suit) => void;
}> = ({ detectedSuit, taughtRanks, onPick }) => {
  const [rank, setRank] = useState<Rank | null>(null);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1">
        {RANKS.map(r => (
          <button
            key={r}
            onClick={() => setRank(r)}
            className={`w-9 h-10 rounded text-sm font-bold transition-colors ${
              rank === r
                ? 'bg-blue-600 text-white ring-2 ring-blue-300'
                : taughtRanks.has(r)
                ? 'bg-gray-600 text-gray-200 hover:bg-gray-500'
                : 'bg-white text-gray-900 hover:bg-gray-100'
            }`}
            title={taughtRanks.has(r) ? 'Already taught — picking again replaces it' : undefined}
          >
            {r === 'T' ? '10' : r}
          </button>
        ))}
      </div>

      {rank && (
        <div className="flex gap-2">
          {SUITS.map(s => (
            <button
              key={s}
              onClick={() => onPick(rank, s)}
              className={`flex-1 py-2 rounded text-lg font-bold bg-white hover:bg-gray-100 ${suitClass(
                s
              )} ${detectedSuit === s ? 'ring-2 ring-green-400' : ''}`}
            >
              {SUIT_SYMBOLS[s]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

/** Shows what's captured so far and lets the user jump back to fix a slot. */
const Progress: React.FC<{
  captured: Set<string>;
  taughtRanks: Set<Rank>;
  suitSamples: SuitSample[];
  onJump: (target: { role: SlotRole; index: number }) => void;
}> = ({ captured, taughtRanks, suitSamples, onJump }) => (
  <div className="border-t border-gray-700 pt-3 space-y-2">
    {ROLE_ORDER.map(role => (
      <div key={role} className="flex items-center gap-2">
        <span className="text-gray-400 text-xs w-32 shrink-0">{ROLE_LABEL[role]}</span>
        <div className="flex gap-1">
          {Array.from({ length: SLOT_COUNTS[role] }, (_, i) => (
            <button
              key={i}
              onClick={() => onJump({ role, index: i })}
              className={`w-7 h-7 rounded text-xs font-medium ${
                captured.has(`${role}:${i}`)
                  ? 'bg-green-600 text-white'
                  : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
              }`}
            >
              {i + 1}
            </button>
          ))}
        </div>
      </div>
    ))}
    <div className="text-xs text-gray-500">
      Ranks taught: {taughtRanks.size}/13
      {taughtRanks.size < 13 && (
        <span className="text-gray-600">
          {' '}
          — missing {RANKS.filter(r => !taughtRanks.has(r)).map(r => (r === 'T' ? '10' : r)).join(' ')}
        </span>
      )}
    </div>

    {/* Suits need at least one confirmed sample each before colour matching works. */}
    <div className="text-xs text-gray-500 flex items-center gap-2">
      <span>Suit colours learned:</span>
      {SUITS.map(s => {
        const count = suitSamples.filter(sample => sample.suit === s).length;
        return (
          <span
            key={s}
            className={count > 0 ? 'text-green-400' : 'text-gray-600'}
            title={count > 0 ? `${count} sample${count === 1 ? '' : 's'}` : 'not taught yet'}
          >
            {SUIT_SYMBOLS[s]}
            {count > 0 ? ` ${count}` : ' —'}
          </span>
        );
      })}
    </div>
  </div>
);

/** Next uncaptured slot, scanning forward from the current one. */
function nextTarget(
  current: { role: SlotRole; index: number },
  slots: CardSlot[]
): { role: SlotRole; index: number } | null {
  const taken = new Set(slots.map(s => `${s.role}:${s.index}`));

  const all: { role: SlotRole; index: number }[] = [];
  for (const role of ROLE_ORDER) {
    for (let i = 0; i < SLOT_COUNTS[role]; i++) all.push({ role, index: i });
  }

  const startAt = all.findIndex(t => t.role === current.role && t.index === current.index);

  for (let step = 1; step <= all.length; step++) {
    const candidate = all[(startAt + step) % all.length];
    if (!taken.has(`${candidate.role}:${candidate.index}`)) return candidate;
  }
  return null;
}

function suitClass(suit: Suit): string {
  if (suit === 'h') return 'text-red-600';
  if (suit === 'd') return 'text-blue-600';
  if (suit === 'c') return 'text-green-600';
  return 'text-gray-900';
}

function suitName(suit: Suit): string {
  return { h: 'hearts', d: 'diamonds', c: 'clubs', s: 'spades' }[suit];
}

export default CardCalibration;
