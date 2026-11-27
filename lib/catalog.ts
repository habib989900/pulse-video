// Shared catalog + SEO logic for PULSE VIDEO (Vercel port).
//
// Pure TypeScript — no React, no DOM, no Node APIs — so both the Vite
// client (client/src/App.tsx) and the Vercel Serverless Functions
// (api/sitemap.ts, api/robots.ts) import it. The server-side sitemap
// is built from this module plus the saved admin state from the Blob
// store, so it lists exactly what the public site shows: built-in
// videos + admin-added videos, minus deletes, with taxonomy renames
// applied.

/* Types & catalog data (shared by the client and the server).
   The built-in catalog, the admin-state merge (buildEffective) and the
   SEO builders live here so the server-side /sitemap.xml uses exactly
   the same data and URLs as the in-app sitemap — one source of truth. */

export type Video = {
  id: string;
  title: string;
  duration: string;
  durationSec: number;
  views: number;
  age: string;
  days: number;
  rating: number;
  hd: boolean;
  category: string;
  tags: string[];
  creator: string;
  g: [string, string];
  /* Admin-managed fields. Catalog videos carry the defaults from
     withDefaults(); videos added or edited in the admin panel carry real
     values, where null means "not provided" and the UI hides that piece. */
  embedUrl: string | null;
  description: string | null;
  thumbnailUrl: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  featured: boolean;
  badgeNew: boolean;
  channel: string | null;
  custom: boolean;
  hasViews: boolean;
  hasDate: boolean;
  hasRating: boolean;
};

type RawVideo = Omit<Video, "embedUrl" | "description" | "thumbnailUrl" | "seoTitle" | "seoDescription" | "featured" | "badgeNew" | "channel" | "custom" | "hasViews" | "hasDate" | "hasRating">;

const withDefaults = (v: RawVideo): Video => ({
  embedUrl: null, description: null, thumbnailUrl: null, seoTitle: null, seoDescription: null,
  featured: false, badgeNew: false, channel: null, custom: false,
  hasViews: true, hasDate: true, hasRating: true,
  ...v,
});

export const fmtViews = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M` : n >= 1000 ? `${Math.round(n / 1000)}K` : `${n}`;
export const fmtDur = (s: number) => s >= 3600 ? `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
const ageFromDays = (d: number) =>
  d <= 0 ? "12 hours ago" : d === 1 ? "1 day ago" : d < 30 ? `${d} days ago` : d < 60 ? "1 month ago" : d < 365 ? `${Math.floor(d / 30)} months ago` : d < 730 ? "1 year ago" : `${Math.floor(d / 365)} years ago`;

/* First 24 videos: original catalog entries — ids, titles and creators preserved exactly. */
const BASE_VIDEOS: RawVideo[] = [
  { id: "v1", title: "Istanbul in 24 Hours — The Ultimate City Walk", duration: "13:58", durationSec: 838, views: 352000, age: "2 weeks ago", days: 14, rating: 91, hd: true, category: "Travel", tags: ["city guide", "walking tour", "4k"], creator: "Wander Frame", g: ["#7c2d12", "#f59e0b"] },
  { id: "v2", title: "30-Minute Creamy Pasta Anyone Can Master", duration: "10:24", durationSec: 624, views: 1200000, age: "3 days ago", days: 3, rating: 96, hd: true, category: "Cooking", tags: ["pasta", "quick meals", "italian"], creator: "Golden Ladle", g: ["#7f1d1d", "#ef4444"] },
  { id: "v3", title: "Full Body Strength — No Equipment Needed", duration: "22:29", durationSec: 1349, views: 864000, age: "1 week ago", days: 7, rating: 94, hd: true, category: "Fitness", tags: ["home workout", "strength", "beginner"], creator: "Pulse Fit", g: ["#14532d", "#22c55e"] },
  { id: "v4", title: "Lo-Fi Beats to Focus — Sunset Session Vol. 4", duration: "52:43", durationSec: 3163, views: 2100000, age: "1 month ago", days: 30, rating: 98, hd: true, category: "Music", tags: ["lofi", "focus", "chill"], creator: "Night Tapes", g: ["#581c87", "#a855f7"] },
  { id: "v5", title: "Building a Tiny Cabin in the Alps — Ep. 1", duration: "18:07", durationSec: 1087, views: 640000, age: "5 days ago", days: 5, rating: 93, hd: true, category: "DIY", tags: ["cabin", "woodwork", "off grid"], creator: "Timber & Co", g: ["#0c4a6e", "#38bdf8"] },
  { id: "v6", title: "Street Photography Masterclass: Light & Shadow", duration: "15:31", durationSec: 931, views: 98000, age: "4 days ago", days: 4, rating: 89, hd: false, category: "Photography", tags: ["street", "composition", "35mm"], creator: "Aperture Lab", g: ["#27272a", "#e4e4e7"] },
  { id: "v7", title: "The Untold History of the Silk Road", duration: "26:19", durationSec: 1579, views: 1500000, age: "2 months ago", days: 60, rating: 97, hd: true, category: "Documentary", tags: ["history", "asia", "trade"], creator: "Deep Dive Docs", g: ["#713f12", "#eab308"] },
  { id: "v8", title: "Speedrun World Record Attempt — Live Breakdown", duration: "11:06", durationSec: 666, views: 26000, age: "4 months ago", days: 120, rating: 87, hd: false, category: "Gaming", tags: ["speedrun", "record", "live"], creator: "Pixel Rush", g: ["#1e3a8a", "#3b82f6"] },
  { id: "v9", title: "Morning Yoga Flow for Energy & Calm", duration: "12:31", durationSec: 751, views: 754000, age: "3 months ago", days: 90, rating: 95, hd: true, category: "Fitness", tags: ["yoga", "morning", "mobility"], creator: "Pulse Fit", g: ["#831843", "#ec4899"] },
  { id: "v10", title: "Tokyo Night Markets — What $20 Buys You", duration: "17:25", durationSec: 1045, views: 992000, age: "2 years ago", days: 730, rating: 92, hd: true, category: "Travel", tags: ["tokyo", "street food", "budget"], creator: "Wander Frame", g: ["#500724", "#f43f5e"] },
  { id: "v11", title: "Sourdough for Beginners — Day 1 to First Loaf", duration: "30:55", durationSec: 1855, views: 430000, age: "6 days ago", days: 6, rating: 94, hd: true, category: "Cooking", tags: ["baking", "sourdough", "bread"], creator: "Golden Ladle", g: ["#78350f", "#fbbf24"] },
  { id: "v12", title: "Inside a Tokyo Jazz Bar — Vinyl Only Night", duration: "41:49", durationSec: 2509, views: 187000, age: "1 year ago", days: 365, rating: 90, hd: true, category: "Music", tags: ["jazz", "vinyl", "tokyo"], creator: "Night Tapes", g: ["#111827", "#6366f1"] },
  { id: "v13", title: "Restoring a 1968 Classic Car — Full Timelapse", duration: "24:12", durationSec: 1452, views: 2800000, age: "8 months ago", days: 240, rating: 96, hd: true, category: "DIY", tags: ["restoration", "cars", "timelapse"], creator: "Garage Stories", g: ["#7f1d1d", "#f97316"] },
  { id: "v14", title: "How Airports Actually Work — Behind the Scenes", duration: "19:44", durationSec: 1184, views: 510000, age: "3 weeks ago", days: 21, rating: 91, hd: false, category: "Documentary", tags: ["aviation", "logistics", "explained"], creator: "Deep Dive Docs", g: ["#164e63", "#06b6d4"] },
  { id: "v15", title: "Procreate Portrait Painting — Start to Finish", duration: "16:03", durationSec: 963, views: 76000, age: "1 week ago", days: 7, rating: 88, hd: false, category: "Art", tags: ["digital art", "portrait", "tutorial"], creator: "Aperture Lab", g: ["#4a044e", "#d946ef"] },
  { id: "v16", title: "Desert Camping Under the Milky Way", duration: "21:37", durationSec: 1297, views: 308, age: "1 week ago", days: 7, rating: 85, hd: false, category: "Travel", tags: ["camping", "stars", "desert"], creator: "Wander Frame", g: ["#172554", "#818cf8"] },
  { id: "v17", title: "5-Ingredient Desserts That Look Fancy", duration: "9:48", durationSec: 588, views: 1900000, age: "2 weeks ago", days: 14, rating: 93, hd: true, category: "Cooking", tags: ["dessert", "quick meals", "baking"], creator: "Golden Ladle", g: ["#881337", "#fb7185"] },
  { id: "v18", title: "Beginner's Guide to Astrophotography", duration: "27:52", durationSec: 1672, views: 145000, age: "5 months ago", days: 150, rating: 90, hd: true, category: "Photography", tags: ["astro", "night", "tutorial"], creator: "Aperture Lab", g: ["#020617", "#38bdf8"] },
  { id: "v19", title: "Sunrise Hike to a Hidden Waterfall", duration: "14:22", durationSec: 862, views: 421000, age: "2 days ago", days: 2, rating: 93, hd: true, category: "Travel", tags: ["hiking", "waterfall", "4k"], creator: "Wander Frame", g: ["#134e4a", "#2dd4bf"] },
  { id: "v20", title: "One-Pot Weeknight Dinners — 3 Ways", duration: "12:05", durationSec: 725, views: 689000, age: "3 days ago", days: 3, rating: 95, hd: true, category: "Cooking", tags: ["one pot", "quick meals", "dinner"], creator: "Golden Ladle", g: ["#7c2d12", "#fb923c"] },
  { id: "v21", title: "Desk Setup Tour — Cable-Free Edition", duration: "9:37", durationSec: 577, views: 233000, age: "4 days ago", days: 4, rating: 90, hd: false, category: "Tech", tags: ["desk setup", "tech", "minimal"], creator: "Studio Bloom", g: ["#1e293b", "#94a3b8"] },
  { id: "v22", title: "Jazz Piano for Beginners — First Chords", duration: "20:14", durationSec: 1214, views: 312000, age: "6 days ago", days: 6, rating: 92, hd: true, category: "Music", tags: ["piano", "jazz", "tutorial"], creator: "Night Tapes", g: ["#312e81", "#818cf8"] },
  { id: "v23", title: "Backyard Garden Makeover on a Budget", duration: "16:48", durationSec: 1008, views: 158000, age: "5 days ago", days: 5, rating: 91, hd: false, category: "Gardening", tags: ["garden", "makeover", "budget"], creator: "Meadow Makers", g: ["#365314", "#a3e635"] },
  { id: "v24", title: "Marathon Training — Week 8 Long Run", duration: "28:03", durationSec: 1683, views: 502000, age: "1 week ago", days: 7, rating: 94, hd: true, category: "Fitness", tags: ["running", "marathon", "endurance"], creator: "Pulse Fit", g: ["#7f1d1d", "#f87171"] },
];

