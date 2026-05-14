import { SignupEmailMessage } from '#types/index.js';
import { sendEmail } from '#utils/send-email.js';

export const handleSignupEmail = async (message: SignupEmailMessage) => {
    // Destructuring the 6-digit code from the message object
    const { email, username, code } = message;

    const subject = `${code} is your verification code`;

    const text = `Hello ${username},\n\nWelcome to Todo App! Your verification code is: ${code}. This code will expire shortly. If you did not request this, please ignore this email.`;

    const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            .container { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 500px; margin: 0 auto; color: #333; line-height: 1.6; }
            .header { text-align: center; padding: 20px 0; border-bottom: 1px solid #eee; }
            .content { padding: 30px 20px; text-align: center; }
            .code-container { background-color: #f4f7ff; border-radius: 8px; padding: 20px; margin: 20px 0; border: 1px dashed #4A90E2; }
            .otp-code { font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #4A90E2; margin: 0; }
            .footer { font-size: 12px; color: #888; text-align: center; padding: 20px; }
            .alert { font-size: 13px; color: #666; font-style: italic; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h2 style="margin:0; color: #4A90E2;">Todo App</h2>
            </div>
            <div class="content">
              <h1 style="font-size: 20px; margin-bottom: 10px;">Verify your email</h1>
              <p>Hello <strong>${username}</strong>,</p>
              <p>Thank you for signing up! Please use the following one-time password to verify your account:</p>
              
              <div class="code-container">
                <p class="otp-code">${code}</p>
              </div>
              
              <p class="alert">This code is valid for a limited time. Please do not share this code with anyone.</p>
            </div>
            <div class="footer">
              <p>If you didn't create an account, you can safely ignore this email.</p>
              <p>&copy; 2026 Todo App. All rights reserved.</p>
            </div>
          </div>
        </body>
        </html>
    `;

    await sendEmail({
        from: process.env.EMAIL_FROM || 'noreply@todoapp.com',
        to: email,
        subject,
        text,
        html,
    });
};

export const handleSignupVerifiedEmail = async (message: any) => {
    const { email, username } = message;

    // Professional, non-alarmist subject
    const subject = `Security notice regarding your Todo App account`;

    const text = `Hello ${username},\n\nSomeone recently tried to sign up for a Todo App account using this email address. Since you already have an account, no new account was created.\n\nIf this was you, you can safely ignore this email and log in as usual. If this wasn't you, we recommend ensuring your password is secure.\n\nBest regards,\nTodo App Security Team`;

    const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            .container { font-family: 'Segoe UI', Arial, sans-serif; max-width: 500px; margin: 0 auto; color: #333; border: 1px solid #f0f0f0; border-radius: 8px; overflow: hidden; }
            .header { background-color: #f8f9fa; padding: 20px; text-align: center; border-bottom: 1px solid #eeeeee; }
            .content { padding: 30px; }
            .warning-box { background-color: #fff4e5; border-left: 4px solid #ffa117; padding: 15px; margin: 20px 0; }
            .button-container { text-align: center; margin: 30px 0; }
            .button { background-color: #4A90E2; color: white; padding: 12px 25px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block; }
            .footer { font-size: 12px; color: #999; text-align: center; padding: 20px; background-color: #f8f9fa; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
               <strong style="color: #4A90E2; font-size: 20px;">Todo App Security</strong>
            </div>
            <div class="content">
              <h2 style="font-size: 18px; color: #d9534f;">Security Notice</h2>
              <p>Hello <strong>${username}</strong>,</p>
              
              <p>We received a request to create a new Todo App account using your email address (<strong>${email}</strong>).</p>
              
              <div class="warning-box">
                <p style="margin: 0; font-size: 14px; color: #664d03;">
                  <strong>Why am I receiving this?</strong><br>
                  An account with this email already exists. To protect your privacy, we did not create a duplicate account or share any of your details with the person attempting the signup.
                </p>
              </div>

              <p><strong>If this was you:</strong> You can ignore this email and continue using your existing account.</p>
              
              <p><strong>If this wasn't you:</strong> No action is required, but it's a good time to ensure your account uses a strong, unique password.</p>

              <div class="button-container">
                <a href="${process.env.CLIENT_URL}/login" class="button">Log in to my account</a>
              </div>
            </div>
            <div class="footer">
              <p>This is an automated security notification.</p>
              <p>&copy; 2026 Todo App. All rights reserved.</p>
            </div>
          </div>
        </body>
        </html>
    `;

    await sendEmail({
        from: process.env.EMAIL_FROM || 'security@todoapp.com',
        to: email,
        subject,
        text,
        html,
    });
};
