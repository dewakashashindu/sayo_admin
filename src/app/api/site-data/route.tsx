// app/api/site-data/route.ts  ← sayo-admin (FULL ADMIN ACCESS)
// ─────────────────────────────────────────────────────────
// GET    → all sections + full feedback list (unpublished included)
// POST   → upsert nav/home/footer/about/services/contact/gallery
// PATCH  → feedback publish/unpublish
// DELETE → feedback delete
// ─────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
export const dynamic   = 'force-dynamic';
export const revalidate = 0;

/* ─────────────────────────────────────────
   DEFAULTS
───────────────────────────────────────── */
const NAV_DEFAULTS = {
  logo_text: 'SAYO',
  contact_btn_text: 'CONTACT US',
  contact_btn_link: '/contact',
  nav_items: [
    { label: 'HOME',      href: '/'        },
    { label: 'OUR STORY', href: '/about'   },
    { label: 'SERVICES',  href: '/services'},
    { label: 'PRODUCTS',  href: '/products'},
    { label: 'REVIEWS',   href: '/reviews' },
  ],
};

const HOME_DEFAULTS = {
  hero_eyebrow:  'Experienced hair stylists',
  hero_heading:  'Enjoy Professional Beauty Services!',
  hero_body:     'Providing expert skin care advice & beauty services using natural products to cater for any skin.',
  hero_cta_text: 'Reserve Experience',
  hero_cta_link: '/contact',
};

const FOOTER_DEFAULTS = {
  brand_name:      'SAYO',
  brand_tagline:   'We are experienced in making you more beautiful',
  contact_phone:   '+94 77 233 6233',
  contact_email:   'hello@sayobeauty.com',
  contact_address: '123 Galle Road, Colombo, Sri Lanka',
  copyright_text:  '© 2025 SAYO Beauty. All rights reserved.',
  locations:       ['Colombo', 'Negombo', 'Kiribathgoda'],
  quick_links: [
    { label: 'Home',      href: '/'        },
    { label: 'Our Story', href: '/about'   },
    { label: 'Services',  href: '/services'},
    { label: 'Products',  href: '/products'},
    { label: 'Reviews',   href: '/reviews' },
  ],
  social_whatsapp:  '',
  social_facebook:  '',
  social_instagram: '',
};

const ABOUT_DEFAULTS = {
  hero_eyebrow:          'OUR STORY',
  hero_heading:          'We are experience in making you more beautiful',
  hero_body:             'We will make your skin better and also more glowing skin. And we provide to treatment spa and face with best service our employees,',
  team_section_title:    'Meet the Visionaries',
  staff: [
    {
      name:        'Hiruni Perera',
      role:        'Lead Stylist & Founder',
      experience:  '12+ Years',
      bio:         'Train-certified in London and Singapore, Hiruni founded the salon with a vision to revolutionize modern hair styling in Sri Lanka.',
      specialties: 'Precision Haircuts, Balayage & Highlights, Advanced Hair Treatments',
    },
    {
      name:        'Aruna Ratnayake',
      role:        'Grooming Specialist',
      experience:  '10+ Years',
      bio:         "Bringing a sharp eye for detail and modern barbering techniques, Aruna specializes in tailored men's styling and beard architecture.",
      specialties: "Precision Beard Sculpting, Classic & Modern Men's Haircuts, Groom's Styling Package",
    },
  ],
  gallery_section_title: 'Transformations & Artistry',
  gallery_description:   'Explore our latest work, behind-the-scenes moments, and client transformations.',
  gallery_images:        ['', '', '', '', ''],
  review_section_title:  'What Our Clients Say',
  reviews: [
    { quote: '"Choosing SAYO for my Kandyan bridal dressing was the best decision I made."', author: 'Nimesha D.' },
    { quote: '"I\'ve tried many salons across Colombo, but SAYO stands apart."',             author: 'Sanduni R.' },
    { quote: '"Aruna\'s attention to detail with my beard and fade was exceptional."',       author: 'Kasun P.'   },
    { quote: '"From the moment you walk in, you feel looked after."',                        author: 'Dilani W.'  },
  ],
};

const SERVICES_CATEGORIES_DEFAULT = [
  { key: 'WAX',    label: 'WAX',    image: 'https://plus.unsplash.com/premium_photo-1664187387039-ba5451b2be6f?w=487&h=582&fit=crop&q=80'  },
  { key: 'HAIR',   label: 'HAIR',   image: 'https://images.unsplash.com/photo-1700760934268-8aa0ef52ce0a?w=487&h=582&fit=crop&q=80'         },
  { key: 'SKIN',   label: 'SKIN',   image: 'https://plus.unsplash.com/premium_photo-1679046948909-ab47e96082e7?w=487&h=582&fit=crop&q=80'   },
  { key: 'NAIL',   label: 'NAIL',   image: 'https://images.unsplash.com/photo-1604654894610-df63bc536371?w=487&h=582&fit=crop&q=80'          },
  { key: 'BODY',   label: 'BODY',   image: 'https://images.unsplash.com/photo-1619451427882-6aaaded0cc61?w=487&h=582&fit=crop&q=80'          },
  { key: 'BRIDAL', label: 'BRIDAL', image: 'https://plus.unsplash.com/premium_photo-1711132425055-1c289c69b950?w=487&h=582&fit=crop&q=80'   },
];

