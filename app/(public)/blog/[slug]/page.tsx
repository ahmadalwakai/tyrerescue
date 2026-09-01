import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { articles, getArticle, getRelatedArticles } from '@/lib/blog/articles';
import { JsonLd } from '@/components/seo/JsonLd';
import { getArticleSchema, getBreadcrumbSchema, getHowToSchema } from '@/lib/seo/schemas';
import { BlogArticleContent } from './BlogArticleContent';

const HOW_TO_SCHEMAS: Record<string, Parameters<typeof getHowToSchema>[0]> = {
  'what-to-do-flat-tyre-motorway': {
    name: 'What to do if you get a flat tyre on the motorway',
    description: 'Step-by-step guide for staying safe and getting help after a motorway tyre failure in Scotland.',
    steps: [
      { name: 'Stay calm and reduce speed gradually', text: 'Do not brake sharply. Keep both hands on the wheel and steer gently. Reduce speed progressively and indicate to move left.' },
      { name: 'Move to the hard shoulder or emergency refuge', text: 'Pull as far left as possible onto the hard shoulder. If on a smart motorway, aim for an Emergency Refuge Area (ERA). Switch on hazard lights immediately.' },
      { name: 'Exit the vehicle on the left side', text: 'Always exit via the left (passenger-side) door, away from live traffic. Leave pets inside the vehicle. Take your phone with you.' },
      { name: 'Stand behind the barrier and away from the carriageway', text: 'Move well beyond the nearside barrier. Do not stand beside the vehicle facing traffic. Wait on the embankment or grass bank.' },
      { name: 'Call 0141 266 0690 for Tyre Rescue', text: 'Call 0141 266 0690 and describe your location — the motorway name, direction of travel, and the nearest junction number or blue SOS marker. We will dispatch a fitter to you.' },
      { name: 'Wait safely until help arrives', text: 'Remain behind the barrier. Keep monitoring traffic and be prepared to move further away if a vehicle approaches the hard shoulder. Do not return to your car until the fitter arrives and the area is safe.' },
    ],
  },
  'tyre-blowout-emergency-guide-scotland': {
    name: 'What to do during and after a tyre blowout in Scotland',
    description: 'Emergency guide for handling a sudden tyre blowout safely on Scottish roads.',
    steps: [
      { name: 'Hold the steering wheel firmly', text: 'A blowout causes the car to pull sharply. Grip the wheel with both hands and resist the urge to steer hard in the opposite direction. Keep the car going straight.' },
      { name: 'Do not brake suddenly', text: 'Avoid stamping on the brakes. Gentle, progressive braking only. Sudden braking with a blown tyre can cause a spin or rollover.' },
      { name: 'Allow the car to slow naturally', text: 'Keep the accelerator steady or reduce it gently. Let engine braking and air resistance slow the car gradually. Stay in your lane as long as it is safe.' },
      { name: 'Signal and pull over safely', text: 'Indicate left and steer progressively to the left. Aim for a layby, hard shoulder, or safe stopping area. Do not stop on live lanes.' },
      { name: 'Switch on hazard lights', text: 'As soon as the car is stationary and safe, switch on hazard lights and apply the handbrake. If you have a warning triangle, place it 45 metres behind the car (but not on motorways).' },
      { name: 'Call Tyre Rescue on 0141 266 0690', text: 'Call 0141 266 0690 and describe your location. We cover all of Scotland including Highland roads and the NC500. A fitter will be dispatched with your replacement tyre.' },
    ],
  },
};

// Daily ISR so admin-published edits land within 24h without redeploy.
// On-demand revalidation via /api/revalidate can be wired into publishing flow.
export const revalidate = 86400; // 24 hours
export const dynamicParams = true;

export function generateStaticParams() {
  return articles.map((a) => ({ slug: a.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const article = getArticle(slug);
  if (!article) return {};

  return {
    title: article.title,
    description: article.description,
    keywords: article.keywords,
    alternates: { canonical: `https://www.tyrerescue.uk/blog/${article.slug}` },
    openGraph: {
      title: article.title,
      description: article.description,
      url: `https://www.tyrerescue.uk/blog/${article.slug}`,
      type: 'article',
      publishedTime: article.publishDate,
      modifiedTime: article.lastModified,
      images: [{ url: 'https://www.tyrerescue.uk/images/home/slide-1.webp', width: 1200, height: 630, alt: article.title }],
    },
    twitter: {
      card: 'summary_large_image',
      title: article.title,
      description: article.description,
      images: ['https://www.tyrerescue.uk/images/home/slide-1.webp'],
    },
  };
}

export default async function BlogArticlePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const article = getArticle(slug);
  if (!article) notFound();

  const related = getRelatedArticles(article);
  const howToData = HOW_TO_SCHEMAS[article.slug];

  return (
    <>
      <JsonLd
        data={getArticleSchema({
          title: article.title,
          description: article.description,
          slug: article.slug,
          publishDate: article.publishDate,
          lastModified: article.lastModified,
          keywords: article.keywords,
        })}
      />
      <JsonLd
        data={getBreadcrumbSchema([
          { name: 'Home', path: '/' },
          { name: 'Blog', path: '/blog' },
          { name: article.title, path: `/blog/${article.slug}` },
        ])}
      />
      {howToData && <JsonLd data={getHowToSchema(howToData)} />}
      <BlogArticleContent article={article} relatedArticles={related} />
    </>
  );
}
