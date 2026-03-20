import type { Metadata } from 'next';
import { articles, CATEGORIES, getFeaturedArticles, getArticlesByCategory } from '@/lib/blog/articles';
import { JsonLd } from '@/components/seo/JsonLd';
import { getBreadcrumbSchema } from '@/lib/seo/schemas';
import { BlogIndexContent } from './BlogIndexContent';

export const metadata: Metadata = {
  title: 'Tyre Advice & Guides | Expert Tips from Glasgow Mobile Fitters',
  description:
    'Flat tyre? Call 0141 266 0690. Expert tyre guides from Glasgow\'s 24/7 mobile fitters — emergency tips, maintenance checklists, and cost breakdowns.',
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
