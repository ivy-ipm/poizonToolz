import { useState, useRef, useCallback, useEffect } from "react";
import { Upload, Download, ImageIcon, RefreshCw, Sliders } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

// --- Protobuf helpers ---
function encodeVarint(value: number): number[] {
  const bytes: number[] = [];
  while (value >= 0x80) {
    bytes.push((value & 0x7f) | 0x80);
    value >>>= 7;
  }
  bytes.push(value);
  return bytes;
}
function encodeTag(field: number, wire: number) {
  return encodeVarint((field << 3) | wire);
}
function encodeVarintField(field: number, value: number) {
  return [...encodeTag(field, 0), ...encodeVarint(value)];
}
function encodeFloat(v: number): number[] {
  const ab = new ArrayBuffer(4);
  new DataView(ab).setFloat32(0, v, true);
  return Array.from(new Uint8Array(ab));
}
function encodeFloatField(field: number, v: number) {
  return [...encodeTag(field, 5), ...encodeFloat(v)];
}
function encodeLen(field: number, data: number[]) {
  return [...encodeTag(field, 2), ...encodeVarint(data.length), ...data];
}
function encodeString(field: number, s: string) {
  const bytes = Array.from(new TextEncoder().encode(s));
  return encodeLen(field, bytes);
}
function encodeVec3(x: number, y: number, z: number) {
  return [
    ...encodeFloatField(1, x),
    ...encodeFloatField(2, y),
    ...encodeFloatField(3, z),
  ];
}

function encodeBlock(x: number, z: number, r: number, g: number, b: number): number[] {
  const inner: number[] = [
    ...encodeVarintField(1, 1000),
    ...encodeVarintField(2, 8),
    ...encodeLen(3, encodeVec3(x, 0.5, z)),
    ...encodeLen(4, encodeVec3(1, 1, 1)),
    ...encodeLen(5, [
      ...encodeFloatField(1, 0),
      ...encodeFloatField(2, 0),
      ...encodeFloatField(3, 0),
      ...encodeFloatField(4, -1),
    ]),
    ...encodeLen(6, encodeVec3(r / 255, g / 255, b / 255)),
  ];
  return encodeLen(6, encodeLen(3, inner));
}

function buildLevel(
  title: string,
  pixels: Array<{ x: number; z: number; r: number; g: number; b: number }>
): Uint8Array {
  const offsetX = 0;
  const offsetZ = 0;
  const header: number[] = [
    ...encodeVarintField(1, 6),
    ...encodeString(2, title),
    ...encodeString(3, "poizonTools"),
    ...encodeVarintField(5, pixels.length),
  ];
  const blocks: number[] = [];
  for (const px of pixels) {
    blocks.push(...encodeBlock(px.x - offsetX, px.z - offsetZ, px.r, px.g, px.b));
  }
  return new Uint8Array([...header, ...blocks]);
}

// --- Color quantization ---
const PICO8: [number, number, number][] = [
  [0, 0, 0], [29, 43, 83], [126, 37, 83], [0, 135, 81],
  [171, 82, 54], [95, 87, 79], [194, 195, 199], [255, 241, 232],
  [255, 0, 77], [255, 163, 0], [255, 236, 39], [0, 228, 54],
  [41, 173, 255], [131, 118, 156], [255, 119, 168], [255, 204, 170],
];

