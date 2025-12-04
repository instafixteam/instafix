// utils/emailService.js
import nodemailer from 'nodemailer';

// Create transporter (using Gmail as example)
const createTransporter = () => {
  // FIX: Use nodemailer.createTransport (not createTransporter)
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASSWORD,
    },
  });
};

export async function sendOrderConfirmationEmail(userEmail, order) {
  try {
    console.log('📧 Attempting to send email to:', userEmail);
    console.log('📧 Email config present:', {
      hasEmailUser: !!process.env.EMAIL_USER,
      hasEmailPassword: !!process.env.EMAIL_PASSWORD
    });

    // Only send if email is configured
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASSWORD) {
      console.log('❌ Email not configured - check EMAIL_USER and EMAIL_PASSWORD in .env');
      return { success: false, reason: 'email_not_configured' };
    }

    const transporter = createTransporter();

    // Verify connection first
    console.log('📧 Verifying SMTP connection...');
    await transporter.verify();
    console.log('✅ SMTP connection verified');

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: userEmail,
      subject: `Order Confirmation - #${order.id}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #4F46E5;">Thank you for your order!</h2>
          <p>Your payment has been confirmed and your order is being processed.</p>
          
          <div style="background: #f9fafb; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="color: #374151; margin-top: 0;">Order Details</h3>
            <p><strong>Order ID:</strong> #${order.id}</p>
            <p><strong>Amount:</strong> ${order.total_amount} ${order.currency.toUpperCase()}</p>
            <p><strong>Status:</strong> ${order.status}</p>
            <p><strong>Date:</strong> ${new Date(order.created_at).toLocaleDateString()}</p>
          </div>

          <div style="margin-top: 30px;">
            <p><strong>Service:</strong> ${order.title}</p>
          </div>

          <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
            <p style="color: #6b7280; font-size: 14px;">
              If you have any questions, please contact our support team.
            </p>
          </div>
        </div>
      `,
    };

    console.log('📧 Sending email...');
    const result = await transporter.sendMail(mailOptions);
    console.log('✅ Order confirmation email sent to:', userEmail);
    console.log('✅ Message ID:', result.messageId);
    
    return { success: true, messageId: result.messageId };
    
  } catch (error) {
    console.error('❌ Failed to send order confirmation email:', error);
    return { success: false, error: error.message };
  }
}