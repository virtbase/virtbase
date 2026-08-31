/*
 *   Copyright (c) 2026 Janic Bellmann
 *
 *   This program is free software: you can redistribute it and/or modify
 *   it under the terms of the GNU General Public License as published by
 *   the Free Software Foundation, either version 3 of the License, or
 *   (at your option) any later version.
 *
 *   This program is distributed in the hope that it will be useful,
 *   but WITHOUT ANY WARRANTY; without even the implied warranty of
 *   MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *   GNU General Public License for more details.
 *
 *   You should have received a copy of the GNU General Public License
 *   along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

"use client";

import { Card, CardContent } from "@virtbase/ui/card";
import { CancelSubscriptionSection } from "@/features/servers/components/billing/cancel-subscription-section";
import type { Subscription } from "@/features/servers/hooks/billing/use-server-subscription";

/**
 * The frame the § 312k BGB cancellation control sits in, and the whole of it.
 *
 * ## Nothing may be added between this and the button
 *
 * Split out from {@link CancellationSection} so the statutory assertions can
 * be made against the markup a customer actually gets rather than against the
 * control on its own: whether the button is behind a disclosure is a question
 * about what wraps it, and a test that only ever renders
 * `CancelSubscriptionSection` cannot answer it. Keeping it free of the query
 * client is what lets `__tests__/cancellation-placement.test.tsx` render it at
 * all.
 *
 * The surface is the quietest on the page - dashed, unfilled, unshadowed -
 * because the section is not what most customers came for. That is contrast
 * and nothing else. There is no `Collapsible`, no `Accordion`, no `<details>`,
 * no `hidden`, and adding one is the violation rather than a refactor.
 */
export function CancellationCard({
  subscription,
  onCancel,
  onResume,
  isCancelling,
  isResuming,
}: {
  subscription: Subscription;
  onCancel: () => void;
  onResume: () => void;
  isCancelling: boolean;
  isResuming: boolean;
}) {
  return (
    <Card
      className="border-dashed bg-transparent shadow-none"
      data-testid="cancellation-card"
    >
      <CardContent>
        <CancelSubscriptionSection
          subscription={subscription}
          onCancel={onCancel}
          onResume={onResume}
          isCancelling={isCancelling}
          isResuming={isResuming}
        />
      </CardContent>
    </Card>
  );
}
