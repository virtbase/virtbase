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

import { Alert, AlertDescription, AlertTitle } from "@virtbase/ui/alert";
import { ClientOnly } from "@virtbase/ui/client-only";
import type { ReactNode } from "react";
import { useAgentStatus } from "../hooks/use-agent-status";
import { useAgentStatusMapping } from "../hooks/use-agent-status-mapping";

interface GuestAgentNoticeProps {
  serverId: string;
  /**
   * Also render the states that are working as expected.
   *
   * Off by default, because the notice sits above features that merely depend
   * on the agent - telling somebody their agent is fine, on a page about
   * something else, is noise.
   */
  showHealthy?: boolean;
  /** Rendered inside the notice, for actions such as "Check now". */
  children?: ReactNode;
  className?: string;
}

/**
 * Explains why a guest-agent-backed feature is unavailable.
 *
 * Shared rather than per-feature: storage usage, password resets, firewall
 * detection and open port detection all fail the same way for the same
 * reasons, and the customer should read the same explanation each time.
 *
 * Renders nothing while loading or on error. A page whose main content is
 * already there should not sprout a warning a second later, and a notice that
 * itself failed to load has nothing useful to say.
 */
export function GuestAgentNotice({
  serverId,
  showHealthy = false,
  children,
  className,
}: GuestAgentNoticeProps) {
  const { data, isPending, isError } = useAgentStatus({ server_id: serverId });
  const mapping = useAgentStatusMapping();

  if (isPending || isError || !data) {
    return null;
  }

  const descriptor = mapping[data.agent.status];

  if (!(descriptor.notify || showHealthy)) {
    return null;
  }

  const { icon: Icon, title, description, variant } = descriptor;

  return (
    <ClientOnly>
      <Alert variant={variant} className={className}>
        <Icon aria-hidden="true" />
        <AlertTitle>{title}</AlertTitle>
        <AlertDescription>
          <p>{description}</p>
          {children}
        </AlertDescription>
      </Alert>
    </ClientOnly>
  );
}