export const CATEGORIES: { name: string; count: string }[] = [
  { name: "Travel", count: "48K" }, { name: "Cooking", count: "25K" }, { name: "Fitness", count: "24K" },
  { name: "Music", count: "15K" }, { name: "Documentary", count: "14K" }, { name: "Gaming", count: "14K" },
  { name: "DIY", count: "12K" }, { name: "Photography", count: "12K" }, { name: "Art", count: "10K" },
  { name: "Comedy", count: "9.4K" }, { name: "Tech", count: "8.2K" }, { name: "Nature", count: "7.6K" },
  { name: "Sports", count: "7.5K" }, { name: "Science", count: "7.1K" }, { name: "Fashion", count: "6.9K" },
  { name: "History", count: "6.2K" }, { name: "Education", count: "5.9K" }, { name: "Pets", count: "5.1K" },
  { name: "Cars", count: "4.9K" }, { name: "Dance", count: "4.6K" }, { name: "Gardening", count: "4.4K" },
  { name: "Business", count: "4K" }, { name: "Movies", count: "3.8K" }, { name: "News", count: "3.2K" },
  { name: "Animation", count: "3.1K" }, { name: "Architecture", count: "2.9K" }, { name: "Astronomy", count: "2.8K" },
  { name: "Beauty", count: "2.7K" }, { name: "Books", count: "2.6K" }, { name: "Camping", count: "2.5K" },
  { name: "Cycling", count: "2.4K" }, { name: "Design", count: "2.4K" }, { name: "Electronics", count: "2.3K" },
  { name: "Farming", count: "2.2K" }, { name: "Fishing", count: "2.1K" }, { name: "Football", count: "2.1K" },
  { name: "Golf", count: "2K" }, { name: "Health", count: "2K" }, { name: "Home Decor", count: "1.9K" },
  { name: "Investing", count: "1.9K" }, { name: "Languages", count: "1.8K" }, { name: "Lifestyle", count: "1.8K" },
  { name: "Magic", count: "1.7K" }, { name: "Martial Arts", count: "1.7K" }, { name: "Meditation", count: "1.6K" },
  { name: "Motorcycles", count: "1.6K" }, { name: "Ocean", count: "1.5K" }, { name: "Painting", count: "1.5K" },
  { name: "Piano", count: "1.4K" }, { name: "Podcasts", count: "1.4K" }, { name: "Politics", count: "1.3K" },
  { name: "Programming", count: "1.3K" }, { name: "Real Estate", count: "1.2K" }, { name: "Recipes", count: "1.2K" },
  { name: "Robotics", count: "1.1K" }, { name: "Skateboarding", count: "1.1K" }, { name: "Skiing", count: "1K" },
  { name: "Space", count: "1K" }, { name: "Surfing", count: "980" }, { name: "Theater", count: "950" },
  { name: "Trains", count: "920" }, { name: "Vegan", count: "900" }, { name: "Weather", count: "880" },
  { name: "Weddings", count: "850" }, { name: "Wildlife", count: "830" }, { name: "Woodworking", count: "800" },
  { name: "Yoga", count: "780" }, { name: "Zumba", count: "750" }, { name: "Board Games", count: "720" },
  { name: "Chess", count: "700" }, { name: "Comics", count: "680" }, { name: "Drones", count: "650" },
  { name: "Esports", count: "620" }, { name: "Aquariums", count: "600" },
];

/* Channel video counts match the owning model's count, so the number a channel
   shows is the same catalog the channel page lists from. */
export const CHANNELS: { name: string; videos: string; creator: string; g: [string, string] }[] = [
  { name: "Wander Frame TV", videos: "385", creator: "Wander Frame", g: ["#7c2d12", "#f59e0b"] },
  { name: "Golden Ladle Kitchen", videos: "140", creator: "Golden Ladle", g: ["#7f1d1d", "#ef4444"] },
  { name: "Night Tapes", videos: "115", creator: "Night Tapes", g: ["#581c87", "#a855f7"] },
  { name: "Deep Dive Docs", videos: "98", creator: "Deep Dive Docs", g: ["#713f12", "#eab308"] },
  { name: "Pulse Fit", videos: "116", creator: "Pulse Fit", g: ["#14532d", "#22c55e"] },
  { name: "Timber & Co", videos: "87", creator: "Timber & Co", g: ["#0c4a6e", "#38bdf8"] },
  { name: "Aperture Lab", videos: "129", creator: "Aperture Lab", g: ["#27272a", "#e4e4e7"] },
  { name: "Garage Stories", videos: "64", creator: "Garage Stories", g: ["#7f1d1d", "#f97316"] },
];

