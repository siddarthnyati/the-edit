import '../lib/env.js';
import { GoogleGenAI } from '@google/genai';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { createClient } from '@supabase/supabase-js';

// Wardrobe basics generator — gender-split catalogs.
//
// Two-tier storage:
//   - Every generated image is uploaded ("dumped") to Supabase Storage
//     and indexed in wardrobe_basics with is_chosen=false. We paid for
//     it; we keep it.
//   - Curating chosen rows happens via the admin UI or a SQL UPDATE.
//
// Usage:
//   npm run basics                       # men + women, hybrid Pro/Flash
//   npm run basics -- --gender men       # men only
//   npm run basics -- --gender women     # women only
//   npm run basics -- --local-only       # skip Supabase upload (test mode)
//   npm run basics -- --flash            # all Flash (cheaper, lower quality)

const apiKey = process.env['GEMINI_API_KEY'];
if (!apiKey) throw new Error('GEMINI_API_KEY required');
const ai = new GoogleGenAI({ apiKey });

const supabaseUrl = process.env['SUPABASE_URL']!;
const supabaseKey = process.env['SUPABASE_SERVICE_ROLE_KEY']!;
const supabase = createClient(supabaseUrl, supabaseKey);

const args = process.argv.slice(2);
const forceFlash = args.includes('--flash');
const localOnly = args.includes('--local-only');
const genderArg = args[args.indexOf('--gender') + 1] as 'men' | 'women' | undefined;
const slugArg = args.includes('--slug') ? args[args.indexOf('--slug') + 1] : undefined;

const PRO_MODEL = 'gemini-3-pro-image-preview';
const FLASH_MODEL = 'gemini-2.5-flash-image';
const PRO_COST = 0.10;
const FLASH_COST = 0.039;

type Tier = 'pro' | 'flash';

type BasicItem = {
  slug: string;
  category: 'tee' | 'jean' | 'shoe' | 'boot' | 'jacket' | 'accessory' | 'dress' | 'skirt' | 'trouser' | 'sweater' | 'coat';
  silhouetteTag: string;
  name: string;
  garment: string;
  photography: string;
  tier: Tier; // hero items get Pro, everything else Flash
};

// Category-specific photography conventions. SSENSE / Mr Porter / Toteme /
// Acne Studios reference style depending on the category.
const PHOTOGRAPHY: Record<BasicItem['category'], string> = {
  tee: 'Front-facing on an invisible mannequin. Shoulders square, slight drape under chest. Subtle ground shadow. Clean white seamless studio backdrop, soft three-point lighting from upper left. SSENSE / Mr Porter product photography style — hyperrealistic, no model, no human, no hands.',
  jean: 'Front view, garment on an invisible lower mannequin showing natural drape. Both legs visible, full length, hem at frame bottom. Soft ground shadow. Pockets, stitching, waistband visibly detailed. Clean light grey seamless studio backdrop, soft directional lighting. SSENSE product photography style.',
  shoe: 'Single shoe, lateral side profile view (footwear editorial standard). Photographed on a clean cream seamless ground plane with soft contact shadow. Acne Studios / Mr Porter shoe-photography style. Hardware (eyelets, laces, soles) clearly defined.',
  boot: 'Single boot, lateral side profile view. Pull tab visible. Photographed on a clean cream seamless ground plane with soft contact shadow at the sole. Acne Studios footwear product photography style.',
  jacket: 'Front view on an invisible mannequin with shoulders defined, lapels or collar shown in 3D depth. Buttons or hardware visible. Clean white seamless studio backdrop, three-point lighting. Mr Porter / SSENSE outerwear photography style.',
  accessory: 'Single object, three-quarter view. Clean cream seamless backdrop, soft contact shadow. Detail on hardware, stitching, material grain. Acne Studios accessory photography style.',
  dress: 'Front view on an invisible mannequin or hanger, full length, garment fully visible from straps to hem. Natural drape, fabric movement subtle. Clean white seamless studio backdrop, soft directional lighting. Net-a-Porter / Toteme product photography style.',
  skirt: 'Front view on an invisible lower mannequin. Full length from waistband to hem visible. Natural drape, no styling. Clean light grey seamless backdrop, soft three-point lighting. SSENSE / Toteme product photography style.',
  trouser: 'Front view on an invisible lower mannequin. Both legs visible, full length, hem at frame bottom. Waistband detail visible. Soft ground shadow. Clean light grey seamless backdrop. SSENSE / The Frankie Shop product photography style.',
  sweater: 'Front view on an invisible mannequin with shoulders defined. Visible knit texture, ribbed cuffs and hem. Clean white seamless backdrop, three-point lighting. The Row / Acne Studios knitwear photography style.',
  coat: 'Front view on an invisible mannequin, full length to mid-calf or longer. Lapels and collar shown in depth. Belt or buttons visible if present. Clean light grey seamless backdrop, soft directional lighting. Toteme / Mr Porter outerwear photography style.',
};

