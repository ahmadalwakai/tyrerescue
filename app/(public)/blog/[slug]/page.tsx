import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { articles, getArticle, getRelatedArticles } from '@/lib/blog/articles';
import { JsonLd } from '@/components/seo/JsonLd';
import { getArticleSchema, getBreadcrumbSchema } from '@/lib/seo/schemas';
import { BlogArticleContent } from './BlogArticleContent';

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
      <BlogArticleContent article={article} relatedArticles={related} />
    </>
  );
}