const BASE_TAGS: { name: string; count: number }[] = [
  { name: "travel", count: 34061 }, { name: "cooking", count: 18475 }, { name: "workout", count: 15496 },
  { name: "4k", count: 9397 }, { name: "tutorial", count: 8778 }, { name: "live", count: 8204 },
  { name: "asmr", count: 7610 }, { name: "beginner", count: 7302 }, { name: "comedy", count: 6980 },
  { name: "documentary", count: 6544 }, { name: "gaming", count: 6109 }, { name: "history", count: 5877 },
  { name: "jazz", count: 5230 }, { name: "lofi", count: 4988 }, { name: "nature", count: 4712 },
  { name: "photography", count: 4401 }, { name: "quick meals", count: 4105 }, { name: "street food", count: 3866 },
  { name: "timelapse", count: 3540 }, { name: "vlog", count: 3208 }, { name: "yoga", count: 2911 },
  { name: "zero waste", count: 1204 },
];

const BASE_CREATORS: { name: string; videos: number; followers: string; g: [string, string] }[] = [
  { name: "Wander Frame", videos: 385, followers: "48K", g: ["#f43f5e", "#f59e0b"] },
  { name: "Golden Ladle", videos: 140, followers: "21K", g: ["#ef4444", "#fbbf24"] },
  { name: "Aperture Lab", videos: 129, followers: "19K", g: ["#6366f1", "#38bdf8"] },
  { name: "Pulse Fit", videos: 116, followers: "28K", g: ["#22c55e", "#84cc16"] },
  { name: "Night Tapes", videos: 115, followers: "17K", g: ["#a855f7", "#ec4899"] },
  { name: "Deep Dive Docs", videos: 98, followers: "11K", g: ["#eab308", "#f97316"] },
  { name: "Timber & Co", videos: 87, followers: "9.4K", g: ["#38bdf8", "#22d3ee"] },
  { name: "Pixel Rush", videos: 82, followers: "8.1K", g: ["#3b82f6", "#8b5cf6"] },
  { name: "Garage Stories", videos: 64, followers: "6.3K", g: ["#f97316", "#ef4444"] },
  { name: "Studio Bloom", videos: 57, followers: "4.2K", g: ["#ec4899", "#f43f5e"] },
  { name: "Harbor Lights", videos: 43, followers: "3.1K", g: ["#06b6d4", "#3b82f6"] },
  { name: "Meadow Makers", videos: 19, followers: "1.2K", g: ["#84cc16", "#22c55e"] },
];