// ── Men's catalog (10 items, hybrid) ─────────────────────────────────────
const MEN_CATALOG: BasicItem[] = [
  {
    slug: 'white-crew-tee',
    category: 'tee',
    silhouetteTag: 'boxy-relaxed',
    name: 'White Crew Tee',
    tier: 'pro',
    garment: 'Heavyweight 200gsm cotton jersey, optical white. Crew neck with ribbed collar, set-in sleeves at shoulder, straight hem. Boxy relaxed fit, sleeves end mid-bicep. Unbranded, no logo.',
    photography: PHOTOGRAPHY.tee,
  },
  {
    slug: 'black-crew-tee',
    category: 'tee',
    silhouetteTag: 'boxy-relaxed',
    name: 'Black Crew Tee',
    tier: 'flash',
    garment: 'Same as white crew tee but in jet black — heavyweight cotton jersey, ribbed crew collar, set-in sleeves, boxy fit. True black, not faded.',
    photography: PHOTOGRAPHY.tee,
  },
  {
    slug: 'raw-indigo-jean',
    category: 'jean',
    silhouetteTag: 'straight-mid-rise',
    name: 'Raw Indigo Jean',
    tier: 'pro',
    garment: '14oz raw selvedge denim in dark indigo, five-pocket straight-leg cut. Mid-rise waistband, copper rivets at stress points, button fly, classic arcuate stitching. Hem unfinished, slightly slubbed. 32-inch inseam.',
    photography: PHOTOGRAPHY.jean,
  },
  {
    slug: 'black-washed-jean',
    category: 'jean',
    silhouetteTag: 'straight-mid-rise',
    name: 'Black Washed Jean',
    tier: 'flash',
    garment: 'Straight-leg five-pocket jean in washed black denim with subtle fade at the thighs. Mid-rise, button fly, tonal stitching. Slightly relaxed through the seat, straight to the hem.',
    photography: PHOTOGRAPHY.jean,
  },
  {
    slug: 'white-low-sneaker',
    category: 'shoe',
    silhouetteTag: 'minimal-leather',
    name: 'White Low Sneaker',
    tier: 'pro',
    garment: 'Minimal low-top leather sneaker, optical white full-grain calfskin upper, six-eyelet lacing, flat white laces, cream rubber cup sole, tonal stitching, no visible branding. Slim silhouette, square-ish toe. Common Projects aesthetic.',
    photography: PHOTOGRAPHY.shoe,
  },
  {
    slug: 'black-chelsea-boot-men',
    category: 'boot',
    silhouetteTag: 'classic-chelsea',
    name: 'Black Chelsea Boot',
    tier: 'pro',
    garment: 'Classic chelsea boot in polished black calfskin leather. Elasticated side panels, leather pull tab, almond toe, leather sole with subtle stacked heel. No branding. Saint Laurent silhouette.',
    photography: PHOTOGRAPHY.boot,
  },
  {
    slug: 'navy-wool-blazer-men',
    category: 'jacket',
    silhouetteTag: 'unstructured-blazer',
    name: 'Navy Wool Blazer',
    tier: 'flash',
    garment: 'Single-breasted unstructured blazer in navy wool flannel. Notched lapels, two-button front, three flap pockets, no padding, soft shoulder. Slightly relaxed fit. Boglioli aesthetic.',
    photography: PHOTOGRAPHY.jacket,
  },
  {
    slug: 'denim-trucker-jacket',
    category: 'jacket',
    silhouetteTag: 'workwear',
    name: 'Denim Trucker',
    tier: 'flash',
    garment: '14oz indigo selvedge denim trucker jacket. Classic Type III silhouette, button front, two chest pockets with flaps, copper rivets, slightly cropped hem. Unbranded.',
    photography: PHOTOGRAPHY.jacket,
  },
  {
    slug: 'grey-crewneck-sweatshirt',
    category: 'sweater',
    silhouetteTag: 'crewneck',
    name: 'Grey Crewneck',
    tier: 'flash',
    garment: 'Heavyweight 14oz brushed-back cotton fleece, heather grey. Crew neck with ribbed collar, raglan or set-in sleeves, ribbed cuffs and hem. Slightly boxy fit. Reigning Champ aesthetic.',
    photography: PHOTOGRAPHY.sweater,
  },
  {
    slug: 'black-leather-belt-men',
    category: 'accessory',
    silhouetteTag: 'classic-belt',
    name: 'Black Leather Belt',
    tier: 'flash',
    garment: 'Single black calfskin leather belt, 1.25-inch wide. Brushed silver buckle, single keeper loop, five holes. Polished but not glossy. Anderson\'s / Saint Laurent aesthetic.',
    photography: PHOTOGRAPHY.accessory,
  },
  {
    slug: 'black-bomber-jacket-men',
    category: 'jacket',
    silhouetteTag: 'bomber',
    name: 'Black Bomber Jacket',
    tier: 'flash',
    garment: 'Classic MA-1 bomber jacket in matte black nylon shell. Ribbed knit collar, cuffs, and hem in tonal black. Zip front, two slash pockets, single utility pocket on left sleeve. Slim relaxed fit, hits at the hip. Alpha Industries / unbranded silhouette.',
    photography: PHOTOGRAPHY.jacket,
  },
  // ── Catalog expansion (2026-05-15) — filling visible gaps in starter pack ──
  {
    slug: 'heather-grey-tee-men',
    category: 'tee',
    silhouetteTag: 'boxy-relaxed',
    name: 'Heather Grey Tee',
    tier: 'flash',
    garment: 'Heavyweight 200gsm cotton jersey, heather grey marl. Crew neck with ribbed collar, set-in sleeves at shoulder, straight hem. Boxy relaxed fit. Subtle melange texture in the knit. Unbranded.',
    photography: PHOTOGRAPHY.tee,
  },
  {
    slug: 'navy-crew-tee-men',
    category: 'tee',
    silhouetteTag: 'boxy-relaxed',
    name: 'Navy Crew Tee',
    tier: 'flash',
    garment: 'Same as the white crew tee but in deep navy — heavyweight 200gsm cotton jersey, ribbed crew collar, set-in sleeves, boxy relaxed fit. Quiet, almost-black navy. Unbranded.',
    photography: PHOTOGRAPHY.tee,
  },
  {
    slug: 'olive-crew-tee-men',
    category: 'tee',
    silhouetteTag: 'boxy-relaxed',
    name: 'Olive Crew Tee',
    tier: 'flash',
    garment: 'Heavyweight 200gsm cotton jersey, washed olive green — softened, not military-bright. Ribbed crew collar, set-in sleeves, boxy fit. Unbranded.',
    photography: PHOTOGRAPHY.tee,
  },
  {
    slug: 'washed-blue-jean-men',
    category: 'jean',
    silhouetteTag: 'straight-mid-rise',
    name: 'Washed Blue Jean',
    tier: 'flash',
    garment: 'Straight-leg five-pocket jean in medium-wash blue denim with subtle whiskering at the hips and natural fade at the thighs. Mid-rise, button fly, copper rivets, tonal stitching. Slightly relaxed through the seat, straight to the hem.',
    photography: PHOTOGRAPHY.jean,
  },
  {
    slug: 'pale-denim-jean-men',
    category: 'jean',
    silhouetteTag: 'straight-mid-rise',
    name: 'Pale Denim Jean',
    tier: 'flash',
    garment: 'Straight-leg five-pocket jean in pale stonewashed blue denim. Mid-rise, button fly, light fade across the front of the legs, no distressing. Soft hand, summer-weight. Unbranded.',
    photography: PHOTOGRAPHY.jean,
  },
  {
    slug: 'black-court-sneaker-men',
    category: 'shoe',
    silhouetteTag: 'minimal-leather',
    name: 'Black Court Sneaker',
    tier: 'pro',
    garment: 'Minimal low-top leather sneaker, jet black full-grain calfskin upper, six-eyelet lacing, flat black laces, slim black rubber cup sole, tonal stitching, no visible branding. Same last as the white version. Common Projects black achilles aesthetic.',
    photography: PHOTOGRAPHY.shoe,
  },
  {
    slug: 'burgundy-loafer-men',
    category: 'shoe',
    silhouetteTag: 'classic-penny',
    name: 'Burgundy Penny Loafer',
    tier: 'pro',
    garment: 'Classic penny loafer in burgundy oxblood polished calfskin leather. Apron toe, hand-stitched strap with single keeper slit, slim leather sole with low stacked heel, no tassel, no hardware. G.H. Bass Weejun silhouette but elevated. Quiet polish.',
    photography: PHOTOGRAPHY.shoe,
  },
  {
    slug: 'brown-leather-belt-men',
    category: 'accessory',
    silhouetteTag: 'classic-belt',
    name: 'Brown Leather Belt',
    tier: 'flash',
    garment: 'Single warm-brown calfskin leather belt, 1.25-inch wide. Brushed antique-brass buckle, single keeper loop, five holes. Polished but not glossy, slight patina. Anderson\'s aesthetic.',
    photography: PHOTOGRAPHY.accessory,
  },
  {
    slug: 'navy-cotton-cap-men',
    category: 'accessory',
    silhouetteTag: 'six-panel-cap',
    name: 'Navy Cotton Cap',
    tier: 'flash',
    garment: 'Six-panel cotton twill baseball cap in deep navy. Curved brim, low crown, brass adjustment buckle at the back, no logo or embroidery. Unstructured. Norse Projects aesthetic.',
    photography: PHOTOGRAPHY.accessory,
  },
  {
    slug: 'black-leather-jacket-men',
    category: 'jacket',
    silhouetteTag: 'moto',
    name: 'Black Leather Jacket',
    tier: 'pro',
    garment: 'Slim-fit leather moto jacket in matte black calfskin leather, asymmetric front zip, notched lapel, snap collar, two zip side pockets, single zip chest pocket, zip cuffs. Clean shoulder, no studs, no quilting. Saint Laurent / Schott Perfecto silhouette but minimal.',
    photography: PHOTOGRAPHY.jacket,
  },
  {
    slug: 'olive-field-jacket-men',
    category: 'jacket',
    silhouetteTag: 'utility',
    name: 'Olive Field Jacket',
    tier: 'pro',
    garment: 'M-65 style field jacket in dry olive-green cotton sateen. Four bellowed flap pockets at chest and hips, drawstring waist with internal cord, button-storm-flap front, banded collar. Loose fit. Engineered Garments aesthetic.',
    photography: PHOTOGRAPHY.jacket,
  },
  {
    slug: 'brown-chelsea-boot-men',
    category: 'boot',
    silhouetteTag: 'classic-chelsea',
    name: 'Brown Chelsea Boot',
    tier: 'pro',
    garment: 'Classic chelsea boot in warm chestnut-brown polished calfskin leather. Elasticated side panels, brown leather pull tab, almond toe, leather sole with subtle stacked heel. R.M. Williams / Saint Laurent silhouette.',
    photography: PHOTOGRAPHY.boot,
  },
];

