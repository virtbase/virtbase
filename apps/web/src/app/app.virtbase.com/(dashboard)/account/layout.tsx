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

import { constructMetadata } from "@virtbase/utils";
import { AccountBreadcrumb } from "@/features/account/components/account-breadcrumb";
import { AccountNav } from "@/features/account/components/account-nav";
import DashboardLayout from "@/ui/layout/dashboard-layout";

export const metadata = constructMetadata({
  title: "Account",
});

export default function AccountLayout({
  children,
}: LayoutProps<"/app.virtbase.com/account">) {
  return (
    <DashboardLayout leftSide={<AccountBreadcrumb />}>
      <div className="space-y-4 overflow-hidden">
        <AccountNav />
        <div className="grid grid-cols-1 gap-4">{children}</div>
      </div>
    </DashboardLayout>
  );
}
