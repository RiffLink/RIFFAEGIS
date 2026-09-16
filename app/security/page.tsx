import Link from "next/link";
import {
  ShieldCheck,
  Lock,
  Cpu,
  Fingerprint,
  FileCheck,
  Layers,
  Clock,
  Code2,
  ExternalLink,
  CheckCircle2,
  ArrowRight,
} from "lucide-react";

function GithubIcon({ className = "w-5 h-5" }: { className?: string }) {
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

export default function SecurityArchitecturePage() {
  return (
    <div className="space-y-12 py-4">
      {/* Header */}
      <section className="text-center max-w-3xl mx-auto space-y-4">
        <div className="inline-flex items-center space-x-2 px-3.5 py-1.5 rounded-full bg-white border border-slate-200/90 text-slate-700 text-xs font-semibold shadow-xs">
          <ShieldCheck className="w-4 h-4 text-[#0284c7]" />
          <span>RiffAegis セキュリティ仕様 ＆ アーキテクチャ</span>
        </div>

        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900 leading-tight">
          「運営者すら読めない」<br className="hidden sm:inline" />
          数学と暗号で保証された信頼モデル
        </h1>

        <p className="text-sm sm:text-base text-slate-600 leading-relaxed max-w-2xl mx-auto">
          従来の電子署名は「サービス提供事業者を信用する」中央集権モデルでした。
          RiffAegisは、事業者がハッキングや内部不正にあっても契約原本が決して漏洩しない
          「サーバー原本非保持・ゼロトラスト暗号アーキテクチャ」を採用しています。
        </p>

        <div className="flex items-center justify-center gap-3 pt-2">
          <a
            href="https://github.com/RiffLink/RIFFAEGIS"
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2 rounded-xl bg-slate-900 text-white font-semibold text-xs flex items-center space-x-2 hover:bg-slate-800 transition-colors shadow-xs"
          >
            <GithubIcon className="w-4 h-4" />
            <span>GitHubでソースコードを監査する</span>
            <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
          </a>
        </div>
      </section>

      {/* Comparison: Centralized vs RiffAegis */}
      <section className="bg-white border border-slate-200/80 rounded-2xl p-6 sm:p-8 shadow-xs space-y-6">
        <h2 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight">
          従来の電子署名と RiffAegis の本質的な違い
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-5 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
            <div className="flex items-center space-x-2 text-rose-600 font-bold text-sm">
              <span className="w-2 h-2 rounded-full bg-rose-500"></span>
              <span>一般的なクラウド電子署名</span>
            </div>
            <ul className="text-xs text-slate-600 space-y-2 leading-relaxed">
              <li className="flex items-start space-x-2">
                <span className="text-rose-400 font-bold">✕</span>
                <span>PDF原本の平文が事業者のサーバーにアップロード・保管される</span>
              </li>
              <li className="flex items-start space-x-2">
                <span className="text-rose-400 font-bold">✕</span>
                <span>運営会社の管理者や内部関係者が契約内容を閲覧できるリスクがある</span>
              </li>
              <li className="flex items-start space-x-2">
                <span className="text-rose-400 font-bold">✕</span>
                <span>RSA/ECDSA署名は、将来の量子コンピュータによって解読される懸念（Harvest Now, Decrypt Later）がある</span>
              </li>
              <li className="flex items-start space-x-2">
                <span className="text-rose-400 font-bold">✕</span>
                <span>原本PDFに直接署名印影が埋め込まれ、元のバイナリハッシュが改変される</span>
              </li>
            </ul>
          </div>

          <div className="p-5 rounded-xl bg-sky-50/50 border border-[#70D6FF]/40 space-y-3">
            <div className="flex items-center space-x-2 text-[#0284c7] font-bold text-sm">
              <span className="w-2 h-2 rounded-full bg-[#0284c7]"></span>
              <span>RiffAegis (原本非保持・耐量子電子署名)</span>
            </div>
            <ul className="text-xs text-slate-700 space-y-2 leading-relaxed">
              <li className="flex items-start space-x-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0 mt-0.5" />
                <span>ブラウザ内でAES-GCM-256暗号化。サーバーには暗号文のみが保存される</span>
              </li>
              <li className="flex items-start space-x-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0 mt-0.5" />
                <span>復号鍵はURLのハッシュ（#）にのみ格納。運営者もクラウド事業者も閲覧不可</span>
              </li>
              <li className="flex items-start space-x-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0 mt-0.5" />
                <span>NIST FIPS 204公式標準「ML-DSA-65」格子暗号を採用。10年〜30年後も解読不能</span>
              </li>
              <li className="flex items-start space-x-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0 mt-0.5" />
                <span>原本PDFは1バイトも改変せず、独立した監査証明書（PDF/JSON）を分離発行</span>
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/* 6 Core Security Pillars */}
      <section className="space-y-6">
        <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight text-center">
          RiffAegis を構成する6つの防御技術
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Pillar 1 */}
          <div className="riff-card p-6 rounded-2xl space-y-3">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-xl bg-[#70D6FF]/20 flex items-center justify-center text-[#0284c7]">
                <Lock className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[11px] font-bold text-[#0284c7] uppercase">Pillar 01</span>
                <h3 className="text-base font-bold text-slate-900">端末完結・完全非公開暗号化 (E2EE)</h3>
              </div>
            </div>
            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
              甲が選択したPDF原本は、ブラウザ標準のWeb Crypto APIを用いてAES-GCM-256で即時暗号化されます。
              暗号鍵（256bit）はURLのハッシュフラグメント（<code className="px-1.5 py-0.5 bg-slate-100 rounded text-slate-800 text-[11px]">#key=...</code>）にのみ書き込まれます。
              RFC 3986の仕様上、ハッシュフラグメントはブラウザからWebサーバーへのHTTPリクエストに一切送信されないため、
              サービス提供者であっても契約書の内容を復号することは物理的に不可能です。
            </p>
          </div>

          {/* Pillar 2 */}
          <div className="riff-card p-6 rounded-2xl space-y-3">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-xl bg-[#FF70A6]/15 flex items-center justify-center text-[#FF70A6]">
                <Cpu className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[11px] font-bold text-[#FF70A6] uppercase">Pillar 02</span>
                <h3 className="text-base font-bold text-slate-900">NIST ML-DSA-65 耐量子格子暗号</h3>
              </div>
            </div>
            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
              米国立標準技術研究所（NIST）が2024年8月にFIPS 204として正式制定した次世代の耐量子暗号アルゴリズム「ML-DSA-65（旧CRYSTALS-Dilithium）」を採用しています。
              数十年単位で存続する契約書に対し、将来的な量子コンピュータの実用化（ショアのアルゴリズム）による署名偽造・解読攻撃を数学的に退けます。
            </p>
          </div>

          {/* Pillar 3 */}
          <div className="riff-card p-6 rounded-2xl space-y-3">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-xl bg-[#FFD670]/30 flex items-center justify-center text-amber-600">
                <Fingerprint className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[11px] font-bold text-amber-600 uppercase">Pillar 03</span>
                <h3 className="text-base font-bold text-slate-900">WebAuthn ハードウェア生体合意</h3>
              </div>
            </div>
            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
              署名相手（乙）の本人同意には、端末内のセキュアエレメント（Apple Secure Enclave、Android Titan M、YubiKey等）と連携するWebAuthn / FIDO2技術を使用します。
              画面上のボタンクリックや手書きサイン画像ではなく、Touch ID / Face ID等で生体認証された暗号学的ハードウェア署名を発行し、法的な「本人の意思による署名」を強力に証明します。
            </p>
          </div>

          {/* Pillar 4 */}
          <div className="riff-card p-6 rounded-2xl space-y-3">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600">
                <FileCheck className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[11px] font-bold text-emerald-600 uppercase">Pillar 04</span>
                <h3 className="text-base font-bold text-slate-900">非改変・分離型 合意締結証明書</h3>
              </div>
            </div>
            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
              一般的な電子署名のように原本PDFを改ざんして印影を焼き付けるのではなく、原本PDFのSHA-256ハッシュ値を1バイトも変更せずに独立した監査証明書（Audit Certificate）を生成します。
              裁判所や税務当局への提出時にも、原本PDFのハッシュ値と証明書を突き合わせるだけで完全性を客観的に立証できます。
            </p>
          </div>

          {/* Pillar 5 */}
          <div className="riff-card p-6 rounded-2xl space-y-3">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center text-purple-600">
                <Layers className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[11px] font-bold text-purple-600 uppercase">Pillar 05</span>
                <h3 className="text-base font-bold text-slate-900">メルクルツリー暗号監査チェーン</h3>
              </div>
            </div>
            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
              文書の暗号化作成、メールワンタイムパスワード認証、原本の復号確認、生体認証署名などの全プロセスが、改ざん不能なメルクルツリーのリーフとして暗号学的に連鎖記録されます。
              途中の1件でも監査ログが削除・改ざんされた場合、最終マークルルートの計算が不一致となるため即座に検知されます。
            </p>
          </div>

          {/* Pillar 6 */}
          <div className="riff-card p-6 rounded-2xl space-y-3">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center text-amber-600">
                <Clock className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[11px] font-bold text-amber-600 uppercase">Pillar 06</span>
                <h3 className="text-base font-bold text-slate-900">多重タイムスタンプ・分散公開刻印</h3>
              </div>
            </div>
            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
              情報通信研究機構（NICT）日本標準時原子時計によるHTTP Date-Lock、Bitcoinブロックチェーンへの存在証明（OpenTimestamps）、
              およびGitHub公開リポジトリへの監査ルート刻印の多重タイムスタンプを実施。
              将来、特定のサーバーやタイムスタンプ局が停止・倒産しても、グローバルな公開台帳によって契約日時の存在が証明され続けます。
            </p>
          </div>
        </div>
      </section>

      {/* Open Source & Kerckhoffs's Principle */}
      <section className="bg-white border border-slate-200/80 rounded-2xl p-6 sm:p-8 shadow-xs space-y-5">
        <div className="flex items-start space-x-3">
          <div className="w-10 h-10 rounded-xl bg-slate-900 text-white flex items-center justify-center flex-shrink-0 mt-0.5">
            <Code2 className="w-5 h-5" />
          </div>
          <div className="space-y-1">
            <h2 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight">
              オープンソースと「ケルクホフスの原理」
            </h2>
            <p className="text-xs text-slate-500">
              なぜ暗号プラットフォームはオープンソースであるべきなのか
            </p>
          </div>
        </div>

        <div className="space-y-3 text-xs sm:text-sm text-slate-600 leading-relaxed">
          <p>
            近代暗号学の基本原則である<strong>「ケルクホフスの原理（Kerckhoffs&apos;s principle）」</strong>は、
            <em>「暗号システムの安全性は、秘密鍵以外の仕組みがすべて公知（公開）であっても保たれなければならない」</em>と定めています。
            ソースコードが非公開（ブラックボックス）な製品は、「本当にブラウザ側で暗号化されているのか」「裏で原本データがサーバーに送信されていないか」を第三者が確認できません。
          </p>
          <p>
            RiffAegisはすべての暗号化ロジック、メルクルチェーン生成、鍵管理コードをGitHub上に公開しています。
            社内のセキュリティ監査チームや弁護士、外部の暗号研究者がいつでも実装を検証し、真正性を確認できることが、セキュリティの最大の担保となっています。
          </p>
        </div>

        <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-slate-100">
          <div className="flex items-center space-x-2 text-xs text-slate-500">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>すべての暗号化はオープンソースで誰でも監査可能</span>
          </div>
          <a
            href="https://github.com/RiffLink/RIFFAEGIS"
            target="_blank"
            rel="noopener noreferrer"
            className="w-full sm:w-auto px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold text-xs flex items-center justify-center space-x-2 transition-colors"
          >
            <GithubIcon className="w-4 h-4" />
            <span>リポジトリを見る (RiffLink/RIFFAEGIS)</span>
            <ExternalLink className="w-3.5 h-3.5 text-slate-500" />
          </a>
        </div>
      </section>

      {/* CTA Footer */}
      <section className="text-center py-6 space-y-4">
        <h2 className="text-xl sm:text-2xl font-bold text-slate-900">
          原本を預けない、最高強度の電子契約を今すぐ体験
        </h2>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            href="/new"
            className="w-full sm:w-auto riff-btn-primary px-7 py-3.5 rounded-xl text-slate-950 font-bold text-sm flex items-center justify-center space-x-2 shadow-md shadow-[#70D6FF]/25"
          >
            <span>契約書を作成する</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
          <Link
            href="/verify"
            className="w-full sm:w-auto px-6 py-3.5 rounded-xl bg-white border border-slate-200 hover:border-slate-300 text-slate-700 font-semibold text-sm shadow-xs transition-all flex items-center justify-center space-x-2"
          >
            <FileCheck className="w-4 h-4 text-slate-500" />
            <span>オフライン検証ポータル</span>
          </Link>
        </div>
      </section>
    </div>
  );
}