// ── Women's catalog (10 items, hybrid) ───────────────────────────────────
const WOMEN_CATALOG: BasicItem[] = [
  {
    slug: 'white-fitted-tee',
    category: 'tee',
    silhouetteTag: 'fitted',
    name: 'White Fitted Tee',
    tier: 'pro',
    garment: 'Slim-fit crew-neck t-shirt in midweight 160gsm Pima cotton jersey, optical white. Slightly tapered through waist, fitted sleeves ending upper bicep, ribbed crew collar. The Row / Toteme aesthetic — quiet, refined.',
    photography: PHOTOGRAPHY.tee,
  },
  {
    slug: 'black-fitted-tee',
    category: 'tee',
    silhouetteTag: 'fitted',
    name: 'Black Fitted Tee',
    tier: 'flash',
    garment: 'Same as white fitted tee in jet black — slim-fit Pima cotton jersey, tapered waist, ribbed crew collar. True black.',
    photography: PHOTOGRAPHY.tee,
  },
  {
    slug: 'dark-wash-straight-jean-women',
    category: 'jean',
    silhouetteTag: 'high-rise-straight',
    name: 'Dark Wash Straight Jean',
    tier: 'pro',
    garment: 'High-rise straight-leg jean in clean dark indigo denim, 12oz weight. Five-pocket construction, button fly, slight stretch for fit. Sits at natural waist, falls straight from hip to hem. Khaite / Toteme silhouette.',
    photography: PHOTOGRAPHY.jean,
  },
  {
    slug: 'wide-leg-trouser-black-women',
    category: 'trouser',
    silhouetteTag: 'wide-leg-tailored',
    name: 'Wide-Leg Trouser',
    tier: 'flash',
    garment: 'High-waisted wide-leg trouser in matte black wool blend, full length to floor. Pleated front, clean side seam, tonal button at waistband, generous leg with natural drape, hem grazing ground. The Frankie Shop silhouette.',
    photography: PHOTOGRAPHY.trouser,
  },
  {
    slug: 'white-leather-sneaker-women',
    category: 'shoe',
    silhouetteTag: 'minimal-leather',
    name: 'White Leather Sneaker',
    tier: 'flash',
    garment: 'Slim low-top leather sneaker, optical white full-grain calfskin. Five-eyelet lacing in flat laces, slim cream rubber sole, tonal stitching, no branding. Slightly more refined and slimmer than men\'s version. Common Projects womens aesthetic.',
    photography: PHOTOGRAPHY.shoe,
  },
  {
    slug: 'black-ballet-flat',
    category: 'shoe',
    silhouetteTag: 'ballet-flat',
    name: 'Black Ballet Flat',
    tier: 'flash',
    garment: 'Classic ballet flat in black calfskin leather. Rounded toe, slim leather sole, low-profile, no embellishment. Visible stitching at the toe seam. Repetto / Margiela Tabi-adjacent simplicity, not Tabi-toed.',
    photography: PHOTOGRAPHY.shoe,
  },
  {
    slug: 'black-slip-dress',
    category: 'dress',
    silhouetteTag: 'midi-slip',
    name: 'Black Slip Dress',
    tier: 'pro',
    garment: 'Bias-cut slip dress in heavyweight silk satin, deep black. Spaghetti straps, V-neckline, midi length grazing mid-calf, natural fabric pooling at hem. No embellishment, no hardware. Toteme aesthetic — fluid drape.',
    photography: PHOTOGRAPHY.dress,
  },
  {
    slug: 'midi-skirt-charcoal',
    category: 'skirt',
    silhouetteTag: 'midi-a-line',
    name: 'Charcoal Midi Skirt',
    tier: 'flash',
    garment: 'A-line midi skirt in heavyweight wool flannel, charcoal grey. High waistband with clean side zip, full length to mid-calf, subtle flare from waist to hem. Toteme / Lemaire silhouette.',
    photography: PHOTOGRAPHY.skirt,
  },
  {
    slug: 'black-fitted-blazer-women',
    category: 'jacket',
    silhouetteTag: 'structured-blazer',
    name: 'Black Fitted Blazer',
    tier: 'pro',
    garment: 'Single-breasted blazer in black wool gabardine. Slightly fitted through waist with subtle suppression, notched lapels, two-button front, two flap pockets. Defined shoulder, clean tailoring. Saint Laurent / Toteme aesthetic.',
    photography: PHOTOGRAPHY.jacket,
  },
  {
    slug: 'camel-trench-coat',
    category: 'coat',
    silhouetteTag: 'classic-trench',
    name: 'Camel Trench Coat',
    tier: 'flash',
    garment: 'Classic double-breasted trench coat in warm camel cotton gabardine. Notched lapels, storm flap, gun flap, belted waist with leather buckle, full length to mid-calf, vented back. Burberry-inspired silhouette but unbranded.',
    photography: PHOTOGRAPHY.coat,
  },
  {
    slug: 'black-bomber-jacket-women',
    category: 'jacket',
    silhouetteTag: 'bomber',
    name: 'Black Bomber Jacket',
    tier: 'flash',
    garment: 'Slim-fit bomber jacket in matte black nylon shell, cropped at the hip. Ribbed knit collar, cuffs, and hem in tonal black. Zip front, slim through the waist, two slash pockets. Acne Studios / Saint Laurent women\'s silhouette.',
    photography: PHOTOGRAPHY.jacket,
  },
  {
    slug: 'black-chelsea-boot-women',
    category: 'boot',
    silhouetteTag: 'classic-chelsea',
    name: 'Black Chelsea Boot',
    tier: 'flash',
    garment: 'Classic chelsea boot in polished black calfskin leather. Elasticated side panels, slim leather pull tab, almond toe, leather sole with subtle 1-inch stacked heel. Slightly slimmer last than the men\'s version. Margiela / Saint Laurent women\'s silhouette.',
    photography: PHOTOGRAPHY.boot,
  },
  {
    slug: 'black-leather-belt-women',
    category: 'accessory',
    silhouetteTag: 'classic-belt',
    name: 'Black Leather Belt',
    tier: 'flash',
    garment: 'Slim 1-inch wide black calfskin leather belt. Brushed silver buckle, single keeper loop, polished edge. The Row / Khaite aesthetic — minimal, refined.',
    photography: PHOTOGRAPHY.accessory,
  },
  // ── Catalog expansion (2026-05-15) — filling visible gaps in starter pack ──
  {
    slug: 'heather-grey-tee-women',
    category: 'tee',
    silhouetteTag: 'fitted',
    name: 'Heather Grey Tee',
    tier: 'flash',
    garment: 'Slim-fit crew-neck t-shirt in midweight 160gsm Pima cotton jersey, heather grey marl. Slightly tapered through waist, fitted sleeves ending upper bicep, ribbed crew collar. Subtle melange in the knit. The Row / Toteme aesthetic.',
    photography: PHOTOGRAPHY.tee,
  },
  {
    slug: 'navy-fitted-tee-women',
    category: 'tee',
    silhouetteTag: 'fitted',
    name: 'Navy Fitted Tee',
    tier: 'flash',
    garment: 'Slim-fit crew tee in midweight Pima cotton jersey, deep navy almost-black. Tapered waist, ribbed crew collar, fitted sleeves. Toteme aesthetic.',
    photography: PHOTOGRAPHY.tee,
  },
  {
    slug: 'olive-fitted-tee-women',
    category: 'tee',
    silhouetteTag: 'fitted',
    name: 'Olive Fitted Tee',
    tier: 'flash',
    garment: 'Slim-fit crew tee in midweight Pima cotton jersey, washed olive — softened, not bright. Tapered waist, ribbed crew collar, fitted sleeves. Toteme aesthetic.',
    photography: PHOTOGRAPHY.tee,
  },
  {
    slug: 'washed-blue-jean-women',
    category: 'jean',
    silhouetteTag: 'high-rise-straight',
    name: 'Washed Blue Jean',
    tier: 'flash',
    garment: 'High-rise straight-leg jean in medium-wash blue denim with subtle whiskering at the hips and natural fade at the thighs. 12oz weight, slight stretch, sits at the natural waist, falls straight from hip to hem. Khaite silhouette.',
    photography: PHOTOGRAPHY.jean,
  },
  {
    slug: 'ecru-trouser-women',
    category: 'trouser',
    silhouetteTag: 'wide-leg-tailored',
    name: 'Ecru Wide-Leg Trouser',
    tier: 'pro',
    garment: 'High-waisted wide-leg trouser in heavyweight ecru wool blend, full length to floor. Pleated front, clean side seam, tonal button at waistband, generous leg with natural drape, hem grazing ground. The Frankie Shop / Toteme silhouette.',
    photography: PHOTOGRAPHY.trouser,
  },
  {
    slug: 'black-leather-loafer-women',
    category: 'shoe',
    silhouetteTag: 'classic-penny',
    name: 'Black Penny Loafer',
    tier: 'pro',
    garment: 'Classic penny loafer in polished black calfskin leather. Apron toe, hand-stitched strap with single keeper slit, slim leather sole with low stacked heel, no tassel, no hardware. This is a real loafer, NOT a ballet flat. Margiela / The Row silhouette.',
    photography: PHOTOGRAPHY.shoe,
  },
  {
    slug: 'brown-leather-belt-women',
    category: 'accessory',
    silhouetteTag: 'classic-belt',
    name: 'Brown Leather Belt',
    tier: 'flash',
    garment: 'Slim 1-inch wide warm-brown calfskin leather belt. Brushed antique-brass buckle, single keeper loop, polished edge with slight patina. The Row / Khaite aesthetic.',
    photography: PHOTOGRAPHY.accessory,
  },
  {
    slug: 'white-cotton-cap-women',
    category: 'accessory',
    silhouetteTag: 'six-panel-cap',
    name: 'White Cotton Cap',
    tier: 'flash',
    garment: 'Six-panel cotton twill baseball cap in optic white. Curved brim, low crown, brass adjustment buckle at the back, no logo or embroidery. Unstructured. Khaite / Acne aesthetic.',
    photography: PHOTOGRAPHY.accessory,
  },
  {
    slug: 'black-leather-jacket-women',
    category: 'jacket',
    silhouetteTag: 'moto',
    name: 'Black Leather Jacket',
    tier: 'pro',
    garment: 'Slim leather moto jacket in matte black calfskin leather, asymmetric front zip, notched lapel, snap collar, two zip side pockets, single zip chest pocket, zip cuffs. Cropped at the hip, defined waist. Saint Laurent silhouette but minimal — no studs, no quilting.',
    photography: PHOTOGRAPHY.jacket,
  },
  {
    slug: 'cream-silk-blouse-women',
    category: 'sweater',
    silhouetteTag: 'silk-blouse',
    name: 'Cream Silk Blouse',
    tier: 'pro',
    garment: 'Relaxed-fit silk blouse in warm cream-ivory silk crepe. Soft-collar with V-shaped opening, long sleeves with single-button cuff, slightly loose through the body, straight hem. The Row / Khaite aesthetic — fluid, quiet luxury.',
    photography: PHOTOGRAPHY.sweater,
  },
  {
    slug: 'brown-chelsea-boot-women',
    category: 'boot',
    silhouetteTag: 'classic-chelsea',
    name: 'Brown Chelsea Boot',
    tier: 'flash',
    garment: 'Classic chelsea boot in warm chestnut-brown polished calfskin leather. Elasticated side panels, brown leather pull tab, almond toe, leather sole with subtle 1-inch stacked heel. Slimmer last than men\'s. Saint Laurent silhouette.',
    photography: PHOTOGRAPHY.boot,
  },
  {
    slug: 'light-wash-jean-women',
    category: 'jean',
    silhouetteTag: 'high-rise-straight',
    name: 'Light Wash Jean',
    tier: 'flash',
    garment: 'High-rise straight-leg jean in pale stonewashed blue denim. Sits at natural waist, falls straight from hip to hem, light fade across the front of the legs. Soft hand. Khaite / Toteme silhouette.',
    photography: PHOTOGRAPHY.jean,
  },
];

