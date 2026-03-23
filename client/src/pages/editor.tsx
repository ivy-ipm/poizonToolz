import { useState, useRef, useCallback, Suspense, Component, ErrorInfo } from "react";
import { Canvas, ThreeEvent } from "@react-three/fiber";
import { OrbitControls, Grid, GizmoHelper, GizmoViewport } from "@react-three/drei";
import * as THREE from "three";
import {
  decodeLevel, encodeLevel, newLevel, newBlock, levelToJson, jsonToLevel,
  type GrabLevel, type GrabBlock,
} from "@/lib/protobuf";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  FolderOpen, Save, FileJson, Trash2, Plus, Layers,
  MousePointer, Hammer, ChevronDown, ChevronUp,
} from "lucide-react";

// ---- WebGL Error Boundary ----
class WebGLErrorBoundary extends Component<
  { children: React.ReactNode },
  { error: string | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { error: error.message };
  }
  componentDidCatch(_err: Error, _info: ErrorInfo) {}
  render() {
    if (this.state.error) {
      return (
        <div className="w-full h-full flex items-center justify-center bg-[#0d1117] text-muted-foreground flex-col gap-3 p-8 text-center">
          <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center">
            <Layers className="w-6 h-6" />
          </div>
          <p className="text-sm font-medium">3D viewport requires WebGL</p>
          <p className="text-xs opacity-60 max-w-xs">
            Your browser or environment does not support WebGL. You can still edit levels using the JSON editor in the sidebar.
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}

// ---- Block types known to GRAB VR ----
const BLOCK_TYPES: { type: number; label: string }[] = [
  { type: 1000, label: "Cube" },
  { type: 1001, label: "Ramp" },
  { type: 1002, label: "Corner Ramp" },
  { type: 1003, label: "Cylinder" },
];

type Tool = "select" | "place" | "delete";

// ---- 3D Components ----

function Block({
  block, selected, tool, onClick,
}: {
  block: GrabBlock;
  selected: boolean;
  tool: Tool;
  onClick: (id: string) => void;
}) {
  const meshRef = useRef<THREE.Mesh>(null!);
  const [hovered, setHovered] = useState(false);

  const [r, g, b] = block.color;
  const color = new THREE.Color(r / 255, g / 255, b / 255);
  const [px, py, pz] = block.position;
  const [sx, sy, sz] = block.scale;
  const [qx, qy, qz, qw] = block.rotation;
  const quat = new THREE.Quaternion(qx, qy, qz, qw === -1 ? 1 : qw);

  const emissiveIntensity = selected ? 0.35 : hovered ? 0.15 : 0;

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    onClick(block.id);
  };

  return (
    <mesh
      ref={meshRef}
      position={[px, py, pz]}
      scale={[sx, sy, sz]}
      quaternion={quat}
      onClick={handleClick}
      onPointerOver={(e) => { e.stopPropagation(); setHovered(true); document.body.style.cursor = tool === "delete" ? "crosshair" : "pointer"; }}
      onPointerOut={() => { setHovered(false); document.body.style.cursor = "default"; }}
      castShadow
      receiveShadow
    >
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial
        color={color}
        emissive={selected ? new THREE.Color(0x00d4e8) : hovered ? new THREE.Color(0xffffff) : new THREE.Color(0x000000)}
        emissiveIntensity={emissiveIntensity}
        roughness={0.6}
        metalness={0.1}
      />
    </mesh>
  );
}

// Ghost block that follows the mouse on the ground grid
function GhostBlock({
  color, gridPos,
}: { color: [number, number, number]; gridPos: [number, number] | null }) {
  if (!gridPos) return null;
  const [r, g, b] = color;
  const col = new THREE.Color(r / 255, g / 255, b / 255);
  return (
    <mesh position={[gridPos[0], 0.5, gridPos[1]]}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color={col} transparent opacity={0.4} />
    </mesh>
  );
}

// Infinite ground plane for raycasting when placing
function PlacementPlane({
  visible, onMove, onClick,
}: { visible: boolean; onMove: (pos: [number, number]) => void; onClick: (pos: [number, number]) => void }) {
  const handleMove = (e: ThreeEvent<PointerEvent>) => {
    if (!visible) return;
    const x = Math.round(e.point.x);
    const z = Math.round(e.point.z);
    onMove([x, z]);
  };
  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    if (!visible) return;
    e.stopPropagation();
    const x = Math.round(e.point.x);
    const z = Math.round(e.point.z);
    onClick([x, z]);
  };
  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, 0, 0]}
      onPointerMove={handleMove}
      onClick={handleClick}
      visible={false}
    >
      <planeGeometry args={[200, 200]} />
      <meshBasicMaterial side={THREE.DoubleSide} />
    </mesh>
  );
}

