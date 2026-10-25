import Link from 'next/link';
import type { ReactNode } from 'react';
import { Logo } from '@/components/Logo';
import { ADDRESS, GLASGOW_AREAS, PHONE_DISPLAY, PHONE_TEL, SERVICES, WHATSAPP } from '@/lib/seo-data';

function IconButton({ href, label, children }: { href: string; label: string; children: ReactNode }) {
  return (
    <a className="footer-social" href={href} aria-label={label} target={href.startsWith('http') ? '_blank' : undefined} rel="noopener noreferrer">
      {children}
    </a>
  );
}

export function Footer() {
  return (
    <footer className="footer">
      <div className="container">
        <div className="footer-grid">
          <div>
            <Logo />
            <p className="footer-copy">Glasgow mobile tyre fitting, emergency tyres and puncture repair 24/7.</p>
            <div className="footer-socials">
              <IconButton href={`tel:${PHONE_TEL}`} label="Call 247 Mo Glasgow">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M6.6 10.8c1.4 2.8 3.8 5.2 6.6 6.6l2.2-2.2c.3-.3.8-.4 1.2-.3 1 .3 2 .5 3.1.5.7 0 1.3.6 1.3 1.3v3.5c0 .7-.6 1.3-1.3 1.3C10.2 21.5 2.5 13.8 2.5 4.3 2.5 3.6 3.1 3 3.8 3h3.5c.7 0 1.3.6 1.3 1.3 0 1.1.2 2.1.5 3.1.1.4 0 .9-.3 1.2l-2.2 2.2Z" />
                </svg>
              </IconButton>
              <IconButton href={`https://wa.me/${WHATSAPP}`} label="WhatsApp 247 Mo Glasgow">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12 2.5A9.3 9.3 0 0 0 4 16.6l-1 4.9 5-1.2A9.3 9.3 0 1 0 12 2.5Zm5.4 13.2c-.2.6-1.1 1.1-1.8 1.2-.5.1-1.1.2-3.4-.8-2.9-1.2-4.8-4.2-4.9-4.4-.1-.1-1.2-1.6-1.2-3 0-1.5.8-2.2 1.1-2.5.2-.3.6-.4.9-.4h.6c.2 0 .4 0 .6.5l.8 2c.1.2.1.4 0 .6l-.4.5-.3.4c-.1.2-.2.4 0 .6.2.4.8 1.3 1.7 2.1 1.2 1 2.1 1.4 2.5 1.6.3.1.5.1.7-.1l.9-1.1c.2-.3.5-.2.8-.1l1.9.9c.3.1.5.2.6.4.1.1.1.8-.1 1.5Z" />
                </svg>
              </IconButton>
              <IconButton href="mailto:support@tyrerescue.uk" label="Email 247 Mo Glasgow">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M3 5h18v14H3V5Zm9 8.1L5.6 7H5v10h14V7h-.6L12 13.1Zm0-2.8L15.5 7h-7L12 10.3Z" />
                </svg>
              </IconButton>
            </div>
          </div>
          <div>
            <p className="footer-heading">Services</p>
            <div className="footer-links">
              {SERVICES.map((service) => (
                <Link key={service.slug} href={`/${service.slug}`}>
                  {service.name}
                </Link>
              ))}
            </div>
          </div>
          <div>
            <p className="footer-heading">Glasgow Areas</p>
            <div className="footer-links">
              {GLASGOW_AREAS.slice(0, 10).map((area) => (
                <Link key={area.slug} href={`/mobile-tyre-fitting/${area.slug}`}>
                  {area.name}
                </Link>
              ))}
            </div>
          </div>
          <div>
            <p className="footer-heading">Contact</p>
            <a className="footer-phone" href={`tel:${PHONE_TEL}`}>
              {PHONE_DISPLAY}
            </a>
            <a className="footer-whatsapp" href={`https://wa.me/${WHATSAPP}`} target="_blank" rel="noopener noreferrer">
              WhatsApp
            </a>
            <p className="footer-address">{ADDRESS}</p>
          </div>
        </div>
        <div className="footer-bottom">
          <p>© {new Date().getFullYear()} 247 Mo Glasgow. Operated by Tyre Rescue Ltd.</p>
          <div>
            <Link href="/privacy-policy">Privacy</Link>
            <Link href="/terms">Terms</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