/* Deterministic generator for the expanded sample catalog (general-audience entries). */
function mulberry(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const EXTRA_CREATOR_NAMES = [
  "Cedar Journal", "Blue Hour Films", "Kitchen Atlas", "Summit Reel", "Canvas North", "Echo Trails",
  "Metro Lens", "Wild Fern", "Orbit Works", "Paper Plane Co", "Iron Peak", "Velvet Frame",
  "Northlight", "Copper Canyon", "Studio Fern", "Atlas & Pine", "Riverstone", "Golden Hour Co",
  "Field Notes TV", "Lantern Media", "Highland Reel", "Marble & Oak", "Silverline", "Open Road Films",
];
const CREATOR_GRADIENTS: [string, string][] = [
  ["#0ea5e9", "#6366f1"], ["#f59e0b", "#ef4444"], ["#10b981", "#0ea5e9"], ["#8b5cf6", "#ec4899"],
  ["#f97316", "#facc15"], ["#06b6d4", "#22c55e"], ["#e11d48", "#7c3aed"], ["#334155", "#0ea5e9"],
];
export const CREATORS: { name: string; videos: number; followers: string; g: [string, string] }[] = [
  ...BASE_CREATORS,
  ...EXTRA_CREATOR_NAMES.map((name, i) => ({
    name,
    videos: 12 + Math.floor(mulberry(500 + i)() * 60),
    followers: `${(1 + mulberry(900 + i)() * 9).toFixed(1).replace(/\.0$/, "")}K`,
    g: CREATOR_GRADIENTS[i % CREATOR_GRADIENTS.length] as [string, string],
  })),
];

const GEN_SPECS: { cat: string; titles: string[]; tags: string[]; grads: [string, string][] }[] = [
  { cat: "Travel", tags: ["city guide", "walking tour", "budget", "hidden gems", "road trip", "vlog"], grads: [["#7c2d12", "#f59e0b"], ["#134e4a", "#2dd4bf"], ["#500724", "#f43f5e"], ["#172554", "#818cf8"]], titles: ["Lisbon on Foot — Tram Lines & Tile Streets", "48 Hours in Kyoto — Temples, Markets & Rain", "Iceland Ring Road — Waterfalls in One Day", "Marrakech Medina — A First-Timer's Walk", "The Cheapest Way Across the Swiss Alps", "Hanoi Old Quarter — Dawn to Midnight", "Patagonia Wind — Hiking the W Trek", "Venice Without the Crowds — Back Canal Route", "Cape Town Table Mountain — Cable Car Down", "Seoul Subway Challenge — 10 Stops, 10 Snacks", "Banff in Winter — Frozen Lakes & Hot Springs", "Petra by Back Door — The Monastery Trail", "Mexico City Markets — A Local's Morning", "Faroe Islands — Driving the Buttercup Routes", "Sri Lanka by Train — Ella to Kandy in 4K", "Porto in the Rain — Bridges & Bookshops", "Namibia Desert Drive — Dunes at Sunrise", "Bangkok Canal Boats — The Slow Commute", "Georgia's Caucasus — Kazbegi in a Day", "New Zealand South Island — Van Life Week 3"] },
  { cat: "Cooking", tags: ["quick meals", "baking", "one pot", "street food", "tutorial", "asmr"], grads: [["#7f1d1d", "#ef4444"], ["#78350f", "#fbbf24"], ["#881337", "#fb7185"], ["#7c2d12", "#fb923c"]], titles: ["Crispy Rice Bowls — Weeknight Fix", "Hand-Pulled Noodles From Scratch", "The Fluffiest Soufflé Pancakes — Tested 9 Ways", "Fermented Hot Sauce — Week 1 to Bottling", "Grandma's Dumpling Folding, Frame by Frame", "Cast Iron Pizza — Blistered Crust at Home", "Knife Skills — The Only 5 Cuts You Need", "Miso Everything — 4 Glazes, 1 Jar", "Sourdough Discard Crackers — Zero Waste", "Thai Basil Stir-Fry — Wok Hei at Home", "Perfect Soft-Boiled Eggs — Timing Chart", "Homemade Ricotta — Easier Than You Think", "Chili Crisp Three Ways — Mild to Wild", "The 3-Ingredient Chocolate Mousse", "Pickle Anything — A Beginner's Brine Guide", "Sheet-Pan Gnocchi With Burst Tomatoes", "Biryani Layering — Dum Style, Step by Step", "Cold Brew Tonic — Coffee Shop Copycat", "Empanada Dough That Never Tears", "Roast Chicken Science — Dry Brine Results"] },
  { cat: "Fitness", tags: ["home workout", "strength", "beginner", "mobility", "endurance", "yoga"], grads: [["#14532d", "#22c55e"], ["#831843", "#ec4899"], ["#7f1d1d", "#f87171"], ["#0c4a6e", "#38bdf8"]], titles: ["Kettlebell Basics — The Swing, Done Right", "Core Finisher — No Crunches", "Desk Mobility Routine — Undo 8 Hours of Sitting", "Couch to 5K — Week 1, Run/Walk Plan", "Resistance Band Upper Body — Full Session", "Hip Opener Flow — Daily Practice", "Pull-Up Progression — From Dead Hang to First Rep", "Low-Impact Cardio — Apartment Friendly", "Squat Form Check — 5 Common Fixes", "Breathwork for Recovery — Box Breathing Guide", "Trail Running Drills — Downhill Technique", "Pilates Wall Routine — Full Session", "Grip Strength — Farmer's Carry Variations", "Balance Training for Runners", "Sunrise Stretch — 7 Gentle Moves", "Dumbbell Complex — Full Body Session", "Posture Reset — Thoracic Mobility", "Zone 2 Cardio Explained — With Heart Rate Zones", "Single-Leg Strength — Bulletproof Knees", "Evening Wind-Down Yoga — Sleep Edition"] },
  { cat: "Music", tags: ["lofi", "jazz", "vinyl", "live", "piano", "chill"], grads: [["#581c87", "#a855f7"], ["#111827", "#6366f1"], ["#312e81", "#818cf8"], ["#500724", "#f43f5e"]], titles: ["Vinyl Haul — 12 Records, One Crate", "How a Jazz Trio Rehearses — Fly on the Wall", "Chillhop Mix — Rainy Window Session", "Modular Synth Jam — One Take, No Edits", "Classical Guitar — Asturias, Slow Practice", "Drum Grooves From Around the World", "Building a Beat From Field Recordings", "Choir in a Parking Garage — Natural Reverb", "Piano Covers — Movie Themes by Ear", "The History of the Mixtape — Mini Doc", "Busking in Berlin — A Day's Earnings", "Analog Tape Loops — Ambient Session 9", "Trumpet Practice Routine — Tone First", "Lo-Fi Guitar Loops — Chords Over Rain", "Inside a Vinyl Pressing Plant", "Folk Songs of the Andes — Live Set", "Music Theory — Modes in Plain English", "Sampling Vinyl Legally — Producer Breakdown", "Handpan at Dawn — Rooftop Session", "Orchestra Rehearsal — Mahler 5, Day 1"] },
  { cat: "Documentary", tags: ["history", "explained", "nature", "science", "aviation", "documentary"], grads: [["#713f12", "#eab308"], ["#164e63", "#06b6d4"], ["#14532d", "#84cc16"], ["#27272a", "#e4e4e7"]], titles: ["How Lighthouses Survived the LED Age", "The Last Night Train in Europe", "Rebuilding a Coral Reef — Year Two", "Why Airports Paint Planes White", "The Seed Vault Keepers of Svalbard", "Street Markets That Never Sleep", "How Bridges Are Inspected — Rope Access", "The Town That Prints Its Own Money", "Volcano Watchers — Living on the Rim", "Inside a Submarine Rescue Drill", "The Cartographers of OpenStreetMap", "How Opera Houses Tune a Room", "Beekeepers of the Rooftops", "The Ferries of the Bosphorus", "Restoring Apollo-Era Film — Frame by Frame", "How Weather Balloons Are Tracked", "The Night Shift at a Whale Sanctuary", "Water Towers — An Accidental History", "The People Who Tune Grand Pianos", "How Deep-Sea Cables Get Repaired"] },
  { cat: "Gaming", tags: ["speedrun", "live", "record", "esports", "retro", "gaming"], grads: [["#1e3a8a", "#3b82f6"], ["#4a044e", "#d946ef"], ["#14532d", "#22c55e"], ["#7f1d1d", "#f97316"]], titles: ["Any% Speedrun — New Route Explained", "Retro Console Restoration — Yellowed Plastic Fix", "Ranked Climb — Diamond in 30 Days, Day 12", "Indie Roguelike Marathon — 6 Games, One Night", "Controller Modding — Hall Effect Upgrade", "Boss Fight Breakdown — Frame Data Deep Dive", "City Builder Challenge — No Roads Allowed", "LAN Party Documentary — 2004 to Now", "Puzzle Game Design — Why Sokoban Endures", "VR Rhythm Session — Expert+ Full Combo", "Game Sound Design — Foley From Kitchen Items", "Esports Finals — Crowd Cam Full Match", "Permadeath Run — Episode 7, The Swamp", "Handheld Collection Tour — 40 Devices", "Mod Showcase — Total Conversion, First Look", "Co-op Chaos — Overcooked-Style Kitchen Sim", "Achievement Hunting — The 0.1% Club", "Arcade High Scores — Twin Galaxies Stories", "Building a Racing Rig From Scrap", "Speedrun Practice — Splits & Resets"] },
  { cat: "DIY", tags: ["woodwork", "restoration", "cabin", "off grid", "timelapse", "workshop"], grads: [["#0c4a6e", "#38bdf8"], ["#7f1d1d", "#f97316"], ["#365314", "#a3e635"], ["#78350f", "#fbbf24"]], titles: ["Workbench Build — Laminated Top, One Weekend", "Rust Removal — Electrolysis Tank Test", "Tiny House Framing — Walls Up in a Day", "Sharpening Chisels — Mirror Edge Method", "Solar Shed — 400W Off-Grid Setup", "Leather Tool Roll — Hand Stitched", "Rescuing a Water-Damaged Dresser", "Japanese Joinery — No Nails, No Glue", "Concrete Planter Molds — Silicone Master", "Bicycle Frame Respray — Rattle Can Pro", "Greenhouse From Old Windows", "Knife Handle From a Fallen Oak", "LED Shop Lights — Shadowless Bench", "Rain Barrel System — First Flush Diverter", "Reclaimed Pallet Sofa — Outdoor Build", "Dovetails by Hand — Third Attempt", "Workshop Dust Collection on a Budget", "Copper Pipe Lamp — Patina Finish", "Staircase Repair — Squeak Elimination", "Tool Wall — French Cleat Everything"] },
  { cat: "Photography", tags: ["street", "composition", "astro", "night", "tutorial", "35mm"], grads: [["#27272a", "#e4e4e7"], ["#020617", "#38bdf8"], ["#4a044e", "#d946ef"], ["#713f12", "#eab308"]], titles: ["Film vs Digital — Same Street, Same Hour", "Long Exposure Rivers — ND Filter Guide", "Portrait Lighting With One Window", "Developing Color Film at Home — C-41", "The Contact Sheet — Editing Like a Magnum Photographer", "Milky Way Over the Salt Flats", "Instant Film Revival — Chemistry Explained", "Street Layers — Foreground, Subject, Background", "Golden Hour Is a Lie — Blue Hour Portraits", "Macro on a Budget — Reverse Lens Trick", "Drone-Free Aerials — Kite Photography", "Black & White Conversion — Channel Mixing", "Night Markets on Medium Format", "The 28mm Manifesto — Wide Street Work", "Restoring Faded Family Slides", "Pinhole Camera From a Coffee Tin", "Fog Photography — Exposure Compensation", "Sports Sideline — Amateur League Access", "Print Your Work — Paper Choices Matter", "Astro Landscapes — Foreground Blending"] },
  { cat: "Art", tags: ["digital art", "portrait", "tutorial", "timelapse", "painting", "sketchbook"], grads: [["#4a044e", "#d946ef"], ["#881337", "#fb7185"], ["#312e81", "#818cf8"], ["#365314", "#a3e635"]], titles: ["Watercolor Skies — Wet on Wet Control", "Sketchbook Tour — 100 Days of Hands", "Oil Portrait Underpainting — Grisaille", "Ink Wash Landscapes — 3 Values Only", "Character Design — Silhouette First", "Mural Painting — Grid Transfer Method", "Charcoal Figure Study — 25 Minute Pose", "Color Theory — Limited Palette Challenge", "Paper Marbling — Suminagashi Basics", "Digital Sculpting — First Head, Timelapse", "Botanical Illustration — Leaf Veins", "Screen Printing at Home — 2 Colors", "En Plein Air — Harbor at 6 AM", "Calligraphy Drills — Pressure & Release", "Mixed Media Collage — Found Paper", "Anatomy for Artists — The Ribcage", "Gouache Still Life — Matte & Opaque", "Urban Sketching — Ink Then Wash", "Pottery Wheel — Centering Clay, Finally", "Textile Dyeing — Indigo Vat Day"] },
  { cat: "Tech", tags: ["desk setup", "tech", "minimal", "programming", "gadgets", "tutorial"], grads: [["#1e293b", "#94a3b8"], ["#164e63", "#06b6d4"], ["#312e81", "#818cf8"], ["#14532d", "#22c55e"]], titles: ["Mechanical Keyboard Build — Lubed & Filmed", "Home Server From a Dead Laptop", "I Automated My Morning With 40 Lines of Code", "E-Ink Dashboard — Weather, Calendar, Trains", "NAS vs Cloud — 2-Year Cost Breakdown", "Linux on a 12-Year-Old ThinkPad", "Smart Lights Without a Hub", "Backup Strategy — 3-2-1 for Creators", "USB-C Everything — Cable Audit", "Building a Mechanical Watch From a Kit", "Local AI on a Mini PC — What Actually Runs", "Standing Desk Cable Tray — Before/After", "Password Managers Compared — Migration Diary", "Retro Handheld Emulation — Setup Guide", "Monitor Light Bars — Eye Strain Test", "Self-Hosted Photo Library — Year One", "The $35 Microphone That Beat My Studio Mic", "Ergonomic Splits — One Month In", "Old Phone as Security Camera — Full Setup", "Wi-Fi Dead Zones — Heatmap My Apartment"] },
  { cat: "Gardening", tags: ["garden", "makeover", "budget", "zero waste", "seasonal", "tutorial"], grads: [["#365314", "#a3e635"], ["#14532d", "#22c55e"], ["#78350f", "#fbbf24"], ["#134e4a", "#2dd4bf"]], titles: ["Compost in a Small Yard — No Smell Method", "Tomato Pruning — Suckers Explained", "Herb Spiral Build — One Afternoon", "Rain Garden for a Flooded Corner", "Seed Starting Indoors — LED Shelf Setup", "Pollinator Patch From a Lawn Strip", "Espalier Apple Tree — Year 1 Training", "Soil Test Results — Amending Clay", "Cut Flower Garden — Succession Planting", "Greenhouse Ventilation — Solar Fan Hack", "Potato Towers — Harvest Weigh-In", "Native Hedge Planting — Wildlife Corridor", "Drip Irrigation From a Single Tap", "Saving Seeds — Tomatoes & Beans", "Winter Sowing in Milk Jugs", "Mushroom Logs — Shiitake Inoculation", "Balcony Citrus — Overwintering Indoors", "No-Dig Beds — Cardboard & Compost", "Garlic Planting — Hardneck vs Softneck", "Orchard Pruning — Open Center Shape"] },
  { cat: "Comedy", tags: ["comedy", "sketch", "vlog", "live", "challenge", "stand-up"], grads: [["#713f12", "#eab308"], ["#831843", "#ec4899"], ["#1e3a8a", "#3b82f6"], ["#7f1d1d", "#f87171"]], titles: ["Customer Service Voice — A Sketch", "Two Chefs, One Recipe, Zero Communication", "The Group Chat — Every Character, One Actor", "Productivity Gurus Try a Real Job", "Airport Announcements But Honest", "Dad Reviews Video Games — Racing Edition", "The Meeting That Could've Been an Email", "Cooking Show With a 3-Year-Old Director", "Weather Forecast for Fictional Towns", "Tech Support for Time Travelers", "Real Estate Tours of Tiny Apartments", "Sports Commentary for Everyday Life", "The Plant Parent Confessional", "Instruction Manuals Read Dramatically", "Job Interviews for Supervillains", "Grocery Store Olympics — Aisle 9 Finals", "Historical Figures With Smartphones", "The Landlord Special — Renovation Reveal", "Unboxing Things From My Own House", "Stand-Up — Airports, Again"] },
];

const ALL_TAG_NAMES = Array.from(new Set([...BASE_TAGS.map((t) => t.name), ...GEN_SPECS.flatMap((s) => s.tags), ...BASE_VIDEOS.flatMap((v) => v.tags)]));

function buildCatalog(): Video[] {
  const rng = mulberry(20261126);
  const out: Video[] = BASE_VIDEOS.map(withDefaults);
  let n = 25;
  let genIdx = 0;
  for (const spec of GEN_SPECS) {
    spec.titles.forEach((title, i) => {
      const durationSec = 200 + Math.floor(rng() * 5000);
      const days = Math.floor(rng() * 700);
      const tags = [spec.tags[i % spec.tags.length] as string, spec.tags[(i + 2) % spec.tags.length] as string, ALL_TAG_NAMES[(n + i) % ALL_TAG_NAMES.length] as string];
      const creator = genIdx < CREATORS.length * 2
        ? (CREATORS[genIdx % CREATORS.length] as (typeof CREATORS)[number]).name
        : rng() < 0.62
          ? (BASE_CREATORS[Math.floor(rng() * BASE_CREATORS.length)] as (typeof BASE_CREATORS)[number]).name
          : (CREATORS[Math.floor(rng() * CREATORS.length)] as (typeof CREATORS)[number]).name;
      genIdx++;
      out.push(withDefaults({
        id: `v${n}`,
        title,
        durationSec,
        duration: fmtDur(durationSec),
        views: 300 + Math.floor(rng() * 3_400_000),
        days,
        age: ageFromDays(days),
        rating: 78 + Math.floor(rng() * 22),
        hd: rng() > 0.38,
        category: spec.cat,
        tags,
        creator,
        g: spec.grads[i % spec.grads.length] as [string, string],
      }));
      n++;
    });
  }
  return out;
}

export const VIDEOS: Video[] = buildCatalog();

/* Every count shown in the UI is derived from this catalog, so a page never
   claims more videos than it can actually list. */
for (const c of CREATORS) c.videos = VIDEOS.filter((v) => v.creator === c.name).length;
for (const ch of CHANNELS) ch.videos = String(VIDEOS.filter((v) => v.creator === ch.creator).length);
for (const c of CATEGORIES) c.count = String(VIDEOS.filter((v) => v.category === c.name || v.tags.includes(c.name.toLowerCase())).length);

export const TAGS: { name: string; count: number }[] = (() => {
  const rng = mulberry(777);
  const extra = ALL_TAG_NAMES.filter((t) => !BASE_TAGS.some((b) => b.name === t)).map((name) => ({ name, count: 400 + Math.floor(rng() * 4200) }));
  return [...BASE_TAGS, ...extra].sort((a, b) => b.count - a.count);
})();

for (const t of TAGS) t.count = VIDEOS.filter((v) => v.tags.includes(t.name) || v.category.toLowerCase() === t.name).length;

/* ---------------- Admin panel state ----------------
   Everything the admin panel manages lives in one AdminState object,
   persisted as JSON through the saveAdminState action. The public site
   renders buildEffective(adminState): the built-in catalog with admin
   videos prepended, catalog edits applied as overrides, deletes removed,
   and taxonomy renames/additions/deletions applied. A null AdminState
   (nothing ever saved, or after Reset) reproduces the default site. */

export type AdminVideo = {
  id: string;
  title: string | null;
  description: string | null;
  embedUrl: string | null;
  durationSec: number | null;
  views: number | null;
  days: number | null;
  dateStr: string | null;
  creator: string | null;
  channel: string | null;
  category: string | null;
  tags: string[];
  thumbnailUrl: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  featured: boolean;
  badgeNew: boolean;
  rating: number | null;
  hd: boolean;
};

export type TaxOp = { added: string[]; renamed: Record<string, string>; deleted: string[] };
const emptyTax = (): TaxOp => ({ added: [], renamed: {}, deleted: [] });

export type AdminState = {
  texts: Record<string, string>;
  buttons: { id: string; name: string; label: string; link: string }[];
  seo: { siteTitle: string; metaDescription: string; metaKeywords: string; ogTitle: string; ogDescription: string };
  addedVideos: AdminVideo[];
  overrides: Record<string, AdminVideo>;
  deletedIds: string[];
  taxonomy: {
    categories: TaxOp;
    models: TaxOp;
    tags: TaxOp;
    channels: TaxOp;
    channelsAdded: { name: string; creator: string }[];
  };
};

export const DEFAULT_TEXTS: Record<string, string> = {
  siteName: "Pulse Video",
  logoText: "PULSE VIDEO",
  homeH1: "Stream Free Videos in HD",
  secTrending: "Trending now",
  secLatest: "Latest videos",
  secModels: "Popular models",
  secChannels: "Channels",
  secBecause: "Because you watch",
  secTopRated: "Top rated",
  searchPlaceholder: "Search videos, models, tags",
  footerText: "pulsevideo.example · For adults only. You must be 18 or older to use this site. All videos, models and counts shown are sample catalog entries.",
  cookieText: "We use cookies to run this site and show ads.",
};

export const DEFAULT_BUTTONS: AdminState["buttons"] = [
  { id: "next", name: "Next (page / section)", label: "Next", link: "" },
  { id: "showMore", name: "Show more (Latest on home)", label: "Show more", link: "" },
  { id: "seeAll", name: "See all (section links)", label: "See all", link: "" },
  { id: "follow", name: "Follow (model buttons)", label: "Follow", link: "" },
  { id: "like", name: "Like (video page)", label: "Like", link: "" },
  { id: "save", name: "Save / Watch later (video page)", label: "Save", link: "" },
  { id: "watchFull", name: "Watch Full Video (player overlay)", label: "Watch Full Video", link: "" },
];

export const DEFAULT_SEO: AdminState["seo"] = {
  siteTitle: "Pulse Video | Stream Free Videos in HD",
  metaDescription: "Watch free videos in HD — trending, latest and top rated videos, models and channels, updated daily.",
  metaKeywords: "videos, streaming, hd videos, trending videos, models, channels",
  ogTitle: "Pulse Video",
  ogDescription: "Watch free videos in HD — trending, latest and top rated videos, models and channels, updated daily.",
};

export const DEFAULT_ADMIN_STATE: AdminState = {
  texts: { ...DEFAULT_TEXTS },
  buttons: DEFAULT_BUTTONS.map((b) => ({ ...b })),
  seo: { ...DEFAULT_SEO },
  addedVideos: [],
  overrides: {},
  deletedIds: [],
  taxonomy: { categories: emptyTax(), models: emptyTax(), tags: emptyTax(), channels: emptyTax(), channelsAdded: [] },
};

export function parseAdminState(payload: string | null | undefined): AdminState {
  const base = JSON.parse(JSON.stringify(DEFAULT_ADMIN_STATE)) as AdminState;
  if (!payload) return base;
  try {
    const p = JSON.parse(payload) as Partial<AdminState>;
    return {
      texts: { ...base.texts, ...(p.texts ?? {}) },
      buttons: DEFAULT_BUTTONS.map((d) => {
        const b = (p.buttons ?? []).find((x) => x.id === d.id);
        return b ? { ...d, label: typeof b.label === "string" ? b.label : d.label, link: typeof b.link === "string" ? b.link : d.link } : { ...d };
      }),
      seo: { ...base.seo, ...(p.seo ?? {}) },
      addedVideos: Array.isArray(p.addedVideos) ? p.addedVideos : [],
      overrides: p.overrides && typeof p.overrides === "object" ? p.overrides : {},
      deletedIds: Array.isArray(p.deletedIds) ? p.deletedIds : [],
      taxonomy: {
        categories: { ...emptyTax(), ...(p.taxonomy?.categories ?? {}) },
        models: { ...emptyTax(), ...(p.taxonomy?.models ?? {}) },
        tags: { ...emptyTax(), ...(p.taxonomy?.tags ?? {}) },
        channels: { ...emptyTax(), ...(p.taxonomy?.channels ?? {}) },
        channelsAdded: Array.isArray(p.taxonomy?.channelsAdded) ? p.taxonomy.channelsAdded : [],
      },
    };
  } catch {
    return base;
  }
}

function gradientFor(seed: string): [string, string] {
  let h = 7;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return CREATOR_GRADIENTS[Math.abs(h) % CREATOR_GRADIENTS.length] as [string, string];
}

export function dateFromDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

export function parseDateValue(s: string): { days: number; dateStr: string } | null {
  const d = new Date(s.trim());
  if (isNaN(d.getTime())) return null;
  const days = Math.max(0, Math.round((Date.now() - d.getTime()) / 86_400_000));
  return { days, dateStr: d.toISOString().slice(0, 10) };
}

export function parseDuration(s: string): number | null {
  const t = s.trim();
  if (!t) return null;
  if (/^\d+$/.test(t)) return parseInt(t, 10);
  const parts = t.split(":").map((p) => parseInt(p, 10));
  if (parts.length < 2 || parts.length > 3 || parts.some((p) => isNaN(p))) return null;
  return parts.reduce((a, p) => a * 60 + p, 0);
}

export function parseViews(s: string): number | null {
  const m = s.trim().replace(/,/g, "").match(/^([\d.]+)\s*([kKmM])?$/);
  if (!m) return null;
  const n = parseFloat(m[1] as string);
  if (isNaN(n)) return null;
  const mult = m[2] ? (m[2].toLowerCase() === "m" ? 1_000_000 : 1000) : 1;
  return Math.round(n * mult);
}

/* Extracts a playable source from whatever was pasted into an embed field:
   a raw <iframe> embed code yields its src; YouTube watch/shorts/youtu.be
   and Vimeo page URLs become their embed players; direct media files are
   flagged so the player uses a <video> element. */
export function extractEmbedSrc(raw: string): string {
  const s = raw.trim();
  const m = s.match(/<iframe[^>]*\ssrc=["']([^"']+)["']/i);
  return m && m[1] ? m[1].trim() : s;
}

export function resolveEmbed(raw: string): { kind: "iframe" | "file"; src: string } {
  let s = extractEmbedSrc(raw);
  if (s.startsWith("//")) s = `https:${s}`;
  /* A freepornvideo watch-page link (the URL in the browser bar on that
     site) is not the embed player — convert it to the /embed/ player URL,
     otherwise the iframe loads the whole watch page instead of a player. */
  const fpv = s.match(/freepornvideo\.sex\/xxx\/(\d+)/i);
  if (fpv && fpv[1]) return { kind: "iframe", src: `https://www.freepornvideo.sex/embed/${fpv[1]}` };
  /* Same for XNXX: a watch-page link (/video-<id>/…) is not the embed
     player — convert it to the /embedframe/ player URL. */
  const xx = s.match(/xnxx\.com\/video-([\w-]+)/i);
  if (xx && xx[1]) return { kind: "iframe", src: `https://www.xnxx.com/embedframe/${xx[1]}` };
  const yt = s.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([\w-]{6,})/);
  if (yt && yt[1]) return { kind: "iframe", src: `https://www.youtube.com/embed/${yt[1]}` };
  const vm = s.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (vm && vm[1]) return { kind: "iframe", src: `https://player.vimeo.com/video/${vm[1]}` };
  if (/\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(s)) return { kind: "file", src: s };
  return { kind: "iframe", src: s };
}

