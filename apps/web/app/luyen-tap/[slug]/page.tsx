import { fetchProblem, fetchProblems } from '../api';
import { Workspace } from './workspace';

export const dynamic = 'force-dynamic';

export default async function ProblemPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [problem, problems] = await Promise.all([fetchProblem(slug), fetchProblems()]);
  const position = problems.findIndex((candidate) => candidate.slug === slug);
  return (
    <Workspace
      key={problem.slug}
      problem={problem}
      nextSlug={problems[position + 1]?.slug}
      trialSignupUrl={process.env.TRIAL_SIGNUP_URL}
    />
  );
}
