'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Box, Flex, VStack, HStack, Text, Input, Button, Spinner,
} from '@chakra-ui/react';
import { colorTokens as c, inputProps } from '@/lib/design-tokens';

/* ─── Types ────────────────────────────────────────────── */
interface ScanResultItem {
  id: string;
  barcode: string | null;
  size: string;
  brand: string;
  season: string;
  pattern: string | null;
  quantity: number;
  price: number | null;
  stockOrdered: number;
  isLocalStock: boolean;
  availableNew: boolean;
}

interface ScanResponse {
  success: boolean;
  barcode: string;
  found: boolean;
  matchType: 'barcode' | 'size-fallback' | null;
  item?: ScanResultItem;
  items: ScanResultItem[];
  message: string;
  error?: string;
}

type ScanState = 'idle' | 'camera-init' | 'camera' | 'scanning' | 'result' | 'error';

/* ─── Barcode detector (native + polyfill) ─────────────── */
interface DetectorResult { rawValue: string; format: string }
interface DetectorLike {
  detect(source: ImageBitmapSource): Promise<DetectorResult[]>;
}

const BARCODE_FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'code_93', 'itf', 'codabar'] as const;

async function getDetector(): Promise<DetectorLike> {
  if (typeof window !== 'undefined' && 'BarcodeDetector' in window) {
    try {
      const native = new (window as /* eslint-disable-line @typescript-eslint/no-explicit-any */ any).BarcodeDetector({
        formats: [...BARCODE_FORMATS],
      });
      if (typeof native.detect === 'function') return native as DetectorLike;
    } catch { /* native broken — fall through to polyfill */ }
  }
  const { BarcodeDetector: Polyfill } = await import('barcode-detector');
  return new Polyfill({ formats: [...BARCODE_FORMATS] }) as unknown as DetectorLike;
}