const NEGATIVE = [
  'NEVER include: brand logos, brand names, visible labels, watermarks, AI artifacts',
  'NEVER include: humans, faces, hands, skin, body parts',
  'NEVER include: cluttered backgrounds, props, additional garments, decorative elements',
  'NEVER include: flat-lay from-above arrangements, top-down compositions',
  'NEVER include: oversaturated colors, HDR effects, blur, lens flare',
  'NEVER include: multiple views of the same garment, side-by-side product spreads, front-and-back comparison views, multi-angle layouts, triptychs, grid arrangements — output ONE garment from ONE angle, ONE image',
].join('. ');

function buildPrompt(item: BasicItem): string {
  return [
    `Product photograph of a single garment, isolated, hyperrealistic.`,
    ``,
    `Garment: ${item.garment}`,
    ``,
    `Photography: ${item.photography}`,
    ``,
    NEGATIVE,
    ``,
    `Output: a single still product image suitable for a luxury e-commerce site (SSENSE, Mr Porter, Toteme). Resolution and detail comparable to a real product photograph.`,
  ].join('\n');
}

async function generateWithFallback(item: BasicItem): Promise<{ bytes: Buffer; model: string; cost: number; dt: number } | null> {
  const requested: Tier = forceFlash ? 'flash' : item.tier;
  // Try requested tier first; on 503/overload, fall back to Flash
  const order: Tier[] = requested === 'pro' ? ['pro', 'flash'] : ['flash'];

  for (const tier of order) {
    const model = tier === 'pro' ? PRO_MODEL : FLASH_MODEL;
    const cost = tier === 'pro' ? PRO_COST : FLASH_COST;
    for (let attempt = 0; attempt < 3; attempt++) {
      const t0 = Date.now();
      try {
        const response = await ai.models.generateContent({ model, contents: buildPrompt(item) });
        const part = response.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
        if (part?.inlineData?.data) {
          return { bytes: Buffer.from(part.inlineData.data, 'base64'), model, cost, dt: Date.now() - t0 };
        }
        // No image data — retry once
        await new Promise((r) => setTimeout(r, 2000));
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        const overloaded = msg.includes('503') || msg.includes('UNAVAILABLE') || msg.includes('high demand');
        if (overloaded && attempt < 2) {
          const wait = Math.pow(2, attempt) * 3000;
          console.warn(`  ↻ ${item.slug} ${tier} overloaded, retrying in ${wait}ms (attempt ${attempt + 1}/3)`);
          await new Promise((r) => setTimeout(r, wait));
          continue;
        }
        if (overloaded && tier === 'pro') {
          console.warn(`  ↳ ${item.slug} falling back from pro → flash`);
          break; // exit inner loop, try next tier
        }
        throw e;
      }
    }
  }
  return null;
}

