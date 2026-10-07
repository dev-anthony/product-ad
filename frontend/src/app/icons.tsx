 const D: Record<string, string> = { 
  back: "M19 12H5M12 19l-7-7 7-7", 
  cloudUp: "M16 16l-4-4-4 4M12 12v9M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3", 
  more: "M5 12h.01M12 12h.01M19 12h.01", 
  frame: "M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3", 
  pen: "M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z", 
  wand: "M15 4V2M15 16v-2M8 9h2M20 9h2M17.8 11.8L19 13M17.8 6.2L19 5M3 21l9-9M12.2 6.2L11 5", 
  rew: "M11 19L2 12l9-7v14zM22 19l-9-7 9-7v14z", 
  fwd: "M13 19l9-7-9-7v14zM2 19l9-7-9-7v14z", 
  prev: "M19 20L9 12l10-8v16zM5 19V5", 
  next: "M5 4l10 8-10 8V4zM19 5v14", 
  stop: "M7 5h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z", 
  play: "M7 4l13 8-13 8V4z", 
  pause: "M7 4h3v16H7zM14 4h3v16h-3z", 
  expand: "M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7", 
  sliders: "M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6", 
  sort: "M11 5h10M11 9h7M11 13h4M3 17l3 3 3-3M6 18V4", 
  grid: "M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z", 
  list: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01", 
  search: "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.35-4.35", 
  pin: "M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0zM12 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6z", 
  checkc: "M22 11.08V12a10 10 0 1 1-5.93-9.14M22 4L12 14.01l-3-3", 
  check: "M20 6L9 17l-5-5", 
  layers: "M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5", 
  multicam: "M4 11a5 5 0 1 0 10 0 5 5 0 1 0-10 0zM10 13a5 5 0 1 0 10 0 5 5 0 0 0-10 0z", 
  bars: "M4 14v-4M8 18V6M12 15V9M16 20V4M20 14v-4", 
  anim: "M2 12a10 10 0 1 0 20 0 10 10 0 1 0-20 0zM7 12a5 5 0 1 0 10 0 5 5 0 1 0-10 0z", 
  left: "M11 17l-5-5 5-5M18 17l-5-5 5-5", 
  right: "M13 17l5-5-5-5M6 17l5-5-5-5", 
  copy: "M20 9h-9a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2zM5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1", 
  trash: "M3 6h18M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6", 
  loader: "M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83", 
  home: "M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM9 22V12h6v10", 
  gear: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1", 
  scissors: "M6 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM20 4L8.12 15.88M14.47 14.48L20 20M8.12 8.12L12 12", 
  curve: "M3 18c4 0 5-12 9-12s5 12 9 12", 
  drop: "M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z", 
  speaker: "M11 5L6 9H2v6h4l5 4V5zM19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07", 
  clock: "M2 12a10 10 0 1 0 20 0 10 10 0 0 0-20 0zM12 6v6l4 2", 
  undo: "M1 4v6h6M3.51 15a9 9 0 1 0 2.13-9.36L1 10", 
  redo: "M23 4v6h-6M20.49 15a9 9 0 1 1-2.12-9.36L23 10", 
  mic: "M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3zM19 10v2a7 7 0 0 1-14 0v-2M12 19v3", 
  music: "M9 18V5l12-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM21 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z", 
  film: "M4 4h16a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zM7 4v16M17 4v16M3 12h18M3 8h4M3 16h4M17 8h4M17 16h4", 
  link: "M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71", 
  image: "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM8.5 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM21 15l-5-5L5 21", 
  plus: "M12 5v14M5 12h14", 
  x: "M18 6L6 18M6 6l12 12", 
  upload: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12", 
  chev: "M6 9l6 6 6-6", 
  updown: "M7 15l5 5 5-5M7 9l5-5 5 5", 
  sparkle: "M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3zM19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9L19 15z", 
}; 
 
export function Icon({ 
  n, 
  size = 18, 
  fill = false, 
  sw = 1.8, 
}: { 
  n: string; 
  size?: number; 
  fill?: boolean; 
  sw?: number; 
}) { 
  return ( 
    <svg 
      width={size} 
      height={size} 
      viewBox="0 0 24 24" 
      fill={fill ? "currentColor" : "none"} 
      stroke="currentColor" 
      strokeWidth={sw} 
      strokeLinecap="round" 
      strokeLinejoin="round" 
      className="shrink-0" 
    > 
      <path d={D[n] ?? ""} /> 
    </svg> 
  ); 
} 