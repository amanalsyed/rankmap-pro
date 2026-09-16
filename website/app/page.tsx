import ContactForm from '@/components/ContactForm';
import FAQSection from '@/components/FAQ';
import Features from '@/components/Features';
import Hero from '@/components/Hero';
import HowItWorks from '@/components/HowItWorks';
import InstallCTA from '@/components/InstallCTA';
import Pricing from '@/components/Pricing';
import WhoIsItFor from '@/components/WhoIsItFor';

export default function HomePage() {
  return (
    <>
      <Hero />
      <Features />
      <HowItWorks />
      <WhoIsItFor />
      <Pricing />
      <FAQSection />
      <ContactForm />
      <InstallCTA />
    </>
  );
}