async function generateAndUpload(item: BasicItem, gender: 'men' | 'women', outputDir: string) {
  const result = await generateWithFallback(item);
  if (!result) return { ok: false, error: 'all tiers exhausted', costUsd: 0 };
  const { bytes, model, cost: costUsd, dt } = result;
  const tier: Tier = model === PRO_MODEL ? 'pro' : 'flash';

  // Always write local copy
  const localPath = join(outputDir, `${gender}-${item.slug}.png`);
  writeFileSync(localPath, bytes);

  if (localOnly) {
    console.log(`  ✓ ${gender}/${item.slug.padEnd(28)} ${tier} ${bytes.length.toString().padStart(7)}b ${dt}ms → ${localPath} (local-only)`);
    return { ok: true, costUsd, bytes: bytes.length };
  }

  // Upload to Supabase Storage
  const storagePath = `${gender}/${item.slug}.png`;
  const { error: uploadError } = await supabase.storage
    .from('wardrobe-basics')
    .upload(storagePath, bytes, { contentType: 'image/png', upsert: true });

  if (uploadError) {
    console.warn(`  ✗ ${gender}/${item.slug} upload failed: ${uploadError.message}`);
    return { ok: false, error: uploadError.message, costUsd };
  }

  // Index in wardrobe_basics
  const { error: insertError } = await supabase.from('wardrobe_basics').upsert({
    gender,
    category: item.category,
    silhouette_tag: item.silhouetteTag,
    slug: item.slug,
    name: item.name,
    storage_path: storagePath,
    generation_model: model,
    prompt: buildPrompt(item),
    cost_usd: costUsd,
    variant_index: 0,
  }, { onConflict: 'gender,slug,variant_index' });

  if (insertError) {
    console.warn(`  ✗ ${gender}/${item.slug} insert failed: ${insertError.message}`);
    return { ok: false, error: insertError.message, costUsd };
  }

  console.log(`  ✓ ${gender}/${item.slug.padEnd(28)} ${tier} ${bytes.length.toString().padStart(7)}b ${dt}ms → ${storagePath}`);
  return { ok: true, costUsd, bytes: bytes.length };
}

