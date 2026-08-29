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

import { NotificationTargetStore, parseMasterKey } from "@virtbase/config";
import { db } from "@virtbase/db/client";

/**
 * The target store, when a bootstrap key is available.
 *
 * Null without `CONFIG_ENCRYPTION_KEY`, for the same reason the integration
 * store is: a webhook URL that cannot be decrypted cannot be used, and the
 * application still has to boot and serve. Customer notifications are
 * unaffected - they need no stored credential.
 */
export const notificationTargetStore = process.env.CONFIG_ENCRYPTION_KEY
  ? new NotificationTargetStore({
      db,
      masterKey: parseMasterKey(process.env.CONFIG_ENCRYPTION_KEY),
    })
  : null;
