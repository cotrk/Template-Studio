import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, Route, Router, Switch, useLocation, useParams } from 'wouter';
import {
  ArrowDownToLine, ArrowLeft, AudioLines, Check, ChevronRight, CircleHelp,
  FileJson2, Film, FolderOpen, Headphones, Layers3, Pause, Play, Plus,
  RefreshCw, SlidersHorizontal, Sparkles, Upload, X,
} from 'lucide-react';

type TemplateId = 'particle-field' | 'light-leak' | 'pulse-grid';
type Aspect = '9:16' | '1:1';
type Cue = { start: number; end: number; text: string };
type Project = {
  version: 1;
  templateId: TemplateId;
  params: { seed: number; accentHue: number; particleDensity: number; leakIntensity: number; motionSpeed: number };
  aspect: Aspect;
  durationSec: number;
  audioFileName: string | null;
  audioSha256: string | null;
  textOverlays: { title: string; artist: string; position: 'lower-third' };
  subtitlesFile: string | null;
};

const TEMPLATE_LIST: { id: TemplateId; name: string; category: string; description: string; detail: string; number: string }[] = [
  { id: 'particle-field', name: 'Particle Field', category: 'ATMOSPHERIC', description: 'A constellation in motion.', detail: 'Slow-burning light, scattered like a thought you can’t quite place.', number: '01' },
  { id: 'light-leak', name: 'Light Leak', category: 'ANALOG / SOFT', description: 'Let the edges catch fire.', detail: 'Film-burn color drifts through shadow. Imperfect on purpose.', number: '02' },
  { id: 'pulse-grid', name: 'Pulse Grid', category: 'GEOMETRIC', description: 'Feel the rhythm take shape.', detail: 'A measured field of light that answers every low end.', number: '03' },
];
const STORAGE_KEY = 'template-studio-projects-v1';
const DURATION = 30;
const validTemplates = TEMPLATE_LIST.map((t) => t.id);

function colorFromHue(hue: number, saturation = 73, lightness = 66) {
  return `hsl(${hue} ${saturation}% ${lightness}%)`;
}
function hueHex(hue: number) {
  const chroma = .8 * .72;
  const h = ((hue % 360) + 360) % 360 / 60;
  const x = chroma * (1 - Math.abs((h % 2) - 1));
  const [r, g, b] = h < 1 ? [chroma, x, 0] : h < 2 ? [x, chroma, 0] : h < 3 ? [0, chroma, x] : h < 4 ? [0, x, chroma] : h < 5 ? [x, 0, chroma] : [chroma, 0, x];
  const m = .72 - chroma / 2;
  return `#${[r, g, b].map((channel) => Math.round((channel + m) * 255).toString(16).padStart(2, '0')).join('')}`;
}
function seeded(seed: number, n: number) {
  let x = (seed ^ Math.imul(n + 1, 0x45d9f3b)) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}