const SERVICES_PRICE_LIST_DEFAULT = {
  her: {
    WAX:    [ { name: 'Full Arms Wax', price1: '2,500.00' }, { name: 'Full Legs Wax', price1: '3,500.00' }, { name: 'Underarm Wax', price1: '1,200.00' }, { name: 'Eyebrow Threading', price1: '800.00' }, { name: 'Full Body Wax', price1: '7,500.00', price2: '6,800.00' } ],
    HAIR:   [ { name: 'Cut & Re-Style (Advance)', price1: '4,200.00', price2: '3,600.00' }, { name: 'Fringe Cut', price1: '1,500.00' }, { name: 'Trim', price1: '1,500.00' }, { name: 'Blow Dry - Short', price1: '2,500.00', price2: '2,200.00' }, { name: 'Hair Wash & Blast Dry', price1: '2,100.00', price2: '1,800.00' } ],
    SKIN:   [ { name: 'Classic Facial', price1: '3,000.00' }, { name: 'Gold Facial', price1: '6,500.00' }, { name: 'Skin Brightening', price1: '5,200.00' }, { name: 'Acne Treatment', price1: '4,800.00' }, { name: 'Anti-Aging Facial', price1: '7,200.00', price2: '6,500.00' } ],
    NAIL:   [ { name: 'Classic Manicure', price1: '1,800.00' }, { name: 'Gel Manicure', price1: '3,200.00' }, { name: 'Classic Pedicure', price1: '2,200.00' }, { name: 'Gel Pedicure', price1: '3,800.00' }, { name: 'Nail Art (Per Set)', price1: '1,500.00' } ],
    BODY:   [ { name: 'Full Body Massage', price1: '5,500.00' }, { name: 'Body Scrub', price1: '4,200.00' }, { name: 'Body Wrap', price1: '6,000.00' }, { name: 'Aromatherapy Massage', price1: '6,800.00', price2: '5,900.00' }, { name: 'Hot Stone Massage', price1: '7,500.00' } ],
    BRIDAL: [ { name: 'Bridal Package - Full', price1: '45,000.00' }, { name: 'Bridal Hair & Makeup', price1: '18,000.00' }, { name: 'Pre-Bridal Package', price1: '22,000.00' }, { name: 'Trial Makeup', price1: '6,500.00' }, { name: 'Bridal Draping', price1: '5,000.00' } ],
  },
  his: {
    WAX:    [ { name: 'Half Arms Wax', price1: '2,000.00' }, { name: 'Chest Wax', price1: '3,200.00' }, { name: 'Back Wax', price1: '3,600.00' }, { name: 'Full Legs Wax', price1: '4,000.00' }, { name: 'Beard Shaping', price1: '1,000.00' } ],
    HAIR:   [ { name: 'Haircut - Classic', price1: '1,800.00' }, { name: 'Beard Trim', price1: '900.00' }, { name: 'Hair Wash', price1: '700.00' }, { name: 'Head Massage', price1: '1,500.00', price2: '1,200.00' }, { name: 'Hair Color', price1: '3,500.00' } ],
    SKIN:   [ { name: 'Deep Cleansing Facial', price1: '3,500.00' }, { name: 'Skin Polishing', price1: '4,000.00' }, { name: 'Beard Care Facial', price1: '3,200.00' }, { name: 'Whitening Facial', price1: '4,800.00' }, { name: 'Detox Facial', price1: '5,500.00', price2: '4,900.00' } ],
    NAIL:   [ { name: 'Basic Manicure', price1: '1,200.00' }, { name: 'Basic Pedicure', price1: '1,500.00' }, { name: 'Nail Trim & Buff', price1: '800.00' }, { name: 'Callus Removal', price1: '1,000.00' }, { name: 'Hand Spa', price1: '2,200.00' } ],
    BODY:   [ { name: 'Deep Tissue Massage', price1: '6,000.00' }, { name: 'Body Scrub', price1: '4,000.00' }, { name: 'Sports Massage', price1: '6,500.00' }, { name: 'Back Massage', price1: '3,500.00' }, { name: 'Head & Shoulder Massage', price1: '2,800.00' } ],
    BRIDAL: [ { name: 'Groom Package', price1: '25,000.00' }, { name: 'Groom Hair & Makeup', price1: '10,000.00' }, { name: 'Pre-Groom Package', price1: '14,000.00' }, { name: 'Groom Facial', price1: '4,500.00' }, { name: 'Groom Grooming', price1: '3,500.00' } ],
  },
};

const SERVICES_DEFAULTS = {
  hero_heading:  'Tailored Treatments for Your Unique Glow',
  hero_subtitle: "Experience a symphony of precision and luxury. Our services are tailored to the individual, utilizing the world's most exclusive botanical formulas and advanced styling techniques.",
  categories:    SERVICES_CATEGORIES_DEFAULT,
  price_list:    SERVICES_PRICE_LIST_DEFAULT,
};

