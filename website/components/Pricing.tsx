import { CHROME_STORE_URL, CREEM_CHECKOUT_URL, LIFETIME_PRICING, PLANS, SITE } from '@/content/site';

import Reveal from './Reveal';

import SectionHeader from './SectionHeader';

import styles from './Pricing.module.css';



function formatPrice(plan: (typeof PLANS)[number]): string {
  if ('priceLabel' in plan && plan.priceLabel) return plan.priceLabel;
  return '$0';
}



function annualSavings(plan: (typeof PLANS)[number]): string | null {

  if (!('annualCompareAt' in plan) || !('annualPrice' in plan)) return null;

  const compareAt = plan.annualCompareAt;

  const price = plan.annualPrice;

  if (typeof compareAt !== 'number' || typeof price !== 'number') return null;

  return `$${(compareAt - price).toFixed(2)}`;

}



export default function Pricing() {

  return (

    <section id="pricing" className={styles.section}>

      <div className="container">

        <Reveal>

          <SectionHeader

            label="Pricing"

            title="Simple plans, serious output"

            subtitle="Start free with monthly limits. Upgrade to Lifetime with a one-time purchase — unlimited scans, audits, and enrichment forever. Secure payments via Creem.io."

          />

        </Reveal>



        <div className={styles.grid}>

          {PLANS.map((plan, i) => {

            const savings = annualSavings(plan);

            return (

              <Reveal key={plan.id} delay={i * 100}>

                <article

                  className={`${styles.card} ${plan.highlighted ? styles.highlighted : ''} ${

                    'limitedTime' in plan && plan.limitedTime ? styles.lifetime : ''

                  }`}

                >

                  {plan.highlighted || ('limitedTime' in plan && plan.limitedTime) ? (
                    <div className={styles.badges}>
                      {plan.highlighted ? (
                        <span className={styles.popular}>Most popular</span>
                      ) : null}
                      {'limitedTime' in plan && plan.limitedTime ? (
                        <span className={styles.limited}>
                          {'launchDiscount' in plan && plan.launchDiscount
                            ? plan.launchDiscount
                            : 'Launch price'}
                        </span>
                      ) : null}
                    </div>
                  ) : null}

                  <div className={styles.head}>

                    <strong>{plan.name}</strong>

                    <div className={styles.price}>

                      {plan.price === 0 ? (

                        <span className={styles.amount}>$0</span>

                      ) : (

                        <>

                          <span className={styles.amount}>{formatPrice(plan)}</span>

                          {'compareAtPrice' in plan &&
                          typeof plan.compareAtPrice === 'number' ? (
                            <span className={styles.compareAtInline}>
                              <s>${plan.compareAtPrice}</s>
                            </span>
                          ) : null}

                          <span className={styles.period}>{plan.period}</span>

                        </>

                      )}

                    </div>

                    {'annualPrice' in plan && plan.annualPrice && typeof plan.annualPrice === 'number' ? (

                      <span className={styles.annual}>

                        {`or $${plan.annualPrice}/yr`}

                        {'annualCompareAt' in plan && plan.annualCompareAt && typeof plan.annualCompareAt === 'number' ? (

                          <>

                            {' '}

                            <span className={styles.compareAt}>

                              (<s>${plan.annualCompareAt.toFixed(2)}</s>

                              {savings ? ` · save ${savings}` : ''})

                            </span>

                          </>

                        ) : null}

                      </span>

                    ) : null}

                  </div>

                  <p className={styles.desc}>{plan.description}</p>

                  <ul className={styles.features}>

                    {plan.features.map((f) => (

                      <li key={f}>

                        <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">

                          <path

                            fillRule="evenodd"

                            d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"

                            clipRule="evenodd"

                          />

                        </svg>

                        {f}

                      </li>

                    ))}

                  </ul>

                  {plan.id === 'lifetime' ? (
                    <a
                      href={CREEM_CHECKOUT_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-primary"
                    >
                      {plan.cta} — {LIFETIME_PRICING.priceLabel}
                    </a>
                  ) : CHROME_STORE_URL ? (
                    <a
                      href={CHROME_STORE_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-secondary"
                    >
                      {plan.cta}
                    </a>
                  ) : (
                    <span className="btn btn-secondary btn-disabled" aria-disabled="true">
                      {plan.cta}
                    </span>
                  )}

                  {plan.id === 'lifetime' ? (
                    <p className={styles.cardGuarantee}>{SITE.moneyBackGuarantee}</p>
                  ) : null}

                </article>

              </Reveal>

            );

          })}

        </div>



        <Reveal delay={200}>
          <p className={styles.guarantee}>{SITE.moneyBackGuarantee}</p>
          <p className={styles.note}>
            Install free from the Chrome Web Store, or purchase Lifetime for{' '}
            {LIFETIME_PRICING.priceLabel} ({LIFETIME_PRICING.discountLabel} the regular{' '}
            {LIFETIME_PRICING.compareAtLabel}). Your license key arrives by email — activate it in
            Settings → Account. Each license can be transferred between devices.
          </p>
        </Reveal>

      </div>

    </section>

  );

}


