import Link from 'next/link';
import type { Metadata } from 'next';
import { CheckCircle2, Clock, Phone, ShieldCheck } from 'lucide-react';
import { WhatsAppIcon } from '@/components/WhatsAppIcon';
import { siteConfig } from '@/lib/site';

export const metadata: Metadata = {
  title: 'Booking Received',
  description: 'Your Edinburgh Tyre Fitting booking has been received.',
  robots: {
    index: false,
    follow: false,
  },
};

export default async function FinalPage({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string; requestRef?: string; total?: string; payment?: string; session_id?: string }>;
}) {
  const params = await searchParams;
  const ref = params.ref || 'pending';
  const requestRef = params.requestRef || '';
  const total = params.total ? Number(params.total) : null;
  const paymentStatus = params.payment === 'success' ? 'success' : params.payment === 'cancelled' ? 'cancelled' : 'pending';
  const formattedTotal =
    total != null && Number.isFinite(total)
      ? new Intl.NumberFormat('en-GB', {
          style: 'currency',
          currency: 'GBP',
          maximumFractionDigits: 0,
        }).format(total)
      : null;

  return (
    <main className="final-wrap">
      <section className="final-card" data-payment={paymentStatus}>
        <div className="final-head">
          <div className="success-mark">
            {paymentStatus === 'cancelled' ? <Clock size={34} aria-hidden="true" /> : <CheckCircle2 size={34} aria-hidden="true" />}
          </div>
          <div>
            <span className="eyebrow">
              {paymentStatus === 'success' ? 'Payment received' : paymentStatus === 'cancelled' ? 'Payment not completed' : 'Booking received'}
            </span>
            <h1>
              {paymentStatus === 'success'
                ? 'Your tyre booking is confirmed.'
                : paymentStatus === 'cancelled'
                  ? 'Your booking is waiting for payment.'
                  : 'Your tyre booking has been received.'}
            </h1>
            <p>
              {paymentStatus === 'success'
                ? 'Your secure card payment has been completed. Keep your phone nearby while we review timing, access and any details that need attention.'
                : paymentStatus === 'cancelled'
                  ? 'The request was created, but Stripe Checkout was not completed. Please call or start a new booking if you still need the tyre visit.'
                  : 'We have received your Edinburgh Tyre Fitting request. Keep your phone nearby while we review the details, confirm timing and check anything that needs attention.'}
            </p>
          </div>
        </div>
        <dl className="ref-box" aria-label="Booking summary">
          <div className="ref-row ref-row-primary">
            <dt>Booking reference</dt>
            <dd>{ref}</dd>
          </div>
          {requestRef && (
            <div className="ref-row">
              <dt>Request reference</dt>
              <dd>{requestRef}</dd>
            </div>
          )}
          {formattedTotal && (
            <div className="ref-row ref-row-total">
              <dt>Estimate</dt>
              <dd>{formattedTotal}</dd>
            </div>
          )}
        </dl>
        <div className="final-meta-grid">
          <div>
            <Clock size={20} aria-hidden="true" />
            <strong>{paymentStatus === 'cancelled' ? 'Payment required' : 'Fast review'}</strong>
            <span>
              {paymentStatus === 'cancelled'
                ? 'A visit cannot be treated as confirmed until payment is completed or the team agrees another option.'
                : 'We check the request and contact you if timing needs confirming.'}
            </span>
          </div>
          <div>
            <ShieldCheck size={20} aria-hidden="true" />
            <strong>Clear details</strong>
            <span>Tyre size, access and payment details can be confirmed before the visit.</span>
          </div>
        </div>
        <div className="next-steps">
          <div>
            <strong>1</strong>
            <span>{paymentStatus === 'cancelled' ? 'Complete payment or contact the team.' : 'We review tyre size, access notes and urgency.'}</span>
          </div>
          <div>
            <strong>2</strong>
            <span>We check availability and confirm the visit timing.</span>
          </div>
          <div>
            <strong>3</strong>
            <span>You get a call or message if anything needs confirming.</span>
          </div>
        </div>
        <div className="button-row">
          <a className="primary-button" href={`tel:${siteConfig.phone.replace(/\s/g, '')}`}>
            <Phone size={18} aria-hidden="true" />
            Call now
          </a>
          <a className="secondary-button whatsapp-action" href={`https://wa.me/${siteConfig.whatsapp}`}>
            <WhatsAppIcon className="whatsapp-icon" size={19} />
            WhatsApp
          </a>
          <Link className="secondary-button" href="/">
            Create another booking
          </Link>
        </div>
      </section>
    </main>
  );
}