/* Imported video data arrives with HTML entities baked into its text
   fields (descriptions like "wife&#039;s … babe &amp; her husband" —
   measured on 98 of the owner's 198 imported videos). React escapes
   text on render, so those entities would show literally on the video
   page, in search and in the SEO description. Decode once, here, where
   admin data becomes site data, and every surface (cards, video page,
   admin lists, sitemap, JSON-LD) shows the real characters. &amp; is
   decoded last so an escaped entity like &amp;#039; stays literal. */
function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, h: string) => { try { return String.fromCodePoint(parseInt(h, 16)); } catch { return _m; } })
    .replace(/&#(\d+);/g, (_m, n: string) => { try { return String.fromCodePoint(parseInt(n, 10)); } catch { return _m; } })
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}
const decText = (s: string | null): string | null => (s == null ? null : decodeEntities(s));

/* Some sources hand back a video file as a video's "thumbnail" (the
   owner's XNXX import uses XNXX's preview.mp4). An <img> can never
   render it — the card would sit on the loading placeholder forever
   and og:image would point at a movie — so surfaces that show a
   thumbnail check the URL's type first and use a <video> preview (or
   no image at all) for these. */
export const isVideoFileUrl = (u: string): boolean => /\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(u);

function adminToVideo(av: AdminVideo): Video {
  return {
    id: av.id,
    title: decText(av.title) ?? "Untitled video",
    duration: av.durationSec != null ? fmtDur(av.durationSec) : "",
    durationSec: av.durationSec ?? 0,
    views: av.views ?? 0,
    age: av.days != null ? ageFromDays(av.days) : "",
    days: av.days ?? 9999,
    rating: av.rating ?? 0,
    hd: av.hd,
    category: decText(av.category) ?? "Uncategorized",
    tags: (av.tags ?? []).map((t) => decodeEntities(t)),
    creator: decText(av.creator) ?? "",
    g: gradientFor(av.id + (av.title ?? "")),
    embedUrl: av.embedUrl,
    description: decText(av.description),
    thumbnailUrl: av.thumbnailUrl,
    seoTitle: decText(av.seoTitle),
    seoDescription: decText(av.seoDescription),
    featured: av.featured,
    badgeNew: av.badgeNew,
    channel: decText(av.channel),
    custom: true,
    hasViews: av.views != null,
    hasDate: av.days != null,
    hasRating: av.rating != null,
  };
}

