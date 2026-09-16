import Link from "next/link";
import {
  ShieldCheck,
  Lock,
  Cpu,
  Fingerprint,
  ArrowRight,
  FileCheck,
  ExternalLink,
} from "lucide-react";

export default function HomePage() {
  return (
    <div className="space-y-16 py-6">
      {/* Hero Section */}
      <section className="text-center max-w-3xl mx-auto space-y-6">
        <div className="font-bold text-xl sm:text-2xl tracking-tight text-slate-800">
          RiffAegis
        </div>

        <div className="inline-flex items-center space-x-2 px-3.5 py-1.5 rounded-full bg-white border border-slate-200/90 text-slate-700 text-xs font-semibold shadow-xs">
          <ShieldCheck className="w-4 h-4 text-[#0284c7]" />
          <span>完全非公開暗号化 (E2EE) × 耐量子電子署名</span>
        </div>

        <h1 className="text-3xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-slate-900 leading-[1.2]">
          サーバーに原本を残さない、<br className="hidden sm:inline" />
          <span className="text-[#0284c7]">完全要塞型・電子署名</span>
        </h1>

        <p className="text-base sm:text-lg text-slate-600 max-w-2xl mx-auto leading-relaxed">
          原本PDFは端末内でAES-GCM-256暗号化され、サーバーには復号鍵も原本データも送信されません。<br className="hidden sm:inline" />
          ポスト量子暗号（ML-DSA-65）とWebAuthn生体認証で、将来にわたり改ざん不能な合意を記録します。
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
          <Link
            href="/new"
            className="w-full sm:w-auto riff-btn-primary px-7 py-3.5 rounded-xl text-slate-950 font-bold text-sm flex items-center justify-center space-x-2 shadow-md shadow-[#70D6FF]/25"
          >
            <span>契約書を作成する</span>
            <ArrowRight className="w-4 h-4" />
          </Link>

          <Link
            href="/verify"
            className="w-full sm:w-auto px-6 py-3.5 rounded-xl bg-white border border-slate-200/90 hover:border-slate-300 hover:bg-slate-50/80 text-slate-700 font-semibold text-sm shadow-xs transition-all flex items-center justify-center space-x-2"
          >
            <FileCheck className="w-4 h-4 text-slate-500" />
            <span>証明書を検証する</span>
          </Link>
        </div>

        <div className="pt-1 flex flex-wrap items-center justify-center gap-2 sm:gap-3 text-xs">
          <Link
            href="/security"
            className="inline-flex items-center space-x-1.5 text-slate-500 hover:text-slate-800 transition-colors font-medium"
          >
            <span>技術・セキュリティ仕様</span>
            <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
          </Link>
          <span className="text-slate-300 hidden sm:inline">・</span>
          <a
            href="https://github.com/RiffLink/riffaegis-anchors"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center space-x-1 text-amber-700 hover:text-amber-800 transition-colors font-medium"
          >
            <span>GitHub 公開監査台帳</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </section>

      {/* 3 Core Highlights */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className="riff-card riff-card-hover p-6 sm:p-7 space-y-3.5">
          <div className="w-11 h-11 rounded-xl bg-[#70D6FF]/20 flex items-center justify-center text-[#0284c7]">
            <Lock className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-bold text-slate-900">端末完結・完全非公開暗号化 (E2EE)</h2>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 leading-relaxed">
            原本PDFはブラウザ内で暗号化。復号鍵はURLのハッシュ（#）にのみ保持され、サービス運営者であっても内容を閲覧できません。
          </p>
        </div>

        <div className="riff-card riff-card-hover p-6 sm:p-7 space-y-3.5">
          <div className="w-11 h-11 rounded-xl bg-[#FF70A6]/15 flex items-center justify-center text-[#FF70A6]">
            <Cpu className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-bold text-slate-900">NIST ML-DSA-65 耐量子署名</h2>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 leading-relaxed">
            将来の量子コンピュータによる解読を防ぐため、FIPS 204公式標準の格子暗号アルゴリズムで作成者の真正性を恒久保護します。
          </p>
        </div>

        <div className="riff-card riff-card-hover p-6 sm:p-7 space-y-3.5">
          <div className="w-11 h-11 rounded-xl bg-[#FFD670]/30 flex items-center justify-center text-amber-600">
            <Fingerprint className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-bold text-slate-900">WebAuthn 生体認証合意</h2>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 leading-relaxed">
            相手方は端末のTouch ID / Face IDで合意署名。メルクル監査チェーンと直結し、法的証跡力を備えた改ざん不能な証跡を残します。
          </p>
        </div>
      </section>

      {/* 3 Step Workflow */}
      <section className="bg-white border border-slate-200/80 rounded-2xl p-7 sm:p-9 shadow-xs space-y-6">
        <div className="text-left sm:text-center space-y-1">
          <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
            締結までの3ステップ
          </h2>
          <p className="text-xs sm:text-sm text-slate-500">
            サーバーに原本データを預けない、安全でシンプルな電子契約フロー
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-2 border-t border-slate-100">
          <div className="space-y-2">
            <div className="flex items-center space-x-2.5">
              <span className="w-6 h-6 rounded-full bg-[#70D6FF]/30 text-[#0284c7] font-bold text-xs flex items-center justify-center">
                1
              </span>
              <h3 className="font-bold text-slate-900 text-sm">
                原本暗号化と署名URL発行
              </h3>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed pl-8.5">
              PDFを選択するとブラウザ内で即座に暗号化され、復号鍵を含む一意の署名リンクが発行されます。
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center space-x-2.5">
              <span className="w-6 h-6 rounded-full bg-[#FF70A6]/20 text-[#e11d48] font-bold text-xs flex items-center justify-center">
                2
              </span>
              <h3 className="font-bold text-slate-900 text-sm">
                本人確認と生体合意
              </h3>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed pl-8.5">
              相手方はメールOTPで本人確認後、ブラウザでPDFを復号・確認し、Touch ID / Face IDで合意します。
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center space-x-2.5">
              <span className="w-6 h-6 rounded-full bg-[#FFD670]/40 text-amber-700 font-bold text-xs flex items-center justify-center">
                3
              </span>
              <h3 className="font-bold text-slate-900 text-sm">
                独立証明書の発行・ZIP納品
              </h3>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed pl-8.5">
              原本PDFを改変せず、独立した「合意締結証明書」を発行。原本と証明書のパッケージをZIPで取得できます。
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