const CONTACT_DEFAULTS = {
  hero_eyebrow:       'Luxury Concierge Experience',
  hero_heading:       'GET IN TOUCH',
  hero_subtitle:      'Experience personalized luxury tailored specifically for your needs. Our dedicated concierge team in Colombo is here to orchestrate your journey into refined elegance.',
  cta_primary_text:   'Send an Inquiry',
  cta_secondary_text: 'Call Us Now',
  phone_number:       '0772336233',
  email_address:      'info@sayobeauty.com',
  stats: [
    { value: '3',   label: 'Locations'          },
    { value: '10+', label: 'Years of Excellence' },
    { value: '5K+', label: 'Happy Clients'       },
  ],
  map_embed_src:  'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3961.0558055526335!2d79.85803897585825!3d6.883918893115073!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x3ae25bc5b891a4b5%3A0xc60aa90940280873!2s45%2C%203%20Galle%20Rd%2C%20Colombo%2000500!5e0!3m2!1sen!2slk!4v1785130068196!5m2!1sen!2slk',
  map_address:    'No. 45, Galle Road, Colombo 03, Sri Lanka',
  map_open_href:  'https://maps.google.com/?q=45+Galle+Rd+Colombo+00500+Sri+Lanka',
  social_instagram: '',
  social_facebook:  '',
  social_whatsapp:  '',
  branches: [
    { name: 'Colombo — Head Office', address: 'No. 45, Galle Road, Colombo 03, Sri Lanka',    phone: '0772336233', email: 'info@sayobeauty.com',          isHead: true,  mapHref: 'https://maps.google.com/?q=45+Galle+Rd+Colombo+00500+Sri+Lanka'   },
    { name: 'Negombo Branch',        address: 'No. 12, Poruthota Road, Negombo, Sri Lanka',   phone: '0772336233', email: 'negombo@sayobeauty.com',       isHead: false, mapHref: 'https://maps.google.com/?q=Poruthota+Road+Negombo+Sri+Lanka'       },
    { name: 'Kiribathgoda Branch',   address: 'No. 78, Kandy Road, Kiribathgoda, Sri Lanka',  phone: '0772336233', email: 'kiribathgoda@sayobeauty.com',  isHead: false, mapHref: 'https://maps.google.com/?q=Kandy+Road+Kiribathgoda+Sri+Lanka'       },
  ],
};

const GALLERY_DEFAULTS = {
  hero_eyebrow:      '✦ SAYO Beauty Studio ✦',
  hero_title:        'The Beauty Canvas',
  hero_subtitle:     'A curated showcase of artistry, elegance, and unforgettable transformations crafted by our expert stylists.',
  section_title:     'Our Portfolio',
  section_subtitle:  'Browse through our collection of stunning transformations and beauty artistry',
  items: [
    { id: 1,  src: '/gallery/bridal-1.jpg', alt: 'Bridal Makeup',       label: 'Bridal Makeup',         tag: 'Bridal', filter: 'bridal', aspect: 'portrait'  },
    { id: 2,  src: '/gallery/hair-1.jpg',   alt: 'Hair Coloring',        label: 'Balayage & Highlights', tag: 'Hair',   filter: 'hair',   aspect: 'landscape' },
    { id: 3,  src: '/gallery/makeup-1.jpg', alt: 'Glam Makeup',          label: 'Evening Glam',          tag: 'Makeup', filter: 'makeup', aspect: 'portrait'  },
    { id: 4,  src: '/gallery/hair-2.jpg',   alt: 'Hair Styling',         label: 'Precision Cuts',        tag: 'Hair',   filter: 'hair',   aspect: 'square'    },
    { id: 5,  src: '/gallery/bridal-2.jpg', alt: 'Kandyan Bridal',       label: 'Kandyan Bridal Look',   tag: 'Bridal', filter: 'bridal', aspect: 'landscape' },
    { id: 6,  src: '/gallery/spa-1.jpg',    alt: 'Spa Treatment',        label: 'Rejuvenating Spa',      tag: 'Spa',    filter: 'spa',    aspect: 'portrait'  },
    { id: 7,  src: '/gallery/nail-1.jpg',   alt: 'Nail Art',             label: 'Nail Artistry',         tag: 'Nails',  filter: 'nails',  aspect: 'square'    },
    { id: 8,  src: '/gallery/makeup-2.jpg', alt: 'Bridal Makeup Detail', label: 'Bridal Eyes',           tag: 'Bridal', filter: 'bridal', aspect: 'landscape' },
    { id: 9,  src: '/gallery/hair-3.jpg',   alt: 'Hair Treatment',       label: 'Keratin Treatment',     tag: 'Hair',   filter: 'hair',   aspect: 'portrait'  },
    { id: 10, src: '/gallery/salon-1.jpg',  alt: 'Salon Interior',       label: 'Our Studio',            tag: 'Studio', filter: 'studio', aspect: 'landscape' },
    { id: 11, src: '/gallery/bridal-3.jpg', alt: 'Modern Bridal',        label: 'Modern Bridal Glow',    tag: 'Bridal', filter: 'bridal', aspect: 'square'    },
    { id: 12, src: '/gallery/spa-2.jpg',    alt: 'Facial Treatment',     label: 'Luxury Facial',         tag: 'Spa',    filter: 'spa',    aspect: 'portrait'  },
  ],
};

