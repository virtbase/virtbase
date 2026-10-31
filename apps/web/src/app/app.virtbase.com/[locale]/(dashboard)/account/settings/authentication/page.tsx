/*
 * Copyright (C) 2026 BeastHost UG (haftungsbeschränkt)
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published
 * by the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import { Suspense } from "react";
import { DiscordBotCard } from "@/features/account/components/authentication/discord-bot-card.tsx";
import { UserPasskeysCard } from "@/features/account/components/authentication/user-passkeys-card.tsx";
import { UserProvidersCard } from "@/features/account/components/authentication/user-providers-card.tsx";
import { UserSessionsCard } from "@/features/account/components/authentication/user-sessions-card.tsx";
import { UserTfaCard } from "@/features/account/components/authentication/user-tfa-card.tsx";

export default function Page() {
  return (
    <>
      <Suspense fallback={null}>
        <DiscordBotCard />
      </Suspense>
      <UserProvidersCard />
      <UserTfaCard />
      <UserPasskeysCard />
      <UserSessionsCard />
    </>
  );
}
