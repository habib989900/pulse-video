/* Admin panel — lazy-loaded behind the #/panel route (see App.tsx).
   Everything the panel needs lives here: the CSV import/export helpers,
   the admin form controls, and the panel itself. It imports Thumb/Icon
   back from App.tsx; App only reaches this file through React.lazy, so
   there is no static import cycle. */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  buildEffective, buildRobotsTxt, buildSitemapXml, dateFromDays, DEFAULT_ADS, DEFAULT_ADMIN_STATE, DEFAULT_BUTTONS, DEFAULT_SEO,
  DEFAULT_TEXTS, emptyAdminVideo, extractEmbedSrc, fmtDur, JUNK_TAGS, parseDateValue,
  parseDuration, parseViews, videoToAdmin, VIDEOS, CATEGORIES, CREATORS, CHANNELS, TAGS,
} from "../../lib/catalog";
import type { AdCreative, AdsConfig, AdminState, AdminVideo, Video } from "../../lib/catalog";
import { Icon, Thumb } from "./App";

/* ---------------- CSV (import / export) ---------------- */

const CSV_COLUMNS = ["title", "embed_url", "description", "duration", "views", "date", "creator", "channel", "category", "tags", "thumbnail", "seo_title", "seo_description", "models"] as const;
type CsvColumn = (typeof CSV_COLUMNS)[number];
type CsvRow = Record<CsvColumn, string | null>;

function parseCsv(text: string): string[][] {
  const s = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i] as string;
    if (quoted) {
      if (c === '"') {
        if (s[i + 1] === '"') { cell += '"'; i++; } else quoted = false;
      } else cell += c;
    } else if (c === '"' && cell === "") quoted = true;
    else if (c === '"') cell += c;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n") { row.push(cell); cell = ""; rows.push(row); row = []; }
    else cell += c;
  }
  row.push(cell);
  rows.push(row);
  return rows.filter((r) => !(r.length === 1 && (r[0] ?? "").trim() === ""));
}

/* Maps parsed CSV to column records. The user's rule: an empty cell is
   stored as null — never an error, never a skipped row, never an
   invented value. Missing columns are null for every row. */
function csvToRows(text: string): CsvRow[] {
  const grid = parseCsv(text);
  if (grid.length === 0) return [];
  const header = (grid[0] ?? []).map((h) => h.trim().toLowerCase());
  const known = CSV_COLUMNS as readonly string[];
  /* The header check compares the whole first row: every non-empty
     cell must be a known column, and at least one must match — a data
     row that happens to contain one column name is not a header. */
  const hasHeader = header.length > 0 && header.some((h) => known.includes(h)) && header.every((h) => h === "" || known.includes(h));
  const idx = new Map<string, number>();
  if (hasHeader) header.forEach((h, i) => { if (known.includes(h) && !idx.has(h)) idx.set(h, i); });
  const dataRows = hasHeader ? grid.slice(1) : grid;
  return dataRows.map((r) => {
    const out = {} as CsvRow;
    for (const col of CSV_COLUMNS) {
      const i = hasHeader ? idx.get(col) : CSV_COLUMNS.indexOf(col);
      const raw = i != null ? (r[i] ?? "") : "";
      const v = raw.trim();
      out[col] = v === "" ? null : v;
    }
    return out;
  });
}

function csvRowToAdmin(r: CsvRow, id: string): AdminVideo {
  const date = r.date ? parseDateValue(r.date) : null;
  return {
    id,
    title: r.title,
    description: r.description,
    embedUrl: r.embed_url ? extractEmbedSrc(r.embed_url) : null,
    durationSec: r.duration ? parseDuration(r.duration) : null,
    views: r.views ? parseViews(r.views) : null,
    days: date?.days ?? null,
    dateStr: date?.dateStr ?? null,
    creator: r.creator,
    models: r.models ? r.models.split(",").map((t) => t.trim()).filter(Boolean) : [],
    channel: r.channel,
    category: r.category,
    tags: r.tags ? r.tags.split(",").map((t) => t.trim().toLowerCase()).filter((t) => t !== "" && !JUNK_TAGS.includes(t)) : [],
    thumbnailUrl: r.thumbnail,
    seoTitle: r.seo_title,
    seoDescription: r.seo_description,
    featured: false,
    badgeNew: false,
    rating: null,
    hd: true,
  };
}

function csvEscape(s: string): string {
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const CSV_TEMPLATE = [
  CSV_COLUMNS.join(","),
  'Sample video title,https://example.com/embed/sample-video,A short sample description,12:34,1500,2026-11-20,Sample Creator,Sample Channel,Travel,"travel, guide",https://example.com/thumb.jpg,Sample SEO title,Sample SEO description,Sample Model',
  "Title only plus embed,https://example.com/embed/second,,,,,,,,,,,,",
].join("\n");

/* ---------------- Admin panel helpers ---------------- */

function downloadTextFile(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function AInput({ label, value, onChange, placeholder, type = "text", list }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string; list?: string }) {
  return (
    <label className="block text-sm font-semibold text-zinc-200">{label}
      <input type={type} value={value} placeholder={placeholder} list={list} onChange={(e) => onChange(e.target.value)} className="mt-1.5 w-full rounded-xl border border-[var(--border)] bg-[var(--surface2)] px-3.5 py-2.5 text-sm text-white placeholder:text-zinc-500 focus:border-[var(--accent)] focus:outline-none" />
    </label>
  );
}

function ATextarea({ label, value, onChange, placeholder, rows = 3 }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; rows?: number }) {
  return (
    <label className="block text-sm font-semibold text-zinc-200">{label}
      <textarea value={value} placeholder={placeholder} rows={rows} onChange={(e) => onChange(e.target.value)} className="mt-1.5 w-full rounded-xl border border-[var(--border)] bg-[var(--surface2)] px-3.5 py-2.5 text-sm text-white placeholder:text-zinc-500 focus:border-[var(--accent)] focus:outline-none" />
    </label>
  );
}

function ACheck({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5 text-sm font-semibold text-zinc-200">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-5 w-5 shrink-0 accent-[var(--accent)]" /> {label}
    </label>
  );
}

/* Every place an ad can go. The pre-roll takes an image or a video
   file; the banner slots take an image + link or a pasted ad-network
   snippet (HTML/script, run as-is — exactly how networks deliver). */
const AD_SLOTS: { key: keyof AdsConfig; label: string; hint: string; kinds: AdCreative["kind"][] }[] = [
  { key: "preroll", label: "Pre-roll — before a video plays", hint: "Shows inside the player when a viewer presses play. Skippable after the seconds below.", kinds: ["image", "video"] },
  { key: "homeTop", label: "Home — top", hint: "Banner at the top of the home page, below the filter chips.", kinds: ["image", "html"] },
  { key: "homeBottom", label: "Home — bottom", hint: "Banner at the bottom of the home page, above the footer.", kinds: ["image", "html"] },
  { key: "videoBelow", label: "Video page — below the player", hint: "Banner right under the video player.", kinds: ["image", "html"] },
  { key: "videoBottom", label: "Video page — bottom", hint: "Banner at the very bottom of the video page, below the related videos.", kinds: ["image", "html"] },
  { key: "videoTop", label: "Video page — above the player", hint: "Banner right above the video player, like the top sponsor slot on the reference site.", kinds: ["image", "html"] },
  { key: "pauseBanner", label: "Pause banner — over the player when paused", hint: "Shows over the video while it is paused, with a close button. Shows again on the next pause.", kinds: ["image", "html"] },
  { key: "popup", label: "Popup — over the site, once per visit", hint: "A popup window over the site, a few seconds after the page opens. Close button hides it; it shows once per visit. This is a popup over the page — it never opens a new tab.", kinds: ["image", "html"] },
];

function AdSlotEditor({ slot, ad, onChange }: { slot: (typeof AD_SLOTS)[number]; ad: AdCreative; onChange: (patch: Partial<AdCreative>) => void }) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-display text-base font-extrabold text-white">{slot.label}</h3>
          <p className="mt-0.5 text-sm text-[var(--dim)]">{slot.hint}</p>
        </div>
        <ACheck label="Show this ad" checked={ad.enabled} onChange={(v) => onChange({ enabled: v })} />
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-semibold text-zinc-200">Ad type
          <select value={ad.kind} onChange={(e) => onChange({ kind: e.target.value as AdCreative["kind"] })} className="mt-1.5 w-full rounded-xl border border-[var(--border)] bg-[var(--surface2)] px-3.5 py-2.5 text-sm text-white focus:border-[var(--accent)] focus:outline-none">
            {slot.kinds.map((k) => <option key={k} value={k}>{k === "image" ? "Image" : k === "video" ? "Video" : "Ad network code (HTML)"}</option>)}
          </select>
        </label>
        {slot.key === "preroll" && (
          <AInput label="Skip after (seconds)" type="number" value={String(ad.skipAfterSec)} onChange={(v) => { const n = Math.min(30, Math.max(0, Math.floor(Number(v) || 0))); onChange({ skipAfterSec: n }); }} />
        )}
        {ad.kind !== "html" ? (
          <>
            <AInput label={ad.kind === "video" ? "Video file URL (mp4)" : "Image URL"} value={ad.mediaUrl} onChange={(v) => onChange({ mediaUrl: v })} placeholder="https://…" />
            <AInput label="Click link (opens in a new tab)" value={ad.linkUrl} onChange={(v) => onChange({ linkUrl: v })} placeholder="https://…" />
          </>
        ) : (
          <div className="sm:col-span-2"><ATextarea label="Ad network code (HTML / script)" value={ad.html} onChange={(v) => onChange({ html: v })} rows={4} placeholder="<script>…</script>" /></div>
        )}
      </div>
    </div>
  );
}