/* ─────────────────────────────────────────
   HELPERS
───────────────────────────────────────── */
function getFulfilledResult<T>(results: PromiseSettledResult<T>[]): T | null {
  for (const res of results) {
    if (res.status === 'fulfilled' && res.value) return res.value;
  }
  return null;
}

function getErrorMessage(err: unknown): string {
  if (!err) return 'Unknown error';
  if (err instanceof Error) {
    const code = (err as { code?: string }).code;
    return code ? `${err.message} (code: ${code})` : err.message;
  }
  try { return JSON.stringify(err); } catch { return String(err); }
}

/* ─────────────────────────────────────────
   GET  — full admin view (all feedback, all sections)
───────────────────────────────────────── */
export async function GET(req: NextRequest) {
  const section = req.nextUrl.searchParams.get('section');

  try {

    if (section === 'nav') {
      const data = await prisma.navConfig.findUnique({ where: { id: 1 } });
      if (!data) return NextResponse.json(NAV_DEFAULTS);
      return NextResponse.json({ ...data, nav_items: Array.isArray(data.nav_items) ? data.nav_items : NAV_DEFAULTS.nav_items });
    }

    if (section === 'home') {
      const data = await prisma.homeConfig.findUnique({ where: { id: 1 } });
      return NextResponse.json(data ?? HOME_DEFAULTS);
    }

    if (section === 'footer') {
      const data = await prisma.footerConfig.findUnique({ where: { id: 1 } });
      if (!data) return NextResponse.json(FOOTER_DEFAULTS);
      return NextResponse.json({ ...data, locations: Array.isArray(data.locations) ? data.locations : FOOTER_DEFAULTS.locations, quick_links: Array.isArray(data.quick_links) ? data.quick_links : FOOTER_DEFAULTS.quick_links });
    }

    if (section === 'about') {
      const data = await prisma.aboutConfig.findUnique({ where: { id: 1 } });
      if (!data) return NextResponse.json(ABOUT_DEFAULTS);

      const rawStaff = Array.isArray(data.staff) && (data.staff as unknown[]).length > 0
        ? data.staff as { name: string; role: string; experience: string; bio: string; specialties: string; photo?: string | null; image?: string | null }[]
        : ABOUT_DEFAULTS.staff;
      const normalizedStaff = rawStaff.map(member => {
        const m = member as Record<string, unknown>;
        return { ...member, photo: typeof m.photo === 'string' ? m.photo.trim() : '', image: typeof m.image === 'string' ? m.image.trim() : '' };
      });

      return NextResponse.json({
        ...data,
        staff:          normalizedStaff,
        reviews:        Array.isArray(data.reviews)        && (data.reviews        as unknown[]).length > 0 ? data.reviews        : ABOUT_DEFAULTS.reviews,
        gallery_images: Array.isArray(data.gallery_images) && (data.gallery_images as unknown[]).length === 5 ? data.gallery_images : ABOUT_DEFAULTS.gallery_images,
      });
    }

    if (section === 'services') {
      const data = await prisma.servicesConfig.findUnique({ where: { id: 1 } });
      if (!data) return NextResponse.json(SERVICES_DEFAULTS);
      const rawCats = Array.isArray(data.categories) && (data.categories as unknown[]).length > 0 ? data.categories : SERVICES_DEFAULTS.categories;
      const fixedCats = (rawCats as { key: string; label: string; image?: string }[]).map(cat => {
        const def = SERVICES_CATEGORIES_DEFAULT.find(d => d.key === cat.key);
        return { ...cat, image: cat.image && cat.image.startsWith('http') ? cat.image : (def?.image ?? '') };
      });
      return NextResponse.json({ hero_heading: data.hero_heading || SERVICES_DEFAULTS.hero_heading, hero_subtitle: data.hero_subtitle || SERVICES_DEFAULTS.hero_subtitle, categories: fixedCats, price_list: data.price_list && typeof data.price_list === 'object' ? data.price_list : SERVICES_DEFAULTS.price_list });
    }

    if (section === 'contact') {
      const data = await prisma.contactConfig.findUnique({ where: { id: 1 } });
      if (!data) return NextResponse.json(CONTACT_DEFAULTS);
      return NextResponse.json({ ...data, stats: Array.isArray(data.stats) && (data.stats as unknown[]).length > 0 ? data.stats : CONTACT_DEFAULTS.stats, branches: Array.isArray(data.branches) && (data.branches as unknown[]).length > 0 ? data.branches : CONTACT_DEFAULTS.branches });
    }

    if (section === 'gallery') {
      const cloudOk = typeof prisma.galleryConfig === 'object';
      let data: { [k: string]: unknown } | null = null;
      if (cloudOk) data = (await prisma.galleryConfig.findUnique({ where: { id: 1 } })) ?? data;
      if (!data) return NextResponse.json(GALLERY_DEFAULTS);
      return NextResponse.json({ ...data, hero_eyebrow: data.hero_eyebrow ?? GALLERY_DEFAULTS.hero_eyebrow, hero_title: data.hero_title ?? GALLERY_DEFAULTS.hero_title, hero_subtitle: data.hero_subtitle ?? GALLERY_DEFAULTS.hero_subtitle, section_title: data.section_title ?? GALLERY_DEFAULTS.section_title, section_subtitle: data.section_subtitle ?? GALLERY_DEFAULTS.section_subtitle, items: Array.isArray(data.items) && (data.items as unknown[]).length > 0 ? data.items : GALLERY_DEFAULTS.items });
    }

    /* ── feedback — full list for admin (published + unpublished) ── */
    if (section === 'feedback') {
      const location         = req.nextUrl.searchParams.get('location');
      const rating           = req.nextUrl.searchParams.get('rating');
      const isPublishedParam = req.nextUrl.searchParams.get('isPublished');
      const page             = Math.max(1, parseInt(req.nextUrl.searchParams.get('page')  ?? '1',  10));
      const limit            = Math.min(500, parseInt(req.nextUrl.searchParams.get('limit') ?? '20', 10));
      const skip             = (page - 1) * limit;

      const where: { cusLocation?: string; cusRating?: number; isPublished?: boolean } = {};
      if (location)              where.cusLocation = location;
      if (rating)                where.cusRating   = parseInt(rating, 10);
      if (isPublishedParam !== null) {
        where.isPublished = isPublishedParam === '1' || isPublishedParam === 'true';
      }

      let rows: unknown[] = [];
      let total = 0;
      [rows, total] = await Promise.all([
        prisma.tbl_Feedback.findMany({ where, orderBy: { submittedAt: 'desc' }, skip, take: limit }),
        prisma.tbl_Feedback.count({ where }),
      ]);

      return NextResponse.json({ data: rows, total, page, limit, totalPages: Math.ceil(total / limit), source: 'cloud' });
    }

    /* ── all sections fallback ── */
    const [nav, home, footer, about, services, contact, gallery] = await Promise.all([
      prisma.navConfig.findUnique({      where: { id: 1 } }),
      prisma.homeConfig.findUnique({     where: { id: 1 } }),
      prisma.footerConfig.findUnique({   where: { id: 1 } }),
      prisma.aboutConfig.findUnique({    where: { id: 1 } }),
      prisma.servicesConfig.findUnique({ where: { id: 1 } }),
      prisma.contactConfig.findUnique({  where: { id: 1 } }),
      prisma.galleryConfig?.findUnique?.({ where: { id: 1 } }),
    ]);

    return NextResponse.json({
      nav:      nav      ? { ...nav,      nav_items: Array.isArray(nav.nav_items) ? nav.nav_items : NAV_DEFAULTS.nav_items }                                                                                                                                                                                                                                                                                                                                            : NAV_DEFAULTS,
      home:     home     ?? HOME_DEFAULTS,
      footer:   footer   ? { ...footer,   locations:  Array.isArray(footer.locations)   ? footer.locations   : FOOTER_DEFAULTS.locations,   quick_links: Array.isArray(footer.quick_links) ? footer.quick_links : FOOTER_DEFAULTS.quick_links }                                                                                                                                                                                                                       : FOOTER_DEFAULTS,
      about:    about    ? { ...about,    staff:       Array.isArray(about.staff)    && (about.staff    as unknown[]).length > 0 ? about.staff    : ABOUT_DEFAULTS.staff,    reviews: Array.isArray(about.reviews)   && (about.reviews   as unknown[]).length > 0 ? about.reviews   : ABOUT_DEFAULTS.reviews }                                                                                                                                                       : ABOUT_DEFAULTS,
      services: services ? { hero_heading: services.hero_heading || SERVICES_DEFAULTS.hero_heading, hero_subtitle: services.hero_subtitle || SERVICES_DEFAULTS.hero_subtitle, categories: (Array.isArray(services.categories) && (services.categories as unknown[]).length > 0 ? services.categories : SERVICES_DEFAULTS.categories) as typeof SERVICES_DEFAULTS.categories, price_list: services.price_list && typeof services.price_list === 'object' ? services.price_list : SERVICES_DEFAULTS.price_list } : SERVICES_DEFAULTS,
      contact:  contact  ? { ...contact,  stats:       Array.isArray(contact.stats)    && (contact.stats    as unknown[]).length > 0 ? contact.stats    : CONTACT_DEFAULTS.stats,    branches: Array.isArray(contact.branches) && (contact.branches as unknown[]).length > 0 ? contact.branches : CONTACT_DEFAULTS.branches }                                                                                                                                        : CONTACT_DEFAULTS,
      gallery:  gallery  ? { ...gallery,  hero_eyebrow: gallery.hero_eyebrow ?? GALLERY_DEFAULTS.hero_eyebrow, hero_title: gallery.hero_title ?? GALLERY_DEFAULTS.hero_title, hero_subtitle: gallery.hero_subtitle ?? GALLERY_DEFAULTS.hero_subtitle, section_title: gallery.section_title ?? GALLERY_DEFAULTS.section_title, section_subtitle: gallery.section_subtitle ?? GALLERY_DEFAULTS.section_subtitle, items: Array.isArray(gallery.items) && (gallery.items as unknown[]).length > 0 ? gallery.items : GALLERY_DEFAULTS.items } : GALLERY_DEFAULTS,
    });

  } catch (err) {
    console.error('[site-data GET]', err);
    return NextResponse.json({ nav: NAV_DEFAULTS, home: HOME_DEFAULTS, footer: FOOTER_DEFAULTS, about: ABOUT_DEFAULTS, services: SERVICES_DEFAULTS, contact: CONTACT_DEFAULTS, gallery: GALLERY_DEFAULTS });
  }
}