export function videoToAdmin(v: Video): AdminVideo {
  return {
    id: v.id,
    title: v.title,
    description: v.custom ? v.description : null,
    embedUrl: v.embedUrl,
    durationSec: v.duration ? v.durationSec : null,
    views: v.hasViews ? v.views : null,
    days: v.hasDate ? v.days : null,
    dateStr: v.hasDate ? dateFromDays(v.days) : null,
    creator: v.creator || null,
    channel: v.channel,
    category: v.category,
    tags: [...v.tags],
    thumbnailUrl: v.thumbnailUrl,
    seoTitle: v.seoTitle,
    seoDescription: v.seoDescription,
    featured: v.featured,
    badgeNew: v.badgeNew,
    rating: v.hasRating ? v.rating : null,
    hd: v.hd,
  };
}

export function emptyAdminVideo(id: string): AdminVideo {
  return {
    id, title: null, description: null, embedUrl: null, durationSec: null, views: null,
    days: 0, dateStr: dateFromDays(0), creator: null, channel: null, category: null,
    tags: [], thumbnailUrl: null, seoTitle: null, seoDescription: null,
    featured: false, badgeNew: true, rating: null, hd: true,
  };
}

/* Merges the saved admin state over the built-in catalog. Every count is
   recomputed from the resulting video list, so admin pages and the public
   site always agree. */