/* ─── Component ────────────────────────────────────────── */
export function BarcodeScanModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [state, setState] = useState<ScanState>('idle');
  const [manualInput, setManualInput] = useState('');
  const [result, setResult] = useState<ScanResponse | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [cameraStatus, setCameraStatus] = useState('');

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const detectorRef = useRef<DetectorLike | null>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const captureInputRef = useRef<HTMLInputElement>(null);

  /* ─── Cleanup camera ─────────────────────────────────── */
  const stopCamera = useCallback(() => {
    if (scanTimerRef.current) {
      clearInterval(scanTimerRef.current);
      scanTimerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!open) {
      stopCamera();
      setState('idle');
      setManualInput('');
      setResult(null);
      setErrorMsg('');
      setCameraStatus('');
    }
    return () => stopCamera();
  }, [open, stopCamera]);

  /* ─── API lookup ─────────────────────────────────────── */
  const lookupBarcode = async (barcode: string) => {
    setState('scanning');
    setResult(null);
    setErrorMsg('');
    try {
      const res = await fetch('/api/admin/stock/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ barcode }),
      });
      const data: ScanResponse = await res.json();
      if (!res.ok) {
        setState('error');
        setErrorMsg(data.error || data.message || 'Lookup failed');
        return;
      }
      setResult(data);
      setState('result');
    } catch {
      setState('error');
      setErrorMsg('Network error — please try again');
    }
  };

  /* ─── Live camera scan ───────────────────────────────── */
  const startCamera = async () => {
    setCameraStatus('Requesting camera access…');
    setState('camera-init');

    // 1. Get stream
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setState('idle');
      if (msg.includes('Permission') || msg.includes('NotAllowed')) {
        setCameraStatus('Camera permission denied. Allow camera access in your browser settings and try again.');
      } else if (msg.includes('NotFound') || msg.includes('DevicesNotFound')) {
        setCameraStatus('No camera found on this device.');
      } else {
        setCameraStatus(`Camera error: ${msg}`);
      }
      return;
    }

    streamRef.current = stream;

    // 2. Attach stream to video element and wait for actual playback
    const video = videoRef.current;
    if (!video) {
      stopCamera();
      setState('idle');
      setCameraStatus('Video element not available. Please try again.');
      return;
    }

    video.srcObject = stream;
    setCameraStatus('Starting video…');

    try {
      await video.play();
      // Wait until at least one frame is decoded (readyState >= 2)
      if (video.readyState < 2) {
        await new Promise<void>((resolve, reject) => {
          const onData = () => { video.removeEventListener('loadeddata', onData); resolve(); };
          video.addEventListener('loadeddata', onData);
          setTimeout(() => { video.removeEventListener('loadeddata', onData); reject(new Error('timeout')); }, 5000);
        });
      }
    } catch {
      stopCamera();
      setState('idle');
      setCameraStatus('Camera stream started but video failed to play. Try again or use Take Photo / Upload Image.');
      return;
    }

    // 3. Load barcode detector
    setCameraStatus('Loading barcode detector…');
    try {
      detectorRef.current = await getDetector();
    } catch {
      stopCamera();
      setState('idle');
      setCameraStatus('Barcode detection engine failed to load. Use Take Photo or Upload Image instead.');
      return;
    }

    // 4. Everything ready — show camera and start scanning loop
    setCameraStatus('');
    setState('camera');

    const detector = detectorRef.current;
    scanTimerRef.current = setInterval(async () => {
      if (!videoRef.current || videoRef.current.readyState < 2) return;
      try {
        const results = await detector.detect(videoRef.current);
        if (results.length > 0) {
          stopCamera();
          lookupBarcode(results[0].rawValue);
        }
      } catch { /* single frame detection failed — retry next interval */ }
    }, 400);
  };

  /* ─── Image file handler (gallery or capture) ────────── */
  const handleImageFile = async (file: File) => {
    setState('scanning');
    try {
      const detector = detectorRef.current ?? await getDetector();
      detectorRef.current = detector;
      const bitmap = await createImageBitmap(file);
      const results = await detector.detect(bitmap);
      bitmap.close();
      if (results.length > 0) {
        lookupBarcode(results[0].rawValue);
      } else {
        setState('error');
        setErrorMsg('No barcode detected in image. Try a clearer photo or enter the code manually.');
      }
    } catch {
      setState('error');
      setErrorMsg('Failed to process image.');
    }
  };

  /* ─── Manual submit ──────────────────────────────────── */
  const handleManualSubmit = () => {
    const val = manualInput.trim();
    if (!val) return;
    stopCamera();
    lookupBarcode(val);
  };

  /* ─── Scan again ─────────────────────────────────────── */
  const scanAgain = () => {
    stopCamera();
    setState('idle');
    setResult(null);
    setErrorMsg('');
    setCameraStatus('');
    setManualInput('');
  };

  if (!open) return null;

  /* ─── Shared styles ──────────────────────────────────── */
  const overlayStyle: React.CSSProperties = {
    position: 'fixed', inset: 0, zIndex: 9999,
    background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: 16,
  };
  const modalStyle: React.CSSProperties = {
    background: c.surface, borderRadius: 12, border: `1px solid ${c.border}`,
    maxWidth: 520, width: '100%', maxHeight: '90vh', overflowY: 'auto',
    padding: 24,
  };
  const btnPrimary: React.CSSProperties = {
    background: c.accent, color: '#fff', border: 'none', borderRadius: 6,
    padding: '8px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
  };
  const btnSecondary: React.CSSProperties = {
    background: 'transparent', color: c.muted, border: `1px solid ${c.border}`,
    borderRadius: 6, padding: '8px 18px', fontSize: 13, fontWeight: 500, cursor: 'pointer',
  };

  /* Shared file input handler */
  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) handleImageFile(f);
    e.target.value = '';
  };

  return (
    <div style={overlayStyle} onClick={(e) => { if (e.target === e.currentTarget) { stopCamera(); onClose(); } }}>
      <div style={modalStyle}>
        <Flex justify="space-between" align="center" mb={4}>
          <Text fontSize="16px" fontWeight="700" color={c.text}>Scan Barcode</Text>
          <button style={{ ...btnSecondary, padding: '4px 12px', fontSize: 12 }}
            onClick={() => { stopCamera(); onClose(); }}>
            ✕
          </button>
        </Flex>

        {/* Hidden file inputs — gallery vs capture are separate */}
        <input ref={galleryInputRef} type="file" accept="image/*"
          style={{ display: 'none' }} onChange={onFileChange} />
        <input ref={captureInputRef} type="file" accept="image/*" capture="environment"
          style={{ display: 'none' }} onChange={onFileChange} />

        {/* ── Idle: choose method ─────────────────────────── */}
        {state === 'idle' && (
          <VStack gap={3} align="stretch">
            <Text fontSize="13px" color={c.muted}>
              Scan a tyre barcode to look up stock. Choose a method:
            </Text>
            <Flex gap={2} wrap="wrap">
              <button style={btnPrimary} onClick={startCamera}>
                📷 Live Camera
              </button>
              <button style={btnSecondary} onClick={() => captureInputRef.current?.click()}>
                📸 Take Photo
              </button>
              <button style={btnSecondary} onClick={() => galleryInputRef.current?.click()}>
                🖼️ Upload Image
              </button>
            </Flex>
            {cameraStatus && (
              <Box p={3} borderRadius="6px" bg="rgba(245,158,11,0.1)" borderWidth="1px"
                borderColor="rgba(245,158,11,0.3)">
                <Text fontSize="12px" color="#F59E0B">{cameraStatus}</Text>
              </Box>
            )}
            <Box mt={2} pt={3} borderTopWidth="1px" borderColor={c.border}>
              <Text fontSize="12px" color={c.muted} mb={1}>Or enter barcode manually:</Text>
              <Flex gap={2}>
                <Input
                  {...inputProps} size="sm" placeholder="e.g. 5901234123457"
                  value={manualInput}
                  onChange={(e) => setManualInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleManualSubmit(); }}
                  flex="1"
                />
                <Button
                  bg={c.accent} color="white" h="38px" px={4} fontSize="13px"
                  onClick={handleManualSubmit} disabled={!manualInput.trim()}>
                  Search
                </Button>
              </Flex>
            </Box>
          </VStack>
        )}

        {/* ── Camera initializing ─────────────────────────── */}
        {state === 'camera-init' && (
          <VStack gap={3} align="stretch">
            <Box borderRadius="8px" overflow="hidden" bg="black" position="relative">
              <video
                ref={videoRef}
                style={{ width: '100%', height: 280, objectFit: 'cover' }}
                playsInline muted autoPlay
              />
              <Flex position="absolute" inset="0" align="center" justify="center" bg="rgba(0,0,0,0.6)">
                <VStack gap={2}>
                  <Spinner size="md" color="white" />
                  <Text fontSize="12px" color="white">{cameraStatus || 'Initializing…'}</Text>
                </VStack>
              </Flex>
            </Box>
            <button style={btnSecondary} onClick={() => { stopCamera(); setState('idle'); setCameraStatus(''); }}>
              Cancel
            </button>
          </VStack>
        )}

        {/* ── Camera live ─────────────────────────────────── */}
        {state === 'camera' && (
          <VStack gap={3} align="stretch">
            <Box borderRadius="8px" overflow="hidden" bg="black" position="relative">
              <video
                ref={videoRef}
                style={{ width: '100%', height: 280, objectFit: 'cover' }}
                playsInline muted autoPlay
              />
              <Box position="absolute" top="50%" left="10%" right="10%" h="2px" bg={c.accent} opacity={0.7}
                style={{ animation: 'pulse 1.5s ease-in-out infinite' }} />
            </Box>
            <Text fontSize="12px" color={c.muted} textAlign="center">
              Point camera at the barcode label. Detection is automatic.
            </Text>
            <Box pt={2} borderTopWidth="1px" borderColor={c.border}>
              <Text fontSize="12px" color={c.muted} mb={1}>Or type it:</Text>
              <Flex gap={2}>
                <Input
                  {...inputProps} size="sm" placeholder="Enter barcode…"
                  value={manualInput}
                  onChange={(e) => setManualInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleManualSubmit(); }}
                  flex="1"
                />
                <Button
                  bg={c.accent} color="white" h="38px" px={4} fontSize="13px"
                  onClick={handleManualSubmit} disabled={!manualInput.trim()}>
                  Search
                </Button>
              </Flex>
            </Box>
            <button style={btnSecondary} onClick={() => { stopCamera(); setState('idle'); }}>
              Cancel
            </button>
          </VStack>
        )}

        {/* ── Scanning spinner ────────────────────────────── */}
        {state === 'scanning' && (
          <Flex direction="column" align="center" py={8} gap={3}>
            <Spinner size="lg" color={c.accent} />
            <Text fontSize="13px" color={c.muted}>Looking up barcode…</Text>
          </Flex>
        )}

        {/* ── Error state ─────────────────────────────────── */}
        {state === 'error' && (
          <VStack gap={3} align="stretch">
            <Box p={4} borderRadius="8px" bg="rgba(239,68,68,0.1)" borderWidth="1px"
              borderColor="rgba(239,68,68,0.3)">
              <Text fontSize="13px" color="#EF4444" fontWeight="600">Scan Failed</Text>
              <Text fontSize="12px" color="#EF4444" mt={1}>{errorMsg}</Text>
            </Box>
            <HStack gap={2}>
              <button style={btnPrimary} onClick={scanAgain}>Try Again</button>
              <button style={btnSecondary} onClick={() => { stopCamera(); onClose(); }}>Close</button>
            </HStack>
          </VStack>
        )}

        {/* ── Result ──────────────────────────────────────── */}
        {state === 'result' && result && (
          <VStack gap={4} align="stretch">
            <Box p={3} borderRadius="6px" bg={c.card}>
              <Text fontSize="11px" color={c.muted} textTransform="uppercase" letterSpacing="0.05em">
                Barcode
              </Text>
              <Text fontSize="15px" fontWeight="700" color={c.text} fontFamily="monospace">
                {result.barcode}
              </Text>
            </Box>

            {!result.found ? (
              <Box p={4} borderRadius="8px" bg="rgba(239,68,68,0.08)" borderWidth="1px"
                borderColor="rgba(239,68,68,0.25)">
                <Text fontSize="14px" fontWeight="700" color="#EF4444">Not Found in Current Stock</Text>
                <Text fontSize="12px" color={c.muted} mt={1}>
                  No product matches this barcode. It may not be in inventory, or the barcode has not been assigned yet.
                </Text>
              </Box>
            ) : (
              <>
                <Box p={3} borderRadius="6px"
                  bg={result.matchType === 'barcode' ? 'rgba(34,197,94,0.08)' : 'rgba(245,158,11,0.08)'}
                  borderWidth="1px"
                  borderColor={result.matchType === 'barcode' ? 'rgba(34,197,94,0.25)' : 'rgba(245,158,11,0.25)'}>
                  <Text fontSize="12px"
                    color={result.matchType === 'barcode' ? '#22C55E' : '#F59E0B'}
                    fontWeight="600">
                    {result.matchType === 'barcode' ? '✓ Exact Barcode Match' : '⚠ Matched by Size (Fallback)'}
                  </Text>
                  <Text fontSize="11px" color={c.muted} mt={1}>{result.message}</Text>
                </Box>

                {result.items.map((item) => (
                  <Box key={item.id} p={4} borderRadius="8px" bg={c.card}
                    borderWidth="1px" borderColor={c.border}>
                    <Flex justify="space-between" align="start" wrap="wrap" gap={2}>
                      <Box>
                        <Text fontSize="14px" fontWeight="700" color={c.text}>{item.brand}</Text>
                        {item.pattern && (
                          <Text fontSize="12px" color={c.muted}>{item.pattern}</Text>
                        )}
                      </Box>
                      <Box as="span" px={2} py={1} borderRadius="4px" fontSize="11px" fontWeight="600"
                        bg={item.availableNew ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)'}
                        color={item.availableNew ? '#22C55E' : '#EF4444'}>
                        {item.availableNew ? 'Active' : 'Inactive'}
                      </Box>
                    </Flex>

                    <Box mt={3}
                      display="grid"
                      gridTemplateColumns="repeat(auto-fill, minmax(120px, 1fr))"
                      gap="8px">
                      <DetailCell label="Size" value={item.size} />
                      <DetailCell label="Season" value={item.season} />
                      <DetailCell label="Remaining Stock"
                        value={String(item.quantity)}
                        highlight={item.quantity > 0 ? '#22C55E' : '#EF4444'} />
                      <DetailCell label="Ordered" value={String(item.stockOrdered)} />
                      {item.price != null && (
                        <DetailCell label="Price" value={`£${item.price.toFixed(2)}`} highlight={c.accent} />
                      )}
                      <DetailCell label="Local Stock" value={item.isLocalStock ? 'Yes' : 'No'} />
                      {item.barcode && (
                        <DetailCell label="Stored Barcode" value={item.barcode} />
                      )}
                    </Box>
                  </Box>
                ))}

                {result.items.length > 1 && (
                  <Text fontSize="11px" color={c.muted}>
                    Multiple matches found — consider assigning unique barcodes to each product.
                  </Text>
                )}
              </>
            )}

            <HStack gap={2} pt={1}>
              <button style={btnPrimary} onClick={scanAgain}>Scan Again</button>
              <button style={btnSecondary} onClick={() => { stopCamera(); onClose(); }}>Close</button>
            </HStack>
          </VStack>
        )}
      </div>
    </div>
  );
}

/* ─── Small helper ────────────────────────────────────── */
function DetailCell({ label, value, highlight }: { label: string; value: string; highlight?: string }) {
  return (
    <Box>
      <Text fontSize="10px" color={c.muted} textTransform="uppercase" letterSpacing="0.05em">{label}</Text>
      <Text fontSize="13px" fontWeight="600" color={highlight || c.text}>{value}</Text>
    </Box>
  );
}