function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = Math.floor(seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}
function parseTimestamp(value: string) {
  const match = value.trim().match(/(?:(\d{2}):)?(\d{2}):(\d{2})[,.](\d{1,3})/);
  if (!match) return null;
  return Number(match[1] || 0) * 3600 + Number(match[2]) * 60 + Number(match[3]) + Number(`0.${match[4].padEnd(3, '0')}`);
}
function parseSubtitles(text: string): Cue[] {
  const normalized = text.replace(/\r/g, '').trim();
  const blocks = normalized.includes('-->') ? normalized.split(/\n\s*\n/) : [];
  return blocks.flatMap((block) => {
    const lines = block.split('\n').map((line) => line.trim()).filter(Boolean);
    const timeLine = lines.find((line) => line.includes('-->'));
    if (!timeLine) return [];
    const [from, to] = timeLine.split('-->').map((part) => part.trim().split(/\s/)[0]);
    const start = parseTimestamp(from);
    const end = parseTimestamp(to);
    const lineIndex = lines.indexOf(timeLine);
    const cueText = lines.slice(lineIndex + 1).join(' ').replace(/<[^>]*>/g, '').trim();
    return start !== null && end !== null && end > start && cueText ? [{ start, end, text: cueText }] : [];
  });
}
function validProject(input: unknown): input is Project {
  if (!input || typeof input !== 'object') return false;
  const p = input as Partial<Project>;
  return p.version === 1 && typeof p.templateId === 'string' && validTemplates.includes(p.templateId as TemplateId)
    && !!p.params && ['seed', 'accentHue', 'particleDensity', 'leakIntensity', 'motionSpeed'].every((key) => Number.isFinite((p.params as unknown as Record<string, number>)[key]))
    && p.params.particleDensity >= 0 && p.params.particleDensity <= 1
    && p.params.leakIntensity >= 0 && p.params.leakIntensity <= 1
    && (p.aspect === '9:16' || p.aspect === '1:1') && p.durationSec === DURATION
    && (p.audioFileName === null || typeof p.audioFileName === 'string')
    && (p.audioSha256 === null || typeof p.audioSha256 === 'string')
    && !!p.textOverlays && typeof p.textOverlays.title === 'string' && typeof p.textOverlays.artist === 'string' && p.textOverlays.position === 'lower-third'
    && (p.subtitlesFile === null || typeof p.subtitlesFile === 'string');
}
function saveDownload(data: Blob, name: string) {
  const url = URL.createObjectURL(data);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function Header({ active = 'gallery' }: { active?: 'gallery' | 'studio' }) {
  return (
    <header className="site-header">
      <Link href="/" className="wordmark" data-testid="link-home"><span className="mark"><span /></span><span>FORM<span className="wordmark-light"> / </span>STUDIO</span></Link>
      <div className="header-center"><span className="live-dot" /> LOCAL CREATIVE TOOL <span className="header-sep">/</span> NO CLOUD</div>
      <Link href="/" className={`header-nav ${active === 'gallery' ? 'is-active' : ''}`} data-testid="link-template-gallery">TEMPLATES <ChevronRight size={13} /></Link>
    </header>
  );
}

function VisualCanvas({ templateId, aspect, params, title, artist, showGuides, frozen, cues, analyser, className = '' }: {
  templateId: TemplateId; aspect: Aspect; params: Project['params']; title: string; artist: string;
  showGuides: boolean; frozen: boolean; cues: Cue[]; analyser: AnalyserNode | null; className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const valuesRef = useRef({ templateId, aspect, params, title, artist, showGuides, frozen, cues, analyser });
  valuesRef.current = { templateId, aspect, params, title, artist, showGuides, frozen, cues, analyser };
  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    let raf = 0;
    let elapsed = 0;
    let previous = performance.now();
    const analyserData = new Uint8Array(1024);
    const draw = (now: number) => {
      const v = valuesRef.current;
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.max(1, Math.round(rect.width * dpr));
      const height = Math.max(1, Math.round(rect.height * dpr));
      if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
      const dt = Math.min((now - previous) / 1000, .05);
      previous = now;
      if (!v.frozen && !(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)) elapsed += dt;
      const t = elapsed % DURATION;
      const cyclePhase = (t / DURATION) * Math.PI * 2;
      const phase = cyclePhase + (v.params.motionSpeed - 1) * Math.sin(cyclePhase);
      const w = width;
      const h = height;
      const hue = v.params.accentHue;
      const color = colorFromHue(hue);
      const period = (Math.sin(phase) + 1) / 2;
      let audioLevel = 0;
      if (v.analyser && !v.frozen && !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
        v.analyser.getByteFrequencyData(analyserData);
        const end = Math.max(1, Math.floor(analyserData.length * .16));
        for (let i = 0; i < end; i++) audioLevel += analyserData[i] / 255;
        audioLevel /= end;
      }
      const beat = Math.max(period * .24, audioLevel);
      const bg = context.createLinearGradient(0, 0, w * .4, h);
      bg.addColorStop(0, '#11151d'); bg.addColorStop(.53, '#090c12'); bg.addColorStop(1, '#111019');
      context.fillStyle = bg; context.fillRect(0, 0, w, h);
      const glow = context.createRadialGradient(w * .51, h * .44, 0, w * .51, h * .44, w * .64);
      glow.addColorStop(0, `hsla(${hue}, 57%, 43%, ${.06 + beat * .13})`);
      glow.addColorStop(1, 'rgba(6,8,12,0)');
      context.fillStyle = glow; context.fillRect(0, 0, w, h);
      if (v.templateId === 'particle-field') {
        const count = Math.round(70 + v.params.particleDensity * 220);
        for (let i = 0; i < count; i++) {
          const x0 = seeded(v.params.seed, i * 3 + 1) * w;
          const y0 = seeded(v.params.seed, i * 3 + 2) * h;
          const drift = Math.sin(phase * 2 + i * .8) * (4 + seeded(v.params.seed, i + 70) * 10);
          const x = (x0 + Math.sin(phase + i) * 14 + drift + w) % w;
          const y = (y0 + Math.cos(phase + i * .7) * 15 + Math.sin(phase * 2 + i) * 8 + h) % h;
          const radius = (1 + seeded(v.params.seed, i + 9) * 2.8 + beat * 2) * dpr;
          context.beginPath(); context.arc(x, y, radius, 0, Math.PI * 2);
          context.fillStyle = `hsla(${hue + seeded(v.params.seed, i + 13) * 30 - 15}, ${48 + beat * 28}%, ${58 + seeded(v.params.seed, i + 10) * 25}%, ${.28 + seeded(v.params.seed, i + 12) * .65})`;
          context.shadowColor = color; context.shadowBlur = radius * 5; context.fill(); context.shadowBlur = 0;
        }
        context.strokeStyle = `hsla(${hue},50%,72%,.12)`; context.lineWidth = dpr;
        for (let i = 0; i < Math.floor(count * .11); i++) {
          const x = seeded(v.params.seed, i * 5 + 200) * w;
          const y = seeded(v.params.seed, i * 5 + 201) * h;
          context.beginPath(); context.moveTo(x, y); context.lineTo(x + Math.sin(t + i) * 30 * dpr, y + 24 * dpr); context.stroke();
        }
      } else if (v.templateId === 'light-leak') {
        const intensity = v.params.leakIntensity;
        for (let i = 0; i < 4; i++) {
          const drift = Math.sin(phase + i * 2.1) * .23;
          const cx = (i % 2 ? .86 : .12) * w + drift * w;
          const cy = (i < 2 ? .19 : .81) * h + Math.cos(phase + i) * h * .13;
          const radius = w * (.35 + .12 * Math.sin(phase + i));
          const leak = context.createRadialGradient(cx, cy, 0, cx, cy, radius);
          leak.addColorStop(0, `hsla(${hue + i * 21}, 88%, 67%, ${intensity * (.16 + beat * .17)})`);
          leak.addColorStop(.34, `hsla(${hue + 26 + i * 17}, 77%, 52%, ${intensity * .09})`);
          leak.addColorStop(1, 'rgba(0,0,0,0)');
          context.fillStyle = leak; context.fillRect(0, 0, w, h);
        }
        context.globalCompositeOperation = 'screen';
        const streakX = w * (.5 + Math.sin(phase) * .34);
        const streak = context.createLinearGradient(streakX, 0, streakX + w * .22, h);
        streak.addColorStop(0, 'rgba(255,255,255,0)'); streak.addColorStop(.5, `hsla(${hue + 12},90%,75%,${.035 * intensity})`); streak.addColorStop(1, 'rgba(255,255,255,0)');
        context.fillStyle = streak; context.fillRect(0, 0, w, h); context.globalCompositeOperation = 'source-over';
        context.strokeStyle = `hsla(${hue},80%,80%,${.2 * intensity})`;
        for (let i = 0; i < 5; i++) {
          const y = h * (.16 + i * .16) + Math.sin(phase + i) * 8 * dpr;
          context.lineWidth = (i === 2 ? 1.7 : .7) * dpr;
          context.beginPath(); context.moveTo(0, y); context.lineTo(w, y + Math.sin(i + phase) * 5 * dpr); context.stroke();
        }
      } else {
        const cols = 15; const rows = 23;
        const cellW = w / (cols + 1); const cellH = h / (rows + 1);
        const cx = w / 2; const cy = h / 2;
        for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) {
          const x = (col + 1) * cellW; const y = (row + 1) * cellH;
          const dist = Math.hypot((x - cx) / w, (y - cy) / h);
          const wave = (Math.sin(phase * 3 - dist * 25 + (row % 3) * .4) + 1) / 2;
          const pulse = Math.max(0, 1 - dist * 2.2) * beat;
          const radius = (1.05 + wave * 2.8 + pulse * 2.4) * dpr;
          const alpha = .19 + wave * .52 + pulse * .28;
          context.beginPath(); context.arc(x, y, radius, 0, Math.PI * 2);
          context.fillStyle = `hsla(${hue + wave * 13}, 66%, ${54 + wave * 20}%, ${Math.min(alpha, .95)})`;
          context.shadowColor = color; context.shadowBlur = radius * (2 + pulse * 3); context.fill(); context.shadowBlur = 0;
        }
        context.strokeStyle = `hsla(${hue},65%,70%,.065)`; context.lineWidth = dpr;
        context.beginPath(); context.ellipse(cx, cy, w * (.16 + period * .035), h * (.16 + period * .025), 0, 0, Math.PI * 2); context.stroke();
      }
      // A stable title lockup is part of the rendered artwork, not a page overlay.
      const pad = w * .09;
      const titleY = h * .58;
      const fontScale = dpr * (v.aspect === '1:1' ? .78 : 1);
      const titleSize = Math.max(14 * dpr, Math.min(23 * dpr, w * .054));
      context.textAlign = 'center'; context.textBaseline = 'middle';
      context.fillStyle = '#f1eee8'; context.font = `600 ${titleSize * fontScale}px "Avenir Next", Avenir, sans-serif`;
      context.shadowColor = 'rgba(0,0,0,.7)'; context.shadowBlur = 16 * dpr;
      if (v.title) context.fillText(v.title.slice(0, 36), w / 2, titleY, w - pad * 2);
      context.shadowBlur = 0;
      context.fillStyle = color; context.font = `600 ${Math.max(9 * dpr, 10 * dpr * fontScale)}px "SFMono-Regular", Consolas, monospace`;
      if (v.artist) context.fillText(v.artist.slice(0, 30).toUpperCase(), w / 2, titleY + 24 * dpr, w - pad * 2);
      const activeCue = v.cues.find((cue) => t % DURATION >= cue.start && t % DURATION < cue.end);
      if (activeCue) {
        context.fillStyle = '#f4f0e8'; context.font = `500 ${Math.max(11 * dpr, w * .027)}px "Avenir Next", sans-serif`;
         context.fillText(activeCue.text, w / 2, h * .65, w * .84);
      }
      if (v.showGuides) {
        context.save(); context.strokeStyle = 'rgba(255,255,255,.54)'; context.setLineDash([5 * dpr, 5 * dpr]); context.lineWidth = dpr;
        context.strokeRect(w * .08, h * .11, w * .84, h * .78);
        context.beginPath(); context.moveTo(w * .08, h * .68); context.lineTo(w * .92, h * .68); context.stroke();
        context.setLineDash([]); context.fillStyle = 'rgba(255,255,255,.67)';
        context.font = `${8 * dpr}px monospace`; context.textAlign = 'left';
        context.fillText('SAFE TITLE', w * .09, h * .13); context.fillText('CAPTION CLEARANCE', w * .09, h * .695);
        context.restore();
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    const observer = new ResizeObserver(() => { if (!valuesRef.current.frozen) { cancelAnimationFrame(raf); raf = requestAnimationFrame(draw); } });
    observer.observe(canvas);
    return () => { cancelAnimationFrame(raf); observer.disconnect(); };
  }, []);
  return <canvas ref={canvasRef} className={`art-canvas ${className}`} aria-label={`${TEMPLATE_LIST.find((t) => t.id === templateId)?.name ?? 'Music'} visual preview`} data-testid="canvas-live-preview" />;
}

function Gallery() {
  const [, navigate] = useLocation();
  const [projects, setProjects] = useState<Project[]>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    try { setProjects(JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]').filter(validProject)); }
    catch { setError('Saved projects could not be read. You can still create a new visual.'); }
  }, []);
  const previews = useMemo(() => TEMPLATE_LIST.map((template) => ({
    ...template,
    initialParams: { seed: 413, accentHue: template.id === 'light-leak' ? 15 : template.id === 'pulse-grid' ? 184 : 35, particleDensity: .42, leakIntensity: .65, motionSpeed: 1 },
  })), []);
  return (
    <main className="page-shell studio-grain">
      <Header />
      <section className="gallery-hero enter">
        <div className="eyebrow"><span className="eyebrow-line" /> A SMALL STAGE FOR YOUR NEXT LOOP</div>
        <div className="hero-grid">
          <h1>Give the track<br /><em>a world of its own.</em></h1>
          <p className="hero-note">Short-form visuals, made for the song and the scroll. Choose a scene, bring your audio, make it yours.</p>
        </div>
        <div className="hero-foot"><span>01 — SELECT A TEMPLATE</span><span>BUILT FOR INDEPENDENT MUSIC</span></div>
      </section>
      {error && <div className="notice error-notice" role="alert" data-testid="status-projects-error">{error}</div>}
      <section className="template-section" aria-label="Visual templates">
        <div className="section-heading"><div><span className="micro-label">THE SCENES</span><h2>Start with a feeling.</h2></div><span className="template-count">03 <span>VISUAL SYSTEMS</span></span></div>
        <div className="template-grid">
          {previews.map((template, index) => (
            <button key={template.id} className={`template-card enter ${index === 1 ? 'card-offset' : ''}`} style={{ animationDelay: `${index * 90}ms` }} onClick={() => navigate(`/studio/${template.id}`)} data-testid={`card-template-${template.id}`}>
              <div className={`card-art art-${template.id}`}>
                <VisualCanvas templateId={template.id} aspect="1:1" params={template.initialParams} title="" artist="" showGuides={false} frozen={false} cues={[]} analyser={null} />
                <span className="card-index">{template.number} / 03</span>
                <span className="card-open"><ChevronRight size={16} /></span>
                <span className="card-stamp">{template.category}</span>
              </div>
              <div className="card-copy"><div><h3>{template.name}</h3><p>{template.description}</p></div><span className="card-arrow"><ArrowDownToLine size={15} /></span></div>
              <p className="card-detail">{template.detail}</p>
            </button>
          ))}
        </div>
      </section>
      <section className="saved-section">
        <div className="saved-head"><div><span className="micro-label">ON THIS DEVICE</span><h2>Your recent projects</h2></div><span className="local-note"><span className="live-dot" /> LOCAL ONLY</span></div>
        {projects.length ? (
          <div className="saved-list">{projects.slice(0, 5).map((project, index) => {
            const item = TEMPLATE_LIST.find((template) => template.id === project.templateId);
            return <button key={`${project.templateId}-${project.params.seed}-${index}`} className="saved-row" onClick={() => navigate(`/studio/${project.templateId}?seed=${project.params.seed}`)} data-testid={`button-open-saved-${index}`}>
              <span className="saved-symbol"><Layers3 size={17} /></span><span className="saved-main"><strong>{project.textOverlays.title || 'Untitled loop'}</strong><small>{item?.name} · {project.aspect} · seed {project.params.seed}</small></span><span className="saved-artist">{project.textOverlays.artist}</span><ChevronRight size={16} />
            </button>;
          })}</div>
        ) : <div className="saved-empty"><FolderOpen size={18} /><span>Your saved loops will live here. Projects never leave this browser.</span></div>}
      </section>
      <footer className="site-footer"><span>FORM / STUDIO</span><span>MADE FOR THE MUSIC, NOT THE FEED.</span><span>TRP8 · VISUAL STUDY 001</span></footer>
    </main>
  );
}

