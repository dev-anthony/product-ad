import { Upload, Sparkles, Image as ImageIcon, Trash2 } from "lucide-react";

export function MediaPanel({ media, onUpload, onRunAI, busy }: { media: any[]; onUpload: () => void; onRunAI: () => void; busy: boolean }) {
  return (
    <div className="flex flex-col h-full p-4 gap-4 overflow-auto">
      <div className="flex items-center justify-between">
        <h3 className="text-[15px] font-semibold text-white">Product Screenshots</h3>
        <button 
          onClick={onUpload}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#212125] border border-[#2e2e34] text-xs hover:bg-[#2a2a30]"
        >
          <Upload size={14} /> Add Images
        </button>
      </div>

      {media.length === 0 ? (
        <div 
          onClick={onUpload}
          className="flex flex-col items-center justify-center p-8 border-2 border-dashed border-[#3a3a42] rounded-2xl cursor-pointer hover:border-[#f5c518] bg-[#1c1c1f]/50 text-center gap-3"
        >
          <div className="grid h-12 w-12 place-items-center rounded-xl bg-[#212125] text-[#f5c518]">
            <Upload size={24} />
          </div>
          <div>
            <p className="font-semibold text-white text-sm">Drop product screenshots here</p>
            <p className="text-xs text-[#8b8b94] mt-1">PNG, JPG, WEBP formats supported</p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2.5">
          {media.map((m) => (
            <div key={m.id} className="relative group aspect-[16/10] rounded-md overflow-hidden border border-[#2e2e34] bg-black">
              <img src={m.url} alt={m.file.name} className="w-full h-full object-cover" />
              <span className="absolute bottom-1 right-1 bg-black/70 px-1 py-0.5 rounded text-[10px] text-white">
                {(m.file.size / 1024).toFixed(0)} KB
              </span>
            </div>
          ))}
        </div>
      )}

      {media.length > 0 && (
        <button
          disabled={busy}
          onClick={onRunAI}
          className="mt-auto w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-[#f5c518] text-[#111] font-bold shadow-lg hover:bg-[#f6cb2f] disabled:opacity-50"
        >
          <Sparkles size={18} /> Generate Video Ad
        </button>
      )}
    </div>
  );
}