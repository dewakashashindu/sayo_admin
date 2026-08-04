'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Image from 'next/image';

const tokens = {
  color: {
    gold:        '#B8860B',
    goldBorder:  'rgba(184,134,11,0.4)',
    bgDark:      '#0a0a0c',
    bgCard:      '#141418',
    bgInput:     '#0e0e12',
    white:       '#ffffff',
    whiteMuted:  'rgba(255,255,255,0.80)',
    whiteDim:    'rgba(255,255,255,0.60)',
    whiteFaint:  'rgba(255,255,255,0.30)',
    whiteBorder: 'rgba(255,255,255,0.12)',
  },
  font: {
    family: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
} as const;

const ADMIN_USERNAME   = 'admin';
const ADMIN_PASSWORD   = 'sayo@2025';
const AUTH_SESSION_KEY = 'sayo_admin_auth_session';

export type NavItem   = { label: string; href: string };
export type QuickLink = { label: string; href: string };

export type NavData = {
  logo_text:        string;
  contact_btn_text: string;
  contact_btn_link: string;
  nav_items:        NavItem[];
};

export type HomeData = {
  hero_eyebrow:  string;
  hero_heading:  string;
  hero_body:     string;
  hero_cta_text: string;
  hero_cta_link: string;
};

export type FooterData = {
  brand_name:       string;
  brand_tagline:    string;
  contact_phone:    string;
  contact_email:    string;
  contact_address:  string;
  copyright_text:   string;
  locations:        string[];
  quick_links:      QuickLink[];
  social_whatsapp:  string;
  social_facebook:  string;
  social_instagram: string;
};

// ✅ UPDATED: Added photo field
export type StaffMember = {
  name:        string;
  role:        string;
  experience:  string;
  bio:         string;
  specialties: string;
  photo?:      string;  // Cloudinary URL
};

export type AboutReview = { quote: string; author: string };

export type AboutData = {
  hero_eyebrow:          string;
  hero_heading:          string;
  hero_body:             string;
  team_section_title:    string;
  staff:                 StaffMember[];
  gallery_section_title: string;
  gallery_description:   string;
  gallery_images:        string[];   // Cloudinary URLs for gallery (img1..img5)
  review_section_title:  string;
  reviews:               AboutReview[];
};

export type PriceItem = { name: string; price1: string; price2?: string };

export type ServiceCategory = {
  key:   string;
  label: string;
  image: string;
};

export type ServicesData = {
  hero_heading:  string;
  hero_subtitle: string;
  categories:    ServiceCategory[];
  price_list:    Record<string, Record<string, PriceItem[]>>;
};

export type StatItem = { value: string; label: string };

export type BranchLocation = {
  name:    string;
  address: string;
  phone:   string;
  email:   string;
  isHead:  boolean;
  mapHref: string;
};

export type ContactData = {
  hero_eyebrow:       string;
  hero_heading:       string;
  hero_subtitle:      string;
  cta_primary_text:   string;
  cta_secondary_text: string;
  phone_number:       string;
  email_address:      string;
  stats:              StatItem[];
  map_embed_src:      string;
  map_address:        string;
  map_open_href:      string;
  social_instagram:   string;
  social_facebook:    string;
  social_whatsapp:    string;
  branches:           BranchLocation[];
};

type Feedback = {
  id:          number;
  cusName:     string;
  cusEmail:    string;
  cusLocation: string;
  cusService:  string;
  cusRating:   number;
  cusComment:  string;
  cusConsent:  boolean;
  isPublished: boolean;
  submittedAt: string;
};

/* ✅ NEW: Gallery types */
export type GalleryItem = {
  id:     number;
  src:    string;   // Cloudinary URL or /gallery/*.jpg path
  alt:    string;
  label:  string;   // caption shown on hover
  tag:    string;   // e.g. Bridal, Hair, Makeup, Spa, Nails, Studio
  filter: string;   // lowercase slug used for filtering
  aspect: string;   // portrait | landscape | square
};

export type GalleryData = {
  hero_eyebrow:      string;
  hero_title:        string;
  hero_subtitle:     string;
  section_title:     string;
  section_subtitle:  string;
  items:             GalleryItem[];
};

type FeedbackApiResponse = {
  data:       Feedback[];
  total:      number;
  page:       number;
  limit:      number;
  totalPages: number;
};

const NAV_DEFAULTS: NavData = {
  logo_text:        'SAYO',
  contact_btn_text: 'CONTACT US',
  contact_btn_link: '/contact',
  nav_items: [
    { label: 'HOME',      href: '/'         },
    { label: 'OUR STORY', href: '/about'    },
    { label: 'SERVICES',  href: '/services' },
    { label: 'PRODUCTS',  href: '/products' },
    { label: 'REVIEWS',   href: '/reviews'  },
  ],
};

const HOME_DEFAULTS: HomeData = {
  hero_eyebrow:  'Experienced hair stylists',
  hero_heading:  'Enjoy Professional Beauty Services!',
  hero_body:     'Providing expert skin care advice & beauty services using natural products to cater for any skin.',
  hero_cta_text: 'Reserve Experience',
  hero_cta_link: '/contact',
};

const FOOTER_DEFAULTS: FooterData = {
  brand_name:      'SAYO',
  brand_tagline:   'We are experienced in making you more beautiful',
  contact_phone:   '+94 77 233 6233',
  contact_email:   'hello@sayobeauty.com',
  contact_address: '123 Galle Road, Colombo, Sri Lanka',
  copyright_text:  '© 2025 SAYO Beauty. All rights reserved.',
  locations:       ['Colombo', 'Negombo', 'Kiribathgoda'],
  quick_links: [
    { label: 'Home',      href: '/'         },
    { label: 'Our Story', href: '/about'    },
    { label: 'Services',  href: '/services' },
    { label: 'Products',  href: '/products' },
    { label: 'Reviews',   href: '/reviews'  },
  ],
  social_whatsapp:  '',
  social_facebook:  '',
  social_instagram: '',
};

// ✅ UPDATED: Added photo: '' to defaults
const ABOUT_DEFAULTS: AboutData = {
  hero_eyebrow:       'OUR STORY',
  hero_heading:       'We are experience in making you more beautiful',
  hero_body:          'We will make your skin better and also more glowing skin.',
  team_section_title: 'Meet the Visionaries',
  staff: [
    { 
      name: 'Hiruni Perera', 
      role: 'Lead Stylist & Founder', 
      experience: '12+ Years', 
      bio: 'Train-certified in London and Singapore.', 
      specialties: 'Precision Haircuts, Balayage & Highlights',
      photo: '' 
    },
    { 
      name: 'Aruna Ratnayake', 
      role: 'Grooming Specialist', 
      experience: '10+ Years', 
      bio: 'Bringing a sharp eye for detail.', 
      specialties: 'Precision Beard Sculpting',
      photo: '' 
    },
  ],
  gallery_section_title: 'Transformations & Artistry',
  gallery_description:   'Explore our latest work, behind-the-scenes moments, and client transformations.',
  gallery_images:        ['', '', '', '', ''],
  review_section_title:  'What Our Clients Say',
  reviews: [
    { quote: '"Choosing SAYO was the best decision."',                author: 'Nimesha D.' },
    { quote: '"SAYO stands apart."',                                  author: 'Sanduni R.' },
    { quote: '"Exceptional attention to detail."',                    author: 'Kasun P.'   },
    { quote: '"From the moment you walk in, you feel looked after."', author: 'Dilani W.'  },
  ],
};

const SERVICES_CATEGORIES_DEFAULT: ServiceCategory[] = [
  { key: 'WAX',    label: 'WAX',    image: '/cat-wax.jpg'    },
  { key: 'HAIR',   label: 'HAIR',   image: '/cat-hair.jpg'   },
  { key: 'SKIN',   label: 'SKIN',   image: '/cat-skin.jpg'   },
  { key: 'NAIL',   label: 'NAIL',   image: '/cat-nail.jpg'   },
  { key: 'BODY',   label: 'BODY',   image: '/cat-body.jpg'   },
  { key: 'BRIDAL', label: 'BRIDAL', image: '/cat-bridal.jpg' },
];

const SERVICES_DEFAULTS: ServicesData = {
  hero_heading:  'Tailored Treatments for Your Unique Glow',
  hero_subtitle: 'Experience a symphony of precision and luxury.',
  categories:    SERVICES_CATEGORIES_DEFAULT,
  price_list: {
    her: {
      WAX:    [{ name: 'Full Arms Wax', price1: '2,500.00' }, { name: 'Full Legs Wax', price1: '3,500.00' }],
      HAIR:   [{ name: 'Cut & Re-Style', price1: '4,200.00' }, { name: 'Trim', price1: '1,500.00' }],
      SKIN:   [{ name: 'Classic Facial', price1: '3,000.00' }, { name: 'Gold Facial', price1: '6,500.00' }],
      NAIL:   [{ name: 'Classic Manicure', price1: '1,800.00' }, { name: 'Gel Manicure', price1: '3,200.00' }],
      BODY:   [{ name: 'Full Body Massage', price1: '5,500.00' }, { name: 'Body Scrub', price1: '4,200.00' }],
      BRIDAL: [{ name: 'Bridal Package - Full', price1: '45,000.00' }, { name: 'Bridal Hair & Makeup', price1: '18,000.00' }],
    },
    his: {
      WAX:    [{ name: 'Half Arms Wax', price1: '2,000.00' }, { name: 'Chest Wax', price1: '3,200.00' }],
      HAIR:   [{ name: 'Haircut - Classic', price1: '1,800.00' }, { name: 'Beard Trim', price1: '900.00' }],
      SKIN:   [{ name: 'Deep Cleansing Facial', price1: '3,500.00' }, { name: 'Skin Polishing', price1: '4,000.00' }],
      NAIL:   [{ name: 'Basic Manicure', price1: '1,200.00' }, { name: 'Basic Pedicure', price1: '1,500.00' }],
      BODY:   [{ name: 'Deep Tissue Massage', price1: '6,000.00' }, { name: 'Body Scrub', price1: '4,000.00' }],
      BRIDAL: [{ name: 'Groom Package', price1: '25,000.00' }, { name: 'Groom Hair & Makeup', price1: '10,000.00' }],
    },
  },
};

const CONTACT_DEFAULTS: ContactData = {
  hero_eyebrow:       'Luxury Concierge Experience',
  hero_heading:       'GET IN TOUCH',
  hero_subtitle:      'Experience personalized luxury tailored specifically for your needs.',
  cta_primary_text:   'Send an Inquiry',
  cta_secondary_text: 'Call Us Now',
  phone_number:       '0772336233',
  email_address:      'info@sayobeauty.com',
  stats: [
    { value: '3',   label: 'Locations'          },
    { value: '10+', label: 'Years of Excellence' },
    { value: '5K+', label: 'Happy Clients'       },
  ],
  map_embed_src:    'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3961.0558055526335!2d79.85803897585825!3d6.883918893115073',
  map_address:      'No. 45, Galle Road, Colombo 03, Sri Lanka',
  map_open_href:    'https://maps.google.com/?q=45+Galle+Rd+Colombo+00500+Sri+Lanka',
  social_instagram: '',
  social_facebook:  '',
  social_whatsapp:  '',
  branches: [
    { name: 'Colombo — Head Office', address: 'No. 45, Galle Road, Colombo 03, Sri Lanka',  phone: '0772336233', email: 'info@sayobeauty.com',         isHead: true,  mapHref: 'https://maps.google.com/?q=45+Galle+Rd+Colombo+00500+Sri+Lanka' },
    { name: 'Negombo Branch',        address: 'No. 12, Poruthota Road, Negombo, Sri Lanka',  phone: '0772336233', email: 'negombo@sayobeauty.com',      isHead: false, mapHref: 'https://maps.google.com/?q=Poruthota+Road+Negombo+Sri+Lanka'     },
    { name: 'Kiribathgoda Branch',   address: 'No. 78, Kandy Road, Kiribathgoda, Sri Lanka', phone: '0772336233', email: 'kiribathgoda@sayobeauty.com', isHead: false, mapHref: 'https://maps.google.com/?q=Kandy+Road+Kiribathgoda+Sri+Lanka'     },
  ],
};

const GENDERS = ['her', 'his'] as const;

/* ✅ NEW: Gallery defaults — matches the public /gallery page */
const GALLERY_DEFAULTS: GalleryData = {
  hero_eyebrow:     '✦ SAYO Beauty Studio ✦',
  hero_title:       'The Beauty Canvas',
  hero_subtitle:    'A curated showcase of artistry, elegance, and unforgettable transformations crafted by our expert stylists.',
  section_title:    'Our Portfolio',
  section_subtitle: 'Browse through our collection of stunning transformations and beauty artistry',
  items: [
    { id: 1,  src: '/gallery/bridal-1.jpg', alt: 'Bridal Makeup',        label: 'Bridal Makeup',        tag: 'Bridal', filter: 'bridal', aspect: 'portrait'  },
    { id: 2,  src: '/gallery/hair-1.jpg',   alt: 'Hair Coloring',         label: 'Balayage & Highlights', tag: 'Hair',   filter: 'hair',   aspect: 'landscape' },
    { id: 3,  src: '/gallery/makeup-1.jpg', alt: 'Glam Makeup',           label: 'Evening Glam',          tag: 'Makeup', filter: 'makeup', aspect: 'portrait'  },
    { id: 4,  src: '/gallery/hair-2.jpg',   alt: 'Hair Styling',          label: 'Precision Cuts',        tag: 'Hair',   filter: 'hair',   aspect: 'square'    },
    { id: 5,  src: '/gallery/bridal-2.jpg', alt: 'Kandyan Bridal',        label: 'Kandyan Bridal Look',   tag: 'Bridal', filter: 'bridal', aspect: 'landscape' },
    { id: 6,  src: '/gallery/spa-1.jpg',    alt: 'Spa Treatment',         label: 'Rejuvenating Spa',      tag: 'Spa',    filter: 'spa',    aspect: 'portrait'  },
    { id: 7,  src: '/gallery/nail-1.jpg',   alt: 'Nail Art',              label: 'Nail Artistry',         tag: 'Nails',  filter: 'nails',  aspect: 'square'    },
    { id: 8,  src: '/gallery/makeup-2.jpg', alt: 'Bridal Makeup Detail',  label: 'Bridal Eyes',           tag: 'Bridal', filter: 'bridal', aspect: 'landscape' },
    { id: 9,  src: '/gallery/hair-3.jpg',   alt: 'Hair Treatment',        label: 'Keratin Treatment',     tag: 'Hair',   filter: 'hair',   aspect: 'portrait'  },
    { id: 10, src: '/gallery/salon-1.jpg',  alt: 'Salon Interior',        label: 'Our Studio',            tag: 'Studio', filter: 'studio', aspect: 'landscape' },
    { id: 11, src: '/gallery/bridal-3.jpg', alt: 'Modern Bridal',         label: 'Modern Bridal Glow',    tag: 'Bridal', filter: 'bridal', aspect: 'square'    },
    { id: 12, src: '/gallery/spa-2.jpg',    alt: 'Facial Treatment',      label: 'Luxury Facial',         tag: 'Spa',    filter: 'spa',    aspect: 'portrait'  },
  ],
};

type GenderKey = typeof GENDERS[number];

const FB_LOCATIONS = ['All', 'Colombo', 'Negombo', 'Kiribathgoda'];
const FB_SERVICES  = [
  'All',
  'Bridal Package',
  'Groom Package',
  'Hair & Grooming',
  'Gold Facial',
  'Skin Brightening',
  'Deep Tissue Massage',
  'Aromatherapy Massage',
  'Gel Manicure & Pedicure',
  'Full Body Wax',
  'Other',
];

const FEEDBACK_CSS = `
  @keyframes fbSlideUp { from{opacity:0;transform:translateY(14px)} to{opacity:1;transform:translateY(0)} }
  @keyframes fbSpin    { to{transform:rotate(360deg)} }
  @keyframes fbUnattendedPulse {
    0%, 100% { box-shadow: 0 0 0 3px rgba(249,115,22,0.3); }
    50%       { box-shadow: 0 0 0 7px rgba(249,115,22,0);   }
  }

  .fb-toggle-track {
    width:44px; height:24px; border-radius:12px;
    border:none; cursor:pointer; position:relative;
    transition:background .25s; flex-shrink:0;
  }
  .fb-toggle-track:disabled { opacity:.6; cursor:not-allowed; }
  .fb-toggle-thumb {
    position:absolute; top:3px; width:18px; height:18px;
    border-radius:50%; background:#fff;
    transition:left .25s cubic-bezier(.34,1.56,.64,1);
  }
  .fb-toggle-on  .fb-toggle-thumb { left:23px; }
  .fb-toggle-off .fb-toggle-thumb { left:3px;  }

  .fb-review-card {
    animation: fbSlideUp .35s ease both;
    transition: border-color .2s, box-shadow .2s;
  }
  .fb-review-card:hover {
    border-color: rgba(184,134,11,.35) !important;
    box-shadow: 0 4px 22px rgba(0,0,0,.35);
  }

  .fb-filter-pill {
    background: rgba(255,255,255,.05);
    border: 1.5px solid rgba(255,255,255,.12);
    border-radius: .5rem;
    color: rgba(255,255,255,.65);
    font-size: .8rem; font-weight: 500;
    padding: .45rem .85rem;
    cursor: pointer;
    transition: border-color .2s, background .2s, color .2s;
    white-space: nowrap;
    font-family: inherit;
  }
  .fb-filter-pill.active {
    background: rgba(184,134,11,.15);
    border-color: rgba(184,134,11,.5);
    color: #B8860B;
  }
  .fb-filter-pill:hover:not(.active) {
    border-color: rgba(255,255,255,.25);
    color: #fff;
  }

  .fb-select {
    background: rgba(255,255,255,.05);
    border: 1.5px solid rgba(255,255,255,.12);
    border-radius: .5rem;
    color: rgba(255,255,255,.7);
    font-family: inherit;
    font-size: .8rem;
    padding: .45rem 2rem .45rem .85rem;
    cursor: pointer; outline: none;
    appearance: none; -webkit-appearance: none;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23B8860B' stroke-width='2.5'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right .55rem center;
    transition: border-color .2s;
  }
  .fb-select:focus { border-color: rgba(184,134,11,.5); }
  .fb-select option { background:#1a1a1a; color:#fff; }

  .fb-pg-btn {
    background: rgba(255,255,255,.05);
    border: 1.5px solid rgba(255,255,255,.12);
    border-radius: .5rem;
    color: rgba(255,255,255,.65);
    font-family: inherit;
    font-size: .8rem; font-weight: 500;
    padding: .4rem .8rem;
    cursor: pointer;
    transition: background .2s, border-color .2s;
  }
  .fb-pg-btn:hover:not(:disabled) {
    border-color: rgba(184,134,11,.4);
    color: #B8860B;
  }
  .fb-pg-btn:disabled { opacity:.3; cursor:not-allowed; }
  .fb-pg-btn.current {
    background: rgba(184,134,11,.18);
    border-color: rgba(184,134,11,.55);
    color: #B8860B;
  }
`;

/* ─── Icons ─── */
const IconCompass       = () => (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/></svg>);
const IconHome          = () => (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>);
const IconBook          = () => (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>);
const IconScissors      = () => (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/></svg>);
const IconPhone         = () => (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.362 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.338 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>);
const IconMapPin        = () => (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>);
const IconSave          = () => (<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>);
const IconCheck         = () => (<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>);
const IconEye           = () => (<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>);
const IconEyeOff        = () => (<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>);
const IconLogOut        = () => (<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>);
const IconLock          = () => (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>);
const IconUser          = () => (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>);
const IconDatabase      = () => (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>);
const IconPlus          = () => (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>);
const IconTrash         = () => (<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>);
const IconChevronUp     = () => (<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="18 15 12 9 6 15"/></svg>);
const IconChevronDown   = () => (<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>);
const IconClose         = () => (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>);
const IconAlertTriangle = () => (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>);
const IconInfo          = () => (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>);
const IconInstagram     = () => (<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/></svg>);
const IconFacebook      = () => (<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/></svg>);
const IconWhatsApp      = () => (<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>);
const IconStar          = () => (<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>);
const IconGlobe         = () => (<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>);
const IconLink          = () => (<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>);
const IconTag           = () => (<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>);
const IconBarChart      = () => (<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>);
const IconMail          = () => (<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>);
const IconMap           = () => (<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/></svg>);
const IconBuilding      = () => (<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="2" width="16" height="20" rx="2" ry="2"/><path d="M9 22v-4h6v4"/><path d="M8 6h.01M16 6h.01M8 10h.01M16 10h.01M8 14h.01M16 14h.01"/></svg>);
const IconSpinner       = () => (<span style={{ display:'inline-block', width:'14px', height:'14px', border:'2px solid rgba(255,255,255,0.3)', borderTopColor:'#fff', borderRadius:'50%', animation:'spin 0.8s linear infinite', flexShrink:0 }} />);
const IconMessageSquare = () => (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>);
const IconImage         = () => (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>);
const IconRefresh       = () => (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>);

/* ─────────────────────────────────────────
   COMMON STYLES
───────────────────────────────────────── */
const inputStyle: React.CSSProperties = {
  width:'100%', background:tokens.color.bgInput,
  border:`1px solid ${tokens.color.whiteBorder}`, color:tokens.color.white,
  padding:'0.75rem 1rem', borderRadius:'0.5rem', fontSize:'0.9rem',
  outline:'none', transition:'border-color 0.2s', boxSizing:'border-box',
};
const smallIconBtn: React.CSSProperties = {
  background:'rgba(255,255,255,0.08)', color:'#fff',
  border:`1px solid ${tokens.color.whiteBorder}`, borderRadius:'0.4rem',
  padding:'0.3rem 0.5rem', fontSize:'0.75rem', cursor:'pointer',
  display:'inline-flex', alignItems:'center', justifyContent:'center',
};
const sectionCard: React.CSSProperties = {
  background:tokens.color.bgCard, border:`1px solid ${tokens.color.whiteBorder}`,
  borderRadius:'1.25rem', padding:'2rem',
};
const sectionTitle: React.CSSProperties = {
  fontSize:'1.25rem', fontWeight:600, color:tokens.color.gold,
  marginBottom:'0.4rem', marginTop:0,
};
const sectionDesc: React.CSSProperties = {
  color:tokens.color.whiteDim, fontSize:'0.85rem',
  marginBottom:'1.5rem', marginTop:0,
};
const fieldLabel: React.CSSProperties = {
  display:'block', fontSize:'0.8rem', fontWeight:600,
  color:tokens.color.whiteMuted, marginBottom:'0.4rem',
};

/* ─────────────────────────────────────────
   ADMIN LOGO
───────────────────────────────────────── */
function AdminLogoIcon({ size = 42 }: { size?: number }) {
  return (
    <div style={{ width:`${size}px`, height:`${size}px`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
      <Image src="/sayologo.png" alt="SAYO Logo" width={size} height={size} style={{ width:'100%', height:'100%', objectFit:'contain' }} priority />
    </div>
  );
}

/* ─────────────────────────────────────────
   LOGIN SCREEN
───────────────────────────────────────── */
function AdminLoginScreen({ onLoginSuccess }: { onLoginSuccess: (u: string) => void }) {
  const [username,     setUsername]     = useState('');
  const [password,     setPassword]     = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error,        setError]        = useState('');
  const [shake,        setShake]        = useState(false);
  const [loading,      setLoading]      = useState(false);

  const triggerShake = () => { setShake(true); setTimeout(() => setShake(false), 500); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setError('');
    if (!username.trim() || !password.trim()) { setError('Please enter both username and password.'); triggerShake(); return; }
    setLoading(true);
    await new Promise(r => setTimeout(r, 700));
    if (username.trim() === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
      try { sessionStorage.setItem(AUTH_SESSION_KEY, 'true'); sessionStorage.setItem('admin_username', username.trim()); } catch {}
      setLoading(false); onLoginSuccess(username.trim());
    } else { setLoading(false); setError('Invalid username or password.'); triggerShake(); }
  };

  return (
    <div style={{ minHeight:'100vh', backgroundColor:tokens.color.bgDark, backgroundImage:'radial-gradient(circle at 20% 20%, rgba(184,134,11,0.08) 0%, transparent 50%), radial-gradient(circle at 80% 80%, rgba(184,134,11,0.06) 0%, transparent 50%)', color:tokens.color.white, fontFamily:tokens.font.family, display:'flex', alignItems:'center', justifyContent:'center', padding:'1.5rem' }}>
      <style>{`@keyframes shakeAnim{0%,100%{transform:translateX(0)}20%{transform:translateX(-10px)}40%{transform:translateX(10px)}60%{transform:translateX(-6px)}80%{transform:translateX(6px)}} @keyframes fadeUpLogin{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}} @keyframes spin{to{transform:rotate(360deg)}} .login-shake{animation:shakeAnim .5s ease} .login-card{animation:fadeUpLogin .6s cubic-bezier(0.16,1,0.3,1) both} .login-input:focus{border-color:#B8860B!important;box-shadow:0 0 0 3px rgba(184,134,11,0.15)!important;outline:none!important}`}</style>
      <div className={`login-card${shake?' login-shake':''}`} style={{ width:'100%', maxWidth:'420px', background:tokens.color.bgCard, border:`1px solid ${tokens.color.goldBorder}`, borderRadius:'1.5rem', padding:'clamp(2rem,5vw,2.75rem)', boxShadow:'0 25px 70px rgba(0,0,0,0.6)' }}>
        <div style={{ textAlign:'center', marginBottom:'2rem' }}>
          <div style={{ display:'flex', justifyContent:'center', marginBottom:'1.25rem' }}><AdminLogoIcon size={80} /></div>
          <h1 style={{ fontSize:'1.4rem', fontWeight:700, margin:'0 0 0.35rem', letterSpacing:'0.05em' }}>SAYO BEAUTY</h1>
          <p style={{ fontSize:'0.85rem', color:tokens.color.gold, margin:0, fontWeight:600, letterSpacing:'0.12em', textTransform:'uppercase' }}>Admin Portal Access</p>
        </div>
        <form onSubmit={handleSubmit} style={{ display:'flex', flexDirection:'column', gap:'1.1rem' }}>
          <div>
            <label style={fieldLabel}><span style={{ display:'flex', alignItems:'center', gap:'0.4rem' }}><IconUser /> Username</span></label>
            <input type="text" className="login-input" value={username} onChange={e => setUsername(e.target.value)} placeholder="Enter admin username" style={inputStyle} autoComplete="username" autoFocus disabled={loading} />
          </div>
          <div>
            <label style={fieldLabel}><span style={{ display:'flex', alignItems:'center', gap:'0.4rem' }}><IconLock /> Password</span></label>
            <div style={{ position:'relative' }}>
              <input type={showPassword?'text':'password'} className="login-input" value={password} onChange={e => setPassword(e.target.value)} placeholder="Enter admin password" style={{ ...inputStyle, paddingRight:'3rem' }} autoComplete="current-password" disabled={loading} />
              <button type="button" onClick={() => setShowPassword(!showPassword)} style={{ position:'absolute', right:'0.75rem', top:'50%', transform:'translateY(-50%)', background:'none', border:'none', color:tokens.color.whiteFaint, cursor:'pointer', display:'flex', alignItems:'center', padding:'0.25rem' }}>
                {showPassword ? <IconEyeOff /> : <IconEye />}
              </button>
            </div>
          </div>
          {error && (
            <div style={{ background:'rgba(229,62,62,0.12)', border:'1px solid rgba(229,62,62,0.4)', color:'#fc8181', padding:'0.7rem 1rem', borderRadius:'0.5rem', fontSize:'0.82rem', fontWeight:500, display:'flex', alignItems:'center', gap:'0.5rem' }}>
              <IconAlertTriangle /> {error}
            </div>
          )}
          <button type="submit" disabled={loading} style={{ background:loading?'rgba(184,134,11,0.5)':'linear-gradient(135deg,#B8860B 0%,#d4a017 100%)', border:'none', color:'#fff', padding:'0.85rem 1.5rem', borderRadius:'0.6rem', fontWeight:700, fontSize:'0.95rem', cursor:loading?'not-allowed':'pointer', marginTop:'0.4rem', boxShadow:loading?'none':'0 8px 24px rgba(184,134,11,0.4)', display:'flex', alignItems:'center', justifyContent:'center', gap:'0.5rem' }}>
            {loading ? (<><IconSpinner /> Verifying...</>) : (<><IconLock /> Sign In to Admin Portal</>)}
          </button>
        </form>
        <p style={{ textAlign:'center', color:tokens.color.whiteFaint, fontSize:'0.72rem', marginTop:'1.75rem', marginBottom:0 }}>Unauthorized access is strictly prohibited &amp; monitored.</p>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────
   LIVE PREVIEW PANEL
───────────────────────────────────────── */
function LivePreviewPanel({ open, onClose, navData, homeData, footerData, activeTab }: {
  open:boolean; onClose:()=>void; navData:NavData; homeData:HomeData; footerData:FooterData; activeTab:string;
}) {
  const gold = tokens.color.gold;
  const PreviewNav = () => (
    <div style={{ background:'rgba(40,40,40,0.95)', padding:'0.6rem 1rem', display:'flex', alignItems:'center', justifyContent:'space-between', borderBottom:'1px solid rgba(255,255,255,0.1)' }}>
      <span style={{ color:gold, fontWeight:700, fontSize:'0.8rem', letterSpacing:'0.12em' }}>{navData.logo_text}</span>
      <div style={{ display:'flex', gap:'0.6rem' }}>{navData.nav_items.slice(0,4).map(n => (<span key={n.label} style={{ color:'rgba(255,255,255,0.7)', fontSize:'0.55rem', fontWeight:500 }}>{n.label}</span>))}</div>
      <span style={{ background:gold, color:'#fff', fontSize:'0.55rem', fontWeight:700, padding:'0.2rem 0.5rem', borderRadius:'0.3rem' }}>{navData.contact_btn_text}</span>
    </div>
  );
  const PreviewFooter = () => (
    <div style={{ background:'#1a1a1a', padding:'1rem', borderTop:'1px solid rgba(255,255,255,0.08)', marginTop:'1rem' }}>
      <div style={{ display:'flex', gap:'1.5rem', flexWrap:'wrap' }}>
        <div style={{ flex:'1 1 100px' }}><div style={{ color:gold, fontWeight:700, fontSize:'0.7rem', letterSpacing:'0.1em', marginBottom:'0.4rem' }}>{footerData.brand_name}</div><div style={{ color:'rgba(255,255,255,0.5)', fontSize:'0.55rem', lineHeight:1.5 }}>{footerData.brand_tagline}</div></div>
        <div style={{ flex:'1 1 80px' }}><div style={{ color:gold, fontSize:'0.55rem', fontWeight:700, marginBottom:'0.3rem', textTransform:'uppercase', letterSpacing:'0.08em' }}>Quick Links</div>{footerData.quick_links.slice(0,4).map(l => (<div key={l.label} style={{ color:'rgba(255,255,255,0.5)', fontSize:'0.55rem', marginBottom:'0.15rem' }}>{l.label}</div>))}</div>
        <div style={{ flex:'1 1 80px' }}><div style={{ color:gold, fontSize:'0.55rem', fontWeight:700, marginBottom:'0.3rem', textTransform:'uppercase', letterSpacing:'0.08em' }}>Contact</div><div style={{ color:'rgba(255,255,255,0.5)', fontSize:'0.55rem', marginBottom:'0.15rem' }}>{footerData.contact_phone}</div><div style={{ color:'rgba(255,255,255,0.5)', fontSize:'0.55rem' }}>{footerData.contact_email}</div></div>
      </div>
      <div style={{ borderTop:'1px solid rgba(255,255,255,0.06)', marginTop:'0.75rem', paddingTop:'0.5rem', color:'rgba(255,255,255,0.25)', fontSize:'0.5rem', textAlign:'center' }}>{footerData.copyright_text}</div>
    </div>
  );
  const TAB_LABELS: Record<string, string> = { nav:'Navigation', home:'Home Hero', about:'Our Story', services:'Services', contact:'Contact Page', footer:'Footer', feedback:'Feedback', gallery:'Gallery' };
  const renderContent = () => {
    if (activeTab === 'home') return (
      <div><PreviewNav />
        <div style={{ background:'linear-gradient(135deg,#1a1a1a 0%,#282828 100%)', padding:'2rem 1rem', minHeight:'180px', display:'flex', flexDirection:'column', justifyContent:'center', position:'relative', overflow:'hidden' }}>
          <div style={{ position:'absolute', inset:0, background:'linear-gradient(to right,rgba(0,0,0,0.8),rgba(40,40,40,0.3))', zIndex:1 }} />
          <div style={{ position:'relative', zIndex:2 }}>
            <div style={{ color:gold, fontSize:'0.6rem', fontWeight:600, letterSpacing:'0.12em', textTransform:'uppercase', marginBottom:'0.5rem' }}>{homeData.hero_eyebrow}</div>
            <h2 style={{ color:'#fff', fontSize:'1.1rem', fontWeight:600, lineHeight:1.2, margin:'0 0 0.6rem', maxWidth:'80%' }}>{homeData.hero_heading}</h2>
            <p style={{ color:'rgba(255,255,255,0.7)', fontSize:'0.6rem', lineHeight:1.6, margin:'0 0 0.8rem', maxWidth:'75%' }}>{homeData.hero_body}</p>
            <span style={{ background:gold, color:'#fff', fontSize:'0.6rem', fontWeight:700, padding:'0.35rem 0.8rem', borderRadius:'1rem', display:'inline-block' }}>{homeData.hero_cta_text} →</span>
          </div>
        </div>
        <PreviewFooter /></div>
    );
    return (<div><PreviewNav /><div style={{ padding:'1.5rem', background:'#0d0d12', color:'rgba(255,255,255,0.4)', fontSize:'0.65rem', textAlign:'center' }}>{TAB_LABELS[activeTab]} — content updates on save.</div><PreviewFooter /></div>);
  };
  return (
    <>
      {open && <div onClick={onClose} style={{ position:'fixed', inset:0, zIndex:200, background:'rgba(0,0,0,0.4)', backdropFilter:'blur(2px)' }} />}
      <div style={{ position:'fixed', top:0, right:0, zIndex:201, width:'380px', maxWidth:'95vw', height:'100vh', background:'#0e0e14', borderLeft:`1px solid ${tokens.color.goldBorder}`, boxShadow:'-20px 0 60px rgba(0,0,0,0.7)', transform:open?'translateX(0)':'translateX(100%)', transition:'transform 0.35s cubic-bezier(0.16,1,0.3,1)', display:'flex', flexDirection:'column', overflow:'hidden' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'1rem 1.25rem', background:'rgba(184,134,11,0.12)', borderBottom:`1px solid ${tokens.color.goldBorder}`, flexShrink:0 }}>
          <div><div style={{ fontSize:'0.85rem', fontWeight:700, color:tokens.color.gold, display:'flex', alignItems:'center', gap:'0.4rem' }}><IconEye /> Live Preview</div><div style={{ fontSize:'0.7rem', color:tokens.color.whiteDim, marginTop:'0.1rem' }}>{TAB_LABELS[activeTab]} · Updates as you edit</div></div>
          <button onClick={onClose} style={{ background:'rgba(255,255,255,0.08)', border:`1px solid ${tokens.color.whiteBorder}`, color:'#fff', width:'30px', height:'30px', borderRadius:'0.4rem', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}><IconClose /></button>
        </div>
        <div style={{ flex:1, overflowY:'auto', color:'#fff', fontFamily:tokens.font.family }}>{renderContent()}</div>
        <div style={{ padding:'0.6rem 1rem', borderTop:'rgba(255,255,255,0.06) 1px solid', background:'#0a0a0c', flexShrink:0 }}>
          <p style={{ margin:0, fontSize:'0.65rem', color:tokens.color.whiteFaint, textAlign:'center', display:'flex', alignItems:'center', justifyContent:'center', gap:'0.3rem' }}><IconInfo /> Scaled preview — actual site may differ slightly</p>
        </div>
      </div>
    </>
  );
}

/* ═══════════════════════════════════════════
   FEEDBACK — STAR DISPLAY
═══════════════════════════════════════════ */
function FbStars({ rating }: { rating: number }) {
  const GOLD = '#B8860B';
  return (
    <div style={{ display:'flex', gap:'2px' }}>
      {[1,2,3,4,5].map(n => (
        <svg key={n} width="13" height="13" viewBox="0 0 24 24"
          fill={n <= rating ? GOLD : 'none'}
          stroke={n <= rating ? GOLD : 'rgba(255,255,255,0.2)'}
          strokeWidth={n <= rating ? 0 : 1.5}>
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
        </svg>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════
   FEEDBACK — AVATAR
═══════════════════════════════════════════ */
function FbAvatar({ name }: { name: string }) {
  const initials = name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  return (
    <div style={{ width:38, height:38, borderRadius:'50%', background:'rgba(184,134,11,0.15)', border:'1.5px solid rgba(184,134,11,0.35)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, color:'#B8860B', fontWeight:700, fontSize:'0.78rem', letterSpacing:'0.05em' }}>
      {initials || '?'}
    </div>
  );
}

/* ═══════════════════════════════════════════
   FEEDBACK — PUBLISH TOGGLE
═══════════════════════════════════════════ */
function FbPublishToggle({ id, value, onChange }: {
  id: number;
  value: boolean;
  onChange: (id: number, val: boolean) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');
  const [warning, setWarning] = useState('');

  const handleToggle = async () => {
    setLoading(true);
    setError('');
    setWarning('');
    try {
      const res = await fetch(`/api/site-data?section=feedback&id=${id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ isPublished: !value }),
      });

      const json = await res.json().catch(() => ({}));

      if (res.ok && json.success) {
        onChange(id, !value);
        if (json.warning) {
          setWarning(json.warning);
          setTimeout(() => setWarning(''), 6000);
        }
      } else {
        let detail = `HTTP ${res.status}`;
        if (json?.details) {
          detail = `Cloud: ${json.details.cloud ?? '—'} | Local: ${json.details.local ?? '—'}`;
        } else if (json?.error) {
          detail = json.error;
        }
        console.error(`[FbPublishToggle] Failed id=${id}:`, detail);
        setError(detail.length > 120 ? detail.slice(0, 120) + '…' : detail);
        setTimeout(() => setError(''), 7000);
      }
    } catch (err) {
      console.error(`[FbPublishToggle] Network error id=${id}:`, err);
      setError('Network error — check your connection and try again.');
      setTimeout(() => setError(''), 6000);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-start', gap:'0.25rem', maxWidth:'240px' }}>
      <div style={{ display:'flex', alignItems:'center', gap:'0.45rem' }}>
        <button
          className={`fb-toggle-track ${value ? 'fb-toggle-on' : 'fb-toggle-off'}`}
          style={{ background: value ? '#B8860B' : 'rgba(255,255,255,0.12)' }}
          onClick={handleToggle}
          disabled={loading}
          title={value ? 'Published on website — click to hide' : 'Hidden — click to publish on website'}
        >
          <div className="fb-toggle-thumb" />
        </button>
        <span style={{ fontSize:'0.72rem', fontWeight:600, color: value ? '#B8860B' : 'rgba(255,255,255,0.45)', letterSpacing:'0.04em' }}>
          {loading ? '…' : value ? 'Published' : 'Hidden'}
        </span>
      </div>
      {error && (
        <span style={{ fontSize:'0.65rem', color:'#e05555', fontWeight:500, lineHeight:1.45, wordBreak:'break-word' }}>
          ✕ {error}
        </span>
      )}
      {warning && (
        <span style={{ fontSize:'0.65rem', color:'#d4a017', fontWeight:500, lineHeight:1.45, wordBreak:'break-word' }}>
          ⚠ {warning}
        </span>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════
   FEEDBACK — STATS BAR
═══════════════════════════════════════════ */
function FbStatsBar({ data }: { data: Feedback[] }) {
  const total     = data.length;
  const published = data.filter(d => d.isPublished).length;
  const avgRating = total ? (data.reduce((s, d) => s + d.cusRating, 0) / total).toFixed(1) : '—';
  return (
    <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(110px,1fr))', gap:'0.75rem', marginBottom:'1.5rem' }}>
      {[
        { label:'Total Reviews', value: total              },
        { label:'Published',     value: published          },
        { label:'Hidden',        value: total - published  },
        { label:'Avg. Rating',   value: avgRating          },
      ].map(s => (
        <div key={s.label} style={{ background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.10)', borderRadius:'0.75rem', padding:'0.875rem 1rem', display:'flex', flexDirection:'column', gap:'0.2rem' }}>
          <span style={{ color:'#B8860B', fontSize:'1.3rem', fontWeight:700 }}>{s.value}</span>
          <span style={{ color:'rgba(255,255,255,0.45)', fontSize:'0.7rem', fontWeight:500 }}>{s.label}</span>
        </div>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════
   FEEDBACK — REVIEW CARD
═══════════════════════════════════════════ */
function FbReviewCard({ item, onToggle }: { item: Feedback; onToggle: (id: number, val: boolean) => void }) {
  const GOLD        = '#B8860B';
  const GOLD_BORDER = 'rgba(184,134,11,0.35)';
  const BORDER      = 'rgba(255,255,255,0.10)';
  const date = new Date(item.submittedAt).toLocaleDateString('en-GB', { day:'numeric', month:'long', year:'numeric' });

  return (
    <div className="fb-review-card" style={{ background:'rgba(255,255,255,0.04)', border:`1px solid ${item.isPublished ? GOLD_BORDER : BORDER}`, borderRadius:'1rem', padding:'1.125rem 1.25rem', display:'flex', flexDirection:'column', gap:'0.875rem', position:'relative' }}>
      {item.isPublished && (
        <span style={{ position:'absolute', top:'-1px', right:'1rem', background:GOLD, color:'#fff', fontSize:'0.6rem', fontWeight:700, padding:'0.2rem 0.6rem', borderRadius:'0 0 0.4rem 0.4rem', letterSpacing:'0.05em', textTransform:'uppercase' }}>
          Live on Site
        </span>
      )}
      <div style={{ display:'flex', alignItems:'flex-start', gap:'0.75rem' }}>
        <FbAvatar name={item.cusName} />
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:'0.4rem' }}>
            <span style={{ color:'#fff', fontWeight:600, fontSize:'0.9rem' }}>{item.cusName}</span>
            <FbStars rating={item.cusRating} />
          </div>
          <span style={{ color:'rgba(255,255,255,0.45)', fontSize:'0.75rem' }}>{date}</span>
        </div>
      </div>
      <div style={{ display:'flex', gap:'0.4rem', flexWrap:'wrap' }}>
        {/* Split comma-separated services into individual chips */}
        {item.cusService.split(',').map(svc => svc.trim()).filter(Boolean).map(svc => (
          <span key={svc} style={{ background:'rgba(184,134,11,0.10)', border:`1px solid ${GOLD_BORDER}`, borderRadius:'999px', color:GOLD, fontSize:'0.68rem', fontWeight:600, padding:'0.18rem 0.7rem', letterSpacing:'0.05em', textTransform:'uppercase', whiteSpace:'nowrap' }}>
            {svc}
          </span>
        ))}
        <span style={{ background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.12)', borderRadius:'999px', color:'rgba(255,255,255,0.7)', fontSize:'0.68rem', fontWeight:500, padding:'0.18rem 0.7rem', display:'flex', alignItems:'center', gap:'0.25rem', whiteSpace:'nowrap' }}>
          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
          {item.cusLocation}
        </span>
      </div>
      <div style={{ height:'1px', background:'rgba(255,255,255,0.07)' }} />
      <p style={{ color:'rgba(255,255,255,0.70)', fontSize:'0.85rem', lineHeight:1.7, margin:0, fontStyle:'italic', wordBreak:'break-word', overflowWrap:'anywhere' }}>
        &ldquo;{item.cusComment}&rdquo;
      </p>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:'0.6rem', paddingTop:'0.4rem', borderTop:'1px solid rgba(255,255,255,0.06)' }}>
        <span style={{ color:'rgba(255,255,255,0.45)', fontSize:'0.72rem' }}>{item.cusEmail}</span>
        <FbPublishToggle id={item.id} value={item.isPublished} onChange={onToggle} />
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   FEEDBACK TAB — MAIN
═══════════════════════════════════════════ */
function FeedbackTab() {
  const [allReviews,    setAllReviews]    = useState<Feedback[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [error,         setError]         = useState('');
  const [location,      setLocation]      = useState('All');
  const [serviceFilter, setServiceFilter] = useState('All');
  const [ratingFilter,  setRatingFilter]  = useState(0);
  const [pubFilter,     setPubFilter]     = useState<'all'|'published'|'hidden'|'unattended'>('all');
  const [page,          setPage]          = useState(1);

  const PAGE_SIZE       = 9;
  const GOLD            = '#B8860B';
  const UNATTENDED_DAYS = 7;

  const fetchReviews = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = await fetch(`/api/site-data?section=feedback&page=1&limit=500`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: FeedbackApiResponse = await res.json();
      setAllReviews(json.data);
    } catch (err) {
      console.error('[FeedbackTab] fetch error:', err);
      setError('Could not load reviews. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchReviews(); }, [fetchReviews]);

  /* ── Unattended = unpublished AND submitted within UNATTENDED_DAYS days ── */
  const isUnattended = useCallback((r: Feedback) => {
    if (r.isPublished) return false;
    const ageDays = (Date.now() - new Date(r.submittedAt).getTime()) / (1000 * 60 * 60 * 24);
    return ageDays <= UNATTENDED_DAYS;
  }, []);

  /* ── FIX: service filter handles comma-separated multi-service strings ── */
  const filtered = useMemo(() => {
    return allReviews
      .filter(r => {
        if (location !== 'All' && r.cusLocation !== location) return false;
        if (serviceFilter !== 'All') {
          const segments = r.cusService.split(',').map(s => s.trim());
          if (!segments.includes(serviceFilter)) return false;
        }
        if (ratingFilter > 0 && r.cusRating !== ratingFilter) return false;
        if (pubFilter === 'published'  && !r.isPublished)   return false;
        if (pubFilter === 'hidden'     &&  r.isPublished)   return false;
        if (pubFilter === 'unattended' && !isUnattended(r)) return false;
        return true;
      })
      .sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());
  }, [allReviews, location, serviceFilter, ratingFilter, pubFilter, isUnattended]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItems  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => { if (page > totalPages) setPage(1); }, [totalPages, page]);

  const handleToggle = (id: number, val: boolean) =>
    setAllReviews(prev => prev.map(r => r.id === id ? { ...r, isPublished: val } : r));

  const changeFilter = (fn: () => void) => { fn(); setPage(1); };

  const publishedCount  = allReviews.filter(r => r.isPublished).length;
  const unattendedCount = allReviews.filter(isUnattended).length;

  return (
    <>
      <style>{FEEDBACK_CSS}</style>

      {/* ── Top bar ── */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:'1rem', marginBottom:'1.25rem' }}>
        <p style={{ color:'rgba(255,255,255,0.45)', fontSize:'0.82rem', margin:0 }}>
          {allReviews.length} total · {filtered.length} matching · {publishedCount} live on website
          {unattendedCount > 0 && (
            <span style={{ marginLeft:'0.65rem', background:'rgba(249,115,22,0.18)', border:'1px solid rgba(249,115,22,0.45)', color:'#f97316', fontSize:'0.72rem', fontWeight:700, padding:'0.1rem 0.55rem', borderRadius:'999px' }}>
              {unattendedCount} unattended
            </span>
          )}
        </p>
        <button
          onClick={fetchReviews}
          style={{ background:'rgba(184,134,11,0.15)', border:'1.5px solid rgba(184,134,11,0.35)', borderRadius:'0.6rem', color:GOLD, fontFamily:'inherit', fontSize:'0.82rem', fontWeight:600, padding:'0.5rem 1rem', cursor:'pointer', display:'flex', alignItems:'center', gap:'0.4rem' }}
        >
          <IconRefresh /> Refresh
        </button>
      </div>

      {/* ── Stats bar ── */}
      {!loading && !error && <FbStatsBar data={allReviews} />}

      {/* ── Unattended alert banner ── */}
      {!loading && !error && unattendedCount > 0 && (
        <div style={{ marginBottom:'1.25rem', background:'rgba(249,115,22,0.07)', border:'1.5px solid rgba(249,115,22,0.35)', borderRadius:'0.75rem', padding:'0.875rem 1.25rem', display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:'0.75rem' }}>
          <div style={{ display:'flex', alignItems:'center', gap:'0.55rem' }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#f97316" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
              <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
            </svg>
            <span style={{ color:'#f97316', fontWeight:700, fontSize:'0.85rem' }}>
              {unattendedCount} unattended review{unattendedCount > 1 ? 's' : ''} need your attention
            </span>
            <span style={{ color:'rgba(255,255,255,0.4)', fontSize:'0.78rem' }}>
              — submitted in the last {UNATTENDED_DAYS} days, not yet published
            </span>
          </div>
          <button
            onClick={() => changeFilter(() => setPubFilter('unattended'))}
            style={{ background:'rgba(249,115,22,0.18)', border:'1.5px solid rgba(249,115,22,0.5)', color:'#f97316', fontFamily:'inherit', fontSize:'0.8rem', fontWeight:700, padding:'0.4rem 1rem', borderRadius:'0.5rem', cursor:'pointer', whiteSpace:'nowrap' }}
          >
            View unattended →
          </button>
        </div>
      )}

      {/* ── Filters ── */}
      <div style={{ display:'flex', flexWrap:'wrap', gap:'0.65rem', marginBottom:'1.5rem', alignItems:'center' }}>
        <select className="fb-select" value={location} onChange={e => changeFilter(() => setLocation(e.target.value))}>
          {FB_LOCATIONS.map(l => <option key={l} value={l}>{l === 'All' ? 'All Locations' : l}</option>)}
        </select>
        <select className="fb-select" value={serviceFilter} onChange={e => changeFilter(() => setServiceFilter(e.target.value))}>
          {FB_SERVICES.map(s => <option key={s} value={s}>{s === 'All' ? 'All Services' : s}</option>)}
        </select>
        <select className="fb-select" value={ratingFilter} onChange={e => changeFilter(() => setRatingFilter(Number(e.target.value)))}>
          <option value={0}>All Ratings</option>
          {[5,4,3,2,1].map(r => (<option key={r} value={r}>{'★'.repeat(r)} {r} Star{r > 1 ? 's' : ''}</option>))}
        </select>
        {(['all','published','hidden','unattended'] as const).map(f => (
          <button
            key={f}
            className={`fb-filter-pill${pubFilter === f ? ' active' : ''}`}
            onClick={() => changeFilter(() => setPubFilter(f))}
            style={f === 'unattended' && pubFilter !== 'unattended' && unattendedCount > 0
              ? { borderColor:'rgba(249,115,22,0.45)', color:'#f97316', background:'rgba(249,115,22,0.08)' }
              : undefined}
          >
            {f === 'all' ? 'All' : f === 'published' ? '✓ Published' : f === 'hidden' ? '○ Hidden' : `🔔 Unattended${unattendedCount > 0 ? ` (${unattendedCount})` : ''}`}
          </button>
        ))}
      </div>

      {/* ── Results ── */}
      {loading ? (
        <div style={{ display:'flex', alignItems:'center', justifyContent:'center', padding:'4rem', gap:'0.75rem', color:'rgba(255,255,255,0.45)' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={GOLD} strokeWidth="2.5" style={{ animation:'fbSpin 0.8s linear infinite' }}><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
          Loading reviews…
        </div>
      ) : error ? (
        <div style={{ background:'rgba(220,60,60,0.08)', border:'1.5px solid rgba(220,60,60,0.25)', borderRadius:'0.75rem', padding:'1.25rem', color:'#e07070', fontSize:'0.875rem', display:'flex', alignItems:'center', gap:'0.5rem' }}>
          <IconAlertTriangle /> {error}
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign:'center', padding:'3rem', color:'rgba(255,255,255,0.45)', fontSize:'0.9rem', border:'1px dashed rgba(255,255,255,0.1)', borderRadius:'1rem' }}>
          {allReviews.length === 0 ? 'No feedback submissions yet.' : 'No reviews match the current filters.'}
        </div>
      ) : (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(min(100%,410px),1fr))', gap:'1rem' }}>
          {pageItems.map((item, i) => (
            <div key={item.id} style={{ animationDelay:`${i * 0.04}s`, position:'relative' }}>
              {/* Unattended pulse dot */}
              {isUnattended(item) && (
                <span style={{ position:'absolute', top:'-5px', left:'-5px', zIndex:10, width:'13px', height:'13px', borderRadius:'50%', background:'#f97316', border:'2px solid #0a0a0c', animation:'fbUnattendedPulse 2s ease infinite' }} />
              )}
              <FbReviewCard item={item} onToggle={handleToggle} />
            </div>
          ))}
        </div>
      )}

      {/* ── Pagination ── */}
      {!loading && !error && totalPages > 1 && (
        <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:'0.45rem', marginTop:'2rem', flexWrap:'wrap' }}>
          <button className="fb-pg-btn" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>← Prev</button>
          {Array.from({ length: totalPages }, (_, i) => i + 1)
            .filter(p => Math.abs(p - page) <= 2 || p === 1 || p === totalPages)
            .reduce<(number | '…')[]>((acc, p, idx, arr) => {
              if (idx > 0 && typeof arr[idx - 1] === 'number' && (p as number) - (arr[idx - 1] as number) > 1) acc.push('…');
              acc.push(p); return acc;
            }, [])
            .map((p, i) => p === '…'
              ? <span key={`e-${i}`} style={{ color:'rgba(255,255,255,0.45)', padding:'0 0.2rem' }}>…</span>
              : <button key={p} className={`fb-pg-btn${p === page ? ' current' : ''}`} onClick={() => setPage(p as number)}>{p}</button>
            )}
          <button className="fb-pg-btn" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next →</button>
        </div>
      )}
    </>
  );
}
/* ═══════════════════════════════════════════
   MAIN ADMIN PAGE
═══════════════════════════════════════════ */
export default function SayoAdminPage() {
  const [authChecked,     setAuthChecked]     = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [adminUsername,   setAdminUsername]   = useState('');

  const [navData,      setNavData]      = useState<NavData>(NAV_DEFAULTS);
  const [homeData,     setHomeData]     = useState<HomeData>(HOME_DEFAULTS);
  const [footerData,   setFooterData]   = useState<FooterData>(FOOTER_DEFAULTS);
  const [aboutData,    setAboutData]    = useState<AboutData>(ABOUT_DEFAULTS);
  const [servicesData, setServicesData] = useState<ServicesData>(SERVICES_DEFAULTS);
  const [contactData,  setContactData]  = useState<ContactData>(CONTACT_DEFAULTS);
  const [galleryData,  setGalleryData]  = useState<GalleryData>(GALLERY_DEFAULTS);

  const [activeTab,    setActiveTab]    = useState<'nav'|'home'|'footer'|'about'|'services'|'contact'|'gallery'|'feedback'>('nav');
  const [previewOpen,  setPreviewOpen]  = useState(false);
  const [toastMessage, setToastMessage] = useState<string|null>(null);
  const [toastType,    setToastType]    = useState<'success'|'error'>('success');
  const [isLoading,    setIsLoading]    = useState(false);

  const [saving,  setSaving]  = useState({ nav:false, home:false, footer:false, about:false, services:false, contact:false, gallery:false });
  const [saved,   setSaved]   = useState({ nav:false, home:false, footer:false, about:false, services:false, contact:false, gallery:false });
  const [saveErr, setSaveErr] = useState({ nav:'',    home:'',    footer:'',    about:'',    services:'',    contact:'',    gallery:''    });

  const [svcGender,   setSvcGender]   = useState<GenderKey>('her');
  const [svcCategory, setSvcCategory] = useState<string>('');

  // ✅ NEW: Staff photo upload states
  const [staffUploadLoading, setStaffUploadLoading] = useState<Record<number, boolean>>({});
  const [staffUploadError,   setStaffUploadError]   = useState<Record<number, string>>({});

  // ✅ NEW: Gallery image upload states
  const [galleryUploadLoading, setGalleryUploadLoading] = useState<Record<number, boolean>>({});
  const [galleryUploadError,   setGalleryUploadError]   = useState<Record<number, string>>({});

  // ✅ NEW: Gallery TAB photo upload states (keyed by item index)
  const [galPhotoUploadLoading, setGalPhotoUploadLoading] = useState<Record<number, boolean>>({});
  const [galPhotoUploadError,   setGalPhotoUploadError]   = useState<Record<number, string>>({});

  useEffect(() => {
    if (servicesData.categories.length > 0 && !svcCategory) setSvcCategory(servicesData.categories[0].key);
  }, [servicesData.categories, svcCategory]);

  useEffect(() => {
    try {
      if (sessionStorage.getItem(AUTH_SESSION_KEY) === 'true') {
        setIsAuthenticated(true);
        setAdminUsername(sessionStorage.getItem('admin_username') || 'admin');
      }
    } catch {}
    setAuthChecked(true);
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;
    setIsLoading(true);
    fetch('/api/site-data')
      .then(r => r.json())
      .then(data => {
        if (data?.nav)      setNavData({ ...NAV_DEFAULTS, ...data.nav, nav_items: data.nav.nav_items?.length ? data.nav.nav_items : NAV_DEFAULTS.nav_items });
        if (data?.home)     setHomeData({ ...HOME_DEFAULTS, ...data.home });
        if (data?.footer)   setFooterData({ ...FOOTER_DEFAULTS, ...data.footer, locations: data.footer.locations?.length ? data.footer.locations : FOOTER_DEFAULTS.locations, quick_links: data.footer.quick_links?.length ? data.footer.quick_links : FOOTER_DEFAULTS.quick_links });
        if (data?.about)    setAboutData({ ...ABOUT_DEFAULTS, ...data.about, staff: data.about.staff?.length ? data.about.staff : ABOUT_DEFAULTS.staff, reviews: data.about.reviews?.length ? data.about.reviews : ABOUT_DEFAULTS.reviews, gallery_images: Array.isArray(data.about.gallery_images) && data.about.gallery_images.length === 5 ? data.about.gallery_images : ABOUT_DEFAULTS.gallery_images });
        if (data?.services) {
          const cats = data.services.categories?.length ? data.services.categories : SERVICES_DEFAULTS.categories;
          setServicesData({ ...SERVICES_DEFAULTS, ...data.services, categories: cats, price_list: data.services.price_list ?? SERVICES_DEFAULTS.price_list });
          if (cats.length > 0) setSvcCategory(cats[0].key);
        }
        if (data?.contact)  setContactData({ ...CONTACT_DEFAULTS, ...data.contact, stats: data.contact.stats?.length ? data.contact.stats : CONTACT_DEFAULTS.stats, branches: data.contact.branches?.length ? data.contact.branches : CONTACT_DEFAULTS.branches });
        if (data?.gallery)  setGalleryData({
          ...GALLERY_DEFAULTS,
          ...data.gallery,
          items: Array.isArray(data.gallery.items) && data.gallery.items.length ? data.gallery.items : GALLERY_DEFAULTS.items,
        });
      })
      .catch(() => showToast('Could not load DB data — showing defaults', 'error'))
      .finally(() => setIsLoading(false));
  }, [isAuthenticated]);

  const showToast = (msg: string, type: 'success'|'error' = 'success') => {
    setToastMessage(msg); setToastType(type);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const saveSection = async (section: 'nav'|'home'|'footer'|'about'|'services'|'contact'|'gallery') => {
    setSaving(s => ({ ...s, [section]:true }));
    setSaveErr(s => ({ ...s, [section]:'' }));
    const bodyData = section==='nav' ? navData : section==='home' ? homeData : section==='footer' ? footerData : section==='about' ? aboutData : section==='services' ? servicesData : section==='gallery' ? galleryData : contactData;
    try {
      const res = await fetch(`/api/site-data?section=${section}`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(bodyData) });
      if (!res.ok) throw new Error('Save failed');
      setSaved(s => ({ ...s, [section]:true }));
      showToast(`${section.charAt(0).toUpperCase()+section.slice(1)} saved to database!`, 'success');
      setTimeout(() => setSaved(s => ({ ...s, [section]:false })), 3000);
    } catch {
      setSaveErr(s => ({ ...s, [section]:'Save failed. Check DB connection.' }));
      showToast(`Failed to save ${section}.`, 'error');
    } finally { setSaving(s => ({ ...s, [section]:false })); }
  };

  const saveAll = async () => {
    for (const s of ['nav','home','footer','about','services','contact','gallery'] as const) await saveSection(s);
  };

  const handleLogout = () => {
    if (!window.confirm('Are you sure you want to log out?')) return;
    try { sessionStorage.removeItem(AUTH_SESSION_KEY); sessionStorage.removeItem('admin_username'); } catch {}
    setIsAuthenticated(false); setAdminUsername('');
  };

  /* ── Nav helpers ── */
  const updateNavItem = (idx:number, field:keyof NavItem, value:string) => { const u=[...navData.nav_items]; u[idx]={...u[idx],[field]:value}; setNavData({...navData,nav_items:u}); };
  const addNavItem    = () => setNavData({...navData,nav_items:[...navData.nav_items,{label:'NEW LINK',href:'/'}]});
  const removeNavItem = (idx:number) => setNavData({...navData,nav_items:navData.nav_items.filter((_,i)=>i!==idx)});
  const moveNavItem   = (idx:number,dir:-1|1) => { const u=[...navData.nav_items]; const n=idx+dir; if(n<0||n>=u.length)return; [u[idx],u[n]]=[u[n],u[idx]]; setNavData({...navData,nav_items:u}); };

  /* ── Footer helpers ── */
  const updateQuickLink = (idx:number,field:keyof QuickLink,value:string) => { const u=[...footerData.quick_links]; u[idx]={...u[idx],[field]:value}; setFooterData({...footerData,quick_links:u}); };
  const addQuickLink    = () => setFooterData({...footerData,quick_links:[...footerData.quick_links,{label:'New Link',href:'/'}]});
  const removeQuickLink = (idx:number) => setFooterData({...footerData,quick_links:footerData.quick_links.filter((_,i)=>i!==idx)});
  const moveQuickLink   = (idx:number,dir:-1|1) => { const u=[...footerData.quick_links]; const n=idx+dir; if(n<0||n>=u.length)return; [u[idx],u[n]]=[u[n],u[idx]]; setFooterData({...footerData,quick_links:u}); };
  const updateLocation  = (idx:number,value:string) => { const u=[...footerData.locations]; u[idx]=value; setFooterData({...footerData,locations:u}); };
  const addLocation     = () => setFooterData({...footerData,locations:[...footerData.locations,'New Location']});
  const removeLocation  = (idx:number) => setFooterData({...footerData,locations:footerData.locations.filter((_,i)=>i!==idx)});

  /* ── Staff helpers ── */
  const updateStaffMember = (idx:number,field:keyof StaffMember,value:string) => { const u=[...aboutData.staff]; u[idx]={...u[idx],[field]:value}; setAboutData({...aboutData,staff:u}); };
  const addStaffMember    = () => setAboutData({...aboutData,staff:[...aboutData.staff,{name:'New Staff',role:'Role',experience:'1+ Years',bio:'',specialties:'',photo:''}]});
  const removeStaffMember = (idx:number) => setAboutData({...aboutData,staff:aboutData.staff.filter((_,i)=>i!==idx)});
  const moveStaffMember   = (idx:number,dir:-1|1) => { const u=[...aboutData.staff]; const n=idx+dir; if(n<0||n>=u.length)return; [u[idx],u[n]]=[u[n],u[idx]]; setAboutData({...aboutData,staff:u}); };

  // ✅ NEW: Staff photo upload handler
  const handleStaffPhotoUpload = async (idx: number, file: File) => {
    setStaffUploadLoading(prev => ({ ...prev, [idx]: true }));
    setStaffUploadError(prev =>   ({ ...prev, [idx]: '' }));
    try {
      const fd = new FormData();
      fd.append('file',      file);
      fd.append('staffName', aboutData.staff[idx]?.name ?? 'staff');
      const res  = await fetch('/api/upload-staff-photo', { method: 'POST', body: fd });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error ?? 'Upload failed');
      updateStaffMember(idx, 'photo', json.url);
    } catch (err) {
      setStaffUploadError(prev => ({ ...prev, [idx]: err instanceof Error ? err.message : 'Upload failed' }));
    } finally {
      setStaffUploadLoading(prev => ({ ...prev, [idx]: false }));
    }
  };

  // ✅ NEW: Gallery image upload handler
  const handleGalleryImageUpload = async (idx: number, file: File) => {
    setGalleryUploadLoading(prev => ({ ...prev, [idx]: true }));
    setGalleryUploadError(prev =>   ({ ...prev, [idx]: '' }));
    try {
      const fd = new FormData();
      fd.append('file',      file);
      fd.append('staffName', `gallery-${idx + 1}`);
      const res  = await fetch('/api/upload-staff-photo', { method: 'POST', body: fd });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error ?? 'Upload failed');
      const updated = [...aboutData.gallery_images];
      updated[idx] = json.url;
      setAboutData({ ...aboutData, gallery_images: updated });
    } catch (err) {
      setGalleryUploadError(prev => ({ ...prev, [idx]: err instanceof Error ? err.message : 'Upload failed' }));
    } finally {
      setGalleryUploadLoading(prev => ({ ...prev, [idx]: false }));
    }
  };

  /* ✅ NEW: Gallery TAB helpers */
  const updateGalleryItem = (idx:number, field:keyof GalleryItem, value:string) => {
    const u=[...galleryData.items];
    u[idx]={...u[idx],[field]:value};
    // keep `filter` slug in sync with the tag so filtering keeps working
    if (field === 'tag') u[idx].filter = value.trim().toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'') || 'general';
    setGalleryData({...galleryData, items:u});
  };
  const addGalleryItem    = () => setGalleryData({...galleryData, items:[...galleryData.items,{ id:Date.now(), src:'', alt:'New Gallery Image', label:'New Photo', tag:'Bridal', filter:'bridal', aspect:'portrait' }]});
  const removeGalleryItem = (idx:number) => setGalleryData({...galleryData, items:galleryData.items.filter((_,i)=>i!==idx)});
  const moveGalleryItem   = (idx:number,dir:-1|1) => { const u=[...galleryData.items]; const n=idx+dir; if(n<0||n>=u.length)return; [u[idx],u[n]]=[u[n],u[idx]]; setGalleryData({...galleryData,items:u}); };

  // ✅ NEW: Gallery TAB photo upload handler → Cloudinary
  const handleGalleryPhotoUpload = async (idx: number, file: File) => {
    setGalPhotoUploadLoading(prev => ({ ...prev, [idx]: true }));
    setGalPhotoUploadError(prev =>   ({ ...prev, [idx]: '' }));
    try {
      const fd = new FormData();
      fd.append('file',      file);
      fd.append('itemLabel', galleryData.items[idx]?.label ?? 'gallery-item');
      const res  = await fetch('/api/upload-gallery-photo', { method: 'POST', body: fd });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error ?? 'Upload failed');
      updateGalleryItem(idx, 'src', json.url);
    } catch (err) {
      setGalPhotoUploadError(prev => ({ ...prev, [idx]: err instanceof Error ? err.message : 'Upload failed' }));
    } finally {
      setGalPhotoUploadLoading(prev => ({ ...prev, [idx]: false }));
    }
  };

  /* ── Review helpers ── */
  const updateAboutReview = (idx:number,field:keyof AboutReview,value:string) => { const u=[...aboutData.reviews]; u[idx]={...u[idx],[field]:value}; setAboutData({...aboutData,reviews:u}); };
  const addAboutReview    = () => setAboutData({...aboutData,reviews:[...aboutData.reviews,{quote:'',author:''}]});
  const removeAboutReview = (idx:number) => setAboutData({...aboutData,reviews:aboutData.reviews.filter((_,i)=>i!==idx)});
  const moveAboutReview   = (idx:number,dir:-1|1) => { const u=[...aboutData.reviews]; const n=idx+dir; if(n<0||n>=u.length)return; [u[idx],u[n]]=[u[n],u[idx]]; setAboutData({...aboutData,reviews:u}); };

  /* ── Category helpers ── */
  const labelToKey = (label:string) => label.trim().toUpperCase().replace(/\s+/g,'_').replace(/[^A-Z0-9_]/g,'');
  const updateCategoryLabel = (idx:number,newLabel:string) => {
    const cats=[...servicesData.categories]; const oldKey=cats[idx].key; const newKey=labelToKey(newLabel);
    cats[idx]={...cats[idx],label:newLabel,key:newKey};
    const newPL:typeof servicesData.price_list={};
    for(const g of Object.keys(servicesData.price_list)){newPL[g]={};for(const k of Object.keys(servicesData.price_list[g])){newPL[g][k===oldKey?newKey:k]=servicesData.price_list[g][k];}}
    if(svcCategory===oldKey)setSvcCategory(newKey);
    setServicesData({...servicesData,categories:cats,price_list:newPL});
  };
  const addCategory      = () => { const newKey=`NEW_CATEGORY_${Date.now()}`; const newCats=[...servicesData.categories,{key:newKey,label:'NEW',image:''}]; const newPL={...servicesData.price_list}; for(const g of['her','his']){if(!newPL[g])newPL[g]={};newPL[g][newKey]=[];} setServicesData({...servicesData,categories:newCats,price_list:newPL}); setSvcCategory(newKey); };
  const removeCategory   = (idx:number) => { const cats=[...servicesData.categories]; const removedKey=cats[idx].key; cats.splice(idx,1); const newPL={...servicesData.price_list}; for(const g of Object.keys(newPL)){const gd={...newPL[g]};delete gd[removedKey];newPL[g]=gd;} if(svcCategory===removedKey)setSvcCategory(cats[0]?.key??''); setServicesData({...servicesData,categories:cats,price_list:newPL}); };
  const moveCategoryItem = (idx:number,dir:-1|1) => { const cats=[...servicesData.categories]; const n=idx+dir; if(n<0||n>=cats.length)return; [cats[idx],cats[n]]=[cats[n],cats[idx]]; setServicesData({...servicesData,categories:cats}); };

  /* ── Price helpers ── */
  const getPriceItems   = ():PriceItem[] => { try{return servicesData.price_list?.[svcGender]?.[svcCategory]??[];}catch{return[];} };
  const updatePriceItem = (idx:number,field:keyof PriceItem,value:string) => { const items=[...getPriceItems()]; items[idx]={...items[idx],[field]:value}; setServicesData({...servicesData,price_list:{...servicesData.price_list,[svcGender]:{...servicesData.price_list[svcGender],[svcCategory]:items}}}); };
  const addPriceItem    = () => { const items=[...getPriceItems(),{name:'New Service',price1:'0.00'}]; setServicesData({...servicesData,price_list:{...servicesData.price_list,[svcGender]:{...servicesData.price_list[svcGender],[svcCategory]:items}}}); };
  const removePriceItem = (idx:number) => { const items=getPriceItems().filter((_,i)=>i!==idx); setServicesData({...servicesData,price_list:{...servicesData.price_list,[svcGender]:{...servicesData.price_list[svcGender],[svcCategory]:items}}}); };
  const movePriceItem   = (idx:number,dir:-1|1) => { const items=[...getPriceItems()]; const n=idx+dir; if(n<0||n>=items.length)return; [items[idx],items[n]]=[items[n],items[idx]]; setServicesData({...servicesData,price_list:{...servicesData.price_list,[svcGender]:{...servicesData.price_list[svcGender],[svcCategory]:items}}}); };

  /* ── Contact helpers ── */
  const updateStat   = (idx:number,field:keyof StatItem,value:string) => { const u=[...contactData.stats]; u[idx]={...u[idx],[field]:value}; setContactData({...contactData,stats:u}); };
  const addStat      = () => setContactData({...contactData,stats:[...contactData.stats,{value:'0',label:'New Stat'}]});
  const removeStat   = (idx:number) => setContactData({...contactData,stats:contactData.stats.filter((_,i)=>i!==idx)});
  const moveStat     = (idx:number,dir:-1|1) => { const u=[...contactData.stats]; const n=idx+dir; if(n<0||n>=u.length)return; [u[idx],u[n]]=[u[n],u[idx]]; setContactData({...contactData,stats:u}); };
  const updateBranch = (idx:number,field:keyof BranchLocation,value:string|boolean) => { const u=[...contactData.branches]; u[idx]={...u[idx],[field]:value} as BranchLocation; setContactData({...contactData,branches:u}); };
  const addBranch    = () => setContactData({...contactData,branches:[...contactData.branches,{name:'New Branch',address:'',phone:'',email:'',isHead:false,mapHref:''}]});
  const removeBranch = (idx:number) => setContactData({...contactData,branches:contactData.branches.filter((_,i)=>i!==idx)});
  const moveBranch   = (idx:number,dir:-1|1) => { const u=[...contactData.branches]; const n=idx+dir; if(n<0||n>=u.length)return; [u[idx],u[n]]=[u[n],u[idx]]; setContactData({...contactData,branches:u}); };

  /* ── Tabs ── */
  const TABS = [
    { key:'nav'      as const, label:'NAVIGATION', icon:<IconCompass />        },
    { key:'home'     as const, label:'HOME HERO',  icon:<IconHome />           },
    { key:'about'    as const, label:'OUR STORY',  icon:<IconBook />           },
    { key:'services' as const, label:'SERVICES',   icon:<IconScissors />       },
    { key:'gallery'  as const, label:'GALLERY',    icon:<IconImage />          },
    { key:'contact'  as const, label:'CONTACT',    icon:<IconPhone />          },
    { key:'footer'   as const, label:'FOOTER',     icon:<IconMapPin />         },
    { key:'feedback' as const, label:'FEEDBACK',   icon:<IconMessageSquare />  },
  ];

  const SaveButton = ({ section }: { section:'nav'|'home'|'footer'|'about'|'services'|'contact'|'gallery' }) => (
    <div style={{ marginTop:'2rem', display:'flex', alignItems:'center', gap:'1rem', flexWrap:'wrap' }}>
      <button onClick={() => saveSection(section)} disabled={saving[section]}
        style={{ background:saved[section]?'rgba(56,161,105,0.8)':saving[section]?'rgba(184,134,11,0.5)':'linear-gradient(135deg,#B8860B 0%,#d4a017 100%)', border:'none', color:'#fff', padding:'0.75rem 2rem', borderRadius:'0.6rem', fontWeight:700, fontSize:'0.9rem', cursor:saving[section]?'not-allowed':'pointer', boxShadow:saving[section]||saved[section]?'none':'0 4px 14px rgba(184,134,11,0.4)', display:'flex', alignItems:'center', gap:'0.5rem', transition:'all 0.3s' }}>
        {saving[section] ? (<><IconSpinner /> Saving to DB...</>) : saved[section] ? (<><IconCheck /> Saved to Database!</>) : (<><IconSave /> Save {section.charAt(0).toUpperCase()+section.slice(1)} Changes</>)}
      </button>
      {saveErr[section] && (
        <span style={{ color:'#fc8181', fontSize:'0.82rem', fontWeight:500, display:'flex', alignItems:'center', gap:'0.35rem' }}>
          <IconAlertTriangle /> {saveErr[section]}
        </span>
      )}
    </div>
  );

  /* ── Auth guard ── */
  if (!authChecked) return (
    <div style={{ minHeight:'100vh', backgroundColor:tokens.color.bgDark, display:'flex', alignItems:'center', justifyContent:'center', fontFamily:tokens.font.family }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <div style={{ width:'40px', height:'40px', border:`3px solid ${tokens.color.goldBorder}`, borderTopColor:tokens.color.gold, borderRadius:'50%', animation:'spin 0.8s linear infinite' }} />
    </div>
  );

  if (!isAuthenticated) return (
    <AdminLoginScreen onLoginSuccess={u => { setIsAuthenticated(true); setAdminUsername(u); }} />
  );

  /* ══════════════════════════════════════════
     RENDER
  ══════════════════════════════════════════ */
  return (
    <div style={{ minHeight:'100vh', backgroundColor:tokens.color.bgDark, color:tokens.color.white, fontFamily:tokens.font.family, paddingBottom:'4rem' }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      {/* Toast */}
      {toastMessage && (
        <div style={{ position:'fixed', top:'1.5rem', right:previewOpen?'400px':'1.5rem', zIndex:9999, background:toastType==='error'?'#c53030':'#B8860B', color:'#fff', padding:'0.9rem 1.5rem', borderRadius:'0.75rem', fontWeight:600, boxShadow:'0 10px 30px rgba(0,0,0,0.7)', border:'1px solid rgba(255,255,255,0.2)', transition:'right .35s cubic-bezier(.16,1,.3,1)', maxWidth:'340px', display:'flex', alignItems:'center', gap:'0.5rem' }}>
          {toastType==='error' ? <IconAlertTriangle /> : <IconCheck />} {toastMessage}
        </div>
      )}

      <LivePreviewPanel open={previewOpen} onClose={() => setPreviewOpen(false)} navData={navData} homeData={homeData} footerData={footerData} activeTab={activeTab} />

      {/* ── Header ── */}
      <header style={{ position:'sticky', top:0, zIndex:50, background:'rgba(14,14,18,0.88)', backdropFilter:'blur(12px)', borderBottom:`1px solid ${tokens.color.whiteBorder}`, padding:'0.85rem 2rem', display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:'1rem' }}>
        <div style={{ display:'flex', alignItems:'center', gap:'1rem' }}>
          <AdminLogoIcon size={48} />
          <div>
            <h1 style={{ fontSize:'1.1rem', fontWeight:700, margin:0, letterSpacing:'0.08em' }}>SAYO BEAUTY <span style={{ color:tokens.color.gold, fontWeight:500 }}>ADMIN PORTAL</span></h1>
            <p style={{ fontSize:'0.75rem', color:tokens.color.whiteDim, margin:0, display:'flex', alignItems:'center', gap:'0.5rem' }}>
              <IconUser /> {adminUsername ? `Logged in as: ${adminUsername}` : 'Content Manager'}
              <span style={{ color:'#68d391', fontWeight:600, display:'flex', alignItems:'center', gap:'0.3rem' }}><IconDatabase /> MySQL DB Connected</span>
            </p>
          </div>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:'0.75rem', flexWrap:'wrap' }}>
          {activeTab !== 'feedback' && (
            <button onClick={() => setPreviewOpen(!previewOpen)} style={{ background:previewOpen?'rgba(184,134,11,0.25)':'rgba(255,255,255,0.05)', border:`1px solid ${previewOpen?tokens.color.gold:tokens.color.whiteBorder}`, color:previewOpen?tokens.color.gold:tokens.color.whiteMuted, padding:'0.55rem 1.1rem', borderRadius:'0.5rem', fontSize:'0.82rem', fontWeight:600, cursor:'pointer', display:'flex', alignItems:'center', gap:'0.4rem', transition:'all .2s' }}>
              <IconEye /> {previewOpen ? 'Hide Preview' : 'Live Preview'}
            </button>
          )}
          {activeTab !== 'feedback' && (
            <button onClick={saveAll} disabled={Object.values(saving).some(Boolean)} style={{ background:'linear-gradient(135deg,#B8860B 0%,#d4a017 100%)', border:'none', color:'#fff', padding:'0.6rem 1.4rem', borderRadius:'0.5rem', fontSize:'0.85rem', fontWeight:600, cursor:Object.values(saving).some(Boolean)?'not-allowed':'pointer', boxShadow:'0 4px 14px rgba(184,134,11,0.4)', display:'flex', alignItems:'center', gap:'0.5rem', opacity:Object.values(saving).some(Boolean)?0.7:1 }}>
              {Object.values(saving).some(Boolean) ? (<><IconSpinner /> Saving...</>) : (<><IconSave /> Save All to DB</>)}
            </button>
          )}
          <button onClick={handleLogout} style={{ background:'rgba(229,62,62,0.15)', border:'1px solid rgba(229,62,62,0.4)', color:'#fc8181', padding:'0.55rem 1.1rem', borderRadius:'0.5rem', fontSize:'0.82rem', fontWeight:600, cursor:'pointer', display:'flex', alignItems:'center', gap:'0.4rem' }}>
            <IconLogOut /> Logout
          </button>
        </div>
      </header>

      {/* Loading bar */}
      {isLoading && (
        <div style={{ background:'rgba(184,134,11,0.1)', borderBottom:`1px solid ${tokens.color.goldBorder}`, padding:'0.6rem 2rem', display:'flex', alignItems:'center', gap:'0.75rem', color:tokens.color.gold, fontSize:'0.82rem' }}>
          <IconSpinner /> Loading data from MySQL database...
        </div>
      )}

      {/* ── Tab bar ── */}
      <nav style={{ background:'#121216', borderBottom:`1px solid ${tokens.color.whiteBorder}`, padding:'0 2rem', display:'flex', gap:'0.5rem', overflowX:'auto' }}>
        {TABS.map(tab => {
          const isActive = activeTab === tab.key;
          return (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              style={{ background:isActive?'rgba(184,134,11,0.18)':'transparent', border:'none', borderBottom:isActive?`3px solid ${tokens.color.gold}`:'3px solid transparent', color:isActive?'#fff':tokens.color.whiteDim, padding:'1rem 1.5rem', fontSize:'0.85rem', fontWeight:isActive?600:500, cursor:'pointer', display:'flex', alignItems:'center', gap:'0.5rem', whiteSpace:'nowrap', transition:'all .2s' }}>
              {tab.icon} {tab.label}
            </button>
          );
        })}
      </nav>

      {/* ── Main content ── */}
      <main style={{ maxWidth:'1100px', margin:'2rem auto', padding:'0 1.5rem' }}>

        {/* ══ NAVIGATION ══ */}
        {activeTab === 'nav' && (
          <section style={sectionCard}>
            <h2 style={sectionTitle}>Navigation Bar</h2>
            <p style={sectionDesc}>Controls the logo text, nav links, and Contact Us button shown on every page.</p>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))', gap:'1.25rem', marginBottom:'2rem' }}>
              {[{label:'Logo Text',key:'logo_text'},{label:'Contact Button Text',key:'contact_btn_text'},{label:'Contact Button Link',key:'contact_btn_link'}].map(({label,key}) => (
                <div key={key}><label style={fieldLabel}>{label}</label><input type="text" value={((navData as unknown) as Record<string,string>)[key]??''} onChange={e=>setNavData({...navData,[key]:e.target.value})} style={inputStyle}/></div>
              ))}
            </div>
            <label style={{...fieldLabel,fontSize:'0.9rem',color:tokens.color.gold,marginBottom:'0.75rem',display:'flex',alignItems:'center',gap:'0.4rem'}}><IconLink /> Navigation Links ({navData.nav_items.length})</label>
            <div style={{background:'rgba(0,0,0,0.4)',borderRadius:'1rem',border:`1px solid ${tokens.color.whiteBorder}`,overflow:'hidden',marginBottom:'0.5rem'}}>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 120px',padding:'0.9rem 1.25rem',background:'rgba(184,134,11,0.15)',borderBottom:`1px solid ${tokens.color.whiteBorder}`,fontWeight:600,fontSize:'0.8rem',color:tokens.color.gold,textTransform:'uppercase',letterSpacing:'0.05em'}}><div>Label</div><div>Link (Href)</div><div style={{textAlign:'center'}}>Actions</div></div>
              {navData.nav_items.map((item,idx) => (
                <div key={idx} style={{display:'grid',gridTemplateColumns:'1fr 1fr 120px',alignItems:'center',gap:'0.75rem',padding:'0.75rem 1.25rem',borderBottom:'1px solid rgba(255,255,255,0.06)'}}>
                  <input type="text" value={item.label} onChange={e=>updateNavItem(idx,'label',e.target.value)} style={{...inputStyle,padding:'0.5rem 0.75rem'}}/>
                  <input type="text" value={item.href}  onChange={e=>updateNavItem(idx,'href',e.target.value)}  style={{...inputStyle,padding:'0.5rem 0.75rem'}}/>
                  <div style={{display:'flex',justifyContent:'center',gap:'0.35rem'}}>
                    <button onClick={()=>moveNavItem(idx,-1)} disabled={idx===0} style={{...smallIconBtn,opacity:idx===0?0.3:1}}><IconChevronUp /></button>
                    <button onClick={()=>moveNavItem(idx,1)} disabled={idx===navData.nav_items.length-1} style={{...smallIconBtn,opacity:idx===navData.nav_items.length-1?0.3:1}}><IconChevronDown /></button>
                    <button onClick={()=>removeNavItem(idx)} style={{background:'rgba(229,62,62,0.2)',color:'#fc8181',border:'1px solid rgba(229,62,62,0.4)',borderRadius:'0.4rem',padding:'0.3rem 0.55rem',cursor:'pointer',display:'inline-flex',alignItems:'center',justifyContent:'center'}}><IconTrash /></button>
                  </div>
                </div>
              ))}
              <div style={{padding:'1rem',textAlign:'center',background:'rgba(255,255,255,0.02)'}}><button onClick={addNavItem} style={{background:'rgba(184,134,11,0.2)',border:`1px dashed ${tokens.color.gold}`,color:tokens.color.gold,padding:'0.6rem 1.5rem',borderRadius:'0.5rem',fontSize:'0.85rem',fontWeight:600,cursor:'pointer',display:'inline-flex',alignItems:'center',gap:'0.4rem'}}><IconPlus /> Add Nav Link</button></div>
            </div>
            <SaveButton section="nav" />
          </section>
        )}

        {/* ══ HOME ══ */}
        {activeTab === 'home' && (
          <section style={sectionCard}>
            <h2 style={sectionTitle}>Home Hero Section</h2>
            <p style={sectionDesc}>Update the main headline, tagline, body text, and CTA button on the home page hero banner.</p>
            <div style={{display:'flex',flexDirection:'column',gap:'1.25rem'}}>
              {[{label:'Eyebrow Text',key:'hero_eyebrow'},{label:'Main Heading',key:'hero_heading'}].map(({label,key}) => (<div key={key}><label style={fieldLabel}>{label}</label><input type="text" value={((homeData as unknown) as Record<string,string>)[key]??''} onChange={e=>setHomeData({...homeData,[key]:e.target.value})} style={inputStyle}/></div>))}
              <div><label style={fieldLabel}>Body Description</label><textarea rows={4} value={homeData.hero_body} onChange={e=>setHomeData({...homeData,hero_body:e.target.value})} style={{...inputStyle,resize:'vertical'}}/></div>
              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))',gap:'1rem'}}>
                <div><label style={fieldLabel}>CTA Button Text</label><input type="text" value={homeData.hero_cta_text} onChange={e=>setHomeData({...homeData,hero_cta_text:e.target.value})} style={inputStyle}/></div>
                <div><label style={fieldLabel}>CTA Button URL</label><input type="text" value={homeData.hero_cta_link} onChange={e=>setHomeData({...homeData,hero_cta_link:e.target.value})} style={inputStyle}/></div>
              </div>
            </div>
            <div style={{marginTop:'2rem',background:'linear-gradient(135deg,#18181e 0%,#0d0d12 100%)',border:`1px solid ${tokens.color.goldBorder}`,borderRadius:'1rem',padding:'2rem',position:'relative'}}>
              <span style={{position:'absolute',top:'1rem',right:'1.25rem',background:'rgba(184,134,11,0.2)',color:tokens.color.gold,fontSize:'0.7rem',fontWeight:700,padding:'0.25rem 0.6rem',borderRadius:'0.375rem'}}>PREVIEW</span>
              <p style={{color:tokens.color.gold,fontSize:'0.85rem',fontWeight:600,margin:'0 0 0.6rem',letterSpacing:'0.1em'}}>{homeData.hero_eyebrow||'—'}</p>
              <h3 style={{fontSize:'clamp(1.2rem,3vw,2rem)',fontWeight:600,color:'#fff',lineHeight:1.2,margin:'0 0 0.75rem',maxWidth:'560px'}}>{homeData.hero_heading||'—'}</h3>
              <p style={{color:tokens.color.whiteMuted,fontSize:'0.9rem',lineHeight:1.7,margin:'0 0 1.25rem',maxWidth:'480px'}}>{homeData.hero_body||'—'}</p>
              <span style={{background:tokens.color.gold,color:'#fff',padding:'0.6rem 1.5rem',borderRadius:'1.25rem',fontSize:'0.9rem',fontWeight:600}}>{homeData.hero_cta_text||'—'} →</span>
            </div>
            <SaveButton section="home" />
          </section>
        )}

        {/* ══ ABOUT ══ */}
        {activeTab === 'about' && (
          <div style={{display:'flex',flexDirection:'column',gap:'2rem'}}>
            <section style={sectionCard}>
              <h2 style={sectionTitle}>Our Story — Hero Section</h2>
              <p style={sectionDesc}>Eyebrow, heading, and body text shown at the top of the About page.</p>
              <div style={{display:'flex',flexDirection:'column',gap:'1.25rem'}}>
                <div><label style={fieldLabel}>Eyebrow Text</label><input type="text" value={aboutData.hero_eyebrow} onChange={e=>setAboutData({...aboutData,hero_eyebrow:e.target.value})} style={inputStyle}/></div>
                <div><label style={fieldLabel}>Main Heading</label><input type="text" value={aboutData.hero_heading} onChange={e=>setAboutData({...aboutData,hero_heading:e.target.value})} style={inputStyle}/></div>
                <div><label style={fieldLabel}>Body Paragraph</label><textarea rows={4} value={aboutData.hero_body} onChange={e=>setAboutData({...aboutData,hero_body:e.target.value})} style={{...inputStyle,resize:'vertical'}}/></div>
              </div>
            </section>

            {/* ✅ REPLACED: Team Section with photo upload */}
            <section style={sectionCard}>
              <h2 style={sectionTitle}>Team Section</h2>
              <div style={{ marginBottom: '1.5rem' }}>
                <label style={fieldLabel}>Section Title</label>
                <input
                  type="text"
                  value={aboutData.team_section_title}
                  onChange={e => setAboutData({ ...aboutData, team_section_title: e.target.value })}
                  style={inputStyle}
                />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
                <label style={{ ...fieldLabel, fontSize: '0.9rem', color: tokens.color.gold }}>
                  Staff Members ({aboutData.staff.length})
                </label>
                <button
                  onClick={addStaffMember}
                  style={{
                    background: tokens.color.gold, border: 'none', color: '#fff',
                    padding: '0.5rem 1rem', borderRadius: '0.5rem', fontWeight: 600,
                    fontSize: '0.8rem', cursor: 'pointer', display: 'inline-flex',
                    alignItems: 'center', gap: '0.4rem',
                  }}
                >
                  <IconPlus /> Add Staff Member
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {aboutData.staff.map((member, idx) => (
                  <div
                    key={idx}
                    style={{
                      background: 'rgba(255,255,255,0.03)',
                      border: `1px solid ${tokens.color.whiteBorder}`,
                      borderRadius: '1rem', padding: '1.25rem',
                    }}
                  >
                    {/* Card header */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                      <span style={{ color: tokens.color.gold, fontWeight: 600, fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <IconUser /> Staff #{idx + 1}
                      </span>
                      <div style={{ display: 'flex', gap: '0.35rem' }}>
                        <button onClick={() => moveStaffMember(idx, -1)} disabled={idx === 0}
                          style={{ ...smallIconBtn, opacity: idx === 0 ? 0.3 : 1 }}><IconChevronUp /></button>
                        <button onClick={() => moveStaffMember(idx, 1)} disabled={idx === aboutData.staff.length - 1}
                          style={{ ...smallIconBtn, opacity: idx === aboutData.staff.length - 1 ? 0.3 : 1 }}><IconChevronDown /></button>
                        <button onClick={() => removeStaffMember(idx)}
                          style={{ background: 'rgba(229,62,62,0.2)', color: '#fc8181', border: '1px solid rgba(229,62,62,0.4)', borderRadius: '0.4rem', padding: '0.3rem 0.55rem', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                          <IconTrash />
                        </button>
                      </div>
                    </div>

                    {/* Photo upload row */}
                    <div style={{ marginBottom: '1rem' }}>
                      <label style={{ ...fieldLabel, fontSize: '0.72rem' }}>Profile Photo</label>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap' }}>

                        {/* Preview */}
                        <div style={{
                          width: '80px', height: '80px', borderRadius: '0.6rem', overflow: 'hidden',
                          border: `1px solid ${tokens.color.whiteBorder}`, flexShrink: 0,
                          background: 'rgba(255,255,255,0.05)', position: 'relative',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          {member.photo ? (
                            <Image
                              src={member.photo}
                              alt={member.name || 'Staff photo'}
                              fill
                              sizes="80px"
                              style={{ objectFit: 'cover' }}
                            />
                          ) : (
                            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5">
                              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                              <circle cx="12" cy="7" r="4"/>
                            </svg>
                          )}
                        </div>

                        {/* Controls */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', flex: 1 }}>
                          {/* File picker */}
                          <label style={{
                            display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
                            background: staffUploadLoading[idx]
                              ? 'rgba(184,134,11,0.3)'
                              : 'rgba(184,134,11,0.15)',
                            border: `1.5px solid ${tokens.color.gold}`,
                            color: tokens.color.gold,
                            padding: '0.45rem 1rem', borderRadius: '0.5rem',
                            fontSize: '0.8rem', fontWeight: 600,
                            cursor: staffUploadLoading[idx] ? 'not-allowed' : 'pointer',
                            width: 'fit-content', userSelect: 'none',
                          }}>
                            {staffUploadLoading[idx] ? (
                              <>
                                <span style={{
                                  display: 'inline-block', width: '12px', height: '12px',
                                  border: '2px solid rgba(184,134,11,0.3)',
                                  borderTopColor: tokens.color.gold,
                                  borderRadius: '50%', animation: 'spin 0.8s linear infinite',
                                }} />
                                Uploading…
                              </>
                            ) : (
                              <>
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                                  <polyline points="17 8 12 3 7 8"/>
                                  <line x1="12" y1="3" x2="12" y2="15"/>
                                </svg>
                                {member.photo ? 'Change Photo' : 'Upload Photo'}
                              </>
                            )}
                            <input
                              type="file"
                              accept="image/jpeg,image/png,image/webp,image/gif"
                              disabled={staffUploadLoading[idx]}
                              style={{ display: 'none' }}
                              onChange={e => {
                                const f = e.target.files?.[0];
                                if (f) handleStaffPhotoUpload(idx, f);
                                e.target.value = '';
                              }}
                            />
                          </label>

                          {/* Remove button */}
                          {member.photo && (
                            <button
                              onClick={() => updateStaffMember(idx, 'photo', '')}
                              style={{
                                background: 'none', border: 'none',
                                color: 'rgba(252,129,129,0.8)', fontSize: '0.75rem',
                                fontWeight: 500, cursor: 'pointer', padding: 0,
                                textAlign: 'left', width: 'fit-content',
                                display: 'flex', alignItems: 'center', gap: '0.3rem',
                              }}
                            >
                              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                              </svg>
                              Remove photo
                            </button>
                          )}

                          {/* Error */}
                          {staffUploadError[idx] && (
                            <span style={{ fontSize: '0.72rem', color: '#fc8181', fontWeight: 500, lineHeight: 1.4 }}>
                              ✕ {staffUploadError[idx]}
                            </span>
                          )}

                          {/* URL hint */}
                          {member.photo && (
                            <span style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.35)', wordBreak: 'break-all', lineHeight: 1.4 }}>
                              {member.photo}
                            </span>
                          )}

                          <p style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.3)', margin: 0 }}>
                            JPEG · PNG · WebP · GIF &nbsp;|&nbsp; Max 5 MB &nbsp;|&nbsp; Auto-cropped to 600 × 600 px
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Text fields */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem', marginBottom: '0.75rem' }}>
                      <div>
                        <label style={{ ...fieldLabel, fontSize: '0.72rem' }}>Full Name</label>
                        <input type="text" value={member.name} onChange={e => updateStaffMember(idx, 'name', e.target.value)}
                          style={{ ...inputStyle, padding: '0.5rem 0.75rem' }} />
                      </div>
                      <div>
                        <label style={{ ...fieldLabel, fontSize: '0.72rem' }}>Role / Title</label>
                        <input type="text" value={member.role} onChange={e => updateStaffMember(idx, 'role', e.target.value)}
                          style={{ ...inputStyle, padding: '0.5rem 0.75rem' }} />
                      </div>
                      <div>
                        <label style={{ ...fieldLabel, fontSize: '0.72rem' }}>Experience</label>
                        <input type="text" value={member.experience} onChange={e => updateStaffMember(idx, 'experience', e.target.value)}
                          style={{ ...inputStyle, padding: '0.5rem 0.75rem' }} />
                      </div>
                    </div>
                    <div style={{ marginBottom: '0.75rem' }}>
                      <label style={{ ...fieldLabel, fontSize: '0.72rem' }}>Bio</label>
                      <textarea rows={3} value={member.bio} onChange={e => updateStaffMember(idx, 'bio', e.target.value)}
                        style={{ ...inputStyle, resize: 'vertical', padding: '0.5rem 0.75rem' }} />
                    </div>
                    <div>
                      <label style={{ ...fieldLabel, fontSize: '0.72rem' }}>Specialties (comma separated)</label>
                      <input type="text" value={member.specialties} onChange={e => updateStaffMember(idx, 'specialties', e.target.value)}
                        style={{ ...inputStyle, padding: '0.5rem 0.75rem' }} />
                    </div>
                  </div>
                ))}
                {aboutData.staff.length === 0 && (
                  <div style={{ textAlign: 'center', padding: '2rem', color: tokens.color.whiteFaint }}>
                    No staff members yet.
                  </div>
                )}
              </div>
            </section>

            <section style={sectionCard}>
              <h2 style={sectionTitle}>Gallery Section</h2>
              <p style={sectionDesc}>Upload the 5 gallery images shown in the Transformations &amp; Artistry section. After uploading, click Save.</p>

              {/* Title + Description */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', marginBottom: '2rem' }}>
                <div><label style={fieldLabel}>Gallery Section Title</label><input type="text" value={aboutData.gallery_section_title} onChange={e => setAboutData({ ...aboutData, gallery_section_title: e.target.value })} style={inputStyle} /></div>
                <div><label style={fieldLabel}>Gallery Description</label><textarea rows={3} value={aboutData.gallery_description} onChange={e => setAboutData({ ...aboutData, gallery_description: e.target.value })} style={{ ...inputStyle, resize: 'vertical' }} /></div>
              </div>

              {/* Gallery image slots */}
              <label style={{ ...fieldLabel, fontSize: '0.9rem', color: tokens.color.gold, marginBottom: '1rem', display: 'block' }}>
                Gallery Images (5 slots)
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
                {[
                  { slot: 0, label: 'Image 1 — Top Left (Featured)' },
                  { slot: 1, label: 'Image 2 — Top Right' },
                  { slot: 2, label: 'Image 3 — Middle Left' },
                  { slot: 3, label: 'Image 4 — Bottom (Wide)' },
                  { slot: 4, label: 'Image 5 — Bottom Right' },
                ].map(({ slot, label }) => {
                  const url     = aboutData.gallery_images?.[slot] ?? '';
                  const loading = galleryUploadLoading[slot];
                  const error   = galleryUploadError[slot];
                  return (
                    <div key={slot} style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${tokens.color.whiteBorder}`, borderRadius: '1rem', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                      <span style={{ fontSize: '0.75rem', fontWeight: 600, color: tokens.color.gold }}>{label}</span>

                      {/* Preview */}
                      <div style={{ width: '100%', height: '140px', borderRadius: '0.6rem', overflow: 'hidden', background: 'rgba(255,255,255,0.04)', border: `1px solid ${tokens.color.whiteBorder}`, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {url ? (
                          <Image src={url} alt={label} fill sizes="280px" style={{ objectFit: 'cover' }} unoptimized />
                        ) : (
                          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="1.5">
                            <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/>
                            <polyline points="21 15 16 10 5 21"/>
                          </svg>
                        )}
                      </div>

                      {/* Upload label */}
                      <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', background: loading ? 'rgba(184,134,11,0.3)' : 'rgba(184,134,11,0.15)', border: `1.5px solid ${tokens.color.gold}`, color: tokens.color.gold, padding: '0.45rem 1rem', borderRadius: '0.5rem', fontSize: '0.78rem', fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer', width: 'fit-content', userSelect: 'none' }}>
                        {loading ? (
                          <><span style={{ display: 'inline-block', width: '11px', height: '11px', border: '2px solid rgba(184,134,11,0.3)', borderTopColor: tokens.color.gold, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} /> Uploading…</>
                        ) : (
                          <><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>{url ? 'Change Image' : 'Upload Image'}</>
                        )}
                        <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" disabled={loading} style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) handleGalleryImageUpload(slot, f); e.target.value = ''; }} />
                      </label>

                      {/* Remove */}
                      {url && (
                        <button onClick={() => { const u = [...(aboutData.gallery_images ?? ['','','','',''])]; u[slot] = ''; setAboutData({ ...aboutData, gallery_images: u }); }} style={{ background: 'none', border: 'none', color: 'rgba(252,129,129,0.8)', fontSize: '0.72rem', fontWeight: 500, cursor: 'pointer', padding: 0, textAlign: 'left', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>Remove
                        </button>
                      )}

                      {/* Error */}
                      {error && <span style={{ fontSize: '0.7rem', color: '#fc8181', fontWeight: 500 }}>✕ {error}</span>}

                      {/* URL hint */}
                      {url && <span style={{ fontSize: '0.62rem', color: 'rgba(255,255,255,0.28)', wordBreak: 'break-all', lineHeight: 1.4 }}>{url}</span>}
                    </div>
                  );
                })}
              </div>
              <p style={{ fontSize: '0.72rem', color: tokens.color.whiteFaint, marginTop: '0.75rem' }}>JPEG · PNG · WebP · GIF &nbsp;|&nbsp; Max 5 MB &nbsp;|&nbsp; After uploading all images, click <strong style={{ color: tokens.color.gold }}>Save About Changes</strong>.</p>
            </section>
            <section style={sectionCard}>
              <h2 style={sectionTitle}>Client Reviews Carousel</h2>
              <div style={{marginBottom:'1.5rem'}}><label style={fieldLabel}>Section Title</label><input type="text" value={aboutData.review_section_title} onChange={e=>setAboutData({...aboutData,review_section_title:e.target.value})} style={inputStyle}/></div>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'1rem'}}>
                <label style={{...fieldLabel,fontSize:'0.9rem',color:tokens.color.gold,display:'flex',alignItems:'center',gap:'0.4rem'}}><IconStar /> Reviews ({aboutData.reviews.length})</label>
                <button onClick={addAboutReview} style={{background:tokens.color.gold,border:'none',color:'#fff',padding:'0.5rem 1rem',borderRadius:'0.5rem',fontWeight:600,fontSize:'0.8rem',cursor:'pointer',display:'inline-flex',alignItems:'center',gap:'0.4rem'}}><IconPlus /> Add Review</button>
              </div>
              <div style={{display:'flex',flexDirection:'column',gap:'1rem'}}>
                {aboutData.reviews.map((rev,idx) => (
                  <div key={idx} style={{background:'rgba(255,255,255,0.03)',border:`1px solid ${tokens.color.whiteBorder}`,borderRadius:'1rem',padding:'1.25rem'}}>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'0.75rem'}}>
                      <span style={{color:tokens.color.gold,fontWeight:600,fontSize:'0.9rem',display:'flex',alignItems:'center',gap:'0.4rem'}}><IconStar /> Review #{idx+1}</span>
                      <div style={{display:'flex',gap:'0.35rem'}}>
                        <button onClick={()=>moveAboutReview(idx,-1)} disabled={idx===0} style={{...smallIconBtn,opacity:idx===0?0.3:1}}><IconChevronUp /></button>
                        <button onClick={()=>moveAboutReview(idx,1)} disabled={idx===aboutData.reviews.length-1} style={{...smallIconBtn,opacity:idx===aboutData.reviews.length-1?0.3:1}}><IconChevronDown /></button>
                        <button onClick={()=>removeAboutReview(idx)} style={{background:'rgba(229,62,62,0.2)',color:'#fc8181',border:'1px solid rgba(229,62,62,0.4)',borderRadius:'0.4rem',padding:'0.3rem 0.55rem',cursor:'pointer',display:'inline-flex',alignItems:'center',justifyContent:'center'}}><IconTrash /></button>
                      </div>
                    </div>
                    <div style={{marginBottom:'0.75rem'}}><label style={{...fieldLabel,fontSize:'0.72rem'}}>Quote</label><textarea rows={3} value={rev.quote} onChange={e=>updateAboutReview(idx,'quote',e.target.value)} style={{...inputStyle,resize:'vertical',padding:'0.5rem 0.75rem'}}/></div>
                    <div><label style={{...fieldLabel,fontSize:'0.72rem'}}>Author</label><input type="text" value={rev.author} onChange={e=>updateAboutReview(idx,'author',e.target.value)} style={{...inputStyle,padding:'0.5rem 0.75rem'}}/></div>
                  </div>
                ))}
                {aboutData.reviews.length===0 && <div style={{textAlign:'center',padding:'2rem',color:tokens.color.whiteFaint}}>No reviews yet.</div>}
              </div>
            </section>
            <SaveButton section="about" />
          </div>
        )}

        {/* ══ SERVICES ══ */}
        {activeTab === 'services' && (
          <div style={{display:'flex',flexDirection:'column',gap:'2rem'}}>
            <section style={sectionCard}>
              <h2 style={sectionTitle}>Services Page — Hero Text</h2>
              <p style={sectionDesc}>Main heading and subtitle shown at the top of the Services page.</p>
              <div style={{display:'flex',flexDirection:'column',gap:'1.25rem'}}>
                <div><label style={fieldLabel}>Hero Heading</label><input type="text" value={servicesData.hero_heading} onChange={e=>setServicesData({...servicesData,hero_heading:e.target.value})} style={inputStyle}/></div>
                <div><label style={fieldLabel}>Hero Subtitle</label><textarea rows={4} value={servicesData.hero_subtitle} onChange={e=>setServicesData({...servicesData,hero_subtitle:e.target.value})} style={{...inputStyle,resize:'vertical'}}/></div>
              </div>
            </section>
            <section style={sectionCard}>
              <h2 style={sectionTitle}>Category Manager</h2>
              <p style={sectionDesc}>Add, rename, reorder, or remove service categories.</p>
              <div style={{marginBottom:'0.75rem',padding:'0.75rem 1rem',background:'rgba(184,134,11,0.08)',borderRadius:'0.5rem',border:`1px solid ${tokens.color.goldBorder}`,fontSize:'0.78rem',color:tokens.color.whiteDim,display:'flex',alignItems:'center',gap:'0.4rem'}}><IconAlertTriangle /> Renaming a category automatically updates its price list key.</div>
              <div style={{display:'flex',flexDirection:'column',gap:'0.6rem',marginBottom:'1rem'}}>
                {servicesData.categories.map((cat,idx) => (
                  <div key={cat.key} style={{display:'grid',gridTemplateColumns:'1fr auto',gap:'0.75rem',alignItems:'center',padding:'0.75rem 1rem',background:svcCategory===cat.key?'rgba(184,134,11,0.12)':'rgba(255,255,255,0.03)',border:`1px solid ${svcCategory===cat.key?tokens.color.gold:tokens.color.whiteBorder}`,borderRadius:'0.75rem',cursor:'pointer'}} onClick={()=>setSvcCategory(cat.key)}>
                    <div style={{display:'flex',alignItems:'center',gap:'0.75rem'}}>
                      <div style={{width:'8px',height:'8px',borderRadius:'50%',flexShrink:0,background:svcCategory===cat.key?tokens.color.gold:'rgba(255,255,255,0.2)'}}/>
                      <div style={{flex:1}}>
                        <label style={{...fieldLabel,fontSize:'0.7rem',marginBottom:'0.2rem',color:tokens.color.whiteDim}}>Category Name</label>
                        <input type="text" value={cat.label} onChange={e=>{e.stopPropagation();updateCategoryLabel(idx,e.target.value);}} onClick={e=>e.stopPropagation()} style={{...inputStyle,padding:'0.4rem 0.6rem',fontSize:'0.85rem',fontWeight:600,textTransform:'uppercase',letterSpacing:'0.05em',background:'rgba(0,0,0,0.3)'}} placeholder="Category name"/>
                        <p style={{fontSize:'0.68rem',color:tokens.color.whiteFaint,margin:'0.2rem 0 0',display:'flex',alignItems:'center',gap:'0.25rem'}}><IconTag /> Key: <code style={{color:tokens.color.gold}}>{cat.key}</code></p>
                      </div>
                    </div>
                    <div style={{display:'flex',gap:'0.3rem',alignItems:'center'}}>
                      <button onClick={e=>{e.stopPropagation();moveCategoryItem(idx,-1);}} disabled={idx===0} style={{...smallIconBtn,opacity:idx===0?0.3:1}}><IconChevronUp /></button>
                      <button onClick={e=>{e.stopPropagation();moveCategoryItem(idx,1);}} disabled={idx===servicesData.categories.length-1} style={{...smallIconBtn,opacity:idx===servicesData.categories.length-1?0.3:1}}><IconChevronDown /></button>
                      <button onClick={e=>{e.stopPropagation();if(servicesData.categories.length<=1){alert('At least 1 category required.');return;}if(!window.confirm(`Delete "${cat.label}" category and ALL its price items?`))return;removeCategory(idx);}} style={{background:'rgba(229,62,62,0.2)',color:'#fc8181',border:'1px solid rgba(229,62,62,0.4)',borderRadius:'0.4rem',padding:'0.3rem 0.55rem',cursor:'pointer',display:'inline-flex',alignItems:'center',justifyContent:'center'}}><IconTrash /></button>
                    </div>
                  </div>
                ))}
              </div>
              <button onClick={addCategory} style={{width:'100%',background:'rgba(184,134,11,0.12)',border:`1px dashed ${tokens.color.gold}`,color:tokens.color.gold,padding:'0.75rem 1rem',borderRadius:'0.75rem',fontWeight:600,fontSize:'0.85rem',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:'0.4rem'}}><IconPlus /> Add New Category</button>
            </section>
            <section style={sectionCard}>
              <h2 style={sectionTitle}>Price List Editor</h2>
              <p style={sectionDesc}>Select gender and category to edit price items.</p>
              <div style={{marginBottom:'1.5rem'}}>
                <label style={{...fieldLabel,marginBottom:'0.75rem'}}>Gender</label>
                <div style={{display:'flex',gap:'0.75rem',flexWrap:'wrap'}}>
                  {GENDERS.map(g => (<button key={g} onClick={()=>setSvcGender(g)} style={{padding:'0.6rem 1.5rem',borderRadius:'0.75rem',border:'none',fontWeight:600,fontSize:'0.9rem',cursor:'pointer',background:svcGender===g?tokens.color.gold:'rgba(255,255,255,0.08)',color:svcGender===g?'#fff':tokens.color.whiteMuted,transition:'all .2s',display:'inline-flex',alignItems:'center',gap:'0.4rem'}}><IconUser /> {g==='her'?'Her Sanctuary':'His Retreat'}</button>))}
                </div>
              </div>
              <div style={{marginBottom:'1.5rem'}}>
                <label style={{...fieldLabel,marginBottom:'0.75rem'}}>Category</label>
                <div style={{display:'flex',gap:'0.5rem',flexWrap:'wrap'}}>
                  {servicesData.categories.map(cat => (<button key={cat.key} onClick={()=>setSvcCategory(cat.key)} style={{padding:'0.5rem 1.1rem',borderRadius:'0.6rem',border:`1px solid ${svcCategory===cat.key?tokens.color.gold:tokens.color.whiteBorder}`,fontWeight:600,fontSize:'0.82rem',cursor:'pointer',background:svcCategory===cat.key?'rgba(184,134,11,0.25)':'rgba(255,255,255,0.04)',color:svcCategory===cat.key?tokens.color.gold:tokens.color.whiteMuted,transition:'all .2s'}}>{cat.label}</button>))}
                </div>
              </div>
              {svcCategory ? (
                <>
                  <div style={{background:'rgba(0,0,0,0.3)',borderRadius:'1rem',border:`1px solid ${tokens.color.whiteBorder}`,overflow:'hidden'}}>
                    <div style={{display:'grid',gridTemplateColumns:'1fr 130px 130px 110px',gap:'0.5rem',padding:'0.8rem 1.25rem',background:'rgba(184,134,11,0.15)',borderBottom:`1px solid ${tokens.color.whiteBorder}`,fontWeight:600,fontSize:'0.78rem',color:tokens.color.gold,textTransform:'uppercase',letterSpacing:'0.05em',alignItems:'center'}}><div>Service Name</div><div>Price 1</div><div>Price 2 (opt)</div><div style={{textAlign:'center'}}>Actions</div></div>
                    {getPriceItems().map((item,idx) => (
                      <div key={idx} style={{display:'grid',gridTemplateColumns:'1fr 130px 130px 110px',gap:'0.5rem',alignItems:'center',padding:'0.6rem 1.25rem',borderBottom:'1px solid rgba(255,255,255,0.05)',background:idx%2===0?'rgba(255,255,255,0.02)':'transparent'}}>
                        <input type="text" value={item.name}       onChange={e=>updatePriceItem(idx,'name',  e.target.value)} style={{...inputStyle,padding:'0.45rem 0.6rem',fontSize:'0.85rem'}}/>
                        <input type="text" value={item.price1}     onChange={e=>updatePriceItem(idx,'price1',e.target.value)} style={{...inputStyle,padding:'0.45rem 0.6rem',fontSize:'0.85rem'}} placeholder="e.g. 2,500.00"/>
                        <input type="text" value={item.price2||''} onChange={e=>updatePriceItem(idx,'price2',e.target.value)} style={{...inputStyle,padding:'0.45rem 0.6rem',fontSize:'0.85rem'}} placeholder="Optional"/>
                        <div style={{display:'flex',justifyContent:'center',gap:'0.3rem'}}>
                          <button onClick={()=>movePriceItem(idx,-1)} disabled={idx===0} style={{...smallIconBtn,opacity:idx===0?0.3:1,padding:'0.3rem 0.45rem'}}><IconChevronUp /></button>
                          <button onClick={()=>movePriceItem(idx,1)} disabled={idx===getPriceItems().length-1} style={{...smallIconBtn,opacity:idx===getPriceItems().length-1?0.3:1,padding:'0.3rem 0.45rem'}}><IconChevronDown /></button>
                          <button onClick={()=>removePriceItem(idx)} style={{background:'rgba(229,62,62,0.2)',color:'#fc8181',border:'1px solid rgba(229,62,62,0.4)',borderRadius:'0.4rem',padding:'0.3rem 0.45rem',cursor:'pointer',display:'inline-flex',alignItems:'center',justifyContent:'center'}}><IconTrash /></button>
                        </div>
                      </div>
                    ))}
                    {getPriceItems().length===0 && <div style={{padding:'2rem',textAlign:'center',color:tokens.color.whiteFaint,fontSize:'0.85rem'}}>No services yet. Add one below.</div>}
                    <div style={{padding:'1rem',textAlign:'center',background:'rgba(255,255,255,0.02)'}}><button onClick={addPriceItem} style={{background:'rgba(184,134,11,0.2)',border:`1px dashed ${tokens.color.gold}`,color:tokens.color.gold,padding:'0.55rem 1.5rem',borderRadius:'0.5rem',fontSize:'0.85rem',fontWeight:600,cursor:'pointer',display:'inline-flex',alignItems:'center',gap:'0.4rem'}}><IconPlus /> Add Service Item</button></div>
                  </div>
                  <div style={{marginTop:'1rem',padding:'0.75rem 1rem',background:'rgba(184,134,11,0.08)',borderRadius:'0.5rem',border:`1px solid ${tokens.color.goldBorder}`,fontSize:'0.78rem',color:tokens.color.whiteDim,display:'flex',alignItems:'center',gap:'0.4rem'}}><IconInfo /> Editing: <strong style={{color:tokens.color.gold}}>{svcGender==='her'?'Her Sanctuary':'His Retreat'}</strong> → <strong style={{color:tokens.color.gold}}>{servicesData.categories.find(c=>c.key===svcCategory)?.label??svcCategory}</strong> · {getPriceItems().length} items</div>
                </>
              ) : (
                <div style={{padding:'2rem',textAlign:'center',color:tokens.color.whiteFaint,fontSize:'0.85rem',border:`1px dashed ${tokens.color.whiteBorder}`,borderRadius:'1rem'}}>Select a category above to edit its price list.</div>
              )}
            </section>
            <SaveButton section="services" />
          </div>
        )}

        {/* ══ CONTACT ══ */}
        {activeTab === 'contact' && (
          <div style={{display:'flex',flexDirection:'column',gap:'2rem'}}>
            <section style={sectionCard}>
              <h2 style={sectionTitle}>Contact Page — Hero Section</h2>
              <p style={sectionDesc}>Eyebrow, heading, subtitle, and CTA button texts.</p>
              <div style={{display:'flex',flexDirection:'column',gap:'1.25rem'}}>
                <div><label style={fieldLabel}>Eyebrow Text</label><input type="text" value={contactData.hero_eyebrow} onChange={e=>setContactData({...contactData,hero_eyebrow:e.target.value})} style={inputStyle}/></div>
                <div><label style={fieldLabel}>Main Heading</label><input type="text" value={contactData.hero_heading} onChange={e=>setContactData({...contactData,hero_heading:e.target.value})} style={inputStyle}/></div>
                <div><label style={fieldLabel}>Subtitle</label><textarea rows={4} value={contactData.hero_subtitle} onChange={e=>setContactData({...contactData,hero_subtitle:e.target.value})} style={{...inputStyle,resize:'vertical'}}/></div>
                <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))',gap:'1rem'}}>
                  <div><label style={fieldLabel}>Primary CTA Text</label><input type="text" value={contactData.cta_primary_text} onChange={e=>setContactData({...contactData,cta_primary_text:e.target.value})} style={inputStyle}/></div>
                  <div><label style={fieldLabel}>Secondary CTA Text</label><input type="text" value={contactData.cta_secondary_text} onChange={e=>setContactData({...contactData,cta_secondary_text:e.target.value})} style={inputStyle}/></div>
                </div>
              </div>
            </section>
            <section style={sectionCard}>
              <h2 style={sectionTitle}>Contact Info &amp; Social Links</h2>
              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))',gap:'1.25rem',marginBottom:'1.25rem'}}>
                <div><label style={{...fieldLabel,display:'flex',alignItems:'center',gap:'0.4rem'}}><IconPhone /> Phone Number</label><input type="text" value={contactData.phone_number} onChange={e=>setContactData({...contactData,phone_number:e.target.value})} style={inputStyle}/></div>
                <div><label style={{...fieldLabel,display:'flex',alignItems:'center',gap:'0.4rem'}}><IconMail /> Email Address</label><input type="text" value={contactData.email_address} onChange={e=>setContactData({...contactData,email_address:e.target.value})} style={inputStyle}/></div>
              </div>
              <div style={{display:'flex',flexDirection:'column',gap:'1rem'}}>
                {[{label:'Instagram URL',key:'social_instagram',icon:<IconInstagram/>},{label:'Facebook URL',key:'social_facebook',icon:<IconFacebook/>},{label:'WhatsApp URL',key:'social_whatsapp',icon:<IconWhatsApp/>}].map(({label,key,icon}) => (
                  <div key={key}><label style={{...fieldLabel,display:'flex',alignItems:'center',gap:'0.4rem'}}>{icon} {label}</label><input type="text" value={((contactData as unknown) as Record<string,string>)[key]??''} onChange={e=>setContactData({...contactData,[key]:e.target.value})} style={inputStyle} placeholder="https://..."/></div>
                ))}
              </div>
            </section>
            <section style={sectionCard}>
              <h2 style={sectionTitle}>Hero Stat Pills</h2>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'1rem'}}>
                <label style={{...fieldLabel,fontSize:'0.9rem',color:tokens.color.gold,display:'flex',alignItems:'center',gap:'0.4rem'}}><IconBarChart /> Stats ({contactData.stats.length})</label>
                <button onClick={addStat} style={{background:tokens.color.gold,border:'none',color:'#fff',padding:'0.5rem 1rem',borderRadius:'0.5rem',fontWeight:600,fontSize:'0.8rem',cursor:'pointer',display:'inline-flex',alignItems:'center',gap:'0.4rem'}}><IconPlus /> Add Stat</button>
              </div>
              <div style={{display:'flex',flexDirection:'column',gap:'0.6rem'}}>
                {contactData.stats.map((stat,idx) => (
                  <div key={idx} style={{display:'grid',gridTemplateColumns:'120px 1fr auto',gap:'0.5rem',alignItems:'center'}}>
                    <input type="text" value={stat.value} onChange={e=>updateStat(idx,'value',e.target.value)} style={{...inputStyle,padding:'0.55rem 0.75rem'}} placeholder="e.g. 3"/>
                    <input type="text" value={stat.label} onChange={e=>updateStat(idx,'label',e.target.value)} style={{...inputStyle,padding:'0.55rem 0.75rem'}} placeholder="e.g. Locations"/>
                    <div style={{display:'flex',gap:'0.3rem'}}>
                      <button onClick={()=>moveStat(idx,-1)} disabled={idx===0} style={{...smallIconBtn,opacity:idx===0?0.3:1}}><IconChevronUp /></button>
                      <button onClick={()=>moveStat(idx,1)} disabled={idx===contactData.stats.length-1} style={{...smallIconBtn,opacity:idx===contactData.stats.length-1?0.3:1}}><IconChevronDown /></button>
                      <button onClick={()=>removeStat(idx)} style={{background:'rgba(229,62,62,0.2)',color:'#fc8181',border:'none',padding:'0 0.6rem',borderRadius:'0.4rem',cursor:'pointer',display:'inline-flex',alignItems:'center',justifyContent:'center'}}><IconTrash /></button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
            <section style={sectionCard}>
              <h2 style={sectionTitle}>Map Section</h2>
              <div style={{display:'flex',flexDirection:'column',gap:'1.25rem'}}>
                <div><label style={{...fieldLabel,display:'flex',alignItems:'center',gap:'0.4rem'}}><IconMap /> Google Maps Embed URL</label><textarea rows={3} value={contactData.map_embed_src} onChange={e=>setContactData({...contactData,map_embed_src:e.target.value})} style={{...inputStyle,resize:'vertical',fontSize:'0.78rem'}}/></div>
                <div><label style={{...fieldLabel,display:'flex',alignItems:'center',gap:'0.4rem'}}><IconMapPin /> Displayed Address</label><input type="text" value={contactData.map_address} onChange={e=>setContactData({...contactData,map_address:e.target.value})} style={inputStyle}/></div>
                <div><label style={{...fieldLabel,display:'flex',alignItems:'center',gap:'0.4rem'}}><IconGlobe /> View on Map — Link URL</label><input type="text" value={contactData.map_open_href} onChange={e=>setContactData({...contactData,map_open_href:e.target.value})} style={inputStyle}/></div>
              </div>
            </section>
            <section style={sectionCard}>
              <h2 style={sectionTitle}>Branch Locations</h2>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'1rem'}}>
                <label style={{...fieldLabel,fontSize:'0.9rem',color:tokens.color.gold,display:'flex',alignItems:'center',gap:'0.4rem'}}><IconBuilding /> Branches ({contactData.branches.length})</label>
                <button onClick={addBranch} style={{background:tokens.color.gold,border:'none',color:'#fff',padding:'0.5rem 1rem',borderRadius:'0.5rem',fontWeight:600,fontSize:'0.8rem',cursor:'pointer',display:'inline-flex',alignItems:'center',gap:'0.4rem'}}><IconPlus /> Add Branch</button>
              </div>
              <div style={{display:'flex',flexDirection:'column',gap:'1rem'}}>
                {contactData.branches.map((branch,idx) => (
                  <div key={idx} style={{background:'rgba(255,255,255,0.03)',border:`1px solid ${branch.isHead?tokens.color.goldBorder:tokens.color.whiteBorder}`,borderRadius:'1rem',padding:'1.25rem'}}>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'1rem'}}>
                      <span style={{color:tokens.color.gold,fontWeight:600,fontSize:'0.9rem',display:'flex',alignItems:'center',gap:'0.4rem'}}><IconBuilding /> Branch #{idx+1}{branch.isHead&&<span style={{background:'rgba(184,134,11,0.2)',color:tokens.color.gold,fontSize:'0.65rem',padding:'0.15rem 0.5rem',borderRadius:'0.3rem',marginLeft:'0.5rem',fontWeight:700,display:'inline-flex',alignItems:'center',gap:'0.25rem'}}><IconStar /> HEAD OFFICE</span>}</span>
                      <div style={{display:'flex',gap:'0.35rem'}}>
                        <button onClick={()=>moveBranch(idx,-1)} disabled={idx===0} style={{...smallIconBtn,opacity:idx===0?0.3:1}}><IconChevronUp /></button>
                        <button onClick={()=>moveBranch(idx,1)} disabled={idx===contactData.branches.length-1} style={{...smallIconBtn,opacity:idx===contactData.branches.length-1?0.3:1}}><IconChevronDown /></button>
                        <button onClick={()=>{if(contactData.branches.length<=1){alert('At least 1 branch required.');return;}if(!window.confirm(`Delete "${branch.name}" branch?`))return;removeBranch(idx);}} style={{background:'rgba(229,62,62,0.2)',color:'#fc8181',border:'1px solid rgba(229,62,62,0.4)',borderRadius:'0.4rem',padding:'0.3rem 0.55rem',cursor:'pointer',display:'inline-flex',alignItems:'center',justifyContent:'center'}}><IconTrash /></button>
                      </div>
                    </div>
                    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))',gap:'0.75rem',marginBottom:'0.75rem'}}>
                      <div><label style={{...fieldLabel,fontSize:'0.72rem'}}>Branch Name</label><input type="text" value={branch.name}  onChange={e=>updateBranch(idx,'name', e.target.value)} style={{...inputStyle,padding:'0.5rem 0.75rem'}}/></div>
                      <div><label style={{...fieldLabel,fontSize:'0.72rem'}}>Phone</label>       <input type="text" value={branch.phone} onChange={e=>updateBranch(idx,'phone',e.target.value)} style={{...inputStyle,padding:'0.5rem 0.75rem'}}/></div>
                      <div><label style={{...fieldLabel,fontSize:'0.72rem'}}>Email</label>       <input type="text" value={branch.email} onChange={e=>updateBranch(idx,'email',e.target.value)} style={{...inputStyle,padding:'0.5rem 0.75rem'}}/></div>
                    </div>
                    <div style={{marginBottom:'0.75rem'}}><label style={{...fieldLabel,fontSize:'0.72rem'}}>Address</label><input type="text" value={branch.address} onChange={e=>updateBranch(idx,'address',e.target.value)} style={{...inputStyle,padding:'0.5rem 0.75rem'}}/></div>
                    <div style={{marginBottom:'0.75rem'}}><label style={{...fieldLabel,fontSize:'0.72rem',display:'flex',alignItems:'center',gap:'0.3rem'}}><IconGlobe /> Google Maps Link</label><input type="text" value={branch.mapHref} onChange={e=>updateBranch(idx,'mapHref',e.target.value)} style={{...inputStyle,padding:'0.5rem 0.75rem'}} placeholder="https://maps.google.com/?q=..."/></div>
                    <label style={{display:'flex',alignItems:'center',gap:'0.5rem',cursor:'pointer',fontSize:'0.8rem',color:tokens.color.whiteMuted,fontWeight:600}}>
                      <input type="checkbox" checked={branch.isHead} onChange={e=>{const checked=e.target.checked;const updated=contactData.branches.map((b,i)=>({...b,isHead:i===idx?checked:(checked?false:b.isHead)}));setContactData({...contactData,branches:updated});}} style={{width:'16px',height:'16px',accentColor:tokens.color.gold,cursor:'pointer'}}/>
                      Mark as Head Office
                    </label>
                  </div>
                ))}
              </div>
            </section>
            <SaveButton section="contact" />
          </div>
        )}

        {/* ══ GALLERY ══ */}
        {activeTab === 'gallery' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            <section style={sectionCard}>
              <h2 style={sectionTitle}>Gallery — Hero Text</h2>
              <p style={sectionDesc}>Text shown at the top of the /gallery page banner.</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                <div><label style={fieldLabel}>Hero Eyebrow</label><input type="text" value={galleryData.hero_eyebrow} onChange={e => setGalleryData({ ...galleryData, hero_eyebrow: e.target.value })} style={inputStyle} /></div>
                <div><label style={fieldLabel}>Hero Title</label><input type="text" value={galleryData.hero_title} onChange={e => setGalleryData({ ...galleryData, hero_title: e.target.value })} style={inputStyle} /></div>
                <div><label style={fieldLabel}>Hero Subtitle</label><textarea rows={3} value={galleryData.hero_subtitle} onChange={e => setGalleryData({ ...galleryData, hero_subtitle: e.target.value })} style={{ ...inputStyle, resize: 'vertical' }} /></div>
              </div>
            </section>

            <section style={sectionCard}>
              <h2 style={sectionTitle}>Gallery — Portfolio Heading</h2>
              <p style={sectionDesc}>Heading shown above the photo grid.</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                <div><label style={fieldLabel}>Section Title</label><input type="text" value={galleryData.section_title} onChange={e => setGalleryData({ ...galleryData, section_title: e.target.value })} style={inputStyle} /></div>
                <div><label style={fieldLabel}>Section Subtitle</label><textarea rows={2} value={galleryData.section_subtitle} onChange={e => setGalleryData({ ...galleryData, section_subtitle: e.target.value })} style={{ ...inputStyle, resize: 'vertical' }} /></div>
              </div>
            </section>

            <section style={sectionCard}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem', marginBottom: '0.4rem' }}>
                <h2 style={{ ...sectionTitle, marginBottom: 0 }}>Gallery Photos</h2>
                <button onClick={addGalleryItem} style={{ background: tokens.color.gold, border: 'none', color: '#fff', padding: '0.5rem 1rem', borderRadius: '0.5rem', fontWeight: 600, fontSize: '0.8rem', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                  <IconPlus /> Add Photo
                </button>
              </div>
              <p style={sectionDesc}>
                Upload new photos (Cloudinary), or paste an image URL. Edit labels, tags &amp; order, then click <strong style={{ color: tokens.color.gold }}>Save Gallery Changes</strong>. The public gallery page updates instantly.
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {galleryData.items.map((item, idx) => {
                  const loading = galPhotoUploadLoading[idx];
                  const error   = galPhotoUploadError[idx];
                  return (
                    <div key={item.id} style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${tokens.color.whiteBorder}`, borderRadius: '1rem', padding: '1.25rem' }}>
                      {/* Card header */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                        <span style={{ color: tokens.color.gold, fontWeight: 600, fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          <IconImage /> Photo #{idx + 1}
                        </span>
                        <div style={{ display: 'flex', gap: '0.35rem' }}>
                          <button onClick={() => moveGalleryItem(idx, -1)} disabled={idx === 0} style={{ ...smallIconBtn, opacity: idx === 0 ? 0.3 : 1 }}><IconChevronUp /></button>
                          <button onClick={() => moveGalleryItem(idx, 1)} disabled={idx === galleryData.items.length - 1} style={{ ...smallIconBtn, opacity: idx === galleryData.items.length - 1 ? 0.3 : 1 }}><IconChevronDown /></button>
                          <button onClick={() => removeGalleryItem(idx)} style={{ background: 'rgba(229,62,62,0.2)', color: '#fc8181', border: '1px solid rgba(229,62,62,0.4)', borderRadius: '0.4rem', padding: '0.3rem 0.55rem', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><IconTrash /></button>
                        </div>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(150px, 220px) 1fr', gap: '1.25rem', alignItems: 'start' }}>
                        {/* Preview + upload */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                          <div style={{ width: '100%', height: '160px', borderRadius: '0.6rem', overflow: 'hidden', background: 'rgba(255,255,255,0.04)', border: `1px solid ${tokens.color.whiteBorder}`, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            {item.src ? (
                              <Image src={item.src} alt={item.alt} fill sizes="220px" style={{ objectFit: 'cover' }} unoptimized />
                            ) : (
                              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="1.5">
                                <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/>
                                <polyline points="21 15 16 10 5 21"/>
                              </svg>
                            )}
                          </div>
                          <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', background: loading ? 'rgba(184,134,11,0.3)' : 'rgba(184,134,11,0.15)', border: `1.5px solid ${tokens.color.gold}`, color: tokens.color.gold, padding: '0.45rem 1rem', borderRadius: '0.5rem', fontSize: '0.78rem', fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer', width: 'fit-content', userSelect: 'none' }}>
                            {loading ? (
                              <><span style={{ display: 'inline-block', width: '11px', height: '11px', border: '2px solid rgba(184,134,11,0.3)', borderTopColor: tokens.color.gold, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} /> Uploading…</>
                            ) : (
                              <><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>{item.src ? 'Change Image' : 'Upload Image'}</>
                            )}
                            <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" disabled={loading} style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) handleGalleryPhotoUpload(idx, f); e.target.value = ''; }} />
                          </label>
                          {error && <span style={{ fontSize: '0.7rem', color: '#fc8181', fontWeight: 500 }}>✕ {error}</span>}
                        </div>

                        {/* Fields */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.85rem' }}>
                            <div>
                              <label style={{ ...fieldLabel, fontSize: '0.72rem' }}>Label / Caption</label>
                              <input type="text" value={item.label} onChange={e => updateGalleryItem(idx, 'label', e.target.value)} style={{ ...inputStyle, padding: '0.5rem 0.75rem' }} />
                            </div>
                            <div>
                              <label style={{ ...fieldLabel, fontSize: '0.72rem' }}>Alt Text</label>
                              <input type="text" value={item.alt} onChange={e => updateGalleryItem(idx, 'alt', e.target.value)} style={{ ...inputStyle, padding: '0.5rem 0.75rem' }} />
                            </div>
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.85rem' }}>
                            <div>
                              <label style={{ ...fieldLabel, fontSize: '0.72rem' }}>Tag / Filter Category</label>
                              <input type="text" list="gallery-tag-options" value={item.tag} onChange={e => updateGalleryItem(idx, 'tag', e.target.value)} style={{ ...inputStyle, padding: '0.5rem 0.75rem' }} />
                              <datalist id="gallery-tag-options">
                                {['Bridal','Hair','Makeup','Spa','Nails','Studio','Skin','Beauty'].map(t => <option key={t} value={t} />)}
                              </datalist>
                            </div>
                            <div>
                              <label style={{ ...fieldLabel, fontSize: '0.72rem' }}>Aspect Ratio</label>
                              <select value={item.aspect} onChange={e => updateGalleryItem(idx, 'aspect', e.target.value)} style={{ ...inputStyle, padding: '0.5rem 0.75rem', appearance: 'auto' }}>
                                <option value="portrait">Portrait</option>
                                <option value="landscape">Landscape</option>
                                <option value="square">Square</option>
                              </select>
                            </div>
                          </div>
                          <div>
                            <label style={{ ...fieldLabel, fontSize: '0.72rem' }}>Image URL (Cloudinary or local path)</label>
                            <input type="text" value={item.src} onChange={e => updateGalleryItem(idx, 'src', e.target.value)} style={{ ...inputStyle, padding: '0.5rem 0.75rem', fontSize: '0.78rem', color: tokens.color.whiteDim }} />
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {galleryData.items.length === 0 && (
                  <div style={{ textAlign: 'center', padding: '2rem', color: tokens.color.whiteFaint, border: `1px dashed ${tokens.color.whiteBorder}`, borderRadius: '1rem' }}>
                    No photos yet. Click <strong style={{ color: tokens.color.gold }}>Add Photo</strong> to get started.
                  </div>
                )}
              </div>

              <p style={{ fontSize: '0.72rem', color: tokens.color.whiteFaint, marginTop: '0.75rem' }}>
                JPEG · PNG · WebP · GIF &nbsp;|&nbsp; Max 5 MB &nbsp;|&nbsp; Uploads go to Cloudinary (sayo/gallery) &nbsp;|&nbsp; The tag text becomes the filter category on the public page.
              </p>
            </section>
            <SaveButton section="gallery" />
          </div>
        )}

        {/* ══ FOOTER ══ */}
        {activeTab === 'footer' && (
          <div style={{display:'flex',flexDirection:'column',gap:'2rem'}}>
            <section style={sectionCard}>
              <h2 style={sectionTitle}>Brand &amp; Contact Info</h2>
              <p style={sectionDesc}>Appears across all page footers site-wide.</p>
              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(280px,1fr))',gap:'1.25rem'}}>
                {[{label:'Brand Name',key:'brand_name'},{label:'Brand Tagline',key:'brand_tagline'},{label:'Contact Phone',key:'contact_phone'},{label:'Contact Email',key:'contact_email'},{label:'Contact Address',key:'contact_address'},{label:'Copyright Text',key:'copyright_text'}].map(({label,key}) => (
                  <div key={key}><label style={fieldLabel}>{label}</label><input type="text" value={((footerData as unknown) as Record<string,string>)[key]??''} onChange={e=>setFooterData({...footerData,[key]:e.target.value})} style={inputStyle}/></div>
                ))}
              </div>
            </section>
            <section style={sectionCard}>
              <h2 style={sectionTitle}>Social Media Links</h2>
              <div style={{display:'flex',flexDirection:'column',gap:'1rem'}}>
                {[{label:'WhatsApp URL',key:'social_whatsapp',icon:<IconWhatsApp/>},{label:'Facebook URL',key:'social_facebook',icon:<IconFacebook/>},{label:'Instagram URL',key:'social_instagram',icon:<IconInstagram/>}].map(({label,key,icon}) => (
                  <div key={key}><label style={{...fieldLabel,display:'flex',alignItems:'center',gap:'0.4rem'}}>{icon} {label}</label><input type="text" value={((footerData as unknown) as Record<string,string>)[key]??''} onChange={e=>setFooterData({...footerData,[key]:e.target.value})} style={inputStyle} placeholder="https://..."/></div>
                ))}
              </div>
            </section>
            <section style={sectionCard}>
              <h2 style={sectionTitle}>Quick Links ({footerData.quick_links.length})</h2>
              <div style={{display:'flex',flexDirection:'column',gap:'0.6rem',marginBottom:'0.5rem'}}>
                {footerData.quick_links.map((link,idx) => (
                  <div key={idx} style={{display:'grid',gridTemplateColumns:'1fr 1fr auto',gap:'0.5rem',alignItems:'center'}}>
                    <input type="text" value={link.label} onChange={e=>updateQuickLink(idx,'label',e.target.value)} style={{...inputStyle,padding:'0.55rem 0.75rem'}}/>
                    <input type="text" value={link.href}  onChange={e=>updateQuickLink(idx,'href', e.target.value)} style={{...inputStyle,padding:'0.55rem 0.75rem'}}/>
                    <div style={{display:'flex',gap:'0.3rem'}}>
                      <button onClick={()=>moveQuickLink(idx,-1)} disabled={idx===0} style={{...smallIconBtn,opacity:idx===0?0.3:1}}><IconChevronUp /></button>
                      <button onClick={()=>moveQuickLink(idx,1)} disabled={idx===footerData.quick_links.length-1} style={{...smallIconBtn,opacity:idx===footerData.quick_links.length-1?0.3:1}}><IconChevronDown /></button>
                      <button onClick={()=>removeQuickLink(idx)} style={{background:'rgba(229,62,62,0.2)',color:'#fc8181',border:'none',padding:'0 0.6rem',borderRadius:'0.4rem',cursor:'pointer',display:'inline-flex',alignItems:'center',justifyContent:'center'}}><IconTrash /></button>
                    </div>
                  </div>
                ))}
                <button onClick={addQuickLink} style={{background:'rgba(184,134,11,0.18)',border:`1px dashed ${tokens.color.gold}`,color:tokens.color.gold,padding:'0.6rem 1rem',borderRadius:'0.5rem',fontWeight:600,fontSize:'0.82rem',cursor:'pointer',marginTop:'0.4rem',display:'inline-flex',alignItems:'center',gap:'0.4rem'}}><IconPlus /> Add Quick Link</button>
              </div>
            </section>
            <section style={sectionCard}>
              <h2 style={sectionTitle}>Locations ({footerData.locations.length})</h2>
              <div style={{display:'flex',flexDirection:'column',gap:'0.75rem'}}>
                {footerData.locations.map((loc,idx) => (
                  <div key={idx} style={{display:'flex',gap:'0.5rem'}}>
                    <input type="text" value={loc} onChange={e=>updateLocation(idx,e.target.value)} style={inputStyle}/>
                    <button onClick={()=>removeLocation(idx)} style={{background:'rgba(229,62,62,0.2)',color:'#fc8181',border:'none',padding:'0 0.8rem',borderRadius:'0.5rem',cursor:'pointer',display:'inline-flex',alignItems:'center',justifyContent:'center'}}><IconTrash /></button>
                  </div>
                ))}
                <button onClick={addLocation} style={{background:'rgba(184,134,11,0.18)',border:`1px dashed ${tokens.color.gold}`,color:tokens.color.gold,padding:'0.6rem 1rem',borderRadius:'0.5rem',fontWeight:600,fontSize:'0.82rem',cursor:'pointer',marginTop:'0.4rem',display:'inline-flex',alignItems:'center',gap:'0.4rem'}}><IconPlus /> Add Location</button>
              </div>
            </section>
            <SaveButton section="footer" />
          </div>
        )}

        {/* ══ FEEDBACK ══ */}
        {activeTab === 'feedback' && (
          <section style={sectionCard}>
            <div style={{ display:'flex', alignItems:'center', gap:'0.75rem', marginBottom:'0.4rem' }}>
              <h2 style={{ ...sectionTitle, marginBottom:0, display:'flex', alignItems:'center', gap:'0.6rem' }}>
                <IconMessageSquare /> Reviews Management
              </h2>
            </div>
            <p style={sectionDesc}>
              View all customer feedback submissions. Toggle a review&apos;s status to publish it live on the Reviews page, or hide it. Filter by location, service, rating, or status.
            </p>
            <div style={{ marginBottom:'1.5rem', padding:'0.75rem 1rem', background:'rgba(184,134,11,0.08)', border:`1px solid ${tokens.color.goldBorder}`, borderRadius:'0.75rem', fontSize:'0.8rem', color:tokens.color.whiteDim, display:'flex', alignItems:'center', gap:'0.5rem' }}>
              <IconInfo /> Publish/unpublish changes save to the database immediately — no Save button needed.
            </div>
            <FeedbackTab />
          </section>
        )}

      </main>
    </div>
  );
}