/**
 * HiCloud — Landing pública (versión con arquitectura de 3 ejes).
 *
 * Compone las 10 secciones en orden valor → prueba → features → prueba → cierre.
 * Convive con la LandingPage actual sin reemplazarla: para ponerla en vivo basta
 * con que PublicHome (App.tsx) devuelva <LandingPageV2 /> en lugar de
 * <LandingPage />. Mientras tanto se revisa en /landing-v2.
 *
 * El wrapper .hcl acota TODOS los estilos de la landing: nada de lo que hay en
 * landing.css escapa a la app ni a Ant Design.
 */
import '../../styles/landing-fonts.css';
import '../../styles/landing-tokens.css';
import '../../styles/landing.css';

import Nav from '../../components/landing/Nav';
import Hero from '../../components/landing/Hero';
import SocialProof from '../../components/landing/SocialProof';
import Features from '../../components/landing/Features';
import SolutionShowcase from '../../components/landing/SolutionShowcase';
import Differentiators from '../../components/landing/Differentiators';
import Advanced from '../../components/landing/Advanced';
import Testimonials from '../../components/landing/Testimonials';
import FinalCTA from '../../components/landing/FinalCTA';
import Footer from '../../components/landing/Footer';
import { MOSTRAR } from '../../config/landing-content';

export default function LandingPageV2() {
  return (
    <div className="hcl">
      <Nav />
      <main>
        <Hero />
        {/* Prueba social y testimonios solo se muestran con datos verificados
            — ver MOSTRAR en landing-content.ts */}
        {MOSTRAR.pruebaSocial && <SocialProof />}
        <Features />
        <SolutionShowcase />
        <Differentiators />
        <Advanced />
        {MOSTRAR.testimonios && <Testimonials />}
        <FinalCTA />
      </main>
      <Footer />
    </div>
  );
}