function Scene({
  level, selectedId, tool, placeColor,
  onSelectBlock, onDeleteBlock, onPlaceBlock,
}: {
  level: GrabLevel;
  selectedId: string | null;
  tool: Tool;
  placeColor: [number, number, number];
  onSelectBlock: (id: string) => void;
  onDeleteBlock: (id: string) => void;
  onPlaceBlock: (pos: [number, number]) => void;
}) {
  const [ghostPos, setGhostPos] = useState<[number, number] | null>(null);

  const handleBlockClick = (id: string) => {
    if (tool === "delete") {
      onDeleteBlock(id);
    } else {
      onSelectBlock(id);
    }
  };

  return (
    <>
      <ambientLight intensity={0.5} />
      <directionalLight
        position={[10, 20, 10]}
        intensity={1.2}
        castShadow
        shadow-mapSize={[2048, 2048]}
      />
      <directionalLight position={[-10, 10, -10]} intensity={0.3} />

      <Grid
        args={[40, 40]}
        position={[0, 0, 0]}
        cellSize={1}
        cellThickness={0.5}
        cellColor="#334155"
        sectionSize={5}
        sectionThickness={1}
        sectionColor="#475569"
        fadeDistance={60}
        infiniteGrid
      />

      {level.blocks.map((block) => (
        <Block
          key={block.id}
          block={block}
          selected={block.id === selectedId}
          tool={tool}
          onClick={handleBlockClick}
        />
      ))}

      {tool === "place" && (
        <>
          <GhostBlock color={placeColor} gridPos={ghostPos} />
          <PlacementPlane
            visible
            onMove={setGhostPos}
            onClick={onPlaceBlock}
          />
        </>
      )}

      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.05}
        mouseButtons={{
          LEFT: tool !== "place" ? THREE.MOUSE.ROTATE : undefined,
          MIDDLE: THREE.MOUSE.DOLLY,
          RIGHT: THREE.MOUSE.PAN,
        }}
      />

      <GizmoHelper alignment="bottom-right" margin={[80, 80]}>
        <GizmoViewport axisColors={["#ef4444", "#22c55e", "#3b82f6"]} labelColor="white" />
      </GizmoHelper>
    </>
  );
}

// ---- Utility ----
function hexToRgb(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return [r, g, b];
}
function rgbToHex(r: number, g: number, b: number) {
  return "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");
}