/* ─────────────────────────────────────────
   POST — admin upserts (nav/home/footer/about/services/contact/gallery)
───────────────────────────────────────── */
export async function POST(req: NextRequest) {
  const section = req.nextUrl.searchParams.get('section');

  try {
    const body = await req.json();

    if (section === 'nav') {
      const payload = {
        where:  { id: 1 },
        update: { logo_text: body.logo_text ?? NAV_DEFAULTS.logo_text, contact_btn_text: body.contact_btn_text ?? NAV_DEFAULTS.contact_btn_text, contact_btn_link: body.contact_btn_link ?? NAV_DEFAULTS.contact_btn_link, nav_items: body.nav_items ?? NAV_DEFAULTS.nav_items, updated_by: 'admin' },
        create: { id: 1, logo_text: body.logo_text ?? NAV_DEFAULTS.logo_text, contact_btn_text: body.contact_btn_text ?? NAV_DEFAULTS.contact_btn_text, contact_btn_link: body.contact_btn_link ?? NAV_DEFAULTS.contact_btn_link, nav_items: body.nav_items ?? NAV_DEFAULTS.nav_items, updated_by: 'admin' },
      };
      const result = await prisma.navConfig.upsert(payload);
      return NextResponse.json(result ?? { success: true });
    }

    if (section === 'home') {
      const payload = {
        where:  { id: 1 },
        update: { hero_eyebrow: body.hero_eyebrow ?? HOME_DEFAULTS.hero_eyebrow, hero_heading: body.hero_heading ?? HOME_DEFAULTS.hero_heading, hero_body: body.hero_body ?? HOME_DEFAULTS.hero_body, hero_cta_text: body.hero_cta_text ?? HOME_DEFAULTS.hero_cta_text, hero_cta_link: body.hero_cta_link ?? HOME_DEFAULTS.hero_cta_link, updated_by: 'admin' },
        create: { id: 1, hero_eyebrow: body.hero_eyebrow ?? HOME_DEFAULTS.hero_eyebrow, hero_heading: body.hero_heading ?? HOME_DEFAULTS.hero_heading, hero_body: body.hero_body ?? HOME_DEFAULTS.hero_body, hero_cta_text: body.hero_cta_text ?? HOME_DEFAULTS.hero_cta_text, hero_cta_link: body.hero_cta_link ?? HOME_DEFAULTS.hero_cta_link, updated_by: 'admin' },
      };
      const result = await prisma.homeConfig.upsert(payload);
      return NextResponse.json(result ?? { success: true });
    }

    if (section === 'footer') {
      const payload = {
        where:  { id: 1 },
        update: { brand_name: body.brand_name ?? FOOTER_DEFAULTS.brand_name, brand_tagline: body.brand_tagline ?? FOOTER_DEFAULTS.brand_tagline, contact_phone: body.contact_phone ?? FOOTER_DEFAULTS.contact_phone, contact_email: body.contact_email ?? FOOTER_DEFAULTS.contact_email, contact_address: body.contact_address ?? FOOTER_DEFAULTS.contact_address, copyright_text: body.copyright_text ?? FOOTER_DEFAULTS.copyright_text, locations: body.locations ?? FOOTER_DEFAULTS.locations, quick_links: body.quick_links ?? FOOTER_DEFAULTS.quick_links, social_whatsapp: body.social_whatsapp ?? '', social_facebook: body.social_facebook ?? '', social_instagram: body.social_instagram ?? '', updated_by: 'admin' },
        create: { id: 1, brand_name: body.brand_name ?? FOOTER_DEFAULTS.brand_name, brand_tagline: body.brand_tagline ?? FOOTER_DEFAULTS.brand_tagline, contact_phone: body.contact_phone ?? FOOTER_DEFAULTS.contact_phone, contact_email: body.contact_email ?? FOOTER_DEFAULTS.contact_email, contact_address: body.contact_address ?? FOOTER_DEFAULTS.contact_address, copyright_text: body.copyright_text ?? FOOTER_DEFAULTS.copyright_text, locations: body.locations ?? FOOTER_DEFAULTS.locations, quick_links: body.quick_links ?? FOOTER_DEFAULTS.quick_links, social_whatsapp: body.social_whatsapp ?? '', social_facebook: body.social_facebook ?? '', social_instagram: body.social_instagram ?? '', updated_by: 'admin' },
      };
      const result = await prisma.footerConfig.upsert(payload);
      return NextResponse.json(result ?? { success: true });
    }

    if (section === 'about') {
      const payload = {
        where:  { id: 1 },
        update: { hero_eyebrow: body.hero_eyebrow ?? ABOUT_DEFAULTS.hero_eyebrow, hero_heading: body.hero_heading ?? ABOUT_DEFAULTS.hero_heading, hero_body: body.hero_body ?? ABOUT_DEFAULTS.hero_body, team_section_title: body.team_section_title ?? ABOUT_DEFAULTS.team_section_title, staff: body.staff ?? ABOUT_DEFAULTS.staff, gallery_section_title: body.gallery_section_title ?? ABOUT_DEFAULTS.gallery_section_title, gallery_description: body.gallery_description ?? ABOUT_DEFAULTS.gallery_description, gallery_images: body.gallery_images ?? ABOUT_DEFAULTS.gallery_images, review_section_title: body.review_section_title ?? ABOUT_DEFAULTS.review_section_title, reviews: body.reviews ?? ABOUT_DEFAULTS.reviews, updated_by: 'admin' },
        create: { id: 1, hero_eyebrow: body.hero_eyebrow ?? ABOUT_DEFAULTS.hero_eyebrow, hero_heading: body.hero_heading ?? ABOUT_DEFAULTS.hero_heading, hero_body: body.hero_body ?? ABOUT_DEFAULTS.hero_body, team_section_title: body.team_section_title ?? ABOUT_DEFAULTS.team_section_title, staff: body.staff ?? ABOUT_DEFAULTS.staff, gallery_section_title: body.gallery_section_title ?? ABOUT_DEFAULTS.gallery_section_title, gallery_description: body.gallery_description ?? ABOUT_DEFAULTS.gallery_description, gallery_images: body.gallery_images ?? ABOUT_DEFAULTS.gallery_images, review_section_title: body.review_section_title ?? ABOUT_DEFAULTS.review_section_title, reviews: body.reviews ?? ABOUT_DEFAULTS.reviews, updated_by: 'admin' },
      };
      const result = await prisma.aboutConfig.upsert(payload);
      return NextResponse.json(result ?? { success: true });
    }

    if (section === 'services') {
      const payload = {
        where:  { id: 1 },
        update: { hero_heading: body.hero_heading ?? SERVICES_DEFAULTS.hero_heading, hero_subtitle: body.hero_subtitle ?? SERVICES_DEFAULTS.hero_subtitle, categories: body.categories ?? SERVICES_DEFAULTS.categories, price_list: body.price_list ?? SERVICES_DEFAULTS.price_list, updated_by: 'admin' },
        create: { id: 1, hero_heading: body.hero_heading ?? SERVICES_DEFAULTS.hero_heading, hero_subtitle: body.hero_subtitle ?? SERVICES_DEFAULTS.hero_subtitle, categories: body.categories ?? SERVICES_DEFAULTS.categories, price_list: body.price_list ?? SERVICES_DEFAULTS.price_list, updated_by: 'admin' },
      };
      const result = await prisma.servicesConfig.upsert(payload);
      return NextResponse.json(result ?? { success: true });
    }

    if (section === 'contact') {
      const payload = {
        where:  { id: 1 },
        update: { hero_eyebrow: body.hero_eyebrow ?? CONTACT_DEFAULTS.hero_eyebrow, hero_heading: body.hero_heading ?? CONTACT_DEFAULTS.hero_heading, hero_subtitle: body.hero_subtitle ?? CONTACT_DEFAULTS.hero_subtitle, cta_primary_text: body.cta_primary_text ?? CONTACT_DEFAULTS.cta_primary_text, cta_secondary_text: body.cta_secondary_text ?? CONTACT_DEFAULTS.cta_secondary_text, phone_number: body.phone_number ?? CONTACT_DEFAULTS.phone_number, email_address: body.email_address ?? CONTACT_DEFAULTS.email_address, stats: body.stats ?? CONTACT_DEFAULTS.stats, map_embed_src: body.map_embed_src ?? CONTACT_DEFAULTS.map_embed_src, map_address: body.map_address ?? CONTACT_DEFAULTS.map_address, map_open_href: body.map_open_href ?? CONTACT_DEFAULTS.map_open_href, social_instagram: body.social_instagram ?? '', social_facebook: body.social_facebook ?? '', social_whatsapp: body.social_whatsapp ?? '', branches: body.branches ?? CONTACT_DEFAULTS.branches, updated_by: 'admin' },
        create: { id: 1, hero_eyebrow: body.hero_eyebrow ?? CONTACT_DEFAULTS.hero_eyebrow, hero_heading: body.hero_heading ?? CONTACT_DEFAULTS.hero_heading, hero_subtitle: body.hero_subtitle ?? CONTACT_DEFAULTS.hero_subtitle, cta_primary_text: body.cta_primary_text ?? CONTACT_DEFAULTS.cta_primary_text, cta_secondary_text: body.cta_secondary_text ?? CONTACT_DEFAULTS.cta_secondary_text, phone_number: body.phone_number ?? CONTACT_DEFAULTS.phone_number, email_address: body.email_address ?? CONTACT_DEFAULTS.email_address, stats: body.stats ?? CONTACT_DEFAULTS.stats, map_embed_src: body.map_embed_src ?? CONTACT_DEFAULTS.map_embed_src, map_address: body.map_address ?? CONTACT_DEFAULTS.map_address, map_open_href: body.map_open_href ?? CONTACT_DEFAULTS.map_open_href, social_instagram: body.social_instagram ?? '', social_facebook: body.social_facebook ?? '', social_whatsapp: body.social_whatsapp ?? '', branches: body.branches ?? CONTACT_DEFAULTS.branches, updated_by: 'admin' },
      };
      const result = await prisma.contactConfig.upsert(payload);
      return NextResponse.json(result ?? { success: true });
    }

    if (section === 'gallery') {
      const cloudOk = typeof prisma.galleryConfig === 'object';
      if (!cloudOk) {
        return NextResponse.json({ error: 'GalleryConfig model not found in Prisma. Run: npx prisma generate && npx prisma db push' }, { status: 500 });
      }
      const payload = {
        where:  { id: 1 },
        update: { hero_eyebrow: body.hero_eyebrow ?? GALLERY_DEFAULTS.hero_eyebrow, hero_title: body.hero_title ?? GALLERY_DEFAULTS.hero_title, hero_subtitle: body.hero_subtitle ?? GALLERY_DEFAULTS.hero_subtitle, section_title: body.section_title ?? GALLERY_DEFAULTS.section_title, section_subtitle: body.section_subtitle ?? GALLERY_DEFAULTS.section_subtitle, items: Array.isArray(body.items) ? body.items : GALLERY_DEFAULTS.items, updated_by: 'admin' },
        create: { id: 1, hero_eyebrow: body.hero_eyebrow ?? GALLERY_DEFAULTS.hero_eyebrow, hero_title: body.hero_title ?? GALLERY_DEFAULTS.hero_title, hero_subtitle: body.hero_subtitle ?? GALLERY_DEFAULTS.hero_subtitle, section_title: body.section_title ?? GALLERY_DEFAULTS.section_title, section_subtitle: body.section_subtitle ?? GALLERY_DEFAULTS.section_subtitle, items: Array.isArray(body.items) ? body.items : GALLERY_DEFAULTS.items, updated_by: 'admin' },
      };
      const result = await prisma.galleryConfig.upsert(payload);
      return NextResponse.json(result ?? { success: true });
    }

    return NextResponse.json({ error: 'Invalid section' }, { status: 400 });

  } catch (err) {
    console.error('[site-data POST]', err);
    return NextResponse.json({ error: 'Save failed' }, { status: 500 });
  }
}

