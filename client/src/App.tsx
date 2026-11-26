import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";
import { actionFields } from "@hatch/space-sdk/fields" with { type: "macro" };
import type { Actions } from "../../server/src/actions";

const FIELDS = actionFields<typeof Actions>();

/* ---------------- Types & catalog data ---------------- */

type Video = {
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

const fmtViews = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M` : n >= 1000 ? `${Math.round(n / 1000)}K` : `${n}`;
const fmtDur = (s: number) => s >= 3600 ? `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
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

const CATEGORIES: { name: string; count: string }[] = [
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
const CHANNELS: { name: string; videos: string; creator: string; g: [string, string] }[] = [
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
const CREATORS: { name: string; videos: number; followers: string; g: [string, string] }[] = [
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

const VIDEOS: Video[] = buildCatalog();

/* Every count shown in the UI is derived from this catalog, so a page never
   claims more videos than it can actually list. */
for (const c of CREATORS) c.videos = VIDEOS.filter((v) => v.creator === c.name).length;
for (const ch of CHANNELS) ch.videos = String(VIDEOS.filter((v) => v.creator === ch.creator).length);
for (const c of CATEGORIES) c.count = String(VIDEOS.filter((v) => v.category === c.name || v.tags.includes(c.name.toLowerCase())).length);

const TAGS: { name: string; count: number }[] = (() => {
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

type AdminVideo = {
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

type TaxOp = { added: string[]; renamed: Record<string, string>; deleted: string[] };
const emptyTax = (): TaxOp => ({ added: [], renamed: {}, deleted: [] });

type AdminState = {
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

const DEFAULT_TEXTS: Record<string, string> = {
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

const DEFAULT_BUTTONS: AdminState["buttons"] = [
  { id: "next", name: "Next (page / section)", label: "Next", link: "" },
  { id: "showMore", name: "Show more (Latest on home)", label: "Show more", link: "" },
  { id: "seeAll", name: "See all (section links)", label: "See all", link: "" },
  { id: "follow", name: "Follow (model buttons)", label: "Follow", link: "" },
  { id: "like", name: "Like (video page)", label: "Like", link: "" },
  { id: "save", name: "Save / Watch later (video page)", label: "Save", link: "" },
  { id: "watchFull", name: "Watch Full Video (player overlay)", label: "Watch Full Video", link: "" },
];

const DEFAULT_SEO: AdminState["seo"] = {
  siteTitle: "Pulse Video | Stream Free Videos in HD",
  metaDescription: "Watch free videos in HD — trending, latest and top rated videos, models and channels, updated daily.",
  metaKeywords: "videos, streaming, hd videos, trending videos, models, channels",
  ogTitle: "Pulse Video",
  ogDescription: "Watch free videos in HD — trending, latest and top rated videos, models and channels, updated daily.",
};

const DEFAULT_ADMIN_STATE: AdminState = {
  texts: { ...DEFAULT_TEXTS },
  buttons: DEFAULT_BUTTONS.map((b) => ({ ...b })),
  seo: { ...DEFAULT_SEO },
  addedVideos: [],
  overrides: {},
  deletedIds: [],
  taxonomy: { categories: emptyTax(), models: emptyTax(), tags: emptyTax(), channels: emptyTax(), channelsAdded: [] },
};

function parseAdminState(payload: string | null | undefined): AdminState {
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

function dateFromDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function parseDateValue(s: string): { days: number; dateStr: string } | null {
  const d = new Date(s.trim());
  if (isNaN(d.getTime())) return null;
  const days = Math.max(0, Math.round((Date.now() - d.getTime()) / 86_400_000));
  return { days, dateStr: d.toISOString().slice(0, 10) };
}

function parseDuration(s: string): number | null {
  const t = s.trim();
  if (!t) return null;
  if (/^\d+$/.test(t)) return parseInt(t, 10);
  const parts = t.split(":").map((p) => parseInt(p, 10));
  if (parts.length < 2 || parts.length > 3 || parts.some((p) => isNaN(p))) return null;
  return parts.reduce((a, p) => a * 60 + p, 0);
}

function parseViews(s: string): number | null {
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
function extractEmbedSrc(raw: string): string {
  const s = raw.trim();
  const m = s.match(/<iframe[^>]*\ssrc=["']([^"']+)["']/i);
  return m && m[1] ? m[1].trim() : s;
}

function resolveEmbed(raw: string): { kind: "iframe" | "file"; src: string } {
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
const isVideoFileUrl = (u: string): boolean => /\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(u);

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

function videoToAdmin(v: Video): AdminVideo {
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

function emptyAdminVideo(id: string): AdminVideo {
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
function buildEffective(admin: AdminState | null) {
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

/* ---------------- CSV (import / export) ---------------- */

const CSV_COLUMNS = ["title", "embed_url", "description", "duration", "views", "date", "creator", "channel", "category", "tags", "thumbnail", "seo_title", "seo_description"] as const;
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
    } else if (c === '"') quoted = true;
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
  const hasHeader = header.some((h) => known.includes(h));
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
    channel: r.channel,
    category: r.category,
    tags: r.tags ? r.tags.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean) : [],
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
  'Sample video title,https://example.com/embed/sample-video,A short sample description,12:34,1500,2026-11-20,Sample Creator,Sample Channel,Travel,"travel, guide",https://example.com/thumb.jpg,Sample SEO title,Sample SEO description',
  "Title only plus embed,https://example.com/embed/second,,,,,,,,,,,",
].join("\n");

const FEED_TABS = ["For you", "Trending", "New", "Top rated", "Longest"] as const;
const LETTERS = ["Popular", "0-9", "A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z", "#"];
const LANGS: { code: string; name: string }[] = [
  { code: "en", name: "English" }, { code: "es", name: "Español" }, { code: "de", name: "Deutsch" },
  { code: "fr", name: "Français" }, { code: "pt", name: "Português" }, { code: "it", name: "Italiano" },
  { code: "nl", name: "Nederlands" }, { code: "pl", name: "Polski" }, { code: "ru", name: "Русский" },
  { code: "tr", name: "Türkçe" }, { code: "ja", name: "日本語" }, { code: "ko", name: "한국어" },
  { code: "zh", name: "中文" }, { code: "ar", name: "العربية" }, { code: "hi", name: "हिन्दी" },
  { code: "id", name: "Bahasa Indonesia" }, { code: "vi", name: "Tiếng Việt" }, { code: "th", name: "ไทย" },
  { code: "cs", name: "Čeština" }, { code: "sv", name: "Svenska" },
];
const LANG_CODES = new Set(LANGS.map((l) => l.code));

/* ---------------- Icons (inline SVG, Lucide-style paths) ---------------- */

const P: Record<string, string> = {
  globe: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM3 12h18M12 3a13.6 13.6 0 0 1 0 18M12 3a13.6 13.6 0 0 0 0 18",
  menu: "M4 6h16M4 12h16M4 18h10",
  search: "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm10 2-4.3-4.3",
  history: "M3 12a9 9 0 1 0 3-6.7L3 8m0-5v5h5m7 4v5l3 2",
  user: "M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2m14-16.5a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0Z",
  grid: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
  hash: "M9 3 7 21M17 3l-2 18M4 8h17M3 16h17",
  users: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m20 0v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z",
  like: "M7 10v12H4a1 1 0 0 1-1-1V11a1 1 0 0 1 1-1h3Zm0 0 4.2-7.5c1.9 0 3.3 1.6 3 3.4L13.5 10H20a2 2 0 0 1 2 2.4l-1.2 7.6a2 2 0 0 1-2 1.7H7",
  dislike: "M17 14V2h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1h-3Zm0 0-4.2 7.5c-1.9 0-3.3-1.6-3-3.4L10.5 14H4a2 2 0 0 1-2-2.4L3.2 4A2 2 0 0 1 5.2 2.3H17",
  bookmark: "M6 3h12v18l-6-4-6 4Z",
  share: "M12 3v13m0-13L8 7m4-4 4 4M5 13v7a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-7",
  comment: "M21 12a8 8 0 0 1-8 8H4l2-3a8 8 0 1 1 15-5Z",
  download: "M12 3v12m0 0 4-4m-4 4-4-4M4 21h16",
  flag: "M5 21V4c4-2 7 2 12 0v9c-5 2-8-2-12 0",
  list: "M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01",
  bell: "M18 8a6 6 0 1 0-12 0c0 7-3 8-3 8h18s-3-1-3-8M10.3 21a2 2 0 0 0 3.4 0",
  x: "M6 6l12 12M18 6 6 18",
  volume: "M11 5 6 9H3v6h3l5 4Zm4.5 2.5a5 5 0 0 1 0 9M18.5 5a9 9 0 0 1 0 14",
  mute: "M11 5 6 9H3v6h3l5 4Zm10 0-6 14M15 5l6 14",
  expand: "M8 3H3v5m18-5h-5m5 13v5h-5M3 16v5h5",
  compress: "M9 4v5H4m16 0h-5V4M4 15h5v5m6 0v-5h5",
  chevD: "m6 9 6 6 6-6",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-13v5l3 2",
  shield: "M12 3 5 6v5c0 5 3 8 7 10 4-2 7-5 7-10V6Z",
  check: "m4 12.5 5 5L20 6.5",
  trash: "M4 7h16M9 7V4h6v3m-8 0 1 13h8l1-13",
  pip: "M3 5a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1Zm8 7h9v6h-9z",
  funnel: "M4 5h16l-6 7v5l-4 2v-7Z",
  back: "M19 12H5m0 0 6-6m-6 6 6 6",
  sun: "M12 16.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9ZM12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4",
  settings: "M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2zM15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z",
  moon: "M20 13.5A8 8 0 1 1 10.5 4a6.5 6.5 0 0 0 9.5 9.5Z",
};

const FILLED: Record<string, string> = {
  play: "M8 5.4v13.2c0 .8.9 1.3 1.6.9l10-6.6c.6-.4.6-1.4 0-1.8l-10-6.6c-.7-.4-1.6.1-1.6.9Z",
  pause: "M7 5h3.4v14H7zM13.6 5H17v14h-3.4z",
  star: "M12 2.6l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.5l-5.9 3.1 1.2-6.5L2.5 9.5l6.6-.9Z",
  crown: "M5.4 18.6h13.2M4.2 8.4l4 3.3L12 6.4l3.8 5.3 4-3.3-1.4 9.2H5.6Z",
  heart: "M12 20.7C6.4 16.9 3 13.6 3 9.9 3 7.2 5 5 7.5 5c1.7 0 3.4.9 4.5 2.4C13.1 5.9 14.8 5 16.5 5 19 5 21 7.2 21 9.9c0 3.7-3.4 7-9 10.8Z",
  home: "M12 3.2 2.8 11h2.7v9h5v-6h3v6h5v-9h2.7Z",
  cat: "M12 3.4c1.9 0 3 .7 3.7 1.5 1.2-.5 2.6-1.2 4-1.5-.2 1.7-.9 3.2-1.9 4.4.6 1.2 1 2.6 1 4.2a7.3 7.3 0 1 1-14.6 0c0-1.6.4-3 1-4.2C4.2 6.6 3.5 5.1 3.3 3.4c1.4.3 2.8 1 4 1.5.7-.8 1.8-1.5 3.7-1.5Z",
};

function Icon({ n, size = 22, className = "", tone = "default" }: { n: string; size?: number; className?: string; tone?: "default" | "accent" | "gold" }) {
  const glow = tone === "accent" ? "drop-shadow-[0_0_7px_rgba(244,63,94,.55)]" : tone === "gold" ? "drop-shadow-[0_0_7px_rgba(245,158,11,.5)]" : "";
  const f = FILLED[n];
  if (f) {
    const fill = tone === "accent" ? "url(#pg)" : tone === "gold" ? "url(#gg)" : "currentColor";
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} className={`${glow} ${className}`} aria-hidden="true">
        <path d={f} fillRule="evenodd" clipRule="evenodd" />
      </svg>
    );
  }
  const stroke = tone === "accent" ? "url(#pg)" : tone === "gold" ? "url(#gg)" : "currentColor";
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" className={`${glow} ${className}`} aria-hidden="true">
      <path d={P[n] ?? ""} />
    </svg>
  );
}

function GradientDefs() {
  return (
    <svg width="0" height="0" className="absolute" aria-hidden="true">
      <defs>
        <linearGradient id="pg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#fb7185" />
          <stop offset="100%" stopColor="#e11d48" />
        </linearGradient>
        <linearGradient id="gg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#fde68a" />
          <stop offset="100%" stopColor="#f59e0b" />
        </linearGradient>
        <linearGradient id="hg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ff8fab" />
          <stop offset="55%" stopColor="#f43f5e" />
          <stop offset="100%" stopColor="#be123c" />
        </linearGradient>
      </defs>
    </svg>
  );
}

function LogoHeart({ size = 21 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className="mx-0.5 shrink-0 drop-shadow-[0_2px_7px_rgba(244,63,94,.65)]" aria-hidden="true">
      <path d="M12 20.7C6.4 16.9 3 13.6 3 9.9 3 7.2 5 5 7.5 5c1.7 0 3.4.9 4.5 2.4C13.1 5.9 14.8 5 16.5 5 19 5 21 7.2 21 9.9c0 3.7-3.4 7-9 10.8Z" fill="url(#hg)" />
      <ellipse cx="8.4" cy="8.4" rx="2.7" ry="1.7" fill="#ffffff" opacity=".55" transform="rotate(-24 8.4 8.4)" />
    </svg>
  );
}

/* ---------------- SVG thumbnail art (no emoji) ---------------- */

const MOTIFS: Record<string, string[]> = {
  Travel: ["M4 19 10 8l4 6 3-4 3 9Z", "M17.5 5.5a2.5 2.5 0 1 0 0 .01Z", "M3 21h18"],
  Cooking: ["M4 15a8 6.5 0 0 1 16 0Z", "M2.5 18.5h19", "M12 8.5V6.8", "M10.5 5.2a1.6 1.6 0 1 1 3 0"],
  Fitness: ["M6.5 6.5v11M3.5 9v6M17.5 6.5v11M20.5 9v6M6.5 12h11"],
  Music: ["M9 18.5V6l10-2v11.5", "M6.5 18.5a2.8 2.5 0 1 0 0 .01ZM16.5 15.5a2.8 2.5 0 1 0 0 .01Z"],
  Documentary: ["M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z", "M3.5 9h17M3.5 15h17", "M9 3.5a13 13 0 0 1 0 17M15 3.5a13 13 0 0 0 0 17"],
  Gaming: ["M6 8h12a5 5 0 0 1 5 5c0 2.8-2.2 5-5 5-1.5 0-2.6-.6-3.6-1.7H9.6C8.6 17.4 7.5 18 6 18a5 5 0 0 1-5-5 5 5 0 0 1 5-5Z", "M7.5 11v4M5.5 13h4", "M16.5 11.5h.01M18.8 14h.01"],
  DIY: ["M14.5 5.5a4 4 0 0 1 5.3 5.3L9 21.6a2 2 0 0 1-2.8 0l-2.4-2.4a2 2 0 0 1 0-2.8L14.5 5.5Z", "M13 7l4 4"],
  Photography: ["M4 8h3l2-2.5h6L17 8h3a1.5 1.5 0 0 1 1.5 1.5V19A1.5 1.5 0 0 1 20 20.5H4A1.5 1.5 0 0 1 2.5 19V9.5A1.5 1.5 0 0 1 4 8Z", "M12 16.5a3.8 3.8 0 1 0 0-7.6 3.8 3.8 0 0 0 0 7.6Z"],
  Art: ["M12 3.5a8.5 8.5 0 1 0 0 17c1.4 0 2-.9 2-1.8 0-.8-.6-1.3-.6-2.1 0-.9.7-1.6 1.9-1.6H18a3.5 3.5 0 0 0 3.5-3.5C21.5 7 17.2 3.5 12 3.5Z", "M7.5 10.5h.01M10.5 7h.01M15.5 7.5h.01M8 15h.01"],
  Tech: ["M7 7h10v10H7z", "M10 2.5V7M14 2.5V7M10 17v4.5M14 17v4.5M2.5 10H7M2.5 14H7M17 10h4.5M17 14h4.5", "M10.5 10.5h3v3h-3z"],
  Gardening: ["M12 21v-8", "M12 13C12 9 9.5 6.5 5.5 6.5c0 4 2.5 6.5 6.5 6.5Z", "M12 11c0-3.5 2.2-5.7 6-5.7 0 3.8-2.2 6-6 5.7Z", "M5 21h14"],
  Comedy: ["M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z", "M8 14.5c1 1.6 2.4 2.4 4 2.4s3-.8 4-2.4", "M9 9.5h.01M15 9.5h.01"],
};
const MOTIF_FALLBACK = ["M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z", "M10 8.8v6.4L15.5 12Z"];

/* Per-tag glyphs: the scene is chosen by the video's own first tag first, so two
   videos in the same category rarely share a glyph. */
const TAG_GLYPHS: Record<string, string[]> = {
  "seasonal": ["M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z", "M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5 5l1.8 1.8M17.2 17.2 19 19M19 5l-1.8 1.8M6.8 17.2 5 19"],
  "zero waste": ["M12 3.5 15 8H9Z", "M15 8a6.5 6.5 0 0 1 1 7.5l2.2-1-1 3.4-3.6-1.4A6.5 6.5 0 0 1 8.5 15L6 16.5l.8-3.6 2.7 1.6A6.5 6.5 0 0 1 9 8"],
  "garden": ["M12 21v-8", "M12 13C12 9 9.5 6.5 5.5 6.5c0 4 2.5 6.5 6.5 6.5Z", "M12 11c0-3.5 2.2-5.7 6-5.7 0 3.8-2.2 6-6 5.7Z"],
  "makeover": ["m3.5 11 8.5-7 8.5 7", "M6 9.5V20h12V9.5", "M10.5 20v-5h3v5"],
  "budget": ["M12 20.5a8.5 8.5 0 1 0 0-17 8.5 8.5 0 0 0 0 17Z", "M12 6.5v11M15 8.6c-.6-.8-1.7-1.2-3-1.2-1.8 0-3 .9-3 2.2 0 2.9 6.1 1.5 6.1 4.4 0 1.3-1.3 2.2-3.1 2.2-1.3 0-2.5-.5-3.1-1.3"],
  "tutorial": ["M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.7A1.7 1.7 0 0 0 5 19.7Z", "M5 18.5V4.5", "M9 8h6M9 11.5h4"],
  "city guide": ["M5 21V8.5L12 4l7 4.5V21", "M9.5 21v-4h5v4", "M9 10.5h.01M15 10.5h.01M12 13.5h.01"],
  "walking tour": ["M13 3.5a1.8 1.8 0 1 0 0 .01Z", "m10 21 1.2-4.5L9 13l1-4.5 3.5 2L15 14", "m11.2 16.5-2 4.5M13.5 10.5l2.5-1 2 3"],
  "quick meals": ["M12 20.5a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z", "M12 7v5l3.5 2"],
  "baking": ["M4 20.5h16M5 20.5c0-4 3-6 7-6s7 2 7 6", "M12 14.5c0-3 1-5.5 4-7", "M8.5 8.5c1-1.8 4-2.2 5.5-.8"],
  "home workout": ["M6.5 6.5v11M3.5 9v6M17.5 6.5v11M20.5 9v6M6.5 12h11"],
  "strength": ["M7 8.5 4 12l3 3.5M17 8.5 20 12l-3 3.5", "M7 12h10", "m10 5-1.5 7L10 19M14 5l1.5 7L14 19"],
  "lofi": ["M4 15a8 8 0 0 1 16 0Z", "M2.5 18.5h19", "M9 8c0-2 6-2 6 0"],
  "jazz": ["M14 4.5v9.8a3.8 3.8 0 1 1-2-3.2V7L8.5 8.5V16a3.8 3.8 0 1 1-2-3.2V6.8Z"],
  "history": ["M4 21h16M5.5 21v-9M10 21v-9M14 21v-9M18.5 21v-9", "m3 12 9-7.5L21 12Z", "M5 8.8h14"],
  "explained": ["M12 20.5a8.5 8.5 0 1 0 0-17 8.5 8.5 0 0 0 0 17Z", "M9.5 9.2A2.6 2.6 0 1 1 12 12.5v1", "M12 16.8h.01"],
  "speedrun": ["M5 19.5a9 9 0 1 1 14 0", "M12 12l4.5-4.5", "M12 12h.01", "M9 3.5h6"],
  "live": ["M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z", "M8.2 8.2a5.5 5.5 0 0 0 0 7.6M15.8 8.2a5.5 5.5 0 0 1 0 7.6M5.6 5.6a9.4 9.4 0 0 0 0 12.8M18.4 5.6a9.4 9.4 0 0 1 0 12.8"],
  "woodwork": ["M4 20 14.5 9.5M14.5 9.5 20 4l-1 6.5L12.5 12", "m13 11-2.5 2.5L17 20l2.5-2.5Z"],
  "restoration": ["M14.5 5.5a4 4 0 0 1 5.3 5.3L9 21.6a2 2 0 0 1-2.8 0l-2.4-2.4a2 2 0 0 1 0-2.8L14.5 5.5Z", "M13 7l4 4"],
  "street": ["M4 20.5 9 10l4 6 3-4 4 8.5Z", "M17.5 5.5a2.5 2.5 0 1 0 0 .01Z"],
  "composition": ["M4 4h16v16H4z", "M9.5 4v16M4 9.5h16M4 15h5.5M14.5 15H20M14.5 9.5H20"],
  "digital art": ["M5 19.5 18.5 6a2 2 0 0 0-2.8-2.8L5 16.7Z", "m14 7 3 3", "M4 21.5c1-3.5 1.8-5 3.5-6.5L9 18c-1.5 1.7-3 2.5-5 3.5Z"],
  "portrait": ["M12 12.5a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z", "M5 20.5c.8-3.4 3.6-5 7-5s6.2 1.6 7 5"],
  "desk setup": ["M3.5 5h17v10h-17z", "M9.5 19.5h5M12 15v4.5", "M7 18.8h10"],
  "tech": ["M7 7h10v10H7z", "M10 2.5V7M14 2.5V7M10 17v4.5M14 17v4.5M2.5 10H7M2.5 14H7M17 10h4.5M17 14h4.5"],
  "comedy": ["M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z", "M8 14.5c1 1.6 2.4 2.4 4 2.4s3-.8 4-2.4", "M9 9.5h.01M15 9.5h.01"],
  "sketch": ["M4.5 6.5h15M4.5 12h15M4.5 17.5h9", "M18.5 15.5 21 18l-2.5 2.5L16 18Z"],
  "documentary": ["M4 5.5h16v13H4z", "M4 9.5h16M8 5.5v13M16 5.5v13"],
  "nature": ["M6 20.5c0-8 5-13.5 13-14.5C18 14.5 13.5 20 6 20.5Z", "M6 20.5C8 15 11.5 11 16 8.5"],
  "science": ["M10 3h4M11 3v6L5.8 18a2 2 0 0 0 1.8 3h8.8a2 2 0 0 0 1.8-3L13 9V3", "M8 15h8"],
  "4k": ["M7 15.5v-7L4 15.5h3Zm0 0h3.5M14 8.5v7m0-3.5 3.5-3.5M14 12l4 3.5"],
  "asmr": ["M4 10v4h3l5 4.5v-13L7 10H4Z", "M15.5 9.5a4 4 0 0 1 0 5M18 7a8 8 0 0 1 0 10"],
  "beginner": ["M12 21v-9", "M12 12C12 8.8 9.8 6.5 6 6.5c0 3.8 2.2 6 6 5.5Z", "M12 10.5c0-3 1.8-4.8 5-4.8 0 3.2-1.8 5-5 4.8Z", "M6 21h12"],
  "vlog": ["M3.5 8.5A1.5 1.5 0 0 1 5 7h9a1.5 1.5 0 0 1 1.5 1.5v7A1.5 1.5 0 0 1 14 17H5a1.5 1.5 0 0 1-1.5-1.5Z", "m15.5 10.5 5-2.5v8l-5-2.5"],
  "workout": ["M12 20.5a8.5 8.5 0 1 0 0-17 8.5 8.5 0 0 0 0 17Z", "m8.5 12.5 2.5 2.5 4.5-5.5"],
  "gaming": ["M6 8h12a5 5 0 0 1 5 5c0 2.8-2.2 5-5 5-1.5 0-2.6-.6-3.6-1.7H9.6C8.6 17.4 7.5 18 6 18a5 5 0 0 1-5-5 5 5 0 0 1 5-5Z", "M7.5 11v4M5.5 13h4"],
  "yoga": ["M12 5.5a1.9 1.9 0 1 0 0 .01Z", "M12 9.5c-1 2.5-3 4-5.5 4.5 2 1.5 4 2 5.5 2s3.5-.5 5.5-2C15 13.5 13 12 12 9.5Z", "M5 20.5c2.5-1.5 4.5-2 7-2s4.5.5 7 2"],
  "timelapse": ["M12 20.5a8.5 8.5 0 1 0 0-17 8.5 8.5 0 0 0 0 17Z", "M12 6.5V12l4 2.5", "M18.5 3.5 21 6l-2.5 2.5"],
  "photography": ["M4 8h3l2-2.5h6L17 8h3a1.5 1.5 0 0 1 1.5 1.5V19A1.5 1.5 0 0 1 20 20.5H4A1.5 1.5 0 0 1 2.5 19V9.5A1.5 1.5 0 0 1 4 8Z", "M12 16.5a3.8 3.8 0 1 0 0-7.6 3.8 3.8 0 0 0 0 7.6Z"],
};

function Motif({ v, big }: { v: Video; big?: boolean }) {
  const paths = TAG_GLYPHS[v.tags[0] ?? ""] ?? MOTIFS[v.category] ?? MOTIF_FALLBACK;
  const seed = v.id.split("").reduce((a, c) => a * 31 + c.charCodeAt(0), 7);
  const cx = 18 + (seed % 60);
  const cy = 14 + (seed % 30);
  /* Per-video variant: rotation, scale, position, stroke and backdrop shapes all
     derive from the video id, so no two cards share the same scene. */
  const rot = (seed % 25) - 12;
  const sw = 1.45 + ((seed >> 9) % 50) / 100;
  const ridge = 34 + (seed % 14);
  const dots = [0, 1, 2, 3].map((i) => ({ x: 8 + ((seed >> (i * 3)) % 84), y: 6 + ((seed >> (i * 4 + 1)) % 12), r: 0.7 + ((seed >> i) % 10) / 12 }));
  /* Three distinct scene layouts rotate per video: centred emblem, left emblem
     with a backdrop ring, or flipped right emblem over diagonal rays. */
  const variant = seed % 3;
  const layout = variant === 0
    ? { dx: 38, dy: 16.1, scale: 1, flip: 1 }
    : variant === 1
      ? { dx: 10, dy: 13.5, scale: 1.3, flip: 1 }
      : { dx: 54, dy: 18.5, scale: 0.92, flip: -1 };
  return (
    <svg viewBox="0 0 100 56.25" className="absolute inset-0 h-full w-full" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <circle cx={cx} cy={cy} r={big ? 17 : 15} fill="#ffffff" opacity="0.10" />
      <circle cx={100 - cx * 0.7} cy={50 - cy * 0.5} r={big ? 10 : 8} fill="#000000" opacity="0.14" />
      {variant === 1 && <circle cx={76} cy={26} r={15} fill="none" stroke="#ffffff" strokeWidth="1.4" opacity="0.30" />}
      {variant === 2 && <g stroke="#ffffff" strokeWidth="1.1" opacity="0.22"><path d="M6 50 30 6" /><path d="M18 52 40 8" /><path d="M30 54 50 12" /></g>}
      {variant === 0 && <rect x={6} y={7} width={88} height={42} rx={5} fill="none" stroke="#ffffff" strokeWidth="1" opacity="0.16" />}
      {dots.map((d, i) => <circle key={i} cx={d.x} cy={d.y} r={d.r} fill="#ffffff" opacity="0.35" />)}
      <g transform={`translate(${layout.dx} ${layout.dy}) rotate(${rot} 12 12) scale(${layout.flip * layout.scale} ${layout.scale})`} fill="none" stroke="#ffffff" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" opacity="0.92">
        {paths.map((d, i) => <path key={i} d={d} />)}
      </g>
      <path d={`M0 56.25 30 ${ridge}l22 10 20-12 28 12v8.25Z`} fill="#000000" opacity="0.18" />
    </svg>
  );
}

function Thumb({ v, rank, wide, badge }: { v: Video; rank?: number; wide?: boolean; badge?: string }) {
  /* Until the photo arrives, the tile's placeholder is ONLY a plain
     white background with the site logo centered on it — no tile art,
     no gradient, no motif behind the name (the owner asked for the
     pre-load image/art to be removed entirely). The photo fades in
     over it once loaded; a video with no photo, or one whose photo
     fails, keeps the white placeholder with the logo. */
  const [imgState, setImgState] = useState<"loading" | "ok" | "err">("loading");
  useEffect(() => { setImgState("loading"); }, [v.id, v.thumbnailUrl]);
  return (
    <div className={`relative shrink-0 overflow-hidden rounded-xl [container-type:inline-size] ${wide ? "w-[84vw] max-w-[460px] sm:w-[430px]" : "w-full"}`} style={{ aspectRatio: "16/9", background: "#ffffff" }}>
      {imgState !== "ok" && (
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center px-1" aria-hidden="true">
          <span className="font-display thumb-name flex items-center justify-center font-black tracking-tight">
            <span className="text-[var(--accent)]">PULSE</span>
            <LogoHeart size={15} />
            <span className="text-black">VIDEO</span>
          </span>
        </span>
      )}
      {v.thumbnailUrl && imgState !== "err" && (isVideoFileUrl(v.thumbnailUrl) ? (
        /* The "thumbnail" is itself a video file (e.g. an XNXX
           preview.mp4): play it as a muted looping preview — an <img>
           would error and leave the placeholder up forever. */
        <video src={v.thumbnailUrl} muted loop autoPlay playsInline preload="metadata" onLoadedData={() => setImgState("ok")} onError={() => setImgState("err")} className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ${imgState === "ok" ? "opacity-100" : "opacity-0"}`} aria-hidden="true" />
      ) : (
        <img src={v.thumbnailUrl} alt="" loading="lazy" onLoad={() => setImgState("ok")} onError={() => setImgState("err")} className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ${imgState === "ok" ? "opacity-100" : "opacity-0"}`} />
      ))}
      {rank != null && <span className="font-display absolute left-2 top-1 text-[42px] font-black leading-none text-[var(--accent)] drop-shadow-[0_2px_6px_rgba(0,0,0,.6)]">{rank}</span>}
      {badge && <span className="absolute left-2 top-2 rounded-md bg-[var(--accent)] px-2 py-0.5 text-[11px] font-black tracking-wide text-white shadow">{badge}</span>}
      {v.hd && <span className="absolute right-2 top-2 rounded-md bg-amber-400 px-2 py-0.5 text-[11px] font-black tracking-wide text-black shadow-md ring-1 ring-black/10">4K</span>}
      {v.duration && <span className="absolute bottom-2 right-2 rounded-full bg-white/95 px-2 py-0.5 text-xs font-bold text-black shadow-md ring-1 ring-black/10">{v.duration}</span>}
    </div>
  );
}

function VideoCard({ v, onOpen, wide, rank, badge, hideMeta }: { v: Video; onOpen: (v: Video) => void; wide?: boolean; rank?: number; badge?: string; hideMeta?: boolean }) {
  const cardBadge = badge ?? (v.featured ? "FEATURED" : v.badgeNew ? "NEW" : undefined);
  const meta = [v.hasViews ? `${fmtViews(v.views)} views` : null, v.hasDate ? v.age : null, v.hasRating ? `${v.rating}% liked` : null].filter(Boolean).join(" · ");
  return (
    <button type="button" onClick={() => onOpen(v)} className="group block w-full text-left transition duration-150 active:scale-[0.97] active:opacity-75" aria-label={`Watch: ${v.title}`}>
      <Thumb v={v} rank={rank} wide={wide} badge={cardBadge} />
      <span className={`mt-2 line-clamp-2 block text-[13px] font-semibold leading-[1.35] text-white sm:text-sm ${wide ? "w-[84vw] max-w-[460px] sm:w-[430px]" : ""}`}>{v.title}</span>
      {!hideMeta && meta && <span className={`mt-0.5 block text-xs text-[var(--dim)] sm:text-[13px] ${wide ? "w-[84vw] max-w-[460px] sm:w-[430px]" : ""}`}>{meta}</span>}
    </button>
  );
}

/* Fullscreen that also works inside app frames. The site is shown
   inside the Muse app's frame, and a frame that does not grant the
   fullscreen permission makes every requestFullscreen() call reject —
   the button then looks dead and the video never gets big (the native
   controls' own fullscreen button is greyed out by the same policy,
   which is what the owner kept reporting). So the toggle walks a
   ladder: standard requestFullscreen on the player box, the
   webkit-prefixed variant, the iPhone video element's own fullscreen,
   and finally an in-page expanded mode — the box fixed over the whole
   app viewport, which needs no permission and always makes the video
   fill the screen the app gives it. The same button (then showing the
   compress icon) or Esc leaves either mode. Fullscreen shows ONLY the
   player box (the video and its control bar) — the box is the
   fullscreen element, so the title, tags, suggestions and every other
   page element stay out of it. Entering also tries to lock the screen
   to landscape (see lockLandscape); where that is unavailable and the
   expanded mode is what ran, a portrait viewport gets the box rotated
   90° instead (`rotated`), so the video still plays landscape. */
type FsBoxEl = HTMLDivElement & { webkitRequestFullscreen?: () => void | Promise<void> };
type FsVideoEl = HTMLVideoElement & { webkitEnterFullscreen?: () => void };
type FsDoc = Document & { webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => void };
type FsRequester = (this: HTMLElement) => Promise<void> | undefined;
type FsOrientation = { lock?: (orientation: string) => Promise<void> | undefined; unlock?: () => void };

/* Auto-rotate on fullscreen (owner's rule, 2026-11-26): entering
   fullscreen tries to lock the screen to landscape, so the video plays
   sideways even while the phone is held portrait. The lock API only
   exists on some browsers (Android Chrome with a fullscreen element
   and a user gesture) and rejects everywhere else — iOS Safari has no
   lock at all — so every failure is swallowed and the in-page expanded
   mode below covers the rest by rotating the player box itself when
   the viewport is portrait. Leaving fullscreen unlocks again. */
function lockLandscape() {
  try {
    const so = (window.screen?.orientation ?? null) as unknown as FsOrientation | null;
    if (so && typeof so.lock === "function") {
      const p = so.lock("landscape");
      if (p && typeof p.catch === "function") p.catch(() => { /* lock not permitted on this device/browser */ });
    }
  } catch { /* orientation lock unavailable here */ }
}
function unlockOrientation() {
  try {
    const so = (window.screen?.orientation ?? null) as unknown as FsOrientation | null;
    if (so && typeof so.unlock === "function") so.unlock();
  } catch { /* nothing was locked */ }
}

function fsActiveElement(): Element | null {
  const doc = document as FsDoc;
  return document.fullscreenElement ?? doc.webkitFullscreenElement ?? null;
}

function usePlayerFullscreen(boxRef: RefObject<HTMLDivElement | null>, videoRef?: RefObject<HTMLVideoElement | null>) {
  const [nativeFs, setNativeFs] = useState(false);
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    const onChange = () => {
      const active = fsActiveElement();
      setNativeFs(active === boxRef.current);
      /* Entering this box's fullscreen: try to swing the screen to
         landscape. Leaving fullscreen entirely: release the lock so
         the phone goes back to following how it is held. */
      if (active === boxRef.current) lockLandscape();
      else if (!active) unlockOrientation();
    };
    document.addEventListener("fullscreenchange", onChange);
    document.addEventListener("webkitfullscreenchange", onChange);
    return () => {
      document.removeEventListener("fullscreenchange", onChange);
      document.removeEventListener("webkitfullscreenchange", onChange);
    };
  }, [boxRef]);
  useEffect(() => {
    if (!expanded) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setExpanded(false); };
    document.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = prevOverflow; document.removeEventListener("keydown", onKey); };
  }, [expanded]);
  /* In-page expanded mode cannot ask the device to rotate, so when
     the viewport is portrait the box itself is rotated 90° instead
     (the caller applies the transform from `rotated`): the video
     still ends up landscape, filling the screen the app gives it.
     Turning the phone sideways flips this off and the plain
     full-viewport box takes over. */
  const [portrait, setPortrait] = useState(false);
  useEffect(() => {
    if (!expanded) { setPortrait(false); return; }
    const update = () => setPortrait(window.innerHeight > window.innerWidth);
    update();
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    return () => { window.removeEventListener("resize", update); window.removeEventListener("orientationchange", update); };
  }, [expanded]);
  const rotated = expanded && portrait;
  const big = nativeFs || expanded;
  const toggle = async () => {
    if (nativeFs || fsActiveElement()) {
      const doc = document as FsDoc;
      const exit = (document.exitFullscreen ?? doc.webkitExitFullscreen) as ((this: Document) => Promise<void> | undefined) | undefined;
      if (typeof exit === "function") {
        try {
          const p = exit.call(document);
          if (p && typeof p.catch === "function") await p;
        } catch { /* already out of fullscreen */ }
      }
      setNativeFs(false);
      unlockOrientation();
      return;
    }
    if (expanded) { setExpanded(false); return; }
    const box = boxRef.current as FsBoxEl | null;
    if (box) {
      const req = (box.requestFullscreen ?? box.webkitRequestFullscreen) as FsRequester | undefined;
      if (typeof req === "function") {
        try {
          const p = req.call(box);
          if (p && typeof p.catch === "function") await p;
        } catch { /* permission denied by the app frame — fall through */ }
        if (fsActiveElement() === box) { lockLandscape(); return; }
        /* Older webkit builds report fullscreen a beat late. */
        await new Promise((r) => setTimeout(r, 80));
        if (fsActiveElement() === box) { lockLandscape(); return; }
      }
    }
    const vid = videoRef?.current as FsVideoEl | null | undefined;
    if (vid && typeof vid.webkitEnterFullscreen === "function") {
      try { vid.webkitEnterFullscreen(); return; } catch { /* fall through to expanded mode */ }
    }
    setExpanded(true);
  };
  return { big, expanded, rotated, toggle: () => { void toggle(); }, collapse: () => setExpanded(false) };
}

/* Rotating loading spinner shown over the player until playback
   actually starts, and again whenever the video stalls to buffer.
   Pointer-events are off so taps still reach the video / play button
   underneath. */
function PlayerSpinner({ label = "Loading video" }: { label?: string }) {
  return (
    <span className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center" role="status" aria-label={label}>
      <svg className="pv-spinner" width="52" height="52" viewBox="0 0 50 50" fill="none" aria-hidden="true">
        <circle cx="25" cy="25" r="20" stroke="rgba(255,255,255,.25)" strokeWidth="5" />
        <path d="M45 25a20 20 0 0 0-20-20" stroke="#f43f5e" strokeWidth="5" strokeLinecap="round" />
      </svg>
    </span>
  );
}

/* Real 16:9 player for admin-added videos that carry an embed source.
   Catalog videos (no embed) keep the SVG-art player.
   Playback note: freepornvideo.sex (a KVS player) only serves its video
   file to a request carrying the session cookies the embed page set —
   verified directly: the same signed file URL returns 403 without those
   cookies and 302 with them, and the 302 target (a storage URL) then
   plays from any client with no cookies at all. Browsers and app webviews
   that block third-party cookies inside cross-site iframes therefore load
   the embed's player shell but never the video. So for that host the
   resolveEmbedFile action fetches the embed page server-side, follows the
   one gated hop, and hands back the storage URLs, which play here in a
   native <video> player.
   Speed: the embed's main file is the full-quality original (measured at
   260 MB – 3.7 GB per video on the owner's catalog), so playback starts
   on the embed's fast alt stream (480p, ~4–20x smaller).
   Resolutions (owner's rule, 2026-11-26): the quality menu — the gear
   on the player and the pills under it — lists EVERY stream the
   source offers for the video, under the source's own labels, and
   nothing it does not offer. freepornvideo publishes exactly two
   files (480p alt + the "Original" main). XNXX publishes two MP4s
   (240p/360p on the owner's video) plus an HLS master playlist
   (setVideoHLS) whose variants run to 1080p; the resolver merges
   both into one ascending list (MP4 wins at a shared height) and the
   playlist streams play through hls.js where the browser has no
   native HLS. Switching streams keeps the viewer's place.
   Stability: the playing URL is PINNED in state — every like/save/history
   save invalidates all queries server-side, and each fresh resolve mints
   a new signed URL; feeding that straight into <video src> restarted
   playback from zero mid-watch. A refetch may only replace the pinned
   URL after the viewer switches quality or the pinned file errors (a
   signed URL can expire mid-watch): then the player re-resolves once,
   resumes at the same position, and only after a second failure falls
   back to the source iframe — sandboxed without top-navigation or
   popups, so the embed's ad scripts cannot throw the viewer off the
   page. Under the iframe a bar opens the same embed in a new tab
   (first-party there, so its cookies work).
   XNXX embeds (added 2026-11-26, after the owner hit its "Blocked
   content. Contact the site owner to fix" refusal on a newly added
   video): that host's player blocks playback inside third-party frames
   outright, but its embed page names the direct MP4 files
   (setVideoUrlLow / setVideoUrlHigh), which answer 206 video/mp4 to a
   cookie-less request — so resolveEmbedFile resolves XNXX embeds the
   same way and they play in this same native player, starting on the
   low file, with every published resolution in the quality menu. */
function EmbedPlayer({ v }: { v: Video }) {
  const emb = v.embedUrl ? resolveEmbed(v.embedUrl) : null;
  /* Embeds the resolveEmbedFile action can turn into direct files:
     freepornvideo (/embed/<id>) and XNXX (/embedframe/<id>). XNXX's own
     player refuses playback inside third-party frames ("Blocked
     content. Contact the site owner to fix"), so its videos must go
     through the same server-side resolution as the gated KVS embeds —
     the iframe below is only the fallback when resolution fails. */
  const isGatedIframe = !!emb && emb.kind === "iframe" && (() => { try { const u = new URL(emb.src); return /(^|\.)freepornvideo\.sex$/i.test(u.hostname) || (/(^|\.)xnxx\.com$/i.test(u.hostname) && u.pathname.startsWith("/embedframe/")); } catch { return false; } })();
  const queryClient = useQueryClient();
  const [loaded, setLoaded] = useState(false);
  const [fileFailed, setFileFailed] = useState(false);
  /* The stream the viewer picked, by LABEL: the quality menu offers
     every stream the source actually has (see resolveEmbedFile), and
     labels stay stable across re-resolves while the signed URLs
     behind them rotate. null = the source's default (fast) stream. */
  const [selLabel, setSelLabel] = useState<string | null>(null);
  const [pinned, setPinned] = useState<{ url: string; label: string; hls: boolean; nonce: number } | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);
  const [retries, setRetries] = useState(0);
  /* Custom control-bar state for the native player. The video element
     no longer uses the browser's built-in controls: their fullscreen
     button (bottom-right of the bar, next to the volume icon — the one
     the owner circled in his screenshot) is greyed out by the app
     frame's fullscreen policy and cannot be wired to anything. Our own
     bar puts a working fullscreen button in that exact spot instead. */
  const [playing, setPlaying] = useState(false);
  const [curTime, setCurTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(80);
  /* Loading spinner state: `waiting` tracks the video element's own
     buffering (waiting/playing events); `started` keeps the spinner
     off the untouched poster + play button — it appears once playback
     has been asked for, stays until frames actually play, and returns
     whenever playback stalls mid-watch. */
  const [started, setStarted] = useState(false);
  const [waiting, setWaiting] = useState(true);
  /* On-screen quality settings menu (gear in the control bar). It
     drives the same selected-stream state as the quality pills under
     the player, so both controls always agree. */
  const [qMenuOpen, setQMenuOpen] = useState(false);
  /* HLS streams (the extra resolutions some sources publish as
     playlists) play natively in Safari; everywhere else the hls.js
     attach effect below drives the same <video> element. The
     playlists and their segments are served with
     Access-Control-Allow-Origin: * (verified against the live CDN),
     so no proxy is needed. */
  const nativeHls = useMemo(() => { try { return document.createElement("video").canPlayType("application/vnd.apple.mpegurl") !== ""; } catch { return false; } }, []);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const resumeRef = useRef<{ t: number; playing: boolean } | null>(null);
  useEffect(() => {
    setLoaded(false); setFileFailed(false); setSelLabel(null);
    setPinned(null); setRetryNonce(0); setRetries(0); resumeRef.current = null;
    setPlaying(false); setCurTime(0); setDuration(0);
    setStarted(false); setWaiting(true); setQMenuOpen(false);
  }, [v.id]);
  useEffect(() => {
    const el = videoRef.current;
    if (el) { el.volume = volume / 100; el.muted = muted; }
  }, [volume, muted]);
  /* Fullscreen is ours, not the embed's — see usePlayerFullscreen:
     the control-bar button grows the player box itself (real fullscreen
     where the app frame allows it, in-page expanded mode where it does
     not). There is deliberately no floating overlay button: the
     control bar's button is the only fullscreen control. */
  const boxRef = useRef<HTMLDivElement | null>(null);
  const { big: isFs, expanded, rotated, toggle: toggleFullscreen } = usePlayerFullscreen(boxRef, videoRef);
  const fileQ = useQuery({
    queryKey: ["embedFile", v.id],
    queryFn: () => api.resolveEmbedFile({ embedUrl: emb ? emb.src : "" }),
    enabled: isGatedIframe,
    staleTime: 5 * 60_000,
    retry: false,
  });
  /* Pin the stream the viewer actually watches. A background refetch
     (likes, saves and history all invalidate every query) returns a
     freshly signed URL for the same file — swapping it in would restart
     playback, so a new URL is adopted only for a quality switch or for
     the one retry after the pinned file errored. */
  useEffect(() => {
    if (!isGatedIframe || fileFailed) return;
    const d = fileQ.data;
    if (!d) return;
    const list = d.streams.length > 0 ? d.streams : d.fileUrl ? [{ url: d.fileUrl, label: d.fastLabel ?? "Video", hls: false }] : [];
    if (list.length === 0) return;
    const chosen = list.find((s) => s.label === selLabel) ?? list.find((s) => s.url === d.fileUrl) ?? list[0];
    if (!chosen) return;
    if (!pinned || pinned.label !== chosen.label || (pinned.nonce !== retryNonce && chosen.url !== pinned.url)) {
      const el = videoRef.current;
      if (el && pinned) resumeRef.current = { t: el.currentTime || 0, playing: !el.paused };
      setPinned({ url: chosen.url, label: chosen.label, hls: chosen.hls, nonce: retryNonce });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileQ.data, selLabel, retryNonce, fileFailed, isGatedIframe]);
  if (!emb) return null;
  /* A video-file "thumbnail" (XNXX preview.mp4) is not a usable poster
     or <img> — browsers reject it as a poster and error it as an image.
     The native player's own first frame covers that case instead. */
  const posterUrl = v.thumbnailUrl && !isVideoFileUrl(v.thumbnailUrl) ? v.thumbnailUrl : undefined;
  const nativeSrc = emb.kind === "file" ? emb.src : !fileFailed && pinned ? pinned.url : null;
  const resolving = isGatedIframe && !nativeSrc && !fileFailed && fileQ.isPending && fileQ.fetchStatus !== "idle";
  /* Every stream the source offers for this video, lowest first.
     The gear menu and the pills under the player list exactly these
     — a resolution the source does not publish never appears. */
  const streams = isGatedIframe ? (fileQ.data?.streams ?? []) : [];
  const multiStream = streams.length > 1;
  const activeLabel = pinned?.label ?? null;
  /* With hls.js driving the element, the .m3u8 URL must NOT sit in
     the src attribute (the browser would fail it as a media file) —
     the attach effect below owns the element instead. */
  const useHlsJs = !!pinned?.hls && !nativeHls;
  const onVideoError = () => {
    if (emb.kind === "file" || !isGatedIframe) return;
    if (retries >= 1) { setFileFailed(true); return; }
    /* The signed storage URL most likely expired — re-resolve once and
       resume where the viewer was instead of dumping them into the
       iframe (or worse, restarting the video from the beginning). */
    const el = videoRef.current;
    if (el) resumeRef.current = { t: el.currentTime || 0, playing: !el.paused };
    setRetries(1);
    setRetryNonce((n) => n + 1);
    void queryClient.invalidateQueries({ queryKey: ["embedFile", v.id] });
  };
  /* Attach hls.js whenever the pinned stream is a playlist and the
     browser cannot play HLS itself. A fatal network error retries
     the load once in place; anything else fatal takes the player's
     normal path (one re-resolve, then the iframe fallback). */
  useEffect(() => {
    const el = videoRef.current;
    if (!el || !pinned || !pinned.hls || nativeHls) return;
    let hls: import("hls.js").default | null = null;
    let cancelled = false;
    void import("hls.js").then((mod) => {
      if (cancelled || !videoRef.current) return;
      const Hls = mod.default;
      if (!Hls.isSupported()) { onVideoError(); return; }
      hls = new Hls();
      hls.loadSource(pinned.url);
      hls.attachMedia(videoRef.current);
      hls.on(Hls.Events.ERROR, (_evt, data) => {
        if (!data.fatal) return;
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) { hls?.startLoad(); return; }
        onVideoError();
      });
    }).catch(() => { /* hls.js failed to load — element error path still applies */ });
    return () => { cancelled = true; if (hls) hls.destroy(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pinned?.url, pinned?.hls, nativeHls]);
  const onLoadedMetadata = () => {
    const el = videoRef.current;
    if (!el) return;
    el.volume = volume / 100; el.muted = muted;
    if (Number.isFinite(el.duration) && el.duration > 0) setDuration(el.duration);
    setCurTime(el.currentTime || 0);
    const r = resumeRef.current;
    if (!r) { setPlaying(!el.paused); return; }
    resumeRef.current = null;
    if (r.t > 0) { try { el.currentTime = r.t; } catch { /* position not seekable yet */ } }
    if (r.playing) void el.play().catch(() => { /* autoplay policy — viewer taps play */ });
    else setPlaying(false);
  };
  const togglePlay = () => {
    const el = videoRef.current;
    if (!el) return;
    setQMenuOpen(false);
    if (el.paused || el.ended) { setStarted(true); void el.play().catch(() => { /* autoplay policy — viewer taps again */ }); }
    else el.pause();
  };
  const seekTo = (clientX: number, bar: HTMLElement) => {
    const el = videoRef.current;
    if (!el || !(duration > 0)) return;
    const r = bar.getBoundingClientRect();
    const t = Math.min(1, Math.max(0, (clientX - r.left) / r.width)) * duration;
    try { el.currentTime = t; } catch { /* position not seekable yet */ }
    setCurTime(t);
  };
  const progressPct = duration > 0 ? Math.min(100, Math.max(0, (curTime / duration) * 100)) : 0;
  /* The spinner means "playback was asked for and frames are not
     moving yet" — never "paused". It used to be `waiting && started`
     with the center button suppressed while it showed: pausing during
     a stall left `waiting` set, so the big center button never came
     back and tapping it could not resume (the owner's report). Now a
     pause clears `waiting`, the spinner requires the element to be in
     a playing state, and the center button renders whenever the video
     is paused, above the spinner — one tap on it (or on the video, or
     on the control bar's play button) calls play() on the element and
     playback continues from the same position. */
  const showSpinner = waiting && started && playing;
  return (
    <>
      <div ref={boxRef} className={`pv-darkzone pv-fs relative overflow-hidden bg-black ${expanded ? "fixed inset-0 z-[85] m-0 h-[100dvh] w-full" : "-mx-4 mt-3 sm:mx-0 sm:rounded-xl"}`} style={expanded ? (rotated ? { width: "100dvh", height: "100dvw", left: "50%", top: "50%", transform: "translate(-50%, -50%) rotate(90deg)" } : undefined) : { aspectRatio: "16/9" }}>
        {nativeSrc ? (
          <>
            <video key={nativeSrc} ref={videoRef} src={useHlsJs ? undefined : nativeSrc} playsInline preload="auto" poster={posterUrl} onClick={togglePlay} onPlay={() => { setPlaying(true); setStarted(true); }} onPause={() => { setPlaying(false); setWaiting(false); }} onEnded={() => { setPlaying(false); setWaiting(false); }} onWaiting={() => setWaiting(true)} onPlaying={() => { setPlaying(true); setWaiting(false); }} onCanPlay={() => { const el = videoRef.current; if (el && !el.paused) setWaiting(false); }} onTimeUpdate={() => { const el = videoRef.current; if (el) setCurTime(el.currentTime || 0); }} onDurationChange={() => { const el = videoRef.current; if (el && Number.isFinite(el.duration) && el.duration > 0) setDuration(el.duration); }} onError={onVideoError} onLoadedMetadata={onLoadedMetadata} className="absolute inset-0 h-full w-full" aria-label={v.title} />
            {showSpinner && <PlayerSpinner />}
            {!playing && (
              <button type="button" aria-label={curTime > 0 ? "Resume video" : "Play video"} onClick={togglePlay} className="absolute left-1/2 top-1/2 z-30 flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white/95 text-black shadow-lg ring-1 ring-black/10 transition active:scale-90">
                <Icon n="play" size={28} />
              </button>
            )}
            {/* The site's own control bar. Its fullscreen button sits at
                the bar's right end, next to the volume control — exactly
                where the browser's (policy-greyed) button used to be —
                and is the player's only fullscreen control. */}
            <div className="absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/85 to-transparent px-3 pb-2 pt-8 text-white">
              <div className="flex items-center gap-3 [&_button]:transition [&_button]:active:scale-90">
                <button type="button" aria-label={playing ? "Pause" : "Play"} onClick={togglePlay} className="p-1"><Icon n={playing ? "pause" : "play"} size={20} /></button>
                <span className="text-sm font-medium tabular-nums">{fmtDur(Math.floor(curTime))} / {fmtDur(Math.floor(duration))}</span>
                <span className="ml-auto flex items-center gap-1">
                  <button type="button" aria-label={muted ? "Unmute" : "Mute"} onClick={() => setMuted(!muted)} className="p-1.5"><Icon n={muted || volume === 0 ? "mute" : "volume"} size={20} /></button>
                  <input aria-label="Volume" type="range" min={0} max={100} value={muted ? 0 : volume} onChange={(e) => { setVolume(Number(e.target.value)); setMuted(false); }} className="hidden w-16 accent-[#f43f5e] sm:block" />
                  {/* Quality settings, on the video screen itself: the
                      gear opens a small menu over the player listing
                      every stream the source offers for this video;
                      picking one flips the same state as the pills
                      under the player, and the switch keeps the
                      viewer's place (see the pinned-stream effect). */}
                  {multiStream && (
                    <span className="relative">
                      <button type="button" aria-label="Quality settings" aria-haspopup="menu" aria-expanded={qMenuOpen} onClick={() => setQMenuOpen((o) => !o)} className="p-1.5"><Icon n="settings" size={20} /></button>
                      {qMenuOpen && (
                        <span role="menu" aria-label="Playback quality" className="absolute bottom-full right-0 z-20 mb-2 block w-48 overflow-hidden rounded-xl bg-[#17171c] py-1 text-left shadow-xl ring-1 ring-white/15">
                          <span className="block px-3 pb-1 pt-2 text-[11px] font-bold uppercase tracking-wider text-zinc-400">Quality</span>
                          {streams.map((s) => (
                            <button key={s.label} type="button" role="menuitemradio" aria-checked={activeLabel === s.label} onClick={() => { setSelLabel(s.label); setQMenuOpen(false); }} className="flex w-full items-center gap-2 px-3 py-2 text-sm font-semibold transition hover:bg-white/10">
                              <span className="flex w-4 shrink-0 justify-center">{activeLabel === s.label && <Icon n="check" size={15} />}</span>{s.label}
                            </button>
                          ))}
                        </span>
                      )}
                    </span>
                  )}
                  <button type="button" aria-label={isFs ? "Exit fullscreen" : "Fullscreen"} aria-pressed={isFs} onClick={toggleFullscreen} className="p-1.5"><Icon n={isFs ? "compress" : "expand"} size={20} /></button>
                </span>
              </div>
              <button type="button" aria-label="Seek" onClick={(e) => seekTo(e.clientX, e.currentTarget)} className="mt-1 block h-4 w-full">
                <span className="relative block h-1 w-full rounded bg-white/30">
                  <span className="block h-1 rounded bg-[var(--accent)]" style={{ width: `${progressPct}%` }} />
                  <span className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow" style={{ left: `${progressPct}%` }} aria-hidden="true" />
                </span>
              </button>
            </div>
          </>
        ) : resolving ? (
          <>
            {posterUrl && <img src={posterUrl} alt="" className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-50" />}
            <PlayerSpinner />
          </>
        ) : (
          <>
            {/* The pre-load poster is decoration only: it must never
                take clicks meant for the embed's own play/pause
                buttons inside the iframe (it covers the whole frame
                until the iframe reports loaded, and a missed load
                event would otherwise leave every tap dead). */}
            {!loaded && posterUrl && <img src={posterUrl} alt="" className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-50" />}
            {!loaded && <PlayerSpinner />}
            <iframe src={emb.src} title={v.title} onLoad={() => setLoaded(true)} className="absolute inset-0 h-full w-full" allow="accelerometer; autoplay; encrypted-media; fullscreen; picture-in-picture" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" {...(isGatedIframe ? { sandbox: "allow-scripts allow-same-origin allow-presentation" } : {})} />
            {/* Same treatment as the native player: no floating button —
                a bottom control bar whose only control is the fullscreen
                toggle at its right end (the embed's own play/volume
                controls stay inside the iframe). The bar itself lets
                clicks through to the iframe; only the button takes them. */}
            <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex items-center justify-end bg-gradient-to-t from-black/85 to-transparent px-3 pb-2 pt-8 text-white">
              <button type="button" aria-label={isFs ? "Exit fullscreen" : "Fullscreen"} aria-pressed={isFs} onClick={toggleFullscreen} className="pointer-events-auto p-1.5 transition active:scale-90"><Icon n={isFs ? "compress" : "expand"} size={20} /></button>
            </div>
          </>
        )}
      </div>
      {nativeSrc && multiStream && (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-[13px] text-[var(--dim)]" role="group" aria-label="Playback quality">
          <span>Quality:</span>
          {streams.map((s) => (
            <button key={s.label} type="button" aria-pressed={activeLabel === s.label} onClick={() => setSelLabel(s.label)} className={`rounded-full px-3.5 py-1.5 font-bold transition active:scale-95 ${activeLabel === s.label ? "bg-[var(--accent)] text-white" : "bg-[var(--surface2)] text-[var(--text)]"}`}>{s.label}</button>
          ))}
          <span>Every resolution this video's source offers. Switching keeps your place.</span>
        </div>
      )}
      {emb.kind === "iframe" && !nativeSrc && (
        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl bg-[var(--surface)] px-3 py-2.5 text-[13px] text-[var(--dim)]">
          <span>Video not playing here?</span>
          <a href={emb.src} target="_blank" rel="noopener noreferrer" className="font-bold text-[var(--accent)]">Open the player in a new tab</a>
          <span>— some sources block playback inside apps, but the same link plays in your browser.</span>
        </div>
      )}
    </>
  );
}

/* Logo rendered from the editable logo text: first word in accent pink,
   the heart mark, then the rest in white — identical to the built-in logo
   while the text is the default "PULSE VIDEO". */
function LogoText({ text, size = 19 }: { text: string; size?: number }) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const first = words[0] ?? "PULSE";
  const rest = words.slice(1).join(" ");
  return (
    <span className="font-display flex items-center font-black tracking-tight" style={{ fontSize: size }}>
      <span className="text-[var(--accent)]">{first}</span>
      {rest && (<><LogoHeart size={size + 2} /><span className="text-white">{rest}</span></>)}
    </span>
  );
}

function Avatar({ name, g, size = 112 }: { name: string; g: [string, string]; size?: number }) {
  const initials = name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  return (
    <span className="font-display flex items-center justify-center rounded-[12px] font-black text-white shrink-0 ring-1 ring-white/15" style={{ width: `min(${size}px, 20vw)`, height: `min(${size}px, 20vw)`, background: `linear-gradient(135deg, ${g[0]}, ${g[1]})`, fontSize: `min(${Math.round(size * 0.32)}px, 6.4vw)` }} aria-hidden="true">
      {initials}
    </span>
  );
}

function Pagination({ page, total, onChange, nextLabel = "Next" }: { page: number; total: number; onChange: (p: number) => void; nextLabel?: string }) {
  if (total <= 1) return null;
  const nums: (number | "…")[] = [];
  const win = [1, page - 1, page, page + 1, total].filter((v, i, a) => v >= 1 && v <= total && a.indexOf(v) === i).sort((a, b) => a - b);
  win.forEach((v, i) => { if (i > 0 && v - (win[i - 1] as number) > 1) nums.push("…"); nums.push(v); });
  return (
    <nav className="mt-9 flex flex-wrap items-center justify-center gap-2.5" aria-label="Pages">
      {nums.map((p, i) => p === "…" ? (
        <span key={`e${i}`} className="px-1 text-[var(--dim)]">…</span>
      ) : (
        <button key={p} type="button" aria-label={`Page ${p}`} aria-current={page === p ? "page" : undefined} onClick={() => onChange(p)} className={`h-10 min-w-10 rounded-xl px-2 text-sm font-bold transition active:scale-95 ${page === p ? "bg-white text-black" : "bg-[var(--surface2)] text-white"}`}>{p}</button>
      ))}
      <button type="button" aria-label="Next page" disabled={page >= total} onClick={() => onChange(Math.min(total, page + 1))} className="h-10 rounded-xl bg-[var(--accent)] px-5 text-sm font-bold text-white transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-40">{nextLabel}</button>
    </nav>
  );
}

function NextButton({ onClick, disabled, label = "Next" }: { onClick: () => void; disabled?: boolean; label?: string }) {
  if (disabled) return null;
  return (
    <div className="mx-auto w-full max-w-[760px]">
      <button type="button" onClick={onClick} aria-label={label === "Next" ? "Next page" : label} className="mt-6 flex w-full items-center justify-center gap-2 rounded-full bg-[var(--accent)] py-4 font-display text-base font-black text-white shadow-[0_8px_24px_rgba(244,63,94,.35)] transition active:scale-[0.98] sm:mx-auto sm:max-w-[440px]">
        {label} <span aria-hidden="true">→</span>
      </button>
    </div>
  );
}

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
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-5 w-5 shrink-0 accent-[#f43f5e]" /> {label}
    </label>
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
];

const ADMIN_SECTIONS = [
  { id: "dashboard", label: "Dashboard" },
  { id: "texts", label: "Site Text" },
  { id: "buttons", label: "Buttons" },
  { id: "seo", label: "SEO" },
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
function AdminPanel({ initial, onSave, onReset, onExit, onOpenVideo, flash, theme, onToggleTheme }: {
  initial: AdminState;
  onSave: (st: AdminState) => void;
  onReset: () => void;
  onExit: () => void;
  onOpenVideo: (v: Video) => void;
  flash: (msg: string) => void;
  theme: "dark" | "light";
  onToggleTheme: () => void;
}) {
  const [st, setSt] = useState<AdminState>(() => JSON.parse(JSON.stringify(initial)) as AdminState);
  const [section, setSection] = useState<AdminSection>("dashboard");
  const eff = useMemo(() => buildEffective(st), [st]);
  const commit = (next: AdminState) => { setSt(next); onSave(next); };

  /* Videos section state */
  const [vSearch, setVSearch] = useState("");
  const [vCat, setVCat] = useState("All");
  const [vShow, setVShow] = useState(40);
  const [form, setForm] = useState<AdminVideo | null>(null);
  const [durText, setDurText] = useState("");
  const [tagsText, setTagsText] = useState("");
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
  const [report, setReport] = useState<{ added: number; skipped: { row: number; reason: string }[]; nullFields: { row: number; title: string; fields: string[] }[] } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const csvRows = useMemo(() => (csvText.trim() ? csvToRows(csvText) : null), [csvText]);

  const [confirmReset, setConfirmReset] = useState(false);

  const filteredVideos = eff.videos.filter((v) => (vCat === "All" || v.category === vCat) && (!vSearch.trim() || v.title.toLowerCase().includes(vSearch.trim().toLowerCase()) || v.creator.toLowerCase().includes(vSearch.trim().toLowerCase())));
  const recent = [...eff.videos].sort((a, b) => a.days - b.days).slice(0, 6);

  const openAdd = () => { setForm(emptyAdminVideo(`a${Date.now().toString(36)}`)); setDurText(""); setTagsText(""); setFormError(""); };
  const openEdit = (v: Video) => { const av = videoToAdmin(v); setForm(av); setDurText(av.durationSec != null ? fmtDur(av.durationSec) : ""); setTagsText(av.tags.join(", ")); setFormError(""); };
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
    };
    if (!rec.title && !rec.embedUrl) { setFormError("Give the video at least a title or an embed link — a video with neither cannot be added."); return; }
    if (st.addedVideos.some((v) => v.id === rec.id)) commit({ ...st, addedVideos: st.addedVideos.map((v) => (v.id === rec.id ? rec : v)) });
    else if (VIDEOS.some((v) => v.id === rec.id)) commit({ ...st, overrides: { ...st.overrides, [rec.id]: rec } });
    else commit({ ...st, addedVideos: [rec, ...st.addedVideos] });
    setForm(null);
    flash("Video saved — it is live on the site now");
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
    flash("Video deleted");
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
    flash(`${ids.size} video${ids.size === 1 ? "" : "s"} deleted`);
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
    if (tab === "channels" && st.taxonomy.channelsAdded.some((c) => c.name === oldName)) {
      commit({ ...st, taxonomy: { ...st.taxonomy, channelsAdded: st.taxonomy.channelsAdded.map((c) => (c.name === oldName ? { ...c, name: n } : c)) } });
      return;
    }
    const op = st.taxonomy[tab];
    if (op.added.includes(oldName)) { commit({ ...st, taxonomy: { ...st.taxonomy, [tab]: { ...op, added: op.added.map((a) => (a === oldName ? n : a)) } } }); return; }
    const renamed = { ...op.renamed };
    const key = Object.keys(renamed).find((k) => renamed[k] === oldName) ?? oldName;
    renamed[key] = n;
    commit({ ...st, taxonomy: { ...st.taxonomy, [tab]: { ...op, renamed } } });
  };
  /* Pure form of a single taxonomy delete, so the bulk delete can fold
     many names through it and commit once. */
  const taxDeleteFrom = (s: AdminState, tab: TaxTab, name: string): AdminState => {
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
    const n = taxSelected.length;
    commit(next);
    setTaxSelected([]);
    setConfirmTaxBulkDelete(false);
    setConfirmTaxDelete(null);
    flash(`${n} ${n === 1 ? taxSingular : taxSingular === "category" ? "categories" : `${taxSingular}s`} deleted`);
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
    csvRows.forEach((r, i) => {
      const rowNo = i + 1;
      if (!r.title && !r.embed_url) { skipped.push({ row: rowNo, reason: "No title and no embed_url — nothing to import." }); return; }
      if (r.embed_url) {
        const src = extractEmbedSrc(r.embed_url);
        if (existing.has(src)) { skipped.push({ row: rowNo, reason: `Duplicate embed_url — already on the site: ${src}` }); return; }
        existing.add(src);
      }
      addedRecs.push(csvRowToAdmin(r, `a${Date.now().toString(36)}x${i}`));
      nullFields.push({ row: rowNo, title: r.title ?? "Untitled video", fields: CSV_COLUMNS.filter((c) => r[c] === null) });
    });
    if (addedRecs.length) commit({ ...st, addedVideos: [...addedRecs, ...st.addedVideos] });
    setReport({ added: addedRecs.length, skipped, nullFields });
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
                    <button type="button" onClick={doResetAll} className="rounded-full bg-red-600 px-5 py-2.5 text-sm font-bold text-white transition active:scale-95">Yes, reset everything</button>
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
                  f.key === "footerText" || f.key === "cookieText" ? (
                    <div key={f.key} className="sm:col-span-2"><ATextarea label={f.label} value={st.texts[f.key] ?? ""} onChange={(v) => setSt({ ...st, texts: { ...st.texts, [f.key]: v } })} rows={2} /></div>
                  ) : (
                    <AInput key={f.key} label={f.label} value={st.texts[f.key] ?? ""} onChange={(v) => setSt({ ...st, texts: { ...st.texts, [f.key]: v } })} />
                  )
                ))}
              </div>
              <div className="mt-5 flex flex-wrap gap-3">
                <button type="button" onClick={() => { onSave(st); flash("Site texts saved"); }} className="rounded-full bg-[var(--accent)] px-7 py-3 font-display text-sm font-black text-white transition active:scale-95">Save texts</button>
                <button type="button" onClick={() => { const next = { ...st, texts: { ...DEFAULT_TEXTS } }; setSt(next); onSave(next); flash("Texts reset to defaults"); }} className="rounded-full border border-[var(--border)] px-6 py-3 text-sm font-bold text-white transition active:scale-95">Reset to default</button>
              </div>
            </section>
          )}

          {section === "buttons" && (
            <section aria-label="Buttons">
              <h2 className="font-display text-lg font-extrabold text-white">Buttons</h2>
              <p className="mt-1 text-sm text-[var(--dim)]">Edit each button's label and where it goes. A link can be a site route like <span className="text-zinc-200">#/categories</span> or a full https:// address. Leave the link empty to keep the button's normal action.</p>
              <div className="mt-4 space-y-3">
                {st.buttons.map((b, i) => (
                  <div key={b.id} className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
                    <p className="text-sm font-bold text-white">{b.name}</p>
                    <div className="mt-2.5 grid gap-3 sm:grid-cols-2">
                      <AInput label="Label" value={b.label} onChange={(v) => setSt({ ...st, buttons: st.buttons.map((x, xi) => (xi === i ? { ...x, label: v } : x)) })} />
                      <AInput label="Link / route" value={b.link} placeholder="#/categories" onChange={(v) => setSt({ ...st, buttons: st.buttons.map((x, xi) => (xi === i ? { ...x, link: v } : x)) })} />
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-5 flex flex-wrap gap-3">
                <button type="button" onClick={() => { onSave(st); flash("Buttons saved"); }} className="rounded-full bg-[var(--accent)] px-7 py-3 font-display text-sm font-black text-white transition active:scale-95">Save buttons</button>
                <button type="button" onClick={() => { const next = { ...st, buttons: DEFAULT_BUTTONS.map((b) => ({ ...b })) }; setSt(next); onSave(next); flash("Buttons reset to defaults"); }} className="rounded-full border border-[var(--border)] px-6 py-3 text-sm font-bold text-white transition active:scale-95">Reset to default</button>
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
                <button type="button" onClick={() => { onSave(st); flash("SEO saved — page titles and meta tags updated"); }} className="rounded-full bg-[var(--accent)] px-7 py-3 font-display text-sm font-black text-white transition active:scale-95">Save SEO</button>
                <button type="button" onClick={() => { const next = { ...st, seo: { ...DEFAULT_SEO } }; setSt(next); onSave(next); flash("SEO reset to defaults"); }} className="rounded-full border border-[var(--border)] px-6 py-3 text-sm font-bold text-white transition active:scale-95">Reset to default</button>
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
                  <input type="checkbox" aria-label="Select all matching videos" checked={allFilteredSelected} onChange={toggleSelectAll} className="h-5 w-5 shrink-0 accent-[#f43f5e]" />
                  Select all matching ({filteredVideos.length})
                </label>
                {selectedIds.length > 0 && <span className="text-sm font-semibold text-[var(--accent)]">{selectedIds.length} selected</span>}
              </div>

              {selectedIds.length > 0 && (
                <div className="mt-3 flex flex-wrap items-center gap-2.5 rounded-2xl border border-red-500/40 bg-red-500/10 px-4 py-3">
                  <span className="text-sm font-bold text-white">{selectedIds.length} video{selectedIds.length === 1 ? "" : "s"} selected</span>
                  {confirmBulkDelete ? (
                    <>
                      <button type="button" onClick={deleteSelected} className="rounded-full bg-red-600 px-4 py-2 text-[13px] font-bold text-white transition active:scale-95">Confirm delete {selectedIds.length} video{selectedIds.length === 1 ? "" : "s"}</button>
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
                    <button type="submit" className="rounded-full bg-[var(--accent)] px-7 py-3 font-display text-sm font-black text-white transition active:scale-95">Save video</button>
                    <button type="button" onClick={() => setForm(null)} className="rounded-full border border-[var(--border)] px-6 py-3 text-sm font-bold text-white transition active:scale-95">Cancel</button>
                  </div>
                </form>
              )}

              <div className="mt-4 space-y-2.5">
                {filteredVideos.slice(0, vShow).map((v) => (
                  <div key={v.id} className={`flex items-center gap-3 rounded-2xl border bg-[var(--surface)] p-3 ${selectedIds.includes(v.id) ? "border-[var(--accent)]" : "border-[var(--border)]"}`}>
                    <input type="checkbox" aria-label={`Select video: ${v.title}`} checked={selectedIds.includes(v.id)} onChange={() => toggleSelect(v.id)} className="h-5 w-5 shrink-0 accent-[#f43f5e]" />
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
                          <button type="button" onClick={() => deleteVideo(v)} className="rounded-full bg-red-600 px-3.5 py-2 text-[13px] font-bold text-white transition active:scale-95">Confirm delete</button>
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
                <button type="button" onClick={() => { taxAdd(taxTab, newName, newCreator); setNewName(""); setNewCreator(""); }} className="shrink-0 rounded-full bg-[var(--accent)] px-6 py-2.5 font-display text-sm font-black text-white transition active:scale-95">Add</button>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
                <label className="flex cursor-pointer items-center gap-2 py-1 text-sm font-semibold text-zinc-200">
                  <input type="checkbox" aria-label={`Select all ${taxTab}`} checked={allTaxSelected} onChange={toggleTaxSelectAll} className="h-5 w-5 shrink-0 accent-[#f43f5e]" />
                  Select all {taxTab} ({taxItems.length})
                </label>
                {taxSelected.length > 0 && <span className="text-sm font-semibold text-[var(--accent)]">{taxSelected.length} selected</span>}
              </div>
              {taxSelected.length > 0 && (
                <div className="mt-3 flex flex-wrap items-center gap-2.5 rounded-2xl border border-red-500/40 bg-red-500/10 px-4 py-3">
                  <span className="text-sm font-bold text-white">{taxSelected.length} {taxSelected.length === 1 ? taxSingular : taxSingular === "category" ? "categories" : `${taxSingular}s`} selected</span>
                  {confirmTaxBulkDelete ? (
                    <>
                      <button type="button" onClick={deleteTaxSelected} className="rounded-full bg-red-600 px-4 py-2 text-[13px] font-bold text-white transition active:scale-95">Confirm delete {taxSelected.length} {taxSelected.length === 1 ? taxSingular : taxSingular === "category" ? "categories" : `${taxSingular}s`}</button>
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
                        <button type="button" onClick={() => { taxRename(taxTab, item.name, renameText); setTaxSelected((prev) => prev.map((x) => (x === item.name ? renameText.trim() || x : x))); setRenameOf(null); }} className="rounded-full bg-[var(--accent)] px-4 py-2 text-[13px] font-bold text-white transition active:scale-95">Save</button>
                        <button type="button" onClick={() => setRenameOf(null)} className="rounded-full border border-[var(--border)] px-4 py-2 text-[13px] font-bold text-white transition active:scale-95">Cancel</button>
                      </>
                    ) : (
                      <>
                        <input type="checkbox" aria-label={`Select ${taxSingular}: ${item.name}`} checked={taxSelected.includes(item.name)} onChange={() => toggleTaxSelect(item.name)} className="h-5 w-5 shrink-0 accent-[#f43f5e]" />
                        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-white">{item.name}</span>
                        <span className="text-xs text-[var(--dim)]">{item.count} videos</span>
                        <button type="button" onClick={() => { setRenameOf(item.name); setRenameText(item.name); }} className="rounded-full bg-[var(--surface2)] px-3.5 py-2 text-[13px] font-bold text-white transition active:scale-95">Rename</button>
                        {confirmTaxDelete === item.name ? (
                          <>
                            <button type="button" onClick={() => { taxDelete(taxTab, item.name); setTaxSelected((prev) => prev.filter((x) => x !== item.name)); setConfirmTaxDelete(null); }} className="rounded-full bg-red-600 px-3.5 py-2 text-[13px] font-bold text-white transition active:scale-95">Confirm delete</button>
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
                        {csvRows.map((r, i) => (
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
                  <button type="button" onClick={doImport} className="mt-4 rounded-full bg-[var(--accent)] px-7 py-3 font-display text-sm font-black text-white transition active:scale-95">Import {csvRows.length} row{csvRows.length === 1 ? "" : "s"}</button>
                </>
              )}
              {csvRows && csvRows.length === 0 && <p className="mt-4 text-sm text-[var(--dim)]">No data rows found in this CSV yet.</p>}

              {report && (
                <div className="mt-6 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4" role="status" aria-label="Import report">
                  <h3 className="font-display text-base font-extrabold text-white">Import report</h3>
                  <p className="mt-1.5 text-sm text-zinc-200"><b className="text-emerald-400">{report.added}</b> video{report.added === 1 ? "" : "s"} added · <b className={report.skipped.length ? "text-amber-400" : "text-zinc-200"}>{report.skipped.length}</b> skipped</p>
                  {report.skipped.length > 0 && (
                    <div className="mt-3">
                      <p className="text-sm font-bold text-white">Skipped rows</p>
                      <ul className="mt-1.5 space-y-1 text-sm text-zinc-300">
                        {report.skipped.map((s) => <li key={s.row}>Row {s.row}: {s.reason}</li>)}
                      </ul>
                    </div>
                  )}
                  {report.nullFields.length > 0 && (
                    <div className="mt-3">
                      <p className="text-sm font-bold text-white">Fields stored as null</p>
                      <ul className="mt-1.5 space-y-1 text-sm text-zinc-300">
                        {report.nullFields.map((n) => (
                          <li key={n.row}>Row {n.row} ({n.title}): {n.fields.length ? n.fields.join(", ") : "none — complete row"}</li>
                        ))}
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

/* ---------------- Main App ---------------- */

type Tab = "home" | "categories" | "tags" | "creators" | "profile" | "channels";
type Listing = { kind: "tag" | "category" | "creator" | "channel" | "feed" | "search"; name: string };
type Filters = { len: string; quality: string; added: string; incl: string[]; excl: string[] };
const NO_FILTERS: Filters = { len: "Any", quality: "Any", added: "Any time", incl: [], excl: [] };
const slugify = (s: string) => s.toLowerCase().replace(/\s+/g, "-");
const PAGE_SIZE = 12;

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
const publicUrl = (base: string, route: string) => `${siteRoot(base)}${route.replace(/^\//, "")}`;

/* The reverse of publicUrl, used once on load: when the app is opened
   at one of the published path URLs (…/video/<id>, …/categories/<slug>),
   return the hash route it names so the app opens that page. Only the
   trailing path segments are read — the shell's own path prefix sits
   in front of them — and only routes the sitemap/canonical publish
   are recognized (never the admin, login or signup paths, which stay
   hash-only). Returns null when the path names no route, which is
   the normal case inside the shell. */
const pathRoute = (): string | null => {
  const segs = window.location.pathname.split("/").filter((s) => s.length > 0);
  const last = segs[segs.length - 1] ?? "";
  const prev = segs[segs.length - 2] ?? "";
  const pairHeads = ["video", "categories", "models", "channels", "tag", "search"];
  if (pairHeads.includes(prev) && last) {
    let slug = last;
    try { slug = decodeURIComponent(last); } catch { /* keep the raw segment */ }
    return `/${prev}/${slug}`;
  }
  const singleHeads = ["most-popular", "top-rated", "latest-updates", "longest", "categories", "models", "channels", "tags", "creators", "profile", "history", "sitemap.xml", "robots.txt"];
  if (singleHeads.includes(last)) return `/${last}`;
  return null;
};

const xmlEsc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

/* ISO date (YYYY-MM-DD) for a video whose age is tracked in days. */
const isoDateFromDays = (days: number) => { const d = new Date(); d.setDate(d.getDate() - Math.max(0, Math.floor(days))); return d.toISOString().slice(0, 10); };

/* ISO-8601 duration (PT#H#M#S) for structured data. */
const isoDuration = (sec: number) => {
  if (!sec || sec <= 0) return undefined;
  const h = Math.floor(sec / 3600); const m = Math.floor((sec % 3600) / 60); const s = Math.floor(sec % 60);
  return `PT${h ? `${h}H` : ""}${m ? `${m}M` : ""}${s || (!h && !m) ? `${s}S` : ""}`;
};

type SitemapData = { videos: Video[]; categories: { name: string }[]; creators: { name: string }[]; channels: { name: string }[]; tags: { name: string }[] };

function buildSitemapXml(base: string, d: SitemapData): string {
  const today = new Date().toISOString().slice(0, 10);
  const url = (route: string, lastmod: string, freq: string, prio: string) =>
    `  <url>\n    <loc>${xmlEsc(publicUrl(base, route))}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>${freq}</changefreq>\n    <priority>${prio}</priority>\n  </url>`;
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
  for (const v of d.videos) out.push(url(`/video/${v.id}`, v.hasDate ? isoDateFromDays(v.days) : today, "weekly", "0.9"));
  for (const c of d.categories) out.push(url(`/categories/${slugify(c.name)}`, today, "weekly", "0.7"));
  for (const c of d.creators) out.push(url(`/models/${slugify(c.name)}`, today, "weekly", "0.7"));
  for (const c of d.channels) out.push(url(`/channels/${slugify(c.name)}`, today, "weekly", "0.6"));
  for (const t of d.tags) out.push(url(`/tag/${slugify(t.name)}`, today, "weekly", "0.6"));
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${out.join("\n")}\n</urlset>\n`;
}

function buildRobotsTxt(base: string): string {
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

export function App() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("home");
  const [drawer, setDrawer] = useState(false);
  const [query, setQuery] = useState("");
  const [, setFeed] = useState<(typeof FEED_TABS)[number]>("For you");
  const [chip, setChip] = useState("All");
  const [letter, setLetter] = useState("Popular");
  const [modelPage, setModelPage] = useState(1);
  const [showAll, setShowAll] = useState(false);
  const [current, setCurrent] = useState<Video | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(80);
  const [speed, setSpeed] = useState(1);
  const [notice, setNotice] = useState("");
  const [signedIn, setSignedIn] = useState(false);
  const [autoplay, setAutoplay] = useState(true);
  const [cookieChoice, setCookieChoice] = useState<string | null>(() => { try { return window.localStorage.getItem("pv-cookie"); } catch { return null; } });
  /* Light/dark theme: dark is the default; the choice persists in
     localStorage and is re-applied to <html data-theme> on every change
     (an inline script in index.html applies it before first paint). */
  const [theme, setTheme] = useState<"dark" | "light">(() => { try { return window.localStorage.getItem("pv-theme") === "light" ? "light" : "dark"; } catch { return "dark"; } });
  useEffect(() => {
    if (theme === "light") document.documentElement.dataset.theme = "light";
    else delete document.documentElement.dataset.theme;
    try { window.localStorage.setItem("pv-theme", theme); } catch { /* storage unavailable */ }
  }, [theme]);
  const [descOpen, setDescOpen] = useState(false);
  const [tagsOpen, setTagsOpen] = useState(false);
  const [tagsOverflow, setTagsOverflow] = useState(false);
  const tagsRef = useRef<HTMLDivElement>(null);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [listing, setListing] = useState<Listing | null>(null);
  const [navLoading, setNavLoading] = useState(false);
  const [sortBy, setSortBy] = useState("Newest");
  const [hideWatched, setHideWatched] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [draftFilters, setDraftFilters] = useState<Filters>(NO_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<Filters>(NO_FILTERS);
  const [listPage, setListPage] = useState(1);
  const [bioOpen, setBioOpen] = useState(false);
  const [searchDraft, setSearchDraft] = useState("");
  const [notFound, setNotFound] = useState(false);
  const [authView, setAuthView] = useState<"login" | "signup" | null>(null);
  const [historyView, setHistoryView] = useState(false);
  const [adminView, setAdminView] = useState(false);
  const [fileView, setFileView] = useState<"sitemap" | "robots" | null>(null);
  const [adminMountKey, setAdminMountKey] = useState(0);
  /* Admin session token: issued by the server (verifyAdminCode) when
     the admin code typed into the search box matches the code the
     server holds — the code itself is never in this bundle. The token
     rides in sessionStorage so a reload keeps the session, and every
     admin save/reset presents it; the server re-checks it on each
     call, so the panel route alone can change nothing. */
  const [adminToken, setAdminTokenState] = useState<string | null>(() => { try { return window.sessionStorage.getItem("pv-admin-token"); } catch { return null; } });
  const adminTokenRef = useRef<string | null>(adminToken);
  const setAdminToken = (t: string | null) => {
    adminTokenRef.current = t;
    setAdminTokenState(t);
    try { if (t) window.sessionStorage.setItem("pv-admin-token", t); else window.sessionStorage.removeItem("pv-admin-token"); } catch { /* storage unavailable */ }
  };
  const [ageOk, setAgeOk] = useState(false);
  const [lang, setLang] = useState("en");
  const [langOpen, setLangOpen] = useState(false);
  const playerRef = useRef<HTMLDivElement>(null);
  const artFs = usePlayerFullscreen(playerRef);
  /* Leaving a video (or opening another) always leaves expanded mode,
     so the next page never starts with the player covering it. */
  useEffect(() => { artFs.collapse(); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id]);
  const scrollMem = useRef(new Map<string, number>());
  const wantRestore = useRef(false);
  /* Set by nav() before it changes the hash. A hash assignment also fires
     popstate in the browser, and that popstate must NOT be mistaken for
     browser Back — only a popstate with no forward navigation in flight
     is a real Back that may restore scroll. */
  const forwardNav = useRef(false);
  const loadTimer = useRef<number | undefined>(undefined);
  const searchTimer = useRef<number | undefined>(undefined);

  const stateQ = useQuery({ queryKey: ["state"], queryFn: () => api.getState({}) });

  /* Admin-managed content: the saved admin state merged over the built-in
     catalog. These local names shadow the module-level catalog constants
     everywhere inside the component, so every list, count and page renders
     the effective (admin-aware) data. */
  const adminQ = useQuery({ queryKey: ["admin"], queryFn: () => api.getAdminState({}) });
  const adminState = useMemo(() => parseAdminState(adminQ.data?.payload), [adminQ.data]);
  const eff = useMemo(() => buildEffective(adminState), [adminState]);
  const VIDEOS = eff.videos;
  const CATEGORIES = eff.categories;
  const CREATORS = eff.creators;
  const CHANNELS = eff.channels;
  const TAGS = eff.tags;
  const byId = (id: string) => VIDEOS.find((v) => v.id === id);
  /* The hash-routing effect is registered once on mount, so its applyHash
     closure would forever see the first render's catalog (from before the
     admin state finished loading). Route lookups therefore read through
     this ref, which always holds the latest effective data. */
  const effRef = useRef(eff);
  effRef.current = eff;
  const texts = adminState.texts;
  const seo = adminState.seo;
  const btnLabel = (id: string, fallback: string) => adminState.buttons.find((b) => b.id === id)?.label || fallback;
  const likes = stateQ.data?.likes ?? [];
  const saves = stateQ.data?.saves ?? [];
  const follows = stateQ.data?.follows ?? [];
  const history = stateQ.data?.history ?? [];

  const toggle = useMutation({
    mutationFn: async (a: { kind: "like" | "save" | "follow"; itemKey: string }) => await api.toggleInteraction(a),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["state"] }),
    onError: (e) => setNotice(e instanceof Error ? e.message : "Something went wrong"),
  });
  const record = useMutation({
    mutationFn: async (itemKey: string) => await api.recordHistory({ itemKey }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["state"] }),
  });
  const clearHist = useMutation({
    mutationFn: async () => await api.clearHistory({}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["state"] }),
  });
  const saveAdmin = useMutation({
    mutationFn: async (st: AdminState) => await api.saveAdminState({ payload: JSON.stringify(st), token: adminTokenRef.current ?? "" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin"] }),
    onError: (e) => setNotice(e instanceof Error ? e.message : "Could not save admin changes"),
  });
  const resetAdmin = useMutation({
    mutationFn: async () => await api.resetAdminState({ token: adminTokenRef.current ?? "" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin"] }); flash("All admin changes reset — defaults restored"); },
    onError: (e) => setNotice(e instanceof Error ? e.message : "Could not reset admin changes"),
  });

  const flash = (msg: string) => { setNotice(msg); setTimeout(() => setNotice(""), 2600); };

  /* The site's own address without the hash route — the base every
     sitemap URL is built on. */
  const siteBase = () => (window.location.origin && window.location.origin !== "null" ? `${window.location.origin}${window.location.pathname}` : "");
  const downloadTextFile = (name: string, text: string, type: string) => {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = document.createElement("a");
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 4000);
  };

  /* The app does NOT scroll the window: the SDK shell scrolls the
     [data-generated-space-root] container (position: fixed; overflow: auto).
     window.scrollTo alone therefore never moved the page — every scroll
     helper must target that container first. */
  const getScroller = (): HTMLElement | null =>
    document.querySelector<HTMLElement>("[data-generated-space-root]") ??
    (document.scrollingElement as HTMLElement | null);
  const readScroll = (): number => getScroller()?.scrollTop ?? window.scrollY;
  const scrollToY = (y: number, instant: boolean) => {
    const sc = getScroller();
    if (sc) {
      if (instant) { try { sc.scrollTo({ top: y, left: 0, behavior: "instant" as ScrollBehavior }); } catch { /* older browser */ } }
      sc.scrollTop = y;
    }
    window.scrollTo(0, y);
  };

  /* Instant jump to the very top: the real scroll container, the window, the
     document and the main page container all reset, with no smooth animation
     that could be interrupted. Forward navigation ALWAYS uses this; only
     browser Back restores scroll. */
  const scrollTopInstant = () => {
    scrollToY(0, true);
    if (document.scrollingElement) document.scrollingElement.scrollTop = 0;
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    const mainEl = document.getElementById("main");
    if (mainEl) mainEl.scrollTop = 0;
  };

  const nav = (path: string) => {
    /* An explicit click navigation always starts at the top — cancel any
       pending back-scroll restore so it cannot override this navigation. */
    wantRestore.current = false;
    forwardNav.current = true;
    scrollTopInstant();
    setNavLoading(true);
    window.clearTimeout(loadTimer.current);
    loadTimer.current = window.setTimeout(() => setNavLoading(false), 450);
    const hash = lang !== "en" ? `#/${lang}${path}` : `#${path}`;
    if (window.location.hash !== hash) window.location.hash = hash;
    /* The hash change renders the new view a beat later — land on its top. */
    requestAnimationFrame(() => scrollTopInstant());
    window.setTimeout(() => scrollTopInstant(), 60);
  };
  const resetViews = () => { setNotFound(false); setAuthView(null); setHistoryView(false); setAdminView(false); setFileView(null); };
  const openVideo = (v: Video) => {
    resetViews();
    setCurrent(v);
    /* Embed videos start playing as soon as their page opens (the iframe
       or <video> element is the player), so opening one counts as a watch. */
    if (v.embedUrl) record.mutate(v.id);
    setPlaying(false);
    setProgress(0);
    setDescOpen(false);
    setCommentsOpen(false);
    nav(`/video/${v.id}`);
    scrollTopInstant();
  };
  const startPlayback = () => {
    if (!current) return;
    /* Resuming at the very end restarts from the beginning — with the
       progress left at 100 the ticker would end playback again within
       a frame, which reads as "the resume button does nothing". */
    if (!playing && progress >= 100) setProgress(0);
    if (!playing) record.mutate(current.id);
    setPlaying(!playing);
  };
  const switchLang = (code: string) => {
    setLang(code);
    setLangOpen(false);
    const raw = window.location.hash.replace(/^#\/?/, "");
    const segs = raw.split("/").filter((s) => s.length > 0);
    if (segs[0] && LANG_CODES.has(segs[0])) segs.shift();
    const path = "/" + segs.join("/");
    setNavLoading(true);
    window.clearTimeout(loadTimer.current);
    loadTimer.current = window.setTimeout(() => setNavLoading(false), 450);
    forwardNav.current = true;
    window.location.hash = code === "en" ? `#${path}` : `#/${code}${path}`;
    flash(`Language set to ${LANGS.find((l) => l.code === code)?.name ?? code} — interface translation is partial in this demo`);
  };
  const goTab = (t: Tab) => {
    setPlaying(false);
    resetViews();
    setTab(t);
    setCurrent(null);
    setListing(null);
    setDrawer(false);
    setQuery("");
    if (t === "home") setFeed("For you");
    nav(t === "home" ? "/" : t === "creators" ? "/models" : `/${t}`);
    scrollTopInstant();
  };
  const openListing = (l: Listing) => {
    setPlaying(false);
    resetViews();
    setListing(l);
    setCurrent(null);
    setTab("home");
    setDrawer(false);
    if (l.kind === "search") setQuery(l.name);
    const feedRoutes: Record<string, string> = { Trending: "/most-popular", "Top rated": "/top-rated", New: "/latest-updates", Longest: "/longest" };
    const route = l.kind === "feed" ? (feedRoutes[l.name] ?? "/") : l.kind === "category" ? `/categories/${slugify(l.name)}` : l.kind === "creator" ? `/models/${slugify(l.name)}` : l.kind === "channel" ? `/channels/${slugify(l.name)}` : l.kind === "search" ? `/search/${slugify(l.name)}` : `/tag/${slugify(l.name)}`;
    nav(route);
    scrollTopInstant();
  };
  const openAuth = (v: "login" | "signup") => { resetViews(); setAuthView(v); setDrawer(false); setAgeOk(false); nav(v === "login" ? "/login" : "/signup"); scrollTopInstant(); };
  const openHistory = () => { resetViews(); setHistoryView(true); setCurrent(null); setListing(null); setDrawer(false); nav("/history"); scrollTopInstant(); };

  /* The admin panel's only door: typing the admin code into the site's
     search box. The code lives only on the server — the client sends
     what was typed to verifyAdminCode and opens the panel only when
     the server confirms the match and issues a session token; every
     save/reset then presents that token and is re-checked server-side.
     There is no admin link anywhere on the public site, and the
     #/panel hash (handled in applyHash below) merely restores a panel
     whose token this browser already holds — the route alone opens
     nothing and changes nothing. */
  const showAdmin = () => { setAdminView(true); setNotFound(false); setAuthView(null); setHistoryView(false); setCurrent(null); setListing(null); setAdminMountKey((k) => k + 1); };
  const goAdmin = () => {
    showAdmin();
    if (window.location.hash !== "#/panel") { forwardNav.current = true; window.location.hash = "#/panel"; }
    scrollTopInstant();
  };
  const tryAdminCode = async (raw: string): Promise<boolean> => {
    try {
      const r = await api.verifyAdminCode({ code: raw });
      if (r.admin && r.token) { setAdminToken(r.token); return true; }
    } catch { /* server unreachable — treat the text as a normal search */ }
    return false;
  };

  const titleCase = (s: string) => s.split(" ").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
  const applyHash = () => {
    let raw = window.location.hash.replace(/^#\/?/, "");
    const segs = raw.split("/").filter((s) => s.length > 0);
    if (segs[0] && LANG_CODES.has(segs[0]) && segs[0] !== "en") { setLang(segs[0]); segs.shift(); raw = segs.join("/"); }
    const [head = "", ...rest] = raw.split("/");
    const slug = decodeURIComponent(rest.join("/") || "");
    const fromSlug = (s: string) => titleCase(s.replace(/-/g, " "));
    const clear = () => { setNotFound(false); setAuthView(null); setHistoryView(false); setAdminView(false); setFileView(null); };
    /* The #/panel route only restores a panel session this browser has
       already verified with the server (its token sits in
       sessionStorage). There is deliberately no #/admin route and no
       link to the panel anywhere on the public site. */
    if (head === "panel") { if (adminTokenRef.current) { showAdmin(); return; } setNotFound(true); return; }
    if (head === "") { clear(); setListing(null); setCurrent(null); setTab("home"); setFeed("For you"); return; }
    if (head === "login" || head === "signup") { clear(); setAuthView(head); setCurrent(null); setListing(null); return; }
    /* Premium/membership is gone (owner's rule: everything plays
       free) — the old route is a plain 404 like any unknown page. */
    if (head === "membership") { clear(); setNotFound(true); setCurrent(null); setListing(null); return; }
    if (head === "history") { clear(); setHistoryView(true); setCurrent(null); setListing(null); return; }
    if (head === "categories" && !slug) { clear(); setTab("categories"); setListing(null); setCurrent(null); return; }
    if (head === "categories" && slug) { clear(); const c = effRef.current.categories.find((x) => slugify(x.name) === slug); if (c) { setListing({ kind: "category", name: c.name }); setCurrent(null); setTab("home"); } else setNotFound(true); return; }
    if (head === "models" && !slug) { clear(); setTab("creators"); setListing(null); setCurrent(null); return; }
    if (head === "models" && slug) { clear(); const c = effRef.current.creators.find((x) => slugify(x.name) === slug); if (c) { setListing({ kind: "creator", name: c.name }); setCurrent(null); setTab("home"); } else setNotFound(true); return; }
    if (head === "channels" && !slug) { clear(); setTab("channels"); setListing(null); setCurrent(null); return; }
    if (head === "channels" && slug) { clear(); const c = effRef.current.channels.find((x) => slugify(x.name) === slug); if (c) { setListing({ kind: "channel", name: c.name }); setCurrent(null); setTab("home"); } else setNotFound(true); return; }
    if (head === "tags" || head === "creators" || head === "profile") { clear(); setTab(head === "creators" ? "creators" : head); setListing(null); setCurrent(null); return; }
    if (head === "video") { clear(); const v = effRef.current.videos.find((x) => x.id === slug); if (v) setCurrent(v); else setNotFound(true); return; }
    if (head === "most-popular" || head === "top-rated" || head === "latest-updates" || head === "longest") { clear(); const f = head === "most-popular" ? "Trending" : head === "top-rated" ? "Top rated" : head === "latest-updates" ? "New" : "Longest"; setFeed(f); setListing({ kind: "feed", name: f }); setCurrent(null); setTab("home"); return; }
    if (head === "search") { clear(); if (slug) { const q = fromSlug(slug); setListing({ kind: "search", name: q }); setQuery(q); setCurrent(null); setTab("home"); } return; }
    if (head === "tag") { clear(); if (slug) { const t = effRef.current.tags.find((x) => slugify(x.name) === slug); if (t) { setListing({ kind: "tag", name: t.name }); setCurrent(null); setTab("home"); } else setNotFound(true); } return; }
    /* Generated SEO files, rendered as pages so the owner can open,
       copy or download them: #/sitemap.xml and #/robots.txt. */
    if (head === "sitemap.xml" || head === "robots.txt") { clear(); setFileView(head === "sitemap.xml" ? "sitemap" : "robots"); setCurrent(null); setListing(null); setTab("home"); return; }
    setNotFound(true);
  };

  /* Tags under the player: collapsed to a single line, with a See more
     toggle shown only when the tags actually overflow that line. */
  useEffect(() => { setTagsOpen(false); }, [current?.id]);
  useEffect(() => {
    if (tagsOpen) return;
    const measure = () => { const el = tagsRef.current; if (el) setTagsOverflow(el.scrollHeight > el.clientHeight + 4); };
    const raf = requestAnimationFrame(measure);
    window.addEventListener("resize", measure);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", measure); };
  }, [current?.id, tagsOpen]);

  useEffect(() => {
    /* We manage scroll ourselves: forward navigation goes to the top,
       browser Back restores. The browser must not restore on its own. */
    try { window.history.scrollRestoration = "manual"; } catch { /* older browser */ }
    applyHash();
    /* Opened directly at a published path URL (from the sitemap, a
       canonical or a shared link) with no hash route set: translate
       the path into the hash route it names; the hashchange listener
       then applies it like any other navigation. */
    if (!window.location.hash.replace(/^#\/?/, "")) {
      const pr = pathRoute();
      if (pr) { forwardNav.current = true; window.location.hash = `#${pr}`; }
    }
    /* If the shell kept the admin fragment on the outer page's address
       instead of this page's own hash, a same-origin parent still lets
       us read it — send it to the server for verification like any
       typed code, and open the panel only on a confirmed match. A
       cross-origin parent throws on access; that case is covered by
       typing the code into the site's search box instead. */
    try {
      if (window.parent !== window && window.parent.location.hash) {
        const frag = window.parent.location.hash;
        void tryAdminCode(frag).then((ok) => { if (ok) goAdmin(); });
      }
    } catch { /* cross-origin parent — nothing to read */ }
    scrollTopInstant();
    const onHash = () => {
      const wasForward = forwardNav.current;
      forwardNav.current = false;
      applyHash();
      /* A hash change is a new page unless it came from browser Back
         (popstate sets wantRestore first) — never keep the old scroll.
         A forward navigation started by nav() always lands at the top,
         even though its hash assignment also fired popstate. */
      if (wasForward) wantRestore.current = false;
      if (!wantRestore.current) {
        scrollTopInstant();
        requestAnimationFrame(() => scrollTopInstant());
      }
    };
    const onPop = () => { if (!forwardNav.current) wantRestore.current = true; };
    window.addEventListener("hashchange", onHash);
    window.addEventListener("popstate", onPop);
    return () => { window.removeEventListener("hashchange", onHash); window.removeEventListener("popstate", onPop); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* A deep link to an admin-added video/category/model/tag can resolve as
     404 on the very first pass, before getAdminState returns. Once the
     admin data lands, re-resolve the current route if we landed on a 404. */
  const notFoundRef = useRef(false);
  useEffect(() => { notFoundRef.current = notFound; }, [notFound]);
  useEffect(() => {
    if (adminQ.data && notFoundRef.current) applyHash();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminQ.data]);

  useEffect(() => {
    if (!playing || !current) return;
    const t = setInterval(() => {
      setProgress((p) => {
        const next = p + (speed * 100) / current.durationSec / 4;
        if (next >= 100) { setPlaying(false); return 100; }
        return next;
      });
    }, 250);
    return () => clearInterval(t);
  }, [playing, current, speed]);

  /* Typing in the header search creates a real history entry (hash push) + loading bar + title change. */
  useEffect(() => {
    window.clearTimeout(searchTimer.current);
    const q = query.trim();
    if (listing?.kind === "search" && listing.name.toLowerCase() === q.toLowerCase()) return;
    if (!q) return;
    /* The admin code typed into search opens the panel instead of a
       search — the owner's way in when the shell's address bar cannot
       set this page's hash. The check runs on the server (the code is
       not in this bundle): once typing settles, the text goes to
       verifyAdminCode, and only a server-confirmed match opens the
       panel; the text is cleared at once so it never lingers in the
       box or becomes a search history entry. A non-match falls through
       to the normal search. */
    let cancelled = false;
    searchTimer.current = window.setTimeout(() => {
      void (async () => {
        if (await tryAdminCode(q)) { if (!cancelled) { setQuery(""); setSearchDraft(""); goAdmin(); } return; }
        if (!cancelled) openListing({ kind: "search", name: q });
      })();
    }, 650);
    return () => { cancelled = true; window.clearTimeout(searchTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const newest = useMemo(() => [...VIDEOS].sort((a, b) => a.days - b.days), [VIDEOS]);
  const trending = useMemo(() => [...VIDEOS].sort((a, b) => b.views - a.views).slice(0, 10), [VIDEOS]);
  const latestHome = useMemo(() => {
    /* A chip matches the same rule as a category listing page (the
       video's category, or one of its tags), so a chip never lands on
       an empty section while its listing page has videos. */
    const base = chip === "All" ? newest : newest.filter((v) => v.category === chip || v.tags.includes(chip.toLowerCase()));
    return showAll ? base : base.slice(0, 24);
  }, [newest, chip, showAll]);
  /* Home category chips: the categories that actually have videos,
     busiest first — the built-in list's first entries are dead ends
     whenever the real catalog lives in other categories. Falls back
     to the first catalog categories when nothing has a count yet. */
  const chipNames = useMemo(() => {
    const withVideos = [...CATEGORIES].filter((c) => Number(c.count) > 0).sort((a, b) => Number(b.count) - Number(a.count)).slice(0, 11).map((c) => c.name);
    return ["All", ...(withVideos.length ? withVideos : CATEGORIES.slice(0, 11).map((c) => c.name))];
  }, [CATEGORIES]);
  const topRated = useMemo(() => [...VIDEOS].sort((a, b) => b.rating - a.rating), [VIDEOS]);
  const upNext = current ? VIDEOS.filter((v) => v.id !== current.id && (v.category === current.category || v.creator === current.creator)).concat(VIDEOS.filter((v) => v.id !== current.id)).filter((v, i, a) => a.indexOf(v) === i).slice(0, 6) : [];
  const suggested = current ? [...VIDEOS].filter((v) => v.id !== current.id && !upNext.some((u) => u.id === v.id)).sort((a, b) => b.rating - a.rating).slice(0, 5) : [];
  const moreLikeThis = current ? VIDEOS.filter((v) => v.id !== current.id && v.category === current.category).slice(0, 8) : [];
  /* "Because you watch" follows the last watched video's category —
     unless that video has no real category (imports land in
     "Uncategorized"), where its first tag names the section instead,
     so the heading never reads "Because you watch Uncategorized". */
  const histVid = history[0] ? byId(history[0]) : undefined;
  const becauseCat = histVid ? (histVid.category !== "Uncategorized" ? histVid.category : (histVid.tags[0] ? titleCase(histVid.tags[0]) : "Travel")) : "Travel";
  const becauseList = useMemo(() => {
    const match = (v: Video) => v.category === becauseCat || v.tags.includes(becauseCat.toLowerCase());
    const inCat = VIDEOS.filter(match).sort((a, b) => b.views - a.views);
    const rest = VIDEOS.filter((v) => !match(v)).sort((a, b) => b.views - a.views);
    return [...inCat, ...rest].slice(2, 10);
  }, [becauseCat, VIDEOS]);
  const becauseTag = current?.tags[0] ?? becauseCat;

  const listingVideos = (l: Listing): Video[] => {
    if (l.kind === "search") { const q = l.name.toLowerCase(); return VIDEOS.filter((v) => v.title.toLowerCase().includes(q) || v.category.toLowerCase() === q || v.tags.some((t) => t.includes(q)) || v.creator.toLowerCase().includes(q)); }
    if (l.kind === "tag") { const q = l.name.toLowerCase(); return VIDEOS.filter((v) => v.tags.includes(q) || v.category.toLowerCase() === q); }
    if (l.kind === "category") return VIDEOS.filter((v) => v.category === l.name || v.tags.includes(l.name.toLowerCase()));
    if (l.kind === "creator") return VIDEOS.filter((v) => v.creator === l.name);
    if (l.kind === "channel") { const ch = CHANNELS.find((c) => c.name === l.name); return ch ? VIDEOS.filter((v) => v.creator === ch.creator || v.channel === ch.name) : []; }
    if (l.name === "Trending") return [...VIDEOS].sort((a, b) => b.views - a.views);
    if (l.name === "New") return [...VIDEOS].sort((a, b) => a.days - b.days);
    if (l.name === "Top rated") return [...VIDEOS].sort((a, b) => b.rating - a.rating);
    if (l.name === "Longest") return [...VIDEOS].sort((a, b) => b.durationSec - a.durationSec);
    return VIDEOS;
  };
  const listingCount = (_l: Listing, list: Video[]): string => `${list.length} video${list.length === 1 ? "" : "s"}`;
  const listingHeading = (l: Listing): string => {
    if (l.kind === "feed") return l.name === "Trending" ? "Most Viewed Videos" : l.name === "Top rated" ? "Top Rated Videos" : l.name === "New" ? "New Videos" : "Longest Videos";
    if (l.kind === "tag") return `Videos tagged “${l.name}”`;
    if (l.kind === "search") return `${l.name} Videos`;
    if (l.kind === "creator" || l.kind === "channel") return l.name;
    return `${l.name} Videos`;
  };
  const listingSegment = (l: Listing): string => l.kind === "search" ? "Search" : l.kind === "tag" ? "Tags" : l.kind === "category" ? "Categories" : l.kind === "creator" ? "Models" : l.kind === "channel" ? "Channels" : "Browse";
  const listingBack = (l: Listing) => { if (l.kind === "search" || l.kind === "tag") goTab("tags"); else if (l.kind === "creator") goTab("creators"); else if (l.kind === "category") goTab("categories"); else if (l.kind === "channel") goTab("channels"); else goTab("home"); };
  const relatedFor = (l: Listing): string[] => {
    const pool = Array.from(new Set(listingVideos(l).flatMap((v) => v.tags)));
    const fill = TAGS.map((t) => t.name).filter((t) => !pool.includes(t));
    return [...pool, ...fill].filter((t) => t.toLowerCase() !== l.name.toLowerCase()).slice(0, 8);
  };
  const sortOptionsFor = (l: Listing): string[] => {
    if (l.kind === "feed" && l.name !== "Longest") return ["Newest", "Top rated", "Popular"];
    if (l.kind === "search") return ["Most relevant", "Newest", "Trending", "Top rated", "Longest"];
    return ["Newest", "Popular", "Trending", "Top rated", "Longest"];
  };
  const defaultSortFor = (l: Listing): string => {
    if (l.kind === "search") return "Most relevant";
    if (l.kind === "feed") return l.name === "Trending" ? "Popular" : l.name === "Top rated" ? "Top rated" : l.name === "Longest" ? "Longest" : "Newest";
    return "Newest";
  };

  useEffect(() => {
    if (listing) setSortBy(defaultSortFor(listing));
    setHideWatched(false); setFiltersOpen(false); setDraftFilters(NO_FILTERS); setAppliedFilters(NO_FILTERS); setListPage(1); setBioOpen(false);
    if (listing?.kind === "search") setSearchDraft(listing.name);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listing?.kind, listing?.name]);

  const viewKey = adminView ? "admin" : notFound ? "404" : authView ? `auth:${authView}` : historyView ? "history" : current ? `video:${current.id}` : listing ? `list:${listing.kind}:${listing.name}:${listPage}` : `tab:${tab}`;
  useEffect(() => {
    const onScroll = () => scrollMem.current.set(viewKey, readScroll());
    const sc = getScroller();
    if (sc) sc.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => { if (sc) sc.removeEventListener("scroll", onScroll); window.removeEventListener("scroll", onScroll); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewKey]);
  useEffect(() => {
    if (wantRestore.current) {
      /* Browser Back only: return to where the previous list was scrolled. */
      wantRestore.current = false;
      const y = scrollMem.current.get(viewKey);
      if (y) { requestAnimationFrame(() => scrollToY(y, false)); return; }
    }
    /* Every forward view change — tab, listing, video, page number — opens
       at the very top, instantly. */
    scrollTopInstant();
    const r = requestAnimationFrame(() => scrollTopInstant());
    return () => cancelAnimationFrame(r);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewKey]);

  useEffect(() => {
    const brand = texts.siteName || "Pulse Video";
    document.title =
      adminView ? `Admin Panel | ${brand}` :
      notFound ? `Page not found — ${brand}` :
      authView === "login" ? "Log in - pulsevideo" :
      authView === "signup" ? "Create your account - pulsevideo" :
      historyView ? "History - pulsevideo" :
      current ? (current.seoTitle || `${current.title} | ${brand}`) :
      listing ? (listing.kind === "feed"
        ? `${listing.name === "Trending" ? "Top Trending Videos" : listing.name === "Top rated" ? "Top Rated Collection" : listing.name === "New" ? "Just Added Videos" : "Longest Videos"} | ${brand}`
        : listing.kind === "tag" ? `Tag: ${listing.name} — Videos | ${brand}`
        : listing.kind === "search" ? `Search: ${listing.name} | ${brand}`
        : listing.kind === "creator" ? `${listing.name} Videos — Model | ${brand}`
        : listing.kind === "channel" ? `${listing.name} — Channel | ${brand}`
        : `${listing.name} Videos — Category | ${brand}`) :
      fileView === "sitemap" ? `Sitemap | ${brand}` :
      fileView === "robots" ? `robots.txt | ${brand}` :
      tab === "home" ? (seo.siteTitle || `${brand} | Stream Free Videos in HD`) :
      tab === "categories" ? `Explore Video Categories | ${brand}` :
      tab === "tags" ? `Browse Tags A–Z | ${brand}` :
      tab === "creators" ? `Models Having Most Videos | ${brand}` :
      tab === "channels" ? `Top Rated Channels | ${brand}` :
      `Your Library | ${brand}`;
  }, [current, listing, tab, notFound, authView, historyView, adminView, fileView, texts.siteName, seo.siteTitle]);

  /* Dynamic SEO: every view gets its own meta description, Open Graph
     and Twitter cards, canonical URL, robots directive and JSON-LD
     structured data, all derived from that view's own data. A video's
     own SEO fields (set in the admin panel) win on its page; listing
     pages describe themselves from their name and live video count;
     the admin SEO settings remain the site-wide fallback. Private
     views (admin, auth, history, profile, search results, 404 and the
     generated SEO files) are noindexed and carry no canonical. */
  useEffect(() => {
    const brand = texts.siteName || "Pulse Video";
    const setMeta = (attr: string, key: string, content: string | null) => {
      let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
      if (content == null || content === "") { if (el) el.remove(); return; }
      if (!el) { el = document.createElement("meta"); el.setAttribute(attr, key); document.head.appendChild(el); }
      el.setAttribute("content", content);
    };
    const feedRoutes: Record<string, string> = { Trending: "/most-popular", "Top rated": "/top-rated", New: "/latest-updates", Longest: "/longest" };
    const route =
      adminView ? "/panel" :
      authView ? `/${authView}` :
      historyView ? "/history" :
      fileView ? (fileView === "sitemap" ? "/sitemap.xml" : "/robots.txt") :
      current ? `/video/${current.id}` :
      listing ? (listing.kind === "feed" ? (feedRoutes[listing.name] ?? "/") : listing.kind === "category" ? `/categories/${slugify(listing.name)}` : listing.kind === "creator" ? `/models/${slugify(listing.name)}` : listing.kind === "channel" ? `/channels/${slugify(listing.name)}` : listing.kind === "search" ? `/search/${slugify(listing.name)}` : `/tag/${slugify(listing.name)}`) :
      tab === "home" ? "/" : tab === "creators" ? "/models" : `/${tab}`;
    const origin = window.location.origin && window.location.origin !== "null" ? window.location.origin : "";
    const base = origin ? `${origin}${window.location.pathname}` : "";
    /* Canonical/OG/JSON-LD URLs use the same fragment-free path form
       as the sitemap: a "#" URL is stripped by crawlers and would
       point every page's canonical at the home page. */
    const pageUrl = publicUrl(base, route);
    const noindex = adminView || !!authView || historyView || notFound || !!fileView || tab === "profile" || listing?.kind === "search";

    let desc = seo.metaDescription;
    if (current) {
      desc = current.seoDescription || current.description ||
        `${current.title} — watch in HD${current.hd ? " & 4K" : ""} on ${brand}. ${current.category} video${current.creator ? ` featuring ${current.creator}` : ""}${current.tags.length ? `. Tags: ${current.tags.slice(0, 6).join(", ")}` : ""}.`;
    } else if (listing) {
      const n = listingVideos(listing).length;
      desc =
        listing.kind === "category" ? `${listing.name} videos — watch ${n} free ${listing.name} videos in HD on ${brand}, updated daily.` :
        listing.kind === "creator" ? `${listing.name} videos — watch ${n} videos featuring model ${listing.name} in HD on ${brand}.` :
        listing.kind === "channel" ? `${listing.name} channel — watch ${n} videos from ${listing.name} in HD on ${brand}.` :
        listing.kind === "tag" ? `Videos tagged "${listing.name}" — ${n} free videos in HD on ${brand}.` :
        listing.kind === "search" ? `Search results for "${listing.name}" on ${brand}.` :
        `${listing.name} videos — watch free videos in HD on ${brand}, updated daily.`;
    } else if (!notFound && !adminView && !authView && !historyView) {
      if (tab === "categories") desc = `Browse all video categories on ${brand} — ${CATEGORIES.length} categories of free HD videos.`;
      else if (tab === "tags") desc = `Browse videos by tag on ${brand} — ${TAGS.length} tags from A to Z.`;
      else if (tab === "creators") desc = `Models on ${brand} — ${CREATORS.length} models with free HD videos.`;
      else if (tab === "channels") desc = `Channels on ${brand} — ${CHANNELS.length} channels of free HD videos.`;
      else if (tab === "profile") desc = `Your library on ${brand} — your liked, saved and followed videos.`;
    }

    const ogTitle = current ? (current.seoTitle || current.title) : (seo.ogTitle || document.title);
    const ogDesc = current ? desc : (seo.ogDescription || desc);
    /* A video-file thumbnail (preview.mp4) is not a share image —
       social crawlers reject it — so it is left out of og:image and
       the JSON-LD thumbnail list rather than pointing them at a movie. */
    const ogImage = current?.thumbnailUrl && !isVideoFileUrl(current.thumbnailUrl) ? current.thumbnailUrl : null;
    setMeta("name", "description", desc);
    setMeta("name", "keywords", seo.metaKeywords);
    setMeta("name", "robots", noindex ? "noindex, nofollow" : "index, follow, max-image-preview:large");
    setMeta("property", "og:type", current ? "video.other" : "website");
    setMeta("property", "og:site_name", brand);
    setMeta("property", "og:title", ogTitle);
    setMeta("property", "og:description", ogDesc);
    setMeta("property", "og:url", noindex ? null : pageUrl);
    setMeta("property", "og:image", ogImage);
    setMeta("name", "twitter:card", ogImage ? "summary_large_image" : "summary");
    setMeta("name", "twitter:title", ogTitle);
    setMeta("name", "twitter:description", ogDesc);
    setMeta("name", "twitter:image", ogImage);

    let link = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (noindex) { if (link) link.remove(); }
    else {
      if (!link) { link = document.createElement("link"); link.setAttribute("rel", "canonical"); document.head.appendChild(link); }
      link.setAttribute("href", pageUrl);
    }

    /* JSON-LD structured data for this view. */
    type JsonLd = Record<string, unknown>;
    const graph: JsonLd[] = [];
    if (current) {
      const dur = isoDuration(current.durationSec);
      graph.push({
        "@type": "VideoObject",
        name: current.title,
        description: desc,
        url: pageUrl,
        ...(ogImage ? { thumbnailUrl: [ogImage] } : {}),
        ...(current.hasDate ? { uploadDate: isoDateFromDays(current.days) } : {}),
        ...(dur ? { duration: dur } : {}),
        ...(current.embedUrl ? { embedUrl: resolveEmbed(current.embedUrl).src } : {}),
        ...(current.hasViews ? { interactionStatistic: { "@type": "InteractionCounter", interactionType: { "@type": "WatchAction" }, userInteractionCount: current.views } } : {}),
        ...(current.creator ? { actor: { "@type": "Person", name: current.creator } } : {}),
      });
      graph.push({
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: publicUrl(base, "/") },
          { "@type": "ListItem", position: 2, name: current.category, item: publicUrl(base, `/categories/${slugify(current.category)}`) },
          { "@type": "ListItem", position: 3, name: current.title, item: pageUrl },
        ],
      });
    } else if (listing && listing.kind !== "search") {
      const all = listingVideos(listing);
      graph.push({
        "@type": "ItemList",
        name: document.title,
        numberOfItems: all.length,
        itemListElement: all.slice(0, 20).map((v, i) => ({ "@type": "ListItem", position: i + 1, name: v.title, url: publicUrl(base, `/video/${v.id}`) })),
      });
      graph.push({
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: publicUrl(base, "/") },
          { "@type": "ListItem", position: 2, name: listing.name, item: pageUrl },
        ],
      });
    } else if (!notFound && !adminView && !authView && !historyView && !fileView && tab === "home") {
      graph.push({
        "@type": "WebSite",
        name: brand,
        url: publicUrl(base, "/"),
        potentialAction: { "@type": "SearchAction", target: { "@type": "EntryPoint", urlTemplate: publicUrl(base, "/search/{search_term_string}") }, "query-input": "required name=search_term_string" },
      });
      graph.push({ "@type": "Organization", name: brand, url: publicUrl(base, "/") });
    }
    let script = document.head.querySelector<HTMLScriptElement>("#pv-jsonld");
    if (graph.length) {
      if (!script) { script = document.createElement("script"); script.id = "pv-jsonld"; script.type = "application/ld+json"; document.head.appendChild(script); }
      script.textContent = JSON.stringify({ "@context": "https://schema.org", "@graph": graph });
    } else if (script) {
      script.remove();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, listing, tab, notFound, authView, historyView, adminView, fileView, seo, texts.siteName, eff]);

  const navActive: Tab = current ? "home" : listing ? (listing.kind === "tag" ? "tags" : listing.kind === "search" ? "tags" : listing.kind === "creator" ? "creators" : listing.kind === "category" || listing.kind === "channel" ? "categories" : "home") : historyView || authView ? "profile" : tab === "channels" ? "categories" : tab;

  useEffect(() => {
    if (!current || !autoplay || progress < 100) return;
    const next = upNext[0];
    if (!next) return;
    const t = setTimeout(() => openVideo(next), 700);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progress, autoplay, current]);

  const shownTags = letter === "Popular" ? [...TAGS].sort((a, b) => b.count - a.count) : letter === "0-9" ? TAGS.filter((t) => /^[0-9]/.test(t.name)) : letter === "#" ? TAGS.filter((t) => !/^[a-z0-9]/i.test(t.name)) : TAGS.filter((t) => t.name.toUpperCase().startsWith(letter));
  const modelsPerPage = 12;
  const totalModelPages = Math.max(1, Math.ceil(CREATORS.length / modelsPerPage));
  /* Clamp the page like listings do: if the catalog shrank (admin
     deletes) the stored page can point past the end and would render
     an empty Models page. */
  const safeModelPage = Math.min(modelPage, totalModelPages);
  const modelSlice = CREATORS.slice((safeModelPage - 1) * modelsPerPage, safeModelPage * modelsPerPage);

  const fmtTime = (sec: number) => fmtDur(Math.floor(sec));
  const chooseCookie = (v: string) => { setCookieChoice(v); try { window.localStorage.setItem("pv-cookie", v); } catch { /* storage unavailable */ } };

  const bottomTabs: { key: Tab; label: string; icon: string }[] = [
    { key: "home", label: "Home", icon: "home" },
    { key: "categories", label: "Categories", icon: "grid" },
    { key: "tags", label: "Tags", icon: "hash" },
    { key: "creators", label: "Creators", icon: "users" },
    { key: "profile", label: "Profile", icon: "user" },
  ];

  const drawerCats = CATEGORIES.slice(0, 24);

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
      <GradientDefs />
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-[90] focus:rounded-full focus:bg-[var(--accent)] focus:px-4 focus:py-2 focus:font-bold focus:text-white">Skip to content</a>
      {navLoading && <div className="loadbar fixed inset-x-0 top-0 z-[80] h-[3px] bg-[var(--accent)]" aria-hidden="true" />}

      {/* ===== ADMIN PANEL (standalone; opens only after the server verifies the admin code) =====
          The panel mounts only once the saved admin state has actually
          loaded: mounting it on the built-in defaults and letting a
          save land before getAdminState returned would overwrite the
          owner's real saved state (their whole imported catalog) with
          those defaults. Until the query settles, a plain loading /
          error screen stands in. */}
      {adminView && !adminQ.isSuccess ? (
        <div className="mx-auto max-w-xl px-4 pb-24 pt-16 text-center">
          <h1 className="font-display text-xl font-black text-white">Admin Panel</h1>
          {adminQ.isError ? (
            <>
              <p className="mt-2 text-sm text-[var(--dim)]">The saved site data could not be loaded, so the panel stays closed — opening it now could overwrite your videos and settings.</p>
              <button type="button" onClick={() => { void adminQ.refetch(); }} className="mt-5 rounded-full bg-[var(--accent)] px-7 py-3 font-display text-sm font-black text-white transition active:scale-95">Try again</button>
            </>
          ) : (
            <p className="mt-2 text-sm text-[var(--dim)]">Loading your site data…</p>
          )}
        </div>
      ) : adminView ? (
        <AdminPanel
          key={adminMountKey}
          initial={adminState}
          onSave={(st) => saveAdmin.mutate(st)}
          onReset={() => resetAdmin.mutate()}
          onExit={() => goTab("home")}
          onOpenVideo={openVideo}
          flash={flash}
          theme={theme}
          onToggleTheme={() => setTheme(theme === "dark" ? "light" : "dark")}
        />
      ) : authView ? (
        /* ===== LOGIN / SIGNUP ===== */
        <div className="mx-auto flex min-h-screen max-w-md flex-col px-4 pb-16 pt-5">
          <button type="button" aria-label="Pulse Video home" onClick={() => goTab("home")} className="flex items-center self-start">
            <LogoText text={texts.logoText ?? "PULSE VIDEO"} />
          </button>
          <form className="mt-10 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6" onSubmit={(e) => { e.preventDefault(); if (authView === "signup" && !ageOk) { flash("Please confirm you are 18 or older"); return; } setSignedIn(true); flash(authView === "signup" ? "Account created — welcome to Pulse Video" : "Welcome back, Guest viewer"); goTab("home"); }}>
            <h1 className="font-display text-lg font-black text-white sm:text-xl">{authView === "login" ? "Log in" : "Create your account"}</h1>
            <button type="button" onClick={() => flash("Google sign-in is not part of this demo")} className="mt-5 w-full rounded-full bg-white py-3 font-bold text-black transition active:scale-[0.99]"><span className="mr-2 font-black text-[#4285f4]">G</span>Continue with Google</button>
            <div className="my-5 flex items-center gap-3 text-sm text-[var(--dim)]"><span className="h-px flex-1 bg-[var(--border)]" />or<span className="h-px flex-1 bg-[var(--border)]" /></div>
            <label className="block text-sm font-semibold text-zinc-200">{authView === "login" ? "Email or username" : "Email"}
              <input required type={authView === "login" ? "text" : "email"} autoComplete={authView === "login" ? "username" : "email"} className="mt-1.5 w-full rounded-xl border border-[var(--border)] bg-[var(--surface2)] px-4 py-3 text-white focus:border-[var(--accent)] focus:outline-none" />
            </label>
            {authView === "signup" && (
              <label className="mt-4 block text-sm font-semibold text-zinc-200">Username
                <input required type="text" autoComplete="username" className="mt-1.5 w-full rounded-xl border border-[var(--border)] bg-[var(--surface2)] px-4 py-3 text-white focus:border-[var(--accent)] focus:outline-none" />
              </label>
            )}
            <label className="mt-4 block text-sm font-semibold text-zinc-200">Password
              <input required type="password" autoComplete={authView === "login" ? "current-password" : "new-password"} className="mt-1.5 w-full rounded-xl border border-[var(--border)] bg-[var(--surface2)] px-4 py-3 text-white focus:border-[var(--accent)] focus:outline-none" />
            </label>
            {authView === "signup" && (
              <label className="mt-4 flex cursor-pointer items-center gap-2.5 text-sm text-zinc-200">
                <input type="checkbox" checked={ageOk} onChange={(e) => setAgeOk(e.target.checked)} className="h-5 w-5 accent-[#f43f5e]" /> I am 18 or older
              </label>
            )}
            <button type="submit" className="mt-6 w-full rounded-full bg-[var(--accent)] py-3.5 font-display text-sm font-black text-white">{authView === "login" ? "Log in" : "Sign up"}</button>
            <p className="mt-4 text-center text-sm text-[var(--dim)]">
              {authView === "login" ? <>No account yet? <button type="button" onClick={() => openAuth("signup")} className="font-bold text-[var(--accent)]">Sign up</button></> : <>Already have an account? <button type="button" onClick={() => openAuth("login")} className="font-bold text-[var(--accent)]">Log in</button></>}
            </p>
          </form>
        </div>
      ) : (
      <>
      {/* ===== Header ===== */}
      <header className="sticky top-0 z-40 border-b border-[var(--border)] bg-black/95 pt-safe backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2.5">
          <button type="button" aria-label="Open menu" onClick={() => setDrawer(true)} className="p-1.5 text-white transition active:scale-90"><Icon n="menu" tone="accent" /></button>
          <button type="button" aria-label="Pulse Video home" onClick={() => goTab("home")} className="flex shrink-0 items-center transition active:scale-[0.97]">
            <LogoText text={texts.logoText ?? "PULSE VIDEO"} />
          </button>
          <nav className="ml-3 hidden items-center gap-4 text-sm font-semibold text-zinc-200 xl:flex" aria-label="Sections">
            <button type="button" onClick={() => openListing({ kind: "feed", name: "New" })} className="py-1 hover:text-white">Videos</button>
            <button type="button" onClick={() => goTab("categories")} className="py-1 hover:text-white">Categories</button>
            <button type="button" onClick={() => goTab("creators")} className="py-1 hover:text-white">Models</button>
            <button type="button" onClick={() => goTab("channels")} className="py-1 hover:text-white">Channels</button>
            <button type="button" onClick={openHistory} className="py-1 hover:text-white">History</button>
          </nav>
          <div className="ml-auto flex items-center gap-1 md:gap-3">
            <button type="button" aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"} aria-pressed={theme === "light"} onClick={() => setTheme(theme === "dark" ? "light" : "dark")} className="p-1.5 text-white transition active:scale-90"><Icon n={theme === "dark" ? "sun" : "moon"} size={21} tone="accent" /></button>
            <button type="button" aria-label="Watch history" onClick={openHistory} className="p-1.5 text-white transition active:scale-90"><Icon n="history" tone="accent" /></button>
            <div className="relative">
              <button type="button" aria-label={`Language: ${LANGS.find((l) => l.code === lang)?.name ?? "English"}`} aria-expanded={langOpen} onClick={() => setLangOpen(!langOpen)} className="flex items-center gap-1 p-1.5 font-semibold text-white transition active:scale-95"><Icon n="globe" size={19} tone="accent" /> {lang.toUpperCase()} <Icon n="chevD" size={15} tone="accent" /></button>
              {langOpen && (
                <div className="absolute right-0 top-full z-50 mt-1 grid max-h-80 w-64 grid-cols-2 gap-0.5 overflow-y-auto rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-2 shadow-2xl" role="menu" aria-label="Choose language">
                  {LANGS.map((l) => (
                    <button key={l.code} type="button" role="menuitem" onClick={() => switchLang(l.code)} className={`rounded-lg px-3 py-2 text-left text-sm ${l.code === lang ? "font-bold text-[var(--accent)]" : "text-zinc-200"}`}>
                      <span className="mr-1.5 rounded bg-[var(--surface2)] px-1.5 py-0.5 text-[11px] font-black uppercase">{l.code}</span>{l.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {signedIn
              ? <button type="button" onClick={() => { setSignedIn(false); flash("Signed out — see you soon"); }} className="hidden p-1.5 font-semibold text-white transition active:scale-95 md:block">Log out</button>
              : <button type="button" onClick={() => openAuth("login")} className="hidden p-1.5 font-semibold text-white transition active:scale-95 md:block">Log in</button>}
            <button type="button" aria-label="Your profile" onClick={() => goTab("profile")} className="p-1.5 text-white transition active:scale-90"><Icon n="user" tone="accent" /></button>
          </div>
        </div>
        <div className="mx-auto max-w-6xl px-4 pb-3">
          <label className="relative block">
            <input {...FIELDS.toggleInteraction.itemKey} aria-label="Search videos, models, tags" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={texts.searchPlaceholder} className="w-full rounded-full border border-[var(--border)] bg-[var(--surface)] py-3 pl-4 pr-11 text-sm text-white placeholder:text-[var(--dim)] focus:border-[var(--accent)] focus:outline-none" />
            {query
              ? <button type="button" aria-label="Clear search" onClick={() => { setQuery(""); if (listing?.kind === "search") goTab("home"); }} className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-[var(--accent)]"><Icon n="x" size={18} tone="accent" /></button>
              : <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--accent)]"><Icon n="search" size={19} tone="accent" /></span>}
          </label>
        </div>
        <div className="no-scrollbar flex items-center gap-6 overflow-x-auto border-t border-[var(--border)] px-4 py-2.5 text-[13px] font-bold tracking-wide md:justify-center">
          <button type="button" onClick={() => flash("Partner link — opens off-site in the full version")} className="flex shrink-0 items-center gap-1.5 text-amber-400"><Icon n="crown" size={16} tone="gold" /> FAPHOUSE</button>
          <button type="button" onClick={() => flash("Partner link — opens off-site in the full version")} className="shrink-0 text-white">BRA<span className="text-amber-400">ZZ</span>ERS</button>
          <button type="button" onClick={() => flash("Partner link — opens off-site in the full version")} className="flex shrink-0 items-center gap-1.5 text-white"><Icon n="cat" size={16} className="text-purple-400" /> PORN LYNX</button>
        </div>
      </header>

      <main id="main" className="mx-auto max-w-6xl px-4 pb-32">

        {/* ===== 404 ===== */}
        {notFound && (
          <section className="pt-10 text-center" aria-label="Page not found">
            <h1 className="font-display text-2xl font-black text-white">Page not found</h1>
            <p className="mt-2 text-[var(--dim)]">This page does not exist or was removed.</p>
            <button type="button" onClick={() => goTab("home")} className="mt-5 rounded-full bg-[var(--accent)] px-8 py-3 font-bold text-white transition active:scale-95">Home</button>
            <nav className="mx-auto mt-9 flex max-w-lg flex-wrap justify-center gap-x-5 gap-y-2.5" aria-label="Categories">
              {CATEGORIES.slice(0, 12).map((c) => (
                <button key={c.name} type="button" onClick={() => openListing({ kind: "category", name: c.name })} className="py-1 text-sm text-zinc-300">{c.name}</button>
              ))}
            </nav>
          </section>
        )}

        {/* ===== GENERATED SEO FILES (#/sitemap.xml, #/robots.txt) ===== */}
        {!notFound && fileView && (() => {
          const base = siteBase();
          const text = fileView === "sitemap" ? buildSitemapXml(base, eff) : buildRobotsTxt(base);
          const name = fileView === "sitemap" ? "sitemap.xml" : "robots.txt";
          const urlCount = 10 + eff.videos.length + eff.categories.length + eff.creators.length + eff.channels.length + eff.tags.length;
          return (
            <section className="pt-5" aria-label={name}>
              <h1 className="font-display text-xl font-black text-white sm:text-2xl">{name}</h1>
              <p className="mt-1 text-sm text-[var(--dim)]">
                {fileView === "sitemap"
                  ? <>Generated from the live catalog — {urlCount} URLs ({eff.videos.length} videos, {eff.categories.length} categories, {eff.creators.length} models, {eff.channels.length} channels, {eff.tags.length} tags). New videos and taxonomy appear here automatically. The URLs are real paths with no # fragment, because crawlers strip fragments and would see every URL as the home page; opening one of these paths in the app resolves to the same page the site&rsquo;s own hash links open. This page is the in-app preview: download the file and, if the site is hosted on a domain with real paths, place it at the root as /sitemap.xml so crawlers can fetch it.</>
                  : <>No # anywhere in this file: in robots.txt a # starts a comment, so the old Disallow: /#/… lines were each read as Disallow: / — blocking the whole site. The file now allows everything and points crawlers to the sitemap. This page is the in-app preview: this site is served as a single page, so if the site is hosted on a domain with real paths, place the downloaded robots.txt and sitemap.xml at the domain root.</>}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <button type="button" onClick={() => downloadTextFile(name, text, fileView === "sitemap" ? "application/xml" : "text/plain")} className="rounded-full bg-[var(--accent)] px-6 py-3 font-display text-sm font-black text-white transition active:scale-95">Download {name}</button>
                <button type="button" onClick={() => { void navigator.clipboard?.writeText(text).then(() => flash(`${name} copied`), () => flash("Copy failed — select the text below instead")); }} className="rounded-full border border-[var(--border)] px-6 py-3 text-sm font-bold text-white transition active:scale-95">Copy</button>
                <button type="button" onClick={() => goTab("home")} className="rounded-full border border-[var(--border)] px-6 py-3 text-sm font-bold text-white transition active:scale-95">Back to site</button>
              </div>
              <pre className="mt-5 max-h-[60vh] overflow-auto whitespace-pre-wrap break-all rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 text-xs leading-relaxed text-zinc-200">{text}</pre>
            </section>
          );
        })()}

        {/* ===== HISTORY ===== */}
        {!notFound && historyView && (
          <section className="pt-5" aria-label="History">
            <h1 className="font-display text-xl font-black text-white sm:text-2xl">History</h1>
            <p className="mt-1 text-sm text-[var(--dim)]">Videos you watched on this device. {!signedIn && <button type="button" onClick={() => openAuth("login")} className="font-semibold text-[var(--accent)]">Log in to keep them on all your devices.</button>}</p>
            {history.length === 0 ? (
              <p className="py-12 text-center text-sm text-zinc-300">Nothing watched yet. Videos you watch on this device appear here.</p>
            ) : (
              <>
                <div className="mt-3 text-right">
                  <button type="button" onClick={() => clearHist.mutate()} className="inline-flex items-center gap-1 py-1 text-sm text-[var(--dim)]"><Icon n="trash" size={15} tone="accent" /> Clear history</button>
                </div>
                <div className="mt-2 mx-auto flex w-full max-w-[760px] flex-col gap-6">
                  {history.map((id) => { const v = byId(id); return v ? <VideoCard key={id} v={v} onOpen={openVideo} /> : null; })}
                </div>
              </>
            )}
          </section>
        )}

        {/* ===== VIDEO PLAYER VIEW ===== */}
        {!notFound && !historyView && current && (
          <section aria-label="Video player" className="pt-4">
            <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1.5 pb-3 text-[13px] text-[var(--dim)]">
              <button type="button" onClick={() => goTab("home")} className="py-0.5 hover:text-white">Home</button>
              <span aria-hidden="true">/</span>
              <button type="button" onClick={() => openListing({ kind: "category", name: current.category })} className="py-0.5 hover:text-white">{current.category}</button>
              <span aria-hidden="true">/</span>
              <span className="line-clamp-1 max-w-[55%] text-zinc-300">{current.title}</span>
            </nav>
            <button type="button" onClick={() => flash(`More from ${current.creator} is waiting in Up next below`)} className="block w-full rounded-xl bg-[var(--surface)] px-3 py-2.5 text-left text-sm"><span className="font-display mr-2 font-black text-[var(--accent)]">WATCH MORE</span><span className="text-zinc-200">Click here for more exclusive content</span></button>
            {current.embedUrl ? (
              <EmbedPlayer v={current} />
            ) : (
            <div ref={playerRef} className={`pv-darkzone pv-fs relative overflow-hidden ${artFs.expanded ? "fixed inset-0 z-[85] m-0 h-[100dvh] w-full bg-black" : "-mx-4 mt-3 sm:mx-0 sm:rounded-xl"}`} style={artFs.expanded ? (artFs.rotated ? { width: "100dvh", height: "100dvw", left: "50%", top: "50%", transform: "translate(-50%, -50%) rotate(90deg)", background: `linear-gradient(135deg, ${current.g[0]}, ${current.g[1]})` } : { background: `linear-gradient(135deg, ${current.g[0]}, ${current.g[1]})` }) : { aspectRatio: "16/9", background: `linear-gradient(135deg, ${current.g[0]}, ${current.g[1]})` }}>
              <Motif v={current} big />
              <span className="absolute inset-0 bg-black/25" aria-hidden="true" />
              {!playing && (
                <>
                  <button type="button" aria-label={progress > 0 ? "Resume video" : "Play video"} onClick={startPlayback} className="play-pulse absolute left-1/2 top-1/2 flex h-20 w-20 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-[var(--accent)] text-white">
                    <Icon n="play" size={34} />
                  </button>
                  <span className="absolute left-1/2 top-[calc(50%+58px)] -translate-x-1/2 rounded-full bg-black/70 px-4 py-1.5 text-sm font-bold text-white">{btnLabel("watchFull", "Watch Full Video")}</span>
                </>
              )}
              {playing && <button type="button" aria-label="Pause video" onClick={startPlayback} className="absolute inset-0" />}
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent px-3 pb-2 pt-8">
                <div className="flex items-center gap-3 text-white [&_button]:transition [&_button]:active:scale-90">
                  <button type="button" aria-label={playing ? "Pause" : "Play"} onClick={startPlayback} className="p-1"><Icon n={playing ? "pause" : "play"} size={20} tone="accent" /></button>
                  <span className="text-sm font-medium tabular-nums">{fmtTime((progress / 100) * current.durationSec)} / {current.duration}</span>
                  <span className="ml-auto flex items-center gap-1">
                    <button type="button" aria-label={muted ? "Unmute" : "Mute"} onClick={() => setMuted(!muted)} className="p-1.5"><Icon n={muted ? "mute" : "volume"} size={20} tone="accent" /></button>
                    <input aria-label="Volume" type="range" min={0} max={100} value={muted ? 0 : volume} onChange={(e) => { setVolume(Number(e.target.value)); setMuted(false); }} className="hidden w-16 accent-[#f43f5e] sm:block" />
                    <button type="button" aria-label={`Playback speed ${speed}x`} onClick={() => setSpeed(speed === 1 ? 1.5 : speed === 1.5 ? 2 : 1)} className="p-1.5 text-sm font-bold">Speed: {speed}x</button>
                    <button type="button" aria-label="Mini player" onClick={() => flash("Mini player is not available in this demo player")} className="p-1.5"><Icon n="pip" size={20} tone="accent" /></button>
                    <button type="button" aria-label={artFs.big ? "Exit fullscreen" : "Fullscreen"} aria-pressed={artFs.big} onClick={artFs.toggle} className="p-1.5"><Icon n={artFs.big ? "compress" : "expand"} size={20} tone="accent" /></button>
                  </span>
                </div>
                <button type="button" aria-label="Seek" onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setProgress(Math.min(100, Math.max(0, ((e.clientX - r.left) / r.width) * 100))); }} className="mt-1 block h-4 w-full">
                  <span className="block h-1 w-full rounded bg-white/30"><span className="block h-1 rounded bg-[var(--accent)]" style={{ width: `${progress}%` }} /></span>
                </button>
              </div>
            </div>
            )}

            <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-6">
            <div className="min-w-0">
            <h1 className="font-display mt-4 text-lg font-extrabold leading-tight text-white sm:text-xl">{current.title}</h1>
            <p className="mt-1.5 flex flex-wrap gap-x-3 text-[13px] text-[var(--dim)]">
              {current.hasViews && <span>{fmtViews(current.views)} views</span>}
              {current.hasDate && <span>{current.age}</span>}
              {current.hasRating && <span className="font-semibold text-[var(--accent)]">{current.rating}% liked</span>}
            </p>

            <div className="no-scrollbar mt-3 flex items-center gap-3 overflow-x-auto border-b border-[var(--border)] pb-3 text-white [&>button]:shrink-0">
              <button type="button" aria-label="Like video" aria-pressed={likes.includes(current.id)} onClick={() => toggle.mutate({ kind: "like", itemKey: current.id })} className={`flex items-center gap-1.5 rounded-full bg-[var(--surface2)] px-3.5 py-2 transition active:scale-90 ${likes.includes(current.id) ? "text-[var(--accent)]" : ""}`}><Icon n="like" size={19} tone="accent" /><span className="text-sm font-semibold">{btnLabel("like", "Like")}</span></button>
              <button type="button" aria-label="Dislike video" onClick={() => flash("Thanks for the feedback")} className="flex items-center gap-1.5 rounded-full bg-[var(--surface2)] px-3.5 py-2 transition active:scale-90"><Icon n="dislike" size={19} tone="accent" /><span className="text-sm font-semibold">Dislike</span></button>
              <button type="button" aria-label="Save to Watch later" aria-pressed={saves.includes(current.id)} onClick={() => toggle.mutate({ kind: "save", itemKey: current.id })} className={`flex items-center gap-1.5 rounded-full bg-[var(--surface2)] px-3.5 py-2 transition active:scale-90 ${saves.includes(current.id) ? "text-[var(--accent)]" : ""}`}><Icon n="bookmark" size={19} tone="accent" /><span className="text-sm font-semibold">{btnLabel("save", "Save")}</span></button>
              <button type="button" aria-label="Add to playlist" onClick={() => { if (!saves.includes(current.id)) toggle.mutate({ kind: "save", itemKey: current.id }); flash("Added to your Watch later playlist"); }} className="flex items-center gap-1.5 rounded-full bg-[var(--surface2)] px-3.5 py-2 transition active:scale-90"><Icon n="list" size={19} tone="accent" /><span className="text-sm font-semibold">Playlist</span></button>
              <button type="button" aria-label="Share video" onClick={() => flash("Link ready — use your browser's share menu to send it")} className="p-2 transition active:scale-90"><Icon n="share" size={20} tone="accent" /></button>
              <button type="button" aria-label="Comments" onClick={() => setCommentsOpen(!commentsOpen)} className="flex items-center gap-1 p-2 transition active:scale-90"><Icon n="comment" size={20} tone="accent" /><span className="text-sm font-semibold">2</span></button>
              <button type="button" aria-label="Report video" onClick={() => flash("Thanks — our team will take a look")} className="flex items-center gap-1.5 rounded-full bg-[var(--surface2)] px-3.5 py-2 transition active:scale-90"><Icon n="flag" size={19} tone="accent" /><span className="text-sm font-semibold">Report</span></button>
              <button type="button" aria-label="Download video" onClick={() => flash("Downloads are not part of this demo")} className="p-2 transition active:scale-90"><Icon n="download" size={20} tone="accent" /></button>
            </div>

            {current.creator && (
            <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
              <button type="button" onClick={() => openListing({ kind: "creator", name: current.creator })} className="flex items-center gap-2.5 transition active:scale-[0.97]" aria-label={`More videos by ${current.creator}`}>
                {(() => { const c = CREATORS.find((x) => x.name === current.creator); return c ? <Avatar name={c.name} g={c.g} size={40} /> : null; })()}
                <span className="text-left"><span className="block text-sm font-bold text-white">{current.creator}</span><span className="block text-xs text-[var(--dim)]">{follows.includes(current.creator) ? "You follow this model" : "Model"}</span></span>
              </button>
              <button type="button" onClick={() => toggle.mutate({ kind: "follow", itemKey: current.creator })} className={`ml-auto rounded-full px-5 py-2.5 font-bold ${follows.includes(current.creator) ? "bg-[var(--surface2)] text-white" : "bg-[var(--accent)] text-white"}`}>{follows.includes(current.creator) ? "Following" : btnLabel("follow", "Follow")}</button>
            </div>
            )}

            <div className="mt-4">
              <div ref={tagsRef} className={`flex flex-wrap items-center gap-x-4 gap-y-2 text-sm ${tagsOpen ? "" : "max-h-6 overflow-hidden"}`}>
                <button type="button" onClick={() => openListing({ kind: "category", name: current.category })} className="py-0.5 font-medium text-zinc-300 transition hover:text-[var(--accent)]">{current.category}</button>
                {current.tags.map((t) => (
                  <button key={t} type="button" onClick={() => openListing({ kind: "tag", name: t })} className="py-0.5 font-medium capitalize text-zinc-300 transition hover:text-[var(--accent)]">{t}</button>
                ))}
              </div>
              {(tagsOverflow || tagsOpen) && (
                <button type="button" onClick={() => setTagsOpen(!tagsOpen)} aria-expanded={tagsOpen} className="mt-1 py-1 text-sm font-semibold text-[var(--accent)] transition active:scale-95">{tagsOpen ? "See less" : "See more"}</button>
              )}
            </div>

            <div className="mt-5">
              <button type="button" onClick={() => setDescOpen(!descOpen)} aria-expanded={descOpen} className="py-1 font-semibold text-[var(--accent)] underline decoration-[var(--accent)]/60 underline-offset-4 transition hover:decoration-[var(--accent)] active:scale-95">{descOpen ? "Hide description" : "Show description"}</button>
              {descOpen && (
                <div className="mt-3">
                  {(current.description || !current.custom) && (
                    <p className="text-sm leading-relaxed text-zinc-200">
                      {current.description ?? `Filmed and edited by ${current.creator}, this ${current.category.toLowerCase()} video covers ${current.tags.join(", ")}. It has been watched ${fmtViews(current.views)} times and ${current.rating}% of viewers liked it. Watch in up to 4K, save it to Watch later, or follow ${current.creator} so new uploads land in your Following list.`}
                    </p>
                  )}
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-white">Categories:</span>
                    <button type="button" onClick={() => openListing({ kind: "category", name: current.category })} className="rounded-md bg-[var(--surface2)] px-3 py-1.5 text-sm font-medium text-zinc-100 transition hover:text-[var(--accent)] active:scale-95">{current.category}</button>
                  </div>
                  {current.creator && (
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-white">Models:</span>
                      <button type="button" onClick={() => openListing({ kind: "creator", name: current.creator })} className="rounded-md bg-[var(--surface2)] px-3 py-1.5 text-sm font-medium text-zinc-100 transition hover:text-[var(--accent)] active:scale-95">{current.creator}</button>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="mt-6 border-t border-[var(--border)] pt-4">
              <h2 className="font-display text-xl font-extrabold text-white">Comments <span className="text-[var(--dim)]">2</span></h2>
              {commentsOpen ? (
                <div className="mt-3 space-y-4">
                  <p className="text-sm text-zinc-200"><span className="font-bold text-white">travel.fan</span> <span className="text-[var(--dim)]">· 3 days ago</span><br />Great pacing — the middle section was my favourite part.</p>
                  <p className="text-sm text-zinc-200"><span className="font-bold text-white">nightowl</span> <span className="text-[var(--dim)]">· 1 week ago</span><br />Watched this twice already. Instant save.</p>
                  <button type="button" onClick={() => setCommentsOpen(false)} className="py-1 font-semibold text-[var(--dim)]">Hide comments</button>
                </div>
              ) : (
                <button type="button" onClick={() => setCommentsOpen(true)} className="mt-3 w-full rounded-full border border-[var(--border)] py-2.5 font-bold text-white">Show comments</button>
              )}
            </div>
            </div>

            <aside className="mt-8 min-w-0 lg:mt-3" aria-label="Suggested videos">
              {suggested.length > 0 && (
                <>
                  <h2 className="font-display mb-3 mt-6 flex items-center gap-2 text-lg font-black text-white sm:text-xl">Suggested for you <span className="rounded bg-amber-400 px-1.5 py-0.5 text-[11px] font-black text-black">Ad</span></h2>
                  <div className="flex flex-col gap-5">
                    {suggested.map((v) => <VideoCard key={v.id} v={v} onOpen={openVideo} />)}
                  </div>
                  <NextButton label={btnLabel("next", "Next")} onClick={() => openListing({ kind: "feed", name: "Top rated" })} />
                </>
              )}
              <div className="mb-3 mt-7 flex items-center justify-between">
                <h2 className="font-display text-lg font-black text-white sm:text-xl">Up next</h2>
                <button type="button" role="switch" aria-checked={autoplay} aria-label="Autoplay" onClick={() => setAutoplay(!autoplay)} className="flex items-center gap-2 py-1 text-sm font-medium text-[var(--dim)]">
                  Autoplay
                  <span className={`relative h-6 w-11 rounded-full transition-colors ${autoplay ? "bg-[var(--accent)]" : "bg-zinc-600"}`}><span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${autoplay ? "left-[22px]" : "left-0.5"}`} /></span>
                </button>
              </div>
              <div className="flex flex-col gap-5">
                {upNext.map((v, i) => <VideoCard key={v.id} v={v} onOpen={openVideo} badge={i === 0 ? "UP NEXT" : undefined} />)}
              </div>
              {upNext[0] && <NextButton label="Next video" onClick={() => { const n = upNext[0]; if (n) openVideo(n); }} />}
            </aside>
            </div>

            {moreLikeThis.length > 0 && (
              <section aria-label="More like this" className="pt-8">
                <h2 className="font-display text-lg font-black text-white sm:text-xl">More like this</h2>
                <div className="mt-3 mx-auto flex w-full max-w-[760px] flex-col gap-6">
                  {moreLikeThis.map((v) => <VideoCard key={v.id} v={v} onOpen={openVideo} />)}
                </div>
                <NextButton label={btnLabel("next", "Next")} onClick={() => openListing({ kind: "category", name: current.category })} />
              </section>
            )}

            <section aria-label={`Because you watch ${becauseTag}`} className="pt-9">
              <div className="flex items-baseline justify-between">
                <h2 className="font-display text-lg font-black text-white sm:text-xl">{texts.secBecause} {titleCase(becauseTag)}</h2>
                <button type="button" onClick={() => openListing({ kind: "tag", name: becauseTag })} className="py-1 text-[13px] text-[var(--dim)]">{btnLabel("seeAll", "See all")}</button>
              </div>
              <div className="mt-3 mx-auto flex w-full max-w-[760px] flex-col gap-6">
                {VIDEOS.filter((v) => v.id !== current.id && (v.tags.includes(becauseTag) || v.category === current.category)).slice(0, 4).map((v) => <VideoCard key={v.id} v={v} onOpen={openVideo} />)}
              </div>
              <NextButton label={btnLabel("next", "Next")} onClick={() => openListing({ kind: "tag", name: becauseTag })} />
            </section>

            <section aria-label="Trending now" className="pt-9">
              <div className="flex items-baseline justify-between">
                <h2 className="font-display text-lg font-black text-white sm:text-xl">{texts.secTrending}</h2>
                <button type="button" onClick={() => openListing({ kind: "feed", name: "Trending" })} className="py-1 text-[13px] text-[var(--dim)]">{btnLabel("seeAll", "See all")}</button>
              </div>
              <div className="mt-3 mx-auto flex w-full max-w-[760px] flex-col gap-6">
                {trending.slice(0, 6).map((v, i) => <VideoCard key={v.id} v={v} onOpen={openVideo} rank={i + 1} />)}
              </div>
              <NextButton label={btnLabel("next", "Next")} onClick={() => openListing({ kind: "feed", name: "Trending" })} />
            </section>

            <nav aria-label="Breadcrumb" className="mt-9 flex flex-wrap items-center gap-1.5 border-t border-[var(--border)] pt-4 text-sm text-[var(--dim)]">
              <button type="button" onClick={() => goTab("home")} className="py-1 hover:text-white">Home</button>
              <span aria-hidden="true">/</span>
              <button type="button" onClick={() => openListing({ kind: "category", name: current.category })} className="py-1 hover:text-white">{current.category}</button>
              <span aria-hidden="true">/</span>
              <span className="line-clamp-1 max-w-[55%] text-zinc-300">{current.title}</span>
            </nav>
          </section>
        )}

        {/* ===== LISTING (tag / category / model / channel / feed / search results) ===== */}
        {!notFound && !historyView && !current && listing && (() => {
          const base = listingVideos(listing);
          let list = [...base];
          if (sortBy === "Most viewed" || sortBy === "Popular") list.sort((a, b) => b.views - a.views);
          else if (sortBy === "Trending") list.sort((a, b) => b.views / (b.days + 1) - a.views / (a.days + 1));
          else if (sortBy === "Top rated") list.sort((a, b) => b.rating - a.rating);
          else if (sortBy === "Longest") list.sort((a, b) => b.durationSec - a.durationSec);
          else if (sortBy === "Newest") list.sort((a, b) => a.days - b.days);
          const f = appliedFilters;
          if (f.len === "Under 5 min") list = list.filter((v) => v.durationSec < 300);
          else if (f.len === "5–10 min") list = list.filter((v) => v.durationSec >= 300 && v.durationSec < 600);
          else if (f.len === "10–20 min") list = list.filter((v) => v.durationSec >= 600 && v.durationSec < 1200);
          else if (f.len === "20–40 min") list = list.filter((v) => v.durationSec >= 1200 && v.durationSec < 2400);
          else if (f.len === "Over 40 min") list = list.filter((v) => v.durationSec >= 2400);
          if (f.quality === "Full HD 1080p") list = list.filter((v) => v.hd);
          if (f.added === "Today") list = list.filter((v) => v.days <= 1);
          else if (f.added === "This week") list = list.filter((v) => v.days <= 7);
          else if (f.added === "This month") list = list.filter((v) => v.days <= 30);
          else if (f.added === "This year") list = list.filter((v) => v.days <= 365);
          if (f.incl.length) list = list.filter((v) => f.incl.includes(v.category));
          if (f.excl.length) list = list.filter((v) => !f.excl.includes(v.category));
          if (hideWatched) list = list.filter((v) => !history.includes(v.id));
          const totalPages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
          const safePage = Math.min(listPage, totalPages);
          const paged = list.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
          const creatorInfo = listing.kind === "creator" ? CREATORS.find((c) => c.name === listing.name) : undefined;
          const heading = listingHeading(listing);
          const related = relatedFor(listing);
          const tagEmpty = listing.kind === "tag" && base.length === 0;
          if (tagEmpty) {
            return (
              <section className="pt-10 text-center" aria-label="Tag not found">
                <h1 className="font-display text-2xl font-black text-white">Page not found</h1>
                <p className="mt-2 text-[var(--dim)]">This page does not exist or was removed.</p>
                <button type="button" onClick={() => goTab("home")} className="mt-5 rounded-full bg-[var(--accent)] px-8 py-3 font-bold text-white">Home</button>
              </section>
            );
          }
          return (
            <section className="pt-5" aria-label={heading}>
              <div className="no-scrollbar -mx-4 flex gap-6 overflow-x-auto px-4" role="tablist" aria-label="Feed filters">
                {FEED_TABS.map((t) => {
                  const active = listing.kind === "feed" && listing.name === t;
                  return (
                    <button key={t} role="tab" aria-selected={active} type="button" onClick={() => { if (t === "For you") { goTab("home"); } else { setFeed(t); openListing({ kind: "feed", name: t }); } }} className={`relative flex min-h-11 shrink-0 items-start pt-1.5 pb-2 text-sm font-semibold transition active:scale-95 ${active ? "text-white" : "text-[var(--dim)]"}`}>
                      {t}
                      {active && <span className="absolute inset-x-0 -bottom-px h-[3px] rounded bg-[var(--accent)]" />}
                    </button>
                  );
                })}
              </div>
              <nav aria-label="Breadcrumb" className="mt-4 flex flex-wrap items-center gap-1.5 text-[13px] text-[var(--dim)]">
                <button type="button" onClick={() => goTab("home")} className="py-0.5 hover:text-white">Home</button>
                <span aria-hidden="true">/</span>
                <button type="button" onClick={() => listingBack(listing)} className="py-0.5 hover:text-white">{listingSegment(listing)}</button>
                <span aria-hidden="true">/</span>
                <span className="line-clamp-1 max-w-[55%] font-semibold capitalize text-zinc-200">{listing.kind === "feed" ? heading : listing.name}</span>
              </nav>
              <button type="button" onClick={() => listingBack(listing)} className="mt-3 rounded-full border border-[var(--border)] px-4 py-2 text-sm font-bold text-white transition active:scale-95">← Back to {listingSegment(listing)}</button>
              <h1 className="font-display mt-4 text-xl font-black capitalize leading-tight text-white sm:text-2xl">{heading}</h1>
              <p className="mt-1 text-[13px] text-[var(--dim)]">{listingCount(listing, list)}{listing.kind === "creator" && creatorInfo ? ` · ${creatorInfo.followers} followers` : ""}</p>

              {listing.kind === "search" && (
                <>
                  <div className="mt-4 flex gap-2">
                    <label className="relative flex-1">
                      <input {...FIELDS.toggleInteraction.itemKey} aria-label="Search term" value={searchDraft} onChange={(e) => setSearchDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && searchDraft.trim()) { const text = searchDraft.trim(); void (async () => { if (await tryAdminCode(text)) { setSearchDraft(""); setQuery(""); goAdmin(); } else openListing({ kind: "search", name: text }); })(); } }} className="w-full rounded-full border border-[var(--border)] bg-[var(--surface)] py-3 pl-4 pr-11 text-sm text-white placeholder:text-[var(--dim)] focus:border-[var(--accent)] focus:outline-none" />
                      {searchDraft
                        ? <button type="button" aria-label="Clear search" onClick={() => { setSearchDraft(""); setQuery(""); goTab("tags"); }} className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-[var(--accent)]"><Icon n="x" size={18} tone="accent" /></button>
                        : <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--accent)]"><Icon n="search" size={19} tone="accent" /></span>}
                    </label>
                    <button type="button" onClick={() => { setSearchDraft(""); setQuery(""); goTab("tags"); }} className="shrink-0 rounded-full border border-[var(--border)] px-5 font-bold text-white">Clear</button>
                  </div>
                  <nav className="mt-4" aria-label="Related searches">
                    <span className="text-sm font-semibold text-[var(--dim)]">Related searches: </span>
                    {related.map((r) => (
                      <button key={r} type="button" onClick={() => openListing({ kind: "search", name: r })} className="mr-3 py-1 text-sm capitalize text-zinc-300 hover:text-white">{r}</button>
                    ))}
                  </nav>
                </>
              )}

              {listing.kind === "creator" && creatorInfo && (
                <div className="mt-4">
                  <div className="flex flex-wrap items-center gap-4">
                    <Avatar name={creatorInfo.name} g={creatorInfo.g} size={100} />
                    <div>
                      <p className="text-[13px] text-[var(--dim)]">{creatorInfo.videos} videos · {creatorInfo.followers} followers</p>
                      <button type="button" aria-pressed={follows.includes(listing.name)} onClick={() => toggle.mutate({ kind: "follow", itemKey: listing.name })} className={`mt-2 rounded-full px-6 py-2.5 font-bold ${follows.includes(listing.name) ? "bg-[var(--surface2)] text-white" : "bg-[var(--accent)] text-white"}`}>{follows.includes(listing.name) ? "Following" : btnLabel("follow", "Follow")}</button>
                    </div>
                  </div>
                  <p className={`mt-3 max-w-2xl text-sm leading-relaxed text-zinc-300 ${bioOpen ? "" : "line-clamp-2"}`}>{creatorInfo.name} is one of the most-watched models on Pulse Video, with {creatorInfo.videos} videos and {creatorInfo.followers} followers. New uploads land every week — follow {creatorInfo.name} and they will show up in your Following list on your profile.</p>
                  <button type="button" onClick={() => setBioOpen(!bioOpen)} className="mt-1 py-1 font-semibold text-[var(--accent)]">{bioOpen ? "Less" : "More"}</button>
                </div>
              )}

              <div className="mt-5 flex flex-wrap items-center gap-2.5">
                <label className="flex items-center gap-2 text-sm text-[var(--dim)]">
                  <span className="sr-only">Sort videos</span>
                  <select aria-label="Sort videos" value={sortBy} onChange={(e) => {
                    const v = e.target.value;
                    setListPage(1);
                    scrollTopInstant();
                    if (listing.kind === "feed") {
                      if (v === "Newest") { openListing({ kind: "feed", name: "New" }); return; }
                      if (v === "Top rated") { openListing({ kind: "feed", name: "Top rated" }); return; }
                      if (v === "Popular") { openListing({ kind: "feed", name: "Trending" }); return; }
                    }
                    setSortBy(v);
                  }} className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-4 py-2.5 font-semibold text-white focus:border-[var(--accent)] focus:outline-none">
                    {sortOptionsFor(listing).map((o) => <option key={o}>{o}</option>)}
                  </select>
                </label>
                <button type="button" aria-expanded={filtersOpen} onClick={() => { setDraftFilters(appliedFilters); setFiltersOpen(true); }} className="flex items-center gap-1.5 rounded-full border border-[var(--border)] px-4 py-2.5 text-sm font-bold text-white"><Icon n="funnel" size={16} tone="accent" /> Filters</button>
                <button type="button" role="switch" aria-checked={hideWatched} aria-label="Hide watched" onClick={() => { setHideWatched(!hideWatched); scrollTopInstant(); }} className="flex items-center gap-2 py-1 text-sm font-medium text-[var(--dim)]">
                  Hide watched
                  <span className={`relative h-6 w-11 rounded-full transition-colors ${hideWatched ? "bg-[var(--accent)]" : "bg-zinc-600"}`}><span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${hideWatched ? "left-[22px]" : "left-0.5"}`} /></span>
                </button>
              </div>

              {list.length === 0 ? (
                <div className="py-12 text-center">
                  {base.length === 0 ? (
                    <>
                      <p className="font-semibold text-white">No videos here yet</p>
                      <p className="mt-1 text-sm text-[var(--dim)]">Here are the top rated videos instead:</p>
                      <div className="mt-5 mx-auto flex w-full max-w-[760px] flex-col gap-6 text-left">{topRated.slice(0, 4).map((v) => <VideoCard key={v.id} v={v} onOpen={openVideo} />)}</div>
                    </>
                  ) : (
                    <>
                      <p className="font-semibold text-white">No videos match these filters</p>
                      <p className="mt-1 text-sm text-[var(--dim)]">Try clearing the filters or Hide watched.</p>
                      <button type="button" onClick={() => { setAppliedFilters(NO_FILTERS); setHideWatched(false); }} className="mt-4 rounded-full bg-[var(--accent)] px-6 py-2.5 font-bold text-white">Clear filters</button>
                    </>
                  )}
                </div>
              ) : (
                <div className="mt-5 mx-auto flex w-full max-w-[760px] flex-col gap-6">
                  {paged.map((v) => <VideoCard key={v.id} v={v} onOpen={openVideo} />)}
                </div>
              )}

              <NextButton disabled={safePage >= totalPages} onClick={() => { setListPage(safePage + 1); scrollTopInstant(); }} />
              <Pagination page={safePage} total={totalPages} nextLabel={btnLabel("next", "Next")} onChange={(p) => { setListPage(p); scrollTopInstant(); }} />

              {listing.kind !== "search" && (
                <nav className="mt-9" aria-label="Related searches">
                  <h2 className="text-sm font-bold uppercase tracking-wide text-[var(--dim)]">Related searches</h2>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5">
                    {related.map((r) => (
                      <button key={r} type="button" onClick={() => openListing({ kind: "search", name: r })} className="py-1 text-sm capitalize text-zinc-300 hover:text-white">{r}</button>
                    ))}
                  </div>
                </nav>
              )}
            </section>
          );
        })()}

        {/* ===== HOME ===== */}
        {!notFound && !historyView && !current && !listing && !fileView && tab === "home" && (
          <>
            <h1 className="font-display pt-5 text-xl font-black leading-tight text-white sm:text-2xl">{texts.homeH1}</h1>
            <div className="no-scrollbar -mx-4 flex gap-6 overflow-x-auto px-4 pt-3" role="tablist" aria-label="Feed filters">
              {FEED_TABS.map((t) => {
                const active = t === "For you";
                return (
                  <button key={t} role="tab" aria-selected={active} type="button" onClick={() => { if (t === "For you") { goTab("home"); } else { setFeed(t); openListing({ kind: "feed", name: t }); } }} className={`relative flex min-h-11 shrink-0 items-start pt-1.5 pb-2 text-sm font-semibold transition active:scale-95 ${active ? "text-white" : "text-[var(--dim)]"}`}>
                    {t}
                    {active && <span className="absolute inset-x-0 -bottom-px h-[3px] rounded bg-[var(--accent)]" />}
                  </button>
                );
              })}
            </div>
            <div className="no-scrollbar -mx-4 flex gap-2.5 overflow-x-auto border-b border-[var(--border)] px-4 py-3">
              {chipNames.map((name) => (
                <button key={name} type="button" aria-pressed={chip === name} onClick={() => { setChip(name); setShowAll(false); scrollTopInstant(); }} className={`flex min-h-11 shrink-0 items-center rounded-full px-4 text-[13px] font-semibold transition active:scale-95 ${chip === name ? "bg-white text-black" : "text-zinc-300 hover:text-white"}`}>{name}</button>
              ))}
              <button type="button" onClick={() => goTab("categories")} className="flex min-h-11 shrink-0 items-center text-[13px] font-bold text-[var(--accent)]">All {CATEGORIES.length}</button>
            </div>

            <section aria-label="Trending now" className="pt-5">
              <div className="flex items-baseline justify-between">
                <h2 className="font-display text-lg font-black sm:text-xl text-white">{texts.secTrending}</h2>
                <button type="button" onClick={() => { setFeed("Trending"); openListing({ kind: "feed", name: "Trending" }); }} className="py-1 text-[13px] text-[var(--dim)]">{btnLabel("seeAll", "See all")}</button>
              </div>
              <div className="mx-auto mt-3 flex w-full max-w-[760px] flex-col gap-6">
                {trending.map((v, i) => <VideoCard key={v.id} v={v} onOpen={openVideo} rank={i + 1} />)}
              </div>
            <NextButton label={btnLabel("next", "Next")} onClick={() => { setFeed("Trending"); openListing({ kind: "feed", name: "Trending" }); }} />
            </section>

            <section aria-label="Latest videos" className="pt-7">
              <div className="flex items-baseline justify-between">
                <h2 className="font-display text-lg font-black sm:text-xl text-white">{chip === "All" ? texts.secLatest : `${chip} videos`}</h2>
                <button type="button" onClick={() => openListing({ kind: "feed", name: "New" })} className="py-1 text-[13px] text-[var(--dim)]">{btnLabel("seeAll", "See all")}</button>
              </div>
              {latestHome.length === 0 ? (
                <p className="py-10 text-center text-[var(--dim)]">No videos in this category yet.</p>
              ) : (
                <div className="mt-3 mx-auto flex w-full max-w-[760px] flex-col gap-6">
                  {latestHome.map((v) => <VideoCard key={v.id} v={v} onOpen={openVideo} badge={v.days <= 6 ? "NEW" : undefined} />)}
                </div>
              )}
              {!showAll && (chip === "All" ? newest.length : newest.filter((v) => v.category === chip || v.tags.includes(chip.toLowerCase())).length) > 24 && (
                <div className="mt-7 text-center">
                  <button type="button" onClick={() => setShowAll(true)} className="rounded-full bg-white px-10 py-3.5 font-bold text-black">{btnLabel("showMore", "Show more")}</button>
                </div>
              )}
            <NextButton label={btnLabel("next", "Next")} onClick={() => openListing({ kind: "feed", name: "New" })} />
            </section>

            {/* The home showcase lists only models that actually have
                videos; the full list (including empty ones) stays on
                the Models tab. With none, the section hides instead of
                parading "0 videos" entries. */}
            {CREATORS.some((c) => c.videos > 0) && (
            <section aria-label="Popular models" className="pt-9">
              <div className="flex items-baseline justify-between">
                <h2 className="font-display text-lg font-black sm:text-xl text-white">{texts.secModels}</h2>
                <button type="button" onClick={() => goTab("creators")} className="py-1 text-[13px] text-[var(--dim)]">All models</button>
              </div>
              <div className="no-scrollbar -mx-4 mt-4 flex gap-5 overflow-x-auto px-4 pb-1 [scroll-snap-type:x_mandatory] sm:mx-0 sm:grid sm:grid-cols-4 sm:overflow-visible sm:px-0 lg:grid-cols-6">
                {CREATORS.filter((c) => c.videos > 0).slice(0, 12).map((c) => (
                  <div key={c.name} className="flex w-[104px] shrink-0 snap-start flex-col items-center text-center sm:w-auto">
                    <button type="button" aria-label={`Videos by ${c.name}`} onClick={() => openListing({ kind: "creator", name: c.name })} className="transition active:scale-95"><Avatar name={c.name} g={c.g} size={100} /></button>
                    <span className="mt-2 line-clamp-1 max-w-full text-sm font-bold text-white">{c.name}</span>
                    <span className="text-xs text-[var(--dim)]">{c.videos} videos</span>
                  </div>
                ))}
              </div>
            </section>
            )}

            {/* Same rule as Popular models: only channels with videos
                are showcased on home; empty ones stay on the Channels
                tab, and the section hides when none qualify. */}
            {CHANNELS.some((ch) => Number(ch.videos) > 0) && (
            <section aria-label="Channels" className="pt-9">
              <div className="flex items-baseline justify-between">
                <h2 className="font-display text-lg font-black sm:text-xl text-white">{texts.secChannels}</h2>
                <button type="button" onClick={() => goTab("channels")} className="py-1 text-[13px] text-[var(--dim)]">All channels</button>
              </div>
              <div className="mt-2">
                {CHANNELS.filter((ch) => Number(ch.videos) > 0).map((ch) => (
                  <button key={ch.name} type="button" onClick={() => openListing({ kind: "channel", name: ch.name })} className="flex w-full items-baseline justify-between border-b border-[var(--border)] py-3 text-left transition active:bg-[var(--surface)]" aria-label={`Channel ${ch.name}`}>
                    <span className="text-sm font-semibold text-white">{ch.name}</span>
                    <span className="text-xs text-[var(--dim)]">{ch.videos} videos</span>
                  </button>
                ))}
              </div>
            </section>
            )}

            <section aria-label={`Because you watch ${becauseCat}`} className="pt-9">
              <div className="flex items-baseline justify-between">
                <h2 className="font-display text-lg font-black sm:text-xl text-white">{texts.secBecause} {becauseCat}</h2>
                <button type="button" onClick={() => openListing({ kind: "category", name: becauseCat })} className="py-1 text-[13px] text-[var(--dim)]">{btnLabel("seeAll", "See all")}</button>
              </div>
              <div className="mt-3 mx-auto flex w-full max-w-[760px] flex-col gap-6">
                {becauseList.map((v) => <VideoCard key={v.id} v={v} onOpen={openVideo} />)}
              </div>
            <NextButton label={btnLabel("next", "Next")} onClick={() => openListing({ kind: "category", name: becauseCat })} />
            </section>

            <section aria-label="Top rated" className="pt-9">
              <div className="flex items-baseline justify-between">
                <h2 className="font-display text-lg font-black sm:text-xl text-white">{texts.secTopRated}</h2>
                <button type="button" onClick={() => { setFeed("Top rated"); openListing({ kind: "feed", name: "Top rated" }); }} className="py-1 text-[13px] text-[var(--dim)]">{btnLabel("seeAll", "See all")}</button>
              </div>
              <div className="mt-3 mx-auto flex w-full max-w-[760px] flex-col gap-6">
                {topRated.slice(0, 8).map((v) => <VideoCard key={v.id} v={v} onOpen={openVideo} />)}
              </div>
            <NextButton label={btnLabel("next", "Next")} onClick={() => { setFeed("Top rated"); openListing({ kind: "feed", name: "Top rated" }); }} />
            </section>

          </>
        )}

        {/* ===== CHANNELS ===== */}
        {!notFound && !historyView && !current && !listing && tab === "channels" && (
          <section className="pt-5" aria-label="Channels">
            <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1.5 text-[13px] text-[var(--dim)]">
              <button type="button" onClick={() => goTab("home")} className="py-0.5 hover:text-white">Home</button>
              <span aria-hidden="true">/</span>
              <span className="font-semibold text-zinc-200">Channels</span>
            </nav>
            <h1 className="font-display mt-3 text-xl font-black text-white sm:text-2xl">Top Rated Channels</h1>
            <p className="mt-1 text-[13px] text-[var(--dim)]">{CHANNELS.length} channels</p>
            <div className="mt-5 grid grid-cols-2 gap-4 sm:gap-5 lg:grid-cols-3">
              {CHANNELS.map((ch) => (
                <button key={ch.name} type="button" onClick={() => openListing({ kind: "channel", name: ch.name })} className="relative block overflow-hidden rounded-xl text-left transition active:scale-[0.98]" style={{ aspectRatio: "16/9", background: `linear-gradient(135deg, ${ch.g[0]}, ${ch.g[1]})` }} aria-label={`Channel ${ch.name}`}>
                  <span className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" aria-hidden="true" />
                  <span className="absolute inset-x-3 bottom-2.5">
                    <span className="font-display block line-clamp-1 text-sm font-extrabold text-white">{ch.name}</span>
                    <span className="block text-xs text-zinc-300">{ch.videos} videos</span>
                  </span>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* ===== CATEGORIES ===== */}
        {!notFound && !historyView && !current && !listing && tab === "categories" && (
          <section className="pt-5" aria-label="Categories">
            <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1.5 text-[13px] text-[var(--dim)]">
              <button type="button" onClick={() => goTab("home")} className="py-0.5 hover:text-white">Home</button>
              <span aria-hidden="true">/</span>
              <span className="font-semibold text-zinc-200">Categories</span>
            </nav>
            <h1 className="font-display mt-3 text-xl font-black text-white sm:text-2xl">Video Categories</h1>
            <p className="mt-1 text-[13px] text-[var(--dim)]">{CATEGORIES.length} categories</p>
            <div className="mt-3 grid grid-cols-2 gap-x-8">
              {CATEGORIES.map((c) => (
                <button key={c.name} type="button" onClick={() => openListing({ kind: "category", name: c.name })} className="flex items-baseline justify-between border-b border-[var(--border)] py-3.5 text-left transition active:bg-[var(--surface)]">
                  <span className="text-sm text-white">{c.name}</span><span className="text-xs text-[var(--dim)]">{c.count}</span>
                </button>
              ))}
            </div>
            <button type="button" onClick={() => flash(`All ${CATEGORIES.length} categories are shown above`)} className="mt-6 w-full rounded-full border border-[var(--border)] py-3.5 font-bold text-white">All {CATEGORIES.length} categories</button>
            <button type="button" onClick={() => goTab("creators")} className="flex w-full items-baseline justify-between border-b border-[var(--border)] py-4 text-left"><span className="text-sm text-white">Models</span><span className="text-[var(--dim)]">{CREATORS.length}</span></button>
            <button type="button" onClick={() => goTab("channels")} className="flex w-full items-baseline justify-between border-b border-[var(--border)] py-4 text-left"><span className="text-sm text-white">Channels</span><span className="text-[var(--dim)]">{CHANNELS.length}</span></button>
            <button type="button" onClick={() => goTab("tags")} className="flex w-full items-baseline justify-between border-b border-[var(--border)] py-4 text-left"><span className="text-sm text-white">All tags</span><span className="text-[var(--dim)]">{TAGS.length}</span></button>
            <button type="button" onClick={() => flash("Language is set to English — 19 more in the selector above")} className="mt-5 flex w-full items-center justify-between rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-4 text-left">
              <span className="text-sm text-white">Language</span><span className="text-[var(--dim)]">English and 19 more</span>
            </button>
            {signedIn ? (
              <p className="mt-5 rounded-2xl bg-[var(--surface)] px-4 py-4 text-center text-white">Signed in as <b>Guest viewer</b> · <button type="button" className="font-bold text-[var(--accent)]" onClick={() => setSignedIn(false)}>Log out</button></p>
            ) : (
              <div className="mt-5 grid grid-cols-2 gap-3">
                <button type="button" onClick={() => openAuth("login")} className="rounded-full border border-zinc-600 py-3.5 font-bold text-white">Log in</button>
                <button type="button" onClick={() => openAuth("signup")} className="rounded-full bg-[var(--accent)] py-3.5 font-bold text-white">Sign up</button>
              </div>
            )}
          </section>
        )}

        {/* ===== TAGS ===== */}
        {!notFound && !historyView && !current && !listing && tab === "tags" && (
          <section className="pt-5" aria-label="Tags">
            <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1.5 text-[13px] text-[var(--dim)]">
              <button type="button" onClick={() => goTab("home")} className="py-0.5 hover:text-white">Home</button>
              <span aria-hidden="true">/</span>
              <span className="font-semibold text-zinc-200">Tags</span>
            </nav>
            <h1 className="font-display mt-3 text-xl font-black text-white sm:text-2xl">Tags</h1>
            <div className="mt-4 flex flex-wrap gap-2.5">
              {LETTERS.map((l) => (
                <button key={l} type="button" aria-pressed={letter === l} aria-label={l === "Popular" ? "Popular tags" : `Tags starting with ${l}`} onClick={() => { setLetter(l); scrollTopInstant(); }} className={`flex items-center justify-center font-semibold ${l === "Popular" ? "rounded-full px-5" : "h-11 w-11 rounded-full text-sm"} ${letter === l ? "bg-white text-black" : "bg-[var(--surface2)] text-white"}`} style={l === "Popular" ? { height: 48 } : undefined}>
                  {l}
                </button>
              ))}
            </div>
            <div className="mt-6">
              {shownTags.length === 0 ? (
                <div className="py-10 text-center">
                  <p className="text-sm text-[var(--dim)]">No tags under “{letter}” in the catalog yet.</p>
                  <button type="button" onClick={() => { setLetter("Popular"); scrollTopInstant(); }} className="mt-4 rounded-full bg-[var(--accent)] px-6 py-2.5 text-sm font-bold text-white transition active:scale-95">Browse popular tags</button>
                </div>
              ) : shownTags.map((t) => (
                <button key={t.name} type="button" onClick={() => openListing({ kind: "tag", name: t.name })} className="flex w-full items-baseline justify-between border-b border-[var(--border)] py-3.5 text-left transition active:bg-[var(--surface)]">
                  <span className="text-sm lowercase text-white">{t.name}</span>
                  <span className="text-[var(--dim)]">{t.count.toLocaleString()}</span>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* ===== MODELS ===== */}
        {!notFound && !historyView && !current && !listing && tab === "creators" && (
          <section className="pt-5" aria-label="Models">
            <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1.5 text-[13px] text-[var(--dim)]">
              <button type="button" onClick={() => goTab("home")} className="py-0.5 hover:text-white">Home</button>
              <span aria-hidden="true">/</span>
              <span className="font-semibold text-zinc-200">Models</span>
            </nav>
            <h1 className="font-display mt-3 text-xl font-black leading-tight text-white sm:text-2xl">Models Having Most Videos</h1>
            <p className="mt-1 text-[13px] text-[var(--dim)]">{CREATORS.length} models</p>
            <div className="mt-5 grid grid-cols-2 gap-x-4 gap-y-7 sm:grid-cols-3 lg:grid-cols-4">
              {modelSlice.map((c) => (
                <div key={c.name} className="flex flex-col items-center text-center">
                  <button type="button" aria-label={`Videos by ${c.name}`} onClick={() => openListing({ kind: "creator", name: c.name })} className="transition active:scale-95"><Avatar name={c.name} g={c.g} size={100} /></button>
                  <span className="mt-2.5 text-sm font-bold text-white">{c.name}</span>
                  <span className="text-xs text-[var(--dim)]">{c.videos} videos</span>
                  <button type="button" aria-pressed={follows.includes(c.name)} onClick={() => toggle.mutate({ kind: "follow", itemKey: c.name })} className={`mt-2 rounded-full px-4 py-1.5 text-sm font-bold ${follows.includes(c.name) ? "bg-[var(--surface2)] text-white" : "bg-[var(--accent)] text-white"}`}>{follows.includes(c.name) ? "Following" : btnLabel("follow", "Follow")}</button>
                </div>
              ))}
            </div>
            <Pagination page={safeModelPage} total={totalModelPages} nextLabel={btnLabel("next", "Next")} onChange={(p) => { setModelPage(p); scrollTopInstant(); }} />
          </section>
        )}

        {/* ===== PROFILE ===== */}
        {!notFound && !historyView && !current && !listing && tab === "profile" && (
          <section className="pt-5" aria-label="Your library">
            <h1 className="font-display text-xl font-black text-white sm:text-2xl">Your library</h1>
            {([
              { title: "History", keys: history, empty: "Nothing watched yet. Videos you play on this device appear here.", clear: true },
              { title: "Liked", keys: likes, empty: "Tap Like on any video and it will show up here." },
              { title: "Watch later", keys: saves, empty: "Tap Save on any video to watch it later." },
            ] as const).map((sec) => (
              <div key={sec.title} className="mt-7">
                <div className="flex items-baseline justify-between">
                  <h2 className="font-display text-xl font-extrabold text-white">{sec.title}</h2>
                  {"clear" in sec && sec.keys.length > 0 && <button type="button" onClick={() => clearHist.mutate()} className="flex items-center gap-1 py-1 text-sm text-[var(--dim)]"><Icon n="trash" size={15} tone="accent" /> Clear</button>}
                </div>
                {sec.keys.length === 0 ? <p className="mt-2 text-[var(--dim)]">{sec.empty}</p> : (
                  <div className="mt-3 mx-auto flex w-full max-w-[760px] flex-col gap-6">
                    {sec.keys.map((id) => { const v = byId(id); return v ? <VideoCard key={id} v={v} onOpen={openVideo} /> : null; })}
                  </div>
                )}
              </div>
            ))}
            <div className="mt-7">
              <h2 className="font-display text-xl font-extrabold text-white">Following</h2>
              {follows.length === 0 ? <p className="mt-2 text-[var(--dim)]">Follow models from the Models tab and they'll show up here.</p> : (
                <div className="mt-3 flex flex-wrap gap-4">
                  {follows.map((name) => { const c = CREATORS.find((x) => x.name === name); return c ? (
                    <button key={name} type="button" onClick={() => openListing({ kind: "creator", name })} className="flex flex-col items-center gap-1.5 transition active:scale-95"><Avatar name={c.name} g={c.g} size={64} /><span className="max-w-[90px] text-center text-sm font-semibold text-white">{name}</span></button>
                  ) : null; })}
                </div>
              )}
            </div>
          </section>
        )}

        {/* ===== Footer (also on the video page) ===== */}
        <footer className="mt-12 border-t border-[var(--border)] pt-5 text-[13px] text-[var(--dim)]">
          <nav className="flex flex-wrap gap-x-6 gap-y-2" aria-label="Footer">
            <button type="button" onClick={() => goTab("categories")} className="py-1">Categories</button>
            <button type="button" onClick={() => goTab("creators")} className="py-1">Models</button>
            <button type="button" onClick={() => goTab("channels")} className="py-1">Channels</button>
            <button type="button" onClick={() => flash("Content removal requests: use the flag icon on any video")} className="py-1">Content removal</button>
            <button type="button" onClick={() => flash("All models on Pulse Video are verified adults")} className="py-1">2257</button>
            <button type="button" onClick={() => flash("DMCA: report via the flag icon on any video")} className="py-1">DMCA</button>
            <button type="button" onClick={() => flash("Terms of use — demo page")} className="py-1">Terms</button>
            <button type="button" onClick={() => flash("Privacy policy — demo page")} className="py-1">Privacy</button>
          </nav>
          <p className="mt-4 leading-relaxed">{texts.footerText}</p>
        </footer>
      </main>

      {/* ===== Menu drawer (mobile + desktop) ===== */}
      {drawer && (
        <div className="fixed inset-0 z-[60]" role="dialog" aria-label="Site menu">
          <button type="button" aria-label="Close menu" onClick={() => setDrawer(false)} className="absolute inset-0 bg-black/70" />
          <div className="absolute inset-y-0 left-0 w-[86vw] max-w-sm overflow-y-auto bg-[#0a0a0a] px-5 pb-28 pt-4">
            <div className="flex items-center justify-between">
              <LogoText text={texts.logoText ?? "PULSE VIDEO"} />
              <button type="button" aria-label="Close menu" onClick={() => setDrawer(false)} className="p-2 text-white"><Icon n="x" tone="accent" /></button>
            </div>
            <div className="mt-2 divide-y divide-[var(--border)] border-y border-[var(--border)]">
              <button type="button" onClick={openHistory} className="flex w-full items-center gap-3.5 py-3.5 text-left text-sm text-white"><Icon n="history" tone="accent" /> History</button>
              <button type="button" onClick={() => goTab("profile")} className="flex w-full items-center gap-3.5 py-3.5 text-left text-sm text-white"><Icon n="like" tone="accent" /> Liked</button>
              <button type="button" onClick={() => goTab("profile")} className="flex w-full items-center gap-3.5 py-3.5 text-left text-sm text-white"><Icon n="bell" tone="accent" /> Following</button>
              <button type="button" onClick={() => goTab("profile")} className="flex w-full items-center gap-3.5 py-3.5 text-left text-sm text-white"><Icon n="bookmark" tone="accent" /> Watch later</button>
            </div>
            <p className="mt-6 text-sm font-bold tracking-[0.14em] text-[var(--dim)]">CATEGORIES</p>
            <div className="mt-1 grid grid-cols-2 gap-x-6">
              {drawerCats.map((c) => (
                <button key={c.name} type="button" onClick={() => openListing({ kind: "category", name: c.name })} className="flex items-baseline justify-between border-b border-[var(--border)] py-3 text-left">
                  <span className="text-sm text-white">{c.name}</span><span className="text-xs text-[var(--dim)]">{c.count}</span>
                </button>
              ))}
            </div>
            <button type="button" onClick={() => goTab("categories")} className="mt-6 w-full rounded-full border border-[var(--border)] py-3 font-bold text-white">All {CATEGORIES.length} categories</button>
            <div className="mt-2 divide-y divide-[var(--border)] border-b border-[var(--border)]">
              <button type="button" onClick={() => goTab("creators")} className="flex w-full items-baseline justify-between py-4 text-left"><span className="text-sm text-white">Models</span><span className="text-[var(--dim)]">{CREATORS.length}</span></button>
              <button type="button" onClick={() => goTab("channels")} className="flex w-full items-baseline justify-between py-4 text-left"><span className="text-sm text-white">Channels</span><span className="text-[var(--dim)]">{CHANNELS.length}</span></button>
              <button type="button" onClick={() => goTab("tags")} className="flex w-full items-baseline justify-between py-4 text-left"><span className="text-sm text-white">All tags</span><span className="text-[var(--dim)]">{TAGS.length}</span></button>
            </div>
            <button type="button" onClick={() => flash("Use the language selector in the header — 20 languages")} className="mt-5 flex w-full items-center justify-between rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-4 text-left">
              <span className="text-sm text-white">Language</span><span className="text-[var(--dim)]">English and 19 more</span>
            </button>
            {signedIn ? (
              <p className="mt-5 rounded-2xl bg-[var(--surface)] px-4 py-4 text-center text-white">Signed in as <b>Guest viewer</b> · <button type="button" className="font-bold text-[var(--accent)]" onClick={() => setSignedIn(false)}>Log out</button></p>
            ) : (
              <div className="mt-5 grid grid-cols-2 gap-3">
                <button type="button" onClick={() => openAuth("login")} className="rounded-full border border-zinc-600 py-3.5 font-bold text-white">Log in</button>
                <button type="button" onClick={() => openAuth("signup")} className="rounded-full bg-[var(--accent)] py-3.5 font-bold text-white">Sign up</button>
              </div>
            )}
            <nav className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-sm text-[var(--dim)]" aria-label="Legal">
              <button type="button" onClick={() => flash("Content removal requests: use the flag icon on any video")} className="py-1">Content removal</button>
              <button type="button" onClick={() => flash("All models on Pulse Video are verified adults")} className="py-1">2257</button>
              <button type="button" onClick={() => flash("DMCA: report via the flag icon on any video")} className="py-1">DMCA</button>
              <button type="button" onClick={() => flash("Terms of use — demo page")} className="py-1">Terms</button>
              <button type="button" onClick={() => flash("Privacy policy — demo page")} className="py-1">Privacy</button>
            </nav>
          </div>
        </div>
      )}

      {/* ===== Filters drawer (right slide-over) ===== */}
      {filtersOpen && (
        <div className="fixed inset-0 z-[60]" role="dialog" aria-label="Filters">
          <button type="button" aria-label="Close filters" onClick={() => setFiltersOpen(false)} className="absolute inset-0 bg-black/70" />
          <div className="absolute inset-y-0 right-0 flex w-[92vw] max-w-[380px] flex-col bg-[#111111]">
            <div className="flex items-center justify-between px-5 py-4">
              <h2 className="font-display text-xl font-extrabold text-white">Filters</h2>
              <button type="button" aria-label="Close filters" onClick={() => setFiltersOpen(false)} className="p-2 text-white"><Icon n="x" tone="accent" /></button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 pb-5">
              {([
                { label: "Length", key: "len" as const, options: ["Any", "Under 5 min", "5–10 min", "10–20 min", "20–40 min", "Over 40 min"] },
                { label: "Quality", key: "quality" as const, options: ["Any", "Full HD 1080p"] },
                { label: "Added", key: "added" as const, options: ["Any time", "Today", "This week", "This month", "This year"] },
              ]).map((group) => (
                <div key={group.key} className="mt-4">
                  <p className="text-sm font-bold uppercase tracking-wide text-[var(--dim)]">{group.label}</p>
                  <div className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-label={group.label}>
                    {group.options.map((o) => (
                      <button key={o} type="button" role="radio" aria-checked={draftFilters[group.key] === o} onClick={() => setDraftFilters({ ...draftFilters, [group.key]: o })} className={`rounded-full px-4 py-2 text-sm font-semibold transition active:scale-95 ${draftFilters[group.key] === o ? "border border-[var(--accent)] text-[var(--accent)]" : "bg-[var(--surface2)] text-white"}`}>{o}</button>
                    ))}
                  </div>
                </div>
              ))}
              <div className="mt-6">
                <p className="text-sm font-bold uppercase tracking-wide text-[var(--dim)]">Categories</p>
                <p className="mt-1 text-[13px] text-[var(--dim)]">Tap once to include, twice to exclude.</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {CATEGORIES.slice(0, 24).map((c) => {
                    const inc = draftFilters.incl.includes(c.name);
                    const exc = draftFilters.excl.includes(c.name);
                    return (
                      <button key={c.name} type="button" aria-pressed={inc} aria-label={`${c.name}${exc ? " (excluded)" : inc ? " (included)" : ""}`} onClick={() => {
                        if (!inc && !exc) setDraftFilters({ ...draftFilters, incl: [...draftFilters.incl, c.name] });
                        else if (inc) setDraftFilters({ ...draftFilters, incl: draftFilters.incl.filter((x) => x !== c.name), excl: [...draftFilters.excl, c.name] });
                        else setDraftFilters({ ...draftFilters, excl: draftFilters.excl.filter((x) => x !== c.name) });
                      }} className={`rounded-full px-3.5 py-2 text-sm font-semibold transition active:scale-95 ${inc ? "bg-[var(--accent)] text-white" : exc ? "border border-red-500 text-red-400 line-through" : "bg-[var(--surface2)] text-white"}`}>{c.name}</button>
                    );
                  })}
                </div>
              </div>
            </div>
            <div className="flex gap-3 border-t border-[var(--border)] px-5 py-4">
              <button type="button" onClick={() => setDraftFilters(NO_FILTERS)} className="flex-1 rounded-full border border-[var(--border)] py-3 font-bold text-white">Clear all</button>
              <button type="button" onClick={() => { setAppliedFilters(draftFilters); setFiltersOpen(false); setListPage(1); scrollTopInstant(); }} className="flex-1 rounded-full bg-[var(--accent)] py-3 font-bold text-white">Show results</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== Notice toast ===== */}
      {notice && (
        <div role="status" className="fixed inset-x-4 bottom-24 z-[70] mx-auto max-w-md rounded-xl bg-white px-4 py-3 text-center text-sm font-semibold text-black shadow-xl md:bottom-28">{notice}</div>
      )}

      {/* ===== Cookie banner (in-flow above the footer, choice persists — never overlays content) ===== */}
      {!cookieChoice && (
        <div className="mx-auto w-full max-w-6xl px-4 pb-28">
          <div className="flex flex-col gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-2xl sm:flex-row sm:items-center" role="region" aria-label="Cookie notice">
            <p className="flex-1 text-sm leading-relaxed text-zinc-200">{texts.cookieText} <button type="button" onClick={() => flash("Privacy policy — demo page")} className="font-semibold text-[var(--accent)]">Privacy</button></p>
            <div className="flex gap-2.5">
              <button type="button" onClick={() => chooseCookie("ok")} className="rounded-full bg-[var(--accent)] px-7 py-2.5 font-bold text-white">OK</button>
              <button type="button" onClick={() => chooseCookie("reject")} className="rounded-full border border-[var(--border)] px-6 py-2.5 font-bold text-white">Reject</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== BOTTOM TAB BAR — identical on mobile & desktop ===== */}
      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-50 border-t border-[var(--border)] bg-black/97 pb-safe backdrop-blur">
        <div className="mx-auto grid max-w-6xl grid-cols-5 px-2">
          {bottomTabs.map((t) => {
            const active = navActive === t.key && !drawer && !authView;
            return (
              <button key={t.key} type="button" aria-label={t.label} aria-current={active ? "page" : undefined} onClick={() => goTab(t.key)} className={`relative flex flex-col items-center gap-1 py-2.5 text-[11px] font-semibold transition active:scale-90 ${active ? "text-[var(--accent)]" : "text-zinc-400"}`}>
                {active && <span className="absolute inset-x-6 top-0 h-[3px] rounded-b bg-[var(--accent)]" />}
                <Icon n={t.icon} size={23} tone="accent" />
                {t.label}
                {t.key === "profile" && (likes.length + saves.length) > 0 && <span className="absolute right-[22%] top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--accent)] px-1 text-[10px] font-black text-white">{likes.length + saves.length}</span>}
              </button>
            );
          })}
        </div>
      </nav>
      </>
      )}
    </div>
  );
}
