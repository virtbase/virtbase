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

import * as Sentry from "@sentry/nextjs";

declare global {
  interface Window {
    hasLoggedCustomMessage: boolean;
  }
}

window.hasLoggedCustomMessage = false;

if (!window.hasLoggedCustomMessage) {
  console.log(
    `%c      ////\\\\\\\\                                                  
      |      |                                                  
     @  O  O  @                                                 
      |  ~   |         \\__                                      
       \\ -- /          |\\ |                                     
     ___|  |___        | \\|                                     
    /          \\      /|__|                                     
   /            \\    / /                                        
  /  /| .  . |\\  \\  / /                                         
 /  / |      | \\  \\/ /                                          
<  <  |      |  \\\\  /                                           
 \\  \\ |  .   |   \\_/                                            
  \\  \\|______|                                                  
    \\_|______|                                                  
      |      |             Please don't steal my code!          
      |  |   |                                 -J               
      |  |   |                                                  
      |__|___|                                                  
      |  |  |                                                   
      (  (  |                                                   
      |  |  |                                                   
      |  |  |                                                   
     _|  |  |                                                   
 cccC_Cccc___)                                                  

 If you would like to report a security vulnerability,
 please send an email to support@virtbase.com.`,
    "background: #000; color: #fff",
  );

  window.hasLoggedCustomMessage = true;
}

Sentry.init({
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  // Current integrations used:
  // - replayIntegration (lazy loaded via sentry-replay-integration.tsx)
  // - feedbackIntegration (lazy loaded via feedback-button.tsx)
  integrations: [],
  tracesSampleRate: 1,
  enableLogs: true,
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,
  sendDefaultPii: false,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