/* ─────────────────────────────────────────
   PATCH  — feedback publish / unpublish
───────────────────────────────────────── */
export async function PATCH(req: NextRequest) {
  const section = req.nextUrl.searchParams.get('section');
  const idParam = req.nextUrl.searchParams.get('id');

  if (section !== 'feedback') return NextResponse.json({ error: 'Invalid section' }, { status: 400 });
  if (!idParam || isNaN(Number(idParam))) return NextResponse.json({ error: 'Valid id is required' }, { status: 400 });

  const id = parseInt(idParam, 10);

  try {
    const body        = await req.json();
    const isPublished = Boolean(body.isPublished);

    try {
      await prisma.tbl_Feedback.update({ where: { id }, data: { isPublished } });
      return NextResponse.json({ success: true, id, isPublished, source: 'cloud' });
    } catch (err) {
      return NextResponse.json({ error: 'Update failed.', details: { cloud: getErrorMessage(err) } }, { status: 500 });
    }

  } catch (err) {
    console.error('[site-data PATCH]', err);
    return NextResponse.json({ error: getErrorMessage(err) }, { status: 500 });
  }
}

/* ─────────────────────────────────────────
   DELETE  — feedback delete
───────────────────────────────────────── */
export async function DELETE(req: NextRequest) {
  const section = req.nextUrl.searchParams.get('section');
  const idParam = req.nextUrl.searchParams.get('id');

  if (section !== 'feedback') return NextResponse.json({ error: 'Invalid section' }, { status: 400 });
  if (!idParam || isNaN(Number(idParam))) return NextResponse.json({ error: 'Valid id is required' }, { status: 400 });

  const id = parseInt(idParam, 10);

  try {
    try {
      await prisma.tbl_Feedback.delete({ where: { id } });
      return NextResponse.json({ success: true, id, source: 'cloud' });
    } catch (err) {
      return NextResponse.json({ error: 'Delete failed.', details: { cloud: getErrorMessage(err) } }, { status: 500 });
    }

  } catch (err) {
    console.error('[site-data DELETE]', err);
    return NextResponse.json({ error: getErrorMessage(err) }, { status: 500 });
  }
}