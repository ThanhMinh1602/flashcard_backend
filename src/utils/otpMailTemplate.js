export function otpMailTemplate({ otp, minutes = 5 }) {
  return `
  <!DOCTYPE html>
  <html lang="vi">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Mã OTP đặt lại mật khẩu</title>
  </head>
  <body style="margin:0;padding:0;background:#f5f7fb;font-family:Arial,Helvetica,sans-serif;color:#1f2937;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f7fb;padding:32px 12px;">
      <tr>
        <td align="center">
          <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:24px;overflow:hidden;box-shadow:0 18px 45px rgba(15,23,42,0.12);">
            <tr>
              <td style="background:linear-gradient(135deg,#7c3aed,#ec4899,#f97316);padding:34px 28px;text-align:center;">
                <div style="display:inline-block;background:rgba(255,255,255,0.18);border:1px solid rgba(255,255,255,0.35);padding:10px 18px;border-radius:999px;color:#fff;font-size:14px;font-weight:700;letter-spacing:.4px;">
                  Plashcard
                </div>
                <h1 style="margin:18px 0 8px;color:#fff;font-size:28px;line-height:1.25;">
                  Khôi phục mật khẩu
                </h1>
                <p style="margin:0;color:rgba(255,255,255,0.9);font-size:15px;line-height:1.6;">
                  Dùng mã OTP bên dưới để đặt lại mật khẩu tài khoản của bạn.
                </p>
              </td>
            </tr>

            <tr>
              <td style="padding:34px 28px 12px;text-align:center;">
                <p style="margin:0 0 16px;color:#64748b;font-size:15px;line-height:1.7;">
                  Mã xác thực của bạn là:
                </p>

                <div style="display:inline-block;background:#111827;color:#fff;font-size:34px;font-weight:800;letter-spacing:10px;padding:18px 22px;border-radius:18px;box-shadow:0 10px 25px rgba(17,24,39,0.2);">
                  ${otp}
                </div>

                <p style="margin:20px 0 0;color:#475569;font-size:15px;line-height:1.7;">
                  Mã này sẽ hết hạn sau <b>${minutes} phút</b>. Không chia sẻ mã này cho bất kỳ ai.
                </p>
              </td>
            </tr>

            <tr>
              <td style="padding:20px 28px 34px;">
                <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:18px;padding:16px 18px;">
                  <p style="margin:0;color:#64748b;font-size:13px;line-height:1.6;">
                    Nếu bạn không yêu cầu đặt lại mật khẩu, hãy bỏ qua email này. Mật khẩu hiện tại của bạn vẫn được giữ nguyên.
                  </p>
                </div>
              </td>
            </tr>

            <tr>
              <td style="padding:18px 28px;background:#f8fafc;text-align:center;border-top:1px solid #e5e7eb;">
                <p style="margin:0;color:#94a3b8;font-size:12px;">
                  © ${new Date().getFullYear()} Plashcard. Sent from ${process.env.MAIL_USER || 'Plashcard Mail'}
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
  </html>
  `;
}