function RangeControl({ label, value, min, max, step = 1, suffix = '', onChange, testId }: {
  label: string; value: number; min: number; max: number; step?: number; suffix?: string;
  onChange: (value: number) => void; testId: string;
}) {
  return <label className="range-control" htmlFor={testId}><span className="range-top"><span>{label}</span><output htmlFor={testId}>{value}{suffix}</output></span><input id={testId} data-testid={testId} type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.currentTarget.value))} /><span className="range-scale"><span>SUBTLE</span><span>INTENSE</span></span></label>;
}

function Studio() {
  const paramsRoute = useParams<{ templateId: string }>();
  const templateId = validTemplates.includes(paramsRoute.templateId as TemplateId) ? paramsRoute.templateId as TemplateId : 'particle-field';
  const template = TEMPLATE_LIST.find((entry) => entry.id === templateId)!;
  const querySeed = Number(new URLSearchParams(window.location.search).get('seed'));
  const [, navigate] = useLocation();
  const [params, setParams] = useState<Project['params']>({ seed: Number.isFinite(querySeed) && querySeed ? querySeed : 9183, accentHue: templateId === 'light-leak' ? 15 : templateId === 'pulse-grid' ? 184 : 35, particleDensity: .42, leakIntensity: .65, motionSpeed: 1 });
  const [variationSeeds, setVariationSeeds] = useState<number[]>([Number.isFinite(querySeed) && querySeed ? querySeed : 9183, ((Number.isFinite(querySeed) && querySeed ? querySeed : 9183) + 7919) >>> 0, ((Number.isFinite(querySeed) && querySeed ? querySeed : 9183) + 15887) >>> 0]);
  const [aspect, setAspect] = useState<Aspect>('9:16');
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('TRP8');
  const [showGuides, setShowGuides] = useState(false);
  const [frozen, setFrozen] = useState(false);
  const [audioName, setAudioName] = useState<string | null>(null);
  const [audioHash, setAudioHash] = useState<string | null>(null);
  const [audioError, setAudioError] = useState('');
  const [audioUrl, setAudioUrl] = useState('');
  const [audioDuration, setAudioDuration] = useState(0);
  const [subtitlesName, setSubtitlesName] = useState<string | null>(null);
  const [cues, setCues] = useState<Cue[]>([]);
  const [subtitlesError, setSubtitlesError] = useState('');
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const [playing, setPlaying] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingError, setRecordingError] = useState('');
  const [toast, setToast] = useState('');
  const [importError, setImportError] = useState('');
  const [dragging, setDragging] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const recordDestinationRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const subtitleInputRef = useRef<HTMLInputElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const canvasWrapperRef = useRef<HTMLDivElement>(null);
  const objectUrlRef = useRef('');
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordingTracksRef = useRef<MediaStreamTrack[]>([]);
  const currentProject = useCallback((seed = params.seed): Project => ({
    version: 1, templateId, params: { ...params, seed }, aspect, durationSec: DURATION,
    audioFileName: audioName, audioSha256: audioHash,
    textOverlays: { title, artist, position: 'lower-third' }, subtitlesFile: subtitlesName,
  }), [templateId, params, aspect, audioName, audioHash, title, artist, subtitlesName]);

  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      const list: Project[] = Array.isArray(stored) ? stored.filter(validProject) : [];
      const match = list.find((p) => p.templateId === templateId && (!querySeed || p.params.seed === querySeed));
      if (match) {
        setParams(match.params); setAspect(match.aspect); setTitle(match.textOverlays.title); setArtist(match.textOverlays.artist || 'TRP8');
        setAudioName(match.audioFileName); setAudioHash(match.audioSha256); setSubtitlesName(match.subtitlesFile);
        setVariationSeeds([match.params.seed, (match.params.seed + 7919) >>> 0, (match.params.seed + 15887) >>> 0]);
      }
    } catch { setToast('Could not load local project data. A fresh project is ready.'); }
  // Project restoration occurs only when the selected template changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateId]);

  useEffect(() => {
    try {
      const existing: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      const list: Project[] = Array.isArray(existing) ? existing.filter(validProject) : [];
      const project = currentProject();
      const filtered = list.filter((p) => !(p.templateId === templateId && p.params.seed === project.params.seed));
      localStorage.setItem(STORAGE_KEY, JSON.stringify([project, ...filtered].slice(0, 10)));
    } catch { setToast('Browser storage is full or unavailable. Download the project JSON to keep a copy.'); }
  }, [currentProject, templateId]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onEnded = () => setPlaying(false);
    audio.addEventListener('ended', onEnded);
    return () => audio.removeEventListener('ended', onEnded);
  }, []);

  useEffect(() => () => {
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
    recordingTracksRef.current.forEach((track) => track.stop());
    audioContextRef.current?.close();
  }, []);

  const ensureAudioGraph = async () => {
    if (!audioRef.current) return null;
    if (!audioContextRef.current) {
      const context = new AudioContext();
      const source = context.createMediaElementSource(audioRef.current);
      const analyserNode = context.createAnalyser();
      analyserNode.fftSize = 2048; analyserNode.smoothingTimeConstant = .82;
      const destination = context.createMediaStreamDestination();
      source.connect(analyserNode); analyserNode.connect(context.destination); analyserNode.connect(destination);
      audioContextRef.current = context; recordDestinationRef.current = destination; setAnalyser(analyserNode);
    }
    if (audioContextRef.current.state === 'suspended') await audioContextRef.current.resume();
    return audioContextRef.current;
  };

  const handleAudioFile = async (file?: File) => {
    if (!file) return;
    setAudioError('');
    const extension = file.name.split('.').pop()?.toLowerCase();
    if (!['mp3', 'wav', 'ogg', 'm4a'].includes(extension || '')) {
      setAudioError('Unsupported audio type. Choose an MP3, WAV, OGG, or M4A file.');
      return;
    }
    try {
      const bytes = await file.arrayBuffer();
      const context = audioContextRef.current || new AudioContext();
      try { await context.decodeAudioData(bytes.slice(0)); }
      catch {
        if (!audioContextRef.current) await context.close();
        throw new Error('This file could not be decoded. Try a standard MP3, WAV, OGG, or M4A export that is not DRM-protected.');
      }
      if (!audioContextRef.current) await context.close();
      let hash: string | null = null;
      if (typeof crypto !== 'undefined' && crypto.subtle) {
        try {
          const digest = await crypto.subtle.digest('SHA-256', bytes);
          hash = Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
        } catch { hash = null; }
      }
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
      const url = URL.createObjectURL(file);
      objectUrlRef.current = url; setAudioUrl(url); setAudioName(file.name); setAudioHash(hash);
      const audio = audioRef.current;
      if (audio) {
        audio.src = url;
        await new Promise<void>((resolve, reject) => {
          audio.onloadedmetadata = () => resolve();
          audio.onerror = () => reject(new Error('The browser could not open the audio file. Try converting it to WAV or MP3.'));
        });
        setAudioDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
      }
    } catch (error) {
      setAudioError(error instanceof Error ? error.message : 'Audio could not be loaded. Try another file.');
    }
  };

  const togglePlay = async () => {
    const audio = audioRef.current;
    if (!audio || !audioUrl) { setToast('Add an audio track first to audition audio reactivity.'); return; }
    try {
      await ensureAudioGraph();
      if (playing) { audio.pause(); setPlaying(false); }
      else { await audio.play(); setPlaying(true); }
    } catch { setAudioError('Audio playback was blocked. Press play again to grant browser audio permission.'); }
  };

  const updateParams = (patch: Partial<Project['params']>) => setParams((previous) => ({ ...previous, ...patch }));
  const generateVariations = () => {
    const base = (params.seed >>> 0) || 9183;
    const primes = [0, 7919, 15887];
    const variations = primes.map((offset) => ((base + offset) >>> 0) || 1);
    setVariationSeeds(variations);
    updateParams({ seed: variations[0] });
    setToast(`Three reproducible variations ready. Active seed: ${variations[0]}.`);
  };
  const goVariation = (index: number) => {
    const seed = variationSeeds[index];
    updateParams({ seed });
    setToast(`Variation ${index + 1} loaded · seed ${seed}`);
  };
  const downloadProject = () => {
    saveDownload(new Blob([JSON.stringify(currentProject(), null, 2)], { type: 'application/json' }), `${(title || 'untitled-loop').toLowerCase().replace(/[^a-z0-9]+/g, '-')}.json`);
    setToast('Project JSON downloaded. It contains the seed and full visual settings.');
  };
  const importProject = async (file?: File) => {
    if (!file) return;
    setImportError('');
    try {
      const parsed: unknown = JSON.parse(await file.text());
      if (!validProject(parsed)) throw new Error('This does not match Template Studio’s version 1 project format. Check that the file includes templateId, params, aspect, durationSec, and textOverlays.');
      if (parsed.templateId !== templateId) navigate(`/studio/${parsed.templateId}?seed=${parsed.params.seed}`);
      setParams(parsed.params); setAspect(parsed.aspect); setTitle(parsed.textOverlays.title); setArtist(parsed.textOverlays.artist || 'TRP8');
      setVariationSeeds([parsed.params.seed, (parsed.params.seed + 7919) >>> 0, (parsed.params.seed + 15887) >>> 0]);
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = '';
      audioRef.current?.pause();
      audioRef.current?.removeAttribute('src');
      audioRef.current?.load();
      setAudioUrl(''); setAudioDuration(0); setCues([]);
      setAudioName(parsed.audioFileName); setAudioHash(parsed.audioSha256); setSubtitlesName(parsed.subtitlesFile);
      setToast(parsed.audioFileName || parsed.subtitlesFile
        ? 'Project settings imported. Re-add the original audio and subtitle files to restore their media.'
        : 'Project settings imported successfully.');
    } catch (error) {
      setImportError(error instanceof Error ? error.message : 'Could not read this project. Choose a valid version 1 JSON file.');
    }
  };
  const uploadSubtitles = async (file?: File) => {
    if (!file) return;
    setSubtitlesError('');
    if (!/\.(srt|vtt)$/i.test(file.name)) { setSubtitlesError('Subtitle file must end in .srt or .vtt.'); return; }
    try {
      const parsed = parseSubtitles(await file.text());
      if (!parsed.length) throw new Error('No valid cues found. Include timestamps such as 00:00:02,000 --> 00:00:04,000 followed by subtitle text.');
      setCues(parsed); setSubtitlesName(file.name); setToast(`${parsed.length} subtitle cues loaded and timed to the loop.`);
    } catch (error) { setSubtitlesError(error instanceof Error ? error.message : 'Subtitle file could not be parsed.'); }
  };
  const exportVideo = async (seed = params.seed) => {
    if (seed !== params.seed) {
      updateParams({ seed });
      await new Promise<void>((resolve) => window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve())));
    }
    setRecordingError('');
    if (!window.MediaRecorder || !canvasWrapperRef.current?.querySelector('canvas')?.captureStream) {
      setRecordingError('WebM recording is not supported in this browser. Try a current version of Chrome, Edge, or Firefox.');
      return;
    }
    const canvas = canvasWrapperRef.current.querySelector('canvas')!;
    const videoStream = canvas.captureStream(30);
    let stream = videoStream;
    try {
      if (audioUrl) {
        await ensureAudioGraph();
        if (recordDestinationRef.current) {
          const tracks = [...videoStream.getVideoTracks(), ...recordDestinationRef.current.stream.getAudioTracks()];
          stream = new MediaStream(tracks);
        }
      }
      const mimeType = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'].find((mime) => MediaRecorder.isTypeSupported(mime));
      if (!mimeType) throw new Error('This browser cannot encode WebM video. Try Chrome, Edge, or Firefox.');
      const recorder = new MediaRecorder(stream, { mimeType });
      recorderRef.current = recorder; recordingTracksRef.current = stream.getTracks();
      const chunks: BlobPart[] = [];
      recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
      recorder.onerror = () => setRecordingError('Recording stopped unexpectedly. Try exporting again.');
      recorder.onstop = () => {
        if (chunks.length) saveDownload(new Blob(chunks, { type: mimeType }), `${(title || 'music-loop').toLowerCase().replace(/[^a-z0-9]+/g, '-')}-seed-${seed}.webm`);
        recordingTracksRef.current.forEach((track) => track.stop()); recordingTracksRef.current = [];
        setIsRecording(false);
        if (audioRef.current) { audioRef.current.pause(); audioRef.current.currentTime = 0; setPlaying(false); }
      };
      if (audioUrl) {
        await ensureAudioGraph();
        audioRef.current!.currentTime = 0;
        await audioRef.current!.play();
        setPlaying(true);
      }
      recorder.start(200); setIsRecording(true);
      window.setTimeout(() => { if (recorder.state === 'recording') recorder.stop(); }, DURATION * 1000);
    } catch (error) {
      videoStream.getTracks().forEach((track) => track.stop());
      setIsRecording(false); setRecordingError(error instanceof Error ? error.message : 'Could not start video export.');
    }
  };
  const templateParams = useMemo(() => params, [params]);

  return (
    <main className="page-shell studio-grain">
      <Header active="studio" />
      <div className="studio-topline"><Link href="/" className="back-link" data-testid="link-back-gallery"><ArrowLeft size={15} /> ALL TEMPLATES</Link><span className="studio-path">SCENE / {template.name.toUpperCase()}</span><button className="text-action" onClick={() => importInputRef.current?.click()} data-testid="button-import-project"><Upload size={14} /> IMPORT PROJECT</button><input ref={importInputRef} className="visually-hidden" type="file" accept=".json,application/json" onChange={(event) => { void importProject(event.currentTarget.files?.[0]); event.currentTarget.value = ''; }} data-testid="input-import-project" /></div>
      <div className="studio-title-row enter"><div><span className="micro-label">TEMPLATE / {template.number}</span><h1>{template.name}<span className="title-period">.</span></h1><p>{template.detail}</p></div><div className="seed-chip"><span>ACTIVE SEED</span><strong data-testid="text-active-seed">{params.seed}</strong></div></div>
      {(toast || importError) && <div className={`notice ${importError ? 'error-notice' : 'success-notice'}`} role={importError ? 'alert' : 'status'} data-testid={importError ? 'status-import-error' : 'status-project'}>{importError || toast}<button aria-label="Dismiss message" onClick={() => { setToast(''); setImportError(''); }} data-testid="button-dismiss-message"><X size={15} /></button></div>}
      <div className="studio-layout">
        <section className="preview-column" aria-label="Visual preview">
          <div className="preview-top"><div className="preview-live"><span className="live-dot" /> LIVE CANVAS <span className="preview-dot-sep">·</span> {audioUrl ? 'FFT REACTIVE' : 'AMBIENT MOTION'}</div><div className="aspect-control" role="group" aria-label="Canvas aspect ratio"><button aria-pressed={aspect === '9:16'} className={aspect === '9:16' ? 'selected' : ''} onClick={() => setAspect('9:16')} data-testid="button-aspect-916">9:16</button><button aria-pressed={aspect === '1:1'} className={aspect === '1:1' ? 'selected' : ''} onClick={() => setAspect('1:1')} data-testid="button-aspect-11">1:1</button></div></div>
          <div className="preview-stage">
            <div ref={canvasWrapperRef} className={`preview-frame ${aspect === '1:1' ? 'frame-square' : ''}`} data-testid="container-preview-canvas">
              <VisualCanvas templateId={templateId} aspect={aspect} params={templateParams} title={title} artist={artist} showGuides={showGuides} frozen={frozen} cues={cues} analyser={analyser} />
              <div className="frame-meta"><span>FORM STUDIO <i>/</i> PREVIEW</span><span>{aspect} · {DURATION} SEC</span></div>
              {frozen && <span className="frozen-tag"><Pause size={11} /> FRAME HELD</span>}
            </div>
          </div>
          <div className="transport">
            <button className={`transport-play ${playing ? 'playing' : ''}`} onClick={() => void togglePlay()} aria-label={playing ? 'Pause audio preview' : 'Play audio preview'} data-testid="button-audio-play">{playing ? <Pause size={16} /> : <Play size={16} />}</button>
            <div className="transport-track"><div className={`waveform ${playing ? 'waveform-active' : ''}`} aria-hidden="true">{Array.from({ length: 34 }, (_, index) => <i key={index} style={{ height: `${18 + seeded(78, index) * 70}%` }} />)}</div><div className="transport-time"><span>{playing ? formatTime(audioRef.current?.currentTime || 0) : '00:00'}</span><span>{audioDuration ? formatTime(audioDuration) : 'NO TRACK LOADED'}</span></div></div>
            <button className={`still-button ${frozen ? 'still-active' : ''}`} onClick={() => setFrozen((value) => !value)} aria-pressed={frozen} data-testid="button-freeze-frame">{frozen ? <Play size={14} /> : <Pause size={14} />}<span>{frozen ? 'RESUME MOTION' : 'HOLD FRAME'}</span></button>
          </div>
          <div className="preview-footnote"><span><AudioLines size={14} /> {audioUrl ? 'Visuals respond to low-frequency energy' : 'Ambient movement runs without audio'}</span><span>RENDERED IN YOUR BROWSER</span></div>
          {recordingError && <div className="notice error-notice" role="alert" data-testid="status-export-error">{recordingError}</div>}
        </section>

        <aside className="control-column" aria-label="Template controls">
          <section className="control-panel audio-panel">
            <div className="panel-heading"><div><span className="panel-number">01</span><h2>Bring the track</h2></div><Headphones size={17} /></div>
             <button className={`audio-drop ${dragging ? 'is-dragging' : ''} ${audioUrl ? 'has-audio' : ''}`} onClick={() => fileInputRef.current?.click()} onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); void handleAudioFile(event.dataTransfer.files[0]); }} data-testid="button-audio-drop">
               <span className="upload-icon">{audioUrl ? <Check size={18} /> : <Upload size={18} />}</span><span className="drop-copy"><strong>{audioName || 'Drop a track here'}</strong><small>{audioUrl ? `${audioHash ? `SHA-256 ${audioHash.slice(0, 12)}…` : 'Hash unavailable'} · click to replace` : audioName ? 'Saved reference · reselect this track to use it' : 'or choose a file from your device'}</small></span><span className="formats">MP3 · WAV<br />OGG · M4A</span>
            </button>
            <input ref={fileInputRef} className="visually-hidden" type="file" accept=".mp3,.wav,.ogg,.m4a,audio/mpeg,audio/wav,audio/ogg,audio/mp4" onChange={(event) => { void handleAudioFile(event.currentTarget.files?.[0]); event.currentTarget.value = ''; }} data-testid="input-audio-file" />
            {audioError && <div className="field-error" role="alert" data-testid="status-audio-error">{audioError}</div>}
            <div className="two-fields"><label className="field-label">TRACK TITLE<input type="text" value={title} maxLength={60} placeholder="Name this moment" onChange={(event) => setTitle(event.currentTarget.value)} data-testid="input-track-title" /></label><label className="field-label">ARTIST<input type="text" value={artist} maxLength={40} onChange={(event) => setArtist(event.currentTarget.value)} data-testid="input-artist-name" /></label></div>
             <div className="subtitles-row"><div><span className="subtitles-mark">CC</span><span><strong>{subtitlesName || 'Timed subtitles'}</strong><small>{cues.length ? `${cues.length} cues · lower-third safe` : subtitlesName ? 'Saved reference · reselect to load cues' : 'Optional .srt or .vtt'}</small></span></div><button className="icon-button" aria-label={subtitlesName ? 'Replace subtitle file' : 'Upload subtitle file'} onClick={() => subtitleInputRef.current?.click()} data-testid="button-upload-subtitles"><Plus size={16} /></button><input ref={subtitleInputRef} className="visually-hidden" type="file" accept=".srt,.vtt,text/vtt" onChange={(event) => { void uploadSubtitles(event.currentTarget.files?.[0]); event.currentTarget.value = ''; }} data-testid="input-subtitles-file" /></div>
            {subtitlesError && <div className="field-error" role="alert" data-testid="status-subtitle-error">{subtitlesError}</div>}
          </section>

          <section className="control-panel look-panel">
            <div className="panel-heading"><div><span className="panel-number">02</span><h2>Shape the light</h2></div><SlidersHorizontal size={17} /></div>
            <label className="color-control"><span><span className="control-label">ACCENT COLOR</span><small>HUE {params.accentHue}°</small></span><input type="color" value={hueHex(params.accentHue)} onChange={(event) => {
              const hex = event.currentTarget.value;
              const r = parseInt(hex.slice(1, 3), 16) / 255, g = parseInt(hex.slice(3, 5), 16) / 255, b = parseInt(hex.slice(5, 7), 16) / 255;
              const max = Math.max(r, g, b), min = Math.min(r, g, b); let h = 0;
              if (max !== min) { const d = max - min; h = max === r ? ((g - b) / d + (g < b ? 6 : 0)) : max === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; }
              updateParams({ accentHue: Math.round(h) });
            }} data-testid="input-accent-color" aria-label="Accent color" /></label>
            <div className="sliders">
              <RangeControl label="Particle density" value={Math.round(params.particleDensity * 100)} min={0} max={100} suffix="%" onChange={(particleDensity) => updateParams({ particleDensity: particleDensity / 100 })} testId="input-particle-density" />
              <RangeControl label="Light leak intensity" value={Math.round(params.leakIntensity * 100)} min={0} max={100} suffix="%" onChange={(leakIntensity) => updateParams({ leakIntensity: leakIntensity / 100 })} testId="input-light-leak-intensity" />
              <RangeControl label="Motion speed" value={params.motionSpeed} min={0.25} max={2.5} step={0.05} suffix="×" onChange={(motionSpeed) => updateParams({ motionSpeed })} testId="input-motion-speed" />
            </div>
            <label className="toggle-row"><span><strong>Safe-area guides</strong><small>Keep titles clear of platform UI</small></span><input type="checkbox" checked={showGuides} onChange={(event) => setShowGuides(event.currentTarget.checked)} data-testid="toggle-safe-area" /><span className="toggle-track" /></label>
          </section>

          <section className="control-panel variations-panel">
            <div className="panel-heading"><div><span className="panel-number">03</span><h2>Find the one</h2></div><Sparkles size={17} /></div>
            <p className="panel-copy">Three fixed seeds. Same track, a different arrangement of chance.</p>
            <button className="variation-generate" onClick={generateVariations} data-testid="button-generate-variations"><RefreshCw size={15} /> GENERATE 3 VARIATIONS <span>↗</span></button>
            <div className="variation-list">
              {['01', '02', '03'].map((number, index) => {
                const seed = variationSeeds[index];
                return <div className={`variation-row ${params.seed === seed ? 'variation-selected' : ''}`} key={number}>
                  <button className="variation-select" onClick={() => goVariation(index)} aria-pressed={params.seed === seed} data-testid={`button-variation-${index + 1}`}>
                    <span className="variation-no">{number}</span>
                    <span className={`variation-thumb variation-thumb-${templateId}`} style={{ color: colorFromHue(params.accentHue) }} aria-hidden="true">
                      {Array.from({ length: 16 }, (_, dot) => <i key={dot} style={{ left: `${8 + seeded(seed, dot * 3) * 84}%`, top: `${10 + seeded(seed, dot * 3 + 1) * 80}%`, opacity: .35 + seeded(seed, dot * 3 + 2) * .65 }} />)}
                    </span>
                    <span className="variation-seed">SEED {seed}</span>{params.seed === seed && <Check size={14} />}
                  </button>
                  <button className="variation-export" onClick={() => void exportVideo(seed)} disabled={isRecording} aria-label={`Export variation ${index + 1}, seed ${seed}`} data-testid={`button-export-variation-${index + 1}`}><ArrowDownToLine size={13} /></button>
                </div>;
              })}
            </div>
          </section>
        </aside>
      </div>
      <section className="export-dock">
        <div className="export-summary"><span className="export-icon"><Film size={17} /></span><span><strong>Ready when you are.</strong><small>{aspect} · {DURATION} sec loop · WebM + audio</small></span></div>
        <div className="export-buttons"><button className="secondary-button" onClick={downloadProject} data-testid="button-download-json"><FileJson2 size={15} /> PROJECT JSON</button><button className="primary-button" onClick={() => void exportVideo()} disabled={isRecording} data-testid="button-export-webm">{isRecording ? <><span className="recording-pulse" /> RENDERING {DURATION}s…</> : <><ArrowDownToLine size={16} /> EXPORT WEBM</>}</button></div>
      </section>
      <div className="studio-disclaimer"><span><CircleHelp size={13} /> Your audio and project settings stay on this device.</span><span>FILES ARE NEVER UPLOADED</span></div>
      <footer className="site-footer"><span>FORM / STUDIO</span><span>LOCAL RENDER · NO CLOUD</span><span>ARTIST CREDIT: TRP8</span></footer>
      <audio ref={audioRef} className="visually-hidden" src={audioUrl || undefined} preload="metadata" data-testid="audio-source" />
    </main>
  );
}

function NotFound() {
  return <main className="page-shell"><Header /><section className="not-found"><span className="micro-label">404 / NO SCENE HERE</span><h1>Lost in the edit.</h1><p>This page isn’t part of the set.</p><Link href="/" className="primary-button" data-testid="link-not-found-home"><ArrowLeft size={16} /> BACK TO TEMPLATES</Link></section></main>;
}

function App() {
  return <Router><Switch><Route path="/" component={Gallery} /><Route path="/studio/:templateId" component={Studio} /><Route component={NotFound} /></Switch></Router>;
}

export default App;
