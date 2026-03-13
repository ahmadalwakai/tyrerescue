import { db, pricingRules, users, bankHolidays, faqs, testimonials } from './lib/db';
import { hashPassword } from './lib/auth';
import { defaultPricingRules } from './lib/pricing-engine';

async function seed() {
  console.log('Seeding database...');

  // Seed pricing rules
  console.log('Seeding pricing rules...');
  for (const rule of defaultPricingRules) {
    await db
      .insert(pricingRules)
      .values({
        key: rule.key,
        value: rule.value,
        label: rule.label,
        type: rule.type,
      })
      .onConflictDoNothing();
  }

  // Seed admin user
  console.log('Seeding admin user...');
  const adminPassword = await hashPassword('TyreRescue2024!');
  await db
    .insert(users)
    .values({
      email: 'admin@tyrerescue.uk',
      passwordHash: adminPassword,
      name: 'Admin',
      role: 'admin',
      emailVerified: true,
    })
    .onConflictDoNothing();

  // Seed Scottish bank holidays 2024-2026
  console.log('Seeding bank holidays...');
  const bankHolidayData = [
    // 2024
    { date: '2024-01-01', name: "New Year's Day" },
    { date: '2024-01-02', name: '2nd January' },
    { date: '2024-03-29', name: 'Good Friday' },
    { date: '2024-05-06', name: 'Early May Bank Holiday' },
    { date: '2024-05-27', name: 'Spring Bank Holiday' },
    { date: '2024-08-05', name: 'Summer Bank Holiday' },
    { date: '2024-11-30', name: "St Andrew's Day" },
    { date: '2024-12-25', name: 'Christmas Day' },
    { date: '2024-12-26', name: 'Boxing Day' },
    // 2025
    { date: '2025-01-01', name: "New Year's Day" },
    { date: '2025-01-02', name: '2nd January' },
    { date: '2025-04-18', name: 'Good Friday' },
    { date: '2025-05-05', name: 'Early May Bank Holiday' },
    { date: '2025-05-26', name: 'Spring Bank Holiday' },
    { date: '2025-08-04', name: 'Summer Bank Holiday' },
    { date: '2025-12-01', name: "St Andrew's Day (substitute)" },
    { date: '2025-12-25', name: 'Christmas Day' },
    { date: '2025-12-26', name: 'Boxing Day' },
    // 2026
    { date: '2026-01-01', name: "New Year's Day" },
    { date: '2026-01-02', name: '2nd January' },
    { date: '2026-04-03', name: 'Good Friday' },
    { date: '2026-05-04', name: 'Early May Bank Holiday' },
    { date: '2026-05-25', name: 'Spring Bank Holiday' },
    { date: '2026-08-03', name: 'Summer Bank Holiday' },
    { date: '2026-11-30', name: "St Andrew's Day" },
    { date: '2026-12-25', name: 'Christmas Day' },
    { date: '2026-12-28', name: 'Boxing Day (substitute)' },
  ];

  for (const holiday of bankHolidayData) {
    await db
      .insert(bankHolidays)
      .values({
        date: holiday.date,
        name: holiday.name,
        region: 'Scotland',
      })
      .onConflictDoNothing();
  }

  // Seed FAQs
  console.log('Seeding FAQs...');
  const faqData = [
    {
      question: 'How quickly can you get to me in an emergency?',
      answer:
        'For emergency callouts in Glasgow and Edinburgh city centres, we typically arrive within 45 minutes to an hour. For surrounding areas, arrival times vary based on distance but we always provide an accurate ETA when you book.',
      displayOrder: 1,
    },
    {
      question: 'What areas do you cover?',
      answer:
        'We cover Glasgow, Edinburgh, and all surrounding areas within 50 miles of our base. This includes Paisley, East Kilbride, Hamilton, Livingston, Falkirk, and more.',
      displayOrder: 2,
    },
    {
      question: 'Do you fit tyres I have already purchased?',
      answer:
        'We primarily fit tyres purchased through our service to ensure quality and warranty coverage. If you have tyres you need fitted, please call us to discuss.',
      displayOrder: 3,
    },
    {
      question: 'What payment methods do you accept?',
      answer:
        'We accept all major credit and debit cards, Apple Pay, and Google Pay through our secure online checkout. Payment is taken at the time of booking.',
      displayOrder: 4,
    },
    {
      question: 'Can you repair my puncture or do I need a new tyre?',
      answer:
        'Our fitters assess every puncture on arrival. Repairs are only possible when the damage is in the central tread area and the tyre structure is intact. Sidewall damage or multiple punctures require replacement.',
      displayOrder: 5,
    },
    {
      question: 'What happens if I need to cancel my booking?',
      answer:
        'You can cancel a scheduled booking up to 2 hours before your appointment for a full refund. Emergency callouts can be cancelled before the driver departs for a full refund. See our refund policy for full details.',
      displayOrder: 6,
    },
    {
      question: 'Do you provide a warranty on tyres?',
      answer:
        'All new tyres come with the manufacturer warranty. Our fitting work is guaranteed for 12 months. If you experience any issues related to our fitting, we will rectify it at no additional charge.',
      displayOrder: 7,
    },
    {
      question: 'How do I know what tyre size I need?',
      answer:
        'Your tyre size is printed on the sidewall of your current tyres, usually in a format like 205/55/R16. You can also find it in your vehicle handbook or on a sticker inside the driver door frame.',
      displayOrder: 8,
    },
  ];

  for (const faq of faqData) {
    await db
      .insert(faqs)
      .values({
        question: faq.question,
        answer: faq.answer,
        displayOrder: faq.displayOrder,
        active: true,
      })
      .onConflictDoNothing();
  }

  // Seed testimonials
  console.log('Seeding testimonials...');
  const testimonialData = [
    {
      authorName: 'James M.',
      rating: 5,
      content:
        'Called at 10pm with a flat on the M8. They arrived in 35 minutes and had me back on the road. Brilliant service.',
      jobType: 'Emergency Callout',
      approved: true,
      featured: true,
    },
    {
      authorName: 'Sarah K.',
      rating: 5,
      content:
        'Booked a fitting for my driveway. The fitter was professional, quick, and competitively priced. Will use again.',
      jobType: 'Scheduled Fitting',
      approved: true,
      featured: true,
    },
    {
      authorName: 'David R.',
      rating: 5,
      content:
        'Best mobile tyre service in Glasgow. Fair prices and they actually turn up when they say they will.',
      jobType: 'Tyre Replacement',
      approved: true,
      featured: true,
    },
    {
      authorName: 'Emma T.',
      rating: 5,
      content:
        'Puncture repair on my driveway before work. They were there by 7am as promised. Excellent communication throughout.',
      jobType: 'Puncture Repair',
      approved: true,
      featured: false,
    },
  ];

  for (const testimonial of testimonialData) {
    await db.insert(testimonials).values(testimonial).onConflictDoNothing();
  }

  console.log('Seeding complete!');
}

seed()
  .catch(console.error)
  .finally(() => process.exit(0));