function colorDist(r1: number, g1: number, b1: number, r2: number, g2: number, b2: number) {
  return (r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2;
}

function quantizeTopalette(
  r: number, g: number, b: number,
  palette: [number, number, number][]
): [number, number, number] {
  let best = palette[0];
  let bestDist = Infinity;
  for (const c of palette) {
    const d = colorDist(r, g, b, c[0], c[1], c[2]);
    if (d < bestDist) { bestDist = d; best = c; }
  }
  return best;
}

function buildAutoPalette(imageData: ImageData, count: number): [number, number, number][] {
  const step = Math.max(1, Math.floor(imageData.data.length / 4 / 1000));
  const buckets = new Map<string, { r: number; g: number; b: number; count: number }>();
  const q = Math.max(1, Math.round(256 / Math.cbrt(count)));
  for (let i = 0; i < imageData.data.length; i += 4 * step) {
    if (imageData.data[i + 3] < 128) continue;
    const r = Math.round(imageData.data[i] / q) * q;
    const g = Math.round(imageData.data[i + 1] / q) * q;
    const b = Math.round(imageData.data[i + 2] / q) * q;
    const key = `${r},${g},${b}`;
    const existing = buckets.get(key);
    if (existing) existing.count++;
    else buckets.set(key, { r, g, b, count: 1 });
  }
  return Array.from(buckets.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, count)
    .map(({ r, g, b }) => [r, g, b]);
}

// --- Main component ---
type PaletteMode = "pico8" | "auto16" | "auto32" | "auto64";
type GridSize = 16 | 32 | 48 | 64;

interface ProcessedPixel { x: number; z: number; r: number; g: number; b: number }

const GRID_SIZES: GridSize[] = [16, 32, 48, 64];
const PALETTE_OPTIONS: { value: PaletteMode; label: string }[] = [
  { value: "pico8", label: "PICO-8 (16)" },
  { value: "auto16", label: "Auto (16)" },
  { value: "auto32", label: "Auto (32)" },
  { value: "auto64", label: "Auto (64)" },
];

export default function PixelArt() {
  const { toast } = useToast();
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [gridSize, setGridSize] = useState<GridSize>(32);
  const [paletteMode, setPaletteMode] = useState<PaletteMode>("auto32");
  const [pixels, setPixels] = useState<ProcessedPixel[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [zoom, setZoom] = useState(8);
  const [isProcessing, setIsProcessing] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const hiddenCanvasRef = useRef<HTMLCanvasElement>(null);
  const originalImageRef = useRef<HTMLImageElement | null>(null);

  const processImage = useCallback(() => {
    if (!imageSrc || !hiddenCanvasRef.current || !previewCanvasRef.current) return;
    setIsProcessing(true);

    const img = originalImageRef.current;
    if (!img) { setIsProcessing(false); return; }

    const hidden = hiddenCanvasRef.current;
    hidden.width = gridSize;
    hidden.height = gridSize;
    const ctx = hidden.getContext("2d", { willReadFrequently: true })!;
    ctx.clearRect(0, 0, gridSize, gridSize);
    ctx.drawImage(img, 0, 0, gridSize, gridSize);
    const imageData = ctx.getImageData(0, 0, gridSize, gridSize);

    let palette: [number, number, number][];
    if (paletteMode === "pico8") palette = PICO8;
    else {
      const count = paletteMode === "auto16" ? 16 : paletteMode === "auto32" ? 32 : 64;
      palette = buildAutoPalette(imageData, count);
      if (palette.length === 0) palette = PICO8;
    }

    const processed: ProcessedPixel[] = [];
    const offsetX = Math.floor(gridSize / 2);
    const offsetZ = Math.floor(gridSize / 2);

    for (let y = 0; y < gridSize; y++) {
      for (let x = 0; x < gridSize; x++) {
        const idx = (y * gridSize + x) * 4;
        const a = imageData.data[idx + 3];
        if (a < 128) continue;
        const [r, g, b] = quantizeTopalette(
          imageData.data[idx], imageData.data[idx + 1], imageData.data[idx + 2],
          palette
        );
        imageData.data[idx] = r;
        imageData.data[idx + 1] = g;
        imageData.data[idx + 2] = b;
        processed.push({ x: x - offsetX, z: y - offsetZ, r, g, b });
      }
    }

    setPixels(processed);

    const preview = previewCanvasRef.current;
    const cellSize = zoom;
    preview.width = gridSize * cellSize;
    preview.height = gridSize * cellSize;
    const pctx = preview.getContext("2d")!;
    pctx.clearRect(0, 0, preview.width, preview.height);

    for (let y = 0; y < gridSize; y++) {
      for (let x = 0; x < gridSize; x++) {
        const idx = (y * gridSize + x) * 4;
        const r = imageData.data[idx];
        const g = imageData.data[idx + 1];
        const b = imageData.data[idx + 2];
        const a = imageData.data[idx + 3];
        if (a < 128) continue;
        pctx.fillStyle = `rgb(${r},${g},${b})`;
        pctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
      }
    }

    if (cellSize >= 4) {
      pctx.strokeStyle = "rgba(0,0,0,0.15)";
      pctx.lineWidth = 0.5;
      for (let x = 0; x <= gridSize; x++) {
        pctx.beginPath(); pctx.moveTo(x * cellSize, 0); pctx.lineTo(x * cellSize, preview.height); pctx.stroke();
      }
      for (let y = 0; y <= gridSize; y++) {
        pctx.beginPath(); pctx.moveTo(0, y * cellSize); pctx.lineTo(preview.width, y * cellSize); pctx.stroke();
      }
    }

    setIsProcessing(false);
  }, [imageSrc, gridSize, paletteMode, zoom]);

  useEffect(() => {
    if (imageSrc) processImage();
  }, [imageSrc, gridSize, paletteMode, zoom, processImage]);

  const loadFile = (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast({ title: "Invalid file", description: "Please upload an image file.", variant: "destructive" });
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const src = e.target?.result as string;
      const img = new Image();
      img.onload = () => {
        originalImageRef.current = img;
        setImageSrc(src);
      };
      img.src = src;
    };
    reader.readAsDataURL(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) loadFile(file);
  };

  const downloadPNG = () => {
    if (!previewCanvasRef.current) return;
    const a = document.createElement("a");
    a.href = previewCanvasRef.current.toDataURL("image/png");
    a.download = `pixel-art-${gridSize}x${gridSize}.png`;
    a.click();
    toast({ title: "PNG downloaded!" });
  };

  const downloadLevel = () => {
    if (pixels.length === 0) return;
    const data = buildLevel(`Pixel Art ${gridSize}x${gridSize}`, pixels);
    const blob = new Blob([data], { type: "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pixel-art-${gridSize}x${gridSize}.level`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: ".level downloaded!", description: `${pixels.length} blocks encoded.` });
  };

  return (
    <div className="flex-1 flex flex-col">
      <div className="border-b border-border px-6 py-4">
        <h1 className="text-lg font-semibold text-foreground">Image to Pixel Art</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Convert any image into pixel art and export it as a GRAB VR{" "}
          <code className="text-xs font-mono bg-muted px-1 py-0.5 rounded">.level</code> file.
        </p>
      </div>

      <div className="flex-1 max-w-3xl w-full mx-auto px-6 py-8 flex flex-col gap-6">
        {/* Upload zone */}
        {!imageSrc && (
          <div
            className={`border-2 border-dashed rounded-xl p-12 text-center transition-colors cursor-pointer ${
              isDragging
                ? "border-primary bg-primary/5"
                : "border-border hover:border-primary/50 hover:bg-muted/30"
            }`}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            data-testid="dropzone-image"
          >
            <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
              <ImageIcon className="w-7 h-7 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium text-foreground">Drop an image here or click to upload</p>
            <p className="text-xs text-muted-foreground mt-1">PNG, JPG, GIF, WebP supported</p>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) loadFile(f); }}
              data-testid="input-image-file"
            />
          </div>
        )}

        {imageSrc && (
          <>
            {/* Controls */}
            <Card className="border-card-border bg-card">
              <CardContent className="pt-5 pb-5 flex flex-col gap-5">
                <div className="flex flex-wrap gap-6">
                  {/* Grid size */}
                  <div className="flex flex-col gap-2 min-w-[160px]">
                    <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Grid Size</Label>
                    <div className="flex gap-1.5">
                      {GRID_SIZES.map((s) => (
                        <Button
                          key={s}
                          size="sm"
                          variant={gridSize === s ? "default" : "outline"}
                          className="h-8 px-3 text-xs"
                          onClick={() => setGridSize(s)}
                          data-testid={`button-grid-${s}`}
                        >
                          {s}x{s}
                        </Button>
                      ))}
                    </div>
                  </div>

                  {/* Palette */}
                  <div className="flex flex-col gap-2 min-w-[200px]">
                    <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Color Palette</Label>
                    <div className="flex gap-1.5 flex-wrap">
                      {PALETTE_OPTIONS.map(({ value, label }) => (
                        <Button
                          key={value}
                          size="sm"
                          variant={paletteMode === value ? "default" : "outline"}
                          className="h-8 px-3 text-xs"
                          onClick={() => setPaletteMode(value)}
                          data-testid={`button-palette-${value}`}
                        >
                          {label}
                        </Button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Zoom */}
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                      <Sliders className="w-3 h-3" /> Preview Zoom
                    </Label>
                    <span className="text-xs text-muted-foreground">{zoom}x</span>
                  </div>
                  <Slider
                    min={4}
                    max={16}
                    step={2}
                    value={[zoom]}
                    onValueChange={([v]) => setZoom(v)}
                    className="w-full"
                    data-testid="slider-zoom"
                  />
                </div>
              </CardContent>
            </Card>

            {/* Preview */}
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-foreground">Preview</span>
                  <span className="text-xs text-muted-foreground">
                    {pixels.length} blocks · {gridSize}×{gridSize}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 gap-1.5 text-muted-foreground"
                    onClick={() => { setImageSrc(null); setPixels([]); }}
                    data-testid="button-clear-image"
                  >
                    <Upload className="w-3.5 h-3.5" /> Change image
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 gap-1.5"
                    onClick={processImage}
                    disabled={isProcessing}
                    data-testid="button-reprocess"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isProcessing ? "animate-spin" : ""}`} />
                    Reprocess
                  </Button>
                </div>
              </div>

              <Card className="border-card-border bg-card overflow-hidden">
                <div className="overflow-auto p-2">
                  <canvas
                    ref={previewCanvasRef}
                    style={{ imageRendering: "pixelated", display: "block" }}
                    data-testid="canvas-preview"
                  />
                </div>
              </Card>

              {/* Downloads */}
              <div className="flex gap-2">
                <Button
                  className="flex-1 gap-2"
                  variant="outline"
                  onClick={downloadPNG}
                  disabled={pixels.length === 0}
                  data-testid="button-download-png"
                >
                  <Download className="w-4 h-4" />
                  Download PNG
                </Button>
                <Button
                  className="flex-1 gap-2"
                  onClick={downloadLevel}
                  disabled={pixels.length === 0}
                  data-testid="button-download-level"
                >
                  <Download className="w-4 h-4" />
                  Download .level
                </Button>
              </div>

              <p className="text-xs text-muted-foreground text-center">
                The .level file uses GRAB VR's protobuf format with {pixels.length} colored blocks.
                Import it in-game via the level editor.
              </p>
            </div>
          </>
        )}

        {/* Hidden processing canvas */}
        <canvas ref={hiddenCanvasRef} className="hidden" />
      </div>
    </div>
  );
}
