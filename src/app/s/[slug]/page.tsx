import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getPublicStudyPackAction } from '@/app/actions/user-data';
import PublicStudyPackClient from './public-study-pack';

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> },
): Promise<Metadata> {
  const { slug } = await params;
  const pack = await getPublicStudyPackAction(slug);
  if (!pack) return { title: 'Study pack unavailable' };
  return {
    title: pack.title,
    description: `Study ${pack.title} with Scripto structured notes and interactive review cards.`,
  };
}

export default async function PublicStudyPackPage(
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const pack = await getPublicStudyPackAction(slug);
  if (!pack) notFound();
  return <PublicStudyPackClient pack={pack} />;
}
