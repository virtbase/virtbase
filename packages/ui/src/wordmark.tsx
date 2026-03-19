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

import { cn } from "@virtbase/ui";

export function Wordmark({ className }: { className?: string }) {
  return (
    <svg
      role="presentation"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      width="277"
      height="45"
      viewBox="0 0 276.89 44.82"
      className={cn("h-6 w-auto text-foreground", className)}
    >
      <path
        fill="currentColor"
        d="M20.82,44.5h-3.22L0,.69h3.55l15.69,39.24L35.04.69h3.33l-17.55,43.81Z"
      />
      <path fill="currentColor" d="M44.58,44.5V.69h3.22v43.81h-3.22Z" />
      <path
        fill="currentColor"
        d="M92.26,44.5h-3.67l-9.31-14.46c-1.13.12-2.31.25-3.61.25h-11.12v14.21h-3.22v-17.34h14.33c8.24,0,12.7-4.32,12.7-11.64s-4.46-11.64-12.7-11.64h-14.33V.69h14.33c9.93,0,15.97,5.51,15.97,14.83,0,6.95-3.39,11.77-9.2,13.71l9.82,15.27Z"
      />
      <path
        fill="currentColor"
        d="M109.02,44.5V3.88h-14.11V.69h31.49v3.19h-14.11v40.62h-3.27Z"
      />
      <path
        fill="currentColor"
        d="M133.39.69h16.59c8.58,0,13.71,4.01,13.71,11.2,0,5.13-2.6,8.51-6.43,10.01,5.42,1.19,8.52,4.95,8.52,10.95,0,7.45-4.85,11.64-14.67,11.64h-17.72v-3.07h17.72c7.39,0,11.4-2.69,11.4-8.83s-4.01-8.83-11.4-8.83h-17.72v-3h16.48c6.66,0,10.55-2.88,10.55-8.51s-3.89-8.51-10.55-8.51h-16.48V.69Z"
      />
      <path
        fill="currentColor"
        d="M172.72,44.5h-3.44L187.45.69h3.22l18.17,43.81h-3.5l-16.31-39.93-16.31,39.93Z"
      />
      <path
        fill="currentColor"
        d="M211.88,38.99l1.41-2.75c2.71,3.07,7.73,5.45,13.03,5.45,7.73,0,11.12-3.69,11.12-8.32,0-12.83-24.55-5.07-24.55-21.28,0-6.2,4.34-11.7,14.16-11.7,4.4,0,8.97,1.44,12.02,3.94l-1.19,2.88c-3.33-2.5-7.28-3.69-10.83-3.69-7.5,0-10.89,3.82-10.89,8.51,0,12.83,24.55,5.19,24.55,21.16,0,6.26-4.51,11.64-14.39,11.64-5.87,0-11.57-2.38-14.45-5.82Z"
      />
      <path
        fill="currentColor"
        d="M250.31,0h26.58v3.19h-26.58V0ZM250.31,20.66h26.58v3.19h-26.58v-3.19ZM250.31,44.5h26.58v-3.19h-26.58v3.19Z"
      />
    </svg>
  );
}