export function buildEffective(admin: AdminState | null) {
  const tax = admin?.taxonomy;
  const catRen = tax?.categories.renamed ?? {};
  const modRen = tax?.models.renamed ?? {};
  const tagRen = tax?.tags.renamed ?? {};
  const chRen = tax?.channels.renamed ?? {};
  const ren = (map: Record<string, string>, v: string) => map[v] ?? v;
  const deletedIds = new Set(admin?.deletedIds ?? []);
  const overrides = admin?.overrides ?? {};

  type EffChannel = { name: string; videos: string; creator: string; g: [string, string] };
  const channels: EffChannel[] = [];
  for (const ch of CHANNELS) {
    if ((tax?.channels.deleted ?? []).includes(ch.name)) continue;
    channels.push({ name: ren(chRen, ch.name), videos: "0", creator: ren(modRen, ch.creator), g: ch.g });
  }
  for (const ca of tax?.channelsAdded ?? []) {
    if (!channels.some((c) => c.name === ca.name)) channels.push({ name: ca.name, videos: "0", creator: ren(modRen, ca.creator), g: gradientFor(ca.name) });
  }

  const vids: Video[] = [];
  for (const v of VIDEOS) {
    if (deletedIds.has(v.id)) continue;
    const ov = overrides[v.id];
    if (ov) { vids.push(adminToVideo(ov)); continue; }
    vids.push({ ...v, category: ren(catRen, v.category), creator: ren(modRen, v.creator), tags: v.tags.map((t) => ren(tagRen, t)) });
  }
  const added = (admin?.addedVideos ?? []).map(adminToVideo);
  const videos = [...added, ...vids].sort((a, b) => Number(b.featured) - Number(a.featured));

  for (const v of videos) {
    if (v.channel) v.channel = ren(chRen, v.channel);
    else v.channel = channels.find((c) => c.creator !== "" && c.creator === v.creator)?.name ?? null;
    if (v.channel && !channels.some((c) => c.name === v.channel)) {
      channels.push({ name: v.channel, videos: "0", creator: v.creator, g: gradientFor(v.channel) });
    }
  }
  for (const ch of channels) ch.videos = String(videos.filter((v) => v.channel === ch.name || (ch.creator !== "" && v.creator === ch.creator)).length);

  const catNames: string[] = [];
  for (const c of CATEGORIES) {
    if ((tax?.categories.deleted ?? []).includes(c.name)) continue;
    const n = ren(catRen, c.name);
    if (!catNames.includes(n)) catNames.push(n);
  }
  for (const n of tax?.categories.added ?? []) if (!catNames.includes(n)) catNames.push(n);
  for (const v of videos) if (!catNames.includes(v.category)) catNames.push(v.category);
  const categories = catNames.map((name) => ({ name, count: String(videos.filter((v) => v.category === name || v.tags.includes(name.toLowerCase())).length) }));

  type EffCreator = { name: string; videos: number; followers: string; g: [string, string] };
  const creators: EffCreator[] = [];
  for (const c of CREATORS) {
    if ((tax?.models.deleted ?? []).includes(c.name)) continue;
    creators.push({ name: ren(modRen, c.name), videos: 0, followers: c.followers, g: c.g });
  }
  for (const n of tax?.models.added ?? []) if (!creators.some((c) => c.name === n)) creators.push({ name: n, videos: 0, followers: "0", g: gradientFor(n) });
  for (const v of videos) if (v.creator && !creators.some((c) => c.name === v.creator)) creators.push({ name: v.creator, videos: 0, followers: "0", g: gradientFor(v.creator) });
  for (const c of creators) c.videos = videos.filter((v) => v.creator === c.name).length;
  /* Most videos first, so the Models page ("Models Having Most
     Videos"), the home strip and the admin list all lead with the
     models that actually have videos instead of burying them behind
     empty entries. Stable sort: ties keep catalog order. */
  creators.sort((a, b) => b.videos - a.videos);
  /* Same for channels: busiest first on the Channels page and home. */
  channels.sort((a, b) => Number(b.videos) - Number(a.videos));

  const tagNames: string[] = [];
  for (const t of TAGS) {
    if ((tax?.tags.deleted ?? []).includes(t.name)) continue;
    const n = ren(tagRen, t.name);
    if (!tagNames.includes(n)) tagNames.push(n);
  }
  for (const n of tax?.tags.added ?? []) if (!tagNames.includes(n)) tagNames.push(n);
  for (const v of videos) for (const t of v.tags) if (!tagNames.includes(t)) tagNames.push(t);
  const tags = tagNames.map((name) => ({ name, count: videos.filter((v) => v.tags.includes(name) || v.category.toLowerCase() === name).length }));

  return { videos, categories, creators, channels, tags };
}

