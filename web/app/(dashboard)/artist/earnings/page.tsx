'use client'

import { useEffect } from 'react'
import { motion } from 'framer-motion'
import { Wallet } from 'lucide-react'
import { Card } from '@/components/ui'
import { capture } from '@/lib/analytics'

export default function ArtistEarningsPage() {
  // The other half of the payments dead end: an artist coming here for money.
  useEffect(() => {
    capture('dead_end_hit', { feature: 'payouts' })
  }, [])

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-foreground mb-1">Earnings</h1>
        <p className="text-foreground-muted">Payments and payouts</p>
      </div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <Card variant="elevated" className="p-8 text-center">
          <div className="w-16 h-16 rounded-full bg-surface-elevated flex items-center justify-center mx-auto mb-4">
            <Wallet className="w-8 h-8 text-foreground-muted" />
          </div>
          <h2 className="font-semibold text-foreground mb-2">Payouts are coming soon</h2>
          <p className="text-foreground-muted text-sm max-w-md mx-auto">
            ZTS Music doesn&apos;t process payments yet — you settle payment directly with the
            client for each gig. Once in-platform payouts launch, your earnings and transaction
            history will appear here.
          </p>
        </Card>
      </motion.div>
    </div>
  )
}
