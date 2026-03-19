/** Slide data for the homepage hero image showcase. */

export interface HomeSlide {
  id: string;
  /** Path relative to /public */
  src: string;
  alt: string;
  /** Small label above the title */
  eyebrow: string;
  /** Bold overlay title */
  title: string;
  /** Optional secondary line */
  caption?: string;
  /** CSS object-position for the image */
  objectPosition: string;
  /** If true, Next/Image priority will be set (first slide only) */
  priority?: boolean;
}

export const homeSlides: HomeSlide[] = [
  {
    id: 'slide-1',
    src: '/images/home/slide-1.png',
    alt: 'Tyre Rescue mobile tyre fitting service — professional technician at work',
    eyebrow: 'MOBILE FITTING',
    title: 'We Come to You',
    caption: 'Glasgow & Edinburgh — 24/7',
    objectPosition: 'center center',
    priority: true,
  },
  {
    id: 'slide-2',
    src: '/images/home/slide-2.png',
    alt: 'Tyre Rescue emergency roadside tyre assistance',
    eyebrow: 'EMERGENCY CALLOUT',
    title: '45 Min Response',
    caption: 'Stranded? We\'ll be there fast.',
    objectPosition: 'center center',
  },
  {
    id: 'slide-3',
    src: '/images/home/slide-3.png',
    alt: 'Professional tyre fitting on a customer driveway',
    eyebrow: 'DRIVEWAY SERVICE',
    title: 'At Your Door',
    caption: 'Home, work, or roadside',
    objectPosition: 'center center',
  },
  {
    id: 'slide-4',
    src: '/images/home/slide-4.png',
    alt: 'Close-up of a premium tyre and alloy wheel fitted by Tyre Rescue',
    eyebrow: 'QUALITY TYRES',
    title: 'Premium Brands',
    caption: 'Budget to premium — all sizes in stock',
    objectPosition: 'center center',
  },
  {
    id: 'slide-5',
    src: '/images/home/slide-5.png',
    alt: 'Tyre Rescue branded service van ready for dispatch',
    eyebrow: 'FAST DISPATCH',
    title: 'Always Ready',
    caption: 'Fully stocked vans across Scotland',
    objectPosition: 'center center',
  },
  {
    id: 'slide-6',
    src: '/images/home/slide-6.png',
    alt: 'Technician inspecting tyre tread during a mobile fitting appointment',
    eyebrow: 'EXPERT FITTERS',
    title: 'Certified Team',
    caption: 'Fully insured & experienced',
    objectPosition: 'center center',
  },
  {
    id: 'slide-7',
    src: '/images/home/slide-7.png',
    alt: 'Customer vehicle receiving a tyre change at home in Glasgow',
    eyebrow: 'CONVENIENCE',
    title: 'No Garage Needed',
    caption: 'We bring the workshop to you',
    objectPosition: 'center center',
  },
  {
    id: 'slide-8',
    src: '/images/home/slide-8.png',
    alt: 'Tyre Rescue completing a roadside tyre rescue safely',
    eyebrow: 'ROADSIDE RESCUE',
    title: 'Safe & Professional',
    caption: '£2M public liability cover',
    objectPosition: 'center center',
  },
];