export const slugify = (s: string) => s.toLowerCase().replace(/\s+/g, "-");

/* ---------------- SEO: sitemap & robots generation ----------------
   The sitemap is generated from the live effective catalog (built-in
   videos plus everything the admin panel added, minus deletes), so a
   newly added video, category, model, channel or tag appears in it
   automatically.

   Every published URL is a real path under the site root — never a
   hash fragment. Crawlers strip everything from "#" onward, so the
   old …#/video/… locations all collapsed to the home page and the
   sitemap was useless to them. The app itself is hash-routed (this
   runtime serves a single HTML entry), but on load it also resolves
   these path URLs back to the matching view (see pathRoute below),
   so each published URL opens the page it names wherever the host
   serves the app for that path. For the same reason robots.txt must
   never contain a "#": in robots.txt "#" starts a comment, so a line
   like "Disallow: /#/history" is parsed as "Disallow: /" — a block
   of the entire site. Hash routes are never sent to a server and
   cannot be disallowed there anyway, so the file simply allows
   everything and points at the sitemap. */

/* The site root (directory form) for an origin+pathname base: strips
   a trailing file segment such as index.html and ends with "/". */
const siteRoot = (base: string) => base.replace(/[^/?#]+\.[a-z0-9]+$/i, "").replace(/\/?$/, "/");

/* Canonical public URL of a route ("/video/<id>", "/categories/<slug>",
   "/" for home): a fragment-free path URL under the site root. */
export const publicUrl = (base: string, route: string) => `${siteRoot(base)}${route.replace(/^\//, "")}`;

const xmlEsc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

/* ISO date (YYYY-MM-DD) for a video whose age is tracked in days. */
export const isoDateFromDays = (days: number) => { const d = new Date(); d.setDate(d.getDate() - Math.max(0, Math.floor(days))); return d.toISOString().slice(0, 10); };

/* ISO-8601 duration (PT#H#M#S) for structured data. */
export const isoDuration = (sec: number) => {
  if (!sec || sec <= 0) return undefined;
  const h = Math.floor(sec / 3600); const m = Math.floor((sec % 3600) / 60); const s = Math.floor(sec % 60);
  return `PT${h ? `${h}H` : ""}${m ? `${m}M` : ""}${s || (!h && !m) ? `${s}S` : ""}`;
};

export type SitemapData = { videos: Video[]; categories: { name: string }[]; creators: { name: string }[]; channels: { name: string }[]; tags: { name: string }[] };

export function buildSitemapXml(base: string, d: SitemapData): string {
  const today = new Date().toISOString().slice(0, 10);
  const url = (route: string, lastmod: string, freq: string, prio: string, extra?: string | null) =>
    `  <url>\n    <loc>${xmlEsc(publicUrl(base, route))}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>${freq}</changefreq>\n    <priority>${prio}</priority>${extra ? `\n${extra}` : ""}\n  </url>`;
  const out: string[] = [
    url("/", today, "daily", "1.0"),
    url("/most-popular", today, "daily", "0.8"),
    url("/latest-updates", today, "daily", "0.8"),
    url("/top-rated", today, "weekly", "0.7"),
    url("/longest", today, "weekly", "0.6"),
    url("/categories", today, "weekly", "0.8"),
    url("/models", today, "weekly", "0.8"),
    url("/channels", today, "weekly", "0.7"),
    url("/tags", today, "weekly", "0.7"),
  ];
  for (const v of d.videos) out.push(url(`/video/${v.id}`, v.hasDate ? isoDateFromDays(v.days) : today, "weekly", "0.9", videoSitemapBlock(base, v)));
  for (const c of d.categories) out.push(url(`/categories/${slugify(c.name)}`, today, "weekly", "0.7"));
  for (const c of d.creators) out.push(url(`/models/${slugify(c.name)}`, today, "weekly", "0.7"));
  for (const c of d.channels) out.push(url(`/channels/${slugify(c.name)}`, today, "weekly", "0.6"));
  for (const t of d.tags) out.push(url(`/tag/${slugify(t.name)}`, today, "weekly", "0.6"));
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:video="http://www.google.com/schemas/sitemap-video/1.1">\n${out.join("\n")}\n</urlset>\n`;
}

/* Google Video Sitemap entry for one video: a <video:video> block
   inside the video page's <url> entry, so crawlers can index the
   video itself even though the site is hash-routed and its JSON-LD is
   client-rendered — the served sitemap is the crawler-visible part of
   the VideoObject system. Only videos with a real image thumbnail
   get one: a .mp4 "thumbnail" is a movie, not an image, and
   thumbnail_loc must be an absolute image URL. player_loc is the
   page where the video plays — never a signed/expiring storage file
   URL. family_friendly is "no": the site declares an adult rating
   in its meta. */
export function videoSitemapBlock(base: string, v: Video): string | null {
  const thumb = v.thumbnailUrl;
  if (!thumb || isVideoFileUrl(thumb) || !/^https?:\/\//i.test(thumb)) return null;
  const title = v.title.replace(/\s+/g, " ").trim().slice(0, 100);
  const desc = (v.description?.replace(/\s+/g, " ").trim() || `Watch ${v.title} — streaming in HD on Pulse Video.`).slice(0, 2048);
  const lines = [
    `    <video:thumbnail_loc>${xmlEsc(thumb)}</video:thumbnail_loc>`,
    `    <video:title>${xmlEsc(title)}</video:title>`,
    `    <video:description>${xmlEsc(desc)}</video:description>`,
    `    <video:player_loc>${xmlEsc(publicUrl(base, `/video/${v.id}`))}</video:player_loc>`,
  ];
  if (v.durationSec > 0) lines.push(`    <video:duration>${Math.floor(v.durationSec)}</video:duration>`);
  if (v.hasDate) lines.push(`    <video:publication_date>${isoDateFromDays(v.days)}</video:publication_date>`);
  lines.push(`    <video:family_friendly>no</video:family_friendly>`);
  return `  <video:video>\n${lines.join("\n")}\n  </video:video>`;
}

export function buildRobotsTxt(base: string): string {
  /* No "#" anywhere in this file, not even in comments: "#" starts a
     comment in robots.txt, so the previous "Disallow: /#/…" lines were
     each read as "Disallow: /" and blocked the whole site. Private
     views (admin, history, profile, search) are hash routes — they
     are never sent to a server, so robots.txt cannot disallow them;
     the app keeps them out of the index with noindex meta instead. */
  return [
    "User-agent: *",
    "Allow: /",
    "",
    `Sitemap: ${publicUrl(base, "/sitemap.xml")}`,
    "",
  ].join("\n");
}
