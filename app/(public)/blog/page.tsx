import type { Metadata } from 'next';
import { articles, CATEGORIES, getFeaturedArticles } from '@/lib/blog/articles';
import { JsonLd } from '@/components/seo/JsonLd';
import { getBreadcrumbSchema } from '@/lib/seo/schemas';
import { BlogIndexContent } from './BlogIndexContent';

const SITE_URL = 'https://www.tyrerescue.uk';

export const metadata: Metadata = {
  title: 'Tyre Advice & City Guides | Scotland Mobile Tyre Fitting | Tyre Rescue',
  description:
    'Expert tyre guides for Scotland — emergency tips, city-by-city coverage guides for Glasgow, Edinburgh, Aberdeen, Inverness, Dundee, Ayrshire, Borders, Highlands, Islands and beyond. Call 0141 266 0690.',
  alternates: { canonical: `${SITE_URL}/blog` },
  openGraph: {
    title: 'Tyre Advice & Scotland City Guides | Tyre Rescue',
    description:
      'Mobile tyre fitting guides for every corner of Scotland — from Glasgow to Shetland. Emergency tips, local coverage info, and tyre maintenance advice.',
    url: `${SITE_URL}/blog`,
    type: 'website',
  },
};

function getArticleListSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'Tyre Advice & Scotland City Guides',
    description: 'Mobile tyre fitting guides and tyre advice for Scotland',
    url: `${SITE_URL}/blog`,
    numberOfItems: articles.length,
    itemListElement: articles.map((article, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      url: `${SITE_URL}/blog/${article.slug}`,
      name: article.title,
    })),
  };
}

export default function BlogPage() {
  return (
    <>
      <JsonLd
        data={getBreadcrumbSchema([
          { name: 'Home', path: '/' },
          { name: 'Blog', path: '/blog' },
        ])}
      />
      <JsonLd data={getArticleListSchema()} />
      <BlogIndexContent
        articles={articles}
        categories={CATEGORIES}
        featuredArticles={getFeaturedArticles()}
      />
    </>
  );
}