async function alreadyGenerated(gender: 'men' | 'women'): Promise<Set<string>> {
  if (localOnly) return new Set();
  const { data, error } = await supabase
    .from('wardrobe_basics')
    .select('slug')
    .eq('gender', gender);
  if (error) {
    console.warn(`[basics] could not check existing rows: ${error.message}`);
    return new Set();
  }
  return new Set((data ?? []).map((r) => r.slug as string));
}

async function runCatalog(gender: 'men' | 'women', items: BasicItem[]) {
  const outputDir = `./basics-output/${gender}`;
  mkdirSync(outputDir, { recursive: true });

  // Skip items already in Supabase unless --force-regen is passed.
  // --slug narrows to a single item (force-regen implied).
  const force = args.includes('--force-regen') || Boolean(slugArg);
  const existing = force ? new Set<string>() : await alreadyGenerated(gender);
  const toRun = items
    .filter((item) => (slugArg ? item.slug === slugArg : true))
    .filter((item) => !existing.has(item.slug));
  const skipped = items.length - toRun.length;

  console.log(`\n[basics] ${gender.toUpperCase()} catalog — ${toRun.length} new${skipped > 0 ? ` (${skipped} already in Supabase, skipped — pass --force-regen to redo)` : ''}`);
  if (toRun.length === 0) return { succeeded: 0, totalCost: 0 };

  console.log(`[basics] output: ${outputDir}/, supabase: ${localOnly ? 'SKIPPED' : 'wardrobe-basics bucket + wardrobe_basics table'}`);

  let totalCost = 0;
  let succeeded = 0;

  for (const item of toRun) {
    const result = await generateAndUpload(item, gender, outputDir);
    if (result.ok) succeeded++;
    totalCost += result.costUsd;
    await new Promise((r) => setTimeout(r, 1000));
  }

  console.log(`[basics] ${gender}: ${succeeded}/${toRun.length} ok, $${totalCost.toFixed(4)}`);
  return { succeeded, totalCost };
}

async function main() {
  let catalogs: Array<{ gender: 'men' | 'women'; items: BasicItem[] }>;

  if (genderArg === 'men') catalogs = [{ gender: 'men', items: MEN_CATALOG }];
  else if (genderArg === 'women') catalogs = [{ gender: 'women', items: WOMEN_CATALOG }];
  else catalogs = [{ gender: 'men', items: MEN_CATALOG }, { gender: 'women', items: WOMEN_CATALOG }];

  let grandTotal = 0;
  let grandSucceeded = 0;

  for (const { gender, items } of catalogs) {
    const { succeeded, totalCost } = await runCatalog(gender, items);
    grandSucceeded += succeeded;
    grandTotal += totalCost;
  }

  console.log(`\n[basics] DONE — ${grandSucceeded} images, $${grandTotal.toFixed(4)} total`);
  if (!localOnly) {
    console.log(`[basics] View in Supabase: select gender, category, slug, storage_path from wardrobe_basics order by gender, category;`);
  }
}

main().catch((e) => {
  console.error('[basics] fatal:', e instanceof Error ? e.message : e);
  process.exit(1);
});
