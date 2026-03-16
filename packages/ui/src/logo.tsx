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

export function Logo({
  className,
  width = 1348,
  height = 875,
}: {
  className?: string;
  width?: number;
  height?: number;
}) {
  return (
    <svg
      role="presentation"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      width={width}
      height={height}
      viewBox="0 0 1348.13 874.83"
      className={cn("h-6 w-auto text-foreground", className)}
    >
      <path
        d="M918.06,345.72h116.29c45.97,0,81.11-10.63,105.23-31.37,24.28-20.88,36.5-50.86,36.5-90.09s-11.61-72.04-35.17-92.77c-23.42-20.58-59.04-30.83-106.55-30.83h-169.33l-183.7,379.14-52.15,108.41-.18-.38-139.08,287.01h-68.17L0,0h466.88l103.04,216.25-59.27,123.33-113.89-238.92h-230.06l289.12,600.52,114.17-237.12-.22-.43,59.4-123,.12.25L793.4,0h231.47c86.01,0,151.2,18.42,195.3,55.2,44.08,36.78,66.26,90.9,66.26,162.84,0,34.89-6.76,66.03-20.54,93.6-13.78,27.59-33.29,49.78-58.69,66.56,46.5,27.04,81.64,60.08,105.21,99,23.76,39.23,35.72,83.85,35.72,134.7,0,80.88-26.48,144.81-79.54,192.05-53.21,47.36-125.31,70.88-216.13,70.88h-286.7l-77.5-162.61,59.39-122.93,88.07,184.92h238.11c49.78,0,89.1-14.57,117.68-43.82,28.7-29.38,42.99-69.52,42.99-120.13s-14.32-90.06-42.99-119.55c-28.68-29.48-67.95-44.37-117.68-44.37h-155.77v-100.62Z"
        fill="currentColor"
        fillRule="evenodd"
      />
    </svg>
  );
}