const TEXT_FIELDS: { key: string; label: string }[] = [
  { key: "siteName", label: "Site name" },
  { key: "logoText", label: "Logo text" },
  { key: "homeH1", label: "Homepage H1" },
  { key: "secTrending", label: "Section title — Trending" },
  { key: "secLatest", label: "Section title — Latest" },
  { key: "secModels", label: "Section title — Popular models" },
  { key: "secChannels", label: "Section title — Channels" },
  { key: "secBecause", label: "Section title — “Because you watch” prefix" },
  { key: "secTopRated", label: "Section title — Top rated" },
  { key: "searchPlaceholder", label: "Search box placeholder" },
  { key: "footerText", label: "Footer text" },
  { key: "cookieText", label: "Cookie banner text" },
  { key: "termsText", label: "Terms of use page text" },
  { key: "privacyText", label: "Privacy policy page text" },
];

const ADMIN_SECTIONS = [
  { id: "dashboard", label: "Dashboard" },
  { id: "texts", label: "Site Text" },
  { id: "buttons", label: "Buttons" },
  { id: "seo", label: "SEO" },
  { id: "ads", label: "Ads" },
  { id: "videos", label: "Videos" },
  { id: "taxonomy", label: "Categories / Models / Channels / Tags" },
  { id: "csv", label: "CSV Import" },
] as const;
type AdminSection = (typeof ADMIN_SECTIONS)[number]["id"];
type TaxTab = "categories" | "models" | "channels" | "tags";

/* The admin panel. Opens only after the admin code typed into the
   site search box is verified by the server (verifyAdminCode) —
   nothing on the public site links here, and the code is not in
   this bundle.
   All edits live in one AdminState working copy: text,
   button and SEO sections persist with their Save buttons; video,
   taxonomy and CSV changes save immediately through onSave. */
