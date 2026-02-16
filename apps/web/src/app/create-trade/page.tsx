'use client';

export const dynamic = 'force-dynamic';

import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useAuth } from '@/hooks/use-auth';
import { CreateTradeForm } from '@/components/create-trade-form';
import { useCallback } from 'react';

export default function CreateTradePage() {
  const router = useRouter();
  const { isAuthenticated, login } = useAuth();

  const handleSuccess = useCallback(() => {
    router.push('/my-trades?tab=proposed');
  }, [router]);

  if (!isAuthenticated) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center space-y-4"
        >
          <h2 className="text-2xl font-bold">Connect to Create a Trade</h2>
          <p className="text-muted-foreground">Sign in to propose a new trade.</p>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={login}
            className="px-6 py-3 rounded-lg bg-primary text-primary-foreground font-medium"
          >
            Sign In
          </motion.button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8"
      >
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </Link>
        <h1 className="text-3xl font-bold">Create Trade</h1>
        <p className="text-muted-foreground mt-2">
          Propose a token purchase and invite funders to co-invest
        </p>
      </motion.div>

      <CreateTradeForm onSuccess={handleSuccess} />
    </div>
  );
}