// ---- Main Editor Page ----
export default function Editor() {
  const { toast } = useToast();
  const [level, setLevel] = useState<GrabLevel>(newLevel);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tool, setTool] = useState<Tool>("place");
  const [placeColor, setPlaceColor] = useState<[number, number, number]>([100, 180, 255]);
  const [placeBlockType, setPlaceBlockType] = useState(1000);
  const [jsonOpen, setJsonOpen] = useState(false);
  const [jsonText, setJsonText] = useState(() => levelToJson(newLevel()));
  const [jsonError, setJsonError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const selectedBlock = level.blocks.find((b) => b.id === selectedId) ?? null;

  // Sync JSON view when level changes externally
  const syncJson = useCallback((lv: GrabLevel) => {
    setJsonText(levelToJson(lv));
    setJsonError(null);
  }, []);

  const updateLevel = useCallback((lv: GrabLevel) => {
    setLevel(lv);
    syncJson(lv);
  }, [syncJson]);

  const handlePlaceBlock = useCallback((pos: [number, number]) => {
    setLevel((prev) => {
      const block = newBlock({
        blockType: placeBlockType,
        variant: 8,
        position: [pos[0], 0.5, pos[1]],
        color: [...placeColor],
      });
      const next = { ...prev, blocks: [...prev.blocks, block] };
      syncJson(next);
      return next;
    });
  }, [placeColor, placeBlockType, syncJson]);

  const handleDeleteBlock = useCallback((id: string) => {
    setLevel((prev) => {
      const next = { ...prev, blocks: prev.blocks.filter((b) => b.id !== id) };
      syncJson(next);
      if (selectedId === id) setSelectedId(null);
      return next;
    });
  }, [selectedId, syncJson]);

  const handleSelectBlock = useCallback((id: string) => {
    setSelectedId((prev) => prev === id ? null : id);
  }, []);

  const handleNewLevel = () => {
    const lv = newLevel();
    setSelectedId(null);
    updateLevel(lv);
    toast({ title: "New level created" });
  };

  const handleOpenLevel = () => fileInputRef.current?.click();

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const buf = await file.arrayBuffer();
      const lv = decodeLevel(new Uint8Array(buf));
      lv.blocks.forEach((b) => { if (!b.id) b.id = `b${Math.random()}`; });
      setSelectedId(null);
      updateLevel(lv);
      toast({ title: "Level loaded", description: `"${lv.title}" — ${lv.blocks.length} blocks` });
    } catch (err) {
      toast({ title: "Failed to open level", description: String(err), variant: "destructive" });
    }
    e.target.value = "";
  };

  const handleExportLevel = () => {
    const bytes = encodeLevel(level);
    const blob = new Blob([bytes], { type: "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${level.title || "level"}.level`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "Exported .level file" });
  };

  const handleExportJson = () => {
    const blob = new Blob([levelToJson(level)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${level.title || "level"}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "Exported JSON" });
  };

  const handleApplyJson = () => {
    try {
      const lv = jsonToLevel(jsonText);
      setLevel(lv);
      setSelectedId(null);
      setJsonError(null);
      toast({ title: "JSON applied" });
    } catch (err) {
      setJsonError(String(err));
    }
  };

  const updateSelectedProp = (key: keyof GrabBlock, value: unknown) => {
    if (!selectedId) return;
    setLevel((prev) => {
      const blocks = prev.blocks.map((b) =>
        b.id === selectedId ? { ...b, [key]: value } : b
      );
      const next = { ...prev, blocks };
      syncJson(next);
      return next;
    });
  };

  const colorHex = rgbToHex(...placeColor);
  const selectedHex = selectedBlock ? rgbToHex(...selectedBlock.color) : "#ffffff";

  return (
    <div className="flex flex-col" style={{ height: "calc(100vh - 0px)" }}>
      {/* Toolbar */}
      <div className="border-b border-border px-4 py-2 flex items-center gap-2 bg-card flex-shrink-0">
        <span className="font-semibold text-sm text-foreground mr-2">Level Editor</span>
        <Button size="sm" variant="outline" className="gap-1.5 h-7 text-xs" onClick={handleNewLevel} data-testid="button-editor-new">
          <Plus className="w-3 h-3" /> New
        </Button>
        <Button size="sm" variant="outline" className="gap-1.5 h-7 text-xs" onClick={handleOpenLevel} data-testid="button-editor-open">
          <FolderOpen className="w-3 h-3" /> Open .level
        </Button>
        <input ref={fileInputRef} type="file" accept=".level" className="hidden" onChange={handleFileChange} />
        <Button size="sm" variant="outline" className="gap-1.5 h-7 text-xs" onClick={handleExportLevel} data-testid="button-editor-export-level">
          <Save className="w-3 h-3" /> Export .level
        </Button>
        <Button size="sm" variant="ghost" className="gap-1.5 h-7 text-xs" onClick={handleExportJson} data-testid="button-editor-export-json">
          <FileJson className="w-3 h-3" /> Export JSON
        </Button>
        <Separator orientation="vertical" className="h-5 mx-1" />
        <Badge variant="secondary" className="text-xs" data-testid="badge-block-count">
          <Layers className="w-3 h-3 mr-1" />{level.blocks.length} blocks
        </Badge>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* 3D Viewport */}
        <div className="flex-1 relative bg-[#0d1117]">
          <WebGLErrorBoundary>
          <Suspense fallback={
            <div className="w-full h-full flex items-center justify-center text-muted-foreground text-sm">
              Loading 3D viewport...
            </div>
          }>
            <Canvas
              shadows
              camera={{ position: [8, 10, 12], fov: 50 }}
              style={{ width: "100%", height: "100%" }}
              gl={{ antialias: true }}
            >
              <Scene
                level={level}
                selectedId={selectedId}
                tool={tool}
                placeColor={placeColor}
                onSelectBlock={handleSelectBlock}
                onDeleteBlock={handleDeleteBlock}
                onPlaceBlock={handlePlaceBlock}
              />
            </Canvas>
          </Suspense>
          </WebGLErrorBoundary>

          {/* Tool overlay */}
          <div className="absolute top-3 left-3 flex flex-col gap-1.5">
            {([
              { id: "select" as Tool, icon: MousePointer, label: "Select" },
              { id: "place" as Tool, icon: Hammer, label: "Place" },
              { id: "delete" as Tool, icon: Trash2, label: "Delete" },
            ] as const).map(({ id, icon: Icon, label }) => (
              <button
                key={id}
                onClick={() => setTool(id)}
                data-testid={`button-tool-${id}`}
                className={[
                  "flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs font-medium border transition-colors",
                  tool === id
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-card/80 text-muted-foreground border-border hover:bg-card",
                ].join(" ")}
              >
                <Icon className="w-3.5 h-3.5" />
                {label}
              </button>
            ))}
          </div>

          {/* Hints */}
          <div className="absolute bottom-3 left-3 text-[10px] text-muted-foreground/60 pointer-events-none">
            {tool === "place" && "Click grid to place · Right-drag to pan · Middle-drag to zoom"}
            {tool === "select" && "Click block to select · Left-drag to orbit"}
            {tool === "delete" && "Click block to delete"}
          </div>
        </div>

        {/* Right Sidebar */}
        <div className="w-72 border-l border-border bg-card flex flex-col overflow-y-auto flex-shrink-0">
          {/* Level Info */}
          <div className="p-4 space-y-3 border-b border-border">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Level</p>
            <div className="space-y-1.5">
              <Label className="text-xs">Title</Label>
              <Input
                className="h-7 text-sm"
                value={level.title}
                onChange={(e) => updateLevel({ ...level, title: e.target.value })}
                data-testid="input-level-title"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Creator</Label>
              <Input
                className="h-7 text-sm"
                value={level.creator}
                onChange={(e) => updateLevel({ ...level, creator: e.target.value })}
                data-testid="input-level-creator"
              />
            </div>
          </div>

          {/* Place Settings */}
          {tool === "place" && (
            <div className="p-4 space-y-3 border-b border-border">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Place Settings</p>
              <div className="space-y-1.5">
                <Label className="text-xs">Block Type</Label>
                <div className="grid grid-cols-2 gap-1">
                  {BLOCK_TYPES.map((bt) => (
                    <button
                      key={bt.type}
                      onClick={() => setPlaceBlockType(bt.type)}
                      data-testid={`button-blocktype-${bt.type}`}
                      className={[
                        "text-xs px-2 py-1.5 rounded border transition-colors",
                        placeBlockType === bt.type
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-background border-border text-muted-foreground hover:bg-muted",
                      ].join(" ")}
                    >
                      {bt.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Color</Label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={colorHex}
                    onChange={(e) => setPlaceColor(hexToRgb(e.target.value))}
                    className="w-8 h-8 rounded cursor-pointer border border-border bg-transparent"
                    data-testid="input-place-color"
                  />
                  <span className="text-xs text-muted-foreground font-mono">{colorHex.toUpperCase()}</span>
                </div>
              </div>
            </div>
          )}

          {/* Selected Block Properties */}
          {selectedBlock && (
            <div className="p-4 space-y-3 border-b border-border">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Selected Block</p>
                <button
                  onClick={() => handleDeleteBlock(selectedBlock.id)}
                  className="text-destructive hover:text-destructive/80"
                  data-testid="button-delete-selected"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Color</Label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={selectedHex}
                    onChange={(e) => updateSelectedProp("color", hexToRgb(e.target.value))}
                    className="w-8 h-8 rounded cursor-pointer border border-border bg-transparent"
                    data-testid="input-selected-color"
                  />
                  <span className="text-xs text-muted-foreground font-mono">{selectedHex.toUpperCase()}</span>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Position (X, Y, Z)</Label>
                <div className="grid grid-cols-3 gap-1">
                  {(["x", "y", "z"] as const).map((axis, i) => (
                    <Input
                      key={axis}
                      type="number"
                      step="0.5"
                      className="h-7 text-xs"
                      value={selectedBlock.position[i]}
                      onChange={(e) => {
                        const pos: [number, number, number] = [...selectedBlock.position];
                        pos[i] = parseFloat(e.target.value) || 0;
                        updateSelectedProp("position", pos);
                      }}
                      data-testid={`input-pos-${axis}`}
                    />
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Scale (X, Y, Z)</Label>
                <div className="grid grid-cols-3 gap-1">
                  {(["x", "y", "z"] as const).map((axis, i) => (
                    <Input
                      key={axis}
                      type="number"
                      step="0.5"
                      min="0.1"
                      className="h-7 text-xs"
                      value={selectedBlock.scale[i]}
                      onChange={(e) => {
                        const scale: [number, number, number] = [...selectedBlock.scale];
                        scale[i] = parseFloat(e.target.value) || 1;
                        updateSelectedProp("scale", scale);
                      }}
                      data-testid={`input-scale-${axis}`}
                    />
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Block Type</Label>
                <div className="grid grid-cols-2 gap-1">
                  {BLOCK_TYPES.map((bt) => (
                    <button
                      key={bt.type}
                      onClick={() => updateSelectedProp("blockType", bt.type)}
                      className={[
                        "text-xs px-2 py-1.5 rounded border transition-colors",
                        selectedBlock.blockType === bt.type
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-background border-border text-muted-foreground hover:bg-muted",
                      ].join(" ")}
                    >
                      {bt.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {!selectedBlock && tool !== "place" && (
            <div className="p-4 text-center text-xs text-muted-foreground">
              {tool === "select" ? "Click a block to select it" : "Click a block to delete it"}
            </div>
          )}

          {/* JSON Editor */}
          <div className="p-4 flex flex-col gap-2 flex-1">
            <button
              onClick={() => setJsonOpen((o) => !o)}
              className="flex items-center justify-between text-xs font-semibold text-muted-foreground uppercase tracking-wide w-full"
              data-testid="button-toggle-json"
            >
              Raw JSON
              {jsonOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
            {jsonOpen && (
              <div className="flex flex-col gap-2">
                <textarea
                  className="w-full text-[11px] font-mono bg-background border border-border rounded p-2 text-foreground resize-none h-48 focus:outline-none focus:ring-1 focus:ring-primary"
                  value={jsonText}
                  onChange={(e) => setJsonText(e.target.value)}
                  spellCheck={false}
                  data-testid="textarea-json"
                />
                {jsonError && (
                  <p className="text-[10px] text-destructive">{jsonError}</p>
                )}
                <Button size="sm" className="h-7 text-xs" onClick={handleApplyJson} data-testid="button-apply-json">
                  Apply JSON
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
