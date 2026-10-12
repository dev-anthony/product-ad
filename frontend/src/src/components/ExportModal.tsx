"use client";

export function ExportModal({ videoUrl, onClose, name }: { videoUrl: string; onClose: () => void; name: string }) {
  return (
    <div className="fixed inset-0 z-[300] grid place-items-center bg-black/70 backdrop-blur-sm">
      <div className="flex w-[min(760px,92vw)] flex-col gap-4 rounded-2xl border border-[#2e2e34] bg-[#141416] p-5 shadow-2xl text-white">
        <h3 className="text-lg font-semibold">Your video ad is ready!</h3>
        <video src={videoUrl} controls autoPlay className="max-h-[60vh] w-full rounded-xl bg-black" />
        <div className="flex justify-end gap-3">
          <a className="rounded-full bg-[#f5c518] px-5 py-2 font-bold text-[#111] no-underline" href={videoUrl} download={`${name || "ad"}.mp4`}>Download MP4</a>
          <button className="rounded-full border border-[#2e2e34] bg-[#212125] px-5 py-2 font-medium text-white hover:bg-[#2a2a30]" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}