import { baseEmailTemplate } from './base';

export interface JobCompleteData {
  customerName: string;
  refNumber: string;
  reviewUrl: string;
}

export function jobComplete(data: JobCompleteData): { subject: string; html: string } {
  const { customerName, refNumber, reviewUrl } = data;

  const content = `
    <h1>Job Complete</h1>
    <p>Hi ${customerName},</p>
    <p>Thank you for choosing Tyre Rescue. Your job has been completed successfully.</p>
    
    <div class="info-box">
      <div style="text-align: center;">
        <div style="font-size: 12px; color: #666666; text-transform: uppercase; letter-spacing: 1px;">Reference</div>
        <div style="font-size: 24px; font-weight: bold;">${refNumber}</div>
      </div>
    </div>

    <h2>We Value Your Feedback</h2>
    <p>Your feedback helps us improve our service and helps other customers make informed decisions. We would greatly appreciate it if you could take a moment to share your experience.</p>

    <div style="text-align: center; margin: 32px 0;">
      <a href="${reviewUrl}" class="button">Leave a Review</a>
    </div>

    <p>Thank you again for your business. We look forward to serving you in the future.</p>

    <p style="font-size: 14px; color: #666666;">If you have any questions or concerns about the service you received, please do not hesitate to contact us on 0141 266 0690.</p>
  `;

  return {
    subject: 'Job Complete - Thank You',
    html: baseEmailTemplate({
      preheader: `Your job ${refNumber} has been completed`,
      content,
    }),
  };
}
