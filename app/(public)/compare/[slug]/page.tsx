import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { competitors, getCompetitorBySlug } from '@/lib/data/competitors';
import { ComparisonContent } from './ComparisonContent';
import { JsonLd } from '@/components/seo/JsonLd';

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  return competitors.map((c) => ({ slug: c.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const data = getCompetitorBySlug(slug);
  if (!data) return {};

  return {
    title: data.metaTitle,
    description: data.metaDescription,
    alternates: { canonical: `https://www.tyrerescue.uk/compare/${data.slug}` },
    openGraph: {
      title: data.metaTitle,
      description: data.metaDescription,
      url: `https://www.tyrerescue.uk/compare/${data.slug}`,
      siteName: 'Tyre Rescue',
      type: 'article',
    },
    keywords: data.keywords,
  };
}

function buildComparisonJsonLd(slug: string) {
  const data = getCompetitorBySlug(slug);
  if (!data) return null;

  return [
    {
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      name: data.title,
      description: data.metaDescription,
      url: `https://www.tyrerescue.uk/compare/${data.slug}`,
      mainEntity: {
        '@type': 'Article',
        headline: data.title,
        dateModified: data.lastModified,
        author: {
          '@type': 'Organization',
          name: 'Tyre Rescue',
          url: 'https://www.tyrerescue.uk',
        },
      },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: data.faq.map((f) => ({
        '@type': 'Question',
        name: f.question,
        acceptedAnswer: { '@type': 'Answer', text: f.answer },
      })),
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://www.tyrerescue.uk' },
        { '@type': 'ListItem', position: 2, name: 'Compare', item: 'https://www.tyrerescue.uk/compare' },
        { '@type': 'ListItem', position: 3, name: `vs ${data.competitorShortName}`, item: `https://www.tyrerescue.uk/compare/${data.slug}` },
      ],
    },
  ];
}

export default async function ComparisonPage({ params }: Props) {
  const { slug } = await params;
  const data = getCompetitorBySlug(slug);
  if (!data) notFound();

  const jsonLdArray = buildComparisonJsonLd(slug);

  return (
    <>
      {jsonLdArray?.map((schema, i) => (
        <JsonLd key={i} data={schema} />
      ))}
      <ComparisonContent data={data} />
    </>
  );
}
