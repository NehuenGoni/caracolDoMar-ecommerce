interface LogoProps {
  className?: string;
}

export function Logo({ className }: LogoProps) {
  return <img src="/logo.png" alt="Caracol do Mar" className={`brand-logo ${className ?? ""}`} />;
}
