import type { Metadata } from 'next';
import { articles, CATEGORIES, getFeaturedArticles, getArticlesByCategory } from '@/lib/blog/articles';
import { JsonLd } from '@/components/seo/JsonLd';
import { getBreadcrumbSchema } from '@/lib/seo/schemas';
import { BlogIndexContent } from './BlogIndexContent';

export const metadata: Metadata = {
  title: 'Tyre Advice & City Guides | Scotland Mobile Tyre Fitting | Tyre Rescue',
  description:
    'Expert tyre guides for Scotland — emergency tips, city-by-city coverage guides for Glasgow, Edinburgh, Aberdeen, Inverness, Dundee, Ayrshire and beyond. Call 0141 266 0690.',
  alternates: { canonical: 'https://www.tyrerescue.uk/blog' },
};

export default function BlogPage() {
  return (
    <>
      <JsonLd
        data={getBreadcrumbSchema([
          { name: 'Home', path: '/' },
          { name: 'Blog', path: '/blog' },
        ])}
      />
      <BlogIndexContent
        articles={articles}
        categories={CATEGORIES}
        featuredArticles={getFeaturedArticles()}
      />
    </>
  );
}
