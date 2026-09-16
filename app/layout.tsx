import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ShieldCheck, Lock, FileKey, ExternalLink } from "lucide-react";
import "./globals.css";

export const metadata: Metadata = {
  title: "RiffAegis // Fortress E-Signature",
  description:
    "Zero-Knowledge, Post-Quantum Secure E-Contract System with ML-DSA-65 and Client-Side AES-GCM.",
};

function GithubIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
      />
    </svg>
  );
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body className="bg-[#F8FAFC] text-slate-800 antialiased min-h-screen flex flex-col justify-between selection:bg-[#70D6FF]/30 selection:text-slate-900">
        {/* Clean Header */}
        <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-slate-200/80 shadow-[0_1px_3px_rgba(0,0,0,0.02)]">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
            <div className="flex items-center space-x-6">
              <Link href="/" className="flex items-center group py-1">
                <Image
                  src="/riffaegis-logo.png"
                  alt="RiffAegis"
                  width={140}
                  height={40}
                  className="h-8 sm:h-9 w-auto object-contain group-hover:opacity-85 transition-opacity"
                  priority
                />
              </Link>

              <nav className="hidden md:flex items-center space-x-1 pl-4 border-l border-slate-200 text-sm font-medium text-slate-600">
                <Link href="/documents" className="px-3 py-1.5 rounded-lg hover:text-slate-900 hover:bg-slate-100/80 transition-colors">
                  契約管理
                </Link>
                <Link href="/verify" className="px-3 py-1.5 rounded-lg hover:text-slate-900 hover:bg-slate-100/80 transition-colors">
                  検証ポータル
                </Link>
                <Link href="/security" className="px-3 py-1.5 rounded-lg hover:text-slate-900 hover:bg-slate-100/80 transition-colors">
                  セキュリティ仕様
                </Link>
                <Link href="/restore" className="px-3 py-1.5 rounded-lg hover:text-slate-900 hover:bg-slate-100/80 transition-colors">
                  鍵の復元
                </Link>
              </nav>
            </div>

            {/* Action & GitHub */}
            <div className="flex items-center space-x-2 sm:space-x-3">
              <a
                href="https://github.com/RiffLink/RIFFAEGIS"
                target="_blank"
                rel="noopener noreferrer"
                title="GitHub Repository (Open Source)"
                className="p-2 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-100/80 transition-colors flex items-center justify-center"
              >
                <GithubIcon className="w-4 h-4" />
              </a>
              <Link
                href="/new"
                className="riff-btn-primary px-4 py-2 rounded-xl text-xs sm:text-sm font-bold flex items-center space-x-1.5 shadow-sm shadow-[#70D6FF]/30"
              >
                <span>契約書を作成</span>
              </Link>
            </div>
          </div>
        </header>

        {/* Main Body */}
        <main className="flex-1 w-full max-w-5xl mx-auto px-4 sm:px-6 py-10">
          {children}
        </main>

        {/* Clean Light Footer */}
        <footer className="border-t border-slate-200 bg-white py-8 text-xs text-slate-500">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-2 font-medium">
              <Image
                src="/riffaegis-logo.png"
                alt="RiffAegis"
                width={80}
                height={24}
                className="h-5 w-auto object-contain opacity-80"
              />
              <span className="font-bold text-slate-700">Standard</span>
              <span>・</span>
              <span>AES-256-GCM E2EE</span>
              <span>・</span>
              <span>NIST ML-DSA-65</span>
              <span>・</span>
              <span>WebAuthn</span>
            </div>
            <div className="flex items-center space-x-4">
              <Link href="/security" className="hover:text-slate-800 transition-colors font-semibold">
                セキュリティ仕様
              </Link>
              <Link href="/verify" className="hover:text-slate-800 transition-colors flex items-center space-x-1 font-semibold">
                <span>検証ポータル</span>
                <ExternalLink className="w-3 h-3" />
              </Link>
              <a
                href="https://github.com/RiffLink/riffaegis-anchors"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-slate-800 transition-colors flex items-center space-x-1 font-semibold text-amber-700 hover:text-amber-800"
                title="GitHub 公開マークルルート監査台帳"
              >
                <span>公開監査台帳</span>
                <ExternalLink className="w-3 h-3" />
              </a>
              <a
                href="https://github.com/RiffLink/RIFFAEGIS"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-slate-800 transition-colors flex items-center space-x-1 font-semibold"
                title="RiffAegis ソースコード (GitHub)"
              >
                <GithubIcon className="w-3.5 h-3.5" />
                <span>GitHub</span>
              </a>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