export function AdminPanel({ initial, onSave, onReset, onExit, onOpenVideo, flash, theme, onToggleTheme, saveDisabled, saveError, onDismissSaveError, staleBanner, onReloadPanel, onKeepEdits, onDirtyChange, otherTabOpen }: {
  initial: AdminState;
  onSave: (st: AdminState) => void;
  onReset: () => void;
  onExit: () => void;
  onOpenVideo: (v: Video) => void;
  flash: (msg: string) => void;
  theme: "dark" | "light";
  onToggleTheme: () => void;
  /* A4/A23/A1: App owns the save state — the panel only renders it. */
  saveDisabled: boolean;
  saveError: string;
  onDismissSaveError: () => void;
  staleBanner: boolean;
  onReloadPanel: () => void;
  onKeepEdits: () => void;
  onDirtyChange: (dirty: boolean) => void;
  otherTabOpen: boolean;
}) {
  const [st, setSt] = useState<AdminState>(() => JSON.parse(JSON.stringify(initial)) as AdminState);
  const [section, setSection] = useState<AdminSection>("dashboard");
  const eff = useMemo(() => buildEffective(st), [st]);
  /* Report whether the working copy differs from the last
     server-confirmed state, so App can tell a real external change
     from the panel's own edits. */
  useEffect(() => { onDirtyChange(JSON.stringify(st) !== JSON.stringify(initial)); }, [st, initial, onDirtyChange]);
  const commit = (next: AdminState) => { setSt(next); onSave(next); };

  /* Videos section state */
  const [vSearch, setVSearch] = useState("");
  const [vCat, setVCat] = useState("All");
  const [vShow, setVShow] = useState(40);
  const [form, setForm] = useState<AdminVideo | null>(null);
  const [durText, setDurText] = useState("");
  const [tagsText, setTagsText] = useState("");
  const [modelsText, setModelsText] = useState("");
  const [formError, setFormError] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);

  /* Taxonomy section state */
  const [taxTab, setTaxTab] = useState<TaxTab>("categories");
  const [newName, setNewName] = useState("");
  const [newCreator, setNewCreator] = useState("");
  const [renameOf, setRenameOf] = useState<string | null>(null);
  const [renameText, setRenameText] = useState("");
  const [confirmTaxDelete, setConfirmTaxDelete] = useState<string | null>(null);
  const [taxSelected, setTaxSelected] = useState<string[]>([]);
  const [confirmTaxBulkDelete, setConfirmTaxBulkDelete] = useState(false);

  /* CSV section state */
  const [csvText, setCsvText] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [report, setReport] = useState<{ added: number; updated: number; skipped: { row: number; reason: string }[]; nullFields: { row: number; title: string; fields: string[] }[]; warnings: { row: number; reason: string }[] } | null>(null);
  const [updateExisting, setUpdateExisting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  /* CSV parsing is debounced ~300ms after the last paste/edit, so a
     long paste does not re-parse on every keystroke. */
  const [csvRows, setCsvRows] = useState<CsvRow[] | null>(null);
  useEffect(() => {
    const t = window.setTimeout(() => setCsvRows(csvText.trim() ? csvToRows(csvText) : null), 300);
    return () => window.clearTimeout(t);
  }, [csvText]);

  const [confirmReset, setConfirmReset] = useState(false);

  const filteredVideos = eff.videos.filter((v) => (vCat === "All" || v.category === vCat) && (!vSearch.trim() || v.title.toLowerCase().includes(vSearch.trim().toLowerCase()) || v.creator.toLowerCase().includes(vSearch.trim().toLowerCase())));
  const recent = [...eff.videos].sort((a, b) => a.days - b.days).slice(0, 6);

  const openAdd = () => { setForm(emptyAdminVideo(crypto.randomUUID())); setDurText(""); setTagsText(""); setModelsText(""); setFormError(""); };
  const openEdit = (v: Video) => { const av = videoToAdmin(v); setForm(av); setDurText(av.durationSec != null ? fmtDur(av.durationSec) : ""); setTagsText(av.tags.join(", ")); setModelsText(av.models.join(", ")); setFormError(""); };
  const saveForm = () => {
    if (!form) return;
    const clean = (s: string | null) => (s?.trim() ? s.trim() : null);
    const rec: AdminVideo = {
      ...form,
      title: clean(form.title),
      embedUrl: form.embedUrl?.trim() ? extractEmbedSrc(form.embedUrl) : null,
      description: form.description?.trim() ? form.description : null,
      creator: clean(form.creator),
      channel: clean(form.channel),
      category: clean(form.category),
      thumbnailUrl: clean(form.thumbnailUrl),
      seoTitle: clean(form.seoTitle),
      seoDescription: clean(form.seoDescription),
      durationSec: parseDuration(durText),
      tags: tagsText.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean),
      models: modelsText.split(",").map((t) => t.trim()).filter(Boolean),
    };
    if (!rec.title && !rec.embedUrl) { setFormError("Give the video at least a title or an embed link — a video with neither cannot be added."); return; }
    if (st.addedVideos.some((v) => v.id === rec.id)) commit({ ...st, addedVideos: st.addedVideos.map((v) => (v.id === rec.id ? rec : v)) });
    else if (VIDEOS.some((v) => v.id === rec.id)) commit({ ...st, overrides: { ...st.overrides, [rec.id]: rec } });
    else commit({ ...st, addedVideos: [rec, ...st.addedVideos] });
    setForm(null);
  };
  const deleteVideo = (v: Video) => {
    if (st.addedVideos.some((a) => a.id === v.id)) commit({ ...st, addedVideos: st.addedVideos.filter((a) => a.id !== v.id) });
    else {
      const overrides = { ...st.overrides };
      delete overrides[v.id];
      commit({ ...st, overrides, deletedIds: [...st.deletedIds, v.id] });
    }
    setConfirmDeleteId(null);
    setSelectedIds((prev) => prev.filter((id) => id !== v.id));
  };

  /* Bulk delete: tick videos in the list (or Select all matching), then
     delete them all in one commit — added videos are dropped, built-in
     catalog videos go through deletedIds, and their overrides go too. */
  const toggleSelect = (id: string) => {
    setConfirmBulkDelete(false);
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };
  const allFilteredSelected = filteredVideos.length > 0 && filteredVideos.every((v) => selectedIds.includes(v.id));
  const toggleSelectAll = () => {
    setConfirmBulkDelete(false);
    setSelectedIds((prev) => allFilteredSelected
      ? prev.filter((id) => !filteredVideos.some((v) => v.id === id))
      : Array.from(new Set([...prev, ...filteredVideos.map((v) => v.id)])));
  };
  const deleteSelected = () => {
    const ids = new Set(selectedIds);
    if (ids.size === 0) return;
    const overrides = { ...st.overrides };
    for (const id of ids) delete overrides[id];
    commit({
      ...st,
      addedVideos: st.addedVideos.filter((a) => !ids.has(a.id)),
      overrides,
      deletedIds: [...st.deletedIds, ...[...ids].filter((id) => VIDEOS.some((v) => v.id === id) && !st.deletedIds.includes(id))],
    });
    setSelectedIds([]);
    setConfirmBulkDelete(false);
  };

  const baseNames = (tab: TaxTab): string[] => tab === "categories" ? CATEGORIES.map((c) => c.name) : tab === "models" ? CREATORS.map((c) => c.name) : tab === "channels" ? CHANNELS.map((c) => c.name) : TAGS.map((t) => t.name);
  const taxList = (tab: TaxTab): { name: string; count: string }[] =>
    tab === "categories" ? eff.categories.map((c) => ({ name: c.name, count: c.count }))
    : tab === "models" ? eff.creators.map((c) => ({ name: c.name, count: String(c.videos) }))
    : tab === "channels" ? eff.channels.map((c) => ({ name: c.name, count: c.videos }))
    : eff.tags.map((t) => ({ name: t.name, count: String(t.count) }));
  const taxAdd = (tab: TaxTab, name: string, creator?: string) => {
    const n = name.trim();
    if (!n) return;
    if (tab === "channels") { commit({ ...st, taxonomy: { ...st.taxonomy, channelsAdded: [...st.taxonomy.channelsAdded, { name: n, creator: (creator ?? "").trim() }] } }); return; }
    const op = st.taxonomy[tab];
    if (op.deleted.includes(n)) commit({ ...st, taxonomy: { ...st.taxonomy, [tab]: { ...op, deleted: op.deleted.filter((d) => d !== n) } } });
    else if (!op.added.includes(n) && !baseNames(tab).includes(n)) commit({ ...st, taxonomy: { ...st.taxonomy, [tab]: { ...op, added: [...op.added, n] } } });
  };
  const taxRename = (tab: TaxTab, oldName: string, newName: string) => {
    const n = newName.trim();
    if (!n || n === oldName) return;
    /* A renamed model keeps its photo: move the modelPhotos key. */
    const movePhoto = (s: AdminState) => {
      if (tab !== "models" || !s.modelPhotos?.[oldName]) return s;
      const next = { ...s.modelPhotos };
      const prev = next[oldName];
      if (prev) next[n] = prev;
      delete next[oldName];
      return { ...s, modelPhotos: next };
    };
    if (tab === "channels" && st.taxonomy.channelsAdded.some((c) => c.name === oldName)) {
      commit({ ...st, taxonomy: { ...st.taxonomy, channelsAdded: st.taxonomy.channelsAdded.map((c) => (c.name === oldName ? { ...c, name: n } : c)) } });
      return;
    }
    const op = st.taxonomy[tab];
    if (op.added.includes(oldName)) { commit(movePhoto({ ...st, taxonomy: { ...st.taxonomy, [tab]: { ...op, added: op.added.map((a) => (a === oldName ? n : a)) } } })); return; }
    const renamed = { ...op.renamed };
    const key = Object.keys(renamed).find((k) => renamed[k] === oldName) ?? oldName;
    renamed[key] = n;
    commit(movePhoto({ ...st, taxonomy: { ...st.taxonomy, [tab]: { ...op, renamed } } }));
  };
  /* Pure form of a single taxonomy delete, so the bulk delete can fold
     many names through it and commit once. */
  const taxDeleteFrom = (s: AdminState, tab: TaxTab, name: string): AdminState => {
    /* Deleting a model also drops its photo so no orphaned URL lingers. */
    if (tab === "models" && s.modelPhotos?.[name]) {
      const next = { ...s.modelPhotos };
      delete next[name];
      s = { ...s, modelPhotos: next };
    }
    if (tab === "channels" && s.taxonomy.channelsAdded.some((c) => c.name === name)) {
      return { ...s, taxonomy: { ...s.taxonomy, channelsAdded: s.taxonomy.channelsAdded.filter((c) => c.name !== name) } };
    }
    const op = s.taxonomy[tab];
    if (op.added.includes(name)) return { ...s, taxonomy: { ...s.taxonomy, [tab]: { ...op, added: op.added.filter((a) => a !== name) } } };
    const renamed = { ...op.renamed };
    const key = Object.keys(renamed).find((k) => renamed[k] === name) ?? name;
    delete renamed[key];
    return { ...s, taxonomy: { ...s.taxonomy, [tab]: { ...op, renamed, deleted: [...op.deleted, key] } } };
  };
  const taxDelete = (tab: TaxTab, name: string) => commit(taxDeleteFrom(st, tab, name));

  /* Bulk select/delete for the taxonomy lists — same pattern as the
     Videos list: tick items (or Select all), then delete in one commit. */
  const taxItems = taxList(taxTab);
  const taxSingular = taxTab === "categories" ? "category" : taxTab === "models" ? "model" : taxTab === "channels" ? "channel" : "tag";
  const allTaxSelected = taxItems.length > 0 && taxItems.every((i) => taxSelected.includes(i.name));
  const toggleTaxSelect = (name: string) => {
    setConfirmTaxBulkDelete(false);
    setTaxSelected((prev) => (prev.includes(name) ? prev.filter((x) => x !== name) : [...prev, name]));
  };
  const toggleTaxSelectAll = () => {
    setConfirmTaxBulkDelete(false);
    setTaxSelected((prev) => allTaxSelected
      ? prev.filter((n) => !taxItems.some((i) => i.name === n))
      : Array.from(new Set([...prev, ...taxItems.map((i) => i.name)])));
  };
  const deleteTaxSelected = () => {
    if (taxSelected.length === 0) return;
    let next = st;
    for (const name of taxSelected) next = taxDeleteFrom(next, taxTab, name);
    commit(next);
    setTaxSelected([]);
    setConfirmTaxBulkDelete(false);
    setConfirmTaxDelete(null);
  };

  const readFile = (f: File) => {
    const r = new FileReader();
    r.onload = () => { setCsvText(String(r.result ?? "")); setReport(null); };
    r.readAsText(f);
  };
  const doImport = () => {
    if (!csvRows) return;
    const existing = new Set(eff.videos.map((v) => v.embedUrl?.trim()).filter(Boolean) as string[]);
    const addedRecs: AdminVideo[] = [];
    const skipped: { row: number; reason: string }[] = [];
    const nullFields: { row: number; title: string; fields: string[] }[] = [];
    const warnings: { row: number; reason: string }[] = [];
    const updatedById = new Map<string, AdminVideo>();
    let updated = 0;
    /* Update-existing mode matches rows to videos already on the site
       by normalised embed link (trimmed, case-insensitive). */
    const addedByEmbed = new Map<string, AdminVideo>();
    for (const a of st.addedVideos) if (a.embedUrl) addedByEmbed.set(a.embedUrl.trim().toLowerCase(), a);
    csvRows.forEach((r, i) => {
      const rowNo = i + 1;
      /* A duration/date value that is present but unreadable is a
         warning, not a silent drop — the field is left unchanged. */
      if (r.duration && parseDuration(r.duration) === null) warnings.push({ row: rowNo, reason: `Duration "${r.duration}" could not be read — left unchanged.` });
      if (r.date && parseDateValue(r.date) === null) warnings.push({ row: rowNo, reason: `Date "${r.date}" could not be read — left unchanged.` });
      if (!r.title && !r.embed_url) { skipped.push({ row: rowNo, reason: "No title and no embed_url — nothing to import." }); return; }
      if (r.embed_url) {
        const src = extractEmbedSrc(r.embed_url);
        if (updateExisting) {
          const match = addedByEmbed.get(src.trim().toLowerCase());
          if (match) {
            /* Only duration/date move: title, embed link and tags of
               the matched video are never touched. */
            const dur = r.duration ? parseDuration(r.duration) : null;
            const date = r.date ? parseDateValue(r.date) : null;
            const next: AdminVideo = { ...match, durationSec: dur ?? match.durationSec, days: date?.days ?? match.days, dateStr: date?.dateStr ?? match.dateStr };
            updatedById.set(match.id, next);
            addedByEmbed.set(src.trim().toLowerCase(), next);
            updated += 1;
            return;
          }
        }
        if (existing.has(src)) { skipped.push({ row: rowNo, reason: `Duplicate embed_url — already on the site: ${src}` }); return; }
        existing.add(src);
      }
      addedRecs.push(csvRowToAdmin(r, crypto.randomUUID()));
      nullFields.push({ row: rowNo, title: r.title ?? "Untitled video", fields: CSV_COLUMNS.filter((c) => r[c] === null) });
    });
    if (addedRecs.length || updatedById.size) commit({ ...st, addedVideos: [...addedRecs, ...st.addedVideos.map((a) => updatedById.get(a.id) ?? a)] });
    setReport({ added: addedRecs.length, updated, skipped, nullFields, warnings });
  };
  const doExport = () => {
    const lines = [CSV_COLUMNS.join(",")];
    for (const v of eff.videos) {
      const row: Record<CsvColumn, string> = {
        title: v.title,
        embed_url: v.embedUrl ?? "",
        description: v.custom ? (v.description ?? "") : "",
        duration: v.duration,
        views: v.hasViews ? String(v.views) : "",
        date: v.hasDate ? dateFromDays(v.days) : "",
        creator: v.creator,
        models: v.models.join(", "),
        channel: v.channel ?? "",
        category: v.category,
        tags: v.tags.join(", "),
        thumbnail: v.thumbnailUrl ?? "",
        seo_title: v.seoTitle ?? "",
        seo_description: v.seoDescription ?? "",
      };
      lines.push(CSV_COLUMNS.map((c) => csvEscape(row[c])).join(","));
    }
    downloadTextFile("videos-export.csv", lines.join("\n"));
    flash("CSV export downloaded");
  };

  const doResetAll = () => {
    setSt(JSON.parse(JSON.stringify(DEFAULT_ADMIN_STATE)) as AdminState);
    setForm(null);
    setCsvText("");
    setReport(null);
    setConfirmReset(false);
    onReset();
  };

  const inputCls = "w-full rounded-xl border border-[var(--border)] bg-[var(--surface2)] px-3.5 py-2.5 text-sm text-white placeholder:text-zinc-500 focus:border-[var(--accent)] focus:outline-none";

  return (
    <div className="mx-auto max-w-6xl px-4 pb-24 pt-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-black text-white sm:text-2xl">Admin Panel</h1>
          <p className="mt-0.5 text-[13px] text-[var(--dim)]">Manage {st.texts.siteName || "the site"} — texts, buttons, SEO, videos and CSV imports.</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"} aria-pressed={theme === "light"} onClick={onToggleTheme} className="p-2 text-white transition active:scale-90"><Icon n={theme === "dark" ? "sun" : "moon"} size={21} tone="accent" /></button>
          <button type="button" onClick={onExit} className="rounded-full border border-[var(--border)] px-5 py-2.5 text-sm font-bold text-white transition active:scale-95">View site</button>
        </div>
      </div>
      <p className="mt-3 rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-[13px] leading-relaxed text-amber-200">
        This panel is not linked anywhere on the public site. It opens only after the admin code typed into the site's search box is verified on the server, and every save is checked against that verification before it is stored. Keep the code private — anyone who knows it can open this panel.
      </p>
      {saveError && (
        <div role="alert" className="mt-3 flex items-start justify-between gap-3 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-[13px] leading-relaxed text-red-200">
          <span><b className="text-white">Save failed — your changes were not saved.</b> {saveError} The panel was reverted to the last saved state; please try again.</span>
          <button type="button" aria-label="Dismiss save error" onClick={onDismissSaveError} className="shrink-0 rounded-full border border-red-500/50 px-3 py-1 text-xs font-bold text-white transition active:scale-95">Dismiss</button>
        </div>
      )}
      {staleBanner && (
        <div role="alert" className="mt-3 rounded-xl border border-amber-400/40 bg-amber-400/10 px-4 py-3 text-[13px] leading-relaxed text-amber-200">
          <p><b className="text-white">Site data changed elsewhere — reload to see the latest.</b> Saving now would overwrite those changes.</p>
          <div className="mt-2.5 flex flex-wrap gap-2.5">
            <button type="button" onClick={onReloadPanel} className="rounded-full bg-amber-400 px-5 py-2 text-[13px] font-bold text-black transition active:scale-95">Reload</button>
            <button type="button" onClick={onKeepEdits} className="rounded-full border border-[var(--border)] px-5 py-2 text-[13px] font-bold text-white transition active:scale-95">Keep my edits</button>
          </div>
        </div>
      )}
      {otherTabOpen && (
        <p role="alert" className="mt-3 rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-[13px] leading-relaxed text-amber-200">Admin panel is open in another tab — saves from two tabs can overwrite each other.</p>
      )}

      <div className="mt-5 flex flex-col gap-5 sm:flex-row">
        <nav className="no-scrollbar flex shrink-0 gap-2 overflow-x-auto sm:w-56 sm:flex-col sm:overflow-visible" aria-label="Admin sections">
          {ADMIN_SECTIONS.map((s) => (
            <button key={s.id} type="button" aria-current={section === s.id ? "page" : undefined} onClick={() => setSection(s.id)} className={`whitespace-nowrap rounded-xl px-4 py-3 text-left text-sm font-bold transition active:scale-[0.98] sm:whitespace-normal ${section === s.id ? "bg-[var(--accent)] text-white" : "bg-[var(--surface)] text-zinc-200"}`}>{s.label}</button>
          ))}
        </nav>

        <div className="min-w-0 flex-1">
          {section === "dashboard" && (
            <section aria-label="Dashboard">
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
                {[
                  { label: "Videos", value: eff.videos.length },
                  { label: "Models", value: eff.creators.length },
                  { label: "Channels", value: eff.channels.length },
                  { label: "Categories", value: eff.categories.length },
                  { label: "Tags", value: eff.tags.length },
                ].map((s) => (
                  <div key={s.label} className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
                    <p className="font-display text-2xl font-black text-white">{s.value}</p>
                    <p className="mt-0.5 text-[13px] text-[var(--dim)]">{s.label}</p>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex flex-wrap gap-3">
                <button type="button" onClick={() => { setSection("videos"); openAdd(); }} className="rounded-full bg-[var(--accent)] px-6 py-3 font-display text-sm font-black text-white transition active:scale-95">+ Add a video</button>
                <button type="button" onClick={() => setSection("csv")} className="rounded-full border border-[var(--border)] px-6 py-3 font-display text-sm font-black text-white transition active:scale-95">Import CSV</button>
                <button type="button" onClick={() => setSection("videos")} className="rounded-full border border-[var(--border)] px-6 py-3 font-display text-sm font-black text-white transition active:scale-95">Manage videos</button>
              </div>
              <h2 className="font-display mt-7 text-lg font-extrabold text-white">Recent videos</h2>
              <div className="mt-3 space-y-2.5">
                {recent.map((v) => (
                  <div key={v.id} className="flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3">
                    <div className="w-28 shrink-0 sm:w-36"><Thumb v={v} /></div>
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-1 text-sm font-bold text-white">{v.title}</p>
                      <p className="mt-0.5 text-xs text-[var(--dim)]">{v.category}{v.creator ? ` · ${v.creator}` : ""} · {v.hasDate ? v.age : "no date"}</p>
                      <p className={`mt-0.5 text-xs font-semibold ${v.embedUrl ? "text-emerald-400" : "text-amber-400"}`}>{v.embedUrl ? "Embed source set" : "No video source — art player shows"}</p>
                    </div>
                    <button type="button" onClick={() => { setSection("videos"); openEdit(v); }} className="shrink-0 rounded-full bg-[var(--surface2)] px-4 py-2 text-sm font-bold text-white transition active:scale-95">Edit</button>
                  </div>
                ))}
              </div>
              <div className="mt-9 rounded-2xl border border-red-500/30 bg-red-500/5 p-4">
                <h2 className="font-display text-base font-extrabold text-white">Reset all admin changes</h2>
                <p className="mt-1 text-sm text-[var(--dim)]">Restores every text, button, SEO field, video and taxonomy change back to the site's built-in defaults. Videos you added or imported are removed; the original catalog comes back untouched.</p>
                {confirmReset ? (
                  <div className="mt-3 flex flex-wrap gap-2.5">
                    <button type="button" disabled={saveDisabled} onClick={doResetAll} className="rounded-full bg-red-600 px-5 py-2.5 text-sm font-bold text-white transition active:scale-95 disabled:opacity-40">Yes, reset everything</button>
                    <button type="button" onClick={() => setConfirmReset(false)} className="rounded-full border border-[var(--border)] px-5 py-2.5 text-sm font-bold text-white transition active:scale-95">Cancel</button>
                  </div>
                ) : (
                  <button type="button" onClick={() => setConfirmReset(true)} className="mt-3 rounded-full border border-red-500 px-5 py-2.5 text-sm font-bold text-red-400 transition active:scale-95">Reset all admin changes</button>
                )}
              </div>
            </section>
          )}

          {section === "texts" && (
            <section aria-label="Site text">
              <h2 className="font-display text-lg font-extrabold text-white">Site Text</h2>
              <p className="mt-1 text-sm text-[var(--dim)]">These texts appear on the public site. Save and they change everywhere immediately.</p>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                {TEXT_FIELDS.map((f) => (
                  f.key === "footerText" || f.key === "cookieText" || f.key === "termsText" || f.key === "privacyText" ? (
                    <div key={f.key} className="sm:col-span-2"><ATextarea label={f.label} value={st.texts[f.key] ?? ""} onChange={(v) => setSt({ ...st, texts: { ...st.texts, [f.key]: v } })} rows={2} /></div>
                  ) : (
                    <AInput key={f.key} label={f.label} value={st.texts[f.key] ?? ""} onChange={(v) => setSt({ ...st, texts: { ...st.texts, [f.key]: v } })} />
                  )
                ))}
              </div>
              <div className="mt-5 flex flex-wrap gap-3">
                <button type="button" disabled={saveDisabled} onClick={() => onSave(st)} className="rounded-full bg-[var(--accent)] px-7 py-3 font-display text-sm font-black text-white transition active:scale-95 disabled:opacity-40">Save texts</button>
                <button type="button" disabled={saveDisabled} onClick={() => { const next = { ...st, texts: { ...DEFAULT_TEXTS } }; setSt(next); onSave(next); }} className="rounded-full border border-[var(--border)] px-6 py-3 text-sm font-bold text-white transition active:scale-95 disabled:opacity-40">Reset to default</button>
              </div>
            </section>
          )}

          {section === "buttons" && (
            <section aria-label="Buttons">
              <h2 className="font-display text-lg font-extrabold text-white">Buttons</h2>
              <p className="mt-1 text-sm text-[var(--dim)]">Edit each button's label. (The saved link value is kept for compatibility but is not used anywhere.)</p>
              <div className="mt-4 space-y-3">
                {st.buttons.map((b, i) => (
                  <div key={b.id} className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
                    <p className="text-sm font-bold text-white">{b.name}</p>
                    <div className="mt-2.5">
                      <AInput label="Label" value={b.label} onChange={(v) => setSt({ ...st, buttons: st.buttons.map((x, xi) => (xi === i ? { ...x, label: v } : x)) })} />
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-5 flex flex-wrap gap-3">
                <button type="button" disabled={saveDisabled} onClick={() => onSave(st)} className="rounded-full bg-[var(--accent)] px-7 py-3 font-display text-sm font-black text-white transition active:scale-95 disabled:opacity-40">Save buttons</button>
                <button type="button" disabled={saveDisabled} onClick={() => { const next = { ...st, buttons: DEFAULT_BUTTONS.map((b) => ({ ...b })) }; setSt(next); onSave(next); }} className="rounded-full border border-[var(--border)] px-6 py-3 text-sm font-bold text-white transition active:scale-95 disabled:opacity-40">Reset to default</button>
              </div>
            </section>
          )}

          {section === "seo" && (
            <section aria-label="SEO">
              <h2 className="font-display text-lg font-extrabold text-white">SEO</h2>
              <p className="mt-1 text-sm text-[var(--dim)]">Site-wide search settings. Each video can also carry its own SEO title and description — edit those in the video form under Videos.</p>
              <div className="mt-4 grid gap-4">
                <AInput label="Site title" value={st.seo.siteTitle} onChange={(v) => setSt({ ...st, seo: { ...st.seo, siteTitle: v } })} />
                <ATextarea label="Meta description" value={st.seo.metaDescription} onChange={(v) => setSt({ ...st, seo: { ...st.seo, metaDescription: v } })} rows={2} />
                <AInput label="Meta keywords (comma-separated)" value={st.seo.metaKeywords} onChange={(v) => setSt({ ...st, seo: { ...st.seo, metaKeywords: v } })} />
                <AInput label="OG title (social share)" value={st.seo.ogTitle} onChange={(v) => setSt({ ...st, seo: { ...st.seo, ogTitle: v } })} />
                <ATextarea label="OG description (social share)" value={st.seo.ogDescription} onChange={(v) => setSt({ ...st, seo: { ...st.seo, ogDescription: v } })} rows={2} />
              </div>
              <div className="mt-5 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4" aria-label="Search result preview">
                <p className="text-xs font-bold uppercase tracking-wide text-[var(--dim)]">Search result preview</p>
                <p className="mt-2.5 text-xs text-emerald-500">pulsevideo.example</p>
                <p className="mt-0.5 text-lg font-semibold leading-snug text-[#8ab4f8]">{st.seo.siteTitle || "—"}</p>
                <p className="mt-0.5 line-clamp-2 text-sm leading-relaxed text-zinc-300">{st.seo.metaDescription || "—"}</p>
              </div>
              <div className="mt-5 flex flex-wrap gap-3">
                <button type="button" disabled={saveDisabled} onClick={() => onSave(st)} className="rounded-full bg-[var(--accent)] px-7 py-3 font-display text-sm font-black text-white transition active:scale-95 disabled:opacity-40">Save SEO</button>
                <button type="button" disabled={saveDisabled} onClick={() => { const next = { ...st, seo: { ...DEFAULT_SEO } }; setSt(next); onSave(next); }} className="rounded-full border border-[var(--border)] px-6 py-3 text-sm font-bold text-white transition active:scale-95 disabled:opacity-40">Reset to default</button>
              </div>
              {(() => {
                const base = window.location.origin && window.location.origin !== "null" ? `${window.location.origin}${window.location.pathname}` : "";
                const sitemap = buildSitemapXml(base, eff);
                const robots = buildRobotsTxt(base);
                const urlCount = 10 + eff.videos.length + eff.categories.length + eff.creators.length + eff.channels.length + eff.tags.length;
                const dl = (name: string, text: string, type: string) => {
                  const u = URL.createObjectURL(new Blob([text], { type }));
                  const a = document.createElement("a");
                  a.href = u; a.download = name;
                  document.body.appendChild(a); a.click(); a.remove();
                  window.setTimeout(() => URL.revokeObjectURL(u), 4000);
                };
                return (
                  <div className="mt-6 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
                    <p className="text-xs font-bold uppercase tracking-wide text-[var(--dim)]">Sitemap &amp; robots.txt</p>
                    <p className="mt-2 text-sm leading-relaxed text-zinc-300">Generated live from the current catalog — {urlCount} URLs ({eff.videos.length} videos, {eff.categories.length} categories, {eff.creators.length} models, {eff.channels.length} channels, {eff.tags.length} tags). Add or import a video and it appears in the sitemap automatically. The sitemap lists real path URLs (…/video/…) with no # fragment — crawlers strip everything after a #, so hash URLs would all collapse to the home page — and opening one of those paths in the app resolves to the same page. robots.txt contains no # either (a # there starts a comment, which turned the old Disallow lines into a block of the whole site): it allows everything and points crawlers to the sitemap.</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button type="button" onClick={() => dl("sitemap.xml", sitemap, "application/xml")} className="rounded-full bg-[var(--accent)] px-5 py-2.5 text-sm font-bold text-white transition active:scale-95">Download sitemap.xml</button>
                      <button type="button" onClick={() => dl("robots.txt", robots, "text/plain")} className="rounded-full border border-[var(--border)] px-5 py-2.5 text-sm font-bold text-white transition active:scale-95">Download robots.txt</button>
                      <button type="button" onClick={() => { void navigator.clipboard?.writeText(sitemap).then(() => flash("Sitemap XML copied"), () => flash("Copy failed")); }} className="rounded-full border border-[var(--border)] px-5 py-2.5 text-sm font-bold text-white transition active:scale-95">Copy sitemap</button>
                      <button type="button" onClick={() => { window.location.hash = "#/sitemap.xml"; }} className="rounded-full border border-[var(--border)] px-5 py-2.5 text-sm font-bold text-white transition active:scale-95">Open sitemap page</button>
                      <button type="button" onClick={() => { window.location.hash = "#/robots.txt"; }} className="rounded-full border border-[var(--border)] px-5 py-2.5 text-sm font-bold text-white transition active:scale-95">Open robots.txt page</button>
                    </div>
                  </div>
                );
              })()}
            </section>
          )}

          {section === "ads" && (
            <section aria-label="Ads">
              <h2 className="font-display text-lg font-extrabold text-white">Ads</h2>
              <p className="mt-1 text-sm text-[var(--dim)]">Place ads anywhere on the site. A slot shows nothing while it is off or empty. Image and video ads link to the URL you set; ad-network code runs exactly as pasted.</p>
              <div className="mt-5 grid gap-5">
                {AD_SLOTS.map((s) => (
                  <AdSlotEditor key={s.key} slot={s} ad={st.ads[s.key]} onChange={(patch) => setSt({ ...st, ads: { ...st.ads, [s.key]: { ...st.ads[s.key], ...patch } } })} />
                ))}
              </div>
              <div className="mt-5 flex flex-wrap gap-3">
                <button type="button" disabled={saveDisabled} onClick={() => onSave(st)} className="rounded-full bg-[var(--accent)] px-7 py-3 font-display text-sm font-black text-white transition active:scale-95 disabled:opacity-40">Save ads</button>
                <button type="button" disabled={saveDisabled} onClick={() => { const next = { ...st, ads: JSON.parse(JSON.stringify(DEFAULT_ADS)) as AdsConfig }; setSt(next); onSave(next); }} className="rounded-full border border-[var(--border)] px-6 py-3 text-sm font-bold text-white transition active:scale-95 disabled:opacity-40">Reset to default</button>
              </div>
            </section>
          )}

          {section === "videos" && (
            <section aria-label="Videos">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="font-display text-lg font-extrabold text-white">Videos <span className="text-[var(--dim)]">({filteredVideos.length})</span></h2>
                <button type="button" onClick={openAdd} className="rounded-full bg-[var(--accent)] px-5 py-2.5 font-display text-sm font-black text-white transition active:scale-95">+ Add video</button>
              </div>
              <div className="mt-3 flex flex-col gap-2.5 sm:flex-row">
                <input aria-label="Search videos" value={vSearch} onChange={(e) => { setVSearch(e.target.value); setVShow(40); setSelectedIds([]); setConfirmBulkDelete(false); }} placeholder="Search title or model…" className={inputCls} />
                <select aria-label="Filter by category" value={vCat} onChange={(e) => { setVCat(e.target.value); setVShow(40); setSelectedIds([]); setConfirmBulkDelete(false); }} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-2.5 text-sm font-semibold text-white focus:border-[var(--accent)] focus:outline-none">
                  <option>All</option>
                  {eff.categories.map((c) => <option key={c.name}>{c.name}</option>)}
                </select>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
                <label className="flex cursor-pointer items-center gap-2 py-1 text-sm font-semibold text-zinc-200">
                  <input type="checkbox" aria-label="Select all matching videos" checked={allFilteredSelected} onChange={toggleSelectAll} className="h-5 w-5 shrink-0 accent-[var(--accent)]" />
                  Select all matching ({filteredVideos.length})
                </label>
                {selectedIds.length > 0 && <span className="text-sm font-semibold text-[var(--accent)]">{selectedIds.length} selected</span>}
              </div>

              {selectedIds.length > 0 && (
                <div className="mt-3 flex flex-wrap items-center gap-2.5 rounded-2xl border border-red-500/40 bg-red-500/10 px-4 py-3">
                  <span className="text-sm font-bold text-white">{selectedIds.length} video{selectedIds.length === 1 ? "" : "s"} selected</span>
                  {confirmBulkDelete ? (
                    <>
                      <button type="button" disabled={saveDisabled} onClick={deleteSelected} className="rounded-full bg-red-600 px-4 py-2 text-[13px] font-bold text-white transition active:scale-95 disabled:opacity-40">Confirm delete {selectedIds.length} video{selectedIds.length === 1 ? "" : "s"}</button>
                      <button type="button" onClick={() => setConfirmBulkDelete(false)} className="rounded-full border border-[var(--border)] px-4 py-2 text-[13px] font-bold text-white transition active:scale-95">Keep</button>
                    </>
                  ) : (
                    <button type="button" onClick={() => setConfirmBulkDelete(true)} className="rounded-full bg-red-600 px-4 py-2 text-[13px] font-bold text-white transition active:scale-95">Delete selected</button>
                  )}
                  <button type="button" onClick={() => { setSelectedIds([]); setConfirmBulkDelete(false); }} className="rounded-full border border-[var(--border)] px-4 py-2 text-[13px] font-bold text-white transition active:scale-95">Clear selection</button>
                </div>
              )}

              {form && (
                <form className="mt-4 rounded-2xl border border-[var(--accent)]/50 bg-[var(--surface)] p-4" onSubmit={(e) => { e.preventDefault(); saveForm(); }}>
                  <h3 className="font-display text-base font-extrabold text-white">{st.addedVideos.some((v) => v.id === form.id) || !VIDEOS.some((v) => v.id === form.id) ? (st.addedVideos.some((v) => v.id === form.id) ? "Edit video" : "Add video") : "Edit video"}</h3>
                  <div className="mt-3 grid gap-4 sm:grid-cols-2">
                    <div className="sm:col-span-2"><AInput label="Title" value={form.title ?? ""} onChange={(v) => setForm({ ...form, title: v })} placeholder="Video title" /></div>
                    <div className="sm:col-span-2"><ATextarea label="Embed link / embed code (YouTube, Vimeo, .mp4 file, or a full <iframe> embed code)" value={form.embedUrl ?? ""} onChange={(v) => setForm({ ...form, embedUrl: v })} rows={2} placeholder="https://www.youtube.com/watch?v=…" /></div>
                    <div className="sm:col-span-2"><ATextarea label="Description" value={form.description ?? ""} onChange={(v) => setForm({ ...form, description: v })} rows={3} /></div>
                    <AInput label="Duration (mm:ss or hh:mm:ss)" value={durText} onChange={setDurText} placeholder="12:34" />
                    <AInput label="Views" type="number" value={form.views != null ? String(form.views) : ""} onChange={(v) => setForm({ ...form, views: v === "" ? null : Number(v) })} placeholder="0" />
                    <AInput label="Upload date" type="date" value={form.dateStr ?? ""} onChange={(v) => { const d = v ? parseDateValue(v) : null; setForm({ ...form, dateStr: v || null, days: d?.days ?? null }); }} />
                    <AInput label="Creator / model" value={form.creator ?? ""} onChange={(v) => setForm({ ...form, creator: v })} list="admin-creators" />
                    <AInput label="Channel" value={form.channel ?? ""} onChange={(v) => setForm({ ...form, channel: v })} list="admin-channels" />
                    <AInput label="Category" value={form.category ?? ""} onChange={(v) => setForm({ ...form, category: v })} list="admin-categories" />
                    <div className="sm:col-span-2"><AInput label="Tags (comma-separated)" value={tagsText} onChange={setTagsText} placeholder="travel, 4k, guide" /></div>
                    <div className="sm:col-span-2"><AInput label="Models (comma-separated)" value={modelsText} onChange={setModelsText} placeholder="Isiah Maxwell, Koda Monroe" /></div>
                    <div className="sm:col-span-2"><AInput label="Thumbnail image URL (empty = automatic art)" value={form.thumbnailUrl ?? ""} onChange={(v) => setForm({ ...form, thumbnailUrl: v })} placeholder="https://…" /></div>
                    <AInput label="SEO title (empty = falls back to title)" value={form.seoTitle ?? ""} onChange={(v) => setForm({ ...form, seoTitle: v })} />
                    <AInput label="SEO description" value={form.seoDescription ?? ""} onChange={(v) => setForm({ ...form, seoDescription: v })} />
                    <div className="flex flex-wrap items-center gap-5 sm:col-span-2">
                      <ACheck label="Featured" checked={form.featured} onChange={(v) => setForm({ ...form, featured: v })} />
                      <ACheck label="NEW badge" checked={form.badgeNew} onChange={(v) => setForm({ ...form, badgeNew: v })} />
                      <ACheck label="HD" checked={form.hd} onChange={(v) => setForm({ ...form, hd: v })} />
                    </div>
                  </div>
                  <datalist id="admin-creators">{eff.creators.map((c) => <option key={c.name} value={c.name} />)}</datalist>
                  <datalist id="admin-channels">{eff.channels.map((c) => <option key={c.name} value={c.name} />)}</datalist>
                  <datalist id="admin-categories">{eff.categories.map((c) => <option key={c.name} value={c.name} />)}</datalist>
                  {formError && <p role="alert" className="mt-3 rounded-xl bg-red-500/15 px-4 py-2.5 text-sm font-semibold text-red-300">{formError}</p>}
                  <p className="mt-3 text-[13px] text-[var(--dim)]">Any field you leave empty is stored as <b className="text-zinc-200">null</b> — the site simply hides that piece (no duration, no views, no description) instead of inventing a value.</p>
                  <div className="mt-4 flex flex-wrap gap-3">
                    <button type="submit" disabled={saveDisabled} className="rounded-full bg-[var(--accent)] px-7 py-3 font-display text-sm font-black text-white transition active:scale-95 disabled:opacity-40">Save video</button>
                    <button type="button" onClick={() => setForm(null)} className="rounded-full border border-[var(--border)] px-6 py-3 text-sm font-bold text-white transition active:scale-95">Cancel</button>
                  </div>
                </form>
              )}

              <div className="mt-4 space-y-2.5">
                {filteredVideos.slice(0, vShow).map((v) => (
                  <div key={v.id} className={`flex items-center gap-3 rounded-2xl border bg-[var(--surface)] p-3 ${selectedIds.includes(v.id) ? "border-[var(--accent)]" : "border-[var(--border)]"}`}>
                    <input type="checkbox" aria-label={`Select video: ${v.title}`} checked={selectedIds.includes(v.id)} onChange={() => toggleSelect(v.id)} className="h-5 w-5 shrink-0 accent-[var(--accent)]" />
                    <div className="w-24 shrink-0 sm:w-32"><Thumb v={v} /></div>
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-1 text-sm font-bold text-white">{v.title}</p>
                      <p className="mt-0.5 line-clamp-1 text-xs text-[var(--dim)]">{v.category}{v.creator ? ` · ${v.creator}` : ""}{v.channel ? ` · ${v.channel}` : ""}</p>
                      <p className={`mt-0.5 text-xs font-semibold ${v.embedUrl ? "text-emerald-400" : "text-amber-400"}`}>{v.embedUrl ? "Embed source set" : "No video source"}</p>
                    </div>
                    <div className="flex shrink-0 flex-col gap-1.5 sm:flex-row">
                      <button type="button" onClick={() => onOpenVideo(v)} className="rounded-full bg-[var(--surface2)] px-3.5 py-2 text-[13px] font-bold text-white transition active:scale-95">View</button>
                      <button type="button" onClick={() => openEdit(v)} className="rounded-full bg-[var(--surface2)] px-3.5 py-2 text-[13px] font-bold text-white transition active:scale-95">Edit</button>
                      {confirmDeleteId === v.id ? (
                        <>
                          <button type="button" disabled={saveDisabled} onClick={() => deleteVideo(v)} className="rounded-full bg-red-600 px-3.5 py-2 text-[13px] font-bold text-white transition active:scale-95 disabled:opacity-40">Confirm delete</button>
                          <button type="button" onClick={() => setConfirmDeleteId(null)} className="rounded-full border border-[var(--border)] px-3.5 py-2 text-[13px] font-bold text-white transition active:scale-95">Keep</button>
                        </>
                      ) : (
                        <button type="button" onClick={() => setConfirmDeleteId(v.id)} className="rounded-full border border-red-500/50 px-3.5 py-2 text-[13px] font-bold text-red-400 transition active:scale-95">Delete</button>
                      )}
                    </div>
                  </div>
                ))}
                {filteredVideos.length === 0 && <p className="py-8 text-center text-sm text-[var(--dim)]">No videos match this search.</p>}
                {filteredVideos.length > vShow && (
                  <button type="button" onClick={() => setVShow(vShow + 40)} className="w-full rounded-full border border-[var(--border)] py-3 text-sm font-bold text-white transition active:scale-[0.99]">Show more ({filteredVideos.length - vShow} more)</button>
                )}
              </div>
            </section>
          )}

          {section === "taxonomy" && (
            <section aria-label="Categories, models, channels and tags">
              <h2 className="font-display text-lg font-extrabold text-white">Categories / Models / Channels / Tags</h2>
              <p className="mt-1 text-sm text-[var(--dim)]">Counts are calculated from the videos on the site. Renaming also renames it on every video that uses it.</p>
              <div className="no-scrollbar mt-4 flex gap-2 overflow-x-auto" role="tablist" aria-label="Taxonomy type">
                {(["categories", "models", "channels", "tags"] as TaxTab[]).map((t) => (
                  <button key={t} type="button" role="tab" aria-selected={taxTab === t} onClick={() => { setTaxTab(t); setRenameOf(null); setConfirmTaxDelete(null); setTaxSelected([]); setConfirmTaxBulkDelete(false); }} className={`shrink-0 rounded-full px-4 py-2 text-sm font-bold capitalize transition active:scale-95 ${taxTab === t ? "bg-white text-black" : "bg-[var(--surface2)] text-white"}`}>{t}</button>
                ))}
              </div>
              <div className="mt-4 flex flex-col gap-2.5 sm:flex-row">
                <input aria-label="New name" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder={`New ${taxTab === "categories" ? "category" : taxTab === "models" ? "model" : taxTab === "channels" ? "channel" : "tag"} name`} className={inputCls} />
                {taxTab === "channels" && <input aria-label="Channel creator" value={newCreator} onChange={(e) => setNewCreator(e.target.value)} placeholder="Creator / model for this channel" className={inputCls} />}
                <button type="button" disabled={saveDisabled} onClick={() => { taxAdd(taxTab, newName, newCreator); setNewName(""); setNewCreator(""); }} className="shrink-0 rounded-full bg-[var(--accent)] px-6 py-2.5 font-display text-sm font-black text-white transition active:scale-95 disabled:opacity-40">Add</button>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
                <label className="flex cursor-pointer items-center gap-2 py-1 text-sm font-semibold text-zinc-200">
                  <input type="checkbox" aria-label={`Select all ${taxTab}`} checked={allTaxSelected} onChange={toggleTaxSelectAll} className="h-5 w-5 shrink-0 accent-[var(--accent)]" />
                  Select all {taxTab} ({taxItems.length})
                </label>
                {taxSelected.length > 0 && <span className="text-sm font-semibold text-[var(--accent)]">{taxSelected.length} selected</span>}
              </div>
              {taxSelected.length > 0 && (
                <div className="mt-3 flex flex-wrap items-center gap-2.5 rounded-2xl border border-red-500/40 bg-red-500/10 px-4 py-3">
                  <span className="text-sm font-bold text-white">{taxSelected.length} {taxSelected.length === 1 ? taxSingular : taxSingular === "category" ? "categories" : `${taxSingular}s`} selected</span>
                  {confirmTaxBulkDelete ? (
                    <>
                      <button type="button" disabled={saveDisabled} onClick={deleteTaxSelected} className="rounded-full bg-red-600 px-4 py-2 text-[13px] font-bold text-white transition active:scale-95 disabled:opacity-40">Confirm delete {taxSelected.length} {taxSelected.length === 1 ? taxSingular : taxSingular === "category" ? "categories" : `${taxSingular}s`}</button>
                      <button type="button" onClick={() => setConfirmTaxBulkDelete(false)} className="rounded-full border border-[var(--border)] px-4 py-2 text-[13px] font-bold text-white transition active:scale-95">Keep</button>
                    </>
                  ) : (
                    <button type="button" onClick={() => setConfirmTaxBulkDelete(true)} className="rounded-full bg-red-600 px-4 py-2 text-[13px] font-bold text-white transition active:scale-95">Delete selected</button>
                  )}
                  <button type="button" onClick={() => { setTaxSelected([]); setConfirmTaxBulkDelete(false); }} className="rounded-full border border-[var(--border)] px-4 py-2 text-[13px] font-bold text-white transition active:scale-95">Clear selection</button>
                </div>
              )}
              <div className="mt-4 divide-y divide-[var(--border)] rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4">
                {taxItems.map((item) => (
                  <div key={item.name} className="flex flex-wrap items-center gap-2.5 py-3">
                    {renameOf === item.name ? (
                      <>
                        <input aria-label={`Rename ${item.name}`} value={renameText} onChange={(e) => setRenameText(e.target.value)} className={`${inputCls} min-w-0 flex-1`} />
                        <button type="button" disabled={saveDisabled} onClick={() => { taxRename(taxTab, item.name, renameText); setTaxSelected((prev) => prev.map((x) => (x === item.name ? renameText.trim() || x : x))); setRenameOf(null); }} className="rounded-full bg-[var(--accent)] px-4 py-2 text-[13px] font-bold text-white transition active:scale-95 disabled:opacity-40">Save</button>
                        <button type="button" onClick={() => setRenameOf(null)} className="rounded-full border border-[var(--border)] px-4 py-2 text-[13px] font-bold text-white transition active:scale-95">Cancel</button>
                      </>
                    ) : (
                      <>
                        <input type="checkbox" aria-label={`Select ${taxSingular}: ${item.name}`} checked={taxSelected.includes(item.name)} onChange={() => toggleTaxSelect(item.name)} className="h-5 w-5 shrink-0 accent-[var(--accent)]" />
                        {taxTab === "models" && st.modelPhotos?.[item.name] ? <img src={st.modelPhotos[item.name]} alt="" className="h-8 w-8 shrink-0 rounded-lg object-cover ring-1 ring-white/15" /> : null}
                        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-white">{item.name}</span>
                        <span className="text-xs text-[var(--dim)]">{item.count} videos</span>
                        {taxTab === "models" && (
                          <input aria-label={`Photo URL for ${item.name}`} defaultValue={st.modelPhotos?.[item.name] ?? ""} placeholder="Photo URL" onBlur={(e) => { if (saveDisabled) return; const url = e.target.value.trim(); const next = { ...(st.modelPhotos ?? {}) }; if (url) next[item.name] = url; else delete next[item.name]; commit({ ...st, modelPhotos: next }); }} className={`${inputCls} w-full`} />
                        )}
                        <button type="button" onClick={() => { setRenameOf(item.name); setRenameText(item.name); }} className="rounded-full bg-[var(--surface2)] px-3.5 py-2 text-[13px] font-bold text-white transition active:scale-95">Rename</button>
                        {confirmTaxDelete === item.name ? (
                          <>
                            <button type="button" disabled={saveDisabled} onClick={() => { taxDelete(taxTab, item.name); setTaxSelected((prev) => prev.filter((x) => x !== item.name)); setConfirmTaxDelete(null); }} className="rounded-full bg-red-600 px-3.5 py-2 text-[13px] font-bold text-white transition active:scale-95 disabled:opacity-40">Confirm delete</button>
                            <button type="button" onClick={() => setConfirmTaxDelete(null)} className="rounded-full border border-[var(--border)] px-3.5 py-2 text-[13px] font-bold text-white transition active:scale-95">Keep</button>
                          </>
                        ) : (
                          <button type="button" onClick={() => setConfirmTaxDelete(item.name)} className="rounded-full border border-red-500/50 px-3.5 py-2 text-[13px] font-bold text-red-400 transition active:scale-95">Delete</button>
                        )}
                      </>
                    )}
                  </div>
                ))}
                {taxItems.length === 0 && <p className="py-6 text-center text-sm text-[var(--dim)]">Nothing here yet.</p>}
              </div>
            </section>
          )}

          {section === "csv" && (
            <section aria-label="CSV import">
              <h2 className="font-display text-lg font-extrabold text-white">CSV Import</h2>
              <p className="mt-1 text-sm leading-relaxed text-[var(--dim)]">
                Columns: <span className="text-zinc-200">{CSV_COLUMNS.join(", ")}</span>. Imported videos are <b className="text-zinc-200">added</b> to the catalog — nothing is replaced.
                If any cell in a row is empty, that field is stored as <b className="text-zinc-200">null</b>: the row still imports and the site hides the missing piece. Only a row with no title <i>and</i> no embed_url is skipped, and a duplicate embed_url is skipped — both are explained in the report.
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                <button type="button" onClick={() => downloadTextFile("videos-template.csv", CSV_TEMPLATE)} className="rounded-full border border-[var(--border)] px-5 py-2.5 text-sm font-bold text-white transition active:scale-95">Download sample CSV template</button>
                <button type="button" onClick={doExport} className="rounded-full border border-[var(--border)] px-5 py-2.5 text-sm font-bold text-white transition active:scale-95">Export current videos as CSV</button>
              </div>
              <div
                className={`mt-4 rounded-2xl border border-dashed p-5 text-center transition ${dragOver ? "border-[var(--accent)] bg-[var(--accent)]/10" : "border-[var(--border)] bg-[var(--surface)]"}`}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files?.[0]; if (f) readFile(f); }}
              >
                <p className="text-sm font-semibold text-white">Drop a .csv file here</p>
                <p className="mt-1 text-[13px] text-[var(--dim)]">or</p>
                <button type="button" onClick={() => fileRef.current?.click()} className="mt-2 rounded-full bg-[var(--accent)] px-6 py-2.5 font-display text-sm font-black text-white transition active:scale-95">Choose CSV file</button>
                <input ref={fileRef} type="file" accept=".csv,text/csv,text/plain" className="hidden" aria-label="Choose CSV file" onChange={(e) => { const f = e.target.files?.[0]; if (f) readFile(f); e.target.value = ""; }} />
              </div>
              <div className="mt-4">
                <ATextarea label="…or paste CSV text" value={csvText} onChange={(v) => { setCsvText(v); setReport(null); }} rows={6} placeholder={"title,embed_url,description,duration,views,date,creator,channel,category,tags,thumbnail,seo_title,seo_description\nMy video,https://www.youtube.com/watch?v=…,A description,10:24,1200,2026-11-20,Creator Name,Channel Name,Travel,\"travel, 4k\",,,"} />
              </div>

              {csvRows && csvRows.length > 0 && (
                <>
                  <h3 className="font-display mt-6 text-base font-extrabold text-white">Preview — {csvRows.length} row{csvRows.length === 1 ? "" : "s"} as they will be stored</h3>
                  <p className="mt-1 text-[13px] text-[var(--dim)]">Empty cells show as <span className="font-bold italic text-rose-400">null</span> — exactly what gets saved for that field.</p>
                  <div className="mt-3 overflow-x-auto rounded-2xl border border-[var(--border)]">
                    <table className="min-w-[900px] text-left text-xs">
                      <thead>
                        <tr className="bg-[var(--surface2)] text-zinc-200">
                          <th className="px-3 py-2.5 font-bold">#</th>
                          {CSV_COLUMNS.map((c) => <th key={c} className="px-3 py-2.5 font-bold">{c}</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {csvRows.slice(0, 100).map((r, i) => (
                          <tr key={i} className="border-t border-[var(--border)] align-top text-zinc-300">
                            <td className="px-3 py-2 text-[var(--dim)]">{i + 1}</td>
                            {CSV_COLUMNS.map((c) => (
                              <td key={c} className="max-w-[220px] truncate px-3 py-2">{r[c] === null ? <span className="font-bold italic text-rose-400">null</span> : r[c]}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {csvRows.length > 100 && <p className="mt-2 text-[13px] text-[var(--dim)]">+{csvRows.length - 100} more rows not shown in the preview.</p>}
                  <label className="mt-4 flex cursor-pointer items-center gap-2.5 text-sm font-semibold text-zinc-200">
                    <input type="checkbox" checked={updateExisting} onChange={(e) => setUpdateExisting(e.target.checked)} className="h-5 w-5 shrink-0 accent-[var(--accent)]" /> Update existing videos (match by embed link)
                  </label>
                  <button type="button" disabled={saveDisabled} onClick={doImport} className="mt-4 rounded-full bg-[var(--accent)] px-7 py-3 font-display text-sm font-black text-white transition active:scale-95 disabled:opacity-40">Import {csvRows.length} row{csvRows.length === 1 ? "" : "s"}</button>
                </>
              )}
              {csvRows && csvRows.length === 0 && <p className="mt-4 text-sm text-[var(--dim)]">No data rows found in this CSV yet.</p>}

              {report && (
                <div className="mt-6 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4" role="status" aria-label="Import report">
                  <h3 className="font-display text-base font-extrabold text-white">Import report</h3>
                  <p className="mt-1.5 text-sm text-zinc-200"><b className="text-emerald-400">{report.added}</b> video{report.added === 1 ? "" : "s"} added{report.updated > 0 && (<> · <b className="text-emerald-400">{report.updated}</b> updated</>)} · <b className={report.skipped.length ? "text-amber-400" : "text-zinc-200"}>{report.skipped.length}</b> skipped</p>
                  {report.skipped.length > 0 && (
                    <div className="mt-3">
                      <p className="text-sm font-bold text-white">Skipped rows</p>
                      <ul className="mt-1.5 space-y-1 text-sm text-zinc-300">
                        {report.skipped.slice(0, 100).map((s) => <li key={s.row}>Row {s.row}: {s.reason}</li>)}
                        {report.skipped.length > 100 && <li>+{report.skipped.length - 100} more skipped rows</li>}
                      </ul>
                    </div>
                  )}
                  {report.nullFields.length > 0 && (
                    <div className="mt-3">
                      <p className="text-sm font-bold text-white">Fields stored as null</p>
                      <ul className="mt-1.5 space-y-1 text-sm text-zinc-300">
                        {report.nullFields.slice(0, 100).map((n) => (
                          <li key={n.row}>Row {n.row} ({n.title}): {n.fields.length ? n.fields.join(", ") : "none — complete row"}</li>
                        ))}
                        {report.nullFields.length > 100 && <li>+{report.nullFields.length - 100} more rows</li>}
                      </ul>
                    </div>
                  )}
                  {report.warnings.length > 0 && (
                    <div className="mt-3">
                      <p className="text-sm font-bold text-white">Values that could not be read</p>
                      <ul className="mt-1.5 space-y-1 text-sm text-zinc-300">
                        {report.warnings.slice(0, 100).map((w) => <li key={`${w.row}-${w.reason}`}>Row {w.row}: {w.reason}</li>)}
                        {report.warnings.length > 100 && <li>+{report.warnings.length - 100} more warnings</li>}
                      </ul>
                    </div>
                  )}
                  {report.added > 0 && <button type="button" onClick={() => setSection("videos")} className="mt-4 rounded-full bg-[var(--surface2)] px-5 py-2.5 text-sm font-bold text-white transition active:scale-95">See them in Videos</button>}
                </div>
              )}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

