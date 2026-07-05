import { Link } from 'wouter';
import { ArrowLeft } from 'lucide-react';

export default function TermsOfService() {
  return (
    <div className="mx-auto max-w-3xl px-5 py-12 sm:px-6 lg:px-8">
      <Link href="/" className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline mb-8">
        <ArrowLeft className="h-4 w-4" /> Back to Home
      </Link>
      <article className="prose dark:prose-invert">
        <h1 className="text-3xl font-bold tracking-tight text-foreground mb-4">Terms of Service</h1>
        <p className="text-muted-foreground mb-6">Last updated: July 2026</p>
        
        <h2 className="text-xl font-semibold text-foreground mt-8 mb-4">1. Acceptance of Terms</h2>
        <p className="mb-4">By accessing or using our platform, you agree to be bound by these Terms of Service. If you disagree with any part of these terms, you may not access the service.</p>

        <h2 className="text-xl font-semibold text-foreground mt-8 mb-4">2. Accounts and Security</h2>
        <p className="mb-4">When you create an account, you must provide information that is accurate, complete, and current at all times. Failure to do so constitutes a breach of the Terms, which may result in immediate termination of your account.</p>

        <h2 className="text-xl font-semibold text-foreground mt-8 mb-4">3. Platform Rules</h2>
        <p className="mb-4">Workers must submit authentic and valid proof of work. Attempting to upload fake or duplicate proofs will result in reputation score penalties, wallet suspension, or permanent ban.</p>
      </article>
    </div>
  );
}
