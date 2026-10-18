import type { Metadata } from "next";
import { ClerkThemeProvider } from "@/components/clerk-theme-provider";
import { Suspense } from "react";
import { Roboto_Condensed } from "next/font/google";
import { GlobalLoader } from "@/components/ui/global-loader";
import "./globals.css";

const robotoCondensed = Roboto_Condensed({
  subsets: ["latin"],
  variable: "--font-roboto-condensed",
  weight: ["300", "400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "RepoGraph - Visualize Your Code",
  description: "Codebase dependency graph and architectural map",
  icons: {
    icon: "/logo.svg",
    shortcut: "/logo.svg",
    apple: "/logo.svg",
  },
};

const themeInitScript = `
(function() {
  try {
    var theme = localStorage.getItem('repo-graph-theme') || 'system';
    var root = document.documentElement;
    root.setAttribute('data-theme', theme);
    if (theme === 'dark') {
      root.classList.add('dark');
      root.classList.remove('light');
    } else if (theme === 'light') {
      root.classList.add('light');
      root.classList.remove('dark');
    } else {
      root.classList.remove('light', 'dark');
      if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
        root.classList.add('dark');
      } else {
        root.classList.add('light');
      }
    }
  } catch(e) { }
})();
`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${robotoCondensed.className} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <Suspense fallback={null}>
          <GlobalLoader />
        </Suspense>
        <ClerkThemeProvider>
          {children}
        </ClerkThemeProvider>
      </body>
    </html>
  );
}