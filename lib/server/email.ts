import { Resend } from "resend";

const resendApiKey = process.env.RESEND_API_KEY;
const emailFrom = process.env.EMAIL_FROM || "RiffAegis <security@aegis.rifflink.com>";

let resendClient: Resend | null = null;
if (resendApiKey) {
  resendClient = new Resend(resendApiKey);
}

export interface SendOtpEmailParams {
  toEmail: string;
  otpCode: string;
  expiresInMinutes?: number;
  ipAddress?: string;
}

export const emailService = {
  isMock: !resendClient,

  async sendOtpEmail({
    toEmail,
    otpCode,
    expiresInMinutes = 10,
    ipAddress = "127.0.0.1",
  }: SendOtpEmailParams): Promise<boolean> {
    if (resendClient) {
      try {
        await resendClient.emails.send({
          from: emailFrom,
          to: toEmail,
          subject: `【RiffAegis】電子署名・本人確認コード (${otpCode})`,
          text: `RiffAegis 電子署名サービスをご利用いただきありがとうございます。\n\n認証コード: ${otpCode}\n\nこのコードは ${expiresInMinutes} 分間有効です。\nリクエスト元IPアドレス: ${ipAddress}\n\n心当たりがない場合はこのメールを破棄してください。`,
        });
        return true;
      } catch (err) {
        console.error("Failed to send OTP email via Resend:", err);
        return false;
      }
    }

    // Local / Dev Mode logger
    console.log("--------------------------------------------------");
    console.log(`[DEV EMAIL] To: ${toEmail}`);
    console.log(`[DEV EMAIL] Verification OTP Code: ${otpCode} (Expires in ${expiresInMinutes}m)`);
    console.log(`[DEV EMAIL] Request IP: ${ipAddress}`);
    console.log("--------------------------------------------------");
    return true;
  },

  async sendSigningCompletedEmail(
    toEmail: string,
    documentId: string,
    certificatePdfBuffer?: Uint8Array
  ): Promise<boolean> {
    if (resendClient) {
      try {
        const attachments = certificatePdfBuffer
          ? [
              {
                filename: `Audit_Certificate_${documentId.slice(0, 8)}.pdf`,
                content: Buffer.from(certificatePdfBuffer),
              },
            ]
          : [];

        await resendClient.emails.send({
          from: emailFrom,
          to: toEmail,
          subject: "【RiffAegis】電子署名が完了しました（合意締結証明書）",
          text: `ドキュメント (ID: ${documentId}) の電子署名手続きが完了しました。\n添付の合意締結証明書をご確認ください。\n\n※原本PDFは手元の端末または署名リンクから取得してください（運営者は原本を保持しません）。`,
          attachments,
        });
        return true;
      } catch (err) {
        console.error("Failed to send completion email:", err);
        return false;
      }
    }

    console.log(`[DEV EMAIL] Signing completed notification sent to ${toEmail} for doc ${documentId}`);
    return true;
  },

  async sendSigningInvitationEmail({
    toEmail,
    creatorName,
    creatorEmail,
    signingUrl,
    documentTitle,
  }: {
    toEmail: string;
    creatorName?: string;
    creatorEmail?: string;
    signingUrl: string;
    documentTitle?: string;
  }): Promise<boolean> {
    if (resendClient) {
      try {
        const creatorDisplay = creatorName
          ? `${creatorName}${creatorEmail ? `（${creatorEmail}）` : ""}`
          : creatorEmail || "契約書作成者";

        await resendClient.emails.send({
          from: emailFrom,
          to: toEmail,
          subject: `【RiffAegis】電子署名のご依頼（${documentTitle || "電子契約書"}）`,
          text: `${creatorDisplay} 様より、契約書の電子署名（合意確認）の依頼が届いています。\n\n以下の専用URLにアクセスし、内容をご確認の上、電子署名を行ってください。\n\n▼ 署名ページURL（有効期限: 7日間）:\n${signingUrl}\n\n※リンクを開いた後、ご本人様確認用の認証コード（OTP）が本メールアドレス宛てに送信されます。\n※本契約はRiffAegisの耐量子暗号（NIST ML-DSA-65）およびFIDO2生体認証によって法的な完全性が保護されています。`,
        });
        return true;
      } catch (err) {
        console.error("Failed to send invitation email via Resend:", err);
        return false;
      }
    }

    console.log("--------------------------------------------------");
    console.log(`[DEV EMAIL] Invitation To: ${toEmail}`);
    console.log(`[DEV EMAIL] Signing URL: ${signingUrl}`);
    console.log("--------------------------------------------------");
    return true;
  },

  async sendDocumentExpiredEmail({
    toEmail,
    documentId,
    documentTitle,
  }: {
    toEmail: string;
    documentId: string;
    documentTitle?: string;
  }): Promise<boolean> {
    const title = documentTitle || "電子契約書";
    if (resendClient) {
      try {
        await resendClient.emails.send({
          from: emailFrom,
          to: toEmail,
          subject: `【RiffAegis】契約書の署名有効期限が切れました（${title}）`,
          text: `作成された契約書「${title}」（ID: ${documentId}）の有効期限が超過したため、署名依頼が自動失効しました。\n\n引き続き締結を行う場合は、お手数ですが再度新規作成を行ってください。`,
        });
        return true;
      } catch (err) {
        console.error("Failed to send expiration email:", err);
        return false;
      }
    }
    console.log(`[DEV EMAIL] Document expired notification sent to ${toEmail} for doc ${documentId}`);
    return true;
  },
};
