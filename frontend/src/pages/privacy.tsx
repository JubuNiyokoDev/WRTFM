import { Link } from 'wouter';
import { ArrowLeft } from 'lucide-react';

export default function PrivacyPolicy() {
  return (
    <div className="mx-auto max-w-3xl px-5 py-12 sm:px-6 lg:px-8">
      <Link href="/" className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline mb-8">
        <ArrowLeft className="h-4 w-4" /> Back to Home
      </Link>
      <article className="prose dark:prose-invert">
        <h1 className="text-3xl font-bold tracking-tight text-foreground mb-4">Privacy Policy</h1>
        <p className="text-muted-foreground mb-6">Last updated: July 2026</p>
        <p className="mb-4">This Privacy Policy describes our policies and procedures on the collection, use, and disclosure of your information when you use the Service.</p>
        
        <h2 className="text-xl font-semibold text-foreground mt-8 mb-4">1. Collecting and Using Your Personal Data</h2>
        <p className="mb-4">We collect personal information to provide and improve our service. By using the service, you agree to the collection and use of information in accordance with this policy.</p>
        
        <h3 className="text-lg font-medium text-foreground mt-6 mb-2">Types of Data Collected</h3>
        <p className="mb-4">While using our service, we may ask you to provide us with certain personally identifiable information that can be used to contact or identify you, including Email address, Name, and Wallet/Payment details.</p>

        <h2 className="text-xl font-semibold text-foreground mt-8 mb-4">2. Security of Your Personal Data</h2>
        <p className="mb-4">The security of your personal data is important to us, but remember that no method of transmission over the Internet, or method of electronic storage is 100% secure. While we strive to use commercially acceptable means to protect your personal data, we cannot guarantee its absolute security.</p>
      </article>
    </div>
  );
}
