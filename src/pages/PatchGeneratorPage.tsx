// src/pages/PatchGeneratorPage.tsx
// Standalone Patch Generator: an agent uploads artwork, picks an automated service, and
// gets back a realistic, PRODUCIBLE mockup (grid + size arrows) with colour chips and any
// producibility warnings — then downloads it. Calls the same-origin `/api/mockup-proxy`,
// which forwards to the VPS engine (the API key stays server-side). Synchronous, one at a
// time. Attach-to-quote/order is a later phase — this is generate + download only.
import React from 'react';
import { useMutation } from '@tanstack/react-query';
import { UploadCloud, X, Download, AlertTriangle, Wand2, ImageOff } from 'lucide-react';

import Button from '../components/ui/Button';
import SpotlightCard from '../components/ui/SpotlightCard';
import Spinner from '../components/ui/Spinner';
import { PATCH_GENERATOR_SERVICES } from '../constants/patchGeneratorServices';

interface MockupColor { code: string; name: string; hex: string; }
interface MockupResponse {
  png_base64: string;
  svg: string | null;
  mockup_style: string;
  production_file: string;
  category: string;
  colors: MockupColor[];
  warnings: string[];
  size_mm: [number, number];
  render_source: string;
}

const MM_PER_INCH = 25.4;

const PatchGeneratorPage: React.FC = () => {
  const [file, setFile] = React.useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);
  const [isDragging, setIsDragging] = React.useState(false);

  const [patchType, setPatchType] = React.useState<string>(PATCH_GENERATOR_SERVICES[0].value);
  const [widthIn, setWidthIn] = React.useState<number>(3);
  const [borderMm, setBorderMm] = React.useState<number>(3);
  const [baseHex, setBaseHex] = React.useState<string>('#232830');

  const service = PATCH_GENERATOR_SERVICES.find((s) => s.value === patchType);

  // Preview the local file (image types only) — revoke the object URL on change/unmount.
  React.useEffect(() => {
    if (!file || !file.type.startsWith('image/')) { setPreviewUrl(null); return; }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const generate = useMutation<MockupResponse, Error>({
    mutationFn: async () => {
      if (!file) throw new Error('Upload artwork first.');
      const fd = new FormData();
      fd.append('file', file);
      fd.append('patch_type', patchType);
      fd.append('width_mm', String(Math.round(widthIn * MM_PER_INCH)));
      fd.append('border_mm', String(borderMm));
      fd.append('base_hex', baseHex);
      fd.append('border_hex', '');

      const res = await fetch('/api/mockup-proxy', { method: 'POST', body: fd });
      const text = await res.text();
      let json: any;
      try { json = JSON.parse(text); } catch { throw new Error(text?.slice(0, 300) || 'Unexpected response from the mockup engine.'); }
      if (!res.ok) throw new Error(json?.error || json?.detail || `Request failed (${res.status})`);
      return json as MockupResponse;
    },
  });

  const result = generate.data;

  const onPickFile = (f: File | null | undefined) => {
    if (!f) return;
    generate.reset();
    setFile(f);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    onPickFile(e.dataTransfer.files?.[0]);
  };

  const downloadPng = () => {
    if (!result) return;
    const link = document.createElement('a');
    link.href = `data:image/png;base64,${result.png_base64}`;
    link.download = `mockup-${patchType}-${Date.now()}.png`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const downloadSvg = () => {
    if (!result?.svg) return;
    const blob = new Blob([result.svg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `mockup-${patchType}-${Date.now()}.svg`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="flex items-center gap-3 mb-2">
        <div className="p-2 rounded-lg bg-brand-orange/10 border border-brand-orange/30">
          <Wand2 className="w-6 h-6 text-brand-orange" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">Patch Generator</h1>
          <p className="text-sm text-slate-400">
            Upload artwork, pick a service, and generate a realistic, producible mockup to send the customer.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
        {/* ---------- LEFT: inputs ---------- */}
        <SpotlightCard className="p-6 space-y-6">
          {/* Upload */}
          <div>
            <label className="block text-xs font-medium text-slate-400 uppercase mb-2">Artwork</label>
            {!file ? (
              <div
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                className={`border-2 border-dashed rounded-xl p-8 text-center transition-all ${
                  isDragging ? 'border-brand-orange bg-brand-orange/10' : 'border-white/10 hover:border-brand-orange/50 hover:bg-brand-orange/5'
                }`}
              >
                <input
                  type="file"
                  accept="image/*,.pdf"
                  onChange={(e) => onPickFile(e.target.files?.[0])}
                  className="hidden"
                  id="patch-artwork-input"
                />
                <label htmlFor="patch-artwork-input" className="cursor-pointer block">
                  <UploadCloud className="w-10 h-10 text-slate-400 mx-auto mb-2" />
                  <p className="text-sm text-slate-300">Drag &amp; drop or click to upload</p>
                  <p className="text-xs text-slate-500 mt-1">PNG, JPG, or PDF — logo / artwork</p>
                </label>
              </div>
            ) : (
              <div className="flex items-center gap-3 p-3 rounded-xl border border-white/10 bg-white/5">
                {previewUrl ? (
                  <img src={previewUrl} alt="Artwork" className="w-16 h-16 object-contain rounded bg-slate-900" />
                ) : (
                  <div className="w-16 h-16 rounded bg-slate-800 flex items-center justify-center">
                    <ImageOff className="w-6 h-6 text-slate-500" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white truncate">{file.name}</p>
                  <p className="text-xs text-slate-500">{(file.size / 1024).toFixed(0)} KB</p>
                </div>
                <button
                  onClick={() => { setFile(null); generate.reset(); }}
                  className="p-2 text-slate-400 hover:text-red-400 hover:bg-red-400/10 rounded transition-colors"
                  title="Remove"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>

          {/* Service */}
          <div>
            <label className="block text-xs font-medium text-slate-400 uppercase mb-2">Service</label>
            <select
              value={patchType}
              onChange={(e) => { setPatchType(e.target.value); generate.reset(); }}
              className="w-full bg-slate-900 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:border-brand-orange focus:outline-none"
            >
              {PATCH_GENERATOR_SERVICES.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
            {service?.note && <p className="text-xs text-amber-400/80 mt-1.5">{service.note}</p>}
          </div>

          {/* Size + border + colour */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-400 uppercase mb-2">Width (in)</label>
              <input
                type="number" min={0.5} max={20} step={0.25}
                value={widthIn}
                onChange={(e) => setWidthIn(Number(e.target.value))}
                className="w-full bg-slate-900 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:border-brand-orange focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 uppercase mb-2">Border (mm)</label>
              <input
                type="number" min={0} max={15} step={0.5}
                value={borderMm}
                onChange={(e) => setBorderMm(Number(e.target.value))}
                className="w-full bg-slate-900 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:border-brand-orange focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 uppercase mb-2">Base</label>
              <input
                type="color"
                value={baseHex}
                onChange={(e) => setBaseHex(e.target.value)}
                className="w-full h-[42px] bg-slate-900 border border-white/10 rounded-lg px-1 cursor-pointer"
                title="Patch base colour"
              />
            </div>
          </div>

          <Button
            variant="primary"
            className="w-full"
            disabled={!file || generate.isPending}
            onClick={() => generate.mutate()}
          >
            {generate.isPending ? <><Spinner /> Generating…</> : <><Wand2 size={16} /> Generate Mockup</>}
          </Button>

          <p className="text-[11px] text-slate-500 leading-relaxed">
            The mockup is a <strong>producible representation</strong>, not pixel-exact — colours are matched to
            thread, detail below the material's limit is dropped, and colours are capped. Always share the warnings
            with the customer.
          </p>
        </SpotlightCard>

        {/* ---------- RIGHT: result ---------- */}
        <SpotlightCard className="p-6">
          {generate.isPending ? (
            <div className="h-full min-h-[320px] flex flex-col items-center justify-center gap-3 text-slate-400">
              <Spinner />
              <p className="text-sm">Rendering a producible mockup…</p>
            </div>
          ) : generate.isError ? (
            <div className="h-full min-h-[320px] flex flex-col items-center justify-center gap-3 text-center px-6">
              <div className="p-3 rounded-full bg-red-500/10 border border-red-500/30">
                <AlertTriangle className="w-6 h-6 text-red-400" />
              </div>
              <p className="text-sm font-medium text-red-300">Couldn't generate the mockup</p>
              <p className="text-xs text-slate-400 max-w-sm">{generate.error.message}</p>
              <Button variant="secondary" onClick={() => generate.mutate()} disabled={!file}>Try again</Button>
            </div>
          ) : result ? (
            <div className="space-y-5">
              {/* Mockup image */}
              <div className="rounded-xl overflow-hidden border border-white/10 bg-white">
                <img
                  src={`data:image/png;base64,${result.png_base64}`}
                  alt="Generated mockup"
                  className="w-full h-auto"
                />
              </div>

              {/* Meta */}
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                <span className="px-2 py-1 rounded-full bg-white/5 border border-white/10">
                  {result.size_mm?.[0] != null ? `${(result.size_mm[0] / MM_PER_INCH).toFixed(1)} × ${(result.size_mm[1] / MM_PER_INCH).toFixed(1)} in` : '—'}
                </span>
                <span className="px-2 py-1 rounded-full bg-white/5 border border-white/10">{result.mockup_style}</span>
                <span className="px-2 py-1 rounded-full bg-white/5 border border-white/10">render: {result.render_source}</span>
              </div>

              {/* Warnings */}
              {result.warnings?.length > 0 && (
                <div className="rounded-lg border border-yellow-500/40 bg-yellow-500/10 p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle className="w-4 h-4 text-yellow-400" />
                    <p className="text-sm font-semibold text-yellow-300">Heads up — set expectations with the customer</p>
                  </div>
                  <ul className="list-disc list-inside space-y-1 text-xs text-yellow-200/90">
                    {result.warnings.map((w, i) => <li key={i}>{w}</li>)}
                  </ul>
                </div>
              )}

              {/* Colours */}
              {result.colors?.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-slate-400 uppercase mb-2">Colours ({result.colors.length})</p>
                  <div className="flex flex-wrap gap-2">
                    {result.colors.map((c, i) => (
                      <div key={i} className="flex items-center gap-2 px-2 py-1 rounded-full bg-white/5 border border-white/10" title={`${c.code} ${c.name}`}>
                        <span className="w-4 h-4 rounded-full border border-white/20" style={{ backgroundColor: c.hex }} />
                        <span className="text-xs text-slate-300">{c.code || c.name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Downloads */}
              <div className="flex flex-wrap gap-3 pt-1">
                <Button variant="primary" onClick={downloadPng}><Download size={16} /> Download PNG</Button>
                {result.svg && <Button variant="secondary" onClick={downloadSvg}><Download size={16} /> Download SVG</Button>}
              </div>
            </div>
          ) : (
            <div className="h-full min-h-[320px] flex flex-col items-center justify-center gap-3 text-slate-500 text-center px-6">
              <Wand2 className="w-10 h-10 opacity-40" />
              <p className="text-sm">Upload artwork, pick a service, and hit <span className="text-slate-300">Generate</span>.</p>
              <p className="text-xs">The mockup + colours + any warnings will appear here.</p>
            </div>
          )}
        </SpotlightCard>
      </div>
    </div>
  );
};

export default PatchGeneratorPage;
